import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc 
} from 'firebase/firestore';
import { db } from '../firebase';
import { Barber } from '../types';
import { fmtMoney, initials, fmtDate } from '../utils';
import { 
  Users, 
  DollarSign, 
  ShieldCheck, 
  Clock, 
  AlertCircle, 
  Edit3, 
  Calendar, 
  Mail, 
  Phone,
  FileText,
  Save,
  X,
  CreditCard,
  User as UserIcon,
  HelpCircle
} from 'lucide-react';

interface AdminDashboardProps {
  triggerToast: (msg: string) => void;
}

export default function AdminDashboard({ triggerToast }: AdminDashboardProps) {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);

  // Form states for license settings
  const [lStatus, setLStatus] = useState<'active' | 'suspended' | 'pending'>('active');
  const [lValue, setLValue] = useState(50.00);
  const [lDueDay, setLDueDay] = useState(10);
  const [lDuration, setLDuration] = useState(12);
  const [lPlan, setLPlan] = useState<'mensal' | 'semestral' | 'anual'>('mensal');
  const [lNotes, setLNotes] = useState('');

  // Sync barbers raw list in real-time
  useEffect(() => {
    const refBarbers = collection(db, 'barbers');
    const unsubscribe = onSnapshot(refBarbers, (snapshot) => {
      const barberList: Barber[] = [];
      snapshot.forEach(docSnap => {
        barberList.push({ id: docSnap.id, ...docSnap.data() } as Barber);
      });
      barberList.sort((a, b) => a.name.localeCompare(b.name));
      setBarbers(barberList);
      setLoading(false);
    }, (error) => {
      console.error('Error syncing barbers list for admin dashboard:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Compute platform statistics
  const totalBarbersCount = barbers.length;
  const activeLicenses = barbers.filter(b => (b.licenseStatus || 'active') === 'active');
  const pendingLicenses = barbers.filter(b => b.licenseStatus === 'pending');
  const suspendedLicenses = barbers.filter(b => b.licenseStatus === 'suspended');

  // Estimate monthly subscription revenue based on configured licenses
  const estimatedPlatformRevenue = barbers.reduce((acc, b) => {
    // Only count active licenses in platform revenue projection
    const status = b.licenseStatus || 'active';
    if (status === 'active') {
      return acc + (b.licenseValue !== undefined ? b.licenseValue : 50.00);
    }
    return acc;
  }, 0);

  // Calculate contract remaining time helper
  const getRemainingContractText = (createdAt: string, durationMonths?: number) => {
    const months = durationMonths !== undefined ? durationMonths : 12; // default 12 months (1 year term)
    const startDate = new Date(createdAt);
    const endDate = new Date(startDate);
    endDate.setMonth(startDate.getMonth() + months);
    
    const today = new Date();
    if (today > endDate) {
      return { text: 'Expirado', isExpired: true };
    }

    const diffMs = endDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 30) {
      return { text: `${diffDays} dias restantes`, isExpired: false, isWarning: true };
    }
    
    const remainingMonths = Math.floor(diffDays / 30.4);
    return { 
      text: `${remainingMonths} ${remainingMonths === 1 ? 'mês' : 'meses'} restante(s)`, 
      isExpired: false,
      isWarning: false
    };
  };

  const handleOpenEditModal = (barber: Barber) => {
    setSelectedBarber(barber);
    setLStatus(barber.licenseStatus || 'active');
    setLValue(barber.licenseValue !== undefined ? barber.licenseValue : 50.00);
    setLDueDay(barber.licenseDueDay !== undefined ? barber.licenseDueDay : 10);
    setLDuration(barber.contractDurationMonths !== undefined ? barber.contractDurationMonths : 12);
    setLPlan(barber.planType || 'mensal');
    setLNotes(barber.notes || '');
    setEditModalOpen(true);
  };

  const handleSaveLicenseSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBarber) return;

    try {
      const barberDocRef = doc(db, 'barbers', selectedBarber.id);
      await updateDoc(barberDocRef, {
        licenseStatus: lStatus,
        licenseValue: Number(lValue),
        licenseDueDay: Number(lDueDay),
        contractDurationMonths: Number(lDuration),
        planType: lPlan,
        notes: lNotes.trim()
      });
      triggerToast('Informações de licença atualizadas com sucesso.');
      setEditModalOpen(false);
    } catch (err) {
      console.error('Error updating licensing settings:', err);
      triggerToast('Erro ao atualizar licença do barbeiro.');
    }
  };

  // Animations variants
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

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-10 h-10 border-4 border-brand-amber border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-text-secondary text-xs font-medium">Carregando painel master...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none font-sans">
      {/* Header Bar */}
      <header className="px-6 py-4.5 border-b border-border-dark bg-bg-dark-800 flex items-center justify-between shrink-0 shadow">
        <div>
          <h1 className="text-lg md:text-xl font-bold text-text-primary flex items-center gap-2">
            👑 Painel Master do Proprietário
          </h1>
          <p className="text-text-muted text-[11px] uppercase tracking-wider font-semibold mt-0.5">
            Administração da Plataforma & Controle de Licenças
          </p>
        </div>
        <span className="text-xs font-bold text-[#f59e0b] bg-brand-amber-bg px-2.5 py-1 rounded-full border border-brand-amber-border/30">
          Modo Administrador Master
        </span>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* Helper platform description */}
        <div className="rounded-xl p-4 bg-bg-dark-800 border border-border-dark text-text-secondary text-xs flex items-start gap-3 shadow-md">
          <HelpCircle className="w-5 h-5 shrink-0 text-brand-amber mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold text-text-primary block mb-0.5">Bem-vindo à sua central de controle master!</span> 
            Esta tela é voltada exclusivamente para você, o dono da plataforma BarberPass. Aqui, gerencie suas contas de barbeiros cadastrados, controle o tempo de vigência de seus respectivos contratos de licença, acompanhe a adimplência financeira e altere as mensalidades.
          </div>
        </div>

        {/* Platform metrics widgets */}
        <motion.div 
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          {/* Total Barbers registered */}
          <motion.div variants={itemVariants} className="bg-bg-dark-800 border border-border-dark rounded-xl p-4.5 flex flex-col justify-between shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider">Barbeiros Cadastrados</span>
              <div className="w-8 h-8 rounded-lg bg-brand-amber-bg border border-brand-amber-border flex items-center justify-center shadow-inner">
                <Users className="w-4 h-4 text-brand-amber" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-extrabold text-text-primary">{totalBarbersCount}</span>
              <p className="text-[10px] text-text-muted mt-1 leading-none font-medium">
                {activeLicenses.length} licenças ativas na plataforma
              </p>
            </div>
          </motion.div>

          {/* Revenue prediction from server subscription charges */}
          <motion.div variants={itemVariants} className="bg-bg-dark-800 border border-border-dark rounded-xl p-4.5 flex flex-col justify-between shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider">Receita Mensal (SaaS)</span>
              <div className="w-8 h-8 rounded-lg bg-brand-amber-bg border border-brand-amber-border flex items-center justify-center shadow-inner">
                <DollarSign className="w-4 h-4 text-brand-amber" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-extrabold text-brand-success-text">{fmtMoney(estimatedPlatformRevenue)}</span>
              <p className="text-[10px] text-text-muted mt-1 leading-none font-medium">
                Estimado baseado em planos ativos
              </p>
            </div>
          </motion.div>

          {/* Pending subscriptions requiring check */}
          <motion.div variants={itemVariants} className="bg-bg-dark-800 border border-border-dark rounded-xl p-4.5 flex flex-col justify-between shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider">Atrasados / Pendentes</span>
              <div className="w-8 h-8 rounded-lg bg-brand-danger-bg border border-brand-danger-border flex items-center justify-center shadow-inner">
                <AlertCircle className="w-4 h-4 text-brand-danger-text" />
              </div>
            </div>
            <div className="mt-3">
              <span className={`text-3xl font-extrabold ${pendingLicenses.length > 0 ? 'text-brand-danger-text' : 'text-text-primary'}`}>
                {pendingLicenses.length}
              </span>
              <p className="text-[10px] text-text-muted mt-1 leading-none font-medium">
                Sinalizado como pagamento pendente
              </p>
            </div>
          </motion.div>

          {/* Suspended accounts */}
          <motion.div variants={itemVariants} className="bg-bg-dark-800 border border-border-dark rounded-xl p-4.5 flex flex-col justify-between shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider">Acessos Suspensos</span>
              <div className="w-8 h-8 rounded-lg bg-bg-dark-900 border border-border-dark flex items-center justify-center shadow-inner">
                <X className="w-4 h-4 text-text-muted" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-extrabold text-text-secondary">
                {suspendedLicenses.length}
              </span>
              <p className="text-[10px] text-text-muted mt-1 leading-none font-medium">
                Profissionais fora de vigência
              </p>
            </div>
          </motion.div>
        </motion.div>

        {/* Barbers list and terms details block */}
        <div className="bg-bg-dark-800 border border-border-dark rounded-xl overflow-hidden shadow-md">
          <div className="px-5 py-4 border-b border-border-dark bg-bg-dark-850/40 flex items-center justify-between">
            <h2 className="text-sm font-bold text-text-primary uppercase tracking-wide">
              Controle de Mensalidades e Licenças dos Barbeiros
            </h2>
            <span className="text-xs text-text-muted text-right font-mono">
              Registros: {barbers.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse select-none">
              <thead>
                <tr className="border-b border-border-dark text-[10px] font-bold uppercase text-text-muted tracking-wider bg-bg-dark-900/40">
                  <th className="py-4 px-5">Barbeiro / Cadastro</th>
                  <th className="py-4 px-4">Plano / Vencimento</th>
                  <th className="py-4 px-4">Valor Mensalidade</th>
                  <th className="py-4 px-4">Tempo de Contrato</th>
                  <th className="py-4 px-4">Status Licença</th>
                  <th className="py-4 px-5 text-right">Editar Termos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dark text-sm">
                {barbers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-text-muted italic">
                      Nenhum barbeiro adicionado à plataforma ainda.
                    </td>
                  </tr>
                ) : (
                  barbers.map((b) => {
                    const status = b.licenseStatus || 'active';
                    const rentVal = b.licenseValue !== undefined ? b.licenseValue : 50.00;
                    const billingDay = b.licenseDueDay !== undefined ? b.licenseDueDay : 10;
                    const remains = getRemainingContractText(b.createdAt, b.contractDurationMonths);
                    const planP = b.planType || 'mensal';

                    return (
                      <tr key={b.id} className="hover:bg-bg-dark-750/30 transition-colors">
                        {/* Column 1: name details */}
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-brand-amber-bg border border-brand-amber-border flex items-center justify-center font-bold text-brand-amber text-xs shrink-0 shadow-sm">
                              {initials(b.name)}
                            </div>
                            <div className="min-w-0">
                              <span className="font-bold text-text-primary block truncate max-w-[150px]">{b.name}</span>
                              <span className="text-[10px] text-text-muted font-mono block mt-0.5">cadastrado em {b.createdAt ? fmtDate(b.createdAt.split('T')[0]) : '—'}</span>
                            </div>
                          </div>
                        </td>

                        {/* Column 2: plan / dues */}
                        <td className="py-4 px-4">
                          <div className="capitalize font-semibold text-xs text-text-primary flex items-center gap-1">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-amber shrink-0"></span>
                            {planP}
                          </div>
                          <div className="text-[10px] text-text-muted mt-1 leading-none font-medium">
                            Vence dia <b className="font-bold text-text-secondary">{billingDay}</b> de cada mês
                          </div>
                        </td>

                        {/* Column 3: price */}
                        <td className="py-4 px-4">
                          <span className="font-mono font-bold text-text-primary bg-bg-dark-900/55 px-2.5 py-1 rounded border border-border-dark/60 text-xs text-brand-amber">
                            {fmtMoney(rentVal)}
                          </span>
                        </td>

                        {/* Column 4: contract term */}
                        <td className="py-4 px-4">
                          <div className={`text-xs font-semibold flex items-center gap-1.5 ${
                            remains.isExpired ? 'text-brand-danger-text' : remains.isWarning ? 'text-amber-500' : 'text-text-secondary'
                          }`}>
                            <Clock className="w-3.5 h-3.5" />
                            {remains.text}
                          </div>
                          <span className="text-[9px] text-[#8c8c8c] block mt-1 font-medium">
                            Rescisão/Vigência: {b.contractDurationMonths || 12} meses
                          </span>
                        </td>

                        {/* Column 5: status badge */}
                        <td className="py-4 px-4">
                          <span className={`inline-flex items-center text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${
                            status === 'active'
                              ? 'bg-brand-success-bg border-brand-success-border text-brand-success-text'
                              : status === 'pending'
                                ? 'bg-amber-950 border-amber-800 text-amber-300'
                                : 'bg-brand-danger-bg border-brand-danger-border text-brand-danger-text'
                          }`}>
                            {status === 'active' ? 'Ativo' : status === 'pending' ? 'Pendente' : 'Suspenso'}
                          </span>
                        </td>

                        {/* Column 6: Edit button */}
                        <td className="py-4 px-5 text-right">
                          <button
                            onClick={() => handleOpenEditModal(b)}
                            className="bg-bg-dark-750 hover:bg-bg-dark-700 hover:text-text-primary text-brand-amber font-bold py-1.5 px-3 rounded-lg border border-border-dark inline-flex items-center gap-1.5 text-xs transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Configuração</span>
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

        {/* Interactive Guide Banner for Pricing structure */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-bg-dark-800 border border-border-dark rounded-xl p-5 shadow-md space-y-2">
            <h4 className="text-xs uppercase font-extrabold text-brand-amber flex items-center gap-2">
              🧾 Gestão de Inadimplência & Ativação
            </h4>
            <p className="text-xs text-text-secondary leading-relaxed">
              Sempre que você alterar o status de licença de um barbeiro para <b>"Suspenso"</b> ou <b>"Pendente"</b>, o sistema continuará funcionando para ele, porém ele receberá alertas e, caso suspenso, sua tela será travada para pagamentos. Você pode alternar as configurações de plano para cada barbeiro de acordo com os acordos comerciais efetuados.
            </p>
          </div>
          <div className="bg-bg-dark-800 border border-border-dark rounded-xl p-5 shadow-md space-y-2">
            <h4 className="text-xs uppercase font-extrabold text-brand-amber flex items-center gap-2">
              📈 Atualização de Preços para Novos Barbeiros
            </h4>
            <p className="text-xs text-text-secondary leading-relaxed">
              O valor padrão de licença para novos profissionais cadastrados iniciará em <b>R$ 50,00</b> com carência de 12 meses renováveis de contrato. Valores personalizados podem ser pactuados individualmente e alterados clicando no botão "Configuração" na lista acima.
            </p>
          </div>
        </div>

      </div>

      {/* Edit License terms Pop-Up Modal */}
      {editModalOpen && selectedBarber && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-bg-dark-800 border border-border-dark w-full max-w-md rounded-2xl overflow-hidden shadow-2xl relative animate-scale-up select-none">
            <div className="px-5 py-4 border-b border-border-dark flex justify-between items-center bg-bg-dark-850">
              <h3 className="font-display font-medium text-base text-text-primary flex items-center gap-2">
                📂 Termos Corporativos: {selectedBarber.name}
              </h3>
              <button
                onClick={() => setEditModalOpen(false)}
                className="p-1.5 text-text-muted hover:text-text-primary rounded-lg hover:bg-bg-dark-750 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLicenseSettings} className="p-5.5 space-y-4">
              <div className="bg-bg-dark-900 border border-border-dark rounded-xl p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-brand-amber-bg border border-brand-amber-border flex items-center justify-center font-bold text-brand-amber text-xs font-sans shrink-0">
                  {initials(selectedBarber.name)}
                </div>
                <div>
                  <div className="text-sm font-bold text-text-primary">{selectedBarber.name}</div>
                  <div className="text-[10px] text-text-muted font-mono">{selectedBarber.username}@barberpass.com</div>
                </div>
              </div>

              {/* Status Section */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary">Situação da Conta do Profissional</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['active', 'pending', 'suspended'] as const).map((curr) => (
                    <button
                      key={curr}
                      type="button"
                      onClick={() => setLStatus(curr)}
                      className={`py-2 px-1 rounded-xl text-center text-xs font-bold border transition-all cursor-pointer ${
                        lStatus === curr
                          ? curr === 'active'
                            ? 'bg-brand-success-bg border-brand-success-border text-brand-success-text shadow-sm'
                            : curr === 'pending'
                              ? 'bg-amber-950 border-amber-800 text-amber-300 shadow-sm'
                              : 'bg-brand-danger-bg border-brand-danger-border text-brand-danger-text shadow-sm'
                          : 'bg-bg-dark-900 border-border-dark text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {curr === 'active' ? 'Ativo / Pago' : curr === 'pending' ? 'Pendente' : 'Suspenso'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price and Day parameters */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text-secondary">Valor Licença (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={lValue}
                    onChange={(e) => setLValue(parseFloat(e.target.value) || 0)}
                    className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-brand-amber transition-colors font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text-secondary">Dia do Vencimento</label>
                  <input
                    type="number"
                    min="1"
                    max="28"
                    required
                    value={lDueDay}
                    onChange={(e) => setLDueDay(parseInt(e.target.value) || 1)}
                    className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-brand-amber transition-colors font-mono"
                  />
                </div>
              </div>

              {/* Plan and contract length */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text-secondary">Tipo de Plano</label>
                  <select
                    value={lPlan}
                    onChange={(e) => setLPlan(e.target.value as any)}
                    className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-brand-amber transition-colors h-9.5 font-sans"
                  >
                    <option value="mensal">Mensal</option>
                    <option value="semestral">Semestral</option>
                    <option value="anual">Anual</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text-secondary">Duração do Contrato</label>
                  <select
                    value={lDuration}
                    onChange={(e) => setLDuration(parseInt(e.target.value) || 12)}
                    className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-brand-amber transition-colors h-9.5 font-sans"
                  >
                    <option value={3}>3 meses</option>
                    <option value={6}>6 meses</option>
                    <option value={12}>12 meses (1 ano)</option>
                    <option value={24}>24 meses (2 anos)</option>
                    <option value={36}>36 meses (3 anos)</option>
                  </select>
                </div>
              </div>

              {/* Internal Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary">Observações / Compromisso (Opcional)</label>
                <textarea
                  placeholder="Inserir notas sobre renovação de contrato ou lembretes comerciais..."
                  value={lNotes}
                  onChange={(e) => setLNotes(e.target.value)}
                  className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-brand-amber transition-colors h-20 resize-none leading-normal"
                />
              </div>

              <div className="border-t border-border-dark pt-4.5 flex gap-3.5 justify-end">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="btn btn-ghost border border-border-dark text-[#a3a3a3] hover:bg-bg-dark-700 px-4 py-2.5 rounded-xl cursor-pointer text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn bg-brand-amber hover:bg-brand-amber-hover text-[#1a0e00] text-xs font-bold px-5 py-2.5 rounded-xl flex items-center gap-1.5 cursor-pointer shadow"
                >
                  <Save className="w-4 h-4" />
                  <span>Salvar Termos</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
