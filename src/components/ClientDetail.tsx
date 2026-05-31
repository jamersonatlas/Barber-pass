import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Edit3, Plus, CreditCard, Scissors, Trash2, HelpCircle, AlertCircle, CheckCircle, Check } from 'lucide-react';
import { Client, Cut } from '../types';
import { fmtDate, fmtMoney, initials } from '../utils';

interface ClientDetailProps {
  clientId: string;
  clients: Client[];
  clientCuts: Cut[];
  onBack: () => void;
  onEditClient: (client: Client) => void;
  onAddCutClick: () => void;
  onRemoveCut: (cutId: string) => void;
  onToggleStatus: (clientId: string, currentStatus: 'ok' | 'atrasado') => void;
  onToggleChecklistItem: (clientId: string, itemId: string, done: boolean) => void;
}

export default function ClientDetail({
  clientId,
  clients,
  clientCuts,
  onBack,
  onEditClient,
  onAddCutClick,
  onRemoveCut,
  onToggleStatus,
  onToggleChecklistItem,
}: ClientDetailProps) {
  const client = clients.find(c => c.id === clientId);

  if (!client) {
    return (
      <div className="flex-1 flex flex-col h-full bg-bg-dark-900 justify-center items-center">
        <p className="text-text-secondary text-sm">Cliente não encontrado ou removido.</p>
        <button onClick={onBack} className="mt-4 btn bg-brand-amber text-[#1a0e00] font-semibold text-xs py-2 px-4 rounded-lg">
          Voltar para Lista
        </button>
      </div>
    );
  }

  const isLate = client.status === 'atrasado';

  const checklist = client.checklist || [];
  const totalSlots = checklist.length;
  const doneSlots = checklist.filter(item => item.done).length;
  const progressPercent = totalSlots > 0 ? Math.round((doneSlots / totalSlots) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none animate-fade-in">      {/* Topbar/Header actions */}
      <div className="px-4 md:px-6 py-4.5 border-b border-border-dark bg-bg-dark-800 flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between shrink-0 select-none">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs md:text-sm text-text-secondary hover:text-text-primary transition-colors hover:translate-x-[-2px] cursor-pointer py-1"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar para clientes</span>
        </button>
        <div className="flex gap-2.5">
          <button
            onClick={() => onEditClient(client)}
            className="flex-1 sm:flex-initial btn btn-ghost text-xs md:text-sm px-4 py-2.5 border border-border-dark hover:bg-bg-dark-700 hover:text-text-primary text-text-secondary rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors min-h-[40px]"
          >
            <Edit3 className="w-4 h-4" />
            <span>Editar perfil</span>
          </button>
          <button
            onClick={onAddCutClick}
            className="flex-1 sm:flex-initial btn bg-brand-amber hover:bg-brand-amber-hover text-[#1a0e00] text-xs md:text-sm font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors shadow min-h-[40px]"
          >
            <Plus className="w-4.5 h-4.5 stroke-[2.5]" />
            <span>Registrar serviço</span>
          </button>
        </div>
      </div>

      {/* Content scroll area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        
        {/* Profile Card Header */}
        <div className="bg-bg-dark-800 border border-border-dark rounded-xl p-5 md:p-6 flex flex-col md:flex-row items-center gap-5 text-center md:text-left relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-amber/5 rounded-full blur-2xl pointer-events-none"></div>
          
          <div className="w-16 h-16 rounded-full bg-brand-amber-bg border-2 border-brand-amber-hover flex items-center justify-center font-bold text-brand-amber text-xl shrink-0 shadow">
            {initials(client.name)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display font-bold text-2xl md:text-3xl text-text-primary truncate">{client.name}</h2>
            <p className="text-xs md:text-sm text-text-secondary mt-1.5 flex flex-wrap justify-center md:justify-start items-center gap-x-4 gap-y-1">
              {client.phone ? <span className="font-mono bg-bg-dark-900 px-2 py-0.5 rounded border border-border-dark/60">📞 {client.phone}</span> : null}
              {client.email ? <span>✉ {client.email}</span> : null}
            </p>
            {client.obs && (
              <p className="text-xs text-text-muted mt-3 border-t border-border-dark pt-2.5 max-w-xl">
                Nota: <span className="italic text-text-secondary">{client.obs}</span>
              </p>
            )}
          </div>
          <span className={`text-xs md:text-sm font-semibold px-3 py-1 rounded-full border opacity-95 shrink-0 ${
            isLate 
              ? 'bg-brand-danger-bg border-brand-danger-border text-brand-danger-text' 
              : 'bg-brand-success-bg border-brand-success-border text-brand-success-text'
          }`}>
            {isLate ? 'Pagamento Atrasado' : 'Assinatura em Dia'}
          </span>
        </div>

        {/* Overdue Alert banner */}
        {isLate && (
          <div className="rounded-xl p-4 bg-brand-danger-bg border border-brand-danger-border text-brand-danger-text text-sm flex items-start gap-3 shadow-sm">
            <AlertCircle className="w-5 h-5 shrink-0 text-brand-danger-text mt-0.5" />
            <div>
              <span className="font-bold block mb-0.5">Mensalidade em atraso!</span> Entre em contato com o assinante ou faça o envio do aviso direto pelo canal do WhatsApp para ajudá-lo a restabelecer a assinatura.
            </div>
          </div>
        )}

        {/* Monthly Subscription Checklist */}
        <div className="bg-bg-dark-800 border border-border-dark rounded-xl p-5 md:p-6 relative overflow-hidden shadow-md">
          <div className="absolute top-0 right-0 w-24 h-24 bg-brand-amber/3 rounded-full blur-xl pointer-events-none"></div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 mb-5.5">
            <div>
              <h3 className="text-xs md:text-sm font-bold uppercase text-text-muted tracking-wider flex items-center gap-2 font-sans">
                <CheckCircle className="w-5 h-5 text-brand-amber" /> Checklist de Consumo do Mês
              </h3>
              <p className="text-xs text-text-secondary mt-1.5 max-w-xl">
                Marque abaixo os serviços à medida que o cliente consumi-los durante o mês. Os serviços marcados são salvos automaticamente no histórico.
              </p>
            </div>
            {totalSlots > 0 && (
              <div className="flex items-center gap-3.5 bg-bg-dark-750 border border-border-dark py-2 px-3.5 rounded-xl shrink-0">
                <div className="text-right">
                  <div className="text-sm font-extrabold text-text-primary">{doneSlots} de {totalSlots} usados</div>
                  <div className="text-[10px] text-text-muted font-semibold uppercase tracking-wider mt-0.5">Créditos do Plano</div>
                </div>
                <div className="w-11 h-11 relative flex items-center justify-center shrink-0">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="22" cy="22" r="18" fill="transparent" stroke="#1d1e22" strokeWidth="3" />
                    <circle
                      cx="22"
                      cy="22"
                      r="18"
                      fill="transparent"
                      stroke="#fbbf24"
                      strokeWidth="3.5"
                      strokeDasharray={113}
                      strokeDashoffset={113 - (113 * progressPercent) / 100}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute text-[10px] font-extrabold text-text-primary">{progressPercent}%</span>
                </div>
              </div>
            )}
          </div>

          {totalSlots === 0 ? (
            <div className="py-8 px-4 bg-bg-dark-750 border border-dashed border-border-dark rounded-xl text-center flex flex-col items-center justify-center gap-3">
              <p className="text-xs text-text-secondary">Nenhum checklist de consumo associado a este cliente ainda.</p>
              <button
                onClick={() => onEditClient(client)}
                className="btn btn-ghost text-xs font-bold border border-border-dark hover:bg-bg-dark-600 px-4 py-2 rounded-xl cursor-pointer text-text-primary"
              >
                Configurar Serviços do Plano
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
              {checklist.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onToggleChecklistItem(client.id, item.id, !item.done)}
                  className={`border rounded-xl p-4 flex flex-col justify-between h-[110px] cursor-pointer transition-all select-none shadow-sm ${
                    item.done
                      ? 'bg-brand-success-bg/10 border-brand-success-border/30 text-text-secondary'
                      : 'bg-bg-dark-750 border-border-dark hover:border-brand-amber/30 hover:bg-bg-dark-700/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <span className={`text-[13px] font-bold truncate leading-snug shrink ${item.done ? 'line-through text-text-muted font-normal' : 'text-text-primary'}`} title={item.serviceName}>
                      {item.serviceName}
                    </span>
                    <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border ${
                      item.done
                        ? 'bg-brand-success text-brand-success-text border-brand-success'
                        : 'border-text-muted bg-transparent'
                    }`}>
                      {item.done && <Check className="w-3.5 h-3.5 text-[#1a0e00] stroke-[3]" />}
                    </div>
                  </div>
                  <div className="text-xs flex items-center font-mono">
                    {item.done ? (
                      <span className="text-brand-success-text font-semibold flex items-center gap-1.5">
                        <span className="inline-block w-1.5 h-1.5 bg-brand-success rounded-full"></span>
                        {item.dateDone ? item.dateDone.split('-').reverse().join('/') : ''}
                      </span>
                    ) : (
                      <span className="text-text-muted flex items-center gap-1.5">
                        <span className="inline-block w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse"></span>
                        Disponível
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Grid Split */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          
          {/* Box 1: Subscription Metrics */}
          <div className="bg-bg-dark-800 border border-border-dark rounded-xl p-5 md:p-6 flex flex-col justify-between shadow-md">
            <div>
              <h3 className="text-xs md:text-sm font-bold uppercase text-text-muted tracking-wider mb-4 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-brand-amber" /> Detalhes do plano
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Pacote</span>
                  <span className="text-xs md:text-sm font-bold text-text-primary px-3 py-1 rounded-lg bg-brand-amber-bg border border-brand-amber-border/50 w-max">
                    {client.package}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Valor Mensal</span>
                  <span className="text-sm md:text-base font-bold text-text-primary">{fmtMoney(client.value)}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Dia Vencimento</span>
                  <span className="text-sm md:text-base font-semibold text-text-primary">Dia {client.due}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Último pagamento</span>
                  <span className="text-xs md:text-sm font-semibold text-text-primary">{fmtDate(client.lastPaid)}</span>
                </div>
                <div className="flex flex-col gap-1.5 col-span-2 border-t border-border-dark/60 pt-3">
                  <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Status Financeiro</span>
                  <span className={`text-sm md:text-base font-bold ${isLate ? 'text-brand-danger-text' : 'text-brand-success-text'}`}>
                    {isLate ? 'Inadimplente (Não Pago)' : 'Adimplente (Renovado/Confirmado)'}
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t border-border-dark mt-6 pt-5">
              <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block mb-3.5">Ações rápidas</span>
              <div className="flex flex-col sm:flex-row gap-2.5">
                {isLate ? (
                  <button
                    onClick={() => onToggleStatus(client.id, 'atrasado')}
                    className="w-full sm:w-auto btn bg-brand-success border border-brand-success hover:bg-brand-success-hover text-[#1a0e00] text-sm py-3 px-4 rounded-xl cursor-pointer flex items-center justify-center gap-2 font-bold min-h-[44px] shadow"
                  >
                    <CheckCircle className="w-4.5 h-4.5" />
                    <span>Confirmar Pagamento</span>
                  </button>
                ) : (
                  <button
                    onClick={() => onToggleStatus(client.id, 'ok')}
                    className="w-full sm:w-auto btn bg-brand-danger-bg border border-brand-danger-border text-brand-danger-text text-sm py-3 px-4 rounded-xl hover:bg-brand-danger-bg/85 cursor-pointer flex items-center justify-center gap-2 font-semibold min-h-[44px]"
                  >
                    <AlertCircle className="w-4.5 h-4.5" />
                    <span>Marcar como Atrasado</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Box 2: Service History timeline list */}
          <div className="bg-bg-dark-800 border border-border-dark rounded-xl p-5 md:p-6 flex flex-col justify-between shadow-md">
            <div>
              <h3 className="text-xs md:text-sm font-bold uppercase text-text-muted tracking-wider mb-4 flex items-center gap-2">
                <Scissors className="w-5 h-5 text-brand-amber" /> Histórico de atendimentos ({clientCuts.length})
              </h3>
              
              {clientCuts.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-text-muted text-xs md:text-sm gap-3 border border-dashed border-border-dark/60 rounded-xl">
                  <Scissors className="w-9 h-9 text-text-muted stroke-[1.2]" />
                  <p>Nenhum atendimento registrado ainda</p>
                </div>
              ) : (
                <div className="divide-y divide-border-dark max-h-[240px] overflow-y-auto pr-1">
                  {clientCuts.map(cut => (
                    <div key={cut.id} className="py-3 flex items-start gap-3 first:pt-0 last:pb-0 group">
                      <div className="w-7 h-7 rounded bg-brand-success-bg border border-brand-success-border flex items-center justify-center mt-0.5 shrink-0 shadow-sm">
                        <CheckCircle className="w-4 h-4 text-brand-success-text" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs md:text-sm font-bold text-text-primary truncate">{cut.service}</div>
                        {cut.obs && (
                          <div className="text-xs text-text-muted mt-1 whitespace-normal break-words leading-relaxed">
                            Obs: {cut.obs}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-text-muted whitespace-nowrap pt-1 font-mono">
                        {fmtDate(cut.date)}
                      </div>
                      <button
                        onClick={() => onRemoveCut(cut.id)}
                        className="p-2 text-text-muted hover:text-brand-danger-text border border-transparent hover:border-border-dark hover:bg-bg-dark-600 rounded-xl transition-all ml-2 md:opacity-0 group-hover:opacity-100 cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
                        title="Remover corte"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
