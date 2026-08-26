import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  deleteDoc,
  setDoc,
  query,
  where
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  Calendar, 
  Clock, 
  User as UserIcon, 
  Phone, 
  Scissors, 
  Search, 
  Copy, 
  Check, 
  Trash2, 
  MessageSquare,
  HelpCircle,
  TrendingUp,
  Award,
  CheckCircle2,
  AlertTriangle,
  UserX,
  X,
  Plus
} from 'lucide-react';
import { Client } from '../types';
import { todayDate } from '../utils';

interface AppointmentProps {
  user: {
    uid: string;
    displayName: string;
    email: string;
    role: 'admin' | 'barber' | 'client';
  };
  clients?: Client[];
  triggerToast: (msg: string) => void;
  openConfirmModal: (title: string, message: string, onConfirm: () => void) => void;
  featureAlertsEnabled?: boolean;
}

interface BookingRecord {
  id: string;
  barbeariaId?: string;
  barberId: string;
  barberName: string;
  serviceId: string;
  serviceName: string;
  serviceValue: number;
  date: string;
  time: string;
  clientName: string;
  clientPhone: string;
  createdAt: string;
  status?: string;
  completedAt?: string;
  paymentStatus?: string;
  paymentMethod?: string;
}

export default function Appointments({ user, clients = [], triggerToast, openConfirmModal, featureAlertsEnabled = true }: AppointmentProps) {
  const todayStr = todayDate();
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showOnlyPendingPast, setShowOnlyPendingPast] = useState(false);
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>(todayStr);
  const [barbeariaInfo, setBarbeariaInfo] = useState<any | null>(null);

  // Normalization helpers
  const normalizeDate = (d: string) => {
    if (!d) return '';
    const trimmed = d.trim();
    if (trimmed.includes('/')) {
      const parts = trimmed.split('/');
      if (parts.length === 3 && parts[2].length === 4) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    return trimmed;
  };

  const normalizeTime = (t: string) => {
    if (!t) return '';
    return t.trim().slice(0, 5);
  };

  // Time Slots & Grid View States
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedBarberFilter, setSelectedBarberFilter] = useState<string>('all');
  const [slotInterval, setSlotInterval] = useState<number>(30); // 30, 45, or 60 minutes

  // Helper for generating next 7 days for the date tabs
  const getNext7Days = () => {
    const days = [];
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      
      let label = weekdays[d.getDay()];
      if (i === 0) label = 'Hoje';
      else if (i === 1) label = 'Amanhã';

      days.push({
        dateStr,
        dayNum: dd,
        weekday: label,
        fullLabel: `${dd}/${mm}`,
        rawDate: d
      });
    }
    return days;
  };

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

  const isRecurringSlotActiveOnDate = (slot: any, targetDateStr: string) => {
    try {
      const parts = targetDateStr.split('-');
      if (parts.length !== 3) return false;
      const targetDate = new Date(`${targetDateStr}T12:00:00`);
      const targetDayOfWeek = targetDate.getDay();

      if (slot.dayOfWeek !== targetDayOfWeek) return false;

      if (slot.startDate && targetDateStr < slot.startDate) return false;
      if (slot.expiryDate && targetDateStr > slot.expiryDate) return false;

      if (slot.frequency === 'biweekly') {
        const slotParity = getWeekParity(slot.startDate || '2026-01-05');
        const targetParity = getWeekParity(targetDateStr);
        if (slotParity !== targetParity) return false;
      }

      return true;
    } catch (err) {
      console.error('Error checking recurring slot activation:', err);
      return false;
    }
  };

  const [services, setServices] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [showAddWalkInModal, setShowAddWalkInModal] = useState(false);

  // Form states
  const [newBookingClientType, setNewBookingClientType] = useState<'existing' | 'new'>('existing');
  const [newBookingSelectedClientId, setNewBookingSelectedClientId] = useState('');
  const [newBookingClientName, setNewBookingClientName] = useState('');
  const [newBookingClientPhone, setNewBookingClientPhone] = useState('');
  const [newBookingServiceId, setNewBookingServiceId] = useState('');
  const [newBookingBarberId, setNewBookingBarberId] = useState('');
  const [newBookingDate, setNewBookingDate] = useState('');
  const [newBookingTime, setNewBookingTime] = useState('');
  const [newBookingStatus, setNewBookingStatus] = useState<'completed' | 'pending'>('pending');
  const [newBookingPaymentMethod, setNewBookingPaymentMethod] = useState<'establishment' | 'pix'>('establishment');
  const [newBookingPaymentStatus, setNewBookingPaymentStatus] = useState<'pending' | 'paid'>('pending');

  // Load services and employees for this barbearia
  useEffect(() => {
    // Sync services
    const refServices = collection(db, 'services');
    const qServices = query(refServices, where('ownerId', '==', user.uid));
    const unsubscribeServices = onSnapshot(qServices, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setServices(list);
    }, (err) => {
      console.error('Error fetching services for appointments:', err);
    });

    // Sync staff employees
    const refEmployees = collection(db, 'barber_employees');
    const qEmployees = query(refEmployees, where('barbeariaId', '==', user.uid));
    const unsubscribeEmployees = onSnapshot(qEmployees, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      setEmployees(list);
    }, (err) => {
      console.error('Error fetching staff employees for appointments:', err);
    });

    return () => {
      unsubscribeServices();
      unsubscribeEmployees();
    };
  }, [user.uid]);

  const handleSaveWalkIn = async (e: React.FormEvent) => {
    e.preventDefault();

    let finalClientName = '';
    let finalClientPhone = '';
    let selectedClientObj: any = null;

    if (newBookingClientType === 'existing') {
      if (!newBookingSelectedClientId) {
        triggerToast('Por favor, selecione um cliente cadastrado.');
        return;
      }
      selectedClientObj = clients.find(c => c.id === newBookingSelectedClientId);
      if (!selectedClientObj) {
        triggerToast('Cliente selecionado inválido.');
        return;
      }
      finalClientName = selectedClientObj.name;
      finalClientPhone = selectedClientObj.phone || '';
    } else {
      if (!newBookingClientName.trim()) {
        triggerToast('Por favor, digite o nome do cliente.');
        return;
      }
      finalClientName = newBookingClientName.trim();
      finalClientPhone = newBookingClientPhone.trim();
    }

    if (!newBookingServiceId) {
      triggerToast('Por favor, selecione um serviço.');
      return;
    }
    const selectedServiceObj = services.find(s => s.id === newBookingServiceId);
    if (!selectedServiceObj) {
      triggerToast('Serviço selecionado inválido.');
      return;
    }

    if (!newBookingDate) {
      triggerToast('Por favor, informe a data.');
      return;
    }
    if (!newBookingTime) {
      triggerToast('Por favor, informe o horário.');
      return;
    }

    // Determine barber info
    let finalBarberName = user.displayName || 'Você / Administrador';
    if (newBookingBarberId !== user.uid) {
      const selectedEmp = employees.find(e => e.id === newBookingBarberId);
      if (selectedEmp) {
        finalBarberName = selectedEmp.name;
      }
    }

    try {
      const newBookingId = `booking_walkin_${Date.now()}`;
      const bookingRef = doc(db, 'guest_bookings', newBookingId);
      
      const responseDetails = {
        barbeariaId: user.uid,
        barberId: newBookingBarberId,
        barberName: finalBarberName,
        barberPhone: '',
        serviceId: selectedServiceObj.id,
        serviceName: selectedServiceObj.name,
        serviceValue: selectedServiceObj.value || 0,
        date: newBookingDate,
        time: newBookingTime,
        clientName: finalClientName,
        clientPhone: finalClientPhone,
        createdAt: new Date().toISOString(),
        paymentStatus: newBookingStatus === 'completed' && newBookingPaymentMethod === 'pix' ? 'paid' : newBookingPaymentStatus,
        paymentMethod: newBookingPaymentMethod,
        status: newBookingStatus
      };

      if (newBookingStatus === 'completed') {
        Object.assign(responseDetails, {
          completedAt: new Date().toISOString()
        });
      }

      // 2. Save booking
      await setDoc(bookingRef, responseDetails);

      // 3. If completed and matches existing client, add cut to client history
      if (newBookingStatus === 'completed' && newBookingClientType === 'existing' && selectedClientObj) {
        const newCutId = `cut_${Date.now()}`;
        const cutRef = doc(db, 'clients', selectedClientObj.id, 'cuts', newCutId);
        await setDoc(cutRef, {
          id: newCutId,
          clientId: selectedClientObj.id,
          service: selectedServiceObj.name,
          date: newBookingDate,
          obs: 'Atendimento presencial no balcão',
          ownerId: user.uid,
          createdAt: new Date().toISOString()
        });
      }

      triggerToast('Atendimento lançado com sucesso!');
      setShowAddWalkInModal(false);
    } catch (err) {
      console.error('Error saving walk-in booking:', err);
      triggerToast('Erro ao salvar o atendimento balcão.');
    }
  };

  // Sync barbearia settings (including recurring fixed slots) in real-time
  useEffect(() => {
    if (!user?.uid) return;
    const docRef = doc(db, 'barbers', user.uid);
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        setBarbeariaInfo({ id: snap.id, ...snap.data() });
      }
    }, (err) => {
      console.error('Error syncing barbearia metadata inside Appointments:', err);
    });
    return () => unsubscribe();
  }, [user?.uid]);

  // Sync guest bookings in real-time
  useEffect(() => {
    const refBookings = collection(db, 'guest_bookings');
    const unsubscribe = onSnapshot(refBookings, (snapshot) => {
      const list: BookingRecord[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as BookingRecord);
      });
      // Sort standard by date (ascending) and then by time (ascending) to show nearest first
      list.sort((a, b) => {
        const dateCompare = (a.date || '').localeCompare(b.date || '');
        if (dateCompare !== 0) return dateCompare;
        return (a.time || '').localeCompare(b.time || '');
      });
      
      // Filter if logged-in user is a barber (can only see bookings for themselves or their barbearia)
      if (user.role === 'barber') {
        const empIds = new Set(employees.map(e => e.id));
        setBookings(list.filter(b => 
          b.barbeariaId === user.uid || 
          b.barberId === user.uid || 
          !b.barbeariaId ||
          empIds.has(b.barberId) ||
          empIds.has(b.barbeariaId || '')
        ));
      } else {
        setBookings(list);
      }
    }, (error) => {
      console.error('Error syncing bookings list:', error);
      handleFirestoreError(error, OperationType.LIST, 'guest_bookings');
    });

    return () => unsubscribe();
  }, [user, employees]);

  const handleCopyLink = () => {
    const barberParam = user.role === 'barber' ? `&barbearia=${user.uid}` : '';
    const bookingLink = `${window.location.origin}${window.location.pathname}?agendar=true${barberParam}`;
    
    let copySuccess = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(bookingLink);
        copySuccess = true;
      }
    } catch (e) {
      console.warn("Navigator clipboard failed, using fallback:", e);
    }

    if (!copySuccess) {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = bookingLink;
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

    setCopied(true);
    triggerToast('Link de agendamento copiado com sucesso!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeleteBooking = (id: string, client: string, date: string, hour: string) => {
    const dateFormatted = date.split('-').reverse().join('/');
    openConfirmModal(
      'Cancelar Agendamento',
      `Tem certeza que deseja cancelar o agendamento de "${client}" no dia ${dateFormatted} às ${hour}? Essa ação apagará a reserva definitivamente.`,
      async () => {
        try {
          const docRef = doc(db, 'guest_bookings', id);
          await deleteDoc(docRef);
          triggerToast('Agendamento cancelado com sucesso.');
        } catch (error) {
          console.error('Error deleting booking:', error);
          handleFirestoreError(error, OperationType.DELETE, `guest_bookings/${id}`);
        }
      }
    );
  };

  const handleSendMessage = (b: BookingRecord) => {
    if (!featureAlertsEnabled) {
      alert('⚠️ A função de avisos e envio de mensagens pelo WhatsApp não está liberada no seu plano atual.');
      return;
    }
    // Remove format of client phone
    const cleanPhone = b.clientPhone.replace(/\D/g, '');
    if (!cleanPhone) return;
    
    const dateFormatted = b.date.split('-').reverse().join('/');
    const salonName = barbeariaInfo?.name || 'Royal Cuts';
    const cancelUrl = `${window.location.origin}${window.location.pathname}?barbearia=${b.barbeariaId || user?.uid || ''}&consultar=true&tel=${encodeURIComponent(b.clientPhone)}`;

    const message = `* * * * 💈 *CONFIRMAÇÃO* *DE* *HORÁRIO* * * * *\n\n` +
      `Olá, *${b.clientName}*! Passando para confirmar que seu horário foi agendado com sucesso na *${salonName}*! 🚀\n\n` +
      `Confira as informações do seu atendimento:\n\n` +
      `=-=-=-=-=-=-=-=-=-=-=-=-=-==-=-=\n` +
      `👥 *CLIENTE:* ${b.clientName}\n` +
      `💇🏽‍♂️ *PROFISSIONAL:* ${b.barberName}\n` +
      `✂️ *SERVIÇO:* *${b.serviceName}*${b.serviceValue ? ` - R$ ${Number(b.serviceValue).toFixed(2).replace('.', ',')}` : ''}\n` +
      `📆 *DATA:* *${dateFormatted}*\n` +
      `⏰ *HORÁRIO:* *${b.time}*\n` +
      `=-=-=-=-=-=-=-=-=-=-=-=-=-==-=-=\n\n` +
      `⚠️ *RECOMENDAÇÕES:*\n` +
      `• Pedimos para chegar com *5 minutos* de antecedência para manter a pontualidade.\n` +
      `• Caso ocorra algum imprevisto, clique no link abaixo para alterar ou desmarcar seu horário:\n\n` +
      `🔗 *VER OU CANCELAR HORÁRIO:*\n` +
      `👉 ${cancelUrl}\n\n` +
      `Agradecemos pela preferência! Nos vemos em breve! 💈✂️`;
    
    const encodedText = encodeURIComponent(message);
    const hasDdi = cleanPhone.length > 11;
    const phoneWithDdi = hasDdi ? cleanPhone : `55${cleanPhone}`;
    
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${phoneWithDdi}&text=${encodedText}`;

    try {
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile) {
        const mobileUrl = `whatsapp://send?phone=${phoneWithDdi}&text=${encodedText}`;
        window.location.href = mobileUrl;
        setTimeout(() => {
          window.location.href = whatsappUrl;
        }, 1200);
      } else {
        const opened = window.open(whatsappUrl, '_blank');
        if (!opened) {
          window.location.assign(whatsappUrl);
        }
      }
    } catch (e) {
      window.location.href = whatsappUrl;
    }
  };

  const handleCompleteBooking = async (b: BookingRecord) => {
    openConfirmModal(
      'Concluir Atendimento',
      `Deseja marcar o agendamento de "${b.clientName}" como CONCLUÍDO? O registro sairá da lista ativa, mas ficará salvo no histórico para futuras consultas de ausência.`,
      async () => {
        try {
          // 1. Update guest_booking status to 'completed'
          const docRef = doc(db, 'guest_bookings', b.id);
          await setDoc(docRef, { status: 'completed', completedAt: new Date().toISOString() }, { merge: true });

          // 2. If client matches an existing subscriber, sync a cut to their subcollection
          const cleanBookingPhone = b.clientPhone.replace(/\D/g, '');
          const matchedClient = clients.find(c => {
            const cleanCPhone = c.phone ? c.phone.replace(/\D/g, '') : '';
            return cleanCPhone && cleanCPhone === cleanBookingPhone;
          });

          if (matchedClient) {
            const newCutId = `cut_${Date.now()}`;
            const cutRef = doc(db, 'clients', matchedClient.id, 'cuts', newCutId);
            await setDoc(cutRef, {
              id: newCutId,
              clientId: matchedClient.id,
              service: b.serviceName,
              date: b.date,
              obs: 'Concluído via Agendamentos Avulsos',
              ownerId: user.uid,
              createdAt: new Date().toISOString()
            });
          }

          triggerToast('Serviço concluído com sucesso!');
        } catch (error) {
          console.error('Error completing booking:', error);
          handleFirestoreError(error, OperationType.WRITE, `guest_bookings/${b.id}`);
        }
      }
    );
  };

  const isBookingInPast = (dateStr: string, timeStr: string) => {
    try {
      if (!dateStr || !timeStr) return false;
      const [year, month, day] = dateStr.split('-').map(Number);
      const [hour, minute] = timeStr.split(':').map(Number);
      const now = new Date();
      const bookingDate = new Date(year, month - 1, day, hour, minute);
      return bookingDate < now;
    } catch {
      return false;
    }
  };

  const handleNoShowBooking = async (b: BookingRecord) => {
    openConfirmModal(
      'Registrar Ausência / Falta',
      `Tem certeza que deseja marcar "${b.clientName}" como AUSENTE (Não Compareceu)? O horário constará no histórico como falta e sairá da lista pendente.`,
      async () => {
        try {
          const docRef = doc(db, 'guest_bookings', b.id);
          await setDoc(docRef, { status: 'no-show', completedAt: new Date().toISOString() }, { merge: true });
          triggerToast('Marcação de ausência salva com sucesso!');
        } catch (error) {
          console.error('Error marking as no-show:', error);
          handleFirestoreError(error, OperationType.WRITE, `guest_bookings/${b.id}`);
        }
      }
    );
  };

  // Active future/today bookings (not completed, not no-show, not cancelled)
  const activeBookings = bookings.filter(b => 
    b.status !== 'completed' && 
    b.status !== 'no-show' &&
    b.status !== 'cancelled'
  );

  // Past unresolved bookings (not completed, not no-show, and in the past)
  const pendingPastBookings = bookings.filter(b => 
    b.status !== 'completed' && 
    b.status !== 'no-show' && 
    b.status !== 'cancelled' &&
    isBookingInPast(b.date, b.time)
  );

  const displayedBookings = bookings.filter(b => {
    if (b.status === 'cancelled') return false;

    if (showOnlyPendingPast) {
      return b.status !== 'completed' && b.status !== 'no-show' && isBookingInPast(b.date, b.time);
    }

    // Check date filter if set
    if (selectedDateFilter !== 'all' && b.date !== selectedDateFilter) {
      return false;
    }

    // Check history filter
    if (showHistory) {
      return true;
    }

    // Otherwise show active/pending only
    return b.status !== 'completed' && b.status !== 'no-show';
  });

  const allRecurringSlots = React.useMemo(() => {
    const slots: any[] = [];
    if (!user?.uid) return slots;

    // 1. Gather slots from main barbearia
    if (barbeariaInfo?.scheduleSettings?.recurringSlots) {
      barbeariaInfo.scheduleSettings.recurringSlots.forEach((slot: any) => {
        slots.push({
          ...slot,
          barberId: user.uid,
          barberName: user.displayName || 'Você / Administrador'
        });
      });
    }

    // 2. Gather slots from employees
    if (Array.isArray(employees)) {
      employees.forEach((emp: any) => {
        if (emp.scheduleSettings?.recurringSlots) {
          emp.scheduleSettings.recurringSlots.forEach((slot: any) => {
            slots.push({
              ...slot,
              barberId: emp.id,
              barberName: emp.name
            });
          });
        }
      });
    }

    return slots;
  }, [barbeariaInfo, employees, user]);

  const projectedRecurringBookings = React.useMemo(() => {
    if (selectedDateFilter === 'all' || !user?.uid) return [];

    const projected: BookingRecord[] = [];

    allRecurringSlots.forEach((slot: any) => {
      if (isRecurringSlotActiveOnDate(slot, selectedDateFilter)) {
        projected.push({
          id: `recurring_proj_${slot.id}_${selectedDateFilter}`,
          barbeariaId: user.uid,
          barberId: slot.barberId,
          barberName: slot.barberName,
          serviceId: 'recurring_slot_service',
          serviceName: slot.clientPackage || 'Mensalista (Horário Fixo)',
          serviceValue: 0,
          date: selectedDateFilter,
          time: slot.time,
          clientName: slot.clientName,
          clientPhone: slot.clientPhone || '',
          createdAt: slot.startDate || '',
          status: 'recurring_fixed',
          paymentStatus: 'paid',
          paymentMethod: 'monthly_plan'
        });
      }
    });

    return projected;
  }, [selectedDateFilter, allRecurringSlots, user]);

  const combinedBookings = React.useMemo(() => {
    if (selectedDateFilter === 'all' || showOnlyPendingPast) {
      return displayedBookings;
    }
    const merged = [...displayedBookings, ...projectedRecurringBookings];
    merged.sort((a, b) => {
      // Sort first by date, then by time
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.time.localeCompare(b.time);
    });
    return merged;
  }, [displayedBookings, projectedRecurringBookings, selectedDateFilter, showOnlyPendingPast]);

  const filteredBookings = combinedBookings.filter(b => {
    const q = searchQuery.toLowerCase();
    return (
      b.clientName.toLowerCase().includes(q) ||
      b.serviceName.toLowerCase().includes(q) ||
      b.barberName.toLowerCase().includes(q) ||
      b.clientPhone.includes(q)
    );
  });

  const activeDateForGrid = selectedDateFilter === 'all' ? todayStr : selectedDateFilter;

  // Projected recurring slots specifically for the active grid date
  const projectedRecurringForGrid = React.useMemo(() => {
    if (!user?.uid || !activeDateForGrid) return [];

    const projected: BookingRecord[] = [];

    allRecurringSlots.forEach((slot: any) => {
      if (isRecurringSlotActiveOnDate(slot, activeDateForGrid)) {
        projected.push({
          id: `recurring_proj_${slot.id}_${activeDateForGrid}`,
          barbeariaId: user.uid,
          barberId: slot.barberId,
          barberName: slot.barberName,
          serviceId: 'recurring_slot_service',
          serviceName: slot.clientPackage || 'Mensalista (Horário Fixo)',
          serviceValue: 0,
          date: activeDateForGrid,
          time: slot.time,
          clientName: slot.clientName,
          clientPhone: slot.clientPhone || '',
          createdAt: slot.startDate || '',
          status: 'recurring_fixed',
          paymentStatus: 'paid',
          paymentMethod: 'monthly_plan'
        });
      }
    });

    return projected;
  }, [activeDateForGrid, allRecurringSlots, user]);

  // ALL active / completed / walk-in bookings for the active grid date to ensure occupied slots always render correctly
  const gridBookings = React.useMemo(() => {
    const normActiveDate = normalizeDate(activeDateForGrid);
    const dayBookings = bookings.filter(b => normalizeDate(b.date) === normActiveDate && b.status !== 'cancelled');
    const merged = [...dayBookings, ...projectedRecurringForGrid];
    merged.sort((a, b) => {
      const dateCompare = normalizeDate(a.date).localeCompare(normalizeDate(b.date));
      if (dateCompare !== 0) return dateCompare;
      return normalizeTime(a.time).localeCompare(normalizeTime(b.time));
    });
    return merged;
  }, [bookings, activeDateForGrid, projectedRecurringForGrid]);

  // Helper to extract configured working hours for the selected date and barber
  const getBusinessHoursForDate = (dateStr: string, barberFilter: string) => {
    if (!dateStr) return [];
    
    let barberObj = null;
    if (barberFilter !== 'all' && barberFilter !== user.uid) {
      barberObj = employees.find(e => e.id === barberFilter);
    }

    const d = new Date(dateStr + 'T12:00:00');
    const dayOfWeek = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat

    const targetSettings = barberObj?.scheduleSettings || barbeariaInfo?.scheduleSettings;

    if (targetSettings) {
      if (targetSettings.useDaySpecific && targetSettings.daySpecificHours) {
        const dayHours = targetSettings.daySpecificHours[dayOfWeek] ?? targetSettings.daySpecificHours[String(dayOfWeek)];
        if (Array.isArray(dayHours) && dayHours.length > 0) {
          return dayHours;
        }
      }
      if (Array.isArray(targetSettings.workingHours) && targetSettings.workingHours.length > 0) {
        return targetSettings.workingHours;
      }
    }

    // Default fallback starting from 08:00
    return [
      '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', 
      '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
      '17:00', '17:30', '18:00', '18:30', '19:00', '19:30'
    ];
  };

  // Generate timetable slots based on agenda settings + any actual booking time on that date
  const generatedTimeSlots = React.useMemo(() => {
    const configuredHours = getBusinessHoursForDate(activeDateForGrid, selectedBarberFilter);
    const slotsSet = new Set<string>(configuredHours.map(h => normalizeTime(h)));

    // Also include any actual booking time on that active date if a booking exists
    const normActiveDate = normalizeDate(activeDateForGrid);
    gridBookings.forEach(b => {
      if (normalizeDate(b.date) === normActiveDate && b.time && b.status !== 'cancelled') {
        if (selectedBarberFilter === 'all' || b.barberId === selectedBarberFilter || !b.barberId) {
          slotsSet.add(normalizeTime(b.time));
        }
      }
    });

    return Array.from(slotsSet).sort((a, b) => a.localeCompare(b));
  }, [activeDateForGrid, selectedBarberFilter, barbeariaInfo, employees, gridBookings]);

  // Calculate occupied vs free slots stats for active date
  const gridSlotStats = React.useMemo(() => {
    let occupiedCount = 0;
    const normActiveDate = normalizeDate(activeDateForGrid);
    
    generatedTimeSlots.forEach(slotTime => {
      const normSlotTime = normalizeTime(slotTime);
      const isOccupied = gridBookings.some(b => {
        if (normalizeDate(b.date) !== normActiveDate || normalizeTime(b.time) !== normSlotTime || b.status === 'cancelled') return false;
        if (selectedBarberFilter !== 'all' && b.barberId && b.barberId !== selectedBarberFilter) return false;
        return true;
      });
      if (isOccupied) occupiedCount++;
    });

    const totalCount = generatedTimeSlots.length;
    const freeCount = totalCount - occupiedCount;
    const occupancyRate = Math.round((occupiedCount / Math.max(1, totalCount)) * 100);

    return { totalCount, occupiedCount, freeCount, occupancyRate };
  }, [generatedTimeSlots, gridBookings, activeDateForGrid, selectedBarberFilter]);

  const todayBookingsCount = bookings.filter(b => 
    b.date === todayStr && 
    b.status !== 'completed' && 
    b.status !== 'no-show'
  ).length;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none animate-fade-in font-sans">
      
      {/* Header and Brand */}
      <div className="px-4 md:px-6 py-4.5 border-b border-border-dark bg-bg-dark-800 flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between shrink-0 select-none shadow">
        <div>
          <h2 className="font-display font-medium text-xl md:text-2xl text-text-primary flex items-center gap-2">
            <span>📅</span>
            <span>Agendamentos Avulsos ({activeBookings.length})</span>
          </h2>
          <p className="text-text-muted text-[11px] uppercase tracking-wider font-semibold mt-1">
            Clientes avulsos fora do plano por assinatura
          </p>
        </div>

        <button
          onClick={() => {
            const now = new Date();
            const currHours = String(now.getHours()).padStart(2, '0');
            const currMins = String(now.getMinutes()).padStart(2, '0');
            setNewBookingTime(`${currHours}:${currMins}`);
            setNewBookingDate(todayStr);
            setNewBookingClientType('existing');
            setNewBookingSelectedClientId('');
            setNewBookingClientName('');
            setNewBookingClientPhone('');
            setNewBookingServiceId(services[0]?.id || '');
            setNewBookingBarberId(user.uid);
            setNewBookingStatus('pending');
            setNewBookingPaymentMethod('establishment');
            setNewBookingPaymentStatus('pending');
            setShowAddWalkInModal(true);
          }}
          className="w-full sm:w-auto btn bg-[#c5a880] hover:bg-[#c5a880]/90 text-black text-xs font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Lançar Atendimento Balcão (Presencial)</span>
        </button>
      </div>

      {/* Main Content Area scroll */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        
        {/* SHARE LINK CARD BOX */}
        <div className="rounded-xl p-5 bg-gradient-to-br from-bg-dark-800 to-bg-dark-850 border border-border-dark shadow-lg relative overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-5">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-[#c5a880]"></div>
          
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-[#c5a880]" />
              <span>Link do Seu Sistema de Agendamento</span>
            </h3>
            <p className="text-xs text-text-secondary max-w-xl leading-relaxed">
              Envie este link para os clientes avulsos que querem agendar horários avulsos. Eles poderão selecionar o barbeiro, o serviço e agendar em poucos segundos!
            </p>
          </div>

          <button
            onClick={handleCopyLink}
            className="w-full sm:w-auto btn bg-[#c5a880] hover:bg-[#c5a880]/90 text-black text-xs font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shrink-0 cursor-pointer shadow active:scale-95"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>Link Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copiar Link de Compartilhamento</span>
              </>
            )}
          </button>
        </div>

        {/* Agendamentos Passados Não Resolvidos Banner */}
        {pendingPastBookings.length > 0 && (
          <div className="rounded-xl p-4 md:p-5 bg-amber-950/20 border border-amber-500/35 shadow flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-fade-in">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5 animate-pulse" />
              </div>
              <div className="space-y-0.5">
                <h4 className="text-sm font-bold text-amber-400">
                  Agendamentos Passados Não Concluídos ({pendingPastBookings.length})
                </h4>
                <p className="text-[11px] text-text-secondary leading-relaxed max-w-xl">
                  Estes horários já passaram, mas não receberam status de concluído ou ausente. Organize sua agenda marcando o status correto abaixo ou filtre para ver todos.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setShowOnlyPendingPast(!showOnlyPendingPast);
                setShowHistory(false);
              }}
              className={`w-full md:w-auto px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer shadow active:scale-95 flex items-center justify-center gap-1.5 ${
                showOnlyPendingPast
                  ? 'bg-amber-500 text-black hover:bg-amber-400'
                  : 'bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25'
              }`}
            >
              <span>{showOnlyPendingPast ? 'Mostrar Todos os Horários' : 'Filtrar para Resolver Agora'}</span>
            </button>
          </div>
        )}

        {/* METRICS STATS SUMMARY */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="bg-bg-dark-800 border border-border-dark rounded-xl p-4 flex items-center gap-4.5 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-[#c5a880]/10 border border-[#c5a880]/20 flex items-center justify-center text-[#c5a880] shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">Total Agendados</span>
              <span className="text-xl font-bold text-white block mt-0.5">{activeBookings.length}</span>
            </div>
          </div>

          <div className="bg-bg-dark-800 border border-border-dark rounded-xl p-4 flex items-center gap-4.5 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-amber-950/40 border border-amber-500/25 flex items-center justify-center text-brand-amber shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">Atendimentos de Hoje</span>
              <span className="text-xl font-bold text-white block mt-0.5">{todayBookingsCount}</span>
            </div>
          </div>

          <div className="bg-bg-dark-800 border border-border-dark rounded-xl p-4 flex items-center gap-4.5 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-emerald-950/40 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">Faturamento Estimado</span>
              <span className="text-xl font-extrabold text-[#c5a880] block mt-0.5">
                R$ {activeBookings.reduce((acc, b) => acc + b.serviceValue, 0).toFixed(2).replace('.', ',')}
              </span>
            </div>
          </div>
        </div>

        {/* FILTRAR POR DATA DA AGENDA (TABS) */}
        <div className="bg-bg-dark-850/45 border border-border-dark/60 rounded-2xl p-4.5 space-y-3 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border-dark/40 pb-2">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Calendar className="w-4.5 h-4.5 text-[#c5a880]" />
                <span>Escolher Dia da Agenda</span>
              </h3>
              <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mt-0.5">
                Navegue pelos dias para ver horários específicos de forma organizada
              </p>
            </div>
            {selectedDateFilter !== 'all' && (
              <button 
                type="button"
                onClick={() => setSelectedDateFilter('all')}
                className="text-[11px] text-[#c5a880] font-bold hover:underline self-start sm:self-auto flex items-center gap-1 cursor-pointer"
              >
                <span>🔍 Ver Tudo (Todos os Dias)</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-border-dark scrollbar-track-transparent -mx-1 px-1 snap-x touch-pan-x">
            {/* Tab: Ver Tudo */}
            <button
              type="button"
              onClick={() => {
                setSelectedDateFilter('all');
                setShowOnlyPendingPast(false);
              }}
              className={`min-w-[85px] h-[72px] rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer relative shrink-0 snap-start ${
                selectedDateFilter === 'all'
                  ? 'bg-[#c5a880]/10 border-[#c5a880] text-[#c5a880]'
                  : 'bg-bg-dark-800 border-border-dark hover:border-border-dark/80 text-text-muted hover:text-white'
              }`}
            >
              <span className="text-[9px] uppercase font-bold tracking-wider opacity-80">Agenda</span>
              <span className="text-sm font-extrabold text-text-primary mt-0.5">Completa</span>
              <span className="text-[9px] text-text-muted font-bold mt-1">
                {activeBookings.length} total
              </span>
            </button>

            {/* Next 7 Days */}
            {getNext7Days().map((day) => {
              const isSelected = selectedDateFilter === day.dateStr;
              const guestCountForDay = bookings.filter(b => 
                b.date === day.dateStr && 
                b.status !== 'completed' && 
                b.status !== 'no-show'
              ).length;
              const recurringCountForDay = allRecurringSlots.filter(slot => 
                isRecurringSlotActiveOnDate(slot, day.dateStr)
              ).length;
              const activeCountForDay = guestCountForDay + recurringCountForDay;

              return (
                <button
                  key={day.dateStr}
                  type="button"
                  onClick={() => {
                    setSelectedDateFilter(day.dateStr);
                    setShowOnlyPendingPast(false);
                  }}
                  className={`min-w-[76px] h-[72px] rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer relative shrink-0 snap-start ${
                    isSelected
                      ? 'bg-[#c5a880]/10 border-[#c5a880] text-[#c5a880]'
                      : 'bg-bg-dark-800 border-border-dark hover:border-border-dark/80 text-text-muted hover:text-white'
                  }`}
                >
                  <span className={`text-[9px] uppercase font-bold tracking-wider ${isSelected ? 'text-[#c5a880]' : 'text-text-muted'}`}>
                    {day.weekday}
                  </span>
                  <span className="text-base font-extrabold text-text-primary mt-0.5">
                    {day.dayNum}
                  </span>
                  
                  {activeCountForDay > 0 ? (
                    <span className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[9px] font-extrabold rounded-full ${
                      isSelected 
                        ? 'bg-[#c5a880] text-black shadow-md' 
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    }`}>
                      {activeCountForDay}
                    </span>
                  ) : (
                    <span className="text-[8px] text-text-muted/40 font-bold mt-0.5">•</span>
                  )}
                </button>
              );
            })}

            {/* Custom Date Input Card */}
            <div className={`min-w-[130px] h-[72px] bg-bg-dark-800 border rounded-xl flex flex-col justify-center px-3.5 relative shrink-0 snap-start transition-all ${
              selectedDateFilter !== 'all' && !getNext7Days().some(d => d.dateStr === selectedDateFilter)
                ? 'border-[#c5a880] bg-[#c5a880]/5'
                : 'border-border-dark hover:border-border-dark/80'
            }`}>
              <span className="text-[9px] uppercase font-bold text-text-muted mb-0.5 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-[#c5a880]" /> Outra Data
              </span>
              <input 
                type="date"
                value={selectedDateFilter !== 'all' && !getNext7Days().some(d => d.dateStr === selectedDateFilter) ? selectedDateFilter : ''}
                onChange={(e) => {
                  if (e.target.value) {
                    setSelectedDateFilter(e.target.value);
                    setShowOnlyPendingPast(false);
                  }
                }}
                className="bg-transparent border-none text-xs text-text-primary font-bold focus:outline-none w-full p-0 cursor-pointer text-white"
              />
            </div>
          </div>
        </div>

        {/* VIEW MODE SWITCHER & BARBER / INTERVAL FILTERS TOOLBAR */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-bg-dark-800 p-3.5 rounded-2xl border border-border-dark shadow">
          {/* View Mode Toggle Buttons */}
          <div className="flex items-center gap-2 bg-bg-dark-900 p-1 rounded-xl border border-border-dark shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-[#c5a880] text-black shadow'
                  : 'text-text-muted hover:text-white'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Grade Vagos x Ocupados</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                viewMode === 'grid' ? 'bg-black/20 text-black' : 'bg-emerald-500/20 text-emerald-400'
              }`}>
                {gridSlotStats.freeCount} vagos
              </span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-[#c5a880] text-black shadow'
                  : 'text-text-muted hover:text-white'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Lista de Agendamentos</span>
            </button>
          </div>

          {/* Filters: Barber & Slot Interval */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            {/* Barber Selector */}
            <div className="flex items-center gap-1.5 bg-bg-dark-900 border border-border-dark px-3 py-1.5 rounded-xl">
              <UserIcon className="w-3.5 h-3.5 text-[#c5a880]" />
              <span className="text-text-muted font-semibold hidden sm:inline">Barbeiro:</span>
              <select
                value={selectedBarberFilter}
                onChange={(e) => setSelectedBarberFilter(e.target.value)}
                className="bg-transparent border-none text-white font-bold focus:outline-none cursor-pointer pr-1"
              >
                <option value="all" className="bg-bg-dark-800 text-white">Todos os Barbeiros</option>
                <option value={user.uid} className="bg-bg-dark-800 text-white">
                  {user.displayName || 'Você / Administrador'}
                </option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id} className="bg-bg-dark-800 text-white">
                    {emp.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Slot Interval Selector */}
            <div className="flex items-center gap-1.5 bg-bg-dark-900 border border-border-dark px-3 py-1.5 rounded-xl">
              <Clock className="w-3.5 h-3.5 text-[#c5a880]" />
              <span className="text-text-muted font-semibold hidden sm:inline">Intervalo:</span>
              <select
                value={slotInterval}
                onChange={(e) => setSlotInterval(Number(e.target.value))}
                className="bg-transparent border-none text-white font-bold focus:outline-none cursor-pointer pr-1"
              >
                <option value={30} className="bg-bg-dark-800 text-white">30 min</option>
                <option value={45} className="bg-bg-dark-800 text-white">45 min</option>
                <option value={60} className="bg-bg-dark-800 text-white">1 hora (60 min)</option>
              </select>
            </div>
          </div>
        </div>

        {/* TIME SLOTS GRID VIEW (VAGOS X OCUPADOS) */}
        {viewMode === 'grid' && (
          <div className="space-y-4 animate-fade-in">
            {/* Summary stats bar for current active date */}
            <div className="bg-gradient-to-r from-bg-dark-800 via-bg-dark-850 to-bg-dark-800 border border-border-dark p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">🗓️</span>
                  <h3 className="text-sm font-bold text-white">
                    Grade do Dia: {activeDateForGrid.split('-').reverse().join('/')}
                  </h3>
                  {activeDateForGrid === todayStr && (
                    <span className="px-2 py-0.5 bg-[#c5a880]/20 text-[#c5a880] border border-[#c5a880]/30 rounded text-[9px] font-extrabold uppercase">
                      Hoje
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-text-secondary mt-0.5">
                  Visualização em tempo real de horários vagos e ocupados. Clique em "+ Agendar" em qualquer horário livre para marcar um cliente.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1.5 shadow-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>{gridSlotStats.freeCount} Vagos (Livres)</span>
                </div>

                <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center gap-1.5 shadow-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                  <span>{gridSlotStats.occupiedCount} Ocupados</span>
                </div>

                <div className="px-3 py-1.5 rounded-xl bg-bg-dark-900 border border-border-dark text-[#c5a880]">
                  <span>Ocupação: {gridSlotStats.occupancyRate}%</span>
                </div>
              </div>
            </div>

            {/* Time Slots Cards Grid - Compact High Density Layout */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
              {generatedTimeSlots.map((slotTime) => {
                const normSlotTime = normalizeTime(slotTime);
                const normActiveDate = normalizeDate(activeDateForGrid);
                const slotBookings = gridBookings.filter(b => {
                  if (normalizeDate(b.date) !== normActiveDate || normalizeTime(b.time) !== normSlotTime || b.status === 'cancelled') return false;
                  if (selectedBarberFilter !== 'all' && b.barberId && b.barberId !== selectedBarberFilter) return false;
                  return true;
                });

                const isOccupied = slotBookings.length > 0;

                if (!isOccupied) {
                  return (
                    <div
                      key={slotTime}
                      onClick={() => {
                        setNewBookingTime(slotTime);
                        setNewBookingDate(activeDateForGrid);
                        if (selectedBarberFilter !== 'all') {
                          setNewBookingBarberId(selectedBarberFilter);
                        } else {
                          setNewBookingBarberId(user.uid);
                        }
                        setNewBookingClientType('existing');
                        setNewBookingSelectedClientId('');
                        setNewBookingClientName('');
                        setNewBookingClientPhone('');
                        setNewBookingServiceId(services[0]?.id || '');
                        setNewBookingStatus('pending');
                        setNewBookingPaymentMethod('establishment');
                        setNewBookingPaymentStatus('pending');
                        setShowAddWalkInModal(true);
                      }}
                      className="bg-bg-dark-800/90 hover:bg-emerald-950/20 border border-dashed border-emerald-500/30 hover:border-emerald-500/80 rounded-xl p-2.5 transition-all flex flex-col justify-between gap-2 group cursor-pointer shadow-sm hover:shadow-md"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="text-sm font-mono font-extrabold text-white">{slotTime}</span>
                        </div>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          VAGO
                        </span>
                      </div>

                      <div className="w-full py-1 px-2 rounded-lg bg-emerald-500/15 group-hover:bg-emerald-500 text-emerald-400 group-hover:text-black font-bold text-[10px] flex items-center justify-center gap-1 transition-all">
                        <Plus className="w-3 h-3 stroke-[3]" />
                        <span>Agendar</span>
                      </div>
                    </div>
                  );
                }

                // Occupied Slot Card
                return (
                  <div
                    key={slotTime}
                    className="bg-bg-dark-800 border border-amber-500/40 rounded-xl p-2.5 shadow-md flex flex-col justify-between gap-2 relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>

                    <div className="flex items-center justify-between pl-1">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="text-sm font-mono font-extrabold text-white">{slotTime}</span>
                      </div>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        OCUPADO
                      </span>
                    </div>

                    <div className="space-y-1.5 pl-1">
                      {slotBookings.map((b) => {
                        const isCompleted = b.status === 'completed';
                        const isNoShow = b.status === 'no-show';
                        return (
                          <div key={b.id} className="bg-bg-dark-900/90 p-2 rounded-lg border border-border-dark space-y-1 text-xs">
                            <div className="flex items-start justify-between gap-1">
                              <div className="min-w-0 flex-1">
                                <span className="font-bold text-white text-xs truncate block">{b.clientName}</span>
                                <span className="text-text-muted text-[9px] truncate block">
                                  ✂️ {b.serviceName}
                                </span>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-[#c5a880] font-mono font-bold text-[10px] block">
                                  {b.status === 'recurring_fixed' ? 'Plano 👑' : `R$ ${b.serviceValue.toFixed(2).replace('.', ',')}`}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-1 pt-1 border-t border-border-dark/60 text-[10px]">
                              {isCompleted ? (
                                <span className="text-emerald-400 font-bold">Concluído ✅</span>
                              ) : isNoShow ? (
                                <span className="text-red-400 font-bold">Ausente ❌</span>
                              ) : (
                                <span className="text-text-muted">📞 {b.clientPhone}</span>
                              )}

                              <div className="flex items-center gap-1 shrink-0">
                                {!isCompleted && !isNoShow && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCompleteBooking(b);
                                      }}
                                      className="p-1 rounded bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500 hover:text-black font-bold transition-all cursor-pointer"
                                      title="Concluir Atendimento"
                                    >
                                      <CheckCircle2 className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleNoShowBooking(b);
                                      }}
                                      className="p-1 rounded bg-red-950/30 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-black font-bold transition-all cursor-pointer"
                                      title="Marcar Ausência"
                                    >
                                      <UserX className="w-3 h-3" />
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSendMessage(b);
                                  }}
                                  className="p-1 rounded bg-emerald-950/30 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 font-bold transition-all cursor-pointer"
                                  title="WhatsApp"
                                >
                                  <MessageSquare className="w-3 h-3" />
                                </button>
                                {b.status !== 'recurring_fixed' && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteBooking(b.id, b.clientName, b.date, b.time);
                                    }}
                                    className="p-1 rounded bg-red-950/30 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-black font-bold transition-all cursor-pointer"
                                    title="Cancelar"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SEARCH BAR FILTRATION (AVAILABLE IN LIST MODE OR EXTRA SEARCH) */}
        {viewMode === 'list' && (
          <>
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-text-muted" />
                <input
                  type="text"
                  placeholder="Pesquisar agendamento por nome do cliente, telefone, barbeiro ou serviço..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-bg-dark-800 border border-border-dark text-text-primary rounded-xl pl-10.5 pr-4 py-2.5 text-xs md:text-sm focus:outline-none focus:border-[#c5a880] transition-colors shadow-inner"
                />
              </div>

              {pendingPastBookings.length > 0 && (
                <label className="flex items-center gap-2 px-4 py-2.5 bg-amber-950/15 border border-amber-500/30 rounded-xl cursor-pointer select-none text-xs hover:border-[#c5a880]/50 transition-colors shrink-0 text-amber-400 font-semibold">
                  <input 
                    type="checkbox" 
                    checked={showOnlyPendingPast} 
                    onChange={(e) => {
                      setShowOnlyPendingPast(e.target.checked);
                      if (e.target.checked) {
                        setShowHistory(false);
                      }
                    }}
                    className="accent-amber-500 h-4 w-4 rounded border-border-dark bg-bg-dark-900 cursor-pointer"
                  />
                  <span>⚠️ Pendentes Passados ({pendingPastBookings.length})</span>
                </label>
              )}

              <label className="flex items-center gap-2 px-4 py-2.5 bg-bg-dark-800 border border-border-dark rounded-xl cursor-pointer select-none text-xs hover:border-[#c5a880]/50 transition-colors shrink-0 text-text-secondary font-semibold">
                <input 
                  type="checkbox" 
                  checked={showHistory} 
                  onChange={(e) => {
                    setShowHistory(e.target.checked);
                    if (e.target.checked) {
                      setShowOnlyPendingPast(false);
                    }
                  }}
                  className="accent-[#c5a880] h-4 w-4 rounded border-border-dark bg-bg-dark-900 cursor-pointer"
                />
                <span>Mostrar Concluídos e Passados</span>
              </label>
            </div>
          </>
        )}

        {/* DESKTOP TABLE VIEW */}
        <div className="hidden md:block bg-bg-dark-800 border border-border-dark rounded-xl overflow-hidden shadow-md">
          <table className="w-full text-left border-collapse select-none">
            <thead>
              <tr className="border-b border-border-dark text-[10px] font-bold uppercase text-text-muted tracking-wider bg-bg-dark-900/40">
                <th className="py-4 px-5">Cliente</th>
                <th className="py-4 px-4">Contatos</th>
                <th className="py-4 px-4">Barbeiro</th>
                <th className="py-4 px-4">Serviço Solicitado</th>
                <th className="py-4 px-4">Data e Hora</th>
                <th className="py-4 px-5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dark text-sm">
              {filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-text-muted italic bg-bg-dark-800">
                    Nenhum agendamento avulso correspondente encontrado.
                  </td>
                </tr>
              ) : (
                filteredBookings.map((b) => {
                  const dateFormatted = b.date.split('-').reverse().join('/');
                  const isToday = b.date === todayStr;
                  const isCompleted = b.status === 'completed';
                  const isNoShow = b.status === 'no-show';
                  const isPastUnresolved = !isCompleted && !isNoShow && isBookingInPast(b.date, b.time);
                  return (
                    <tr key={b.id} className={`hover:bg-bg-dark-750/30 transition-colors ${
                      isCompleted ? 'opacity-65 bg-bg-dark-900/30 line-through decoration-text-muted/30' : ''
                    } ${
                      isNoShow ? 'opacity-65 bg-red-950/10' : ''
                    } ${
                      isPastUnresolved ? 'bg-amber-950/10 border-l border-amber-500/50' : ''
                    }`}>
                      <td className="py-4 px-5">
                        <span className="font-bold text-text-primary">{b.clientName}</span>
                        {b.status === 'recurring_fixed' ? (
                          <span className="inline-block text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border border-[#c5a880]/30 text-[#c5a880] ml-2 bg-[#c5a880]/10 font-extrabold">
                            Mensalista 👑
                          </span>
                        ) : (
                          <span className="inline-block text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border border-border-dark text-text-muted ml-2 bg-bg-dark-900">
                            Avulso
                          </span>
                        )}
                        {b.status === 'recurring_fixed' ? (
                          <span className="inline-block text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border border-emerald-500/30 text-emerald-400 ml-2 bg-emerald-950/25">
                            Mensalidade em Dia ✅
                          </span>
                        ) : b.paymentStatus === 'paid' ? (
                          <span className="inline-block text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border border-emerald-500/30 text-emerald-400 ml-2 bg-emerald-950/25">
                            Pago via Pix MP 💰
                          </span>
                        ) : b.paymentMethod === 'mercado_pago_pix' ? (
                          <span className="inline-block text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border border-amber-500/30 text-amber-500 ml-2 bg-amber-950/25 animate-pulse">
                            Pix Pendente ⌛
                          </span>
                        ) : (
                          <span className="inline-block text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border border-border-dark text-text-muted ml-2 bg-bg-dark-900">
                            Presencial 💈
                          </span>
                        )}
                        {isPastUnresolved && b.status !== 'recurring_fixed' && (
                          <span className="inline-block text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border border-amber-500/30 text-amber-500 ml-2 bg-amber-950/25 animate-pulse">
                            Pendente (Tempo Passou)
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <div className="text-xs text-text-secondary font-mono font-bold flex items-center gap-1.5 select-all">
                          <Phone className="w-3 h-3 text-text-muted" />
                          {b.clientPhone}
                        </div>
                      </td>
                      <td className="py-4 px-4 font-bold text-white">
                        {b.barberName}
                      </td>
                      <td className="py-4 px-4">
                        <div className="space-y-0.5">
                          <div className="text-xs text-text-primary font-semibold flex items-center gap-1">
                            <Scissors className="w-3 h-3 text-text-muted" />
                            {b.serviceName}
                          </div>
                          <div className="text-brand-amber font-mono text-[10px] font-bold">
                            {b.status === 'recurring_fixed' ? (
                              <span>Plano de Assinatura ✨</span>
                            ) : (
                              <span>R$ {b.serviceValue.toFixed(2).replace('.', ',')}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          <div className={`text-xs font-bold font-mono px-2 py-0.5 rounded border inline-flex items-center gap-1 ${
                            isToday 
                              ? 'bg-amber-950/45 border-brand-amber-border text-brand-amber' 
                              : 'bg-bg-dark-900/60 border-border-dark text-text-secondary'
                          }`}>
                            <span>{dateFormatted}</span>
                            {isToday && <span className="text-[8px] font-extrabold uppercase ml-1 animate-pulse">(Hoje)</span>}
                          </div>
                          <div className="text-xs text-[#c5a880] font-mono font-bold flex items-center gap-1.5 pl-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            {b.time}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-5">
                        <div className="flex gap-2 justify-end items-center">
                          {b.status === 'recurring_fixed' ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#c5a880]/10 border border-[#c5a880]/30 text-[#c5a880] text-[10px] uppercase font-black tracking-wider">
                              👑 Horário Reservado
                            </span>
                          ) : isCompleted ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 text-[10px] uppercase font-bold tracking-wider">
                              ✓ Concluído
                            </span>
                          ) : isNoShow ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-950/40 border border-red-500/20 text-red-500 text-[10px] uppercase font-bold tracking-wider">
                              ✗ Ausente
                            </span>
                          ) : (
                            <>
                              <button
                                onClick={() => handleCompleteBooking(b)}
                                className={`p-2 border rounded-lg cursor-pointer transition-colors ${
                                  isPastUnresolved 
                                    ? 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400' 
                                    : 'border-border-dark hover:bg-[#c5a880]/15 text-[#c5a880]'
                                }`}
                                title={isPastUnresolved ? "Concluir serviço pendente" : "Marcar como Serviço Concluído"}
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleNoShowBooking(b)}
                                className={`p-2 border rounded-lg cursor-pointer transition-colors ${
                                  isPastUnresolved 
                                    ? 'border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-400' 
                                    : 'border-border-dark hover:bg-red-950/20 text-text-muted hover:text-red-400'
                                }`}
                                title="Marcar Falta (Não Compareceu)"
                              >
                                <UserX className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleSendMessage(b)}
                            className="p-2 border border-border-dark hover:bg-emerald-950/45 text-emerald-400 hover:text-emerald-300 rounded-lg cursor-pointer transition-colors"
                            title="Confirmar via WhatsApp"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                          {b.status !== 'recurring_fixed' && (
                            <button
                              onClick={() => handleDeleteBooking(b.id, b.clientName, b.date, b.time)}
                              className="p-2 border border-border-dark hover:bg-brand-danger-bg/40 text-brand-danger-text rounded-lg cursor-pointer transition-colors"
                              title="Cancelar Agendamento"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE VIEW CARDS */}
        <div className="md:hidden space-y-4 pb-8">
          {filteredBookings.length === 0 ? (
            <div className="bg-bg-dark-800 border border-border-dark border-dashed p-8 rounded-xl text-center text-text-muted text-xs">
              Nenhum agendamento avulso cadastrado correspondente encontrado.
            </div>
          ) : (
            filteredBookings.map((b) => {
              const dateFormatted = b.date.split('-').reverse().join('/');
              const isToday = b.date === todayStr;
              const isCompleted = b.status === 'completed';
              const isNoShow = b.status === 'no-show';
              const isPastUnresolved = !isCompleted && !isNoShow && isBookingInPast(b.date, b.time);
              return (
                <div key={b.id} className={`bg-bg-dark-800 border rounded-xl p-4.5 space-y-4 shadow-md flex flex-col justify-between transition-all ${
                  isCompleted ? 'border-emerald-500/20 opacity-65 bg-bg-dark-850/60 line-through decoration-text-muted/30' : 
                  isNoShow ? 'border-red-500/20 opacity-65 bg-bg-dark-850/60' :
                  isPastUnresolved ? 'border-amber-500/40 bg-amber-950/10' :
                  'border-border-dark'
                }`}>
                  <div className="flex items-start justify-between gap-3 font-sans">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="font-bold text-text-primary text-base leading-none">{b.clientName}</h3>
                        {b.status === 'recurring_fixed' ? (
                          <span className="text-[8px] font-bold uppercase bg-[#c5a880]/15 border border-[#c5a880]/30 text-[#c5a880] px-1 py-0.5 rounded font-extrabold">Mensalista 👑</span>
                        ) : (
                          <span className="text-[8px] font-bold uppercase bg-bg-dark-900 px-1 py-0.5 rounded border border-border-dark text-text-muted">Avulso</span>
                        )}
                        {b.status === 'recurring_fixed' ? (
                          <span className="text-[8px] font-bold uppercase bg-emerald-950/30 border border-emerald-500/30 text-emerald-400 px-1.5 py-0.5 rounded">Mensalidade em Dia ✅</span>
                        ) : b.paymentStatus === 'paid' ? (
                          <span className="text-[8px] font-bold uppercase bg-emerald-950/30 border border-emerald-500/30 text-emerald-400 px-1.5 py-0.5 rounded">Pago Pix MP 💰</span>
                        ) : b.paymentMethod === 'mercado_pago_pix' ? (
                          <span className="text-[8px] font-bold uppercase bg-amber-500/10 border border-amber-500/30 text-amber-500 px-1.5 py-0.5 rounded animate-pulse">Pix Pendente</span>
                        ) : (
                          <span className="text-[8px] font-bold uppercase bg-bg-dark-900 px-1 py-0.5 rounded border border-border-dark text-text-muted">No Salão</span>
                        )}
                        {isPastUnresolved && b.status !== 'recurring_fixed' && (
                          <span className="text-[8px] font-bold uppercase bg-amber-500/10 border border-amber-500/30 text-amber-500 px-1.5 py-0.5 rounded animate-pulse">Pendente</span>
                        )}
                        {isNoShow && b.status !== 'recurring_fixed' && (
                          <span className="text-[8px] font-bold uppercase bg-red-500/10 border border-red-500/30 text-red-500 px-1.5 py-0.5 rounded">Falta</span>
                        )}
                      </div>
                      <p className="text-xs text-[#c5a880] font-semibold">
                        {b.status === 'recurring_fixed' ? `${b.serviceName} • Horário Fixo` : b.serviceName} com {b.barberName}
                      </p>
                    </div>
 
                    <div className="flex gap-1 shrink-0 items-center">
                      {b.status === 'recurring_fixed' ? (
                        <span className="text-[9px] font-bold uppercase bg-[#c5a880]/10 border border-[#c5a880]/30 text-[#c5a880] px-2 py-1 rounded shrink-0">
                          👑 Reservado
                        </span>
                      ) : isCompleted ? (
                        <span className="text-[9px] font-bold uppercase bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 px-2 py-1 rounded shrink-0">
                          Concluído
                        </span>
                      ) : isNoShow ? (
                        <span className="text-[9px] font-bold uppercase bg-red-950/40 border border-red-500/20 text-red-400 px-2 py-1 rounded shrink-0">
                          Ausente
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => handleCompleteBooking(b)}
                            className={`p-2 border rounded-lg cursor-pointer transition-colors ${
                              isPastUnresolved 
                                ? 'border-amber-500/40 bg-amber-500/10 text-amber-500' 
                                : 'border-border-dark hover:bg-[#c5a880]/15 text-[#c5a880]'
                            }`}
                            title="Marcar como Serviço Concluído"
                          >
                            <CheckCircle2 className="w-4.5 h-4.5" />
                          </button>
                          <button
                            onClick={() => handleNoShowBooking(b)}
                            className={`p-2 border rounded-lg cursor-pointer transition-colors ${
                              isPastUnresolved 
                                ? 'border-red-500/40 bg-red-500/10 text-red-400' 
                                : 'border-border-dark hover:bg-red-950/20 text-text-muted hover:text-red-400'
                            }`}
                            title="Marcar Falta (Não Compareceu)"
                          >
                            <UserX className="w-4.5 h-4.5" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleSendMessage(b)}
                        className="p-2 border border-border-dark hover:bg-emerald-950/45 text-emerald-400 hover:text-emerald-300 rounded-lg cursor-pointer transition-colors"
                      >
                        <MessageSquare className="w-4.5 h-4.5" />
                      </button>
                      {b.status !== 'recurring_fixed' && (
                        <button
                          onClick={() => handleDeleteBooking(b.id, b.clientName, b.date, b.time)}
                          className="p-2 border border-border-dark hover:bg-brand-danger-bg/40 text-brand-danger-text rounded-lg cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-4.5 h-4.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-bg-dark-900/60 p-3 rounded-xl border border-border-dark/65 text-xs text-center select-none font-mono">
                    <div>
                      <div className="text-[8px] uppercase text-text-muted font-bold tracking-wider mb-1">Data</div>
                      <div className="text-text-primary font-bold flex gap-1 items-center justify-center">
                        <span>{dateFormatted}</span>
                        {isToday && <span className="w-1.5 h-1.5 bg-brand-amber rounded-full animate-ping"></span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-[8px] uppercase text-text-muted font-bold tracking-wider mb-1">Horário</div>
                      <div className="text-white font-bold">{b.time}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs border-t border-border-dark/65 pt-3 pl-1">
                    <span className="text-text-muted font-bold">R$ {b.serviceValue.toFixed(2).replace('.', ',')}</span>
                    <span className="text-text-primary font-mono select-all">📞 {b.clientPhone}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* WALK-IN / BALCÃO ADDITION MODAL */}
      <AnimatePresence>
        {showAddWalkInModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm select-none">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-bg-dark-800 border border-border-dark w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="px-4 sm:px-6 py-4 border-b border-border-dark flex items-center justify-between bg-bg-dark-850">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">💈</span>
                  <div>
                    <h3 className="text-sm sm:text-md font-bold text-white">Lançar Atendimento Balcão</h3>
                    <p className="text-[9px] sm:text-[10px] text-text-muted font-bold uppercase tracking-wider">Atendimento presencial sem agendamento prévio</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddWalkInModal(false)}
                  className="p-1.5 hover:bg-bg-dark-700 text-text-muted hover:text-white rounded-lg cursor-pointer transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveWalkIn} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                {/* Client selection type tabs */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-muted tracking-wider block mb-2">
                    Tipo de Cliente
                  </label>
                  <div className="grid grid-cols-2 gap-2 bg-bg-dark-900 p-1 rounded-xl border border-border-dark">
                    <button
                      type="button"
                      onClick={() => setNewBookingClientType('existing')}
                      className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        newBookingClientType === 'existing'
                          ? 'bg-[#c5a880] text-black shadow-md'
                          : 'text-text-secondary hover:text-white hover:bg-bg-dark-800'
                      }`}
                    >
                      Cliente Cadastrado
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewBookingClientType('new')}
                      className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        newBookingClientType === 'new'
                          ? 'bg-[#c5a880] text-black shadow-md'
                          : 'text-text-secondary hover:text-white hover:bg-bg-dark-800'
                      }`}
                    >
                      Cliente Novo (Não Cadastrado)
                    </button>
                  </div>
                </div>

                {/* Client choice field */}
                {newBookingClientType === 'existing' ? (
                  <div>
                    <label className="text-[10px] uppercase font-bold text-text-muted tracking-wider block mb-1.5">
                      Selecione o Cliente *
                    </label>
                    <select
                      value={newBookingSelectedClientId}
                      onChange={(e) => setNewBookingSelectedClientId(e.target.value)}
                      required
                      className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl px-3.5 py-2.5 text-xs md:text-sm focus:outline-none focus:border-[#c5a880] transition-colors shadow-inner"
                    >
                      <option value="">-- Escolha o Cliente Cadastrado --</option>
                      {clients
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.phone ? `(${c.phone})` : ''} {c.package ? `[Plano ${c.package}]` : ''}
                          </option>
                        ))}
                    </select>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-text-muted tracking-wider block mb-1.5">
                        Nome do Cliente *
                      </label>
                      <div className="relative">
                        <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                        <input
                          type="text"
                          required
                          value={newBookingClientName}
                          onChange={(e) => setNewBookingClientName(e.target.value)}
                          placeholder="Ex: João da Silva"
                          className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl pl-9.5 pr-3 py-2.5 text-xs md:text-sm focus:outline-none focus:border-[#c5a880] transition-colors shadow-inner"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-text-muted tracking-wider block mb-1.5">
                        WhatsApp / Celular
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                        <input
                          type="text"
                          value={newBookingClientPhone}
                          onChange={(e) => setNewBookingClientPhone(e.target.value)}
                          placeholder="Ex: (35) 99999-9999"
                          className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl pl-9.5 pr-3 py-2.5 text-xs md:text-sm focus:outline-none focus:border-[#c5a880] transition-colors shadow-inner"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Professional Choice */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-muted tracking-wider block mb-1.5">
                    Barbeiro / Atendente
                  </label>
                  <select
                    value={newBookingBarberId}
                    onChange={(e) => setNewBookingBarberId(e.target.value)}
                    className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl px-3.5 py-2.5 text-xs md:text-sm focus:outline-none focus:border-[#c5a880] transition-colors shadow-inner"
                  >
                    <option value={user.uid}>Você / Administrador ({user.displayName})</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Service Selection */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-text-muted tracking-wider block mb-1.5">
                    Serviço Realizado *
                  </label>
                  <select
                    value={newBookingServiceId}
                    onChange={(e) => setNewBookingServiceId(e.target.value)}
                    required
                    className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl px-3.5 py-2.5 text-xs md:text-sm focus:outline-none focus:border-[#c5a880] transition-colors shadow-inner"
                  >
                    <option value="">-- Escolha o Serviço --</option>
                    {services.map((svc) => (
                      <option key={svc.id} value={svc.id}>
                        {svc.name} - R$ {Number(svc.value).toFixed(2).replace('.', ',')}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date and Time selectors */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-text-muted tracking-wider block mb-1.5">
                      Data *
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                      <input
                        type="date"
                        required
                        value={newBookingDate}
                        onChange={(e) => setNewBookingDate(e.target.value)}
                        className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl pl-9.5 pr-3 py-2.5 text-xs md:text-sm focus:outline-none focus:border-[#c5a880] transition-colors shadow-inner font-sans"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-text-muted tracking-wider block mb-1.5">
                      Horário *
                    </label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                      <input
                        type="time"
                        required
                        value={newBookingTime}
                        onChange={(e) => setNewBookingTime(e.target.value)}
                        className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl pl-9.5 pr-3 py-2.5 text-xs md:text-sm focus:outline-none focus:border-[#c5a880] transition-colors shadow-inner font-sans"
                      />
                    </div>
                  </div>
                </div>

                {/* Clash Notice */}
                {newBookingDate && newBookingTime && bookings.some(b => 
                  b.date === newBookingDate && 
                  b.time === newBookingTime && 
                  b.barberId === newBookingBarberId &&
                  b.status !== 'completed' &&
                  b.status !== 'no-show'
                ) && (
                  <div className="p-3 bg-indigo-500/10 border border-indigo-500/25 rounded-xl flex items-start gap-2.5 text-indigo-400">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-indigo-400" />
                    <div className="text-[11px] leading-relaxed text-left">
                      <span className="font-bold block text-indigo-300">Aviso: Horário Ocupado</span>
                      Este horário já possui outro agendamento ativo. 
                      Como você é o <strong>Barbeiro</strong>, você tem a permissão especial de realizar agendamentos em cima do outro (duplo agendamento). O sistema salvará normalmente!
                    </div>
                  </div>
                )}

                {/* Status Selection and Payment info */}
                <div className="p-4 rounded-xl bg-bg-dark-900 border border-border-dark/65 space-y-3.5">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-text-muted tracking-wider block mb-2">
                      Estado do Atendimento
                    </label>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <label className="flex-1 flex items-start gap-2.5 px-3 py-2.5 bg-bg-dark-800 border border-border-dark rounded-xl cursor-pointer select-none text-xs hover:border-[#c5a880]/50 transition-colors text-emerald-400 font-semibold min-w-0">
                        <input
                          type="radio"
                          name="walkin_status"
                          checked={newBookingStatus === 'completed'}
                          onChange={() => setNewBookingStatus('completed')}
                          className="accent-emerald-500 h-4 w-4 shrink-0 mt-0.5"
                        />
                        <div className="text-left flex-1 min-w-0">
                          <span className="block font-bold leading-tight">Concluir Imediatamente</span>
                          <span className="block text-[10px] text-text-muted font-normal mt-1 leading-normal">Sobe direto para o histórico/controles</span>
                        </div>
                      </label>
                      <label className="flex-1 flex items-start gap-2.5 px-3 py-2.5 bg-bg-dark-800 border border-border-dark rounded-xl cursor-pointer select-none text-xs hover:border-[#c5a880]/50 transition-colors text-amber-400 font-semibold min-w-0">
                        <input
                          type="radio"
                          name="walkin_status"
                          checked={newBookingStatus === 'pending'}
                          onChange={() => setNewBookingStatus('pending')}
                          className="accent-amber-500 h-4 w-4 shrink-0 mt-0.5"
                        />
                        <div className="text-left flex-1 min-w-0">
                          <span className="block font-bold leading-tight">Agendar / Deixar Ativo</span>
                          <span className="block text-[10px] text-text-muted font-normal mt-1 leading-normal">Ficará na lista ativa para concluir depois</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  {newBookingStatus === 'completed' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-border-dark/50">
                      <div>
                        <label className="text-[9px] uppercase font-bold text-text-muted tracking-wider block mb-1">
                          Pagamento
                        </label>
                        <select
                          value={newBookingPaymentMethod}
                          onChange={(e) => setNewBookingPaymentMethod(e.target.value as any)}
                          className="w-full bg-bg-dark-800 border border-border-dark text-text-primary rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#c5a880] transition-colors"
                        >
                          <option value="establishment">No Balcão 💈</option>
                          <option value="pix">Via Pix ⚡</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] uppercase font-bold text-text-muted tracking-wider block mb-1">
                          Situação Pago
                        </label>
                        <select
                          value={newBookingPaymentStatus}
                          onChange={(e) => setNewBookingPaymentStatus(e.target.value as any)}
                          className="w-full bg-bg-dark-800 border border-border-dark text-text-primary rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#c5a880] transition-colors"
                        >
                          <option value="pending">Pendente (Receber depois)</option>
                          <option value="paid">Confirmado Pago 👍</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Submit action buttons */}
                <div className="pt-4 border-t border-border-dark flex items-center justify-end gap-3.5">
                  <button
                    type="button"
                    onClick={() => setShowAddWalkInModal(false)}
                    className="px-4 py-2.5 text-xs font-bold text-text-secondary hover:text-white transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 text-xs font-bold bg-[#c5a880] hover:bg-[#c5a880]/90 text-black rounded-xl cursor-pointer active:scale-95 transition-all shadow-md flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    <span>Lançar Atendimento</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
