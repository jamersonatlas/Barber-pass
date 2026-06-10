import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  deleteDoc 
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
  Award
} from 'lucide-react';

interface AppointmentProps {
  user: {
    uid: string;
    displayName: string;
    email: string;
    role: 'admin' | 'barber' | 'client';
  };
  triggerToast: (msg: string) => void;
  openConfirmModal: (title: string, message: string, onConfirm: () => void) => void;
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
}

export default function Appointments({ user, triggerToast, openConfirmModal }: AppointmentProps) {
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

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
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return a.time.localeCompare(b.time);
      });
      
      // Filter if logged-in user is a barber (can only see bookings for themselves or their barbearia)
      if (user.role === 'barber') {
        setBookings(list.filter(b => b.barbeariaId === user.uid || b.barberId === user.uid));
      } else {
        setBookings(list);
      }
    }, (error) => {
      console.error('Error syncing bookings list:', error);
      handleFirestoreError(error, OperationType.LIST, 'guest_bookings');
    });

    return () => unsubscribe();
  }, [user]);

  const handleCopyLink = () => {
    const barberParam = user.role === 'barber' ? `&barbearia=${user.uid}` : '';
    const bookingLink = `${window.location.origin}${window.location.pathname}?agendar=true${barberParam}`;
    navigator.clipboard.writeText(bookingLink);
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
    // Remove format of client phone
    const cleanPhone = b.clientPhone.replace(/\D/g, '');
    if (!cleanPhone) return;
    
    const dateFormatted = b.date.split('-').reverse().join('/');
    const message = `Olá, ${b.clientName}! Aqui é do salão. Estou entrando em contato para confirmar seu agendamento do serviço *${b.serviceName}* no dia *${dateFormatted}* às *${b.time}* com o barbeiro *${b.barberName}*. Tudo certo?`;
    
    const encodedText = encodeURIComponent(message);
    const hasDdi = cleanPhone.length > 11;
    const phoneWithDdi = hasDdi ? cleanPhone : `55${cleanPhone}`;
    
    window.open(`https://api.whatsapp.com/send?phone=${phoneWithDdi}&text=${encodedText}`, '_blank');
  };

  const filteredBookings = bookings.filter(b => {
    const q = searchQuery.toLowerCase();
    return (
      b.clientName.toLowerCase().includes(q) ||
      b.serviceName.toLowerCase().includes(q) ||
      b.barberName.toLowerCase().includes(q) ||
      b.clientPhone.includes(q)
    );
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const todayBookingsCount = bookings.filter(b => b.date === todayStr).length;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none animate-fade-in font-sans">
      
      {/* Header and Brand */}
      <div className="px-4 md:px-6 py-4.5 border-b border-border-dark bg-bg-dark-800 flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between shrink-0 select-none shadow">
        <div>
          <h2 className="font-display font-medium text-xl md:text-2xl text-text-primary flex items-center gap-2">
            <span>📅</span>
            <span>Agendamentos Avulsos ({bookings.length})</span>
          </h2>
          <p className="text-text-muted text-[11px] uppercase tracking-wider font-semibold mt-1">
            Clientes avulsos fora do plano por assinatura
          </p>
        </div>
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

        {/* METRICS STATS SUMMARY */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="bg-bg-dark-800 border border-border-dark rounded-xl p-4 flex items-center gap-4.5 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-[#c5a880]/10 border border-[#c5a880]/20 flex items-center justify-center text-[#c5a880] shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">Total Agendados</span>
              <span className="text-xl font-bold text-white block mt-0.5">{bookings.length}</span>
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
                R$ {bookings.reduce((acc, b) => acc + b.serviceValue, 0).toFixed(2).replace('.', ',')}
              </span>
            </div>
          </div>
        </div>

        {/* SEARCH BAR FILTRATION */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-text-muted" />
          <input
            type="text"
            placeholder="Pesquisar agendamento por nome do cliente, telefone, barbeiro ou serviço..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-bg-dark-800 border border-border-dark text-text-primary rounded-xl pl-10.5 pr-4 py-2.5 text-xs md:text-sm focus:outline-none focus:border-[#c5a880] transition-colors shadow-inner"
          />
        </div>

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
                  return (
                    <tr key={b.id} className="hover:bg-bg-dark-750/30 transition-colors">
                      <td className="py-4 px-5">
                        <span className="font-bold text-text-primary">{b.clientName}</span>
                        <span className="inline-block text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border border-border-dark text-text-muted ml-2 bg-bg-dark-900">
                          Avulso
                        </span>
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
                            R$ {b.serviceValue.toFixed(2).replace('.', ',')}
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
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleSendMessage(b)}
                            className="p-2 border border-border-dark hover:bg-emerald-950/45 text-emerald-400 hover:text-emerald-300 rounded-lg cursor-pointer transition-colors"
                            title="Confirmar via WhatsApp"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteBooking(b.id, b.clientName, b.date, b.time)}
                            className="p-2 border border-border-dark hover:bg-brand-danger-bg/40 text-brand-danger-text rounded-lg cursor-pointer transition-colors"
                            title="Cancelar Agendamento"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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
              return (
                <div key={b.id} className="bg-bg-dark-800 border border-border-dark rounded-xl p-4.5 space-y-4 shadow-md flex flex-col justify-between">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-bold text-text-primary text-base leading-none">{b.clientName}</h3>
                        <span className="text-[8px] font-bold uppercase bg-bg-dark-900 px-1 py-0.5 rounded border border-border-dark text-text-muted">Avulso</span>
                      </div>
                      <p className="text-xs text-[#c5a880] font-semibold">{b.serviceName} com {b.barberName}</p>
                    </div>

                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => handleSendMessage(b)}
                        className="p-2 border border-border-dark hover:bg-emerald-950/45 text-emerald-400 hover:text-emerald-300 rounded-lg cursor-pointer transition-colors"
                      >
                        <MessageSquare className="w-4.5 h-4.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteBooking(b.id, b.clientName, b.date, b.time)}
                        className="p-2 border border-border-dark hover:bg-brand-danger-bg/40 text-brand-danger-text rounded-lg cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
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
    </div>
  );
}
