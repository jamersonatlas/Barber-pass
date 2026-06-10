import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../firebase';
import { Client, Cut } from '../types';
import { initials, fmtDate, fmtMoney } from '../utils';
import { 
  Scissors, 
  CheckCircle, 
  CreditCard, 
  Calendar, 
  AlertCircle, 
  LogOut, 
  User as UserIcon,
  HelpCircle
} from 'lucide-react';

interface ClientPortalProps {
  clientId: string;
  onLogout: () => void;
}

export default function ClientPortal({ clientId, onLogout }: ClientPortalProps) {
  const [client, setClient] = useState<Client | null>(null);
  const [cuts, setCuts] = useState<Cut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync client details in real-time
  useEffect(() => {
    if (!clientId) return;

    const refClientDoc = collection(db, 'clients');
    const unsubscribe = onSnapshot(refClientDoc, (snapshot) => {
      let foundClient: Client | null = null;
      snapshot.forEach(docSnap => {
        if (docSnap.id === clientId) {
          foundClient = { id: docSnap.id, ...docSnap.data() } as Client;
        }
      });
      if (foundClient) {
        setClient(foundClient);
      } else {
        setError('Ocorreu um erro ao carregar as informações do cliente.');
      }
      setLoading(false);
    }, (err) => {
      console.error('Failed to sync client portal data:', err);
      setError('Erro ao carregar dados do banco.');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [clientId]);

  // Sync cuts history
  useEffect(() => {
    if (!clientId) return;

    const refCuts = collection(db, 'clients', clientId, 'cuts');
    const unsubscribe = onSnapshot(refCuts, (snapshot) => {
      const cutsList: Cut[] = [];
      snapshot.forEach(docSnap => {
        cutsList.push({ id: docSnap.id, ...docSnap.data() } as Cut);
      });
      // Sort cuts descending by date
      cutsList.sort((a, b) => b.date.localeCompare(a.date));
      setCuts(cutsList);
    }, (err) => {
      console.error('Failed to sync client cuts history:', err);
    });

    return () => unsubscribe();
  }, [clientId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-dark-900 flex flex-col items-center justify-center p-6">
        <div className="w-10 h-10 border-4 border-brand-amber border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-text-secondary text-sm">Carregando seu portal do cliente...</p>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="min-h-screen bg-bg-dark-900 flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-12 h-12 text-brand-danger mb-4" />
        <h2 className="text-xl font-bold text-text-primary mb-2">Ops! Algo deu errado</h2>
        <p className="text-text-muted text-sm max-w-sm mb-6">{error || 'Cliente não encontrado.'}</p>
        <button
          onClick={onLogout}
          className="btn bg-brand-amber hover:bg-brand-amber-hover text-[#1a0e00] font-bold px-5 py-2.5 rounded-xl cursor-pointer"
        >
          Voltar ao Login
        </button>
      </div>
    );
  }

  // Calculate usage statistics
  const totalSlots = client.checklist?.length || 0;
  const doneSlots = client.checklist?.filter(item => item.done).length || 0;
  const progressPercent = totalSlots > 0 ? Math.round((doneSlots / totalSlots) * 100) : 0;
  const isLate = client.status === 'atrasado';

  return (
    <div className="h-screen w-full overflow-hidden bg-bg-dark-900 text-text-primary flex flex-col font-sans select-none animate-fade-in">
      {/* Top Header Navigation */}
      <header className="px-4 md:px-8 py-4 border-b border-border-dark bg-bg-dark-800 flex items-center justify-between shadow shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-amber-bg border border-brand-amber-border flex items-center justify-center font-bold text-brand-amber text-sm shrink-0">
            {initials(client.name)}
          </div>
          <div>
            <h1 className="font-display font-bold text-base md:text-lg text-text-primary">
              Olá, <span className="text-brand-amber">{client.name.split(' ')[0]}</span>!
            </h1>
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">
              Sua assinatura ativa
            </p>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-brand-danger-text px-3 py-2 rounded-xl border border-border-dark bg-bg-dark-750 transition-all cursor-pointer hover:border-brand-danger-border/40"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Desconectar</span>
        </button>
      </header>

      {/* Main Container Area */}
      <main className="flex-1 overflow-y-auto max-w-4xl w-full mx-auto p-4 md:p-8 space-y-6 touch-pan-y">
        
        {/* Status Warning Banner */}
        {isLate && (
          <div className="rounded-xl p-4 bg-brand-danger-bg border border-brand-danger-border text-brand-danger-text text-sm flex items-start gap-3 shadow-md border-dashed">
            <AlertCircle className="w-5 h-5 shrink-0 text-brand-danger-text mt-0.5" />
            <div>
              <span className="font-bold block">Assinatura Pendente!</span> 
              Sua mensalidade mais recente está em atraso. Entre em contato com seu barbeiro para regularizar e restaurar a flexibilidade de consumo dos seus créditos contratados.
            </div>
          </div>
        )}

        {/* Dashboard Panels Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4.5">
          {/* Plan Summary Card */}
          <div className="bg-bg-dark-800 border border-border-dark rounded-xl p-5 md:col-span-1 flex flex-col justify-between shadow-md relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-brand-amber/3 rounded-full blur-xl pointer-events-none"></div>
            <div>
              <h3 className="text-xs font-bold uppercase text-text-muted tracking-wider mb-4 flex items-center gap-2">
                <CreditCard className="w-4.5 h-4.5 text-brand-amber" /> Dados do Seu Plano
              </h3>
              <div className="space-y-3.5">
                <div>
                  <div className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Pacote Contratado</div>
                  <div className="text-base font-extrabold text-brand-amber mt-0.5">
                    {client.package}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Valor da Assinatura</div>
                  <div className="text-sm font-bold text-text-primary mt-0.5">
                    {fmtMoney(client.value)} / mês
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Cobrança e Vencimento</div>
                  <div className="text-sm font-semibold text-text-primary mt-0.5 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-text-muted" /> Todo dia {client.due}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Situação Financeira</div>
                  <span className={`inline-flex items-center text-xs font-extrabold px-2.5 py-0.5 rounded-full border mt-1 shrink-0 ${
                    !isLate 
                      ? 'bg-brand-success-bg border-brand-success-border text-brand-success-text' 
                      : 'bg-brand-danger-bg border-brand-danger-border text-brand-danger-text'
                  }`}>
                    {isLate ? 'Pendente' : 'Em Dia / Pago'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Consumption Progress Statistics Core */}
          <div className="bg-bg-dark-800 border border-border-dark rounded-xl p-5 md:col-span-2 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-md relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-amber/2 rounded-full blur-2xl pointer-events-none"></div>
            <div className="flex-1 min-w-0 space-y-2">
              <h3 className="text-xs font-bold uppercase text-text-muted tracking-wider flex items-center gap-2">
                <CheckCircle className="w-4.5 h-4.5 text-brand-amber" /> Seus Créditos de Consumo
              </h3>
              <p className="text-sm font-bold text-text-primary">
                Você consumiu {doneSlots} de {totalSlots} atendimentos do seu pacote neste ciclo mensal.
              </p>
              <p className="text-xs text-text-muted leading-relaxed">
                Toda mensalidade paga renova integralmente os créditos do seu plano. Use-os com o barbeiro durante o mês corrente. Acompanhe a lista ao lado!
              </p>
            </div>

            {totalSlots > 0 && (
              <div className="flex items-center gap-4.5 bg-bg-dark-750 border border-border-dark py-3 px-4 rounded-xl shrink-0">
                <div className="w-16 h-16 relative flex items-center justify-center shrink-0">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="26" fill="transparent" stroke="#1d1e22" strokeWidth="4.5" />
                    <circle
                      cx="32"
                      cy="32"
                      r="26"
                      fill="transparent"
                      stroke="#fbbf24"
                      strokeWidth="5"
                      strokeDasharray={163}
                      strokeDashoffset={163 - (163 * progressPercent) / 100}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute text-xs font-extrabold text-[#f59e0b]">{progressPercent}%</span>
                </div>
                <div>
                  <div className="text-xl font-extrabold text-text-primary">{doneSlots} / {totalSlots}</div>
                  <div className="text-[9px] uppercase font-bold text-text-muted tracking-widest mt-0.5">Cortes Usados</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Usage Checklist Section */}
        <div className="bg-bg-dark-800 border border-border-dark rounded-xl p-5 md:p-6 shadow-md">
          <h3 className="text-xs md:text-sm font-bold uppercase text-text-muted tracking-wider mb-4 flex items-center gap-2">
            ✂ Seus Serviços Disponíveis e Consumidos
          </h3>
          {totalSlots === 0 ? (
            <div className="p-8 text-center text-text-muted text-sm border border-dashed border-border-dark rounded-xl">
              Nenhum serviço disponível configurado na sua assinatura no momento.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              {client.checklist?.map((item) => (
                <div
                  key={item.id}
                  className={`border rounded-xl p-4 flex flex-col justify-between h-[100px] transition-all relative ${
                    item.done
                      ? 'bg-brand-success-bg/10 border-brand-success-border/20 text-text-secondary'
                      : 'bg-bg-dark-750 border-border-dark'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2.5">
                    <span className={`text-[13px] font-bold truncate ${item.done ? 'line-through text-text-muted font-normal' : 'text-text-primary'}`} title={item.serviceName}>
                      {item.serviceName}
                    </span>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${
                      item.done
                        ? 'bg-brand-success text-brand-success-text border-brand-success'
                        : 'border-text-muted bg-transparent'
                    }`}>
                      {item.done && <CheckCircle className="w-4.5 h-4.5 text-[#1a0e00]" />}
                    </div>
                  </div>
                  
                  <div className="text-xs flex items-center font-mono mt-2">
                    {item.done ? (
                      <span className="text-brand-success-text font-bold flex items-center gap-1.5">
                        <span className="inline-block w-1.5 h-1.5 bg-brand-success rounded-full"></span>
                        Consumido em {item.dateDone ? item.dateDone.split('-').reverse().join('/') : ''}
                      </span>
                    ) : (
                      <span className="text-brand-amber font-semibold flex items-center gap-1.5">
                        <span className="inline-block w-1.5 h-1.5 bg-brand-amber rounded-full animate-pulse"></span>
                        Disponível para Uso
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cuts History Chronology */}
        <div className="bg-bg-dark-800 border border-border-dark rounded-xl p-5 md:p-6 shadow-md">
          <h3 className="text-xs md:text-sm font-bold uppercase text-text-muted tracking-wider mb-4 flex items-center gap-2">
            📅 Seu Histórico de Atendimentos Realizados ({cuts.length})
          </h3>

          {cuts.length === 0 ? (
            <div className="p-8 text-center text-text-muted text-sm border border-dashed border-border-dark rounded-xl">
              Nenhum corte ou serviço registrado no seu histórico até o momento.
            </div>
          ) : (
            <div className="divide-y divide-border-dark/60 max-h-[300px] overflow-y-auto pr-1">
              {cuts.map((cut, idx) => (
                <div key={cut.id} className="py-3.5 flex items-start gap-3.5 first:pt-0 last:pb-0">
                  <div className="w-8 h-8 rounded-full bg-brand-success-bg border border-brand-success-border flex items-center justify-center mt-0.5 shrink-0 shadow-sm">
                    <Scissors className="w-4 h-4 text-brand-success-text" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs md:text-sm font-bold text-text-primary truncate">
                        {cut.service}
                      </h4>
                      <span className="text-[11px] text-text-muted font-mono whitespace-nowrap bg-bg-dark-900 border border-border-dark px-2 py-0.5 rounded">
                        {fmtDate(cut.date)}
                      </span>
                    </div>
                    {cut.obs && (
                      <p className="text-xs text-text-secondary mt-1 max-w-xl leading-relaxed italic">
                        Observação: "{cut.obs}"
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Support Notice */}
        <footer className="text-center pt-4 text-text-muted text-[11px]">
          Precisando de ajuda ou alteração nos dados do seu plano? Converse diretamente com o seu barbeiro autorizado.
        </footer>
      </main>
    </div>
  );
}
