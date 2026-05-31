import React from 'react';
import { motion } from 'motion/react';
import { Bell, MessageSquare, Check, CreditCard, PhoneCall, CheckSquare } from 'lucide-react';
import { Client } from '../types';
import { fmtDate, fmtMoney, getWhatsAppLink, initials } from '../utils';

interface AlertsProps {
  clients: Client[];
  onConfirmPayment: (id: string) => void;
}

export default function Alerts({ clients, onConfirmPayment }: AlertsProps) {
  const lateClients = clients.filter(c => c.status === 'atrasado');

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none animate-fade-in">
      {/* Topbar */}
      <div className="px-6 py-4 border-b border-border-dark bg-bg-dark-800 flex items-center justify-between shrink-0">
        <h1 className="text-base font-semibold text-text-primary">Avisos de atraso</h1>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {lateClients.length === 0 ? (
          <div className="py-16 text-center max-w-md mx-auto">
            <div className="w-16 h-16 rounded-full bg-brand-success-bg border border-brand-success-border flex items-center justify-center mx-auto mb-4 animate-bounce">
              <Check className="w-8 h-8 text-brand-success-text" />
            </div>
            <h2 className="text-base font-semibold text-text-primary">Tudo em dia!</h2>
            <p className="text-xs text-text-muted mt-2">
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
                const waLink = c.phone ? getWhatsAppLink(c.phone, c.name, c.value) : '';
                return (
                  <div
                    key={c.id}
                    className="bg-bg-dark-800 border border-border-dark rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-border-dark-light hover:bg-bg-dark-700/30"
                  >
                    <div className="flex items-start md:items-center gap-4">
                      {/* Avatar */}
                      <div className="w-12 h-12 rounded-full bg-brand-amber-bg border border-brand-amber-border flex items-center justify-center font-bold text-brand-amber text-sm shrink-0">
                        {initials(c.name)}
                      </div>
                      
                      <div className="space-y-1">
                        <div className="font-semibold text-text-primary text-sm leading-tight">{c.name}</div>
                        <div className="text-xs text-text-secondary leading-relaxed">
                          Pacote {c.package} · <span className="font-semibold text-text-primary">{fmtMoney(c.value)}/mês</span> · Vence dia {c.due}
                        </div>
                        <div className="text-[10px] text-text-muted">
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
                          className="btn btn-ghost text-xs py-1.5 px-3 border border-border-dark hover:bg-bg-dark-700 text-text-secondary hover:text-text-primary rounded-lg flex items-center gap-1.5 cursor-pointer no-underline"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-brand-success-text" />
                          <span>Mandar Aviso</span>
                        </a>
                      )}
                      
                      <button
                        onClick={() => onConfirmPayment(c.id)}
                        className="btn bg-brand-amber hover:bg-brand-amber-hover text-[#1a0e00] text-xs font-semibold py-1.5 px-3 rounded-lg flex items-center gap-1.5 cursor-pointer shadow"
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
    </div>
  );
}
