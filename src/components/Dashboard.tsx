import React from 'react';
import { motion } from 'motion/react';
import { Users, DollarSign, AlertCircle, Scissors, ClipboardList, TrendingUp } from 'lucide-react';
import { Client, Cut } from '../types';
import { fmtMoney, initials, fmtDate } from '../utils';

interface DashboardProps {
  clients: Client[];
  allCuts: Cut[];
  onNavigate: (page: string) => void;
}

export default function Dashboard({ clients, allCuts, onNavigate }: DashboardProps) {
  const totalSubscribers = clients.length;
  const lateClients = clients.filter(c => c.status === 'atrasado');
  const totalLate = lateClients.length;
  const activeRevenue = clients.reduce((accum, c) => accum + (c.status === 'ok' ? c.value : 0), 0);
  const totalCutsCount = allCuts.length;

  // Calculate most realized services
  const serviceCounts: { [key: string]: number } = {};
  allCuts.forEach(cut => {
    serviceCounts[cut.service] = (serviceCounts[cut.service] || 0) + 1;
  });
  
  const sortedServices = Object.entries(serviceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  const maxSvcCount = sortedServices.length > 0 ? sortedServices[0][1] : 1;

  // Last 4 haircuts
  const recentCuts = [...allCuts]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4);

  // Package distributions
  const pkgCounts = {
    Básico: clients.filter(c => c.package === 'Básico').length,
    Premium: clients.filter(c => c.package === 'Premium').length,
    VIP: clients.filter(c => c.package === 'VIP').length
  };

  const todayText = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  // Grid animations
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100 } }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none">
      {/* Topbar */}
      <div className="px-6 py-4 border-b border-border-dark bg-bg-dark-800 flex items-center justify-between shrink-0">
        <h1 className="text-base font-semibold text-text-primary">Dashboard</h1>
        <span className="text-xs text-text-muted capitalize" id="dash-date">
          {todayText}
        </span>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* Metrics Grid */}
        <motion.div 
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          {/* Card 1: Subscribers */}
          <motion.div variants={itemVariants} className="bg-bg-dark-800 border border-border-dark rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Assinantes Ativos</span>
              <div className="w-8 h-8 rounded-lg bg-brand-amber-bg border border-brand-amber-border flex items-center justify-center">
                <Users className="w-4 h-4 text-brand-amber" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-semibold text-text-primary">{totalSubscribers}</span>
              <p className="text-[10px] text-text-muted mt-1 leading-none">
                {totalSubscribers - totalLate} em dia · {totalLate} atrasados
              </p>
            </div>
          </motion.div>

          {/* Card 2: Revenue */}
          <motion.div variants={itemVariants} className="bg-bg-dark-800 border border-border-dark rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Receita Mensal</span>
              <div className="w-8 h-8 rounded-lg bg-brand-amber-bg border border-brand-amber-border flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-brand-amber" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-semibold text-text-primary">{fmtMoney(activeRevenue)}</span>
              <p className="text-[10px] text-brand-success-text mt-1 leading-none flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Pagamentos confirmados
              </p>
            </div>
          </motion.div>

          {/* Card 3: Late */}
          <motion.div variants={itemVariants} className="bg-bg-dark-800 border border-border-dark rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Atrasados</span>
              <div className="w-8 h-8 rounded-lg bg-brand-danger-bg border border-brand-danger-border flex items-center justify-center">
                <AlertCircle className="w-4 h-4 text-brand-danger-text" />
              </div>
            </div>
            <div className="mt-2">
              <span className={`text-2xl font-semibold ${totalLate > 0 ? 'text-brand-danger-text' : 'text-text-primary'}`}>
                {totalLate}
              </span>
              <p className={`text-[10px] mt-1 leading-none ${totalLate > 0 ? 'text-brand-danger-text/80' : 'text-text-muted'}`}>
                {totalLate > 0 ? 'Ação necessária' : 'Tudo em dia'}
              </p>
            </div>
          </motion.div>

          {/* Card 4: Historical Cuts */}
          <motion.div variants={itemVariants} className="bg-bg-dark-800 border border-border-dark rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Total de Cortes</span>
              <div className="w-8 h-8 rounded-lg bg-brand-amber-bg border border-brand-amber-border flex items-center justify-center">
                <Scissors className="w-4 h-4 text-brand-amber" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-semibold text-text-primary">{totalCutsCount}</span>
              <p className="text-[10px] text-text-muted mt-1 leading-none">Registros históricos</p>
            </div>
          </motion.div>
        </motion.div>

        {/* Dashboard Panels Grid */}
        <motion.div 
          className="grid grid-cols-1 lg:grid-cols-2 gap-4"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          {/* Panel 1: Services completed progress list */}
          <motion.div variants={itemVariants} className="bg-bg-dark-800 border border-border-dark rounded-xl p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-brand-amber" /> Serviços mais realizados
            </h2>
            {sortedServices.length === 0 ? (
              <div className="py-12 text-center text-text-muted text-xs">
                Nenhum serviço registrado ainda
              </div>
            ) : (
              <div className="space-y-3">
                {sortedServices.map(([name, count]) => {
                  const percent = Math.round((count / maxSvcCount) * 100);
                  return (
                    <div key={name} className="flex items-center gap-3">
                      <span className="text-xs text-text-secondary w-24 text-right truncate" title={name}>
                        {name}
                      </span>
                      <div className="bar-wrap">
                        <div className="bar-fill" style={{ width: `${percent}%` }}></div>
                      </div>
                      <span className="text-xs font-semibold text-text-muted w-6 text-right">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* Panel 2: Late Payments widget */}
          <motion.div variants={itemVariants} className="bg-bg-dark-800 border border-border-dark rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-brand-amber" /> Pagamentos em atraso
              </h2>
              {totalLate > 0 && (
                <button 
                  onClick={() => onNavigate('alerts')}
                  className="btn btn-ghost text-xs px-2 py-1 border border-border-dark hover:bg-bg-dark-700 hover:text-text-primary text-text-secondary rounded cursor-pointer"
                >
                  Ver todos
                </button>
              )}
            </div>
            
            {totalLate === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-text-muted text-xs gap-2">
                <svg className="w-7 h-7 text-brand-success-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <p>Nenhum atraso! ✓</p>
              </div>
            ) : (
              <div className="divide-y divide-border-dark max-h-[180px] overflow-y-auto">
                {lateClients.slice(0, 3).map(c => (
                  <div key={c.id} className="py-2.5 flex items-center justify-between text-xs first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-amber-bg border border-brand-amber-border flex items-center justify-center font-bold text-brand-amber text-xs">
                        {initials(c.name)}
                      </div>
                      <div>
                        <div className="font-semibold text-text-primary">{c.name}</div>
                        <div className="text-[10px] text-text-muted mt-0.5">
                          Vence dia {c.due} · {fmtMoney(c.value)}
                        </div>
                      </div>
                    </div>
                    <span className="bg-brand-danger-bg text-brand-danger-text border border-brand-danger-border text-[10px] px-2 py-0.5 rounded-full font-medium">
                      Atrasado
                    </span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Panel 3: Recent Appointments list */}
          <motion.div variants={itemVariants} className="bg-bg-dark-800 border border-border-dark rounded-xl p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
              <Scissors className="w-4 h-4 text-brand-amber" /> Últimos atendimentos
            </h2>
            {recentCuts.length === 0 ? (
              <div className="py-12 text-center text-text-muted text-xs">
                Nenhum atendimento registrado ainda
              </div>
            ) : (
              <div className="divide-y divide-border-dark">
                {recentCuts.map(cut => {
                  const client = clients.find(c => c.id === cut.clientId);
                  const clientName = client ? client.name : 'Cliente removido';
                  return (
                    <div key={cut.id} className="py-2.5 flex items-center justify-between text-xs first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-amber-bg border border-brand-amber-border flex items-center justify-center font-bold text-brand-amber text-xs">
                          {initials(clientName)}
                        </div>
                        <div>
                          <div className="font-semibold text-text-primary">{clientName}</div>
                          <div className="text-[10px] text-text-muted mt-0.5">{cut.service}</div>
                        </div>
                      </div>
                      <span className="text-[10px] text-text-muted">{fmtDate(cut.date)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* Panel 4: Subscription Package Shares */}
          <motion.div variants={itemVariants} className="bg-bg-dark-800 border border-border-dark rounded-xl p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-brand-amber" /> Distribuição de pacotes
            </h2>
            <div className="space-y-3">
              {(['Básico', 'Premium', 'VIP'] as const).map(pkg => {
                const count = pkgCounts[pkg];
                const pct = totalSubscribers > 0 ? Math.round((count / totalSubscribers) * 100) : 0;
                return (
                  <div key={pkg} className="flex items-center gap-3">
                    <span className="text-xs text-text-secondary w-20 text-right font-medium">
                      {pkg}
                    </span>
                    <div className="bar-wrap">
                      <div className="bar-fill" style={{ width: `${pct}%` }}></div>
                    </div>
                    <span className="text-xs font-semibold text-text-muted w-16 text-right">
                      {count} ({pct}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
