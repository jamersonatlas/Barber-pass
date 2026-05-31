import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, Eye, Edit3, Trash2, SlidersHorizontal, CheckSquare, Phone, X } from 'lucide-react';
import { Client } from '../types';
import { fmtMoney, initials } from '../utils';

interface ClientsProps {
  clients: Client[];
  onViewDetail: (id: string) => void;
  onEditClient: (client: Client) => void;
  onDeleteClient: (id: string, name: string) => void;
  onOpenAddModal: () => void;
}

export default function Clients({ clients, onViewDetail, onEditClient, onDeleteClient, onOpenAddModal }: ClientsProps) {
  const [search, setSearch] = useState('');
  const [packageFilter, setPackageFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Filtering Logic
  const filteredClients = clients.filter(c => {
    const query = search.toLowerCase();
    const matchesSearch = !query || c.name.toLowerCase().includes(query) || (c.phone || '').includes(query);
    const matchesPackage = !packageFilter || c.package === packageFilter;
    const matchesStatus = !statusFilter || c.status === statusFilter;
    return matchesSearch && matchesPackage && matchesStatus;
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none animate-fade-in">
      {/* Topbar */}
      <div className="px-6 py-4 border-b border-border-dark bg-bg-dark-800 flex items-center justify-between shrink-0">
        <h1 className="text-base font-semibold text-text-primary flex items-center gap-2">
          Clientes <span className="bg-bg-dark-600 border border-border-dark text-[11px] font-bold px-2 py-0.5 rounded-full text-text-secondary">{clients.length}</span>
        </h1>
        <button
          onClick={onOpenAddModal}
          className="btn bg-brand-amber hover:bg-brand-amber-hover text-[#1a0e00] font-semibold text-xs py-1.5 px-3 rounded-lg flex items-center gap-1.5 cursor-pointer shadow"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Novo cliente</span>
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        
        {/* Filters Widget */}
        <div className="bg-bg-dark-800 border border-border-dark rounded-xl p-4 mb-4 flex flex-col sm:flex-row gap-3">
          {/* Search box */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-10 text-xs bg-bg-dark-700 border-border-dark placeholder:text-text-muted"
            />
            {search && (
              <button 
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Package filter */}
          <div className="w-full sm:w-44 shrink-0">
            <select
              value={packageFilter}
              onChange={e => setPackageFilter(e.target.value)}
              className="h-10 text-xs bg-bg-dark-700 border-border-dark cursor-pointer font-medium"
            >
              <option value="">Todos os pacotes</option>
              <option>Básico</option>
              <option>Premium</option>
              <option>VIP</option>
            </select>
          </div>

          {/* Status filter */}
          <div className="w-full sm:w-36 shrink-0">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="h-10 text-xs bg-bg-dark-700 border-border-dark cursor-pointer font-medium"
            >
              <option value="">Todos os status</option>
              <option value="ok">Em dia</option>
              <option value="atrasado">Atrasados</option>
            </select>
          </div>
        </div>

        {/* Clients Table (Desktop Mode) */}
        <div className="hidden md:block bg-bg-dark-800 border border-border-dark rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-bg-dark-700 border-b border-border-dark">
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider text-text-muted font-bold">Cliente</th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider text-text-muted font-bold">Telefone</th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider text-text-muted font-bold">Pacote</th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider text-text-muted font-bold">Valor/mês</th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider text-text-muted font-bold">Vencimento</th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider text-text-muted font-bold">Status</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dark">
                {filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-text-muted text-xs">
                      Nenhum cliente correspondente encontrado
                    </td>
                  </tr>
                ) : (
                  filteredClients.map(c => (
                    <tr key={c.id} className="hover:bg-bg-dark-700/40 transition-colors">
                      {/* Name / Avatar cell */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-brand-amber-bg border border-brand-amber-border flex items-center justify-center font-bold text-brand-amber text-xs shrink-0 select-none">
                            {initials(c.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-text-primary text-xs truncate max-w-[160px]" title={c.name}>
                              {c.name}
                            </div>
                            {c.email ? (
                              <div className="text-[10px] text-text-muted truncate max-w-[160px]" title={c.email}>
                                {c.email}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>

                      {/* Phone cell */}
                      <td className="py-3.5 px-4 text-xs text-text-secondary font-medium">
                        {c.phone || <span className="text-text-muted">—</span>}
                      </td>

                      {/* Package badge cell */}
                      <td className="py-3.5 px-4">
                        <span className="bg-brand-amber-bg text-brand-amber border border-brand-amber-border text-[10px] px-2.5 py-0.5 rounded-full font-medium">
                          {c.package}
                        </span>
                      </td>

                      {/* Monthly Fee cell */}
                      <td className="py-3.5 px-4 text-xs font-semibold text-text-primary">
                        {fmtMoney(c.value)}
                      </td>

                      {/* Due day cell */}
                      <td className="py-3.5 px-4 text-xs text-text-secondary">
                        Dia {c.due}
                      </td>

                      {/* Status badge cell */}
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${
                          c.status === 'ok' 
                            ? 'bg-brand-success-bg border-brand-success-border text-brand-success-text' 
                            : 'bg-brand-danger-bg border-brand-danger-border text-brand-danger-text'
                        }`}>
                          {c.status === 'ok' ? 'Em dia' : 'Atrasado'}
                        </span>
                      </td>

                      {/* Actions cell */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-right">
                        <div className="inline-flex gap-1.5">
                          <button
                            onClick={() => onViewDetail(c.id)}
                            className="bg-transparent border border-border-dark p-2 hover:bg-bg-dark-600 text-text-secondary hover:text-text-primary rounded-lg cursor-pointer transition-colors"
                            title="Ver histórico e cortes"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onEditClient(c)}
                            className="bg-transparent border border-border-dark p-2 hover:bg-bg-dark-600 text-text-secondary hover:text-text-primary rounded-lg cursor-pointer transition-colors"
                            title="Editar dados"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteClient(c.id, c.name)}
                            className="bg-transparent border border-border-dark p-2 hover:bg-bg-dark-600 text-brand-danger-text/80 hover:text-brand-danger-text hover:bg-brand-danger-bg/40 rounded-lg cursor-pointer transition-colors"
                            title="Remover"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Clients cards list (Mobile Mode) */}
        <div className="md:hidden space-y-4 pb-8">
          {filteredClients.length === 0 ? (
            <div className="bg-bg-dark-800 border border-border-dark rounded-xl p-8 text-center text-text-muted text-sm">
              Nenhum cliente correspondente encontrado
            </div>
          ) : (
            filteredClients.map(c => {
              const cleanedPhone = c.phone ? c.phone.replace(/\D/g, '') : '';
              const waLink = cleanedPhone ? `https://wa.me/55${cleanedPhone}` : '';
              const isLate = c.status === 'atrasado';
              return (
                <div key={c.id} className="bg-bg-dark-800 border border-border-dark rounded-xl p-5 space-y-4.5 shadow-lg flex flex-col justify-between">
                  {/* Top line: Name & Avatar & Status */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-12 h-12 rounded-full bg-brand-amber-bg border border-brand-amber-border flex items-center justify-center font-bold text-brand-amber text-base shrink-0">
                        {initials(c.name)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-text-primary text-base truncate max-w-[170px]" title={c.name}>{c.name}</h3>
                        {c.phone ? (
                          <a href={`tel:${cleanedPhone}`} className="text-xs text-text-secondary hover:text-brand-amber flex items-center gap-1.5 mt-1 font-mono">
                            <span>📞</span> {c.phone}
                          </a>
                        ) : (
                          <span className="text-xs text-text-muted italic mt-1 block">Sem telefone</span>
                        )}
                      </div>
                    </div>

                    <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full border shrink-0 ${
                      !isLate 
                        ? 'bg-brand-success-bg border-brand-success-border text-brand-success-text' 
                        : 'bg-brand-danger-bg border-brand-danger-border text-brand-danger-text'
                    }`}>
                      {!isLate ? 'Em dia' : 'Atrasado'}
                    </span>
                  </div>

                  {/* Mid grid: Package Details */}
                  <div className="grid grid-cols-3 gap-1 bg-bg-dark-900/60 p-3 rounded-xl border border-border-dark/60 text-center shrink-0 select-none">
                    <div>
                      <div className="text-[10px] uppercase text-text-muted font-bold tracking-wider">Plano</div>
                      <div className="text-xs font-bold text-brand-amber mt-1 truncate">{c.package}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-text-muted font-bold tracking-wider font-sans">Valor</div>
                      <div className="text-xs font-bold text-text-primary mt-1">{fmtMoney(c.value)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-text-muted font-bold tracking-wider">Vence</div>
                      <div className="text-xs font-semibold text-text-secondary mt-1">Dia {c.due}</div>
                    </div>
                  </div>

                  {/* Bottom line: Interactive Links/Buttons */}
                  <div className="flex items-center gap-2.5 pt-1 shrink-0">
                    <button
                      onClick={() => onViewDetail(c.id)}
                      className="flex-1 py-3 bg-brand-amber hover:bg-brand-amber-hover text-[#1a0e00] font-bold text-xs rounded-xl cursor-pointer transition-colors flex items-center justify-center gap-2 shadow min-h-[44px]"
                    >
                      <Eye className="w-4 h-4 stroke-[2.5]" />
                      <span>Ver Ficha</span>
                    </button>

                    {c.phone && (
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 py-3 bg-bg-dark-750 hover:bg-bg-dark-700 border border-border-dark rounded-xl text-xs font-semibold text-brand-success-text flex items-center justify-center gap-2 transition-colors no-underline cursor-pointer min-h-[44px]"
                      >
                        <Phone className="w-4 h-4" />
                        <span>Chamar</span>
                      </a>
                    )}
                    
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => onEditClient(c)}
                        className="p-3 bg-bg-dark-750 hover:bg-bg-dark-700 border border-border-dark text-text-secondary hover:text-text-primary rounded-xl cursor-pointer transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                        title="Editar"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDeleteClient(c.id, c.name)}
                        className="p-3 bg-bg-dark-750 hover:bg-brand-danger-bg/40 border border-border-dark text-brand-danger-text hover:border-brand-danger-border/40 rounded-xl cursor-pointer transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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
