import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Users, 
  DollarSign, 
  AlertCircle, 
  Scissors, 
  ClipboardList, 
  TrendingUp, 
  Copy, 
  Check, 
  Bell, 
  MessageSquare, 
  Share2,
  Clock
} from 'lucide-react';
import { Client, Cut } from '../types';
import { fmtMoney, initials, fmtDate, getAdjustedDueDay } from '../utils';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

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

interface DashboardProps {
  clients: Client[];
  allCuts: Cut[];
  onNavigate: (page: string) => void;
  user: {
    uid: string;
    role: string;
    displayName?: string;
    email?: string;
  };
  featureAlertsEnabled?: boolean;
  barberProfile?: any;
}

export default function Dashboard({ 
  clients, 
  allCuts, 
  onNavigate, 
  user, 
  featureAlertsEnabled = true,
  barberProfile
}: DashboardProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeNoticeTab, setActiveNoticeTab] = useState<'reminders' | 'winback' | 'overdue'>('reminders');
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [minDays, setMinDays] = useState<number>(20);

  // Sync bookings in real-time
  useEffect(() => {
    const refBookings = collection(db, 'guest_bookings');
    const unsubscribe = onSnapshot(refBookings, (snap) => {
      const list: BookingRecord[] = [];
      snap.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as BookingRecord);
      });
      
      // Filter by barbeariaId or barberId
      const filtered = list.filter(b => b.barbeariaId === user?.uid || b.barberId === user?.uid);
      
      // Sort nearest first (date ascending, time ascending)
      filtered.sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return a.time.localeCompare(b.time);
      });
      
      setBookings(filtered);
    }, (error) => {
      console.error('Error syncing guest_bookings in Dashboard component:', error);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const handleCopyLink = () => {
    const barberParam = user?.role === 'barber' ? `&barbearia=${user.uid}` : '';
    const link = `${window.location.origin}${window.location.pathname}?agendar=true${barberParam}`;
    
    let copySuccess = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link);
        copySuccess = true;
      }
    } catch (e) {
      console.warn("Navigator clipboard failed, using fallback:", e);
    }

    if (!copySuccess) {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = link;
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.position = "fixed";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        copySuccess = document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch (err) {
        console.error("Fallback copy failed:", err);
      }
    }

    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const totalSubscribers = clients.length;
  const lateClients = clients.filter(c => c.status === 'atrasado');
  const totalLate = lateClients.length;
  const activeRevenue = clients.reduce((accum, c) => accum + (c.status === 'ok' ? c.value : 0), 0);
  const totalCutsCount = allCuts.length;

  // Calculate most realized services
  const serviceCounts: { [key: string]: number } = {};
  allCuts.forEach(cut => {
    serviceCounts[cut.service] = (serviceCounts[cut.service] || 0) + 1;
  });
  
  const sortedServices = Object.entries(serviceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  const maxSvcCount = sortedServices.length > 0 ? sortedServices[0][1] : 1;

  // Last 4 haircuts
  const recentCuts = [...allCuts]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4);

  // Package distributions
  const activePlanIds = React.useMemo(() => {
    const ids = new Set<string>(['Básico', 'Premium', 'VIP']);
    if (barberProfile?.plans) {
      Object.keys(barberProfile.plans).forEach(id => ids.add(id));
    }
    clients.forEach(c => {
      if (c.package) ids.add(c.package);
    });
    return Array.from(ids);
  }, [clients, barberProfile]);

  const pkgCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    activePlanIds.forEach(id => {
      counts[id] = clients.filter(c => c.package === id).length;
    });
    return counts;
  }, [clients, activePlanIds]);

  const todayText = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  // Filter lists for quick notifications
  const todayStr = new Date().toISOString().split('T')[0];
  const todayBookings = bookings.filter(b => b.date === todayStr && b.status !== 'completed' && b.status !== 'no-show');

  // Parse raw cuts map for inactive winback calculation
  const rawCutsMap: { [clientId: string]: Cut[] } = {};
  allCuts.forEach(c => {
    if (!rawCutsMap[c.clientId]) {
      rawCutsMap[c.clientId] = [];
    }
    rawCutsMap[c.clientId].push(c);
  });

  const winbackClients = clients.map(client => {
    const clientCuts = rawCutsMap[client.id] || [];
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

    const lastCutTime = new Date(lastCutDate + 'T12:00:00').getTime();
    const todayTime = new Date().getTime();
    const diffTime = todayTime - lastCutTime;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

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

  // Message dispatch links
  const getReminderMessage = (b: BookingRecord) => {
    const cleanBarber = b.barberName || 'Barbeiro';
    const dateFormatted = b.date.split('-').reverse().join('/');
    const salonName = barberProfile?.name || 'Royal Cuts';
    const cancelUrl = `${window.location.origin}${window.location.pathname}?barbearia=${b.barbeariaId || user?.uid || ''}&consultar=true&tel=${encodeURIComponent(b.clientPhone)}`;

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
  };

  const fireReminderMessage = (b: BookingRecord) => {
    if (!featureAlertsEnabled) {
      alert('⚠️ A função de avisos e envio de mensagens pelo WhatsApp não está liberada no seu plano atual.');
      return;
    }
    const cleanPhone = b.clientPhone.replace(/\D/g, '');
    if (!cleanPhone) {
      alert('Telefone do cliente é inválido ou não informado.');
      return;
    }
    const text = getReminderMessage(b);
    const encodedText = encodeURIComponent(text);
    const hasDdi = cleanPhone.length > 11;
    const phoneWithDdi = hasDdi ? cleanPhone : `55${cleanPhone}`;
    const url = `https://api.whatsapp.com/send?phone=${phoneWithDdi}&text=${encodedText}`;
    window.open(url, '_blank');
  };

  const getWinbackMessage = (clientName: string, diffDays: number) => {
    const clientFirstName = clientName.trim().split(/\s+/)[0];
    const userBarberParam = user?.role === 'barber' ? `&barbearia=${user.uid}` : '';
    const bookingLink = `${window.location.origin}${window.location.pathname}?agendar=true${userBarberParam}`;
    return `✂️ *Saudades de você!*\n\nOlá, ${clientFirstName}! Tudo bem?\n\nNotamos que já se passaram *${diffDays} dias* desde o seu último atendimento conosco e seu cabelo já deve estar no ponto para aquele trato de mestre! 💈\n\nAproveite para reservar seu horário agora mesmo de forma rápida e prática no nosso link de agendamentos:\n${bookingLink}\n\nGaranta seu horário e mantenha o visual impecável! Aguardamos você.`;
  };

  const fireWinbackMessage = (name: string, phone: string, diffDays: number) => {
    if (!featureAlertsEnabled) {
      alert('⚠️ A função de avisos e envio de mensagens pelo WhatsApp não está liberada no seu plano atual.');
      return;
    }
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone) {
      alert('Telefone do cliente é inválido ou não informado.');
      return;
    }
    const text = getWinbackMessage(name, diffDays);
    const encodedText = encodeURIComponent(text);
    const hasDdi = cleanPhone.length > 11;
    const phoneWithDdi = hasDdi ? cleanPhone : `55${cleanPhone}`;
    const url = `https://api.whatsapp.com/send?phone=${phoneWithDdi}&text=${encodedText}`;
    window.open(url, '_blank');
  };

  const fireOverdueMessage = (name: string, phone: string, value: number) => {
    if (!featureAlertsEnabled) {
      alert('⚠️ A função de avisos e envio de mensagens pelo WhatsApp não está liberada no seu plano atual.');
      return;
    }
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone) {
      alert('Telefone do cliente é inválido ou não informado.');
      return;
    }
    const firstName = name.trim().split(/\s+/)[0];
    const valStr = (Number(value) || 0).toFixed(2).replace('.', ',');
    const text = `Olá, ${firstName}! Tudo bem?\n\nPassando apenas para lembrar da mensalidade deste mês, no valor de R$ ${valStr}.\n\nEssa mensagem é somente um lembrete. Quando for possível, fique à vontade para realizar o pagamento.\n\nQualquer dúvida, estou à disposição. Obrigado! ✂️`;
    const encodedText = encodeURIComponent(text);
    const hasDdi = cleanPhone.length > 11;
    const phoneWithDdi = hasDdi ? cleanPhone : `55${cleanPhone}`;
    const url = `https://api.whatsapp.com/send?phone=${phoneWithDdi}&text=${encodedText}`;
    window.open(url, '_blank');
  };

  // Grid animations
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100 } }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none">
      {/* Topbar */}
      <div className="px-6 py-4 border-b border-border-dark bg-bg-dark-800 flex items-center justify-between gap-4 shrink-0">
        <h1 className="text-base font-semibold text-text-primary">Dashboard</h1>
        
        <div className="flex items-center gap-3">
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 bg-[#c5a880]/10 hover:bg-[#c5a880]/20 border border-[#c5a880]/35 text-[#c5a880] text-[10px] font-bold uppercase tracking-wider py-1.5 px-3 rounded-lg cursor-pointer transition-all active:scale-95"
            title="Copiar link para enviar a clientes fora da mensalidade"
          >
            {copiedLink ? (
              <>
                <Check className="w-3 h-3 stroke-[2.5]" />
                <span>Link Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copiar Link de Agendamento</span>
              </>
            )}
          </button>
          
          <span className="text-xs text-text-muted capitalize hidden sm:inline" id="dash-date">
            {todayText}
          </span>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* Metrics Grid */}
        <motion.div 
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          {/* Card 1: Subscribers */}
          <motion.div variants={itemVariants} className="bg-bg-dark-800 border border-border-dark rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Assinantes Ativos</span>
              <div className="w-8 h-8 rounded-lg bg-brand-amber-bg border border-brand-amber-border flex items-center justify-center">
                <Users className="w-4 h-4 text-brand-amber" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-semibold text-text-primary">{totalSubscribers}</span>
              <p className="text-[10px] text-text-muted mt-1 leading-none">
                {totalSubscribers - totalLate} em dia · {totalLate} atrasados
              </p>
            </div>
          </motion.div>

          {/* Card 2: Revenue */}
          <motion.div variants={itemVariants} className="bg-bg-dark-800 border border-border-dark rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Receita Mensal</span>
              <div className="w-8 h-8 rounded-lg bg-brand-amber-bg border border-brand-amber-border flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-brand-amber" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-semibold text-text-primary">{fmtMoney(activeRevenue)}</span>
              <p className="text-[10px] text-brand-success-text mt-1 leading-none flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Pagamentos confirmados
              </p>
            </div>
          </motion.div>

          {/* Card 3: Late */}
          <motion.div variants={itemVariants} className="bg-bg-dark-800 border border-border-dark rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Atrasados</span>
              <div className="w-8 h-8 rounded-lg bg-brand-danger-bg border border-brand-danger-border flex items-center justify-center">
                <AlertCircle className="w-4 h-4 text-brand-danger-text" />
              </div>
            </div>
            <div className="mt-2">
              <span className={`text-2xl font-semibold ${totalLate > 0 ? 'text-brand-danger-text' : 'text-text-primary'}`}>
                {totalLate}
              </span>
              <p className={`text-[10px] mt-1 leading-none ${totalLate > 0 ? 'text-brand-danger-text/80' : 'text-text-muted'}`}>
                {totalLate > 0 ? 'Ação necessária' : 'Tudo em dia'}
              </p>
            </div>
          </motion.div>

          {/* Card 4: Historical Cuts */}
          <motion.div variants={itemVariants} className="bg-bg-dark-800 border border-border-dark rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Total de Cortes</span>
              <div className="w-8 h-8 rounded-lg bg-brand-amber-bg border border-brand-amber-border flex items-center justify-center">
                <Scissors className="w-4 h-4 text-brand-amber" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-semibold text-text-primary">{totalCutsCount}</span>
              <p className="text-[10px] text-text-muted mt-1 leading-none">Registros históricos</p>
            </div>
          </motion.div>
        </motion.div>

        {/* Quick Config Card - Highly visible and essential for mobile users */}
        {user?.role === 'barber' && (
          <motion.div 
            variants={itemVariants}
            className="bg-gradient-to-r from-brand-amber/10 to-[#c5a880]/15 border border-brand-amber-border/40 rounded-2xl p-4 md:p-5 shadow flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-fade-in"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-brand-amber-bg border border-brand-amber-border/50 flex items-center justify-center text-brand-amber shrink-0 shadow-inner">
                <Clock className="w-5.5 h-5.5" />
              </div>
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>📅</span>
                  <span>Organizar Agenda & Intervalo de Horários</span>
                </h3>
                <p className="text-xs text-text-secondary leading-relaxed max-w-2xl">
                  Seus clientes agendam online de acordo com suas preferências. Altere os dias de atendimento, horário de início de expediente e o tempo de cada serviço (intervalo) a qualquer momento.
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('agenda')}
              className="w-full md:w-auto px-5 py-2.5 bg-brand-amber hover:bg-brand-amber-hover text-black font-bold text-xs rounded-xl shadow cursor-pointer transition-all active:scale-95 text-center shrink-0 flex items-center justify-center gap-1.5"
            >
              <span>Configurar Agenda</span>
              <span>⚡</span>
            </button>
          </motion.div>
        )}

        {/* Recommended Upcoming Reminders Panel (Aba de Avisos) */}
        <motion.div 
          variants={itemVariants}
          className="bg-bg-dark-800 border border-border-dark rounded-xl p-5 shadow-md flex flex-col gap-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-dark/65 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Bell className="w-4 h-4 text-brand-amber animate-pulse" />
                <span>Próximos Avisos a Enviar (Lembretes)</span>
              </h2>
              <p className="text-[10px] text-text-muted mt-0.5">Selecione uma categoria para abrir o WhatsApp do cliente com o aviso pré-configurado.</p>
            </div>

            {/* Switch tabs with counts */}
            <div className="flex bg-bg-dark-900 border border-border-dark rounded-lg p-0.5 max-w-full overflow-x-auto shrink-0 select-none">
              <button
                onClick={() => setActiveNoticeTab('reminders')}
                className={`px-3 py-1 text-[10px] sm:text-xs font-bold rounded-md transition-all cursor-pointer whitespace-nowrap ${
                  activeNoticeTab === 'reminders'
                    ? 'bg-[#c5a880] text-black font-extrabold'
                    : 'text-text-secondary hover:text-white'
                }`}
              >
                ⏱️ Horários de Hoje ({todayBookings.length})
              </button>
              <button
                onClick={() => setActiveNoticeTab('winback')}
                className={`px-3 py-1 text-[10px] sm:text-xs font-bold rounded-md transition-all cursor-pointer whitespace-nowrap ${
                  activeNoticeTab === 'winback'
                    ? 'bg-[#c5a880] text-black font-extrabold'
                    : 'text-text-secondary hover:text-white'
                }`}
              >
                🔄 Ausentes/Resgate ({winbackClients.length})
              </button>
              <button
                onClick={() => setActiveNoticeTab('overdue')}
                className={`px-3 py-1 text-[10px] sm:text-xs font-bold rounded-md transition-all cursor-pointer whitespace-nowrap ${
                  activeNoticeTab === 'overdue'
                    ? 'bg-[#c5a880] text-black font-extrabold'
                    : 'text-text-secondary hover:text-white'
                }`}
              >
                💸 Cobrança ({lateClients.length})
              </button>
            </div>
          </div>

          {/* Tab content rendering */}
          <div className="max-h-72 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
            {activeNoticeTab === 'reminders' && (
              todayBookings.length === 0 ? (
                <div className="text-center py-8 text-xs text-text-muted italic">
                  Nenhum agendamento pendente para hoje. Tudo tranquilo!
                </div>
              ) : (
                todayBookings.map(b => (
                  <div key={b.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-bg-dark-900/60 border border-border-dark/50 rounded-lg hover:border-border-dark-light transition-all text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{b.clientName}</span>
                        <span className="text-[10px] font-mono text-brand-amber font-extrabold bg-[#c5a880]/10 border border-[#c5a880]/30 px-2 py-0.5 rounded-md">
                          ⏰ Hoje às {b.time}
                        </span>
                      </div>
                      <div className="text-text-muted leading-tight">
                        Serviço: <span className="text-text-secondary font-semibold">{b.serviceName}</span> · Profissional: <span className="text-text-secondary font-semibold">{b.barberName}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => fireReminderMessage(b)}
                      className="btn bg-[#25D366] hover:bg-[#20ba5a] active:scale-95 text-black font-extrabold text-[11px] py-1.5 px-3.5 rounded-lg flex items-center justify-center gap-1.5 transition-all w-full sm:w-auto cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Enviar Lembrete</span>
                    </button>
                  </div>
                ))
              )
            )}

            {activeNoticeTab === 'winback' && (
              winbackClients.length === 0 ? (
                <div className="text-center py-8 text-xs text-text-muted italic">
                  Nenhum cliente ausente para resgatar. Excelente fidelização!
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-4 p-2 bg-bg-dark-900 border border-border-dark/40 rounded-lg mb-2 text-[11px]">
                    <span className="text-text-muted uppercase font-bold text-[9px]">Considerar ausente com mais de:</span>
                    <div className="flex items-center gap-2 select-none">
                      <input 
                        type="range" 
                        min="10" 
                        max="40" 
                        step="5" 
                        value={minDays} 
                        onChange={(e) => setMinDays(Number(e.target.value))}
                        className="w-24 h-1 accent-[#c5a880] bg-bg-dark-800 rounded-lg cursor-pointer"
                      />
                      <span className="text-xs font-semibold text-brand-amber w-16 text-right shrink-0">{minDays} dias</span>
                    </div>
                  </div>

                  {winbackClients.map(({ client, diffDays, lastCutDate, originLabel }) => (
                    <div key={client.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-bg-dark-900/60 border border-border-dark/50 rounded-lg hover:border-border-dark-light transition-all text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">{client.name}</span>
                          <span className="text-[10px] font-extrabold uppercase bg-amber-950/50 border border-brand-amber/20 text-brand-amber px-2 py-0.5 rounded-md">
                            ⚠️ {diffDays} dias sem vir
                          </span>
                        </div>
                        <div className="text-text-muted leading-tight">
                          Último registro {originLabel ? `(${originLabel})` : ''}: <span className="text-text-secondary font-semibold">{lastCutDate ? fmtDate(lastCutDate) : 'S/R'}</span> · Plano: <span className="text-[#c5a880] font-semibold">{client.package}</span>
                        </div>
                      </div>
                      {client.phone ? (
                        <button
                          onClick={() => fireWinbackMessage(client.name, client.phone!, diffDays)}
                          className="btn bg-[#25D366] hover:bg-[#20ba5a] active:scale-95 text-black font-extrabold text-[11px] py-1.5 px-3.5 rounded-lg flex items-center justify-center gap-1.5 transition-all w-full sm:w-auto cursor-pointer"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>Chamar de Volta</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-red-400 italic">Sem telefone cadastrado</span>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}

            {activeNoticeTab === 'overdue' && (
              lateClients.length === 0 ? (
                <div className="text-center py-8 text-xs text-text-muted italic">
                  Nenhum assinante inadimplente. Controle financeiro nota 10!
                </div>
              ) : (
                lateClients.map(c => (
                  <div key={c.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-bg-dark-900/60 border border-brand-danger-border/30 rounded-lg hover:border-brand-danger-border transition-all text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{c.name}</span>
                        <span className="text-[10px] font-extrabold uppercase bg-brand-danger-bg text-brand-danger-text border border-brand-danger-border/25 px-2 py-0.5 rounded-md" title={getAdjustedDueDay(c.due).isAdjusted ? `Ajustado do dia original ${c.due} pois este mês é mais curto` : undefined}>
                          💸 Venceu dia {getAdjustedDueDay(c.due).day}{getAdjustedDueDay(c.due).isAdjusted ? '*' : ''}
                        </span>
                      </div>
                      <div className="text-text-muted leading-tight">
                        Plano: <span className="text-text-secondary font-semibold">{c.package}</span> · Mensalidade: <span className="text-text-secondary font-semibold">{fmtMoney(c.value)}</span>
                      </div>
                    </div>
                    {c.phone ? (
                      <button
                        onClick={() => fireOverdueMessage(c.name, c.phone!, c.value)}
                        className="btn bg-[#25D366] hover:bg-[#20ba5a] active:scale-95 text-black font-extrabold text-[11px] py-1.5 px-3.5 rounded-lg flex items-center justify-center gap-1.5 transition-all w-full sm:w-auto cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Notificar Cobrança</span>
                      </button>
                    ) : (
                      <span className="text-[10px] text-red-400 italic">Sem telefone cadastrado</span>
                    )}
                  </div>
                ))
              )
            )}
          </div>
        </motion.div>

        {/* Dashboard Panels Grid */}
        <motion.div 
          className="grid grid-cols-1 lg:grid-cols-2 gap-4"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          {/* Panel 1: Services completed progress list */}
          <motion.div variants={itemVariants} className="bg-bg-dark-800 border border-border-dark rounded-xl p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-brand-amber" /> Serviços mais realizados
            </h2>
            {sortedServices.length === 0 ? (
              <div className="py-12 text-center text-text-muted text-xs">
                Nenhum serviço registrado ainda
              </div>
            ) : (
              <div className="space-y-3">
                {sortedServices.map(([name, count]) => {
                  const percent = Math.round((count / maxSvcCount) * 100);
                  return (
                    <div key={name} className="flex items-center gap-3">
                      <span className="text-xs text-text-secondary w-24 text-right truncate" title={name}>
                        {name}
                      </span>
                      <div className="bar-wrap">
                        <div className="bar-fill" style={{ width: `${percent}%` }}></div>
                      </div>
                      <span className="text-xs font-semibold text-text-muted w-6 text-right">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* Panel 2: Late Payments widget */}
          <motion.div variants={itemVariants} className="bg-bg-dark-800 border border-border-dark rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-brand-amber" /> Pagamentos em atraso
              </h2>
              {totalLate > 0 && (
                <button 
                  onClick={() => onNavigate('alerts')}
                  className="btn btn-ghost text-xs px-2 py-1 border border-border-dark hover:bg-bg-dark-700 hover:text-text-primary text-text-secondary rounded cursor-pointer"
                >
                  Ver todos
                </button>
              )}
            </div>
            
            {totalLate === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-text-muted text-xs gap-2">
                <svg className="w-7 h-7 text-brand-success-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <p>Nenhum atraso! ✓</p>
              </div>
            ) : (
              <div className="divide-y divide-border-dark max-h-[180px] overflow-y-auto">
                {lateClients.slice(0, 3).map(c => (
                  <div key={c.id} className="py-2.5 flex items-center justify-between text-xs first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-amber-bg border border-brand-amber-border flex items-center justify-center font-bold text-brand-amber text-xs">
                        {initials(c.name)}
                      </div>
                      <div>
                        <div className="font-semibold text-text-primary">{c.name}</div>
                        <div className="text-[10px] text-text-muted mt-0.5" title={getAdjustedDueDay(c.due).isAdjusted ? `Ajustado do dia original ${c.due} pois este mês é mais curto` : undefined}>
                          Vence dia {getAdjustedDueDay(c.due).day}{getAdjustedDueDay(c.due).isAdjusted ? '*' : ''} · {fmtMoney(c.value)}
                        </div>
                      </div>
                    </div>
                    <span className="bg-brand-danger-bg text-brand-danger-text border border-brand-danger-border text-[10px] px-2 py-0.5 rounded-full font-medium">
                      Atrasado
                    </span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Panel 3: Recent Appointments list */}
          <motion.div variants={itemVariants} className="bg-bg-dark-800 border border-border-dark rounded-xl p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
              <Scissors className="w-4 h-4 text-brand-amber" /> Últimos atendimentos
            </h2>
            {recentCuts.length === 0 ? (
              <div className="py-12 text-center text-text-muted text-xs">
                Nenhum atendimento registrado ainda
              </div>
            ) : (
              <div className="divide-y divide-border-dark">
                {recentCuts.map(cut => {
                  const client = clients.find(c => c.id === cut.clientId);
                  const clientName = client ? client.name : 'Cliente removido';
                  return (
                    <div key={cut.id} className="py-2.5 flex items-center justify-between text-xs first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-amber-bg border border-brand-amber-border flex items-center justify-center font-bold text-brand-amber text-xs">
                          {initials(clientName)}
                        </div>
                        <div>
                          <div className="font-semibold text-text-primary">{clientName}</div>
                          <div className="text-[10px] text-text-muted mt-0.5">{cut.service}</div>
                        </div>
                      </div>
                      <span className="text-[10px] text-text-muted">{fmtDate(cut.date)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* Panel 4: Subscription Package Shares */}
          <motion.div variants={itemVariants} className="bg-bg-dark-800 border border-border-dark rounded-xl p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-brand-amber" /> Distribuição de pacotes
            </h2>
            <div className="space-y-3">
              {activePlanIds.map(pkg => {
                const count = pkgCounts[pkg] || 0;
                const pct = totalSubscribers > 0 ? Math.round((count / totalSubscribers) * 100) : 0;
                
                const getPlanName = (pId: string) => {
                  if (barberProfile?.plans?.[pId]?.name) {
                    return barberProfile.plans[pId].name;
                  }
                  if (pId === 'Básico') return 'Plano Essencial';
                  if (pId === 'Premium') return 'Plano Cavalheiro';
                  if (pId === 'VIP') return 'Plano Executivo';
                  return pId;
                };

                return (
                  <div key={pkg} className="flex items-center gap-3">
                    <span className="text-xs text-text-secondary w-24 text-right font-medium truncate" title={getPlanName(pkg)}>
                      {getPlanName(pkg)}
                    </span>
                    <div className="bar-wrap">
                      <div className="bar-fill" style={{ width: `${pct}%` }}></div>
                    </div>
                    <span className="text-xs font-semibold text-text-muted w-16 text-right">
                      {count} ({pct}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
