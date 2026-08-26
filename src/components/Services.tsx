import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Pencil, Plus, Scissors, Trash2, Users, Coins, Sparkles, Layers, ShieldCheck, X } from 'lucide-react';
import { Service, Client } from '../types';
import { fmtMoney, consolidateServicesList } from '../utils';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface ServicesProps {
  services: Service[];
  clients?: Client[];
  onOpenAddModal: () => void;
  onEditService: (service: Service) => void;
  onDeleteService: (id: string, name: string) => void;
  user: any;
  barberProfile: any;
  triggerToast: (msg: string) => void;
}

export default function Services({ 
  services, 
  clients = [], 
  onOpenAddModal, 
  onEditService, 
  onDeleteService,
  user,
  barberProfile,
  triggerToast
}: ServicesProps) {
  const [activeTab, setActiveTab] = useState<'services' | 'plans'>('services');

  // Plan Edit Modal States
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planName, setPlanName] = useState('');
  const [planPrice, setPlanPrice] = useState(0);
  const [planDesc, setPlanDesc] = useState('');
  const [planBadge, setPlanBadge] = useState('');
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);

  // Structured benefits states
  const [structuredServices, setStructuredServices] = useState<{ serviceId: string; quantity: number }[]>([]);
  const [extraBenefits, setExtraBenefits] = useState<string[]>([]);
  const [newExtraText, setNewExtraText] = useState('');

  // Parser of legacy multi-line list to structured format
  const parseLegacyBenefits = (servicesList: string[]) => {
    const structured: { serviceId: string; quantity: number }[] = [];
    const extra: string[] = [];

    servicesList.forEach(benefit => {
      // Matches things like: "2x Cortes Simples (Cabelo)" or "1x Barba"
      const match = benefit.match(/^(\d+)\s*[xX]\s*(.+)$/);
      if (match) {
        const qty = parseInt(match[1], 10);
        const namePart = match[2].trim().toLowerCase();

        // Find if any existing service has a name that matches namePart or vice-versa
        const matchedService = services.find(s => {
          const sName = s.name.toLowerCase();
          return sName === namePart || namePart.includes(sName) || sName.includes(namePart);
        });

        if (matchedService) {
          structured.push({ serviceId: matchedService.id, quantity: qty });
        } else {
          extra.push(benefit);
        }
      } else {
        extra.push(benefit);
      }
    });

    return { structured, extra };
  };

  const customPlans = barberProfile?.plans || {};

  const getPlanField = (pkgId: string, field: string, fallback: any) => {
    if (customPlans[pkgId] && customPlans[pkgId][field] !== undefined) {
      return customPlans[pkgId][field];
    }
    return fallback;
  };

  const defaultPlans = {
    Básico: {
      name: 'Plano Essencial',
      badge: 'BÁSICO',
      price: 70,
      desc: 'Ideal para quem precisa de manutenção básica quinzenal.',
      services: [
        '2x Cortes Simples (Cabelo)',
        'Agendamento prioritário online',
        'Acesso ao Portal de Créditos'
      ]
    },
    Premium: {
      name: 'Plano Cavalheiro',
      badge: 'PREMIUM',
      price: 120,
      desc: 'O plano perfeito para manter cabelo e barba sempre alinhados.',
      services: [
        '3x Cortes Completos (Cabelo)',
        '1x Barba Completa com Toalha Quente',
        'Agendamento prioritário online',
        'Acesso ao Portal de Créditos'
      ]
    },
    VIP: {
      name: 'Plano Executivo',
      badge: 'VIP EXPERIENCE',
      price: 200,
      desc: 'Experiência ultra completa para o homem exigente.',
      services: [
        'Cortes e Barbas (3x Pacotes VIP)',
        '1x Hidratação Profissional inclusa',
        '1x Sobrancelha inclusa',
        'Bebida cortesia em cada visita 🍻'
      ]
    }
  };

  const allPlanIds = Array.from(new Set(['Básico', 'Premium', 'VIP', ...Object.keys(customPlans)]));

  const plansConfig = allPlanIds.map(id => {
    const isCustom = !['Básico', 'Premium', 'VIP'].includes(id);
    const saved = customPlans[id] || {};
    const def = defaultPlans[id as 'Básico' | 'Premium' | 'VIP'] || {
      name: 'Novo Plano',
      badge: id.toUpperCase(),
      price: 100,
      desc: 'Descrição do novo plano de assinatura.',
      services: ['1x Serviço'],
      checklistTemplate: []
    };

    return {
      id,
      name: saved.name || def.name,
      badge: saved.badge || def.badge,
      price: Number(saved.price !== undefined ? saved.price : def.price),
      desc: saved.desc || def.desc,
      servicesList: consolidateServicesList((saved.services || def.services) as string[]),
      colorClass: id === 'Premium' 
        ? 'border-[#c5a880]/40 bg-bg-dark-800 shadow-[0_8px_30px_rgba(197,168,128,0.05)]' 
        : 'border-border-dark bg-bg-dark-800',
      badgeClass: id === 'Premium'
        ? 'bg-[#c5a880]/20 text-[#c5a880] border-[#c5a880]/30'
        : id === 'VIP'
        ? 'bg-[#c5a880]/10 text-white border-border-dark'
        : 'bg-bg-dark-700 text-text-secondary border-border-dark',
      icon: id === 'Premium' ? Sparkles : id === 'VIP' ? Layers : Scissors,
      isPremium: id === 'Premium',
      isCustom
    };
  });

  const handleOpenEditPlan = (plan: typeof plansConfig[0]) => {
    setEditingPlanId(plan.id);
    setPlanName(plan.name);
    setPlanPrice(plan.price);
    setPlanDesc(plan.desc);
    setPlanBadge(plan.badge);

    const savedPlan = customPlans[plan.id];
    if (savedPlan && (savedPlan.structuredServices || savedPlan.extraBenefits)) {
      setStructuredServices(savedPlan.structuredServices || []);
      setExtraBenefits(savedPlan.extraBenefits || []);
    } else {
      const parsed = parseLegacyBenefits(plan.servicesList);
      setStructuredServices(parsed.structured);
      setExtraBenefits(parsed.extra);
    }
    setNewExtraText('');
  };

  const handleOpenAddPlan = () => {
    const newPlanId = 'plano_' + Date.now();
    setEditingPlanId(newPlanId);
    setPlanName('');
    setPlanPrice(100);
    setPlanDesc('');
    setPlanBadge('NOVO');
    setStructuredServices([]);
    setExtraBenefits([]);
    setNewExtraText('');
  };

  const handleDeletePlan = async (planId: string, planName: string) => {
    if (!user?.uid) return;

    // Check if any clients are currently using this plan
    const hasSubscribers = clients.some(c => c.package === planId);
    if (hasSubscribers) {
      triggerToast(`Não é possível excluir o plano "${planName}" pois existem clientes ativos vinculados a ele.`);
      setDeletingPlanId(null);
      return;
    }

    if (deletingPlanId !== planId) {
      setDeletingPlanId(planId);
      setTimeout(() => {
        setDeletingPlanId(prev => prev === planId ? null : prev);
      }, 3000);
      return;
    }

    try {
      const barberRef = doc(db, 'barbers', user.uid);
      const updatedPlans = { ...customPlans };
      delete updatedPlans[planId];

      await updateDoc(barberRef, { plans: updatedPlans });
      triggerToast(`Plano "${planName}" excluído com sucesso!`);
      setDeletingPlanId(null);
    } catch (error) {
      console.error('Error deleting plan:', error);
      triggerToast('Erro ao excluir o plano.');
    }
  };

  const handleSavePlan = async () => {
    if (!editingPlanId || !user?.uid) return;
    setIsSavingPlan(true);

    try {
      const barberRef = doc(db, 'barbers', user.uid);
      const compiledServices: string[] = [];
      const checklistTemplate: string[] = [];

      const consolidatedStructured: { serviceId: string; quantity: number }[] = [];
      structuredServices.forEach(item => {
        const existing = consolidatedStructured.find(x => x.serviceId === item.serviceId);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          consolidatedStructured.push({ ...item });
        }
      });

      consolidatedStructured.forEach(item => {
        const svc = services.find(s => s.id === item.serviceId);
        if (svc) {
          compiledServices.push(`${item.quantity}x ${svc.name}`);
          for (let i = 0; i < item.quantity; i++) {
            checklistTemplate.push(svc.name);
          }
        }
      });

      extraBenefits.forEach(benefit => {
        if (benefit.trim()) {
          compiledServices.push(benefit.trim());
        }
      });

      const updatedPlans = {
        ...customPlans,
        [editingPlanId]: {
          name: planName.trim(),
          price: Number(planPrice) || 0,
          desc: planDesc.trim(),
          services: compiledServices,
          checklistTemplate,
          structuredServices: consolidatedStructured,
          extraBenefits,
          badge: planBadge.trim().toUpperCase()
        }
      };

      await updateDoc(barberRef, { plans: updatedPlans });
      triggerToast('Plano de assinatura salvo com sucesso!');
      setEditingPlanId(null);
    } catch (error) {
      console.error('Error saving custom plan:', error);
      triggerToast('Erro ao salvar as configurações do plano.');
    } finally {
      setIsSavingPlan(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none animate-fade-in">
      {/* Topbar */}
      <div className="px-6 py-4 border-b border-border-dark bg-bg-dark-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <h1 className="text-base font-semibold text-text-primary flex items-center gap-2">
            Gestão do Catálogo
          </h1>
          
          {/* Navigation Tabs - Remodeled as two distinct organizational buttons */}
          <div className="flex bg-bg-dark-900 border border-border-dark/60 p-1 rounded-xl shrink-0">
            <button
              onClick={() => setActiveTab('services')}
              className={`py-1.5 px-4 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'services'
                  ? 'bg-brand-amber text-black shadow-md font-extrabold'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Serviços ({services.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('plans')}
              className={`py-1.5 px-4 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'plans'
                  ? 'bg-brand-amber text-black shadow-md font-extrabold'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Planos de Assinatura</span>
            </button>
          </div>
        </div>

        {activeTab === 'services' && (
          <button
            onClick={onOpenAddModal}
            className="btn bg-brand-amber hover:bg-brand-amber-hover text-[#1a0e00] font-semibold text-xs py-1.5 px-3 rounded-lg flex items-center gap-1.5 cursor-pointer shadow shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Novo serviço</span>
          </button>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'services' ? (
          <>
            {/* Services Table (Desktop Mode) */}
            <div className="hidden md:block bg-bg-dark-800 border border-border-dark rounded-xl overflow-hidden shadow-xl animate-fade-in">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-bg-dark-700 border-b border-border-dark">
                      <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider text-text-muted font-bold">Serviço</th>
                      <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider text-text-muted font-bold">Descrição</th>
                      <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider text-text-muted font-bold">Valor Base</th>
                      <th className="py-3 px-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-dark">
                    {services.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-12 text-text-muted text-xs">
                          Nenhum serviço cadastrado ainda
                        </td>
                      </tr>
                    ) : (
                      services.map(s => (
                        <tr key={s.id} className="hover:bg-bg-dark-700/40 transition-colors">
                          <td className="py-3.5 px-4 font-medium text-text-primary text-xs flex items-center gap-2.5">
                            {s.imageUrl ? (
                              <img 
                                src={s.imageUrl} 
                                alt={s.name} 
                                className="w-8 h-8 rounded-lg object-cover border border-border-dark shrink-0"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-bg-dark-600 border border-border-dark flex items-center justify-center font-bold text-text-muted text-[10px] shrink-0">
                                ✂
                              </div>
                            )}
                            <span>{s.name}</span>
                          </td>
                          <td className="py-3.5 px-4 text-xs text-text-secondary max-w-sm truncate" title={s.desc}>
                            {s.desc || <span className="text-text-muted italic">— Sem descrição</span>}
                          </td>
                          <td className="py-3.5 px-4 text-xs font-semibold text-text-primary">
                            {fmtMoney(s.value)}
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-1.5">
                            <button
                              onClick={() => onEditService(s)}
                              className="bg-transparent border border-border-dark p-2 hover:bg-bg-dark-600 text-text-secondary hover:text-brand-amber hover:border-brand-amber/30 rounded-lg cursor-pointer transition-colors"
                              title="Editar Serviço"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
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
            <div className="md:hidden space-y-4 pb-8 animate-fade-in">
              {services.length === 0 ? (
                <div className="bg-bg-dark-800 border border-border-dark rounded-xl p-8 text-center text-text-muted text-sm border-dashed">
                  Nenhum serviço cadastrado ainda
                </div>
              ) : (
                services.map(s => (
                  <div key={s.id} className="bg-bg-dark-800 border border-border-dark rounded-xl p-5 space-y-4 shadow-md flex flex-col">
                    <div className="flex items-start gap-3">
                      {s.imageUrl && (
                        <img 
                          src={s.imageUrl} 
                          alt={s.name} 
                          className="w-14 h-14 rounded-lg object-cover border border-border-dark shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-text-primary text-base leading-snug truncate">{s.name}</h3>
                        <p className="text-xs text-text-muted mt-1 leading-relaxed italic line-clamp-2">
                          {s.desc || 'Sem descrição cadastrada'}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0 self-start">
                        <button
                          onClick={() => onEditService(s)}
                          className="p-3 bg-bg-dark-750 hover:bg-bg-dark-700 hover:text-brand-amber border border-border-dark text-text-secondary rounded-xl cursor-pointer transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeleteService(s.id, s.name)}
                          className="p-3 bg-bg-dark-750 hover:bg-brand-danger-bg/40 border border-border-dark text-brand-danger-text rounded-xl cursor-pointer transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between border-t border-border-dark/65 pt-3.5 select-none">
                      <span className="text-sm font-bold text-[#f59e0b]">
                        Valor: <span className="text-brand-amber font-extrabold">{fmtMoney(s.value)}</span>
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          /* Custom Subscription Plans Board View */
          <div className="space-y-6 pb-12 animate-fade-in">
            {/* Context Info Banner */}
            <div className="bg-bg-dark-850 border border-border-dark/60 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-brand-amber" />
                  Configurar Planos do Clube de Assinatura
                </h3>
                <p className="text-[11px] text-text-secondary leading-relaxed max-w-2xl">
                  Personalize os nomes, valores, descrições e benefícios que cada plano de assinatura oferece. 
                  Você é livre para escolher como organizar seus planos. O cliente verá estes dados detalhados na tela de agendamento online!
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenAddPlan}
                className="btn bg-brand-amber hover:bg-brand-amber-hover text-[#1a0e00] font-bold text-xs py-2 px-4 rounded-xl flex items-center gap-1.5 cursor-pointer shadow shrink-0 self-start md:self-center transition-colors"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Adicionar Novo Plano</span>
              </button>
            </div>

            {/* Plans Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {plansConfig.map(plan => {
                const planIcon = plan.icon;
                const IconComponent = planIcon;
                
                // Get subscribers in this plan
                const activeSubscribers = clients.filter(c => c.package === plan.id);
                const subCount = activeSubscribers.length;
                
                // Estimated Monthly Revenue
                const planRevenue = activeSubscribers.reduce((sum, c) => sum + (c.value || plan.price), 0);

                return (
                  <div 
                    key={plan.id}
                    className={`border border-border-dark rounded-2xl p-6 relative flex flex-col justify-between ${plan.colorClass} transition-all duration-300 hover:border-[#c5a880]/25 shadow-lg`}
                  >
                    {plan.isPremium && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#c5a880] text-black text-[9px] uppercase font-black px-2.5 py-1 rounded-full tracking-widest whitespace-nowrap shadow-md">
                        Mais Vendido 🏆
                      </div>
                    )}

                    <div className="space-y-6">
                      {/* Plan Header */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className={`text-[9px] border px-2.5 py-0.5 rounded-full font-bold tracking-wider ${plan.badgeClass}`}>
                            {plan.badge}
                          </span>
                          <span className="text-xl font-black font-mono text-white">
                            R$ {plan.price}
                            <span className="text-[10px] text-text-muted font-normal">/mês</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <div className="p-1.5 bg-bg-dark-750 rounded-lg border border-border-dark text-brand-amber">
                            <IconComponent className="w-4 h-4" />
                          </div>
                          <h4 className="font-display font-bold text-base text-white truncate max-w-[180px]">{plan.name}</h4>
                        </div>
                        <p className="text-[11px] text-text-secondary leading-relaxed min-h-[32px]">
                          {plan.desc}
                        </p>
                      </div>

                      {/* Statistics Row */}
                      <div className="grid grid-cols-2 gap-3 p-3 bg-bg-dark-900 border border-border-dark/50 rounded-xl">
                        <div className="space-y-0.5">
                          <span className="text-[9px] text-text-muted font-bold uppercase tracking-wider flex items-center gap-1">
                            <Users className="w-3 h-3 text-text-secondary" />
                            Assinantes
                          </span>
                          <p className="text-sm font-extrabold text-white font-mono">{subCount} <span className="text-[9px] font-normal text-text-secondary">ativos</span></p>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[9px] text-text-muted font-bold uppercase tracking-wider flex items-center gap-1">
                            <Coins className="w-3 h-3 text-brand-amber" />
                            Faturamento
                          </span>
                          <p className="text-sm font-extrabold text-[#10b981] font-mono">{fmtMoney(planRevenue)}</p>
                        </div>
                      </div>

                      {/* Benefits Block */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-border-dark/50 pb-2">
                          <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                            Benefícios do Plano
                          </span>
                        </div>

                        <ul className="space-y-2 text-xs text-text-secondary bg-bg-dark-900/40 p-3 rounded-xl border border-border-dark/30 h-[140px] overflow-y-auto scrollbar-thin">
                          {plan.servicesList.map((benefit, bIdx) => (
                            <li key={bIdx} className="flex items-start gap-2 leading-relaxed">
                              <ShieldCheck className="w-4 h-4 text-[#c5a880] shrink-0 mt-0.5" />
                              <span className="truncate">{benefit}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="pt-5 mt-5 border-t border-border-dark/50 flex flex-col gap-2">
                      <button
                        onClick={() => handleOpenEditPlan(plan)}
                        className="w-full btn bg-bg-dark-700 hover:bg-bg-dark-600 border border-border-dark text-text-primary text-xs font-semibold py-2 px-3 rounded-xl cursor-pointer transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Editar Configurações do Plano</span>
                      </button>

                      {plan.isCustom && (
                        <button
                          type="button"
                          onClick={() => handleDeletePlan(plan.id, plan.name)}
                          className={`w-full btn text-xs font-semibold py-2 px-3 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                            deletingPlanId === plan.id
                              ? 'bg-brand-danger-bg text-white hover:bg-brand-danger-bg/90 animate-pulse'
                              : 'bg-bg-dark-900/40 hover:bg-red-950/20 text-text-muted hover:text-brand-danger-text border border-border-dark hover:border-brand-danger-border/30'
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{deletingPlanId === plan.id ? 'Confirmar Exclusão?' : 'Excluir Plano'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* EDIT PLAN MODAL */}
      <AnimatePresence>
        {editingPlanId && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-[2px] flex items-center justify-center p-4 z-50 animate-fade-in" onClick={() => setEditingPlanId(null)}>
            <div 
              className="bg-bg-dark-800 border border-border-dark w-full max-w-md rounded-2xl overflow-hidden shadow-2xl relative animate-scale-up"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header border-b border-border-dark p-5 flex justify-between items-center bg-bg-dark-850">
                <h3 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-brand-amber" />
                  <span>{editingPlanId.startsWith('plano_') ? 'Criar Novo Plano de Assinatura' : `Personalizar ${editingPlanId}`}</span>
                </h3>
                <button onClick={() => setEditingPlanId(null)} className="text-text-muted hover:text-white p-1 rounded-lg cursor-pointer">
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>

              <div className="modal-body p-5 space-y-4">
                <div className="grid grid-cols-1 gap-1.5">
                  <label className="text-xs font-medium text-text-secondary">Nome do Plano *</label>
                  <input
                    type="text"
                    value={planName}
                    onChange={e => setPlanName(e.target.value)}
                    placeholder="Ex: Plano Bronze, Plano Cavalheiro"
                    className="w-full px-3 py-2 text-xs bg-bg-dark-900 border border-border-dark rounded-xl text-white"
                  />
                </div>

                <div className="grid grid-cols-1 gap-1.5">
                  <label className="text-xs font-medium text-text-secondary">Selo do Plano (Ex: OURO, FAMÍLIA, BÁSICO) *</label>
                  <input
                    type="text"
                    value={planBadge}
                    onChange={e => setPlanBadge(e.target.value)}
                    placeholder="Ex: NOVO"
                    className="w-full px-3 py-2 text-xs bg-bg-dark-900 border border-border-dark rounded-xl text-white"
                  />
                </div>

                <div className="grid grid-cols-1 gap-1.5">
                  <label className="text-xs font-medium text-text-secondary">Preço Mensal (R$) *</label>
                  <input
                    type="number"
                    value={planPrice}
                    onChange={e => setPlanPrice(Number(e.target.value))}
                    placeholder="Ex: 80"
                    className="w-full px-3 py-2 text-xs bg-bg-dark-900 border border-border-dark rounded-xl text-white font-mono font-bold"
                  />
                </div>

                <div className="grid grid-cols-1 gap-1.5">
                  <label className="text-xs font-medium text-text-secondary">Descrição Curta *</label>
                  <textarea
                    value={planDesc}
                    onChange={e => setPlanDesc(e.target.value)}
                    placeholder="Ex: Ideal para quem quer manter o corte sempre em dia."
                    rows={2}
                    className="w-full px-3 py-2 text-xs bg-bg-dark-900 border border-border-dark rounded-xl text-white resize-none"
                  />
                </div>

                {/* Structured Services Checklist Credits */}
                <div className="space-y-2 pt-2 border-t border-border-dark">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
                      <span>Serviços Inclusos (Créditos)</span>
                      <span className="text-[9px] bg-brand-amber/15 text-brand-amber px-1.5 py-0.5 rounded border border-brand-amber/20 font-bold uppercase tracking-wide">Checklist Mensal</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const firstSvcId = services[0]?.id || '';
                        if (!firstSvcId) {
                          triggerToast('Crie serviços primeiro na aba "Serviços"!');
                          return;
                        }
                        setStructuredServices([...structuredServices, { serviceId: firstSvcId, quantity: 1 }]);
                      }}
                      className="text-[10px] bg-bg-dark-700 hover:bg-bg-dark-600 border border-border-dark px-2 py-0.5 text-brand-amber rounded font-semibold cursor-pointer flex items-center gap-1 transition-all"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Adicionar</span>
                    </button>
                  </div>

                  {structuredServices.length === 0 ? (
                    <div className="text-center py-2.5 px-4 bg-bg-dark-900/40 rounded-xl border border-dashed border-border-dark text-[10px] text-text-muted italic">
                      Nenhum serviço do catálogo associado como crédito mensal.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1 scrollbar-thin">
                      {structuredServices.map((item, index) => (
                        <div key={index} className="flex items-center gap-1.5 bg-bg-dark-900/50 p-1.5 rounded-lg border border-border-dark">
                          <select
                            value={item.serviceId}
                            onChange={(e) => {
                              const updated = [...structuredServices];
                              updated[index].serviceId = e.target.value;
                              setStructuredServices(updated);
                            }}
                            className="flex-grow bg-bg-dark-850 border border-border-dark text-white rounded-xl h-8 py-1 text-xs px-2 cursor-pointer font-sans"
                          >
                            {services.map(s => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>

                          <div className="flex items-center shrink-0">
                            <select
                              value={item.quantity}
                              onChange={(e) => {
                                const updated = [...structuredServices];
                                updated[index].quantity = parseInt(e.target.value, 10);
                                setStructuredServices(updated);
                              }}
                              className="w-16 bg-bg-dark-850 border border-border-dark text-white rounded-xl h-8 py-1 text-xs px-1 cursor-pointer font-bold font-mono text-center"
                            >
                              {[1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20].map(q => (
                                <option key={q} value={q}>
                                  {q}x
                                </option>
                              ))}
                            </select>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const updated = [...structuredServices];
                              updated.splice(index, 1);
                              setStructuredServices(updated);
                            }}
                            className="p-1 hover:bg-bg-dark-750 text-text-muted hover:text-brand-danger-text rounded cursor-pointer transition-colors"
                            title="Remover"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Extra Benefits Builder */}
                <div className="space-y-2 pt-2 border-t border-border-dark">
                  <label className="text-xs font-semibold text-text-secondary flex flex-col">
                    <span>Outros Benefícios & Vantagens</span>
                    <span className="text-[10px] text-text-muted font-normal mt-0.5">Benefícios passivos do plano (ex: bebida cortesia, wifi, agendamento prioritário)</span>
                  </label>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newExtraText}
                      onChange={e => setNewExtraText(e.target.value)}
                      placeholder="Ex: Bebida cortesia em cada visita 🍻"
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (newExtraText.trim()) {
                            setExtraBenefits([...extraBenefits, newExtraText.trim()]);
                            setNewExtraText('');
                          }
                        }
                      }}
                      className="flex-1 px-3 py-1.5 text-xs bg-bg-dark-900 border border-border-dark rounded-xl text-white h-8"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newExtraText.trim()) {
                          setExtraBenefits([...extraBenefits, newExtraText.trim()]);
                          setNewExtraText('');
                        }
                      }}
                      className="bg-bg-dark-700 hover:bg-bg-dark-600 border border-border-dark text-brand-amber font-semibold text-xs px-2.5 py-1 rounded-xl h-8 cursor-pointer flex items-center justify-center transition-colors shrink-0"
                    >
                      <span>Adicionar</span>
                    </button>
                  </div>

                  {extraBenefits.length === 0 ? (
                    <div className="text-center py-2 px-4 bg-bg-dark-900/20 rounded-xl border border-border-dark text-[10px] text-text-muted italic">
                      Nenhum benefício adicional listado.
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-[100px] overflow-y-auto pr-1 scrollbar-thin">
                      {extraBenefits.map((benefit, bIdx) => (
                        <div key={bIdx} className="flex items-center justify-between gap-2 bg-bg-dark-900/30 px-2.5 py-1 rounded border border-border-dark/65 text-[11px]">
                          <span className="text-text-secondary truncate">{benefit}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = [...extraBenefits];
                              updated.splice(bIdx, 1);
                              setExtraBenefits(updated);
                            }}
                            className="p-1 hover:bg-bg-dark-750 text-text-muted hover:text-brand-danger-text rounded transition-colors cursor-pointer shrink-0"
                            title="Remover"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer border-t border-border-dark p-4 flex justify-end gap-3 bg-bg-dark-850">
                <button
                  onClick={() => setEditingPlanId(null)}
                  className="btn btn-ghost text-xs cursor-pointer rounded-lg px-4 py-2 border border-border-dark text-text-secondary hover:text-text-primary hover:bg-bg-dark-700"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSavePlan}
                  disabled={isSavingPlan || !planName.trim() || !planDesc.trim() || (structuredServices.length === 0 && extraBenefits.length === 0)}
                  className="btn bg-brand-amber hover:bg-brand-amber-hover text-[#1a0e00] font-bold text-xs cursor-pointer rounded-lg px-4 py-2 disabled:opacity-40"
                >
                  {isSavingPlan ? 'Salvando...' : 'Salvar Personalização'}
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
