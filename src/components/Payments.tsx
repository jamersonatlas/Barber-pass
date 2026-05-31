import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Search, CreditCard, DollarSign, AlertTriangle, Calendar, CheckCircle } from 'lucide-react';
import { Client } from '../types';
import { fmtDate, fmtMoney, initials, todayDate } from '../utils';

interface PaymentsProps {
  clients: Client[];
  onToggleStatusFromPayments: (id: string, currentStatus: 'ok' | 'atrasado') => void;
  onNavigate: (page: string) => void;
}

export default function Payments({ clients, onToggleStatusFromPayments, onNavigate }: PaymentsProps) {
  const [search, setSearch] = useState('');
  const lateCount = clients.filter(c => c.status === 'atrasado').length;

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none animate-fade-in">
      {/* Topbar */}
      <div className="px-6 py-4 border-b border-border-dark bg-bg-dark-800 flex items-center justify-between shrink-0">
        <h1 className="text-base font-semibold text-text-primary mr-3">Controle de pagamentos</h1>
        <div className="w-1/3 max-w-xs relative shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            type="text"
            placeholder="Filtrar por nome..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-[11px] py-1 bg-bg-dark-700 border-border-dark placeholder:text-text-muted rounded"
          />
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        
        {/* Warning Notice Panel */}
        {lateCount > 0 && (
          <div className="rounded-xl p-4 bg-brand-warning-bg border border-brand-warning-border text-brand-warning-text text-xs flex items-center justify-between gap-3 animate-pulse">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4.5 h-4.5 text-brand-warning-text" />
              <span>Há <span className="font-bold">{lateCount}</span> cliente(s) com assinatura atrasada que precisam de atenção.</span>
            </div>
            <button
              onClick={() => onNavigate('alerts')}
              className="btn bg-transparent hover:bg-bg-dark-700 text-brand-warning-text text-[11px] font-semibold py-1 px-2.5 border border-brand-warning-border rounded cursor-pointer transition-colors"
            >
              Ver avisos
            </button>
          </div>
        )}

        {/* Payments Table (Desktop Mode) */}
        <div className="hidden md:block bg-bg-dark-800 border border-border-dark rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-bg-dark-700 border-b border-border-dark">
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider text-text-muted font-bold">Cliente</th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider text-text-muted font-bold">Pacote</th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider text-text-muted font-bold">Cobrança</th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider text-text-muted font-bold">Dia de Cobrança</th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider text-text-muted font-bold">Última Recibo</th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider text-text-muted font-bold">Status</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dark">
                {filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-text-muted text-xs">
                      Nenhum assinante encontrado
                    </td>
                  </tr>
                ) : (
                  filteredClients.map(c => {
                    const isLate = c.status === 'atrasado';
                    return (
                      <tr key={c.id} className="hover:bg-bg-dark-700/40 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-brand-amber-bg border border-brand-amber-border flex items-center justify-center font-bold text-brand-amber text-xs shrink-0">
                              {initials(c.name)}
                            </div>
                            <span className="font-semibold text-text-primary text-xs truncate max-w-[140px]">{c.name}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="bg-brand-amber-bg text-brand-amber border border-brand-amber-border text-[10px] px-2 py-0.5 rounded-full font-medium">
                            {c.package}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-xs font-semibold text-text-primary">
                          {fmtMoney(c.value)}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-text-secondary">
                          Dia {c.due}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-text-secondary">
                          {c.lastPaid ? fmtDate(c.lastPaid) : <span className="text-text-muted italic">—</span>}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                            !isLate 
                              ? 'bg-brand-success-bg border-brand-success-border text-brand-success-text' 
                              : 'bg-brand-danger-bg border-brand-danger-border text-brand-danger-text'
                          }`}>
                            {!isLate ? 'Pago' : 'Atrasado'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => onToggleStatusFromPayments(c.id, c.status)}
                            className={`btn text-[11px] font-semibold px-2.5 py-1.5 rounded cursor-pointer border transition-all ${
                              isLate
                                ? 'bg-brand-success-bg/10 border-brand-success-border hover:bg-brand-success-bg text-brand-success-text hover:text-white'
                                : 'bg-bg-dark-700 border-border-dark text-text-secondary hover:text-brand-danger-text hover:border-brand-danger-border/40 hover:bg-brand-danger-bg/40'
                            }`}
                          >
                            {isLate ? 'Confirmar pagamento' : 'Marcar atrasado'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payments List (Mobile Mode) */}
        <div className="md:hidden space-y-4 pb-8">
          {filteredClients.length === 0 ? (
            <div className="bg-bg-dark-800 border border-border-dark rounded-xl p-8 text-center text-text-muted text-sm">
              Nenhum assinante correspondente encontrado
            </div>
          ) : (
            filteredClients.map(c => {
              const isLate = c.status === 'atrasado';
              return (
                <div key={c.id} className="bg-bg-dark-800 border border-border-dark rounded-xl p-5 space-y-4 shadow-md flex flex-col justify-between">
                  {/* Top Line: Avatar and Status */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-full bg-brand-amber-bg border border-brand-amber-border flex items-center justify-center font-bold text-brand-amber text-sm shrink-0">
                        {initials(c.name)}
                      </div>
                      <span className="font-bold text-text-primary text-base truncate max-w-[170px]">{c.name}</span>
                    </div>

                    <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full border shrink-0 ${
                      !isLate 
                        ? 'bg-brand-success-bg border-brand-success-border text-brand-success-text' 
                        : 'bg-brand-danger-bg border-brand-danger-border text-brand-danger-text'
                    }`}>
                      {!isLate ? 'Pago' : 'Atrasado'}
                    </span>
                  </div>

                  {/* Mid grid: Payment Status */}
                  <div className="grid grid-cols-3 gap-1 bg-bg-dark-900/60 p-3.5 rounded-xl border border-border-dark/60 text-center shrink-0 select-none">
                    <div>
                      <div className="text-[10px] uppercase text-text-muted font-bold tracking-wider">Pacote / Valor</div>
                      <div className="text-xs font-medium text-text-primary mt-1 truncate">{c.package} · {fmtMoney(c.value)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-text-muted font-bold tracking-wider">Dia Cobrança</div>
                      <div className="text-xs font-semibold text-text-secondary mt-1">Dia {c.due}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-text-muted font-bold tracking-wider">Último Recibo</div>
                      <div className="text-xs font-medium text-text-secondary mt-1">
                        {c.lastPaid ? fmtDate(c.lastPaid) : <span className="text-text-muted italic">—</span>}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Line: Confirmation Trigger */}
                  <div className="pt-1 shrink-0">
                    <button
                      onClick={() => onToggleStatusFromPayments(c.id, c.status)}
                      className={`w-full py-3 rounded-xl text-sm font-bold border transition-all cursor-pointer flex items-center justify-center gap-2 min-h-[44px] ${
                        isLate
                          ? 'bg-brand-success border-brand-success text-[#1a0e00] hover:bg-brand-success-hover font-bold shadow'
                          : 'bg-bg-dark-750 border-border-dark text-text-secondary hover:text-brand-danger-text hover:border-brand-danger-border/40 hover:bg-brand-danger-bg/40'
                      }`}
                    >
                      {isLate ? 'Confirmar Recebimento 💰' : 'Marcar Inadimplência'}
                    </button>
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
