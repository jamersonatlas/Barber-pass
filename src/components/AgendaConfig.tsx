import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Client, WhatsAppConfig } from '../types';
import { sendWhatsAppApiMessage, createDispatchLog } from '../services/whatsappAutomation';
import { 
  Calendar, 
  Clock, 
  Save, 
  RotateCcw,
  Check,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  Copy,
  Trash2,
  User,
  CalendarCheck,
  Pencil,
  X,
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
  History
} from 'lucide-react';

interface AgendaConfigProps {
  user: {
    uid: string;
    displayName: string;
    email: string;
    role: 'admin' | 'barber' | 'client';
  };
  triggerToast: (msg: string) => void;
  clients?: Client[];
}

// Complete list of time slots used as standard in the system
const ALL_TIME_SLOTS = [
  '07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', 
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30'
];

const DEFAULT_DAYS = [1, 2, 3, 4, 5, 6]; // Seg a Sáb
const DEFAULT_HOURS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', 
  '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30'
];

interface Weekday {
  id: number;
  name: string;
  fullName: string;
}

const WEEKDAYS: Weekday[] = [
  { id: 1, name: 'Seg', fullName: 'Segunda-feira' },
  { id: 2, name: 'Ter', fullName: 'Terça-feira' },
  { id: 3, name: 'Qua', fullName: 'Quarta-feira' },
  { id: 4, name: 'Qui', fullName: 'Quinta-feira' },
  { id: 5, name: 'Sex', fullName: 'Sexta-feira' },
  { id: 6, name: 'Sáb', fullName: 'Sábado' },
  { id: 0, name: 'Dom', fullName: 'Domingo' }
];

const getWeekParity = (dateStr: string) => {
  if (!dateStr) return 'A';
  try {
    const base = new Date('2026-01-05T12:00:00'); // First Monday of 2026
    const d = new Date(dateStr + 'T12:00:00');
    const diffTime = d.getTime() - base.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffWeeks = Math.floor(diffDays / 7);
    const parity = Math.abs(diffWeeks) % 2;
    return parity === 0 ? 'A' : 'B';
  } catch (e) {
    console.error(e);
    return 'A';
  }
};

export default function AgendaConfig({ user, triggerToast, clients = [] }: AgendaConfigProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Scheduling Configurations
  const [workingDays, setWorkingDays] = useState<number[]>(DEFAULT_DAYS);
  const [workingHours, setWorkingHours] = useState<string[]>(DEFAULT_HOURS);
  const [slotInterval, setSlotInterval] = useState<number>(30);
  const [startTimeStr, setStartTimeStr] = useState<string>('08:00');

  // Day specific hours state
  const [useDaySpecific, setUseDaySpecific] = useState<boolean>(false);
  const [daySpecificHours, setDaySpecificHours] = useState<{ [dayId: number]: string[] }>({});
  const [selectedConfigDay, setSelectedConfigDay] = useState<number>(1);
  const [showCopyPanel, setShowCopyPanel] = useState<boolean>(false);
  const [copyTargetDays, setCopyTargetDays] = useState<number[]>([]);

  // Recurring Slots State for Monthly Subscribers
  const [recurringSlots, setRecurringSlots] = useState<any[]>([]);
  const [newRecClientId, setNewRecClientId] = useState<string>('');
  const [newRecDayOfWeek, setNewRecDayOfWeek] = useState<number>(1);
  const [newRecTime, setNewRecTime] = useState<string>('09:00');
  const [newRecDuration, setNewRecDuration] = useState<'permanent' | '1m' | '3m' | '6m' | '1y'>('permanent');
  const [newRecFrequency, setNewRecFrequency] = useState<'weekly' | 'biweekly'>('weekly');
  const [newRecStartDate, setNewRecStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [barberProfile, setBarberProfile] = useState<any>(null);

  // WhatsApp Gateway & Automation State per Barbershop
  const [whatsappConfig, setWhatsappConfig] = useState<WhatsAppConfig>({
    enabled: false,
    provider: 'zapi',
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

  // Filter clients who have an active monthly subscription
  const subscriberClients = React.useMemo(() => {
    return clients.filter(c => !!c.package);
  }, [clients]);

  // Dynamically generate ALL_TIME_SLOTS based on selected slotInterval and startTimeStr
  const dynamicTimeSlots = React.useMemo(() => {
    const slots: string[] = [];
    const safeStartTime = startTimeStr || '08:00';
    const [startH, startM] = safeStartTime.split(':').map(Number);
    let currentMinutes = (isNaN(startH) ? 8 : startH) * 60 + (isNaN(startM) ? 0 : startM);
    const endMinutes = 22.5 * 60;   // up to 22:30
    
    // Ensure safe interval (cannot be <= 0, enforce min 15 mins to avoid DOM overload on weak phones)
    const safeInterval = Math.max(15, Number(slotInterval) || 30);
    
    let iterations = 0;
    while (currentMinutes <= endMinutes) {
      if (++iterations > 300) break; // Circuit breaker to absolutely prevent infinite loops / browser freezes
      const hours = Math.floor(currentMinutes / 60);
      const mins = currentMinutes % 60;
      const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
      slots.push(timeStr);
      currentMinutes += safeInterval;
    }
    return slots;
  }, [slotInterval, startTimeStr]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'barbers', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setBarberProfile(data);
          if (data.scheduleSettings) {
            setWorkingDays(data.scheduleSettings.workingDays ?? DEFAULT_DAYS);
            setWorkingHours(data.scheduleSettings.workingHours ?? DEFAULT_HOURS);
            setSlotInterval(data.scheduleSettings.slotInterval ?? 30);
            setStartTimeStr(data.scheduleSettings.startTime ?? '08:00');

            // Load day specific hours if defined
            const dsh = data.scheduleSettings.daySpecificHours;
            if (dsh && typeof dsh === 'object') {
              const parsed: { [dayId: number]: string[] } = {};
              Object.entries(dsh).forEach(([k, v]) => {
                if (Array.isArray(v)) {
                  parsed[Number(k)] = v as string[];
                }
              });
              setDaySpecificHours(parsed);
              setUseDaySpecific(true);
            } else {
              setDaySpecificHours({});
              setUseDaySpecific(false);
            }

            // Load recurring slots if defined
            const rec = data.scheduleSettings.recurringSlots;
            if (Array.isArray(rec)) {
              setRecurringSlots(rec);
            } else {
              setRecurringSlots([]);
            }

            // Load WhatsApp Config if defined
            const wa = data.scheduleSettings?.whatsappConfig || data.whatsappConfig;
            if (wa && typeof wa === 'object') {
              setWhatsappConfig({
                enabled: !!wa.enabled,
                provider: wa.provider || 'zapi',
                instanceId: wa.instanceId || '',
                token: wa.token || '',
                apiUrl: wa.apiUrl || '',
                autoRemindersEnabled: wa.autoRemindersEnabled !== false,
                autoBillingEnabled: wa.autoBillingEnabled !== false,
                autoWinbackEnabled: !!wa.autoWinbackEnabled,
                reminderHoursBefore: wa.reminderHoursBefore || 2,
                testPhone: wa.testPhone || '',
                logs: Array.isArray(wa.logs) ? wa.logs : []
              });
            }
          }
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching schedule settings:', error);
        setLoading(false);
      }
    };
    fetchSettings();
  }, [user]);

  // Adjust selected config day if working days change
  useEffect(() => {
    if (workingDays.length > 0 && !workingDays.includes(selectedConfigDay)) {
      setSelectedConfigDay(workingDays[0]);
    }
  }, [workingDays, selectedConfigDay]);

  const handleToggleDay = (dayId: number) => {
    setWorkingDays(prev => {
      const active = prev.includes(dayId);
      const next = active ? prev.filter(id => id !== dayId) : [...prev, dayId];
      
      // Auto-initialize advanced day hours if they are active
      if (!active && useDaySpecific && (!daySpecificHours[dayId] || daySpecificHours[dayId].length === 0)) {
        setDaySpecificHours(curr => ({
          ...curr,
          [dayId]: [...workingHours]
        }));
      }
      return next;
    });
  };

  // Helpers to get and set current active configuration hours (either general or day-specific)
  const getActiveHoursForConfig = () => {
    if (useDaySpecific) {
      return daySpecificHours[selectedConfigDay] ?? workingHours;
    }
    return workingHours;
  };

  const updateHoursForConfig = (newHours: string[]) => {
    if (useDaySpecific) {
      setDaySpecificHours(prev => ({
        ...prev,
        [selectedConfigDay]: newHours.sort()
      }));
    } else {
      setWorkingHours(newHours.sort());
    }
  };

  const handleToggleHour = (hour: string) => {
    const current = getActiveHoursForConfig();
    const updated = current.includes(hour) 
      ? current.filter(h => h !== hour) 
      : [...current, hour].sort();
    updateHoursForConfig(updated);
  };

  const handleStartTimeChange = (newStartTime: string) => {
    setStartTimeStr(newStartTime);
    
    // Auto-generate suggested commercial hours for the new start time & current interval
    const slots = [];
    const [startH, startM] = newStartTime.split(':').map(Number);
    let currentMinutes = startH * 60 + startM;
    const endMinutes = 22 * 60;
    
    // Ensure safe interval
    const safeInterval = Math.max(15, Number(slotInterval) || 30);
    
    let iterations = 0;
    while (currentMinutes <= endMinutes) {
      if (++iterations > 300) break; // Circuit breaker
      const hours = Math.floor(currentMinutes / 60);
      const mins = currentMinutes % 60;
      const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
      slots.push(timeStr);
      currentMinutes += safeInterval;
    }
    
    const preset = slots.filter(slot => {
      const [h, m] = slot.split(':').map(Number);
      const totalMins = h * 60 + m;
      
      const lunchStart = 12 * 60;    // 12:00
      const lunchEnd = 13 * 60;      // 13:00
      const endMins = 19.5 * 60;     // 19:30
      
      if (totalMins > endMins) return false;
      if (totalMins >= lunchStart && totalMins < lunchEnd) return false;
      return true;
    });

    updateHoursForConfig(preset);
    triggerToast(`Início alterado para às ${newStartTime}! Horários de atendimento recalculados.`);
  };

  const handleIntervalChange = (newInterval: number) => {
    setSlotInterval(newInterval);
    
    // Auto-generate suggested commercial hours for the new interval & current start time
    const slots = [];
    const [startH, startM] = startTimeStr.split(':').map(Number);
    let currentMinutes = startH * 60 + startM;
    const endMinutes = 22 * 60;
    
    // Ensure safe interval
    const safeInterval = Math.max(15, Number(newInterval) || 30);
    
    let iterations = 0;
    while (currentMinutes <= endMinutes) {
      if (++iterations > 300) break; // Circuit breaker
      const hours = Math.floor(currentMinutes / 60);
      const mins = currentMinutes % 60;
      const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
      slots.push(timeStr);
      currentMinutes += safeInterval;
    }
    
    const preset = slots.filter(slot => {
      const [h, m] = slot.split(':').map(Number);
      const totalMins = h * 60 + m;
      
      const lunchStart = 12 * 60;    // 12:00
      const lunchEnd = 13 * 60;      // 13:00
      const endMins = 19.5 * 60;     // 19:30
      
      if (totalMins > endMins) return false;
      if (totalMins >= lunchStart && totalMins < lunchEnd) return false;
      return true;
    });

    updateHoursForConfig(preset);
    triggerToast(`Intervalo de ${newInterval === 60 ? '1 hora' : newInterval + ' minutos'} configurado! Horários comerciais recomendados foram aplicados.`);
  };

  const handlePresetCommercial = () => {
    const preset = dynamicTimeSlots.filter(slot => {
      const [h, m] = slot.split(':').map(Number);
      const totalMins = h * 60 + m;
      const startMins = 8 * 60;      // 08:00
      const lunchStart = 12 * 60;    // 12:00
      const lunchEnd = 13 * 60;      // 13:00
      const endMins = 19.5 * 60;     // 19:30
      
      if (totalMins < startMins || totalMins > endMins) return false;
      if (totalMins >= lunchStart && totalMins < lunchEnd) return false;
      return true;
    });
    updateHoursForConfig(preset);
    const dayLabel = useDaySpecific ? ` para ${WEEKDAYS.find(w => w.id === selectedConfigDay)?.fullName}` : '';
    triggerToast(`Horário Comercial Padrão aplicado${dayLabel}!`);
  };

  const handlePresetSelectAll = () => {
    updateHoursForConfig(dynamicTimeSlots);
    triggerToast('Todos os horários foram ativados!');
  };

  const handlePresetClear = () => {
    updateHoursForConfig([]);
    triggerToast('Horários limpos.');
  };

  const handlePresetSelectAllDays = () => {
    setWorkingDays([1, 2, 3, 4, 5, 6, 0]);
    triggerToast('Todos os dias ativados!');
  };

  const handleSave = async () => {
    if (workingDays.length === 0) {
      triggerToast('Atenção: Selecione ao menos um dia de trabalho!');
      return;
    }
    
    if (useDaySpecific) {
      // Validate that at least one working day has active slots
      const hasAnyHours = workingDays.some(dayId => {
        const slots = daySpecificHours[dayId];
        return slots && slots.length > 0;
      });
      if (!hasAnyHours) {
        triggerToast('Atenção: Selecione ao menos um horário de atendimento em algum dos dias ativos!');
        return;
      }
    } else {
      if (workingHours.length === 0) {
        triggerToast('Atenção: Selecione ao menos um horário de atendimento!');
        return;
      }
    }

    setSaving(true);
    try {
      const docRef = doc(db, 'barbers', user.uid);
      const scheduleSettings: any = {
        workingDays,
        workingHours,
        slotInterval,
        startTime: startTimeStr,
        recurringSlots: recurringSlots,
        whatsappConfig: whatsappConfig
      };

      if (useDaySpecific) {
        const filteredDsh: { [dayId: number]: string[] } = {};
        workingDays.forEach(dayId => {
          filteredDsh[dayId] = daySpecificHours[dayId] ?? workingHours;
        });
        scheduleSettings.daySpecificHours = filteredDsh;
      } else {
        scheduleSettings.daySpecificHours = null;
      }

      await updateDoc(docRef, {
        scheduleSettings
      });
      triggerToast('Configuração de expediente e automação salvas com sucesso!');
    } catch (err) {
      console.error('Error saving schedule config:', err);
      triggerToast('Falha ao conectar com o banco de dados.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestWhatsAppMessage = async () => {
    if (!whatsappConfig.testPhone) {
      triggerToast('Atenção: Por favor, digite o número de telefone com DDD para realizar o teste.');
      return;
    }
    if (!whatsappConfig.instanceId || !whatsappConfig.token) {
      triggerToast('Atenção: Por favor, preencha o ID/Sessão da Instância e a Chave/Token da API.');
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

    const updatedLogs = [newLog, ...(whatsappConfig.logs || [])].slice(0, 30);
    const updatedConfig = { ...whatsappConfig, logs: updatedLogs };
    setWhatsappConfig(updatedConfig);

    try {
      const docRef = doc(db, 'barbers', user.uid);
      await updateDoc(docRef, {
        'scheduleSettings.whatsappConfig': updatedConfig
      });
    } catch (e) {
      console.error('Error updating whatsapp log in db:', e);
    }

    if (res.success) {
      triggerToast('✅ Mensagem de teste enviada com sucesso no WhatsApp!');
    } else {
      triggerToast(`❌ Falha no envio: ${res.error || 'Verifique as credenciais da API'}`);
    }
  };

  const calculateExpiryDate = (duration: string) => {
    if (duration === 'permanent') return null;
    const today = new Date();
    if (duration === '1m') {
      today.setMonth(today.getMonth() + 1);
    } else if (duration === '3m') {
      today.setMonth(today.getMonth() + 3);
    } else if (duration === '6m') {
      today.setMonth(today.getMonth() + 6);
    } else if (duration === '1y') {
      today.setFullYear(today.getFullYear() + 1);
    }
    return today.toISOString().split('T')[0]; // YYYY-MM-DD
  };

  const handleEditRecurringSlot = (slot: any) => {
    setEditingSlotId(slot.id);
    setNewRecClientId(slot.clientId);
    setNewRecDayOfWeek(slot.dayOfWeek);
    setNewRecTime(slot.time);
    setNewRecDuration(slot.duration || 'permanent');
    setNewRecFrequency(slot.frequency || 'weekly');
    setNewRecStartDate(slot.startDate || new Date().toISOString().split('T')[0]);
    
    // Scroll smoothly to the edit form or show a visual hint
    const element = document.getElementById('fixed-slots-form-section');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleCancelEditRecurringSlot = () => {
    setEditingSlotId(null);
    setNewRecClientId('');
    setNewRecDayOfWeek(1);
    setNewRecTime('09:00');
    setNewRecDuration('permanent');
    setNewRecFrequency('weekly');
    setNewRecStartDate(new Date().toISOString().split('T')[0]);
  };

  const handleAddRecurringSlot = async () => {
    if (!newRecClientId) {
      triggerToast('Atenção: Por favor, selecione um cliente mensalista.');
      return;
    }

    const client = clients.find(c => c.id === newRecClientId);
    if (!client) {
      triggerToast('Atenção: Cliente inválido.');
      return;
    }

    // 1. Prevent duplicate reservation of the EXACT SAME client on the exact same day & time
    const isSameClientDuplicate = recurringSlots.some(slot => {
      if (editingSlotId && slot.id === editingSlotId) {
        return false;
      }
      return slot.clientId === client.id && slot.dayOfWeek === newRecDayOfWeek && slot.time === newRecTime;
    });

    if (isSameClientDuplicate) {
      triggerToast(`Atenção: O cliente ${client.name} já possui uma reserva ativa neste mesmo dia e horário.`);
      return;
    }

    // 2. Check if another client is already booked at this time slot to inform about double/simultaneous booking
    const sameTimeOtherSlots = recurringSlots.filter(slot => {
      if (editingSlotId && slot.id === editingSlotId) {
        return false;
      }
      if (slot.dayOfWeek !== newRecDayOfWeek || slot.time !== newRecTime) {
        return false;
      }
      const slotFreq = slot.frequency || 'weekly';
      if (slotFreq === 'weekly' || newRecFrequency === 'weekly') {
        return true;
      }
      const p1 = getWeekParity(slot.startDate || '2026-01-05');
      const p2 = getWeekParity(newRecStartDate);
      return p1 === p2;
    });

    const isSimultaneous = sameTimeOtherSlots.length > 0;

    const expiryDate = calculateExpiryDate(newRecDuration);
    
    let updatedSlots;
    if (editingSlotId) {
      updatedSlots = recurringSlots.map(s => {
        if (s.id === editingSlotId) {
          return {
            ...s,
            clientId: client.id,
            clientName: client.name,
            clientPhone: client.phone || '',
            clientPackage: client.package || 'Mensalista',
            dayOfWeek: newRecDayOfWeek,
            time: newRecTime,
            duration: newRecDuration,
            frequency: newRecFrequency,
            startDate: newRecStartDate,
            expiryDate
          };
        }
        return s;
      });
    } else {
      const newSlot = {
        id: Math.random().toString(36).substr(2, 9),
        clientId: client.id,
        clientName: client.name,
        clientPhone: client.phone || '',
        clientPackage: client.package || 'Mensalista',
        dayOfWeek: newRecDayOfWeek,
        time: newRecTime,
        duration: newRecDuration,
        frequency: newRecFrequency,
        startDate: newRecStartDate,
        expiryDate
      };
      updatedSlots = [...recurringSlots, newSlot];
    }

    setRecurringSlots(updatedSlots);

    try {
      const docRef = doc(db, 'barbers', user.uid);
      await updateDoc(docRef, {
        'scheduleSettings.recurringSlots': updatedSlots
      });
      if (editingSlotId) {
        triggerToast(`Horário fixo de ${client.name} alterado com sucesso!${isSimultaneous ? ' (Agendamento simultâneo ativo)' : ''}`);
      } else {
        triggerToast(`Horário fixo de ${client.name} reservado com sucesso!${isSimultaneous ? ' (Agendamento simultâneo ativo)' : ''}`);
      }
      // Reset form & state
      setNewRecClientId('');
      setEditingSlotId(null);
    } catch (err) {
      console.error('Error saving recurring slot:', err);
      triggerToast('Falha ao gravar reserva recorrente no banco de dados.');
    }
  };

  const handleRemoveRecurringSlot = async (slotId: string) => {
    const updatedSlots = recurringSlots.filter(s => s.id !== slotId);
    setRecurringSlots(updatedSlots);

    try {
      const docRef = doc(db, 'barbers', user.uid);
      await updateDoc(docRef, {
        'scheduleSettings.recurringSlots': updatedSlots
      });
      if (editingSlotId === slotId) {
        handleCancelEditRecurringSlot();
      }
      triggerToast('Reserva fixa removida com sucesso!');
    } catch (err) {
      console.error('Error removing recurring slot:', err);
      triggerToast('Erro ao remover reserva fixa no banco de dados.');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-bg-dark-900 self-center">
        <div className="w-10 h-10 border-4 border-brand-amber border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-text-secondary text-xs font-semibold">Carregando configurações da agenda...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full overflow-hidden animate-fade-in font-sans text-text-primary">
      {/* Header Bar */}
      <div className="px-4 md:px-6 py-3.5 md:py-4.5 border-b border-border-dark bg-bg-dark-800 flex items-center justify-between shrink-0 shadow gap-4 select-none">
        <div>
          <h2 className="font-display font-medium text-lg md:text-2xl text-text-primary flex items-center gap-2">
            <span>📅</span>
            <span>Configurações da Agenda</span>
          </h2>
          <p className="text-[9px] md:text-xs text-text-muted mt-0.5 leading-relaxed">
            Defina em quais dias da semana e horários específicos seus clientes poderão realizar agendamentos.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-brand-amber hover:bg-brand-amber-hover disabled:bg-opacity-50 text-[#1a0e00] font-sans font-bold text-xs px-3 md:px-4 py-2 md:py-2.5 rounded-xl cursor-pointer shadow transition-all shrink-0 active:scale-95"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-[#1a0e00] border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <Save className="w-4 h-4" />
          )}
          <span>{saving ? 'Gravando...' : 'Salvar Alterações'}</span>
        </button>
      </div>

      {/* Settings Scrollable Panel */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-5 md:space-y-6 max-w-4xl w-full mx-auto">
        
        {/* Info advice box */}
        <div className="bg-[#c5a880]/5 border border-[#c5a880]/30 rounded-2xl p-4 flex gap-3 text-text-secondary">
          <AlertCircle className="w-5 h-5 text-brand-amber shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed space-y-1">
            <p className="font-bold text-text-primary">Funcionamento do Bloqueio Dinâmico:</p>
            <p>
              Os clientes que acessarem seu link profissional só verão os dias da semana e horários ativados abaixo. Quando um horário for reservado por um cliente, ele ficará automaticamente indisponível para outros agendamentos.
            </p>
          </div>
        </div>

        {/* Section 1: Working Days */}
        <div className="bg-bg-dark-850 border border-border-dark rounded-2xl p-5 md:p-6 space-y-4 shadow-lg">
          <div className="flex items-center justify-between border-b border-border-dark/60 pb-3">
            <div className="flex items-center gap-2.5">
              <Calendar className="w-5 h-5 text-brand-amber" />
              <div>
                <h3 className="text-sm font-bold text-text-primary">Dias de Expediente</h3>
                <p className="text-[10px] text-text-secondary">Ative os dias da semana em que os agendamentos são aceitos</p>
              </div>
            </div>
            
            <button
              onClick={handlePresetSelectAllDays}
              className="text-[10px] font-bold text-brand-amber hover:underline px-2 py-1 rounded"
            >
              Ativar Todos os Dias
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
            {WEEKDAYS.map(day => {
              const active = workingDays.includes(day.id);
              return (
                <button
                  type="button"
                  key={day.id}
                  onClick={() => handleToggleDay(day.id)}
                  className={`p-3.5 rounded-xl border flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                    active 
                      ? 'bg-[#c5a880]/15 border-brand-amber text-brand-amber font-bold ring-1 ring-brand-amber/30'
                      : 'bg-bg-dark-900 border-border-dark text-text-muted hover:border-text-secondary hover:text-text-primary'
                  }`}
                >
                  <span className="text-xs uppercase tracking-wider font-bold mb-1">{day.name}</span>
                  <span className="text-[10px] opacity-75">{active ? 'Ativo' : 'Fechado'}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 1.5: Start Time & Interval selector choice */}
        <div className="bg-bg-dark-850 border border-border-dark rounded-2xl p-5 md:p-6 space-y-5 shadow-lg">
          <div className="border-b border-border-dark/60 pb-3">
            <div className="flex items-center gap-2.5">
              <Clock className="w-5 h-5 text-brand-amber" />
              <div>
                <h3 className="text-sm font-bold text-text-primary">Início e Intervalo dos Horários</h3>
                <p className="text-[10px] text-text-secondary">Defina o momento de início do seu expediente e a duração média de cada atendimento</p>
              </div>
            </div>
          </div>

          {/* Part A: Start Time */}
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-wider font-bold text-text-secondary block">
              1. Horário que você inicia o Expediente:
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {['07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00'].map(time => {
                const isSelected = startTimeStr === time;
                return (
                  <button
                    type="button"
                    key={time}
                    onClick={() => handleStartTimeChange(time)}
                    className={`py-2 rounded-xl border text-xs font-semibold text-center cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[#c5a880]/20 border-brand-amber text-brand-amber font-bold ring-1 ring-brand-amber/35'
                        : 'bg-bg-dark-900 border-border-dark text-text-muted hover:border-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {time}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Part B: Interval / Duration */}
          <div className="space-y-2 pt-2 border-t border-border-dark/30">
            <label className="text-[11px] uppercase tracking-wider font-bold text-text-secondary block">
              2. Duração / Intervalo sugerido (Tempo de cada serviço):
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 30, label: '30 min', desc: 'Sair de 30 em 30' },
                { value: 45, label: '45 min', desc: 'Sair de 45 em 45' },
                { value: 60, label: '1 hora', desc: 'De hora em hora' },
              ].map(opt => {
                const isActive = slotInterval === opt.value;
                return (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => handleIntervalChange(opt.value)}
                    className={`p-3 md:p-4 rounded-xl border flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                      isActive
                        ? 'bg-[#c5a880]/15 border-brand-amber text-brand-amber font-bold ring-1 ring-brand-amber/35'
                        : 'bg-bg-dark-900 border-border-dark text-text-muted hover:border-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <span className="text-xs md:text-sm uppercase tracking-wider font-bold">{opt.label}</span>
                    <span className="text-[9px] text-text-muted mt-0.5">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-text-muted leading-relaxed mt-1">
              * Ao alterar o Horário de Início ou o Intervalo, a lista abaixo sugerirá novos horários ideais de expediente comercial. Você poderá ajustá-los livremente clicando neles.
            </p>
          </div>
        </div>

        {/* Section 2: Active Working Hours */}
        <div className="bg-bg-dark-850 border border-border-dark rounded-2xl p-5 md:p-6 space-y-5 shadow-lg">
          
          {/* Mode Switcher Block */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-bg-dark-900 border border-border-dark p-4 rounded-2xl">
            <div>
              <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">Modo de Configuração de Expediente</h4>
              <p className="text-[10px] text-text-secondary mt-0.5 leading-normal">Escolha se quer os mesmos horários para todos os dias úteis ou uma grade customizada por dia da semana.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setUseDaySpecific(false);
                  triggerToast("Modo de Grade Única ativado!");
                }}
                className={`px-3 py-2 text-[11px] font-bold rounded-xl border transition-all cursor-pointer ${
                  !useDaySpecific
                    ? 'bg-brand-amber text-[#1a0e00] border-brand-amber shadow'
                    : 'bg-bg-dark-850 border-border-dark text-text-muted hover:text-text-primary'
                }`}
              >
                Grade Única (Igual)
              </button>
              <button
                type="button"
                onClick={() => {
                  // Enable day specific hours, copying current workingHours to any days that don't have hours yet
                  const initial = { ...daySpecificHours };
                  workingDays.forEach(d => {
                    if (!initial[d] || initial[d].length === 0) {
                      initial[d] = [...workingHours];
                    }
                  });
                  setDaySpecificHours(initial);
                  setUseDaySpecific(true);
                  triggerToast("Modo de Grade Avançada por dia ativado!");
                }}
                className={`px-3 py-2 text-[11px] font-bold rounded-xl border transition-all cursor-pointer ${
                  useDaySpecific
                    ? 'bg-brand-amber text-[#1a0e00] border-brand-amber shadow'
                    : 'bg-bg-dark-850 border-border-dark text-text-muted hover:text-text-primary'
                }`}
              >
                Grade por Dia ⚙️
              </button>
            </div>
          </div>

          {/* Day specific tabs and copy helper */}
          {useDaySpecific && (
            <div className="flex flex-col gap-3 pt-1">
              <div className="flex items-center justify-between border-b border-border-dark/40 pb-2">
                <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                  Selecione o dia para customizar os horários:
                </span>
                
                {/* Copy button */}
                <button
                  type="button"
                  onClick={() => {
                    setCopyTargetDays([]);
                    setShowCopyPanel(!showCopyPanel);
                  }}
                  className="flex items-center gap-1 text-[10px] font-bold text-brand-amber hover:underline px-2.5 py-1.5 bg-bg-dark-900 border border-border-dark rounded-xl cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copiar horários deste dia...</span>
                </button>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map(day => {
                  const isActiveInWeek = workingDays.includes(day.id);
                  const isSelected = selectedConfigDay === day.id;
                  if (!isActiveInWeek) return null;
                  
                  const dayHoursCount = (daySpecificHours[day.id] ?? workingHours).length;
                  
                  return (
                    <button
                      type="button"
                      key={day.id}
                      onClick={() => {
                        setSelectedConfigDay(day.id);
                        setShowCopyPanel(false);
                      }}
                      className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all flex flex-col items-center gap-0.5 min-w-[70px] cursor-pointer ${
                        isSelected
                          ? 'bg-brand-amber/10 border-brand-amber text-brand-amber ring-1 ring-brand-amber/35 shadow-sm'
                          : 'bg-bg-dark-900 border-border-dark text-text-muted hover:border-text-secondary'
                      }`}
                    >
                      <span>{day.fullName}</span>
                      <span className={`text-[9px] ${isSelected ? 'text-brand-amber/95' : 'text-text-muted'} font-normal`}>
                        {dayHoursCount} ativos
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Copy Sub-panel */}
              {showCopyPanel && (
                <div className="bg-bg-dark-900 border border-border-dark rounded-2xl p-4 space-y-3.5 mt-1 animate-slide-up">
                  <div className="flex items-center justify-between">
                    <h5 className="text-[11px] font-bold text-text-primary uppercase tracking-wider">
                      Copiar horários de <span className="text-brand-amber font-extrabold">{WEEKDAYS.find(w => w.id === selectedConfigDay)?.fullName}</span> para os dias:
                    </h5>
                    <button
                      type="button"
                      onClick={() => setShowCopyPanel(false)}
                      className="text-[10px] text-text-muted hover:text-text-primary font-bold"
                    >
                      Fechar
                    </button>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map(day => {
                      const isActiveInWeek = workingDays.includes(day.id);
                      const isOriginDay = selectedConfigDay === day.id;
                      if (!isActiveInWeek || isOriginDay) return null;
                      
                      const isChecked = copyTargetDays.includes(day.id);
                      return (
                        <button
                          type="button"
                          key={day.id}
                          onClick={() => {
                            setCopyTargetDays(prev =>
                              prev.includes(day.id) ? prev.filter(id => id !== day.id) : [...prev, day.id]
                            );
                          }}
                          className={`px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-all cursor-pointer ${
                            isChecked
                              ? 'bg-[#c5a880]/20 border-brand-amber text-brand-amber font-bold ring-1 ring-brand-amber/30'
                              : 'bg-bg-dark-850 border-border-dark text-text-muted hover:text-text-primary'
                          }`}
                        >
                          {day.fullName}
                        </button>
                      );
                    })}
                  </div>
                  
                  <div className="flex justify-end gap-3 pt-2 border-t border-border-dark/30">
                    <button
                      type="button"
                      onClick={() => {
                        const otherDays = workingDays.filter(id => id !== selectedConfigDay);
                        setCopyTargetDays(otherDays);
                      }}
                      className="text-[10px] font-bold text-text-muted hover:text-text-primary px-2 py-1"
                    >
                      Selecionar Todos
                    </button>
                    
                    <button
                      type="button"
                      disabled={copyTargetDays.length === 0}
                      onClick={() => {
                        const currentHours = daySpecificHours[selectedConfigDay] ?? workingHours;
                        const updated = { ...daySpecificHours };
                        copyTargetDays.forEach(dayId => {
                          updated[dayId] = [...currentHours];
                        });
                        setDaySpecificHours(updated);
                        setShowCopyPanel(false);
                        setCopyTargetDays([]);
                        triggerToast(`Horários de ${WEEKDAYS.find(w => w.id === selectedConfigDay)?.fullName} copiados com sucesso para os dias selecionados!`);
                      }}
                      className="bg-brand-amber hover:bg-brand-amber-hover text-[#1a0e00] font-bold text-[10px] px-3 py-1.5 rounded-xl transition-colors cursor-pointer disabled:opacity-40"
                    >
                      Confirmar e Copiar ({copyTargetDays.length})
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border-dark/60 pb-3 gap-3 pt-2">
            <div className="flex items-center gap-2.5">
              <Clock className="w-5 h-5 text-brand-amber" />
              <div>
                <h3 className="text-sm font-bold text-text-primary">
                  {useDaySpecific 
                    ? `Horários de ${WEEKDAYS.find(w => w.id === selectedConfigDay)?.fullName}`
                    : 'Horários de Atendimento'
                  }
                </h3>
                <p className="text-[10px] text-text-secondary">Ative os horários de início de cada sessão (Clique para marcar/desmarcar)</p>
              </div>
            </div>
 
            {/* Presets and template buttons for convenience */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={handlePresetCommercial}
                className="text-[10px] font-bold bg-bg-dark-800 border border-border-dark text-text-secondary hover:text-text-primary px-2.5 py-1.5 rounded-lg hover:border-text-muted transition-colors cursor-pointer"
                title="Aplica horário padrão comercial para a grade ativa"
              >
                Horário Comercial
              </button>
              <button
                type="button"
                onClick={handlePresetSelectAll}
                className="text-[10px] font-bold bg-bg-dark-800 border border-border-dark text-text-secondary hover:text-text-primary px-2.5 py-1.5 rounded-lg hover:border-text-muted transition-colors cursor-pointer"
              >
                Ativar Todos
              </button>
              <button
                type="button"
                onClick={handlePresetClear}
                className="text-[10px] font-bold bg-bg-dark-800 border border-border-dark text-brand-danger-text hover:bg-brand-danger/10 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                Limpar Todos
              </button>
            </div>
          </div>
 
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {(() => {
              // Extract active hours and pre-compute a Set for O(1) lookups outside the loop
              const activeHours = useDaySpecific ? (daySpecificHours[selectedConfigDay] ?? []) : workingHours;
              const activeSet = new Set(activeHours);
              
              return dynamicTimeSlots.map(hour => {
                const active = activeSet.has(hour);
                return (
                  <button
                    type="button"
                    key={hour}
                    onClick={() => handleToggleHour(hour)}
                    className={`py-2.5 rounded-lg border text-xs font-bold text-center cursor-pointer transition-all ${
                      active
                        ? 'bg-brand-amber/10 border-brand-amber text-brand-amber shadow'
                        : 'bg-bg-dark-900 border-border-dark text-text-muted hover:border-text-secondary hover:bg-bg-dark-800'
                    }`}
                  >
                    {hour}
                  </button>
                );
              });
            })()}
          </div>
 
          <div className="pt-2 text-center">
            <span className="text-[10px] text-text-muted font-semibold tracking-wide">
              Total de slots ativos {useDaySpecific ? `na ${WEEKDAYS.find(w => w.id === selectedConfigDay)?.fullName}` : ''}: <span className="text-brand-amber font-extrabold">{useDaySpecific ? (daySpecificHours[selectedConfigDay] ?? []).length : workingHours.length}</span>
            </span>
          </div>
        </div>

        {/* Section 3: Subscriber Fixed / Recurring Schedules */}
        <div className="bg-bg-dark-850 border border-border-dark rounded-2xl p-5 md:p-6 space-y-5 shadow-lg">
          <div className="border-b border-border-dark/60 pb-3">
            <div className="flex items-center gap-2.5">
              <CalendarCheck className="w-5 h-5 text-brand-amber" />
              <div>
                <h3 className="text-sm font-bold text-text-primary">Horários Fixos (Mensalistas / Assinantes)</h3>
                <p className="text-[10px] text-text-secondary">Reserve horários fixos na semana para clientes com assinatura mensal. Esses horários estarão permanentemente reservados e bloqueados para outros clientes.</p>
              </div>
            </div>
          </div>

          {/* Form to Add Recurring Slot */}
          <div id="fixed-slots-form-section" className="bg-bg-dark-900 border border-border-dark rounded-xl p-4 space-y-4 scroll-mt-6">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                {editingSlotId ? 'Editar Horário Fixo' : 'Reservar Novo Horário Fixo'}
              </h4>
              {editingSlotId && (
                <span className="text-[10px] bg-brand-amber/15 text-brand-amber border border-brand-amber/30 px-2 py-0.5 rounded-full font-bold animate-pulse">
                  Modo Edição Ativo
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {/* Subscriber Select */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-text-secondary uppercase">Cliente Mensalista</label>
                <select
                  value={newRecClientId}
                  onChange={(e) => setNewRecClientId(e.target.value)}
                  className="w-full h-10 text-xs bg-bg-dark-800 border border-border-dark rounded-xl cursor-pointer text-text-primary px-2 font-medium"
                >
                  <option value="">Selecione um cliente...</option>
                  {subscriberClients.length === 0 ? (
                    <option disabled>Nenhum cliente com plano mensal cadastrado</option>
                  ) : (
                    subscriberClients.map(c => {
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
                        <option key={c.id} value={c.id}>
                          {c.name} ({getPlanName(c.package)})
                        </option>
                      );
                    })
                  )}
                </select>
              </div>

              {/* Day Select */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-text-secondary uppercase">Dia da Semana</label>
                <select
                  value={newRecDayOfWeek}
                  onChange={(e) => setNewRecDayOfWeek(Number(e.target.value))}
                  className="w-full h-10 text-xs bg-bg-dark-800 border border-border-dark rounded-xl cursor-pointer text-text-primary px-2 font-medium"
                >
                  {WEEKDAYS.map(day => (
                    <option key={day.id} value={day.id}>{day.fullName}</option>
                  ))}
                </select>
              </div>

              {/* Time Select */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-text-secondary uppercase">Horário</label>
                <select
                  value={newRecTime}
                  onChange={(e) => setNewRecTime(e.target.value)}
                  className="w-full h-10 text-xs bg-bg-dark-800 border border-border-dark rounded-xl cursor-pointer text-text-primary px-2 font-medium"
                >
                  {dynamicTimeSlots.map(time => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </div>

              {/* Frequency Select */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-text-secondary uppercase">Frequência</label>
                <select
                  value={newRecFrequency}
                  onChange={(e) => setNewRecFrequency(e.target.value as any)}
                  className="w-full h-10 text-xs bg-bg-dark-800 border border-border-dark rounded-xl cursor-pointer text-text-primary px-2 font-medium"
                >
                  <option value="weekly">Semanal (Toda semana)</option>
                  <option value="biweekly">Quinzenal (De 2 em 2 semanas)</option>
                </select>
              </div>

              {/* Duration/Period Select */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-text-secondary uppercase">Período de Reserva</label>
                <select
                  value={newRecDuration}
                  onChange={(e) => setNewRecDuration(e.target.value as any)}
                  className="w-full h-10 text-xs bg-bg-dark-800 border border-border-dark rounded-xl cursor-pointer text-text-primary px-2 font-medium"
                >
                  <option value="permanent">Permanente (Sem prazo)</option>
                  <option value="1m">Válido por 1 Mês (4 semanas)</option>
                  <option value="3m">Válido por 3 Meses (12 semanas)</option>
                  <option value="6m">Válido por 6 Meses (24 semanas)</option>
                  <option value="1y">Válido por 1 Ano (52 semanas)</option>
                </select>
              </div>

              {/* Start Date Select */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-text-secondary uppercase">A Partir do Dia</label>
                <input
                  type="date"
                  value={newRecStartDate}
                  onChange={(e) => setNewRecStartDate(e.target.value)}
                  className="w-full h-10 text-xs bg-bg-dark-800 border border-border-dark rounded-xl text-text-primary px-3 font-medium outline-none font-sans"
                />
              </div>
            </div>

            {newRecFrequency === 'biweekly' && (
              <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl space-y-2 text-left">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs">
                  <span>📅</span>
                  <span>Organizador de Grade Quinzenal (Alternância)</span>
                </div>
                <p className="text-[11px] text-text-secondary leading-relaxed">
                  O cliente iniciará na <span className="font-bold text-indigo-400 underline">Semana {getWeekParity(newRecStartDate)}</span>. 
                  Para preencher este mesmo horário na semana alternada (uma semana sim, uma semana não) com outro cliente, o início dele deve ser agendado na <span className="font-bold text-emerald-400">Semana {getWeekParity(newRecStartDate) === 'A' ? 'B' : 'A'}</span>.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const current = new Date(newRecStartDate + 'T12:00:00');
                    current.setDate(current.getDate() + 7);
                    const yyyy = current.getFullYear();
                    const mm = String(current.getMonth() + 1).padStart(2, '0');
                    const dd = String(current.getDate()).padStart(2, '0');
                    setNewRecStartDate(`${yyyy}-${mm}-${dd}`);
                    triggerToast(`Data alterada para alternar semana! Nova data de início: ${dd}/${mm}/${yyyy}`);
                  }}
                  className="w-full sm:w-auto mt-1 px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/35 text-indigo-300 font-bold rounded-lg border border-indigo-500/30 text-[10px] cursor-pointer transition-all active:scale-95 text-center flex items-center justify-center gap-1.5"
                >
                  🔄 Alternar Semana de Início (+7 dias para Semana {getWeekParity(newRecStartDate) === 'A' ? 'B' : 'A'})
                </button>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              {editingSlotId && (
                <button
                  type="button"
                  onClick={handleCancelEditRecurringSlot}
                  className="px-4 py-2 bg-bg-dark-800 hover:bg-bg-dark-750 text-text-secondary font-semibold text-xs rounded-xl flex items-center gap-2 border border-border-dark cursor-pointer transition-all active:scale-95"
                >
                  <X className="w-4 h-4" />
                  <span>Cancelar Edição</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleAddRecurringSlot}
                className="btn bg-brand-amber hover:bg-brand-amber-hover text-[#1a0e00] font-semibold text-xs py-2 px-4 rounded-xl flex items-center gap-2 cursor-pointer shadow transition-all active:scale-95"
              >
                {editingSlotId ? <Check className="w-4 h-4" /> : <CalendarCheck className="w-4 h-4" />}
                <span>{editingSlotId ? 'Salvar Alterações do Horário' : 'Confirmar e Reservar Horário Fixo'}</span>
              </button>
            </div>
          </div>

          {/* Reserved Slots List */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">Sua Grade de Horários Reservados</h4>
            {recurringSlots.length === 0 ? (
              <div className="bg-bg-dark-900 border border-border-dark rounded-xl p-6 text-center">
                <p className="text-xs text-text-muted">Nenhum horário fixo cadastrado para mensalistas no momento.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-border-dark rounded-xl bg-bg-dark-900">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border-dark text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                      <th className="p-3">Cliente</th>
                      <th className="p-3">Dia da Semana</th>
                      <th className="p-3">Horário</th>
                      <th className="p-3">Frequência</th>
                      <th className="p-3">Duração</th>
                      <th className="p-3">Início / Validade</th>
                      <th className="p-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recurringSlots.map((slot) => {
                      const weekday = WEEKDAYS.find(w => w.id === slot.dayOfWeek);
                      const isExpired = slot.expiryDate ? (new Date().toISOString().split('T')[0] > slot.expiryDate) : false;
                      const freqLabel = slot.frequency === 'biweekly' ? 'De 2 em 2 semanas' : 'Toda semana';
                      const simultaneousCount = recurringSlots.filter(s => s.dayOfWeek === slot.dayOfWeek && s.time === slot.time).length;
                      
                      return (
                        <tr key={slot.id} className="border-b border-border-dark/60 hover:bg-bg-dark-850 transition-colors">
                          <td className="p-3 font-medium text-text-primary">
                            <div className="flex flex-col">
                              <span>{slot.clientName}</span>
                              <span className="text-[10px] text-text-muted">{slot.clientPackage}</span>
                            </div>
                          </td>
                          <td className="p-3 text-text-primary font-semibold">
                            {weekday ? weekday.fullName : `Dia ${slot.dayOfWeek}`}
                          </td>
                          <td className="p-3 text-brand-amber font-bold text-sm">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{slot.time}</span>
                              {simultaneousCount > 1 && (
                                <span 
                                  className="px-1.5 py-0.5 text-[9px] bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded font-semibold tracking-tight"
                                  title={`${simultaneousCount} clientes fixos agendados neste dia e horário`}
                                >
                                  {simultaneousCount}x Simultâneo
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <span className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border flex items-center gap-1.5 w-fit ${
                              slot.frequency === 'biweekly'
                                ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                                : 'bg-brand-amber/10 text-brand-amber border-brand-amber/20'
                            }`}>
                              <span>{freqLabel}</span>
                              {slot.frequency === 'biweekly' && (
                                <span className="bg-indigo-500/20 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider text-indigo-300 font-extrabold">
                                  Semana {getWeekParity(slot.startDate)}
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="p-3 text-text-secondary">
                            {slot.duration === 'permanent' ? 'Sem limite' : 
                             slot.duration === '1m' ? '1 Mês' : 
                             slot.duration === '3m' ? '3 Meses' : 
                             slot.duration === '6m' ? '6 Meses' : '1 Ano'}
                          </td>
                          <td className="p-3 text-text-muted">
                            <div className="flex flex-col text-[10px]">
                              <span>Início: {slot.startDate || 'Não informado'}</span>
                              <span>
                                Validade:{' '}
                                {slot.expiryDate ? (
                                  <span className={isExpired ? 'text-brand-danger-text font-bold' : 'text-text-secondary font-bold'}>
                                    {slot.expiryDate} {isExpired ? '(Expirado)' : ''}
                                  </span>
                                ) : (
                                  <span className="text-text-muted font-normal">Permanente</span>
                                )}
                              </span>
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleEditRecurringSlot(slot)}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                  editingSlotId === slot.id
                                    ? 'bg-brand-amber text-[#1a0e00] font-bold'
                                    : 'bg-brand-amber/10 text-brand-amber hover:bg-brand-amber/25'
                                }`}
                                title="Editar horário reservado"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm(`Deseja remover a reserva de horário fixo de ${slot.clientName} (${weekday?.fullName} às ${slot.time})?`)) {
                                    handleRemoveRecurringSlot(slot.id);
                                  }
                                }}
                                className="p-1.5 bg-brand-danger/10 text-brand-danger-text rounded-lg hover:bg-brand-danger/25 transition-colors cursor-pointer"
                                title="Remover horário reservado"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Section 4: Link to Dedicated WhatsApp Automation Screen */}
        <div id="whatsapp-automation-section" className="bg-bg-dark-850 border border-border-dark rounded-2xl p-5 md:p-6 space-y-4 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <span>Automação de WhatsApp da Barbearia</span>
                </h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  Configure o disparo de mensagens, chaves de API, lembretes de horários e cobranças automáticas na tela dedicada do sistema.
                </p>
              </div>
            </div>
            
            <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold rounded-xl self-start sm:self-auto">
              Disponível no Menu "Automação"
            </span>
          </div>
        </div>

        {/* Outer Save Footer */}
        <div className="flex justify-end pt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-brand-amber hover:bg-brand-amber-hover disabled:bg-opacity-50 text-[#1a0e00] font-sans font-bold text-xs px-6 py-3.5 rounded-xl cursor-pointer shadow-lg transition-all transform active:scale-95"
          >
            {saving ? (
              <div className="w-5 h-5 border-2 border-[#1a0e00] border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <Check className="w-5 h-5 font-bold" />
            )}
            <span>{saving ? 'Gravando configurações...' : 'Salvar e Aplicar Expediente'}</span>
          </button>
        </div>

      </div>
    </div>
  );
}
