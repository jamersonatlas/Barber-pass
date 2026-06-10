import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  query, 
  where,
  getDocs,
  doc
} from 'firebase/firestore';
import { db } from '../firebase';
import { Barber, Service } from '../types';
import { initials } from '../utils';
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
  MapPin
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

    return () => {
      unsubBarbearia();
      unsubBarbers();
      unsubServices();
    };
  }, [barbeariaId]);

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

  // Generates next 7 days for quick choosing
  const getNext7Days = () => {
    const days = [];
    const today = new Date();
    const weekdayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    for (let i = 0; i < 9; i++) {
      const d = new Date();
      d.setDate(today.getDate() + i);
      
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
    }
    return days;
  };

  const daysList = getNext7Days();

  // List of professional work schedules
  const businessHours = [
    '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', 
    '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
    '17:00', '17:30', '18:00', '18:30', '19:00', '19:30'
  ];

  // Helper to check if hour is already taken on selected date for chosen barber
  const isSlotTaken = (timeStr: string) => {
    if (!selectedDate) return false;
    return existingBookings.some(b => b.date === selectedDate && b.time === timeStr);
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

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBarber || !selectedService || !selectedDate || !selectedTime || !clientName.trim() || !clientPhone.trim()) {
      return;
    }

    setBookingLoading(true);

    try {
      const responseDetails = {
        barbeariaId: barbeariaId || selectedBarber.id,
        barberId: selectedBarber.id,
        barberName: selectedBarber.name,
        barberPhone: barbeariaInfo?.phone || selectedBarber.phone || '',
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        serviceValue: selectedService.value,
        date: selectedDate,
        time: selectedTime,
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
        createdAt: new Date().toISOString()
      };

      // Add to firestore
      const bookingCol = collection(db, 'guest_bookings');
      await addDoc(bookingCol, responseDetails);

      setFinishedDetails(responseDetails);
      setBookingFinished(true);
    } catch (err) {
      console.error('Error reserving guest slot:', err);
    } finally {
      setBookingLoading(false);
    }
  };

  const handleSendWhatsApp = () => {
    if (!finishedDetails) return;

    const barberPhone = finishedDetails.barberPhone || '';
    const cleanPhone = formatWhatsAppNumber(barberPhone);
    
    // Aesthetic professional booking confirmation text
    const dateFormatted = finishedDetails.date.split('-').reverse().join('/');
    const message = `Olá, ${finishedDetails.barberName}! Gostaria de confirmar um horário de agendamento simples que acabei de reservar no sistema:\n\n` +
      `👤 *Cliente:* ${finishedDetails.clientName}\n` +
      `📞 *Contato:* ${finishedDetails.clientPhone}\n` +
      `✂ *Serviço:* ${finishedDetails.serviceName}\n` +
      `💵 *Valor:* R$ ${finishedDetails.serviceValue.toFixed(2).replace('.', ',')}\n` +
      `📅 *Data:* ${dateFormatted}\n` +
      `🕒 *Horário:* ${finishedDetails.time}\n\n` +
      `_Confirmado via BarberPass! Aguardo você._`;

    const encodedText = encodeURIComponent(message);
    const whatsappUrl = cleanPhone 
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`
      : `https://api.whatsapp.com/send?text=${encodedText}`;

    window.open(whatsappUrl, '_blank');
  };

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
              Seu horário de atendimento está pré-reservado com sucesso no salão.
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

          <div className="w-full space-y-3 pt-2">
            <button
              onClick={handleSendWhatsApp}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-lg transition-all transform hover:scale-[1.01] active:scale-100"
            >
              <svg className="w-5 h-5 fill-current shrink-0" viewBox="0 0 24 24">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm4.846-3.896V20.1a9.927 9.927 0 0 1 5.922 1.942l.424.252a10.024 10.024 0 0 0 5.46-1.595l.392-.233 4.092 1.071-1.091-3.991.24-.382a10.038 10.038 0 0 0 1.543-5.364c.002-5.526-4.433-10.024-9.882-10.024-5.462 0-9.886 4.498-9.888 10.026-.001 1.906.516 3.766 1.498 5.32l.275.437-1.127 4.12 4.152-1.088zm13.125-6.702c.071-.12.262-.191.562-.34.301-.15 1.776-.874 2.046-.974.271-.1.452-.15.642.14.19.29.733.913.898 1.1.166.19.33.21.631.06.301-.15 1.258-.464 2.39-1.474.88-.785 1.474-1.756 1.647-2.055.174-.3.018-.462-.132-.61l-.412-.479c-.15-.175-.24-.3-.36-.5-.12-.2-.06-.375-.03-.524.03-.15.301-.913.411-1.189.109-.271.211-.231.3-.231h.256c.196 0 .512.072.78.36.269.29 1.025 1.002 1.025 2.441s-1.045 2.827-1.196 3.023c-.15.195-2.055 3.138-4.978 4.398-.696.3-1.238.48-1.662.614-.7.225-1.338.193-1.84.119-.561-.082-1.724-.704-1.967-1.385-.24-.68-.24-1.267-.17-1.388z"/>
              </svg>
              <span>Enviar no WhatsApp</span>
            </button>

            <button
              onClick={onClose}
              className="w-full bg-bg-dark-750 hover:bg-bg-dark-700 border border-border-dark text-text-primary text-xs font-bold py-3 px-4 rounded-xl cursor-pointer shadow transition-colors"
            >
              Fechar e Voltar
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden w-full bg-bg-dark-900 flex flex-col font-sans select-none text-text-primary">
      
      {/* Top Banner Branding */}
      <header className="px-5 py-4 border-b border-border-dark bg-bg-dark-800 flex items-center justify-between shrink-0 shadow-md">
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
      <div className="bg-bg-dark-850 px-5 py-2.5 border-b border-border-dark flex justify-between items-center text-[10px] uppercase font-bold text-text-muted tracking-wider shrink-0">
        <div className="flex items-center gap-4.5 overflow-x-auto">
          <span className={currentStep === 1 ? 'text-brand-amber font-extrabold' : ''}>1. Barbeiro</span>
          <ChevronRight className="w-3 h-3 text-border-dark" />
          <span className={currentStep === 2 ? 'text-brand-amber font-extrabold' : ''}>2. Serviço</span>
          <ChevronRight className="w-3 h-3 text-border-dark" />
          <span className={currentStep === 3 ? 'text-brand-amber font-extrabold' : ''}>3. Data/Hora</span>
          <ChevronRight className="w-3 h-3 text-border-dark" />
          <span className={currentStep === 4 ? 'text-brand-amber font-extrabold' : ''}>4. Confirmação</span>
        </div>
        <div className="text-[#c5a880] shrink-0 font-display flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          <span className="hidden sm:inline">Modo Público</span>
        </div>
      </div>

      {/* Active Step Panel Body */}
      <main className="flex-1 overflow-y-auto p-5 md:p-8 max-w-2xl w-full mx-auto space-y-6">
        
        {/* STEP 1: SELECT BARBER */}
        {currentStep === 1 && (
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
                          R$ {s.value.toFixed(2).replace('.', ',')}
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
                  <p className="text-[10px] text-[#c5a880] font-bold mt-0.5">{selectedService.name} — R$ {selectedService.value.toFixed(2).replace('.', ',')}</p>
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
                  {businessHours.map((hour) => {
                    const isTaken = isSlotTaken(hour);
                    const isSelTime = selectedTime === hour;
                    
                    if (isTaken) {
                      return (
                        <div
                          key={hour}
                          className="py-2.5 rounded-lg bg-bg-dark-900 border border-border-dark text-text-muted line-through text-xs font-bold text-center select-none cursor-not-allowed opacity-40"
                          title="Horário Indisponível"
                        >
                          {hour}
                        </div>
                      );
                    }

                    return (
                      <button
                        type="button"
                        key={hour}
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
                  })}
                </div>
              </div>
            )}

            {/* Navigation action step */}
            <div className="pt-4 flex justify-end">
              <button
                type="button"
                disabled={!selectedDate || !selectedTime}
                onClick={handleNextStep}
                className="w-full sm:w-auto btn bg-[#c5a880] hover:bg-[#c5a880]/90 text-black text-xs font-bold px-6 py-3 rounded-xl cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow transition-colors flex items-center justify-center gap-1.5"
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
              <p className="text-text-secondary">Você está reservando o serviço <b>{selectedService.name}</b> de <b>R$ {selectedService.value.toFixed(2).replace('.', ',')}</b> com <b>{selectedBarber.name}</b> no dia <b>{selectedDate.split('-').reverse().join('/')}</b> às <b className="text-[#c5a880]">{selectedTime}</b>.</p>
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
                  type="tel"
                  required
                  placeholder="Ex: (35) 99999-9999"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  className="w-full bg-bg-dark-800 border border-border-dark text-text-primary rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#c5a880] transition-colors font-mono font-bold"
                />
              </div>
            </div>

            <p className="text-[10px] text-text-muted italic pl-1 leading-normal">
              * Ao clicar em agendar, o horário será reservado no painel do barbeiro. Em seguida você poderá mandar mensagem direta via WhatsApp com apenas um clique!
            </p>

            <div className="border-t border-border-dark pt-4 flex gap-3">
              <button
                type="button"
                onClick={handleBackStep}
                className="flex-1 btn btn-ghost text-xs font-bold border border-border-dark hover:bg-bg-dark-750 px-4 py-3 rounded-xl cursor-pointer text-text-secondary"
              >
                Voltar
              </button>
              
              <button
                type="submit"
                disabled={bookingLoading || !clientName.trim() || !clientPhone.trim()}
                className="flex-[2] btn bg-[#c5a880] hover:bg-[#c5a880]/90 text-black text-xs font-bold px-5 py-3 rounded-xl cursor-pointer shadow disabled:opacity-40"
              >
                {bookingLoading ? 'Agendando...' : 'Agendar Horário'}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
