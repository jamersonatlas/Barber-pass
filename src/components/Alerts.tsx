import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Bell, 
  MessageSquare, 
  Check, 
  CreditCard, 
  PhoneCall, 
  CheckSquare, 
  Clock, 
  Sparkles, 
  CalendarClock, 
  RotateCcw, 
  Sliders, 
  Share2, 
  UserX,
  UserCheck,
  Zap,
  Send,
  Settings,
  CheckCircle2,
  ShieldCheck
} from 'lucide-react';
import { Client, Cut, WhatsAppConfig } from '../types';
import { fmtDate, fmtMoney, initials, getAdjustedDueDay } from '../utils';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { sendWhatsAppApiMessage, createDispatchLog } from '../services/whatsappAutomation';

interface AlertsProps {
  clients: Client[];
  rawCutsMap?: { [clientId: string]: Cut[] };
  user: any;
  onConfirmPayment: (id: string) => void;
  triggerToast: (msg: string) => void;
  barberProfile?: any;
}

interface BookingRecord {
  id: string;
  barberId: string;
  barberName: string;
  barbeariaId: string;
  clientName: string;
  clientPhone: string;
  createdAt: string;
  date: string; // YYYY-MM-DD
  serviceId: string;
  serviceName: string;
  serviceValue: number;
  time: string; // HH:MM
}

export default function Alerts({ clients, rawCutsMap = {}, user, onConfirmPayment, triggerToast, barberProfile }: AlertsProps) {
  const [activeTab, setActiveTab] = useState<'overdue' | 'reminders' | 'winback' | 'preventive'>('reminders');
  
  const getPlanName = (pId: string) => {
    if (barberProfile?.plans?.[pId]?.name) {
      return barberProfile.plans[pId].name;
    }
    if (pId === 'Básico') return 'Plano Essencial';
    if (pId === 'Premium') return 'Plano Cavalheiro';
    if (pId === 'VIP') return 'Plano Executivo';
    return pId;
  };
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [minDays, setMinDays] = useState<number>(20);
  
  // Custom message templates
  const [reminderTemplate, setReminderTemplate] = useState<number>(0);
  const [winbackTemplate, setWinbackTemplate] = useState<number>(0);
  const [preventiveTemplate, setPreventiveTemplate] = useState<number>(0);

  // WhatsApp Config per barbershop
  const whatsappConfig: WhatsAppConfig | null = 
    barberProfile?.scheduleSettings?.whatsappConfig || 
    barberProfile?.whatsappConfig || 
    null;

  const isWhatsappApiEnabled = !!(whatsappConfig && whatsappConfig.enabled && whatsappConfig.instanceId && whatsappConfig.token);
  const [dispatchingAuto, setDispatchingAuto] = useState(false);

  // Single direct API dispatch helper for reminders
  const fireApiReminder = async (b: BookingRecord) => {
    if (!whatsappConfig || !whatsappConfig.enabled) {
      triggerToast('Atenção: A integração de WhatsApp API está desativada nas configurações da sua barbearia.');
      return;
    }
    const text = getReminderMessage(b, reminderTemplate);
    const res = await sendWhatsAppApiMessage(whatsappConfig, b.clientPhone, text);
    
    const newLog = createDispatchLog(
      'reminder',
      b.clientName,
      b.clientPhone,
      res.success ? 'success' : 'error',
      text,
      res.error
    );

    try {
      const updatedLogs = [newLog, ...(whatsappConfig.logs || [])].slice(0, 30);
      const docRef = doc(db, 'barbers', user.uid);
      await updateDoc(docRef, {
        'scheduleSettings.whatsappConfig.logs': updatedLogs
      });
    } catch (e) {
      console.error(e);
    }

    if (res.success) {
      triggerToast(`✅ Lembrete enviado via API do WhatsApp para ${b.clientName}!`);
    } else {
      triggerToast(`❌ Erro no envio via API: ${res.error}`);
    }
  };

  // Single direct API dispatch helper for overdue billing
  const fireApiOverdueBilling = async (c: Client) => {
    if (!whatsappConfig || !whatsappConfig.enabled) {
      triggerToast('Atenção: A integração de WhatsApp API está desativada nas configurações da sua barbearia.');
      return;
    }
    const firstName = c.name.trim().split(/\s+/)[0];
    const valStr = c.value.toFixed(2).replace('.', ',');
    const text = `Olá, ${firstName}! Tudo bem?\n\nPassando apenas para lembrar da mensalidade deste mês, no valor de R$ ${valStr}.\n\nEssa mensagem é somente um lembrete. Quando for possível, fique à vontade para realizar o pagamento.\n\nQualquer dúvida, estou à disposição. Obrigado! ✂️`;
    const res = await sendWhatsAppApiMessage(whatsappConfig, c.phone || '', text);

    const newLog = createDispatchLog(
      'billing',
      c.name,
      c.phone || '',
      res.success ? 'success' : 'error',
      text,
      res.error
    );

    try {
      const updatedLogs = [newLog, ...(whatsappConfig.logs || [])].slice(0, 30);
      const docRef = doc(db, 'barbers', user.uid);
      await updateDoc(docRef, {
        'scheduleSettings.whatsappConfig.logs': updatedLogs
      });
    } catch (e) {
      console.error(e);
    }

    if (res.success) {
      triggerToast(`✅ Cobrança enviada via API do WhatsApp para ${c.name}!`);
    } else {
      triggerToast(`❌ Erro no envio via API: ${res.error}`);
    }
  };

  // Batch auto-dispatch function for current active tab items
  const handleBatchAutoDispatch = async () => {
    if (!isWhatsappApiEnabled || !whatsappConfig) {
      triggerToast('Atenção: A integração de WhatsApp da sua barbearia precisa ser configurada em Configurações de Agenda.');
      return;
    }

    setDispatchingAuto(true);
    let successCount = 0;
    let failCount = 0;
    const newLogsArray = [...(whatsappConfig.logs || [])];

    if (activeTab === 'reminders') {
      if (todayBookings.length === 0) {
        triggerToast('Nenhum agendamento pendente para hoje.');
        setDispatchingAuto(false);
        return;
      }
      for (const b of todayBookings) {
        const text = getReminderMessage(b, reminderTemplate);
        const res = await sendWhatsAppApiMessage(whatsappConfig, b.clientPhone, text);
        if (res.success) successCount++;
        else failCount++;

        newLogsArray.unshift(createDispatchLog(
          'reminder',
          b.clientName,
          b.clientPhone,
          res.success ? 'success' : 'error',
          text,
          res.error
        ));
      }
    } else if (activeTab === 'overdue') {
      if (lateClients.length === 0) {
        triggerToast('Nenhum cliente inadimplente no momento.');
        setDispatchingAuto(false);
        return;
      }
      for (const c of lateClients) {
        if (!c.phone) continue;
        const firstName = c.name.trim().split(/\s+/)[0];
        const valStr = c.value.toFixed(2).replace('.', ',');
        const text = `Olá, ${firstName}! Tudo bem?\n\nPassando apenas para lembrar da mensalidade deste mês, no valor de R$ ${valStr}.\n\nEssa mensagem é somente um lembrete. Quando for possível, fique à vontade para realizar o pagamento.\n\nQualquer dúvida, estou à disposição. Obrigado! ✂️`;
        const res = await sendWhatsAppApiMessage(whatsappConfig, c.phone, text);
        if (res.success) successCount++;
        else failCount++;

        newLogsArray.unshift(createDispatchLog(
          'billing',
          c.name,
          c.phone,
          res.success ? 'success' : 'error',
          text,
          res.error
        ));
      }
    } else if (activeTab === 'preventive') {
      if (preventiveClients.length === 0) {
        triggerToast('Nenhum vencimento de plano para amanhã.');
        setDispatchingAuto(false);
        return;
      }
      for (const c of preventiveClients) {
        if (!c.phone) continue;
        const text = getPreventiveMessage(c, preventiveTemplate);
        const res = await sendWhatsAppApiMessage(whatsappConfig, c.phone, text);
        if (res.success) successCount++;
        else failCount++;

        newLogsArray.unshift(createDispatchLog(
          'billing',
          c.name,
          c.phone,
          res.success ? 'success' : 'error',
          text,
          res.error
        ));
      }
    } else if (activeTab === 'winback') {
      if (winbackClients.length === 0) {
        triggerToast('Nenhum cliente em atraso para resgate.');
        setDispatchingAuto(false);
        return;
      }
      for (const item of winbackClients) {
        if (!item.client.phone) continue;
        const text = getWinbackMessage(item.client.name, item.diffDays, winbackTemplate);
        const res = await sendWhatsAppApiMessage(whatsappConfig, item.client.phone, text);
        if (res.success) successCount++;
        else failCount++;

        newLogsArray.unshift(createDispatchLog(
          'winback',
          item.client.name,
          item.client.phone,
          res.success ? 'success' : 'error',
          text,
          res.error
        ));
      }
    }

    setDispatchingAuto(false);

    try {
      const docRef = doc(db, 'barbers', user.uid);
      await updateDoc(docRef, {
        'scheduleSettings.whatsappConfig.logs': newLogsArray.slice(0, 30)
      });
    } catch (e) {
      console.error('Error updating whatsapp log in db:', e);
    }

    triggerToast(`⚡ Automação de WhatsApp executada: ${successCount} mensagem(ns) enviadas com sucesso!${failCount > 0 ? ` (${failCount} erros)` : ''}`);
  };

  // Sync bookings for calculations
  useEffect(() => {
    const refBookings = collection(db, 'guest_bookings');
    const unsubscribe = onSnapshot(refBookings, (snap) => {
      const list: BookingRecord[] = [];
      snap.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as BookingRecord);
      });
      
      // Filter by barbeariaId or barberId
      const filtered = list.filter(b => b.barbeariaId === user.uid || b.barberId === user.uid);
      
      // Sort nearest first (date ascending, time ascending)
      filtered.sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return a.time.localeCompare(b.time);
      });
      
      setBookings(filtered);
    }, (error) => {
      console.error('Error syncing guest_bookings in Alerts component:', error);
    });

    return () => unsubscribe();
  }, [user]);

  // Date constants
  const todayStr = new Date().toISOString().split('T')[0];

  // Helper to check if a dueDay is tomorrow
  const isDueTomorrow = (dueDay: number) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    const tomorrowYear = tomorrow.getFullYear();
    const tomorrowMonth = tomorrow.getMonth();
    const tomorrowDate = tomorrow.getDate();
    
    const lastDayOfTomorrowMonth = new Date(tomorrowYear, tomorrowMonth + 1, 0).getDate();
    const adjustedDueDay = dueDay > lastDayOfTomorrowMonth ? lastDayOfTomorrowMonth : dueDay;
    
    return tomorrowDate === adjustedDueDay;
  };

  // TAB 1: Overdue active subscriptions
  const lateClients = clients.filter(c => c.status === 'atrasado');

  // TAB 4: Preventive alerts (Subscribers due tomorrow, not late)
  const preventiveClients = clients.filter(c => {
    if (!c.package) return false;
    if (c.status === 'atrasado') return false;
    return isDueTomorrow(c.due);
  });

  // TAB 2: Reminders calculation (Guests / Booking clients with slot scheduled for today)
  const todayBookings = bookings.filter(b => b.date === todayStr && b.status !== 'completed' && b.status !== 'no-show');

  const getReminderMessage = (b: BookingRecord, optionIdx: number) => {
    const cleanBarber = b.barberName || 'Barbeiro';
    const dateFormatted = b.date.split('-').reverse().join('/');
    const salonName = barberProfile?.name || 'Royal Cuts';
    const cancelUrl = `${window.location.origin}${window.location.pathname}?barbearia=${b.barbeariaId || user?.uid || ''}&consultar=true&tel=${encodeURIComponent(b.clientPhone)}`;
    
    if (optionIdx === 0) {
      return `* * * * ⏱️ *LEMBRETE* *DE* *HORÁRIO* * * * *\n\n` +
        `Olá, *${b.clientName}*! Tudo bem?\n` +
        `Passando para lembrar do seu horário agendado para *HOJE* na *${salonName}*!\n\n` +
        `=-=-=-=-=-=-=-=-=-=-=-=-=-==-=-=\n` +
        `💇🏽‍♂️ *PROFISSIONAL:* ${cleanBarber}\n` +
        `💇🏽‍♂️ *SERVIÇO:* *${b.serviceName}*\n` +
        `📆 *DATA:* *HOJE (${dateFormatted})*\n` +
        `⏰ *HORÁRIO:* *${b.time}*\n` +
        `=-=-=-=-=-=-=-=-=-=-=-=-=-==-=-=\n\n` +
        `⚠️ *LEMBRETE:*\n` +
        `• Pedimos para chegar com *5 minutos* de antecedência para evitarmos atrasos.\n` +
        `• Se houver qualquer imprevisto, clique no link abaixo para reagendar ou nos avise.\n\n` +
        `🔗 *DADOS DO AGENDAMENTO:*\n` +
        `👉 ${cancelUrl}\n\n` +
        `Estamos te esperando! 💈✂️`;
    } else {
      return `* * * * 💈 *AVISO* *DE* *AGENDAMENTO* * * * *\n\n` +
        `Fala, *${b.clientName}*! Tudo certo?\n` +
        `Passando para lembrar do seu horário agendado para *HOJE* na *${salonName}*!\n\n` +
        `=-=-=-=-=-=-=-=-=-=-=-=-=-==-=-=\n` +
        `💇🏽‍♂️ *PROFISSIONAL:* ${cleanBarber}\n` +
        `💇🏽‍♂️ *SERVIÇO:* *${b.serviceName}*\n` +
        `⏰ *HORÁRIO:* *${b.time}*\n` +
        `=-=-=-=-=-=-=-=-=-=-=-=-=-==-=-=\n\n` +
        `Se surgir qualquer contra-tempo, clique no link abaixo ou nos avise:\n` +
        `👉 ${cancelUrl}\n\n` +
        `Nos vemos em breve! Abraço! 💈🔥`;
    }
  };

  const fireReminderMessage = (b: BookingRecord) => {
    const cleanPhone = b.clientPhone.replace(/\D/g, '');
    if (!cleanPhone) {
      triggerToast('Telefone do cliente é inválido ou não informado.');
      return;
    }

    const text = getReminderMessage(b, reminderTemplate);
    const encodedText = encodeURIComponent(text);
    const hasDdi = cleanPhone.length > 11;
    const phoneWithDdi = hasDdi ? cleanPhone : `55${cleanPhone}`;
    const url = `https://api.whatsapp.com/send?phone=${phoneWithDdi}&text=${encodedText}`;
    
    window.open(url, '_blank');
  };

  const getPreventiveMessage = (client: Client, optionIdx: number) => {
    const firstName = client.name.trim().split(/\s+/)[0];
    const planName = getPlanName(client.package);
    const valueStr = client.value.toFixed(2).replace('.', ',');
    
    if (optionIdx === 0) {
      return `✂️ *Lembrete de Renovação - Clube BarberPass* ✂️\n\nOlá, ${firstName}! Tudo bem?\n\nPassando para lembrar que a mensalidade do seu plano (*${planName}*) vence amanhã, no valor de *R$ ${valueStr}*.\n\nPara garantir a continuidade dos seus benefícios e créditos no portal, você pode realizar o pagamento. Caso precise da chave PIX ou dados, nos avise por aqui!\n\nAgradecemos muito a parceria de sempre! 💈✨`;
    } else {
      return `⚠️ *Aviso de Vencimento de Plano* ⚠️\n\nEai, ${firstName}, beleza?\n\nPassando para avisar que sua assinatura (*${planName}*) renova amanhã, no valor de *R$ ${valueStr}*.\n\nSe puder nos ajudar adiantando o pagamento para mantermos seus créditos sempre liberados no portal do cliente, agradecemos muito! Qualquer dúvida é só chamar. Forte abraço! ✂️`;
    }
  };

  const firePreventiveMessage = (client: Client) => {
    if (!client.phone) {
      triggerToast('Telefone do cliente não cadastrado.');
      return;
    }

    const cleanPhone = client.phone.replace(/\D/g, '');
    if (!cleanPhone) {
      triggerToast('Telefone do cliente é inválido ou vazio.');
      return;
    }

    const text = getPreventiveMessage(client, preventiveTemplate);
    const encodedText = encodeURIComponent(text);
    const hasDdi = cleanPhone.length > 11;
    const phoneWithDdi = hasDdi ? cleanPhone : `55${cleanPhone}`;
    const url = `https://api.whatsapp.com/send?phone=${phoneWithDdi}&text=${encodedText}`;
    
    window.open(url, '_blank');
  };

  // TAB 3: Winback Calculation (Clients with last cut of >= minDays ago, with no upcoming appointment)
  const winbackClients = clients.map(client => {
    const clientCuts = rawCutsMap[client.id] || [];
    
    // Find latest cut date
    let lastCutDate = '';
    let originLabel = 'Corte';
    
    if (clientCuts.length > 0) {
      const sortedCuts = [...clientCuts].sort((a, b) => b.date.localeCompare(a.date));
      lastCutDate = sortedCuts[0].date;
    } else if (client.lastPaid) {
      lastCutDate = client.lastPaid;
      originLabel = 'Mensalidade';
    } else if (client.createdAt) {
      lastCutDate = client.createdAt.split('T')[0];
      originLabel = 'Cadastro';
    }

    if (!lastCutDate) return null;

    // Days count relative to local noon to avoid timezone shift
    const lastCutTime = new Date(lastCutDate + 'T12:00:00').getTime();
    const todayTime = new Date().getTime();
    const diffTime = todayTime - lastCutTime;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    // Exclude if they already have an upcoming booking (today or future)
    const hasUpcoming = bookings.some(b => {
      const cleanBPhone = b.clientPhone.replace(/\D/g, '');
      const cleanCPhone = client.phone ? client.phone.replace(/\D/g, '') : '';
      return cleanBPhone === cleanCPhone && b.status !== 'completed' && b.status !== 'no-show' && b.date >= todayStr;
    });

    return {
      client,
      diffDays,
      lastCutDate,
      originLabel,
      hasUpcoming
    };
  })
  .filter((item): item is NonNullable<typeof item> => {
    if (!item) return false;
    return item.diffDays >= minDays && !item.hasUpcoming;
  })
  .sort((a, b) => b.diffDays - a.diffDays);

  const getWinbackMessage = (clientName: string, diffDays: number, optionIdx: number) => {
    const clientFirstName = clientName.trim().split(/\s+/)[0];
    const userBarberParam = user.role === 'barber' ? `&barbearia=${user.uid}` : '';
    const bookingLink = `${window.location.origin}${window.location.pathname}?agendar=true${userBarberParam}`;

    if (optionIdx === 0) {
      return `✂️ *Saudades de você!*\n\nOlá, ${clientFirstName}! Tudo bem?\n\nNotamos que já se passaram *${diffDays} dias* desde o seu último atendimento conosco e seu cabelo já deve estar no ponto para aquele trato de mestre! 💈\n\nAproveite para reservar seu horário agora mesmo de forma rápida e prática no nosso link de agendamentos:\n${bookingLink}\n\nGaranta seu horário e mantenha o visual impecável! Aguardamos você.`;
    } else {
      return `🔥 *Manter o Visual no Grau!*\n\nEai, ${clientFirstName}, beleza?\n\nPassando para lembrar que já faz *${diffDays} dias* desde o seu último corte e nossa agenda está com novas vagas disponíveis para esta semana!\n\nNão deixe para a última hora, acesse e agende seu horário em 5 segundos:\n${bookingLink}\n\nAbraço e nos vemos na barbearia!`;
    }
  };

  const fireWinbackMessage = (name: string, phone: string | undefined, diffDays: number) => {
    if (!phone) {
      triggerToast('Telefone do cliente não cadastrado.');
      return;
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone) {
      triggerToast('Telefone do cliente é inválido ou vazio.');
      return;
    }

    const text = getWinbackMessage(name, diffDays, winbackTemplate);
    const encodedText = encodeURIComponent(text);
    const hasDdi = cleanPhone.length > 11;
    const phoneWithDdi = hasDdi ? cleanPhone : `55${cleanPhone}`;
    const url = `https://api.whatsapp.com/send?phone=${phoneWithDdi}&text=${encodedText}`;
    
    window.open(url, '_blank');
  };

  // Helper calculation for near appointments ("1 hour before")
  const isBookingWithinOneHour = (bTime: string): boolean => {
    try {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMin = now.getMinutes();
      const [bHour, bMin] = bTime.split(':').map(Number);
      
      const diffMinutes = (bHour * 60 + bMin) - (currentHour * 60 + currentMin);
      // Scheduled within the next 60 minutes
      return diffMinutes > 0 && diffMinutes <= 60;
    } catch {
      return false;
    }
  };

  // Helper calculation for soon appointments ("within 2 hours")
  const isBookingInSoonRange = (bTime: string): boolean => {
    try {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMin = now.getMinutes();
      const [bHour, bMin] = bTime.split(':').map(Number);
      
      const diffMinutes = (bHour * 60 + bMin) - (currentHour * 60 + currentMin);
      return diffMinutes > 0 && diffMinutes <= 120;
    } catch {
      return false;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none animate-fade-in font-sans bg-bg-dark-900">
      
      {/* Top Banner Branding / Header */}
      <div className="px-6 py-5 border-b border-border-dark bg-bg-dark-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 shadow">
        <div>
          <h1 className="text-lg md:text-xl font-display font-medium text-text-primary flex items-center gap-2.5 font-sans">
            <Sparkles className="w-5 h-5 text-brand-amber animate-pulse" />
            <span>Central de Mensagens e Alertas</span>
          </h1>
          <p className="text-text-muted text-[11px] uppercase tracking-wider font-semibold mt-1 font-sans">
            Geração inteligente de avisos e resgate de clientes via WhatsApp
          </p>
        </div>

        {/* WhatsApp Integration Status & Batch Auto Dispatch Button */}
        <div className="flex flex-wrap items-center gap-3">
          {isWhatsappApiEnabled ? (
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>API WhatsApp Conectada</span>
              </span>
              <button
                type="button"
                onClick={handleBatchAutoDispatch}
                disabled={dispatchingAuto}
                className="btn bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-[#002211] font-extrabold text-xs py-2 px-4 rounded-xl flex items-center gap-2 cursor-pointer shadow-lg transition-all active:scale-95"
              >
                {dispatchingAuto ? (
                  <div className="w-4 h-4 border-2 border-[#002211] border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                <span>{dispatchingAuto ? 'Disparando Lotes...' : 'Disparar Lote Automático'}</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded-lg text-xs font-medium">
                WhatsApp Manual (Web)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs list switch board */}
      <div className="bg-bg-dark-850 border-b border-border-dark p-2 flex flex-wrap gap-1.5 shrink-0 select-none">
        <button
          onClick={() => setActiveTab('reminders')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
            activeTab === 'reminders'
              ? 'bg-[#c5a880] text-black shadow font-extrabold'
              : 'text-text-secondary hover:bg-bg-dark-700 hover:text-white'
          }`}
        >
          <CalendarClock className="w-4 h-4" />
          <span>Lembrete 1 Hora Antes ({todayBookings.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('preventive')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
            activeTab === 'preventive'
              ? 'bg-[#c5a880] text-black shadow font-extrabold'
              : 'text-text-secondary hover:bg-bg-dark-700 hover:text-white'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>Avisos Preventivos ({preventiveClients.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('winback')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
            activeTab === 'winback'
              ? 'bg-[#c5a880] text-black shadow font-extrabold'
              : 'text-text-secondary hover:bg-bg-dark-700 hover:text-white'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          <span>Resgate / Lembrar Retorno ({winbackClients.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('overdue')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
            activeTab === 'overdue'
              ? 'bg-[#c5a880] text-black shadow font-extrabold'
              : 'text-text-secondary hover:bg-bg-dark-700 hover:text-white'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Cobrança de Assinaturas ({lateClients.length})</span>
        </button>
      </div>

      {/* Render selected board */}
      <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6">

        {/* --- TAB 2: REMINDERS (1 HOUR BEFORE / TODAY APPOINTMENTS) --- */}
        {activeTab === 'reminders' && (
          <div className="space-y-4">
            
            {/* Template configuration panel header */}
            <div className="bg-bg-dark-800 border border-border-dark p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">Selecione o Modelo de Mensagem</span>
                <span className="text-xs text-text-secondary">Escolha qual cordialidade enviar ao cliente para confirmar o horário agendado</span>
              </div>
              
              <div className="flex gap-2 w-full md:w-auto">
                <button
                  onClick={() => setReminderTemplate(0)}
                  className={`flex-1 md:flex-none btn text-xs py-1.5 px-3 rounded-lg border font-semibold cursor-pointer transition-all ${
                    reminderTemplate === 0
                      ? 'bg-amber-950/45 border-brand-amber text-brand-amber'
                      : 'border-border-dark text-text-secondary hover:bg-bg-dark-700'
                  }`}
                >
                  ⏱️ Modelo Padrão (Lembrete)
                </button>
                <button
                  onClick={() => setReminderTemplate(1)}
                  className={`flex-1 md:flex-none btn text-xs py-1.5 px-3 rounded-lg border font-semibold cursor-pointer transition-all ${
                    reminderTemplate === 1
                      ? 'bg-amber-950/45 border-brand-amber text-brand-amber'
                      : 'border-border-dark text-text-secondary hover:bg-bg-dark-700'
                  }`}
                >
                  ⚡ Modelo Rápido (Confirmação)
                </button>
              </div>
            </div>

            {/* List entries */}
            {todayBookings.length === 0 ? (
              <div className="bg-bg-dark-800 border border-border-dark rounded-xl p-12 text-center max-w-md mx-auto">
                <Clock className="w-12 h-12 text-text-muted mx-auto mb-3.5 stroke-[1.2]" />
                <h3 className="font-bold text-white text-sm">Nenhum atendimento para hoje</h3>
                <p className="text-xs text-text-muted mt-1">
                  Não existem reservas agendadas na sua lista de agendamentos avulsos para o dia de hoje.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                
                {/* Header status advice banner */}
                <div className="rounded-xl p-4 bg-amber-950/20 border border-amber-900/40 text-brand-amber text-xs flex items-center gap-3">
                  <Bell className="w-4.5 h-4.5 shrink-0 animate-bounce" />
                  <span>
                    Mostrando todos os <span className="font-bold">{todayBookings.length}</span> atendimentos agendados para hoje. Fique atento aos indicadores de proximidade de 1 hora!
                  </span>
                </div>

                {todayBookings.map(b => {
                  const within1H = isBookingWithinOneHour(b.time);
                  const within2H = isBookingInSoonRange(b.time);
                  
                  return (
                    <div
                      key={b.id}
                      className={`bg-bg-dark-800 border rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${
                        within1H 
                          ? 'border-amber-500/50 bg-amber-500/[0.03]' 
                          : 'border-border-dark hover:border-border-dark-light'
                      }`}
                    >
                      <div className="flex items-center gap-4.5">
                        
                        {/* Status Hour graphic */}
                        <div className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center font-mono select-none font-bold text-xs shrink-0 ${
                          within1H
                            ? 'bg-brand-amber text-black'
                            : 'bg-bg-dark-900 border border-border-dark text-text-primary'
                        }`}>
                          <Clock className={`w-3.5 h-3.5 ${within1H ? 'text-black' : 'text-text-muted'} mb-0.5`} />
                          <span>{b.time}</span>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm">{b.clientName}</span>
                            
                            {within1H && (
                              <span className="text-[8px] tracking-wider font-extrabold uppercase px-1.5 py-0.5 rounded bg-brand-danger text-white border border-brand-danger-border animate-pulse">
                                ⏱️ Menos de 1 Hora
                              </span>
                            )}
                            {!within1H && within2H && (
                              <span className="text-[8px] tracking-wider font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-600/30 text-brand-amber border border-amber-600/40">
                                ⏳ Em Breve (Próximo)
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-text-secondary leading-relaxed">
                            Serviço: <span className="font-semibold text-text-primary">{b.serviceName}</span> (R$ {b.serviceValue.toFixed(2).replace('.', ',')}) · Barbeiro: <span className="font-semibold text-text-primary">{b.barbarName || b.barberName}</span>
                          </div>

                          <div className="text-[10px] text-text-muted flex items-center gap-1">
                            <span>📞 {b.clientPhone}</span>
                          </div>
                        </div>
                      </div>

                      {/* Fire button */}
                      <div className="flex items-center shrink-0 border-t border-border-dark/40 pt-3 md:pt-0 md:border-none">
                        <button
                          onClick={() => fireReminderMessage(b)}
                          className="w-full md:w-auto btn bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-black font-extrabold text-xs py-2 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow transition-all"
                        >
                          <MessageSquare className="w-4.5 h-4.5 stroke-[2.2]" />
                          <span>Enviar Lembrete WhatsApp</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* --- TAB 3: WINBACK (CUSTOM DAYS INACTIVE RESCUE) --- */}
        {activeTab === 'winback' && (
          <div className="space-y-4">
            
            {/* Slider Config Parameter Selector */}
            <div className="bg-bg-dark-800 border border-border-dark p-5 rounded-xl space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-brand-amber" />
                    <span>Configuração de Intervalo de Ausência</span>
                  </h3>
                  <p className="text-xs text-text-muted">
                    Defina quantos dias após o último atendimento o cliente é considerado em atraso para novo corte
                  </p>
                </div>
                
                {/* Visual day display pill */}
                <div className="bg-bg-dark-900 border border-border-dark py-1.5 px-3 rounded-lg text-center shrink-0">
                  <span className="text-[9px] uppercase font-bold text-text-muted block">Filtrar sem cortar há</span>
                  <span className="text-sm font-extrabold text-brand-amber">{minDays} dias ou mais</span>
                </div>
              </div>

              {/* Slider Controller */}
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-bold text-text-muted">10 dias</span>
                <input
                  type="range"
                  min="10"
                  max="60"
                  step="5"
                  value={minDays}
                  onChange={(e) => setMinDays(Number(e.target.value))}
                  className="flex-1 accent-[#c5a880] h-1.5 bg-bg-dark-900 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-[10px] font-bold text-text-muted">60 dias</span>
              </div>
            </div>

            {/* Winback model templates choose */}
            <div className="bg-bg-dark-800 border border-border-dark p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">Modelo de Resgate de Cliente</span>
                <span className="text-xs text-text-secondary">Escolha o estilo de texto para conscientizar e incentivar o retorno</span>
              </div>
              
              <div className="flex gap-2 w-full md:w-auto">
                <button
                  onClick={() => setWinbackTemplate(0)}
                  className={`flex-1 md:flex-none btn text-xs py-1.5 px-3 rounded-lg border font-semibold cursor-pointer transition-all ${
                    winbackTemplate === 0
                      ? 'bg-amber-950/45 border-brand-amber text-brand-amber'
                      : 'border-border-dark text-text-secondary hover:bg-bg-dark-700'
                  }`}
                >
                  ✂️ Sentimento de Saudades
                </button>
                <button
                  onClick={() => setWinbackTemplate(1)}
                  className={`flex-1 md:flex-none btn text-xs py-1.5 px-3 rounded-lg border font-semibold cursor-pointer transition-all ${
                    winbackTemplate === 1
                      ? 'bg-amber-950/45 border-brand-amber text-brand-amber'
                      : 'border-border-dark text-text-secondary hover:bg-bg-dark-700'
                  }`}
                >
                  🔥 Chamar pro Grau (Semana)
                </button>
              </div>
            </div>

            {/* List entries */}
            {winbackClients.length === 0 ? (
              <div className="bg-bg-dark-800 border border-border-dark rounded-xl p-12 text-center max-w-md mx-auto">
                <UserCheck className="w-12 h-12 text-brand-success-text mx-auto mb-3.5" />
                <h3 className="font-bold text-white text-sm animate-pulse">Todos os clientes em dia!</h3>
                <p className="text-xs text-text-muted mt-1">
                  Nenhum cliente está sem cortar pelos dias especificados ou todos que estão sem cortar já agendaram um horário futuro!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl p-4 bg-bg-dark-800 border border-border-dark text-xs flex items-center gap-3">
                  <UserX className="w-4.5 h-4.5 text-text-muted shrink-0" />
                  <span>
                    Existem <span className="font-bold text-brand-amber">{winbackClients.length}</span> clientes nesta lista que não cortam em pelo menos {minDays} dias e <span className="underline font-semibold text-white">ainda não agendaram nenhum horário futuro</span>.
                  </span>
                </div>

                {winbackClients.map(({ client, diffDays, lastCutDate, originLabel }) => {
                  return (
                    <div
                      key={client.id}
                      className="bg-bg-dark-800 border border-border-dark rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-border-dark-light hover:bg-bg-dark-700/35"
                    >
                      <div className="flex items-center gap-4.5">
                        
                        {/* Initials circular indicator */}
                        <div className="w-11 h-11 rounded-full bg-amber-950/30 border border-brand-amber/25 flex items-center justify-center font-bold text-brand-amber text-xs shrink-0 font-sans">
                          {initials(client.name)}
                        </div>

                        <div className="space-y-1">
                          <div className="font-bold text-white text-sm leading-none flex items-center gap-2">
                            <span>{client.name}</span>
                            <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-950/50 border border-brand-amber/20 text-brand-amber">
                              {diffDays} dias sem cortar
                            </span>
                          </div>

                          <div className="text-xs text-text-secondary">
                            Última visita registrada {originLabel ? `(${originLabel})` : ''}: <span className="font-semibold text-text-primary">{lastCutDate ? fmtDate(lastCutDate) : 'S/R'}</span> · Plano: <span className="font-semibold text-text-primary">{getPlanName(client.package)}</span>
                          </div>

                          {client.phone ? (
                            <div className="text-[10px] text-text-muted">
                              📞 {client.phone}
                            </div>
                          ) : (
                            <span className="text-[9px] text-[#ff4444] font-bold">⚠️ Sem telefone cadastrado</span>
                          )}
                        </div>
                      </div>

                      {/* Shoot button */}
                      <div className="flex items-center shrink-0 border-t border-border-dark/40 pt-3 md:pt-0 md:border-none">
                        {client.phone ? (
                          <button
                            onClick={() => fireWinbackMessage(client.name, client.phone, diffDays)}
                            className="w-full md:w-auto btn bg-[#c5a880] hover:bg-[#c5a880]/90 active:scale-95 text-black font-extrabold text-xs py-2 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow transition-all"
                          >
                            <Share2 className="w-4 h-4 stroke-[2.2]" />
                            <span>Contatar e Trazer de Volta</span>
                          </button>
                        ) : (
                          <span className="text-xs text-text-muted italic">Mensagens indisponíveis</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* --- TAB 1: OVERDUE ASSINATURAS (BILLING CORRESPONDENT) --- */}
        {activeTab === 'overdue' && (
          <div className="space-y-4">
            {lateClients.length === 0 ? (
              <div className="py-16 text-center max-w-md mx-auto bg-bg-dark-800 border border-border-dark rounded-xl">
                <div className="w-16 h-16 rounded-full bg-brand-success-bg border border-brand-success-border flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-brand-success-text" />
                </div>
                <h2 className="text-base font-semibold text-text-primary">Tudo em dia!</h2>
                <p className="text-xs text-text-muted mt-2 px-4">
                  Nenhum cliente está com pagamento de assinatura atrasado no momento. Excelente trabalho de cobrança e adimplência!
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-xl p-4 bg-brand-danger-bg border border-brand-danger-border text-brand-danger-text text-xs flex items-center gap-3">
                  <Bell className="w-4.5 h-4.5 text-brand-danger-text shrink-0" />
                  <span>Há <span className="font-bold">{lateClients.length}</span> cliente(s) que precisam de atenção rápida para restabelecer os contratos de assinatura.</span>
                </div>

                <div className="space-y-3">
                  {lateClients.map(c => {
                    const cleanNum = c.phone ? c.phone.replace(/\D/g, '') : '';
                    const firstName = c.name.trim().split(/\s+/)[0];
                    const valStr = (c.value || 0).toFixed(2).replace('.', ',');
                    const msg = encodeURIComponent(
                      `Olá, ${firstName}! Tudo bem?\n\nPassando apenas para lembrar da mensalidade deste mês, no valor de R$ ${valStr}.\n\nEssa mensagem é somente um lembrete. Quando for possível, fique à vontade para realizar o pagamento.\n\nQualquer dúvida, estou à disposição. Obrigado! ✂️`
                    );
                    const waLink = c.phone ? `https://wa.me/55${cleanNum}?text=${msg}` : '';

                    return (
                      <div
                        key={c.id}
                        className="bg-bg-dark-800 border border-border-dark rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-border-dark-light hover:bg-bg-dark-700/30"
                      >
                        <div className="flex items-start md:items-center gap-4">
                          {/* Avatar */}
                          <div className="w-12 h-12 rounded-full bg-brand-amber-bg border border-brand-amber-border flex items-center justify-center font-bold text-brand-amber text-sm shrink-0 font-sans">
                            {initials(c.name)}
                          </div>
                          
                          <div className="space-y-1">
                            <div className="font-semibold text-text-primary text-sm leading-tight">{c.name}</div>
                            <div className="text-xs text-text-secondary leading-relaxed font-sans" title={getAdjustedDueDay(c.due).isAdjusted ? `Ajustado do dia original ${c.due} pois este mês é mais curto` : undefined}>
                              Pacote {getPlanName(c.package)} · <span className="font-semibold text-text-primary">{fmtMoney(c.value)}/mês</span> · Vence dia {getAdjustedDueDay(c.due).day}{getAdjustedDueDay(c.due).isAdjusted ? '*' : ''}
                            </div>
                            <div className="text-[10px] text-text-muted font-sans">
                              Último pagamento: {c.lastPaid ? fmtDate(c.lastPaid) : <span className="italic">Sem registro</span>}
                              {c.phone ? <span className="mx-2">·</span> : null}
                              {c.phone ? <span>📞 {c.phone}</span> : null}
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2 shrink-0 md:justify-end border-t border-border-dark/50 pt-3 md:pt-0 md:border-none">
                          {c.phone && (
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-ghost text-xs py-1.5 px-3 border border-border-dark hover:bg-bg-dark-700 text-text-secondary hover:text-text-primary rounded-lg flex items-center gap-1.5 cursor-pointer no-underline font-sans"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-brand-success-text" />
                              <span>Mandar Aviso</span>
                            </a>
                          )}
                          
                          <button
                            onClick={() => onConfirmPayment(c.id)}
                            className="btn bg-[#c5a880] hover:bg-[#c5a880]/90 text-black text-xs font-semibold py-1.5 px-3 rounded-lg flex items-center gap-1.5 cursor-pointer shadow transition-all active:scale-95 font-sans"
                          >
                            <CheckSquare className="w-3.5 h-3.5 stroke-[2.2]" />
                            <span>Confirmar pagamento</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* --- TAB 4: PREVENTIVE ALERTS (1 DAY BEFORE RENEWAL) --- */}
        {activeTab === 'preventive' && (
          <div className="space-y-4">
            
            {/* Template configuration panel header */}
            <div className="bg-bg-dark-800 border border-border-dark p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">Selecione o Modelo de Mensagem</span>
                <span className="text-xs text-text-secondary">Escolha qual cordialidade preventiva enviar ao assinante cujo plano vence amanhã</span>
              </div>
              
              <div className="flex gap-2 w-full md:w-auto">
                <button
                  onClick={() => setPreventiveTemplate(0)}
                  className={`flex-1 md:flex-none btn text-xs py-1.5 px-3 rounded-lg border font-semibold cursor-pointer transition-all ${
                    preventiveTemplate === 0
                      ? 'bg-amber-950/45 border-brand-amber text-brand-amber'
                      : 'border-border-dark text-text-secondary hover:bg-bg-dark-700'
                  }`}
                >
                  ⏱️ Modelo Padrão (Lembrete)
                </button>
                <button
                  onClick={() => setPreventiveTemplate(1)}
                  className={`flex-1 md:flex-none btn text-xs py-1.5 px-3 rounded-lg border font-semibold cursor-pointer transition-all ${
                    preventiveTemplate === 1
                      ? 'bg-amber-950/45 border-brand-amber text-brand-amber'
                      : 'border-border-dark text-text-secondary hover:bg-bg-dark-700'
                  }`}
                >
                  ⚡ Modelo Rápido (Aviso)
                </button>
              </div>
            </div>

            {preventiveClients.length === 0 ? (
              <div className="bg-bg-dark-800 border border-border-dark rounded-xl p-12 text-center max-w-md mx-auto">
                <UserCheck className="w-12 h-12 text-brand-success-text mx-auto mb-3.5" />
                <h3 className="font-bold text-white text-sm">Nenhum plano vencendo amanhã</h3>
                <p className="text-xs text-text-muted mt-1">
                  Não existem assinantes com vencimento de plano agendado para amanhã. Ótimo!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                
                {/* Header status advice banner */}
                <div className="rounded-xl p-4 bg-emerald-950/20 border border-emerald-900/40 text-emerald-400 text-xs flex items-center gap-3">
                  <Bell className="w-4.5 h-4.5 shrink-0" />
                  <span>
                    Mostrando todos os <span className="font-bold text-white">{preventiveClients.length}</span> assinantes que vencem amanhã. Clique para enviar o aviso de cobrança preventiva!
                  </span>
                </div>

                {preventiveClients.map(c => {
                  return (
                    <div
                      key={c.id}
                      className="bg-bg-dark-800 border border-border-dark rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-border-dark-light hover:bg-bg-dark-700/35"
                    >
                      <div className="flex items-center gap-4.5">
                        
                        {/* Initials circular indicator */}
                        <div className="w-11 h-11 rounded-full bg-emerald-950/30 border border-emerald-500/20 flex items-center justify-center font-bold text-emerald-400 text-xs shrink-0 font-sans">
                          {initials(c.name)}
                        </div>

                        <div className="space-y-1">
                          <div className="font-bold text-white text-sm leading-none flex items-center gap-2">
                            <span>{c.name}</span>
                            <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-950/50 border border-emerald-500/35 text-emerald-400">
                              Vence Amanhã
                            </span>
                          </div>

                          <div className="text-xs text-text-secondary leading-relaxed">
                            Plano: <span className="font-semibold text-text-primary">{getPlanName(c.package)}</span> · Valor: <span className="font-semibold text-text-primary">{fmtMoney(c.value)}/mês</span> · Vencimento Original: Dia {c.due}
                          </div>

                          {c.phone ? (
                            <div className="text-[10px] text-text-muted">
                              📞 {c.phone}
                            </div>
                          ) : (
                            <span className="text-[9px] text-[#ff4444] font-bold">⚠️ Sem telefone cadastrado</span>
                          )}
                        </div>
                      </div>

                      {/* Shoot button */}
                      <div className="flex items-center shrink-0 border-t border-border-dark/40 pt-3 md:pt-0 md:border-none">
                        {c.phone ? (
                          <button
                            onClick={() => firePreventiveMessage(c)}
                            className="w-full md:w-auto btn bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-black font-extrabold text-xs py-2 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow transition-all"
                          >
                            <MessageSquare className="w-4.5 h-4.5 stroke-[2.2]" />
                            <span>Enviar Aviso 1 Clique</span>
                          </button>
                        ) : (
                          <span className="text-xs text-text-muted italic">Mensagens indisponíveis</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
