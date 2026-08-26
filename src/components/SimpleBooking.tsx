import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  query, 
  where,
  getDocs,
  doc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { Barber, Service } from '../types';
import { initials, consolidateServicesList } from '../utils';
import SupportChat from './SupportChat';
import { 
  Scissors, 
  Calendar, 
  Clock, 
  User as UserIcon, 
  Phone, 
  CheckCircle, 
  ArrowLeft, 
  ChevronRight,
  Sparkles,
  Instagram,
  MapPin,
  Search,
  Trash2,
  MessageSquare,
  CreditCard,
  Copy,
  Check,
  ExternalLink,
  QrCode,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  X,
  ShieldCheck
} from 'lucide-react';

const BARBER_FALLBACK_PHOTOS = [
  'https://images.unsplash.com/photo-1621605815971-fbc98d665033?q=80&w=250&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=250&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=250&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?q=80&w=250&auto=format&fit=crop'
];

interface SimpleBookingProps {
  onClose: () => void;
  barbeariaId?: string;
}

export default function SimpleBooking({ onClose, barbeariaId }: SimpleBookingProps) {
  // Real data
  const [barbeariaInfo, setBarbeariaInfo] = useState<any>(null);
  const [barbers, setBarbers] = useState<any[]>([]);
  const [allServices, setAllServices] = useState<Service[]>([]);
  const [existingBookings, setExistingBookings] = useState<{ date: string; time: string; barberId: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Form selections
  const [selectedBarber, setSelectedBarber] = useState<any | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(''); // YYYY-MM-DD
  const [selectedTime, setSelectedTime] = useState<string>(''); // HH:MM
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');

  // UI state
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1); // 1: Barber, 2: Service, 3: DateTime, 4: Identification
  const [bookingFinished, setBookingFinished] = useState(false);
  const [finishedDetails, setFinishedDetails] = useState<any>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [hasAutoRedirected, setHasAutoRedirected] = useState(false);

  // Client cancellation & booking tracking state
  const [activeTab, setActiveTab] = useState<'booking' | 'my-bookings'>('booking');
  const [showPlanPromo, setShowPlanPromo] = useState(true);
  const [viewPlanDetails, setViewPlanDetails] = useState(false);
  const [submittingError, setSubmittingError] = useState<string | null>(null);
  const [searchPhone, setSearchPhone] = useState('');
  const [allBarbeariaBookings, setAllBarbeariaBookings] = useState<any[]>([]);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState<string | null>(null);

  // Mercado Pago States
  const [mpConfigured, setMpConfigured] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'presencial' | 'mercado_pago_pix'>('presencial');
  const [payingState, setPayingState] = useState<'idle' | 'generating' | 'waiting' | 'approved' | 'failed'>('idle');
  const [pixQrCodeBase64, setPixQrCodeBase64] = useState('');
  const [pixCopyPaste, setPixCopyPaste] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [pixExpiresIn, setPixExpiresIn] = useState(600); // 10 minutes countdown
  const [copiedPix, setCopiedPix] = useState(false);

  // Check Mercado Pago Configuration on Mount
  useEffect(() => {
    fetch('/api/mercado-pago/config')
      .then(res => res.json())
      .then(data => {
        if (data.configured) {
          setMpConfigured(true);
        }
      })
      .catch(err => console.error('Erro ao verificar config do Mercado Pago:', err));
  }, []);

  // Check URL search parameters for automatic routing to cancellation
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const consultar = params.get('consultar');
      const tel = params.get('tel');
      if (consultar === 'true') {
        setActiveTab('my-bookings');
        if (tel) {
          setSearchPhone(decodeURIComponent(tel));
        }
      }
    } catch (e) {
      console.error('Error parsing search parameters:', e);
    }
  }, []);

  // Poll payment status & manage countdown timer
  useEffect(() => {
    if (payingState !== 'waiting' || !paymentId) return;

    // Countdown Timer decrement
    const timer = setInterval(() => {
      setPixExpiresIn(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setPayingState('failed');
          setSubmittingError('O tempo limite para o pagamento Pix expirou. Por favor, tente novamente.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Polling Mercado Pago Payment Status
    const statusPoll = setInterval(async () => {
      try {
        const headers: Record<string, string> = {};
        if (barbeariaInfo?.mercadoPagoAccessToken) {
          headers["x-access-token"] = barbeariaInfo.mercadoPagoAccessToken;
        }

        const res = await fetch(`/api/mercado-pago/payment-status/${paymentId}`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'approved') {
            clearInterval(statusPoll);
            clearInterval(timer);
            
            // Payment approved! Proceed with booking confirmation.
            const parsedValue = Number(selectedService?.value) || 0;
            const responseDetails = {
              barbeariaId: barbeariaId || selectedBarber?.id || '',
              barberId: selectedBarber?.id || '',
              barberName: selectedBarber?.name || '',
              barberPhone: barbeariaInfo?.phone || selectedBarber?.phone || '',
              serviceId: selectedService?.id || '',
              serviceName: selectedService?.name || '',
              serviceValue: parsedValue,
              date: selectedDate,
              time: selectedTime,
              clientName: clientName.trim(),
              clientPhone: clientPhone.trim(),
              createdAt: new Date().toISOString(),
              paymentStatus: 'paid',
              paymentMethod: 'mercado_pago_pix',
              paymentId: paymentId
            };

            // Save booking to Firestore
            const bookingCol = collection(db, 'guest_bookings');
            await addDoc(bookingCol, responseDetails);

            setFinishedDetails(responseDetails);
            setPayingState('approved');
            setBookingFinished(true);
          } else if (data.status === 'rejected' || data.status === 'cancelled') {
            clearInterval(statusPoll);
            clearInterval(timer);
            setPayingState('failed');
            setSubmittingError('O pagamento Pix foi recusado ou cancelado no Mercado Pago. Tente novamente.');
          }
        }
      } catch (err) {
        console.error("Erro ao verificar status do pagamento Pix:", err);
      }
    }, 2500);

    return () => {
      clearInterval(timer);
      clearInterval(statusPoll);
    };
  }, [payingState, paymentId, selectedService, selectedBarber, selectedDate, selectedTime, clientName, clientPhone, barbeariaId, barbeariaInfo]);

  // Sync barbearia info, professionals, and overall services
  useEffect(() => {
    let unsubBarbearia = () => {};
    let unsubBarbers = () => {};
    let unsubServices = () => {};

    if (barbeariaId) {
      // 1. Sync specific Barbearia metadata
      const bDocRef = doc(db, 'barbers', barbeariaId);
      unsubBarbearia = onSnapshot(bDocRef, (docSnap) => {
        if (docSnap.exists()) {
          setBarbeariaInfo({ id: docSnap.id, ...docSnap.data() });
        }
      }, (err) => console.error('Error syncing barbearia metadata info:', err));

      // 2. Sync sub-barbers (employees of this active Barbearia)
      const empColRef = collection(db, 'barber_employees');
      const q = query(empColRef, where('barbeariaId', '==', barbeariaId));
      unsubBarbers = onSnapshot(q, (snap) => {
        const list: any[] = [];
        snap.forEach(docSnap => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        list.sort((a, b) => a.name.localeCompare(b.name));
        setBarbers(list);
      }, (err) => console.error('Error syncing staff employees list:', err));

    } else {
      // Old fallback (sync all barbers/barbearias in the directory)
      const refBarbers = collection(db, 'barbers');
      unsubBarbers = onSnapshot(refBarbers, (snap) => {
        const list: any[] = [];
        snap.forEach(docSnap => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        list.sort((a, b) => a.name.localeCompare(b.name));
        setBarbers(list);
      }, (err) => console.error('Error syncing barbers fallback directory:', err));
    }

    // 3. Sync services
    const refServices = collection(db, 'services');
    unsubServices = onSnapshot(refServices, (snap) => {
      const list: Service[] = [];
      snap.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Service);
      });
      setAllServices(list);
      setLoading(false);
    }, (err) => {
      console.error('Error syncing collection services lists:', err);
      setLoading(false);
    });

    // Safeguard timeout for mobile / slow networks
    const fallbackTimer = setTimeout(() => {
      setLoading(false);
    }, 3500);

    return () => {
      unsubBarbearia();
      unsubBarbers();
      unsubServices();
      clearTimeout(fallbackTimer);
    };
  }, [barbeariaId]);

  // Sync all guest bookings of this barbearia to support active tracking and cancellations
  useEffect(() => {
    const targetId = barbeariaId || (selectedBarber ? selectedBarber.id : null);
    if (!targetId) return;

    const refBookings = collection(db, 'guest_bookings');
    const unsub = onSnapshot(refBookings, (snap) => {
      const list: any[] = [];
      snap.forEach(docSnap => {
        const d = docSnap.data();
        if (d.barbeariaId === targetId) {
          list.push({ id: docSnap.id, ...d });
        }
      });
      setAllBarbeariaBookings(list);
    }, (err) => console.error('Error syncing all barbearia bookings:', err));

    return () => unsub();
  }, [barbeariaId, selectedBarber]);

  // Sync booked slots for selected barber on real-time to avoid duplicate/clash
  useEffect(() => {
    if (!selectedBarber) return;

    const refBookings = collection(db, 'guest_bookings');
    const unsubBookings = onSnapshot(refBookings, (snap) => {
      const list: { date: string; time: string; barberId: string }[] = [];
      snap.forEach(docSnap => {
        const d = docSnap.data();
        if (d.barberId === selectedBarber.id) {
          list.push({ date: d.date, time: d.time, barberId: d.barberId });
        }
      });
      setExistingBookings(list);
    });

    return () => unsubBookings();
  }, [selectedBarber]);

  // Generates next available days for quick choosing, aligned with barber's weekly schedule settings
  const getNext7Days = () => {
    const days = [];
    const today = new Date();
    const weekdayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    // Custom weekly active days configuration
    const activeDaysRaw = selectedBarber?.scheduleSettings?.workingDays ?? 
                          barbeariaInfo?.scheduleSettings?.workingDays ?? 
                          [1, 2, 3, 4, 5, 6];
    const activeDays = Array.isArray(activeDaysRaw) ? activeDaysRaw.map((v: any) => Number(v)) : [1, 2, 3, 4, 5, 6];

    // Read up to 21 future calendar days to find active workdays
    for (let i = 0; i < 21; i++) {
      const d = new Date();
      d.setDate(today.getDate() + i);
      
      if (!activeDays.includes(d.getDay())) {
        continue;
      }

      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const fullStr = `${yyyy}-${mm}-${dd}`;
      
      days.push({
        dateStr: fullStr,
        dayNum: d.getDate(),
        weekday: weekdayNames[d.getDay()],
        month: monthNames[d.getMonth()]
      });

      if (days.length >= 9) break;
    }
    return days;
  };

  const daysList = getNext7Days().length > 0 ? getNext7Days() : [
    {
      dateStr: new Date().toISOString().split('T')[0],
      dayNum: new Date().getDate(),
      weekday: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][new Date().getDay()],
      month: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][new Date().getMonth()]
    }
  ];

  // List of professional work schedules
  const getBusinessHoursForSelectedDate = () => {
    let dayOfWeek: number | null = null;
    if (selectedDate) {
      const parts = selectedDate.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        dayOfWeek = d.getDay();
      }
    }

    if (dayOfWeek !== null) {
      // 1. Check selectedBarber's day-specific hours
      const barberDsh = selectedBarber?.scheduleSettings?.daySpecificHours;
      if (barberDsh && typeof barberDsh === 'object') {
        const barberDayHours = barberDsh[dayOfWeek] ?? barberDsh[String(dayOfWeek)];
        if (Array.isArray(barberDayHours)) return barberDayHours;
      }

      // 2. Fallback to barbearia's day-specific hours
      const barbeariaDsh = barbeariaInfo?.scheduleSettings?.daySpecificHours;
      if (barbeariaDsh && typeof barbeariaDsh === 'object') {
        const barbeariaDayHours = barbeariaDsh[dayOfWeek] ?? barbeariaDsh[String(dayOfWeek)];
        if (Array.isArray(barbeariaDayHours)) return barbeariaDayHours;
      }
    }

    return selectedBarber?.scheduleSettings?.workingHours ?? 
           barbeariaInfo?.scheduleSettings?.workingHours ?? [
      '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', 
      '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
      '17:00', '17:30', '18:00', '18:30', '19:00', '19:30'
    ];
  };

  const businessHours = getBusinessHoursForSelectedDate();

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

  // Helper to check if a date and time slot has already passed or is too close (min 45 mins advance notice)
  const isSlotInPast = (dateStr: string, timeStr: string) => {
    if (!dateStr || !timeStr) return false;
    try {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;
      
      if (dateStr < todayStr) return true;
      if (dateStr === todayStr) {
        const [hStr, mStr] = timeStr.split(':');
        const slotHour = parseInt(hStr, 10);
        const slotMin = parseInt(mStr, 10);
        
        // Convert current time and slot time to total minutes of the day
        const currentTotalMinutes = today.getHours() * 60 + today.getMinutes();
        const slotTotalMinutes = slotHour * 60 + slotMin;
        
        // Require at least 45 minutes of advance notice
        if (slotTotalMinutes < currentTotalMinutes + 45) {
          return true;
        }
      }
      return false;
    } catch (e) {
      return false;
    }
  };

  // Helper to check if hour is already taken on selected date for chosen barber
  const isSlotTaken = (timeStr: string) => {
    if (!selectedDate) return false;

    // 1. Check standard guest bookings
    const isBooked = existingBookings.some(b => b.date === selectedDate && b.time === timeStr);
    if (isBooked) return true;

    // 2. Check recurring subscriber slots (mensalistas)
    // Merge recurring slots from both the specific selected professional (if any) and the global barbearia config to ensure complete coverage.
    // This is vital because recurring slots are stored on the main barbearia's configuration document (barbeariaInfo) and we want them to remain active even when an employee/barber is selected.
    const allSlots = [
      ...(barbeariaInfo?.scheduleSettings?.recurringSlots || []),
      ...(selectedBarber?.scheduleSettings?.recurringSlots || [])
    ];
    // Filter to ensure unique slots by unique ID
    const uniqueSlotsMap = new Map();
    allSlots.forEach(slot => {
      if (slot && slot.id) {
        uniqueSlotsMap.set(slot.id, slot);
      }
    });
    const recurringSlots = Array.from(uniqueSlotsMap.values());

    if (recurringSlots.length > 0) {
      const parts = selectedDate.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday, ...

        const hasRecurringMatch = recurringSlots.some((slot: any) => {
          if (slot.dayOfWeek !== dayOfWeek || slot.time !== timeStr) return false;
          
          // Verify if active relative to start date
          if (slot.startDate && selectedDate < slot.startDate) return false;
          
          // Verify if active relative to expiry date
          if (slot.expiryDate && selectedDate > slot.expiryDate) return false;

          // If frequency is biweekly, check if it falls on an active week (even weeks from startDate)
          if (slot.frequency === 'biweekly') {
            const p1 = getWeekParity(slot.startDate || '2026-01-05');
            const p2 = getWeekParity(selectedDate);
            if (p1 !== p2) return false;
          }

          return true;
        });

        if (hasRecurringMatch) return true;
      }
    }

    return false;
  };

  // Dynamic list of active professionals (supporting fallback to the owner Barbearia if no employees are configured yet)
  const activeProfessionals = [...barbers];
  if (barbeariaId && activeProfessionals.length === 0 && barbeariaInfo) {
    activeProfessionals.push({
      id: barbeariaInfo.id,
      name: barbeariaInfo.name,
      avatarUrl: barbeariaInfo.avatarUrl || '',
      phone: barbeariaInfo.phone || ''
    });
  }

  // Services belonging to this Barbearia (ownerId === barbeariaId)
  const barberServices = allServices.filter(s => {
    if (barbeariaId) {
      return s.ownerId === barbeariaId;
    }
    return selectedBarber ? s.ownerId === selectedBarber.id : false;
  });

  // We show all three plans as default, customizable by the barber
  const customPlans = barbeariaInfo?.plans || {};

  const activePlansToShow = React.useMemo(() => {
    const custom = barbeariaInfo?.plans ? Object.keys(barbeariaInfo.plans) : [];
    if (custom.length > 0) {
      const order = ['Básico', 'Premium', 'VIP'];
      const sorted = order.filter(k => custom.includes(k));
      const others = custom.filter(k => !order.includes(k));
      return [...sorted, ...others];
    }
    return ['Básico', 'Premium', 'VIP'];
  }, [barbeariaInfo]);

  const defaultPlans = {
    Básico: {
      title: 'Plano Essencial',
      price: 70,
      desc: 'Ideal para quem precisa de manutenção básica quinzenal.',
      badge: 'BÁSICO',
      defaultServices: ['2x Cortes Simples (Máquina/Tesoura)', 'Agendamento prioritário online', 'Acesso ao Portal de Créditos']
    },
    Premium: {
      title: 'Plano Cavalheiro',
      price: 120,
      desc: 'O plano perfeito para manter cabelo e barba sempre alinhados.',
      badge: 'PREMIUM',
      defaultServices: ['3x Cortes Completos (Cabelo)', '1x Barba Completa com Toalha Quente', 'Agendamento prioritário online', 'Acesso ao Portal de Créditos']
    },
    VIP: {
      title: 'Plano Executivo',
      price: 200,
      desc: 'Experiência ultra completa para o homem exigente.',
      badge: 'VIP EXPERIENCE',
      defaultServices: ['Cortes e Barbas (3x Pacotes VIP)', '1x Hidratação Profissional inclusa', '1x Sobrancelha inclusa', 'Bebida cortesia em cada visita 🍻']
    }
  };

  const planInfoLookup = React.useMemo(() => {
    const lookup: Record<string, {
      title: string;
      price: number;
      desc: string;
      badge: string;
      defaultServices: string[];
    }> = {};

    activePlansToShow.forEach(id => {
      const saved = customPlans[id] || {};
      const def = defaultPlans[id as 'Básico' | 'Premium' | 'VIP'] || {
        title: saved.name || id,
        price: 100,
        desc: 'Plano personalizado de assinatura.',
        badge: id.toUpperCase(),
        defaultServices: ['Serviços inclusos na assinatura']
      };

      lookup[id] = {
        title: saved.name || def.title,
        price: Number(saved.price !== undefined ? saved.price : def.price),
        desc: saved.desc || def.desc,
        badge: saved.badge || def.badge,
        defaultServices: consolidateServicesList((saved.services || def.defaultServices) as string[])
      };
    });

    return lookup;
  }, [activePlansToShow, customPlans]);

  const gridClass = activePlansToShow.length === 1
    ? 'grid grid-cols-1 max-w-sm mx-auto gap-5 pt-2'
    : activePlansToShow.length === 2
    ? 'grid grid-cols-1 md:grid-cols-2 max-w-2xl mx-auto gap-5 pt-2'
    : 'grid grid-cols-1 md:grid-cols-3 gap-5 pt-2';

  const handleNextStep = () => {
    if (currentStep === 1 && selectedBarber) {
      setCurrentStep(2);
    } else if (currentStep === 2 && selectedService) {
      setCurrentStep(3);
    } else if (currentStep === 3 && selectedDate && selectedTime) {
      setCurrentStep(4);
    }
  };

  const handleBackStep = () => {
    if (currentStep === 4) setCurrentStep(3);
    else if (currentStep === 3) setCurrentStep(2);
    else if (currentStep === 2) setCurrentStep(1);
    else onClose();
  };

  const formatWhatsAppNumber = (phoneStr: string) => {
    // Remove formatting characters
    const clean = phoneStr.replace(/\D/g, '');
    if (!clean) return '';
    // If it lacks Brazilian country code (55), assume it and verify length
    if (clean.length === 11 || clean.length === 10) {
      return `55${clean}`;
    }
    return clean;
  };

  const getWhatsAppPlanLink = (planName: string) => {
    if (!barbeariaInfo?.phone) return '#';
    const cleanPhone = formatWhatsAppNumber(barbeariaInfo.phone);
    if (!cleanPhone) return '#';
    const salonName = barbeariaInfo?.name || 'Royal Cuts';
    const text = encodeURIComponent(`Olá! Vi a opção do Clube de Assinatura da *${salonName}* e gostaria de assinar o plano *${planName}*! ✂️💎`);
    return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${text}`;
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBarber || !selectedService || !selectedDate || !selectedTime || !clientName.trim() || !clientPhone.trim()) {
      return;
    }

    setBookingLoading(true);
    setSubmittingError(null);

    try {
      const parsedValue = Number(selectedService.value) || 0;

      if (paymentMethod === 'mercado_pago_pix') {
        setPayingState('generating');
        
        const res = await fetch("/api/mercado-pago/create-pix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: parsedValue,
            description: `Reserva: ${selectedService.name} com ${selectedBarber.name}`,
            clientName: clientName.trim(),
            clientPhone: clientPhone.trim(),
            customAccessToken: barbeariaInfo?.mercadoPagoAccessToken || undefined
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Ocorreu um erro ao gerar a cobrança Pix.");
        }

        setPixQrCodeBase64(data.qrCodeBase64);
        setPixCopyPaste(data.qrCode);
        setPaymentId(data.paymentId);
        setPixExpiresIn(600); // 10 minutes reset
        setPayingState('waiting');
        return; // wait for polling to complete the booking!
      }

      const responseDetails = {
        barbeariaId: barbeariaId || selectedBarber.id,
        barberId: selectedBarber.id,
        barberName: selectedBarber.name,
        barberPhone: barbeariaInfo?.phone || selectedBarber.phone || '',
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        serviceValue: parsedValue,
        date: selectedDate,
        time: selectedTime,
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
        createdAt: new Date().toISOString(),
        paymentStatus: 'pending',
        paymentMethod: 'establishment'
      };

      // Add to firestore
      const bookingCol = collection(db, 'guest_bookings');
      await addDoc(bookingCol, responseDetails);

      setFinishedDetails(responseDetails);
      setBookingFinished(true);
    } catch (err: any) {
      console.error('Error reserving guest slot:', err);
      setPayingState('idle');
      setSubmittingError('Falha ao processar o agendamento. Detalhes: ' + (err.message || err));
    } finally {
      setBookingLoading(false);
    }
  };

  const handleSendWhatsApp = (isAuto: boolean = false) => {
    if (!finishedDetails) return;

    const barberPhone = finishedDetails.barberPhone || '';
    const cleanPhone = formatWhatsAppNumber(barberPhone);
    
    const dateFormatted = finishedDetails.date.split('-').reverse().join('-');
    const cancelUrl = `${window.location.origin}${window.location.pathname}?barbearia=${finishedDetails.barbeariaId || barbeariaId || ''}&consultar=true&tel=${encodeURIComponent(finishedDetails.clientPhone)}`;

    const salonName = barbeariaInfo?.name || 'Royal Cuts';
    const message = `* * * * 💈 *COMPROVANTE* *DE* *AGENDAMENTO* * * * *\n\n` +
      `Olá! Fiz um agendamento na *${salonName}* e estou enviando o comprovante para confirmar meu horário:\n\n` +
      `=-=-=-=-=-=-=-=-=-=-=-=-=-==-=-=\n` +
      `👥 *CLIENTE:* *${finishedDetails.clientName}*\n` +
      `💇🏽‍♂️ *PROFISSIONAL:* *${finishedDetails.barberName}*\n` +
      `✂️ *SERVIÇO:* *${finishedDetails.serviceName}* - R$ ${finishedDetails.serviceValue.toFixed(2).replace('.', ',')}\n` +
      `📆 *DATA:* *${dateFormatted}*\n` +
      `⏰ *HORÁRIO:* *${finishedDetails.time}*\n` +
      `=-=-=-=-=-=-=-=-=-=-=-=-=-==-=-=\n\n` +
      `⚠️ *CONFIRMAÇÃO OBRIGATÓRIA:*\n` +
      `• Por favor, confirme meu horário acima! 💈✂️\n\n` +
      `🔗 *VER OU CANCELAR SEU HORÁRIO:*\n` +
      `👉 ${cancelUrl}\n\n` +
      `Muito obrigado! Nos vemos em breve.`;

    const encodedText = encodeURIComponent(message);
    const whatsappUrl = cleanPhone 
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`
      : `https://api.whatsapp.com/send?text=${encodedText}`;

    if (isAuto) {
      try {
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isMobile) {
          const mobileUrl = cleanPhone
            ? `whatsapp://send?phone=${cleanPhone}&text=${encodedText}`
            : `whatsapp://send?text=${encodedText}`;
          try {
            if (window.top) {
              window.top.location.href = mobileUrl;
            } else {
              window.location.href = mobileUrl;
            }
          } catch {
            window.location.href = mobileUrl;
          }

          setTimeout(() => {
            try {
              if (window.top) {
                window.top.location.href = whatsappUrl;
              } else {
                window.location.href = whatsappUrl;
              }
            } catch {
              window.location.href = whatsappUrl;
            }
          }, 1500);
        } else {
          try {
            if (window.top) {
              window.top.location.href = whatsappUrl;
            } else {
              window.open(whatsappUrl, '_blank');
            }
          } catch {
            window.open(whatsappUrl, '_blank');
          }
        }
      } catch (err) {
        console.error('Error auto-redirecting to WhatsApp:', err);
        window.location.href = whatsappUrl;
      }
      return;
    }

    try {
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile) {
        const mobileUrl = cleanPhone
          ? `whatsapp://send?phone=${cleanPhone}&text=${encodedText}`
          : `whatsapp://send?text=${encodedText}`;
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

  // Automatic redirect to WhatsApp on booking completion
  useEffect(() => {
    if (bookingFinished && finishedDetails && !hasAutoRedirected) {
      setHasAutoRedirected(true);
      const timeout = setTimeout(() => {
        handleSendWhatsApp(true);
      }, 1500); // Give 1.5 seconds to see confirmation details before opening WhatsApp
      return () => clearTimeout(timeout);
    }
  }, [bookingFinished, finishedDetails, hasAutoRedirected]);

  if (loading) {
    return (
      <div className="h-screen bg-bg-dark-900 flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="w-12 h-12 border-4 border-[#c5a880] border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-[#c5a880] text-sm font-semibold tracking-wider animate-pulse">
          ABRINDO SISTEMA DE AGENDAMENTO...
        </p>
      </div>
    );
  }

  // Double Check Finished View
  if (bookingFinished && finishedDetails) {
    const formattedDate = finishedDetails.date.split('-').reverse().join('/');
    return (
      <div className="h-screen overflow-y-auto w-full bg-bg-dark-900 flex items-center justify-center px-4 py-8 font-sans select-none text-text-primary">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-bg-dark-800 border border-border-dark w-full max-w-md rounded-2xl p-6 shadow-2xl relative overflow-hidden flex flex-col items-center text-center space-y-6"
        >
          {/* Fictional golden background ornament splash */}
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-amber-600 via-[#c5a880] to-amber-600"></div>
          
          <div className="w-16 h-16 rounded-full bg-emerald-950/45 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mt-4 animate-bounce">
            <CheckCircle className="w-10 h-10 stroke-[2.5]" />
          </div>

          <div>
            <h2 className="font-display font-bold text-2xl text-white">Agendamento Realizado!</h2>
            <p className="text-xs text-text-secondary mt-1.5 leading-normal">
              Seu horário de atendimento está pré-reservado no salão.
            </p>
          </div>

          {/* URGENT WARNING BANNER ABOUT COMPROVANTE & AUTOMATIC CANCELLATION */}
          <div className="w-full bg-gradient-to-br from-red-950/90 via-amber-950/80 to-red-950/90 border-2 border-red-500/80 rounded-2xl p-4 shadow-2xl flex flex-col items-center text-center space-y-3 relative overflow-hidden">
            <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-red-500/10 rounded-full blur-xl pointer-events-none"></div>

            <div className="flex items-center gap-2 bg-red-500/25 px-3 py-1.5 rounded-full border border-red-500/50 shadow-sm">
              <AlertTriangle className="w-4 h-4 text-amber-400 animate-bounce shrink-0" />
              <span className="text-[11px] font-black uppercase text-amber-300 tracking-wider">
                ⚠️ AVISO OBRIGATÓRIO DE CONFIRMAÇÃO
              </span>
            </div>

            <p className="text-xs sm:text-sm font-extrabold text-white leading-relaxed">
              O seu horário <span className="text-amber-300 underline decoration-red-500 decoration-2 underline-offset-4 uppercase">SÓ SERÁ RESERVADO</span> após o envio do comprovante no WhatsApp do barbeiro!
            </p>

            <div className="bg-black/60 border border-red-500/40 rounded-xl p-3 text-[11px] text-amber-100 font-semibold leading-normal w-full space-y-1">
              <div className="text-red-400 font-black text-xs uppercase flex items-center justify-center gap-1">
                <span>🚨 CASO NÃO ENVIE O COMPROVANTE:</span>
              </div>
              <p className="text-text-primary text-[11px]">
                Seu horário <strong className="text-red-400 underline uppercase">será cancelado automaticamente</strong> e disponibilizado para outro cliente.
              </p>
            </div>
          </div>

          {/* WhatsApp redirect notice */}
          <div className="w-full bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-3 flex flex-col items-center space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-bold text-emerald-400">Redirecionando para o WhatsApp...</span>
            </div>
            <p className="text-[10px] text-text-muted text-center leading-normal">
              O WhatsApp será aberto para você enviar o comprovante ao barbeiro. Se não abrir, clique no botão verde abaixo!
            </p>
          </div>

          {/* Ticket Information card */}
          <div className="w-full bg-bg-dark-900/65 rounded-xl border border-border-dark p-4.5 text-left text-xs space-y-3 font-mono">
            <div className="flex justify-between items-center pb-2 border-b border-border-dark/60">
              <span className="text-[10px] text-text-muted uppercase tracking-wider font-sans font-bold">Resumo do Ticket</span>
              <span className="text-[#c5a880] text-[10px] font-bold">#SIMPLES</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-text-secondary">Barbeiro:</span>
              <span className="text-white font-bold">{finishedDetails.barberName}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-text-secondary">Serviço:</span>
              <span className="text-white font-bold">{finishedDetails.serviceName}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-text-secondary">Valor:</span>
              <span className="text-brand-amber font-bold">
                R$ {finishedDetails.serviceValue.toFixed(2).replace('.', ',')}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-text-secondary">Data:</span>
              <span className="text-white font-bold">{formattedDate}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-text-secondary">Horário:</span>
              <span className="text-[#c5a880] font-bold">{finishedDetails.time}</span>
            </div>

            <div className="border-t border-border-dark/60 pt-2.5 flex justify-between">
              <span className="text-text-secondary">Cliente:</span>
              <span className="text-text-primary font-bold truncate max-w-[170px]">{finishedDetails.clientName}</span>
            </div>
          </div>

          <div className="w-full space-y-2.5 pt-2">
            <button
              onClick={() => handleSendWhatsApp(false)}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-xl transition-all transform hover:scale-[1.01] active:scale-100 text-sm"
            >
              <svg className="w-5 h-5 fill-current shrink-0" viewBox="0 0 24 24">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm4.846-3.896V20.1a9.927 9.927 0 0 1 5.922 1.942l.424.252a10.024 10.024 0 0 0 5.46-1.595l.392-.233 4.092 1.071-1.091-3.991.24-.382a10.038 10.038 0 0 0 1.543-5.364c.002-5.526-4.433-10.024-9.882-10.024-5.462 0-9.886 4.498-9.888 10.026-.001 1.906.516 3.766 1.498 5.32l.275.437-1.127 4.12 4.152-1.088zm13.125-6.702c.071-.12.262-.191.562-.34.301-.15 1.776-.874 2.046-.974.271-.1.452-.15.642.14.19.29.733.913.898 1.1.166.19.33.21.631.06.301-.15 1.258-.464 2.39-1.474.88-.785 1.474-1.756 1.647-2.055.174-.3.018-.462-.132-.61l-.412-.479c-.15-.175-.24-.3-.36-.5-.12-.2-.06-.375-.03-.524.03-.15.301-.913.411-1.189.109-.271.211-.231.3-.231h.256c.196 0 .512.072.78.36.269.29 1.025 1.002 1.025 2.441s-1.045 2.827-1.196 3.023c-.15.195-2.055 3.138-4.978 4.398-.696.3-1.238.48-1.662.614-.7.225-1.338.193-1.84.119-.561-.082-1.724-.704-1.967-1.385-.24-.68-.24-1.267-.17-1.388z"/>
              </svg>
              <span>📲 ENVIAR COMPROVANTE NO WHATSAPP</span>
            </button>

            <button
              onClick={() => {
                setBookingFinished(false);
                setFinishedDetails(null);
                setHasAutoRedirected(false);
                setSelectedTime('');
                setCurrentStep(1);
                setActiveTab('booking');
              }}
              className="w-full bg-[#c5a880] hover:bg-[#c5a880]/90 text-black text-xs font-bold py-3 px-4 rounded-xl cursor-pointer shadow transition-colors"
            >
              Fazer Outro Agendamento 📅
            </button>

            <button
              onClick={() => {
                if (finishedDetails?.clientPhone) {
                  setSearchPhone(finishedDetails.clientPhone);
                }
                setBookingFinished(false);
                setFinishedDetails(null);
                setHasAutoRedirected(false);
                setSelectedTime('');
                setCurrentStep(1);
                setActiveTab('my-bookings');
              }}
              className="w-full bg-bg-dark-750 hover:bg-bg-dark-700 border border-border-dark text-text-primary text-xs font-bold py-3 px-4 rounded-xl cursor-pointer shadow transition-colors"
            >
              Ver Meus Agendamentos 🔍
            </button>

            <button
              onClick={onClose}
              className="w-full text-text-muted hover:text-white text-[11px] font-bold py-2 px-4 rounded-xl cursor-pointer transition-colors text-center"
            >
              Sair / Ir para o Início
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div 
      className="h-[100dvh] w-full max-w-full overflow-x-hidden overflow-y-hidden bg-bg-dark-900 flex flex-col font-sans text-text-primary relative touch-none"
      style={{ touchAction: 'none' }}
    >
      
      {/* Immersive Client Portal Custom Background */}
      {barbeariaInfo?.loginBgUrl && (
        <div 
          className="absolute inset-0 bg-cover bg-center z-0 transition-opacity duration-1000" 
          style={{ 
            backgroundImage: `url('${barbeariaInfo.loginBgUrl}')` 
          }}
        >
          <div className="absolute inset-0 bg-black/85 backdrop-blur-[2px]"></div>
        </div>
      )}

      {/* Top Banner Branding */}
      <header className="px-5 py-4 border-b border-border-dark bg-bg-dark-800/90 backdrop-blur-sm flex items-center justify-between shrink-0 shadow-md relative z-10">
        <button
          onClick={handleBackStep}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-white transition-colors cursor-pointer py-1.5 px-2.5 rounded-lg hover:bg-bg-dark-750"
        >
          <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
          <span>Voltar</span>
        </button>

        <div className="font-display font-bold text-base flex items-center gap-2 text-white">
          <Scissors className="w-4.5 h-4.5 text-[#c5a880]" />
          <span>
            <span className="text-[#c5a880]">{barbeariaInfo?.name || 'Royal Cuts'}</span> · Agendamento
          </span>
        </div>

        <div className="w-14"></div> {/* Balance Spacer */}
      </header>

      {/* Steps Indicator Tracker */}
      <div className="bg-bg-dark-850/90 backdrop-blur-sm px-5 py-2.5 border-b border-border-dark flex justify-between items-center text-[10px] uppercase font-bold text-text-muted tracking-wider shrink-0 relative z-10 w-full max-w-full overflow-hidden">
        <div className="flex items-center gap-2 sm:gap-4.5 overflow-x-auto min-w-0 shrink whitespace-nowrap scrollbar-none py-0.5">
          <span className={currentStep === 1 ? 'text-brand-amber font-extrabold' : ''}>1. Barbeiro</span>
          <ChevronRight className="w-3 h-3 text-border-dark shrink-0" />
          <span className={currentStep === 2 ? 'text-brand-amber font-extrabold' : ''}>2. Serviço</span>
          <ChevronRight className="w-3 h-3 text-border-dark shrink-0" />
          <span className={currentStep === 3 ? 'text-brand-amber font-extrabold' : ''}>3. Data/Hora</span>
          <ChevronRight className="w-3 h-3 text-border-dark shrink-0" />
          <span className={currentStep === 4 ? 'text-brand-amber font-extrabold' : ''}>4. Confirmação</span>
        </div>
        <div className="text-[#c5a880] shrink-0 font-display flex items-center gap-1 pl-2">
          <Sparkles className="w-3 h-3" />
          <span className="hidden sm:inline">Modo Público</span>
        </div>
      </div>

      {/* Active Step Panel Body */}
      <main 
        className="flex-1 overflow-y-auto overflow-x-hidden p-5 pb-40 md:p-8 md:pb-16 max-w-2xl w-full mx-auto space-y-6 relative z-10 touch-pan-y"
        style={{ touchAction: 'pan-y' }}
      >
        {payingState === 'generating' && (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 font-sans animate-fade-in bg-bg-dark-800 border border-border-dark rounded-2xl p-6">
            <div className="w-12 h-12 border-4 border-[#c5a880] border-t-transparent rounded-full animate-spin"></div>
            <div className="space-y-1">
              <h3 className="font-bold text-white text-base">Gerando cobrança Pix</h3>
              <p className="text-xs text-text-secondary max-w-xs mx-auto">Seu horário está sendo pré-reservado. Estamos gerando o código QR do Mercado Pago...</p>
            </div>
          </div>
        )}

        {payingState === 'waiting' && (
          <div className="bg-bg-dark-800 border border-border-dark rounded-2xl p-6 shadow-2xl space-y-6 font-sans animate-fade-in relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#c5a880]/40 via-[#c5a880] to-[#c5a880]/40"></div>
            
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-500 text-[10px] font-bold uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                Aguardando Pagamento Pix
              </div>
              <h2 className="font-display font-bold text-lg text-white">Escaneie ou copie o código Pix</h2>
              <p className="text-xs text-text-secondary leading-relaxed">
                Para confirmar seu agendamento de <span className="text-[#c5a880] font-bold">R$ {Number(selectedService?.value).toFixed(2).replace('.', ',')}</span> com <span className="text-white font-bold">{selectedBarber?.name}</span>.
              </p>
            </div>

            {/* QR Code Presentation */}
            {pixQrCodeBase64 ? (
              <div className="flex flex-col items-center justify-center bg-white p-4 rounded-xl max-w-[200px] mx-auto shadow border border-border-dark/20 relative">
                <img 
                  src={`data:image/png;base64,${pixQrCodeBase64}`} 
                  alt="Mercado Pago Pix QR Code"
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-36 bg-bg-dark-900/60 rounded-xl border border-border-dark">
                <QrCode className="w-10 h-10 text-text-muted animate-pulse" />
              </div>
            )}

            {/* Copy-Paste Key Box */}
            <div className="space-y-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-text-muted pl-1">Código Pix Copia e Cola:</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={pixCopyPaste}
                  className="flex-1 bg-bg-dark-900 border border-border-dark rounded-xl px-3 py-3 text-xs text-text-primary focus:outline-none font-mono truncate"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(pixCopyPaste);
                    setCopiedPix(true);
                    setTimeout(() => setCopiedPix(false), 2000);
                  }}
                  className="bg-[#c5a880] hover:bg-[#c5a880]/90 text-black font-bold px-4 py-3 rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Copy className="w-4 h-4" />
                  <span>{copiedPix ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
            </div>

            {/* Auto polling status */}
            <div className="bg-bg-dark-900/50 rounded-xl border border-border-dark p-4 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-[#c5a880] border-t-transparent rounded-full animate-spin"></div>
                <span className="text-text-secondary font-medium animate-pulse">Detectando pagamento automaticamente...</span>
              </div>
              <div className="text-right text-[11px] font-mono font-bold text-amber-500">
                {Math.floor(pixExpiresIn / 60)}:{(pixExpiresIn % 60).toString().padStart(2, '0')}
              </div>
            </div>

            {/* Back action */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setPayingState('idle');
                  setSubmittingError(null);
                }}
                className="w-full btn btn-ghost text-xs font-bold border border-border-dark hover:bg-bg-dark-750 py-3 rounded-xl cursor-pointer text-text-secondary transition-colors"
              >
                Cancelar e Voltar para Identificação
              </button>
            </div>
          </div>
        )}

        {payingState === 'idle' && (
          <>
            {/* Tab Selection Switcher */}
        {currentStep === 1 && (
          <div className="flex bg-bg-dark-800 p-1 rounded-xl border border-border-dark/60">
            <button
              onClick={() => setActiveTab('booking')}
              className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                activeTab === 'booking'
                  ? 'bg-brand-amber text-[#1a0e00] shadow font-extrabold'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Agendar Horário
            </button>
            <button
              onClick={() => setActiveTab('my-bookings')}
              className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                activeTab === 'my-bookings'
                  ? 'bg-brand-amber text-[#1a0e00] shadow font-extrabold'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Meus Agendamentos
            </button>
          </div>
        )}

        {/* TAB 2: MY BOOKINGS TRACKING & CANCELLATION */}
        {activeTab === 'my-bookings' && currentStep === 1 && (
          <div className="space-y-5 animate-fade-in font-sans">
            {/* Header / Intro */}
            <div className="text-center sm:text-left space-y-1">
              <h3 className="text-base font-bold text-text-primary">Consultar e Cancelar Reservas</h3>
              <p className="text-xs text-text-secondary">
                Digite seu número de telefone abaixo para buscar seus agendamentos nesta barbearia.
              </p>
            </div>

            {/* Input Search Block */}
            <div className="bg-bg-dark-800 border border-border-dark p-5 rounded-2xl flex flex-col sm:flex-row gap-3 shadow-lg">
              <div className="relative flex-1">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="tel"
                  placeholder="Seu telefone (DDD + Número)"
                  value={searchPhone}
                  onChange={(e) => {
                    setSearchPhone(e.target.value);
                    setCancelError(null);
                    setCancelSuccess(null);
                  }}
                  className="w-full bg-bg-dark-850 hover:bg-bg-dark-750 text-text-primary border border-border-dark rounded-xl pl-9 pr-4 py-3 text-xs font-semibold focus:outline-none focus:border-brand-amber transition-all"
                />
              </div>
              <button
                type="button"
                className="bg-brand-amber hover:bg-brand-amber-hover text-[#1a0e00] font-sans font-bold text-xs py-3 px-6 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-95 shrink-0"
              >
                <Search className="w-4 h-4" />
                <span>Atualizar</span>
              </button>
            </div>

            {/* Warning and Success notices */}
            {cancelError && (
              <div className="bg-brand-danger-text/10 border border-brand-danger-border/30 text-brand-danger-text p-4 rounded-xl text-xs font-medium animate-fade-in">
                {cancelError}
              </div>
            )}
            {cancelSuccess && (
              <div className="bg-emerald-600/15 border border-emerald-500/30 text-emerald-400 p-4 rounded-xl text-xs font-medium animate-fade-in flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>{cancelSuccess}</span>
              </div>
            )}

            {/* Booking list results */}
            <div className="space-y-3">
              {(() => {
                const cleanQuery = searchPhone.replace(/\D/g, '');
                
                if (!cleanQuery) {
                  return (
                    <div className="bg-bg-dark-800 border border-border-dark/50 rounded-2xl p-6 text-center text-xs text-text-muted">
                      Digite o número do seu celular acima para carregar sua agenda.
                    </div>
                  );
                }

                // filter allBarbeariaBookings by cleaned phone
                const filtered = allBarbeariaBookings.filter(b => b.clientPhone && b.clientPhone.replace(/\D/g, '') === cleanQuery);

                if (filtered.length === 0) {
                  return (
                    <div className="bg-bg-dark-800 border border-border-dark/50 rounded-2xl p-6 text-center text-xs text-text-muted">
                      Nenhum agendamento ativo encontrado para este telefone.
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    <p className="text-[10px] uppercase font-bold text-text-muted tracking-wider px-1">
                      Agendamentos ativos encontrados: {filtered.length}
                    </p>
                    
                    {filtered.map(booking => {
                      // Check cancellation constraint (2 hours policy)
                      const [year, month, day] = booking.date.split('-').map(Number);
                      const [hour, minute] = booking.time.split(':').map(Number);
                      const bookingDate = new Date(year, month - 1, day, hour, minute, 0);
                      const now = new Date();
                      const diffMs = bookingDate.getTime() - now.getTime();
                      const diffHours = diffMs / (1000 * 60 * 60);
                      const canSelfCancel = diffHours >= 2;

                      const formattedDate = booking.date.split('-').reverse().join('/');

                      return (
                        <div key={booking.id} className="bg-bg-dark-800 border border-border-dark rounded-2xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 hover:border-border-dark-hover transition-colors shadow-lg">
                          <div className="grow space-y-1">
                            <div className="flex items-center gap-2.5">
                              <span className="text-sm font-bold text-text-primary">{booking.serviceName}</span>
                              <span className="bg-[#c5a880]/15 text-[#c5a880] text-[10px] font-bold px-2 py-0.5 rounded-full">
                                {booking.time}
                              </span>
                            </div>
                            
                            <div className="text-[11px] text-text-secondary space-y-0.5">
                              <p>Data: <strong className="text-text-primary">{formattedDate}</strong></p>
                              <p>Profissional: <strong className="text-text-primary">{booking.barberName}</strong></p>
                              <p>Cliente: <strong className="text-text-primary">{booking.clientName}</strong></p>
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 pt-2.5 md:pt-0 border-t md:border-t-0 border-border-dark/40 shrink-0">
                            {canSelfCancel ? (
                              <button
                                type="button"
                                disabled={cancelingId === booking.id}
                                onClick={async () => {
                                  if (!window.confirm(`Tem certeza de que deseja cancelar seu agendamento de ${booking.serviceName} no dia ${formattedDate} às ${booking.time}?`)) {
                                    return;
                                  }
                                  setCancelError(null);
                                  setCancelSuccess(null);
                                  setCancelingId(booking.id);
                                  try {
                                    const docRef = doc(db, 'guest_bookings', booking.id);
                                    await deleteDoc(docRef);
                                    setCancelSuccess(`Agendamento de ${booking.serviceName} para o dia ${formattedDate} foi cancelado com sucesso.`);
                                  } catch (error) {
                                    console.error('Error canceling client booking:', error);
                                    setCancelError('Falha ao cancelar o agendamento no banco de dados. Tente mais tarde.');
                                  } finally {
                                    setCancelingId(null);
                                  }
                                }}
                                className="bg-brand-danger hover:bg-brand-danger-hover text-white font-bold text-[11px] py-2 px-4 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95"
                              >
                                {cancelingId === booking.id ? (
                                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                                <span>Cancelar Reserva</span>
                              </button>
                            ) : (
                              <div className="flex flex-col gap-1.5 items-stretch md:items-end w-full">
                                <span className="text-[10px] text-brand-danger-text font-bold uppercase text-center md:text-right bg-brand-danger-bg p-1.5 rounded-lg border border-brand-danger-border/30">
                                  Bloqueado (menos de 2h restante)
                                </span>
                                <a
                                  href={`https://wa.me/${formatWhatsAppNumber(booking.barberPhone || '')}?text=Olá!%20Gostaria%20de%20solicitar%20o%20cancelamento%20ou%20remarcação%20do%20meu%20agendamento%20de%20${encodeURIComponent(booking.serviceName)}%20no%20dia%20${formattedDate}%20às%23${booking.time}.%20Meu%20nome%20é%20${encodeURIComponent(booking.clientName)}.`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 text-center transition-all align-middle"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  <span>Contatar via WhatsApp</span>
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* STEP 1: SELECT BARBER */}
        {currentStep === 1 && activeTab === 'booking' && (
          <div className="space-y-4 font-sans">
            {/* Custom Barbearia branding header */}
            {barbeariaInfo && (
              <div className="bg-bg-dark-800 border border-border-dark rounded-2xl overflow-hidden shadow-xl mb-6">
                {/* Banner */}
                {barbeariaInfo.bannerUrl ? (
                  <div className="h-32 sm:h-40 w-full overflow-hidden bg-bg-dark-750 relative">
                    <img 
                      src={barbeariaInfo.bannerUrl} 
                      alt="Banner Capa" 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-bg-dark-800 via-black/30 to-transparent" />
                  </div>
                ) : (
                  <div className="h-20 w-full bg-gradient-to-r from-bg-dark-850 to-bg-dark-750" />
                )}

                {/* Info Container */}
                <div className="p-5 -mt-10 relative flex flex-col items-center sm:items-start sm:flex-row gap-4">
                  {/* Logo/Avatar */}
                  <div className="shrink-0">
                    {barbeariaInfo.logoUrl || barbeariaInfo.avatarUrl ? (
                      <img 
                        src={barbeariaInfo.logoUrl || barbeariaInfo.avatarUrl} 
                        alt="Logo" 
                        referrerPolicy="no-referrer"
                        className="w-20 h-20 rounded-full object-cover border-2 border-[#c5a880] shadow bg-zinc-900"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-[#1e1e1f] border-2 border-[#c5a880] flex items-center justify-center font-display font-extrabold text-[#c5a880] text-2xl shadow">
                        {barbeariaInfo.name ? barbeariaInfo.name.slice(0, 2).toUpperCase() : 'B'}
                      </div>
                    )}
                  </div>

                  {/* Text details */}
                  <div className="text-center sm:text-left space-y-1 pt-1 sm:pt-8 grow">
                    <h2 className="font-display font-extrabold text-xl text-white tracking-tight">
                      {barbeariaInfo.name}
                    </h2>
                    {barbeariaInfo.slogan && (
                      <p className="text-xs text-text-secondary italic max-w-md">
                        "{barbeariaInfo.slogan}"
                      </p>
                    )}

                    {/* Contacts & Address line */}
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3 text-[11px] text-text-muted">
                      {barbeariaInfo.phone && (
                        <div className="flex items-center gap-1 bg-bg-dark-900 px-2 rounded-lg border border-border-dark/65 font-mono">
                          <Phone className="w-3 h-3 text-[#c5a880]" />
                          <span>{barbeariaInfo.phone}</span>
                        </div>
                      )}
                      
                      {barbeariaInfo.instagram && (
                        <a 
                          href={`https://instagram.com/${barbeariaInfo.instagram}`} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="flex items-center gap-1 bg-bg-dark-900 px-2 rounded-lg border border-border-dark hover:border-[#c5a880] hover:text-white transition-all"
                        >
                          <Instagram className="w-3 h-3 text-[#c5a880]" />
                          <span>@{barbeariaInfo.instagram}</span>
                        </a>
                      )}

                      {barbeariaInfo.address && (
                        <div className="flex items-center gap-1 bg-bg-dark-900 px-2 rounded-lg border border-border-dark/65 w-full sm:w-auto">
                          <MapPin className="w-3 h-3 text-[#c5a880] shrink-0" />
                          <span className="truncate max-w-[280px]" title={barbeariaInfo.address}>{barbeariaInfo.address}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="text-center sm:text-left">
              <h3 className="text-lg font-bold text-white font-display">Quem irá cuidar do seu visual?</h3>
              <p className="text-xs text-text-secondary mt-1">Selecione o profissional de sua preferência abaixo para visualizar a agenda:</p>
            </div>

            {activeProfessionals.length === 0 ? (
              <div className="bg-bg-dark-800 border border-border-dark rounded-xl p-8 text-center text-text-muted italic text-xs">
                Nenhum profissional está disponível no momento.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {activeProfessionals.map((b, idx) => {
                  const isSelected = selectedBarber?.id === b.id;
                  const randomPortrait = b.avatarUrl || BARBER_FALLBACK_PHOTOS[idx % BARBER_FALLBACK_PHOTOS.length];
                  return (
                    <button
                      key={b.id}
                      onClick={() => {
                        setSelectedBarber(b);
                        setSelectedService(null); // Reset downstream
                        setSelectedTime('');
                        setCurrentStep(2); // Auto proceed is friendly!
                      }}
                      className={`relative flex items-center gap-4 p-4 rounded-xl border text-left cursor-pointer transition-all ${
                        isSelected 
                          ? 'bg-[#c5a880]/10 border-[#c5a880] shadow-[0_4px_15px_rgba(197,168,128,0.15)] ring-1 ring-[#c5a880]' 
                          : 'bg-bg-dark-800 border-border-dark hover:border-text-muted hover:bg-bg-dark-750'
                      }`}
                    >
                      {b.avatarUrl ? (
                        <img 
                          src={randomPortrait} 
                          alt={b.name} 
                          referrerPolicy="no-referrer"
                          className="w-14 h-14 rounded-full object-cover border border-border-dark shadow-inner" 
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-[#c5a880]/10 border border-[#c5a880]/30 flex items-center justify-center font-display font-extrabold text-[#c5a880] shrink-0">
                          {initials(b.name)}
                        </div>
                      )}
                      <div className="grow">
                        <h4 className="font-bold text-white text-sm tracking-tight">{b.name}</h4>
                        <p className="text-[10px] text-[#c5a880] uppercase font-bold tracking-widest mt-1">Profissional Parceiro</p>
                      </div>
                      
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-[#c5a880] flex items-center justify-center text-black">
                          <CheckCircle className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Banner promocional do Clube de Assinatura */}
            {showPlanPromo && (
              <div className="relative bg-gradient-to-br from-[#c5a880]/10 via-[#c5a880]/5 to-transparent border border-[#c5a880]/20 rounded-2xl p-4.5 mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 overflow-hidden animate-fade-in shadow-[0_4px_25px_rgba(197,168,128,0.06)]">
                {/* Background ambient glow */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#c5a880]/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
                
                <div className="flex gap-3.5 items-start">
                  <div className="p-2.5 bg-[#c5a880]/15 border border-[#c5a880]/25 rounded-xl text-[#c5a880] shrink-0 mt-0.5 animate-pulse">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] bg-[#c5a880] text-black font-extrabold uppercase px-1.5 py-0.5 rounded tracking-wider">
                        Clube VIP 💎
                      </span>
                      <h4 className="text-sm font-bold text-white font-display">Economize cortando o mês inteiro!</h4>
                    </div>
                    <p className="text-xs text-text-secondary max-w-md leading-relaxed">
                      Assine um plano mensal de créditos e mantenha seu estilo impecável com até <span className="text-[#c5a880] font-semibold">35% de desconto</span>.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end z-10">
                  <button
                    type="button"
                    onClick={() => setViewPlanDetails(true)}
                    className="flex-1 sm:flex-initial bg-[#c5a880] hover:bg-[#c5a880]/90 text-black text-xs font-bold px-4 py-2.5 rounded-xl transition-all cursor-pointer shadow hover:shadow-[0_4px_12px_rgba(197,168,128,0.2)] active:scale-[0.98]"
                  >
                    Ver Planos
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPlanPromo(false)}
                    className="p-2.5 hover:bg-bg-dark-750 text-text-muted hover:text-white rounded-xl transition-colors border border-border-dark/60 cursor-pointer flex items-center justify-center"
                    title="Fechar anúncio"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: SELECT SERVICE */}
        {currentStep === 2 && selectedBarber && (
          <div className="space-y-4">
            <div className="text-center sm:text-left flex items-center gap-3 border-b border-border-dark/60 pb-3">
              {selectedBarber.avatarUrl ? (
                <img 
                  src={selectedBarber.avatarUrl} 
                  alt={selectedBarber.name} 
                  className="w-10 h-10 rounded-full object-cover border border-[#c5a880]/30 shrink-0" 
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#c5a880]/10 border border-[#c5a880]/30 flex items-center justify-center font-display font-medium text-[#c5a880] text-xs shrink-0">
                  {initials(selectedBarber.name)}
                </div>
              )}
              <div>
                <h3 className="text-sm font-bold text-white font-sans">{selectedBarber.name}</h3>
                <p className="text-[10px] text-[#c5a880] font-bold uppercase tracking-wider">Qual serviço deseja realizar?</p>
              </div>
            </div>

            {barberServices.length === 0 ? (
              <div className="bg-bg-dark-800 border border-border-dark rounded-xl p-8 text-center text-text-muted italic text-xs">
                Nenhum serviço avulso configurado por este barbeiro ainda.
              </div>
            ) : (
              <div className="space-y-3">
                {barberServices.map((s) => {
                  const isSelected = selectedService?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        setSelectedService(s);
                        setSelectedTime(''); // Reset downstream
                        setCurrentStep(3); // Auto proceed is friendly!
                      }}
                      className={`w-full relative flex items-center justify-between p-4.5 rounded-xl border text-left cursor-pointer transition-all gap-4 ${
                        isSelected 
                          ? 'bg-[#c5a880]/15 border-[#c5a880] shadow-[0_4px_15px_rgba(197,168,128,0.15)] ring-1 ring-[#c5a880]' 
                          : 'bg-bg-dark-800 border-border-dark hover:border-text-muted hover:bg-bg-dark-750'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 grow min-w-0">
                        {s.imageUrl && (
                          <img 
                            src={s.imageUrl} 
                            alt={s.name} 
                            className="w-14 h-14 rounded-lg object-cover border border-border-dark shrink-0"
                            referrerPolicy="no-referrer"
                          />
                        )}
                        <div className="space-y-1 min-w-0 grow">
                          <h4 className="font-bold text-white text-sm truncate">{s.name}</h4>
                          {s.desc && <p className="text-text-muted text-xs leading-normal line-clamp-2">{s.desc}</p>}
                          <span className="inline-block text-[9px] font-bold uppercase py-0.5 px-2 bg-bg-dark-900 rounded border border-border-dark text-text-muted mt-1 font-sans">
                            Avulso
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-brand-amber font-mono font-bold text-sm block">
                          R$ {(s.value ? Number(s.value) : 0).toFixed(2).replace('.', ',')}
                        </span>
                        {isSelected && (
                          <span className="text-[10px] text-[#c5a880] font-bold uppercase tracking-wide block mt-1.5 font-sans">Selecionado</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* STEP 3: DATE & TIME */}
        {currentStep === 3 && selectedBarber && selectedService && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-border-dark/60 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#c5a880]/10 flex items-center justify-center text-[#c5a880]">
                  <Calendar className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Agendamento de Horário</h3>
                  <p className="text-[10px] text-[#c5a880] font-bold mt-0.5">{selectedService.name} — R$ {(selectedService.value ? Number(selectedService.value) : 0).toFixed(2).replace('.', ',')}</p>
                </div>
              </div>
            </div>

            {/* Date Pill Picker Header */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-text-secondary flex items-center gap-1.5 pl-1">
                <span>1. Escolha a data disponível:</span>
              </label>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                {daysList.map((day) => {
                  const isSelDate = selectedDate === day.dateStr;
                  return (
                    <button
                      type="button"
                      key={day.dateStr}
                      onClick={() => {
                        setSelectedDate(day.dateStr);
                        setSelectedTime(''); // Reset time upon date changing to avoid clash
                      }}
                      className={`py-3 px-2 rounded-xl border flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                        isSelDate
                          ? 'bg-[#c5a880]/20 border-[#c5a880] text-white font-extrabold shadow-md ring-1 ring-[#c5a880]'
                          : 'bg-bg-dark-800 border-border-dark text-text-secondary hover:bg-bg-dark-750 hover:text-text-primary'
                      }`}
                    >
                      <span className="text-[9px] uppercase tracking-wider font-bold mb-0.5 text-text-muted">{day.weekday}</span>
                      <span className="text-base font-bold tracking-tight leading-none">{day.dayNum}</span>
                      <span className="text-[9px] uppercase font-semibold mt-1 opacity-75">{day.month}</span>
                    </button>
                  );
                })}
              </div>

              {/* Native Calendar Picker Input for comfort */}
              <div className="pt-2">
                <input
                  type="date"
                  value={selectedDate}
                  min={daysList[0].dateStr}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setSelectedTime('');
                  }}
                  className="w-full bg-bg-dark-800 border border-border-dark text-text-primary rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:border-[#c5a880] transition-colors inline-block"
                />
              </div>
            </div>

            {/* Time slot picker */}
            {selectedDate && (
              <div className="space-y-3 pt-2">
                <label className="text-xs font-semibold text-text-secondary flex items-center gap-1.5 pl-1">
                  <Clock className="w-4 h-4 text-brand-amber shrink-0" />
                  <span>2. Horários disponíveis para este dia:</span>
                </label>

                <div className="grid grid-cols-4 gap-2">
                  {(() => {
                    const availableHours = businessHours.filter((hour) => {
                      const isTaken = isSlotTaken(hour);
                      const isPast = isSlotInPast(selectedDate, hour);
                      return !isTaken && !isPast;
                    });

                    if (availableHours.length === 0) {
                      return (
                        <div id="no-available-slots" className="col-span-4 p-5 text-center text-xs text-text-secondary bg-bg-dark-800 border border-border-dark rounded-xl flex flex-col items-center justify-center gap-1.5">
                          <span className="text-lg">📭</span>
                          <span className="font-bold text-text-primary">Sem horários disponíveis</span>
                          <span>Todos os horários para este dia já foram reservados ou já passaram.</span>
                        </div>
                      );
                    }

                    return availableHours.map((hour) => {
                      const isSelTime = selectedTime === hour;
                      return (
                        <button
                          type="button"
                          key={hour}
                          id={`btn-time-slot-${hour.replace(':', '-')}`}
                          onClick={() => {
                            setSelectedTime(hour);
                          }}
                          className={`py-2.5 rounded-lg border text-xs font-bold text-center cursor-pointer transition-all ${
                            isSelTime
                              ? 'bg-[#c5a880]/20 border-[#c5a880] text-white shadow'
                              : 'bg-bg-dark-800 border-border-dark text-text-primary hover:border-text-muted hover:bg-bg-dark-750'
                          }`}
                        >
                          {hour}
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {/* Navigation action step */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-bg-dark-850/95 border-t border-border-dark backdrop-blur-md flex justify-end z-30 sm:relative sm:bottom-auto sm:left-auto sm:right-auto sm:p-0 sm:border-t-0 sm:bg-transparent sm:backdrop-blur-none sm:z-auto sm:mt-4">
              <button
                type="button"
                disabled={!selectedDate || !selectedTime}
                onClick={handleNextStep}
                className="w-full sm:w-auto btn bg-[#c5a880] hover:bg-[#c5a880]/90 text-black text-xs font-bold px-6 py-3 rounded-xl cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow transition-colors flex items-center justify-center gap-1.5 active:scale-[0.98]"
              >
                <span>Avançar para Identificação</span>
                <ChevronRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: CLIENT IDENTIFICATION */}
        {currentStep === 4 && selectedBarber && selectedService && selectedDate && selectedTime && (
          <form onSubmit={handleCreateBooking} className="space-y-5">
            <div className="bg-bg-dark-850 p-4 rounded-xl border border-border-dark text-xs space-y-2 font-sans">
              <h4 className="font-bold text-white uppercase tracking-wider mb-2 text-[#c5a880]">Confirmação de Reserva Extrema</h4>
              <p className="text-text-secondary">Você está reservando o serviço <b>{selectedService.name}</b> de <b>R$ {(selectedService.value ? Number(selectedService.value) : 0).toFixed(2).replace('.', ',')}</b> com <b>{selectedBarber.name}</b> no dia <b>{selectedDate.split('-').reverse().join('/')}</b> às <b className="text-[#c5a880]">{selectedTime}</b>.</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary flex items-center gap-1.5 pl-1">
                  <UserIcon className="w-4 h-4 text-brand-amber shrink-0" />
                  <span>Seu Nome Completo *</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Seu nome para a agenda profissional"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full bg-bg-dark-800 border border-border-dark text-text-primary rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#c5a880] transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary flex items-center gap-1.5 pl-1">
                  <Phone className="w-4 h-4 text-brand-amber shrink-0" />
                  <span>Celular / WhatsApp *</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: (35) 99999-9999"
                  value={clientPhone}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
                    let formatted = '';
                    if (digits.length > 0) {
                      if (digits.length <= 2) {
                        formatted = `(${digits}`;
                      } else if (digits.length <= 6) {
                        formatted = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
                      } else if (digits.length <= 10) {
                        formatted = `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
                      } else {
                        formatted = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
                      }
                    }
                    setClientPhone(formatted);
                  }}
                  className="w-full bg-bg-dark-800 border border-border-dark text-text-primary rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#c5a880] transition-colors font-mono font-bold"
                />
              </div>
            </div>

            {/* Forma de Pagamento */}
            {((mpConfigured || !!barbeariaInfo?.mercadoPagoAccessToken) && barbeariaInfo?.mercadoPagoEnabled !== false) && (
              <div className="space-y-2.5 pt-2">
                <label className="text-xs font-semibold text-text-secondary flex items-center gap-1.5 pl-1">
                  <CreditCard className="w-4.5 h-4.5 text-brand-amber shrink-0" />
                  <span>Escolha a Forma de Pagamento *</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('presencial')}
                    className={`p-3.5 rounded-xl border flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                      paymentMethod === 'presencial'
                        ? 'bg-[#c5a880]/20 border-[#c5a880] text-white font-bold ring-1 ring-[#c5a880] shadow'
                        : 'bg-bg-dark-800 border-border-dark text-text-secondary hover:bg-bg-dark-750'
                    }`}
                  >
                    <span className="text-xs font-bold">Pagar no Salão</span>
                    <span className="text-[10px] opacity-75 mt-0.5 text-text-muted">Dinheiro ou Cartão</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('mercado_pago_pix')}
                    className={`p-3.5 rounded-xl border flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                      paymentMethod === 'mercado_pago_pix'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold ring-1 ring-emerald-500 shadow'
                        : 'bg-bg-dark-800 border-border-dark text-text-secondary hover:bg-bg-dark-750'
                    }`}
                  >
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1 justify-center">
                      Pix Automático ⚡
                    </span>
                    <span className="text-[10px] opacity-80 mt-0.5 text-emerald-400/90 font-semibold">Aprovação Imediata</span>
                  </button>
                </div>
              </div>
            )}

            {submittingError && (
              <div className="bg-brand-danger-text/10 border border-brand-danger-border/30 text-brand-danger-text p-4 rounded-xl text-xs font-medium animate-fade-in text-center leading-normal">
                ⚠️ {submittingError}
              </div>
            )}

            <p className="text-[10px] text-text-muted italic pl-1 leading-normal">
              * Ao clicar em agendar, o horário será reservado no painel do barbeiro. Em seguida você poderá mandar mensagem direta via WhatsApp com apenas um clique!
            </p>

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-bg-dark-850/95 border-t border-border-dark backdrop-blur-md flex gap-3 z-30 sm:relative sm:bottom-auto sm:left-auto sm:right-auto sm:p-0 sm:border-t-0 sm:bg-transparent sm:backdrop-blur-none sm:z-auto sm:mt-4">
              <button
                type="button"
                onClick={handleBackStep}
                className="flex-1 btn btn-ghost text-xs font-bold border border-border-dark hover:bg-bg-dark-750 px-4 py-3 rounded-xl cursor-pointer text-text-secondary active:scale-[0.98]"
              >
                Voltar
              </button>
              
              <button
                type="submit"
                disabled={bookingLoading || !clientName.trim() || !clientPhone.trim()}
                className="flex-[2] btn bg-[#c5a880] hover:bg-[#c5a880]/90 text-black text-xs font-bold px-5 py-3 rounded-xl cursor-pointer shadow disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {bookingLoading ? 'Agendando...' : 'Agendar Horário'}
              </button>
            </div>
          </form>
        )}
          </>
        )}
      </main>

      {/* Detalhes do Clube de Assinatura Modal */}
      {viewPlanDetails && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-[4px] flex items-center justify-center p-4 z-50 animate-fade-in" onClick={() => setViewPlanDetails(false)}>
          <div 
            className="bg-bg-dark-800 border border-border-dark w-full max-w-4xl rounded-2xl p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh] animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-0 inset-x-0 h-1 bg-[#c5a880] shrink-0"></div>
            
            <div className="flex items-center justify-between pb-4 border-b border-border-dark select-none shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#c5a880] animate-pulse" />
                <h3 className="font-display font-extrabold text-base sm:text-lg text-white tracking-tight">
                  Clube de Assinatura Barbearia 💎
                </h3>
              </div>
              <button 
                onClick={() => setViewPlanDetails(false)} 
                className="text-text-muted hover:text-white p-1.5 rounded-lg cursor-pointer hover:bg-bg-dark-750 transition-colors"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 min-h-0 py-5 pr-1 space-y-6">
              <div className="text-center max-w-xl mx-auto space-y-2">
                <p className="text-[10px] sm:text-xs font-bold text-[#c5a880] tracking-widest uppercase">MANTENHA SEU VISUAL SEMPRE IMPECÁVEL</p>
                <h4 className="text-lg sm:text-xl font-bold text-white font-display">Escolha o plano ideal para o seu estilo</h4>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Ao assinar, você garante uma quantidade fixa de cortes e barbas por mês, pagando muito menos do que no avulso e com agendamento prioritário!
                </p>
              </div>

              {/* Grid of Plans */}
              <div className={gridClass}>
                {activePlansToShow.map((pkg) => {
                  const planDetails = planInfoLookup[pkg];
                  const isPremium = pkg === 'Premium';
                  const pkgServices = barberServices.filter(s => s.package === pkg);

                  return (
                    <div 
                      key={pkg}
                      className={
                        isPremium
                          ? "bg-bg-dark-850 border-2 border-[#c5a880] rounded-xl p-5 relative flex flex-col justify-between shadow-[0_8px_30px_rgba(197,168,128,0.1)] hover:scale-[1.01] transition-all"
                          : "bg-bg-dark-850 border border-border-dark rounded-xl p-5 relative flex flex-col justify-between hover:border-text-muted/45 hover:scale-[1.01] transition-all"
                      }
                    >
                      {isPremium && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#c5a880] text-black text-[9px] uppercase font-black px-2.5 py-1 rounded-full tracking-widest whitespace-nowrap shadow-md">
                          Mais Vendido 🏆
                        </div>
                      )}
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <span className={
                            isPremium
                              ? "text-[9px] bg-[#c5a880]/20 text-[#c5a880] px-2 py-0.5 rounded-full font-bold border border-[#c5a880]/30"
                              : "text-[9px] bg-bg-dark-750 text-text-secondary px-2 py-0.5 rounded-full font-bold border border-border-dark"
                          }>
                            {planDetails.badge}
                          </span>
                          <h5 className="font-display font-bold text-base text-white">{planDetails.title}</h5>
                          <p className="text-[11px] text-text-secondary leading-relaxed">{planDetails.desc}</p>
                        </div>
                        <div className="py-2 border-y border-border-dark/50 flex items-baseline gap-1">
                          <span className="text-2xl font-black font-mono text-white">R$ {planDetails.price}</span>
                          <span className="text-xs text-text-muted">/mês</span>
                        </div>
                        
                        <ul className="space-y-2.5 text-xs text-text-secondary">
                          {planDetails.defaultServices.map((svc, sIdx) => (
                            <li key={sIdx} className="flex items-start gap-2">
                              <ShieldCheck className="w-4 h-4 text-[#c5a880] shrink-0 mt-0.5" />
                              <span>{svc}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="pt-6">
                        {barbeariaInfo?.phone ? (
                          <a
                            href={getWhatsAppPlanLink(`${planDetails.title} (${pkg})`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={
                              isPremium
                                ? "w-full btn bg-[#c5a880] hover:bg-[#c5a880]/90 text-black text-xs font-extrabold py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md hover:shadow-[0_4px_15px_rgba(197,168,128,0.3)]"
                                : "w-full btn bg-bg-dark-750 hover:bg-bg-dark-700 text-white text-xs font-bold py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-border-dark hover:border-[#c5a880]/30"
                            }
                          >
                            Quero Assinar ⚡
                          </a>
                        ) : (
                          <button
                            onClick={() => alert('Fale com seu barbeiro no balcão para ativar este plano!')}
                            className={
                              isPremium
                                ? "w-full btn bg-[#c5a880] text-black text-xs font-bold py-2.5 rounded-lg transition-all cursor-pointer"
                                : "w-full btn bg-bg-dark-750 hover:bg-bg-dark-700 text-white text-xs font-bold py-2.5 rounded-lg transition-all cursor-pointer border border-border-dark"
                            }
                          >
                            Ativar no Balcão ✂️
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Informações adicionais */}
              <div className="bg-bg-dark-900 border border-border-dark/60 rounded-xl p-4 text-xs text-text-secondary leading-relaxed space-y-2 select-none">
                <p className="font-bold text-white text-center sm:text-left">💡 Como funcionam os créditos?</p>
                <p>
                  As assinaturas são mensais e dão direito a créditos de atendimento em sua conta no portal do cliente. Sempre que você comparecer, o barbeiro apenas desconta o crédito do seu plano. Sem precisar pagar nada na hora!
                </p>
                <p className="text-[11px] text-text-muted italic">
                  * A ativação final e liberação de senha para o portal do cliente são feitas diretamente pelo barbeiro no balcão da barbearia ou via contato no WhatsApp.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE PAGAMENTO PIX AUTOMÁTICO (MERCADO PAGO) */}
      {(payingState === 'waiting' || payingState === 'generating') && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-[6px] flex items-center justify-center p-4 z-50 animate-fade-in select-none">
          <div className="bg-bg-dark-850 border-2 border-emerald-500/40 w-full max-w-md rounded-2xl p-6 shadow-2xl relative overflow-hidden flex flex-col items-center text-center space-y-4 animate-slide-up">
            {/* Top glowing bar */}
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500"></div>

            {/* Header */}
            <div className="w-full flex items-center justify-between border-b border-border-dark/60 pb-3">
              <div className="flex items-center gap-2 text-left">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <CreditCard className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                    <span>Pagamento via Pix</span>
                    <span className="bg-emerald-500/20 text-emerald-300 text-[9px] px-2 py-0.5 rounded-full font-extrabold uppercase">
                      Mercado Pago
                    </span>
                  </h3>
                  <p className="text-[10px] text-text-muted">Aprovação imediata após o pagamento</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setPayingState('idle');
                  setBookingLoading(false);
                }}
                className="text-text-muted hover:text-white p-1 rounded-lg hover:bg-bg-dark-750 transition-colors"
                title="Fechar e cancelar cobrança"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {payingState === 'generating' ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-3">
                <div className="w-10 h-10 border-3 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs text-emerald-300 font-semibold animate-pulse">
                  Gerando chave Pix no Mercado Pago...
                </p>
              </div>
            ) : (
              <>
                {/* Value display */}
                <div className="bg-bg-dark-900 border border-emerald-500/30 rounded-xl p-3.5 w-full flex items-center justify-between">
                  <div className="text-left">
                    <span className="text-[10px] uppercase text-text-muted font-bold block">Valor Total</span>
                    <span className="text-xs text-text-secondary truncate max-w-[180px] block">
                      {selectedService?.name || 'Serviço'}
                    </span>
                  </div>
                  <span className="text-xl font-mono font-black text-emerald-400">
                    R$ {(selectedService?.value ? Number(selectedService.value) : 0).toFixed(2).replace('.', ',')}
                  </span>
                </div>

                {/* QR Code */}
                <div className="bg-white p-3 rounded-2xl shadow-inner border-2 border-emerald-500/30 flex items-center justify-center relative">
                  {pixQrCodeBase64 ? (
                    <img 
                      src={`data:image/png;base64,${pixQrCodeBase64}`} 
                      alt="QR Code Pix" 
                      className="w-48 h-48 sm:w-52 sm:h-52 object-contain"
                    />
                  ) : pixCopyPaste ? (
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(pixCopyPaste)}`} 
                      alt="QR Code Pix" 
                      className="w-48 h-48 sm:w-52 sm:h-52 object-contain"
                    />
                  ) : (
                    <div className="w-48 h-48 flex items-center justify-center text-xs text-zinc-500">
                      Carregando QR Code...
                    </div>
                  )}
                </div>

                {/* Pix Copia e Cola Code */}
                {pixCopyPaste && (
                  <div className="w-full space-y-1.5 text-left">
                    <label className="text-[11px] font-semibold text-text-secondary flex items-center justify-between pl-0.5">
                      <span>Pix Copia e Cola:</span>
                      <span className="text-[10px] text-emerald-400 font-mono">
                        Expira em {Math.floor(pixExpiresIn / 60)}:{(pixExpiresIn % 60).toString().padStart(2, '0')}
                      </span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={pixCopyPaste}
                        className="w-full bg-bg-dark-900 border border-border-dark text-text-secondary text-[11px] font-mono rounded-xl px-3 py-2 focus:outline-none select-all truncate"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            navigator.clipboard.writeText(pixCopyPaste);
                            setCopiedPix(true);
                            setTimeout(() => setCopiedPix(false), 2500);
                          } catch (e) {
                            console.error(e);
                          }
                        }}
                        className={`btn text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 shrink-0 cursor-pointer shadow transition-all ${
                          copiedPix 
                            ? 'bg-emerald-500 text-black' 
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        }`}
                      >
                        {copiedPix ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedPix ? 'Copiado!' : 'Copiar'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Real-time waiting indicator */}
                <div className="w-full bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-2.5 text-left">
                  <div className="relative flex h-3 w-3 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </div>
                  <div className="text-[11px] leading-tight space-y-0.5">
                    <p className="text-emerald-300 font-bold">Aguardando pagamento no seu banco...</p>
                    <p className="text-text-muted text-[10px]">
                      Assim que você pagar, esta tela confirmará seu horário automaticamente!
                    </p>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="w-full pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPayingState('idle');
                      setBookingLoading(false);
                      setPaymentMethod('presencial');
                    }}
                    className="flex-1 btn btn-ghost text-xs font-semibold py-2.5 px-3 rounded-xl border border-border-dark hover:bg-bg-dark-750 text-text-secondary transition-colors"
                  >
                    Trocar para Pagar no Salão
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPayingState('idle');
                      setBookingLoading(false);
                    }}
                    className="btn btn-ghost text-xs font-semibold py-2.5 px-3 rounded-xl text-text-muted hover:text-red-400 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* FLOATING AI SUPPORT CHAT WIDGET */}
      <SupportChat
        barbeariaInfo={barbeariaInfo}
        services={allServices}
        plans={Object.values(planInfoLookup)}
      />
    </div>
  );
}
