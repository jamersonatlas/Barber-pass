import React from 'react';
import { motion } from 'motion/react';
import { Plus, Scissors, Trash2 } from 'lucide-react';
import { Service } from '../types';
import { fmtMoney } from '../utils';

interface ServicesProps {
  services: Service[];
  onOpenAddModal: () => void;
  onDeleteService: (id: string, name: string) => void;
}

export default function Services({ services, onOpenAddModal, onDeleteService }: ServicesProps) {
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none animate-fade-in">
      {/* Topbar */}
      <div className="px-6 py-4 border-b border-border-dark bg-bg-dark-800 flex items-center justify-between shrink-0">
        <h1 className="text-base font-semibold text-text-primary flex items-center gap-2">
          Serviços/Inclusões <span className="bg-bg-dark-600 border border-border-dark text-[11px] font-bold px-2 py-0.5 rounded-full text-text-secondary">{services.length}</span>
        </h1>
        <button
          onClick={onOpenAddModal}
          className="btn bg-brand-amber hover:bg-brand-amber-hover text-[#1a0e00] font-semibold text-xs py-1.5 px-3 rounded-lg flex items-center gap-1.5 cursor-pointer shadow"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Novo serviço</span>
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Services Table (Desktop Mode) */}
        <div className="hidden md:block bg-bg-dark-800 border border-border-dark rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-bg-dark-700 border-b border-border-dark">
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider text-text-muted font-bold">Serviço</th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider text-text-muted font-bold">Descrição</th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider text-text-muted font-bold">Valor Base</th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider text-text-muted font-bold">Inclusão em Pacote</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dark">
                {services.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-text-muted text-xs">
                      Nenhum serviço cadastrado ainda
                    </td>
                  </tr>
                ) : (
                  services.map(s => (
                    <tr key={s.id} className="hover:bg-bg-dark-700/40 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-text-primary text-xs">
                        {s.name}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-text-secondary max-w-sm truncate" title={s.desc}>
                        {s.desc || <span className="text-text-muted italic">— Sem descrição</span>}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-semibold text-text-primary">
                        {fmtMoney(s.value)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="bg-brand-amber-bg text-brand-amber border border-brand-amber-border text-[10px] px-2.5 py-0.5 rounded-full font-medium">
                          {s.package}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => onDeleteService(s.id, s.name)}
                          className="bg-transparent border border-border-dark p-2 hover:bg-bg-dark-600 text-brand-danger-text/80 hover:text-brand-danger-text hover:bg-brand-danger-bg/40 rounded-lg cursor-pointer transition-colors"
                          title="Remover Serviço"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Services Cards (Mobile Mode) */}
        <div className="md:hidden space-y-4 pb-8">
          {services.length === 0 ? (
            <div className="bg-bg-dark-800 border border-border-dark rounded-xl p-8 text-center text-text-muted text-sm border-dashed">
              Nenhum serviço cadastrado ainda
            </div>
          ) : (
            services.map(s => (
              <div key={s.id} className="bg-bg-dark-800 border border-border-dark rounded-xl p-5 space-y-4 shadow-md flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-text-primary text-base leading-snug truncate">{s.name}</h3>
                    <p className="text-xs text-text-muted mt-2 leading-relaxed italic">
                      {s.desc || 'Sem descrição cadastrada'}
                    </p>
                  </div>
                  <button
                    onClick={() => onDeleteService(s.id, s.name)}
                    className="p-3 bg-bg-dark-750 hover:bg-brand-danger-bg/40 border border-border-dark text-brand-danger-text rounded-xl cursor-pointer transition-colors shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="flex items-center justify-between border-t border-border-dark/65 pt-3.5 select-none">
                  <span className="text-sm font-bold text-[#f59e0b]">
                    Valor: <span className="text-brand-amber font-extrabold">{fmtMoney(s.value)}</span>
                  </span>
                  
                  <span className="bg-brand-amber-bg text-brand-amber border border-brand-amber-border text-xs px-3 py-1 rounded-full font-bold">
                    Plano: {s.package}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
