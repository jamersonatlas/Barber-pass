import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, updateDoc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Client, WhatsAppConfig, WhatsAppDispatchLog } from '../types';
import { sendWhatsAppApiMessage, createDispatchLog } from '../services/whatsappAutomation';
import { 
  MessageSquare, 
  Send, 
  Smartphone, 
  Zap, 
  ShieldCheck, 
  Key, 
  Globe, 
  Bell, 
  CreditCard, 
  UserX, 
  History, 
  Save, 
  CheckCircle2, 
  AlertCircle,
  RefreshCw,
  Trash2,
  Calendar,
  Clock,
  Sparkles
} from 'lucide-react';

interface WhatsAppAutomationProps {
  user: any;
  clients: Client[];
  triggerToast: (msg: string) => void;
  barberProfile?: any;
}

export default function WhatsAppAutomation({ user, clients, triggerToast, barberProfile: initialBarberProfile }: WhatsAppAutomationProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [barberProfile, setBarberProfile] = useState<any>(initialBarberProfile || null);

  const [whatsappConfig, setWhatsappConfig] = useState<WhatsAppConfig>({
    enabled: false,
    provider: 'meta_cloud',
    instanceId: '',
    token: '',
    apiUrl: '',
    autoRemindersEnabled: true,
    autoBillingEnabled: true,
    autoWinbackEnabled: false,
    reminderHoursBefore: 2,
    testPhone: '',
    logs: []
  });

  const [testingWhatsapp, setTestingWhatsapp] = useState(false);
  const [batchSending, setBatchSending] = useState(false);
  const [todayBookings, setTodayBookings] = useState<any[]>([]);

  // 1. Fetch Barbershop Profile & WhatsApp config with Instant LocalStorage + Firestore Sync
  useEffect(() => {
    if (!user?.uid) return;

    // Load instant local cache first to prevent any flash of empty data
    const localSaved = localStorage.getItem(`barberpass_wa_config_${user.uid}`);
    if (localSaved) {
      try {
        const parsed = JSON.parse(localSaved);
        if (parsed && typeof parsed === 'object') {
          const loadedProvider = (parsed.provider === 'wa_link' ? 'meta_cloud' : parsed.provider) || 'meta_cloud';
          setWhatsappConfig(prev => ({
            ...prev,
            ...parsed,
            provider: loadedProvider
          }));
        }
      } catch (e) {
        console.warn('Failed to parse local WA config:', e);
      }
    }

    const fetchConfig = async () => {
      try {
        const docRef = doc(db, 'barbers', user.uid);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          setBarberProfile(data);

          const wa = data.scheduleSettings?.whatsappConfig || data.whatsappConfig;
          if (wa && typeof wa === 'object') {
            const loadedProvider = wa.provider || 'wapi';
            // Auto clean if JSON strings were saved accidentally in instanceId or apiUrl
            let cleanInstance = wa.instanceId || '';
            if (typeof cleanInstance === 'string' && cleanInstance.startsWith('{') && cleanInstance.endsWith('}')) {
              try {
                const parsed = JSON.parse(cleanInstance);
                cleanInstance = parsed.instanceId || parsed.instance || parsed.id || cleanInstance;
              } catch (_) {}
            }
            let cleanApiUrl = wa.apiUrl || '';
            if (typeof cleanApiUrl === 'string' && cleanApiUrl.startsWith('{') && cleanApiUrl.endsWith('}')) {
              try {
                const parsed = JSON.parse(cleanApiUrl);
                cleanApiUrl = parsed.url || parsed.apiUrl || '';
              } catch (_) {}
            }

            const mergedConfig: WhatsAppConfig = {
              enabled: wa.enabled !== false,
              provider: loadedProvider,
              instanceId: cleanInstance,
              token: wa.token || '',
              apiUrl: cleanApiUrl,
              autoRemindersEnabled: wa.autoRemindersEnabled !== false,
              autoBillingEnabled: wa.autoBillingEnabled !== false,
              autoWinbackEnabled: !!wa.autoWinbackEnabled,
              reminderHoursBefore: wa.reminderHoursBefore || 2,
              testPhone: wa.testPhone || '',
              logs: Array.isArray(wa.logs) ? wa.logs : []
            };
            setWhatsappConfig(mergedConfig);
            localStorage.setItem(`barberpass_wa_config_${user.uid}`, JSON.stringify(mergedConfig));
          }
        } else {
          // If the barber document doesn't exist yet, create it automatically so setDoc/updateDoc works
          const initialConfig: WhatsAppConfig = {
            enabled: true,
            provider: 'meta_cloud',
            instanceId: '',
            token: '',
            apiUrl: '',
            autoRemindersEnabled: true,
            autoBillingEnabled: true,
            autoWinbackEnabled: false,
            reminderHoursBefore: 2,
            testPhone: '',
            logs: []
          };
          
          if (localSaved) {
            try {
              const parsed = JSON.parse(localSaved);
              if (parsed && typeof parsed === 'object') {
                Object.assign(initialConfig, parsed);
              }
            } catch (e) {}
          }

          await setDoc(docRef, {
            id: user.uid,
            name: user.displayName || 'Barbearia',
            email: user.email || '',
            whatsappConfig: initialConfig,
            scheduleSettings: { whatsappConfig: initialConfig }
          }, { merge: true });
        }
      } catch (err) {
        console.error('Error loading WhatsApp automation config:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [user?.uid]);

  // Auto-backup to localStorage on state change to prevent data loss before save
  useEffect(() => {
    if (!user?.uid) return;
    localStorage.setItem(`barberpass_wa_config_${user.uid}`, JSON.stringify(whatsappConfig));
  }, [whatsappConfig, user?.uid]);

  // 2. Fetch Today's Guest Bookings for Quick Dispatch
  useEffect(() => {
    if (!user?.uid) return;
    const refBookings = collection(db, 'guest_bookings');
    const unsubscribe = onSnapshot(refBookings, (snapshot) => {
      const todayStr = new Date().toISOString().split('T')[0];
      const items: any[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const isBarberMatch = 
          data.barberId === user.uid || 
          data.barbeariaId === user.uid || 
          data.ownerId === user.uid || 
          !data.barbeariaId;

        if (
          isBarberMatch &&
          data.date === todayStr &&
          data.status !== 'cancelled'
        ) {
          items.push({ id: docSnap.id, ...data });
        }
      });
      // Sort ascending by time
      items.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      setTodayBookings(items);
    });
    return () => unsubscribe();
  }, [user?.uid]);

  // Ref to lock sent reminders in memory instantly to prevent race conditions
  const sentInThisSessionRef = React.useRef<Set<string>>(new Set());

  // 3. Automated Hands-free Background Reminder Engine
  // Checks today's appointments every 30 seconds and automatically sends a WhatsApp reminder 1h30 (90 min) before the appointment
  useEffect(() => {
    if (!whatsappConfig.enabled || !whatsappConfig.autoRemindersEnabled) return;
    if (!whatsappConfig.instanceId || !whatsappConfig.token) return;

    const checkAndDispatchAutoReminders = async () => {
      if (!todayBookings || todayBookings.length === 0) return;

      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const targetHoursBefore = whatsappConfig.reminderHoursBefore || 1.5; // Default 1h30
      const targetWindowMinutes = targetHoursBefore * 60; // e.g. 90 minutes

      // Load sent reminders cache for today from localStorage
      const cacheKey = `barberpass_sent_reminders_${user?.uid || 'default'}_${todayStr}`;
      const localSentSet = new Set<string>();
      try {
        const stored = localStorage.getItem(cacheKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            parsed.forEach(id => localSentSet.add(id));
          }
        }
      } catch (e) {}

      for (const b of todayBookings) {
        if (!b.clientPhone || b.status === 'cancelled' || b.status === 'completed') continue;
        if (b.date && b.date !== todayStr) continue;

        const phoneTimeKey = `${b.clientPhone}_${todayStr}_${b.time}`;

        // 1. Check if already sent in Firestore document
        if (b.reminderSent) continue;

        // 2. Check if already locked in local memory or localStorage cache
        if (
          localSentSet.has(b.id) || 
          localSentSet.has(phoneTimeKey) || 
          sentInThisSessionRef.current.has(b.id) || 
          sentInThisSessionRef.current.has(phoneTimeKey)
        ) {
          continue;
        }

        // 3. Check if whatsappConfig.logs already has a successful reminder log today for this phone
        const hasLogToday = whatsappConfig.logs?.some(log => 
          log.type === 'reminder' && 
          log.status === 'success' && 
          log.phone === b.clientPhone && 
          log.timestamp && new Date(log.timestamp).toISOString().split('T')[0] === todayStr
        );
        if (hasLogToday) {
          // Sync local locks so we don't check again
          localSentSet.add(b.id);
          localSentSet.add(phoneTimeKey);
          sentInThisSessionRef.current.add(b.id);
          sentInThisSessionRef.current.add(phoneTimeKey);
          continue;
        }

        const timeParts = (b.time || '').split(':');
        if (timeParts.length < 2) continue;

        const bHours = parseInt(timeParts[0], 10);
        const bMins = parseInt(timeParts[1], 10);
        if (isNaN(bHours) || isNaN(bMins)) continue;

        const bookingTime = new Date();
        bookingTime.setHours(bHours, bMins, 0, 0);

        const diffMinutes = (bookingTime.getTime() - now.getTime()) / (1000 * 60);

        // If the appointment time has already passed (or is right now), mark as processed so we don't send late reminders
        if (diffMinutes <= 0) {
          localSentSet.add(b.id);
          localSentSet.add(phoneTimeKey);
          sentInThisSessionRef.current.add(b.id);
          sentInThisSessionRef.current.add(phoneTimeKey);
          continue;
        }

        // Send ONLY IF the appointment is strictly in the future AND within targetWindowMinutes (e.g. <= 90 min before)
        if (diffMinutes > 0 && diffMinutes <= targetWindowMinutes) {
          // LOCK IMMEDIATELY before async dispatch to prevent duplicate calls
          b.reminderSent = true;
          sentInThisSessionRef.current.add(b.id);
          sentInThisSessionRef.current.add(phoneTimeKey);
          localSentSet.add(b.id);
          localSentSet.add(phoneTimeKey);
          try {
            localStorage.setItem(cacheKey, JSON.stringify(Array.from(localSentSet)));
          } catch (e) {}

          const windowLabel = targetHoursBefore === 1.5 ? '1h30min' : `${targetHoursBefore}h`;
          const barbershopName = barberProfile?.name || user?.displayName || 'Nossa Barbearia';
          const firstName = (b.clientName || '').trim().split(/\s+/)[0] || b.clientName;
          const serviceText = b.serviceName ? ` (${b.serviceName})` : '';
          const text = `Olá, *${firstName}*! Passando para lembrar do seu atendimento na *${barbershopName}* agendado para hoje às *${b.time}*${serviceText}.\n\nFaltam aproximadamente *${windowLabel}* para o seu horário! Te aguardamos. ✂️`;

          const res = await sendWhatsAppApiMessage(whatsappConfig, b.clientPhone, text);
          if (res.success) {
            try {
              await updateDoc(doc(db, 'guest_bookings', b.id), {
                reminderSent: true,
                reminderSentAt: new Date().toISOString()
              });
            } catch (e) {
              console.warn('Error updating booking reminderSent:', e);
            }

            triggerToast(`🤖 Lembrete automático (${windowLabel} antes) enviado para ${b.clientName}!`);

            const newLog = createDispatchLog(
              'reminder',
              b.clientName,
              b.clientPhone,
              'success',
              text
            );
            setWhatsappConfig(prev => {
              const updatedLogs = [newLog, ...(prev.logs || [])].slice(0, 50);
              return { ...prev, logs: updatedLogs };
            });
          }
        }
      }
    };

    // Run check immediately
    checkAndDispatchAutoReminders();

    // Re-check automatically every 30 seconds
    const interval = setInterval(checkAndDispatchAutoReminders, 30000);
    return () => clearInterval(interval);
  }, [todayBookings, whatsappConfig.enabled, whatsappConfig.autoRemindersEnabled, whatsappConfig.instanceId, whatsappConfig.token, whatsappConfig.reminderHoursBefore, whatsappConfig.logs, barberProfile?.name, user?.displayName, user?.uid]);

  // Save Config handler with setDoc merge
  const handleSaveConfig = async (overrideConfig?: WhatsAppConfig) => {
    if (!user?.uid) return;
    setSaving(true);
    const configToSave = overrideConfig || whatsappConfig;

    // Save to local cache immediately
    localStorage.setItem(`barberpass_wa_config_${user.uid}`, JSON.stringify(configToSave));

    try {
      const docRef = doc(db, 'barbers', user.uid);
      await setDoc(docRef, {
        whatsappConfig: configToSave,
        scheduleSettings: { whatsappConfig: configToSave },
        updatedAt: new Date().toISOString()
      }, { merge: true });

      triggerToast('✅ Configurações de Automação de WhatsApp salvas e mantidas com sucesso!');
    } catch (err) {
      console.error('Error saving whatsapp config:', err);
      triggerToast('✅ Salvo no dispositivo! (Aviso: sincronização no servidor pendente)');
    } finally {
      setSaving(false);
    }
  };

  // Test WhatsApp API handler
  const handleTestWhatsAppMessage = async () => {
    if (!whatsappConfig.testPhone) {
      triggerToast('Atenção: Digite o número de telefone com DDD para realizar o teste.');
      return;
    }
    if (whatsappConfig.provider !== 'wa_link' && (!whatsappConfig.instanceId || !whatsappConfig.token)) {
      triggerToast('Atenção: Preencha o ID/Sessão da Instância e a Chave/Token da API.');
      return;
    }

    setTestingWhatsapp(true);
    const barbershopName = barberProfile?.name || user?.displayName || 'Nossa Barbearia';
    const testMsg = `💈 *TESTE DE AUTOMAÇÃO WHATSAPP*\n\nOlá! Este é um teste automático disparado da *${barbershopName}*.\nSua integração via ${whatsappConfig.provider.toUpperCase()} foi configurada e está pronta para enviar lembretes e cobranças! 🚀`;

    const res = await sendWhatsAppApiMessage(
      { ...whatsappConfig, enabled: true },
      whatsappConfig.testPhone,
      testMsg
    );

    setTestingWhatsapp(false);

    const newLog = createDispatchLog(
      'test',
      'Teste de Conexão',
      whatsappConfig.testPhone,
      res.success ? 'success' : 'error',
      testMsg,
      res.error
    );

    const updatedLogs = [newLog, ...(whatsappConfig.logs || [])].slice(0, 50);
    const updatedConfig = { ...whatsappConfig, logs: updatedLogs };
    setWhatsappConfig(updatedConfig);
    await handleSaveConfig(updatedConfig);

    if (res.success) {
      triggerToast('✅ Mensagem de teste enviada com sucesso no WhatsApp!');
    } else {
      triggerToast(`❌ Falha no envio: ${res.error || 'Verifique suas credenciais de API'}`);
    }
  };

  const handleOpenDirectWhatsAppTest = () => {
    if (!whatsappConfig.testPhone) {
      triggerToast('Atenção: Digite o número de telefone com DDD para realizar o teste.');
      return;
    }
    const barbershopName = barberProfile?.name || user?.displayName || 'Nossa Barbearia';
    const testMsg = `💈 *TESTE DE AUTOMAÇÃO WHATSAPP*\n\nOlá! Este é um teste de envio da *${barbershopName}*.\nPronto para enviar lembretes e mensagens aos seus clientes! 🚀`;
    const clean = whatsappConfig.testPhone.replace(/\D/g, '');
    const phoneWithDdi = (clean.length === 10 || clean.length === 11) ? `55${clean}` : clean;
    const url = `https://api.whatsapp.com/send?phone=${phoneWithDdi}&text=${encodeURIComponent(testMsg)}`;
    window.open(url, '_blank');
  };

  // Batch dispatch handler
  const handleBatchDispatch = async (type: 'reminders' | 'overdue' | 'winback') => {
    if (!whatsappConfig.enabled) {
      triggerToast('Atenção: Ative a Automação de WhatsApp antes de disparar.');
      return;
    }
    if (!whatsappConfig.instanceId || !whatsappConfig.token) {
      triggerToast('Atenção: Preencha suas credenciais de API no formulário.');
      return;
    }

    setBatchSending(true);
    let successCount = 0;
    let failCount = 0;
    const newLogs = [...(whatsappConfig.logs || [])];

    if (type === 'reminders') {
      if (todayBookings.length === 0) {
        triggerToast('Nenhum agendamento pendente encontrado para hoje.');
        setBatchSending(false);
        return;
      }

      const nowTime = new Date();
      for (const b of todayBookings) {
        if (b.reminderSent) continue;

        // Skip past appointments
        if (b.time) {
          const timeParts = b.time.split(':');
          if (timeParts.length >= 2) {
            const bHours = parseInt(timeParts[0], 10);
            const bMins = parseInt(timeParts[1], 10);
            const bookingTime = new Date();
            bookingTime.setHours(bHours, bMins, 0, 0);
            if (bookingTime.getTime() <= nowTime.getTime()) {
              continue; // Do not send reminder for past appointment
            }
          }
        }

        const firstName = (b.clientName || '').trim().split(/\s+/)[0] || b.clientName;
        const serviceText = b.serviceName ? ` (${b.serviceName})` : '';
        const text = `Olá, *${firstName}*! Passando para lembrar do seu atendimento na *${barberProfile?.name || 'Nossa Barbearia'}* agendado para hoje às *${b.time}*${serviceText}.\n\nNos vemos em breve! Te esperamos. ✂️`;
        const res = await sendWhatsAppApiMessage(whatsappConfig, b.clientPhone, text);
        if (res.success) successCount++;
        else failCount++;

        newLogs.unshift(createDispatchLog(
          'reminder',
          b.clientName,
          b.clientPhone,
          res.success ? 'success' : 'error',
          text,
          res.error
        ));
      }
    } else if (type === 'overdue') {
      const lateClients = clients.filter(c => c.status === 'atrasado');
      if (lateClients.length === 0) {
        triggerToast('Nenhum assinante inadimplente no momento.');
        setBatchSending(false);
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

        newLogs.unshift(createDispatchLog(
          'billing',
          c.name,
          c.phone,
          res.success ? 'success' : 'error',
          text,
          res.error
        ));
      }
    } else if (type === 'winback') {
      const inactiveClients = clients.filter(c => c.status === 'ok' && !c.package);
      if (inactiveClients.length === 0) {
        triggerToast('Nenhum cliente disponível para resgate.');
        setBatchSending(false);
        return;
      }

      for (const c of inactiveClients) {
        if (!c.phone) continue;
        const firstName = c.name.trim().split(/\s+/)[0];
        const text = `✂️ *Saudades de você!*\n\nOlá, *${firstName}*! Notei que faz um tempinho desde seu último corte. Que tal dar aquele trato no visual hoje?\n\nAcesse nosso link de agendamento e garanta seu horário!`;
        const res = await sendWhatsAppApiMessage(whatsappConfig, c.phone, text);
        if (res.success) successCount++;
        else failCount++;

        newLogs.unshift(createDispatchLog(
          'winback',
          c.name,
          c.phone,
          res.success ? 'success' : 'error',
          text,
          res.error
        ));
      }
    }

    setBatchSending(false);
    const updatedConfig = { ...whatsappConfig, logs: newLogs.slice(0, 50) };
    setWhatsappConfig(updatedConfig);
    await handleSaveConfig(updatedConfig);

    triggerToast(`⚡ Automação concluída: ${successCount} mensagem(ns) enviada(s) com sucesso!${failCount > 0 ? ` (${failCount} erros)` : ''}`);
  };

  // Clear logs handler
  const handleClearLogs = async () => {
    const updated = { ...whatsappConfig, logs: [] };
    setWhatsappConfig(updated);
    await handleSaveConfig(updated);
    triggerToast('Histórico de disparos limpo.');
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 text-text-muted">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-brand-amber border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium">Carregando automação da barbearia...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 max-w-6xl w-full mx-auto">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-dark-850 border border-border-dark rounded-2xl p-6 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl">
            <MessageSquare className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-text-primary">Automação de Mensagens</h1>
              <span className={`px-2.5 py-0.5 text-[10px] font-extrabold rounded-full border ${
                whatsappConfig.enabled 
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
                  : 'bg-bg-dark-900 text-text-muted border-border-dark'
              }`}>
                {whatsappConfig.enabled ? '● Ativo nesta Barbearia' : '○ Desativado'}
              </span>
            </div>
            <p className="text-xs text-text-secondary mt-1 max-w-xl">
              Envie lembretes de horários, avisos de mensalidade e cobranças automáticas via WhatsApp. Cada barbearia cadastra seu próprio número e chave de API com 100% de isolamento.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end md:self-auto">
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              checked={whatsappConfig.enabled}
              onChange={(e) => setWhatsappConfig(prev => ({ ...prev, enabled: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="w-12 h-6 bg-bg-dark-900 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            <span className="ml-2.5 text-xs font-bold text-text-primary">
              {whatsappConfig.enabled ? 'Ativado' : 'Desativado'}
            </span>
          </label>

          <button
            type="button"
            onClick={() => handleSaveConfig()}
            disabled={saving}
            className="btn-primary text-xs py-2.5 px-5 rounded-xl flex items-center gap-2 shadow-lg"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>{saving ? 'Salvando...' : 'Salvar Alterações'}</span>
          </button>
        </div>
      </div>

      {/* Security & Multi-tenant Guarantee Note */}
      <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl flex items-start gap-3 text-xs text-text-secondary shadow-sm">
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-text-primary font-bold">
            Garantia de Isolamento de Números por Barbearia
          </p>
          <p className="leading-relaxed">
            As credenciais configuradas aqui pertencem <strong className="text-emerald-300">exclusivamente a esta barbearia ({barberProfile?.name || 'Sua Barbearia'})</strong>. O sistema dispara mensagens apenas pela sua própria conta do WhatsApp (Z-API, Evolution API, UltraMsg ou Wapi), garantindo que nenhuma barbearia utilize o número ou saldo de outra.
          </p>
        </div>
      </div>

      {/* Gateway API Configuration Card */}
      <div className="bg-bg-dark-850 border border-border-dark rounded-2xl p-6 space-y-5 shadow-lg">
        <div className="border-b border-border-dark/60 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-brand-amber" />
            <h3 className="text-sm font-bold text-text-primary">1. Conexão / Método de Disparo do WhatsApp</h3>
          </div>
          <span className="text-[10px] text-text-secondary">Escolha o serviço de envio desejado</span>
        </div>

        {/* Dynamic Provider Informational Banner */}
        {whatsappConfig.provider === 'meta_cloud' && (
          <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-start gap-3">
            <Globe className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-blue-400">API Oficial da Meta / Facebook</span>
                <span className="px-2 py-0.5 text-[9px] bg-blue-500/20 text-blue-300 font-bold rounded-full">1.000 Conversas Grátis/mês</span>
              </div>
              <p className="text-text-secondary leading-relaxed">
                A própria Meta concede <strong className="text-text-primary">1.000 mensagens/conversas gratuitas todos os meses</strong> para empresas. É 100% oficial e automática. Basta criar uma conta gratuita no <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline font-bold">developers.facebook.com</a>, ativar o produto WhatsApp e colar o ID do Número de Telefone e seu Token de Acesso abaixo.
              </p>
            </div>
          </div>
        )}

        {whatsappConfig.provider === 'evolution' && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3">
            <Zap className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-amber-400">Evolution API (Código Aberto / Open Source)</span>
                <span className="px-2 py-0.5 text-[9px] bg-amber-500/20 text-amber-300 font-bold rounded-full">Sem Custos por Mensagem</span>
              </div>
              <p className="text-text-secondary leading-relaxed">
                Sistema gratuito de código aberto. Pode ser hospedado em plataformas de baixo custo (Railway, Render ou servidor próprio por R$ 0 a R$ 15/mês) sem pagar mensalidades por instância como a Z-API.
              </p>
            </div>
          </div>
        )}

        {whatsappConfig.provider === 'wapi' && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-start gap-3">
            <Globe className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-emerald-400">W-API (w-api.app)</span>
                <span className="px-2 py-0.5 text-[9px] bg-emerald-500/20 text-emerald-300 font-bold rounded-full">7 Dias Grátis de Teste</span>
              </div>
              <p className="text-text-secondary leading-relaxed">
                Plataforma fácil de configurar para WhatsApp sem complicação. Acesse <a href="https://w-api.app" target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline font-bold">w-api.app</a>, cadastre sua conta, conecte o QR Code da sua barbearia e informe abaixo o seu <strong>ID da Instância</strong> e o <strong>Token / Chave de API</strong> gerados no painel do W-API.
              </p>
            </div>
          </div>
        )}

        {(whatsappConfig.provider === 'zapi' || whatsappConfig.provider === 'ultramsg') && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <span className="font-bold text-amber-400">ℹ️ Nota sobre o aviso "Mensagem de Teste / Conta em Trial"</span>
              <p className="text-text-secondary leading-relaxed">
                O nosso sistema envia apenas o texto limpo (iniciando em <em>"Olá, Nome! Passando para lembrar..."</em>). Se o seu cliente recebeu o aviso <em>"Esta mensagem foi enviada por uma CONTA EM TRIAL"</em> no topo, esse aviso é inserido <strong>automaticamente pela sua provedora de WhatsApp (Z-API/UltraMsg)</strong> enquanto a sua instância estiver no período de testes. Assim que você ativar o plano da sua provedora, essa mensagem no topo desaparecerá e chegará 100% limpa.
              </p>
            </div>
          </div>
        )}

        {/* Troubleshooting & Setup Checklist Card */}
        <div className="p-4 bg-bg-dark-900/80 border border-border-dark/80 rounded-xl space-y-2 text-xs">
          <div className="flex items-center gap-2 text-brand-amber font-bold">
            <CheckCircle2 className="w-4 h-4" />
            <span>Checklist para Garantir o Envio pelo WhatsApp:</span>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-text-secondary text-[11px] list-disc list-inside">
            <li><strong>1. QR Code Conectado:</strong> Aponte a câmera do WhatsApp para o QR Code na plataforma (W-API, Z-API ou Evolution) até ficar "Conectado".</li>
            <li><strong>2. Telefone com DDD:</strong> Digite o número com DDD (ex: <code>37991242929</code>).</li>
            <li><strong>3. Token e ID sem Espaços:</strong> Verifique se copiou a chave token inteira sem espaços antes ou depois.</li>
            <li><strong>4. Salvar Alterações:</strong> Clique no botão verde <strong>"Salvar Configurações de Automação"</strong> antes de disparar o teste.</li>
          </ul>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* API Provider Select */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-brand-amber" />
              <span>Selecione a Plataforma / Método de Disparo</span>
            </label>
            <select
              value={whatsappConfig.provider}
              onChange={(e) => setWhatsappConfig(prev => ({ ...prev, provider: e.target.value as any }))}
              className="w-full bg-bg-dark-900 border border-border-dark text-text-primary text-xs rounded-xl p-3.5 focus:outline-none focus:border-brand-amber cursor-pointer font-medium"
            >
              <option value="meta_cloud">🔵 Meta WhatsApp Cloud API Oficial (1.000 Mensagens GRÁTIS por Mês)</option>
              <option value="evolution">🟠 Evolution API (Open Source - Grátis auto-hospedado)</option>
              <option value="wapi">🟢 W-API (w-api.app - Pago / 7 Dias Grátis)</option>
              <option value="zapi">🔴 Z-API (Pago - R$ 99+/mês por barbearia)</option>
              <option value="ultramsg">🔴 UltraMsg API (Pago)</option>
              <option value="wa_link">📱 WhatsApp Web / Celular Direto (1-Clique Grátis sem Servidor)</option>
              <option value="custom">🟣 Webhook Customizado / N8N / Make / Integromat</option>
            </select>
          </div>

          {whatsappConfig.provider === 'wa_link' ? (
            <div className="md:col-span-2 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs space-y-2 text-emerald-200">
              <p className="font-bold text-emerald-400 flex items-center gap-1.5 text-sm">
                📱 Modo WhatsApp Direto (Sem Custos & Sem Servidor)
              </p>
              <p className="leading-relaxed text-[11px] text-text-secondary">
                Neste modo você não precisa pagar nenhuma mensalidade de API nem configurar tokens. As mensagens de lembretes e cobranças são geradas instantaneamente e abrem o WhatsApp Web ou aplicativo com o texto preenchido pronto para enviar em 1 clique!
              </p>
            </div>
          ) : (
            <>
              {/* Instance ID / Phone Number ID */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-brand-amber" />
                  <span>
                    {whatsappConfig.provider === 'meta_cloud' ? 'ID do Número de Telefone (Phone Number ID)' : 'ID da Instância (Instance ID)'}
                  </span>
                </label>
                <input
                  type="text"
                  placeholder={
                    whatsappConfig.provider === 'meta_cloud' 
                      ? 'Ex: 102938475610293' 
                      : whatsappConfig.provider === 'wapi'
                      ? 'Ex: LITE-5B1UDU-5KP20J'
                      : 'Ex: 3B48290123... ou id-da-instancia'
                  }
                  value={whatsappConfig.instanceId}
                  onChange={(e) => {
                    let val = e.target.value.trim();
                    if (val.startsWith('{') && val.endsWith('}')) {
                      try {
                        const parsed = JSON.parse(val);
                        val = parsed.instanceId || parsed.instance || parsed.id || val;
                      } catch (_) {}
                    }
                    setWhatsappConfig(prev => ({ ...prev, instanceId: val }));
                  }}
                  className="w-full bg-bg-dark-900 border border-border-dark text-text-primary text-xs rounded-xl p-3 focus:outline-none focus:border-brand-amber placeholder:text-text-muted/40 font-mono"
                />
                {whatsappConfig.provider === 'wapi' && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs space-y-1.5 text-amber-200/90 mt-2">
                    <p className="font-bold text-amber-300 flex items-center gap-1.5">
                      📌 Como preencher com base no seu painel W-API:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-[11px] leading-relaxed pl-1">
                      <li><strong>ID da Instância:</strong> Preencha com o código da instância (ex: <code className="bg-bg-dark-900 px-1 py-0.5 rounded text-amber-300">LITE-...</code>).</li>
                      <li><strong>Token da API:</strong> Preencha com o token secreto gerado no seu painel W-API.</li>
                      <li><strong>Se persistir erro HTTP 404:</strong> Copie a URL da rota de envio no menu "Documentação / Testar" do W-API e cole no campo <em>URL Customizada</em> abaixo.</li>
                    </ul>
                  </div>
                )}
              </div>

              {/* Token / API Key */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-brand-amber" />
                  <span>
                    {whatsappConfig.provider === 'meta_cloud' ? 'Token de Acesso da Meta (System Access Token)' : 'Token da API / Secret Token'}
                  </span>
                </label>
                <input
                  type="password"
                  placeholder="Sua chave secreta / token de acesso"
                  value={whatsappConfig.token}
                  onChange={(e) => setWhatsappConfig(prev => ({ ...prev, token: e.target.value }))}
                  className="w-full bg-bg-dark-900 border border-border-dark text-text-primary text-xs rounded-xl p-3 focus:outline-none focus:border-brand-amber placeholder:text-text-muted/40 font-mono"
                />
              </div>

              {/* API Base URL */}
              <div className="space-y-1.5 md:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-brand-amber" />
                    <span>URL Customizada do Servidor / Endpoint {whatsappConfig.provider === 'evolution' || whatsappConfig.provider === 'custom' ? '(Obrigatória/Recomendada)' : '(Opcional)'}</span>
                  </label>
                  <span className="text-[10px] text-brand-amber/90 font-medium">
                    {whatsappConfig.provider === 'evolution' && 'Ex: https://sua-evolution.com.br'}
                    {whatsappConfig.provider === 'zapi' && 'Ex: https://api.z-api.io/instances/SUA_INSTANCIA/token/SEU_TOKEN/send-text'}
                    {whatsappConfig.provider === 'wapi' && 'Ex: https://api.w-api.app/v1/instances/SUA_INSTANCIA/send-text'}
                    {whatsappConfig.provider === 'custom' && 'Ex: https://n8n.seu-dominio.com/webhook/enviar-whatsapp'}
                  </span>
                </div>
                <input
                  type="url"
                  placeholder={
                    whatsappConfig.provider === 'evolution' 
                      ? 'https://sua-evolution.com.br' 
                      : whatsappConfig.provider === 'zapi'
                      ? 'https://api.z-api.io/instances/SUA_INSTANCIA/token/SEU_TOKEN/send-text'
                      : 'https://sua-api.com.br/endpoint'
                  }
                  value={whatsappConfig.apiUrl}
                  onChange={(e) => {
                    let val = e.target.value.trim();
                    if (val.startsWith('{') && val.endsWith('}')) {
                      try {
                        const parsed = JSON.parse(val);
                        val = parsed.url || parsed.apiUrl || parsed.endpoint || '';
                      } catch (_) {}
                    }
                    setWhatsappConfig(prev => ({ ...prev, apiUrl: val }));
                  }}
                  className="w-full bg-bg-dark-900 border border-border-dark text-text-primary text-xs rounded-xl p-3 focus:outline-none focus:border-brand-amber placeholder:text-text-muted/40 font-mono"
                />
                <p className="text-[11px] text-text-secondary/80 leading-relaxed mt-1">
                  💡 <strong>Como resolver erro HTTP 404:</strong> O erro 404 acontece quando a rota da API ou o ID da Instância estão incorretos no seu provedor. Verifique se o ID está certo ou cole o link completo do endpoint da sua API neste campo acima.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Rules & Toggles Card */}
      <div className="bg-bg-dark-850 border border-border-dark rounded-2xl p-6 space-y-5 shadow-lg">
        <div className="border-b border-border-dark/60 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-brand-amber" />
            <h3 className="text-sm font-bold text-text-primary">2. Regras e Modos de Disparo Automático</h3>
          </div>
          <span className="text-[10px] text-text-secondary">Ative as regras desejadas</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Rule 1: Reminders */}
          <div 
            onClick={() => setWhatsappConfig(prev => ({ ...prev, autoRemindersEnabled: !prev.autoRemindersEnabled }))}
            className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
              whatsappConfig.autoRemindersEnabled 
                ? 'bg-brand-amber/10 border-brand-amber/50 text-text-primary shadow-sm' 
                : 'bg-bg-dark-900 border-border-dark text-text-muted hover:border-border-dark/80'
            }`}
          >
            <div className={`p-2.5 rounded-xl shrink-0 ${whatsappConfig.autoRemindersEnabled ? 'bg-brand-amber text-[#1a0e00]' : 'bg-bg-dark-800 text-text-muted'}`}>
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold">Lembrete de Horários</p>
              <p className="text-[10px] text-text-secondary mt-1 leading-relaxed">
                Avisa os clientes no dia do atendimento sobre o horário agendado.
              </p>
            </div>
          </div>

          {/* Rule 2: Billing Overdue */}
          <div 
            onClick={() => setWhatsappConfig(prev => ({ ...prev, autoBillingEnabled: !prev.autoBillingEnabled }))}
            className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
              whatsappConfig.autoBillingEnabled 
                ? 'bg-brand-amber/10 border-brand-amber/50 text-text-primary shadow-sm' 
                : 'bg-bg-dark-900 border-border-dark text-text-muted hover:border-border-dark/80'
            }`}
          >
            <div className={`p-2.5 rounded-xl shrink-0 ${whatsappConfig.autoBillingEnabled ? 'bg-brand-amber text-[#1a0e00]' : 'bg-bg-dark-800 text-text-muted'}`}>
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold">Cobrança de Mensalistas</p>
              <p className="text-[10px] text-text-secondary mt-1 leading-relaxed">
                Notifica assinantes com mensalidade pendente ou em atraso.
              </p>
            </div>
          </div>

          {/* Rule 3: Winback */}
          <div 
            onClick={() => setWhatsappConfig(prev => ({ ...prev, autoWinbackEnabled: !prev.autoWinbackEnabled }))}
            className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
              whatsappConfig.autoWinbackEnabled 
                ? 'bg-brand-amber/10 border-brand-amber/50 text-text-primary shadow-sm' 
                : 'bg-bg-dark-900 border-border-dark text-text-muted hover:border-border-dark/80'
            }`}
          >
            <div className={`p-2.5 rounded-xl shrink-0 ${whatsappConfig.autoWinbackEnabled ? 'bg-brand-amber text-[#1a0e00]' : 'bg-bg-dark-800 text-text-muted'}`}>
              <UserX className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold">Reconquista de Inativos</p>
              <p className="text-[10px] text-text-secondary mt-1 leading-relaxed">
                Dispara mensagem amigável para clientes sem cortar há 20+ dias.
              </p>
            </div>
          </div>
        </div>

        {/* Antecedent Timing Option & Background Automation Indicator */}
        <div className="pt-4 border-t border-border-dark/60 space-y-4">
          <div className="p-4 sm:p-5 bg-bg-dark-900 rounded-xl border border-border-dark space-y-3 w-full">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-brand-amber/10 text-brand-amber shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-text-primary">Tempo de Antecedência do Lembrete Automático</h4>
                <p className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">
                  O robô enviará a mensagem no WhatsApp do cliente com essa antecedência sem você precisar apertar em nada.
                </p>
              </div>
            </div>

            <div className="pt-1">
              <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5">
                Escolha a antecedência do disparo:
              </label>
              <select
                value={whatsappConfig.reminderHoursBefore || 1.5}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  const updated = { ...whatsappConfig, reminderHoursBefore: val };
                  setWhatsappConfig(updated);
                  handleSaveConfig(updated);
                }}
                className="w-full bg-bg-dark-800 border border-border-dark text-brand-amber text-xs rounded-xl p-3 focus:outline-none focus:border-brand-amber cursor-pointer font-bold transition-all hover:bg-bg-dark-750"
              >
                <option value={1.5}>⏱️ 1 hora e 30 minutos antes (1h30min - Recomendado)</option>
                <option value={1}>⏱️ 1 hora antes (60 minutos)</option>
                <option value={2}>⏱️ 2 horas antes (120 minutos)</option>
                <option value={0.5}>⏱️ 30 minutos antes</option>
                <option value={3}>⏱️ 3 horas antes</option>
              </select>
            </div>
          </div>

          {whatsappConfig.enabled && whatsappConfig.autoRemindersEnabled && whatsappConfig.instanceId && whatsappConfig.token ? (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-start gap-3 w-full">
              <span className="relative flex h-3 w-3 shrink-0 mt-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <div className="space-y-1 text-xs min-w-0 flex-1">
                <p className="font-bold text-emerald-400 flex items-center gap-1.5">
                  🤖 Robô com Inteligência Anti-Duplicação Ativo!
                </p>
                <p className="text-text-secondary text-[11px] leading-relaxed">
                  O robô monitora constantemente os agendamentos e dispara o lembrete exatamente <strong>{whatsappConfig.reminderHoursBefore === 1.5 ? '1h30min' : `${whatsappConfig.reminderHoursBefore}h`} antes</strong>. As mensagens enviadas são gravadas no banco e na memória local para <strong>garantir que nenhum cliente receba mensagens repetidas</strong>.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-2.5 text-xs text-amber-300 w-full">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Para o robô disparar sozinho no horário certo, mantenha a chave/token da API configurada e a Automação de WhatsApp "Ativada".</span>
            </div>
          )}
        </div>
      </div>

      {/* Manual & Instant Batch Trigger Section */}
      <div className="bg-bg-dark-850 border border-border-dark rounded-2xl p-6 space-y-5 shadow-lg">
        <div className="border-b border-border-dark/60 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Send className="w-5 h-5 text-brand-amber" />
            <h3 className="text-sm font-bold text-text-primary">3. Disparos Manuais / Lotes Instantâneos</h3>
          </div>
          <span className="text-[10px] text-text-secondary">Envie de uma vez para a lista inteira</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => handleBatchDispatch('reminders')}
            disabled={batchSending || !whatsappConfig.enabled}
            className="p-4 bg-bg-dark-900 hover:bg-bg-dark-800 border border-border-dark rounded-xl text-left transition-all cursor-pointer group disabled:opacity-50"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-text-primary group-hover:text-brand-amber transition-colors">
                Disparar Lembretes de Hoje
              </span>
              <Bell className="w-4 h-4 text-brand-amber" />
            </div>
            <p className="text-[10px] text-text-secondary leading-relaxed">
              Envia no WhatsApp de todos os clientes com agendamento hoje ({todayBookings.filter(b => !b.reminderSent).length} pendentes de lembrete).
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleBatchDispatch('overdue')}
            disabled={batchSending || !whatsappConfig.enabled}
            className="p-4 bg-bg-dark-900 hover:bg-bg-dark-800 border border-border-dark rounded-xl text-left transition-all cursor-pointer group disabled:opacity-50"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-text-primary group-hover:text-brand-amber transition-colors">
                Disparar Cobranças Pendentes
              </span>
              <CreditCard className="w-4 h-4 text-brand-amber" />
            </div>
            <p className="text-[10px] text-text-secondary leading-relaxed">
              Dispara aviso de pagamento para assinantes inadimplentes.
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleBatchDispatch('winback')}
            disabled={batchSending || !whatsappConfig.enabled}
            className="p-4 bg-bg-dark-900 hover:bg-bg-dark-800 border border-border-dark rounded-xl text-left transition-all cursor-pointer group disabled:opacity-50"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-text-primary group-hover:text-brand-amber transition-colors">
                Disparar Resgate de Clientes
              </span>
              <UserX className="w-4 h-4 text-brand-amber" />
            </div>
            <p className="text-[10px] text-text-secondary leading-relaxed">
              Envia convite de retorno para clientes afastados.
            </p>
          </button>
        </div>
      </div>

      {/* Real-time Connection Tester */}
      <div className="bg-bg-dark-850 border border-border-dark rounded-2xl p-6 space-y-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-amber" />
            <h3 className="text-sm font-bold text-text-primary">4. Testar Envio em Tempo Real</h3>
          </div>
          <span className="text-[10px] text-text-secondary">Valide a entrega antes de ativar lembretes</span>
        </div>

        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="tel"
              placeholder="Digite o número de telefone com DDD (ex: 37991242929)"
              value={whatsappConfig.testPhone || ''}
              onChange={(e) => setWhatsappConfig(prev => ({ ...prev, testPhone: e.target.value }))}
              className="flex-1 bg-bg-dark-900 border border-border-dark text-text-primary text-xs rounded-xl p-3 focus:outline-none focus:border-brand-amber font-mono"
            />
            
            <button
              type="button"
              onClick={handleTestWhatsAppMessage}
              disabled={testingWhatsapp}
              className="px-5 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-[#002211] font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-lg transition-all active:scale-95"
            >
              {testingWhatsapp ? (
                <div className="w-4 h-4 border-2 border-[#002211] border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>{testingWhatsapp ? 'Disparando...' : 'Testar via API'}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenDirectWhatsAppTest}
              className="px-4 py-3 bg-bg-dark-900 hover:bg-bg-dark-800 border border-emerald-500/40 text-emerald-400 font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
              title="Abre a mensagem instantaneamente no WhatsApp Web / Celular"
            >
              <Globe className="w-4 h-4 text-emerald-400" />
              <span>Abrir no WhatsApp Web</span>
            </button>
          </div>

          <div className="p-3 bg-bg-dark-900/60 border border-border-dark/60 rounded-xl text-[11px] text-text-secondary flex items-start gap-2">
            <span className="text-brand-amber font-bold">ℹ️ Dica Rápida:</span>
            <span>
              Se você receber <strong className="text-red-400">"Erro HTTP 404"</strong>, significa que o ID da Instância ou a rota do seu fornecedor mudou. Verifique o ID no painel do seu fornecedor ou selecione <em>"WhatsApp Web / Celular Direto"</em> no topo para enviar sem depender de servidor API.
            </span>
          </div>
        </div>
      </div>

      {/* History Dispatch Logs */}
      <div className="bg-bg-dark-850 border border-border-dark rounded-2xl p-6 space-y-4 shadow-lg">
        <div className="flex items-center justify-between border-b border-border-dark/60 pb-3">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-brand-amber" />
            <h3 className="text-sm font-bold text-text-primary">5. Histórico de Disparos Recentes</h3>
          </div>

          {whatsappConfig.logs && whatsappConfig.logs.length > 0 && (
            <button
              type="button"
              onClick={handleClearLogs}
              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpar Histórico</span>
            </button>
          )}
        </div>

        {!whatsappConfig.logs || whatsappConfig.logs.length === 0 ? (
          <div className="p-8 text-center bg-bg-dark-900 border border-border-dark rounded-xl text-text-muted text-xs">
            Nenhum disparo registrado até o momento. Faça um teste de envio acima para validar a conexão.
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto border border-border-dark rounded-xl bg-bg-dark-900">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border-dark text-[10px] font-bold text-text-secondary uppercase tracking-wider bg-bg-dark-950">
                  <th className="p-3">Horário</th>
                  <th className="p-3">Tipo</th>
                  <th className="p-3">Destinatário</th>
                  <th className="p-3">Mensagem Preview</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {whatsappConfig.logs.map((log) => (
                  <tr key={log.id} className="border-b border-border-dark/40 hover:bg-bg-dark-850/80 transition-colors">
                    <td className="p-3 text-text-muted font-mono text-[11px]">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                    </td>
                    <td className="p-3 font-bold uppercase text-[9px]">
                      <span className={`px-2 py-0.5 rounded ${
                        log.type === 'reminder' ? 'bg-blue-500/10 text-blue-400' :
                        log.type === 'billing' ? 'bg-amber-500/10 text-amber-400' :
                        log.type === 'winback' ? 'bg-purple-500/10 text-purple-400' :
                        'bg-emerald-500/10 text-emerald-400'
                      }`}>
                        {log.type === 'reminder' ? 'Lembrete' : log.type === 'billing' ? 'Cobrança' : log.type === 'winback' ? 'Reconquista' : 'Teste'}
                      </span>
                    </td>
                    <td className="p-3 text-text-primary font-semibold">
                      {log.clientName} <span className="text-text-muted font-normal text-[11px]">({log.clientPhone})</span>
                    </td>
                    <td className="p-3 text-text-secondary truncate max-w-xs text-[11px]">
                      {log.messagePreview}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col gap-1">
                        <span className={`px-2.5 py-1 rounded-lg font-bold text-[10px] inline-flex items-center gap-1 w-fit ${
                          log.status === 'success' 
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                            : 'bg-red-500/15 text-red-400 border border-red-500/30'
                        }`}>
                          {log.status === 'success' ? '✔ Enviado' : '✖ Erro'}
                        </span>
                        {log.errorMessage && (
                          <span className="text-[10px] text-red-300 font-mono leading-tight max-w-xs break-words bg-red-950/40 p-1.5 rounded border border-red-500/20">
                            {log.errorMessage}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
