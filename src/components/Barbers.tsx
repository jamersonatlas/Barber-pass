import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  addDoc, 
  updateDoc,
  query,
  where
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Barber } from '../types';
import { initials } from '../utils';
import ImageUpload from './ImageUpload';
import { 
  Scissors, 
  Plus, 
  Trash2, 
  Edit3, 
  Phone, 
  Mail, 
  User as UserIcon, 
  Lock, 
  Search, 
  ChevronRight, 
  X,
  PlusCircle,
  HelpCircle
} from 'lucide-react';

interface BarbersProps {
  onBack?: () => void;
  triggerToast: (msg: string) => void;
  openConfirmModal: (title: string, message: string, onConfirm: () => void) => void;
}

export default function Barbers({ onBack, triggerToast, openConfirmModal }: BarbersProps) {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBarber, setEditingBarber] = useState<Barber | null>(null);
  
  // Form inputs
  const [bName, setBName] = useState('');
  const [bPhone, setBPhone] = useState('');
  const [bEmail, setBEmail] = useState('');
  const [bUsername, setBUsername] = useState('');
  const [bPassword, setBPassword] = useState('');
  const [bAvatarUrl, setBAvatarUrl] = useState('');

  // Feature Flag settings
  const [bFeaturePixEnabled, setBFeaturePixEnabled] = useState(true);
  const [bFeatureAlertsEnabled, setBFeatureAlertsEnabled] = useState(true);
  const [bFeatureEmployeesEnabled, setBFeatureEmployeesEnabled] = useState(true);

  // Robust error and submission states
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Sync barbers in real-time
  useEffect(() => {
    const refBarbers = collection(db, 'barbers');
    const unsubscribe = onSnapshot(refBarbers, (snapshot) => {
      const barberList: Barber[] = [];
      snapshot.forEach(docSnap => {
        barberList.push({ id: docSnap.id, ...docSnap.data() } as Barber);
      });
      // Sort alphabetically
      barberList.sort((a, b) => a.name.localeCompare(b.name));
      setBarbers(barberList);
    }, (error) => {
      console.error('Error syncing barbers list:', error);
      handleFirestoreError(error, OperationType.LIST, 'barbers');
    });

    return () => unsubscribe();
  }, []);

  const openAddModal = () => {
    setEditingBarber(null);
    setBName('');
    setBPhone('');
    setBEmail('');
    setBUsername('');
    setBPassword('');
    setBAvatarUrl('');
    setBFeaturePixEnabled(true);
    setBFeatureAlertsEnabled(true);
    setBFeatureEmployeesEnabled(true);
    setErrorMsg(null);
    setIsSaving(false);
    setModalOpen(true);
  };

  const openEditModal = (barber: Barber) => {
    setEditingBarber(barber);
    setBName(barber.name);
    setBPhone(barber.phone || '');
    setBEmail(barber.email || '');
    setBUsername(barber.username);
    setBPassword(barber.password);
    setBAvatarUrl(barber.avatarUrl || '');
    setBFeaturePixEnabled(barber.featurePixEnabled !== false);
    setBFeatureAlertsEnabled(barber.featureAlertsEnabled !== false);
    setBFeatureEmployeesEnabled(barber.featureEmployeesEnabled !== false);
    setErrorMsg(null);
    setIsSaving(false);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSaving(true);

    console.log('[Barbers] Iniciando processo de salvamento de barbeiro...');
    console.log('[Barbers] Dados digitados para validação:', {
      name: bName.trim(),
      username: bUsername.trim(),
      phone: bPhone.trim(),
      email: bEmail.trim(),
      avatarUrlLength: bAvatarUrl.length,
      isEditing: !!editingBarber,
      editingId: editingBarber?.id || 'nenhum'
    });

    // 1. Validando campos obrigatórios no frontend
    if (!bName.trim()) {
      setErrorMsg('O campo "Nome Completo" é obrigatório.');
      setIsSaving(false);
      console.warn('[Barbers] Validação falhou: Nome Completo vazio.');
      return;
    }
    if (!bUsername.trim()) {
      setErrorMsg('O campo "Nome de Usuário" é obrigatório.');
      setIsSaving(false);
      console.warn('[Barbers] Validação falhou: Usuário vazio.');
      return;
    }
    if (bUsername.trim().length < 3) {
      setErrorMsg('O nome de usuário deve conter pelo menos 3 caracteres.');
      setIsSaving(false);
      console.warn('[Barbers] Validação falhou: Usuário muito curto.');
      return;
    }
    // Validation for valid characters to avoid breaking database rules or having unstable paths
    const validUsernameRegex = /^[a-zA-Z0-9_\-]+$/;
    if (!validUsernameRegex.test(bUsername.trim())) {
      setErrorMsg('O nome de usuário só pode conter letras, números, sublinhados (_) e hifens (-). Caracteres especiais ou espaços não são permitidos.');
      setIsSaving(false);
      console.warn('[Barbers] Validação falhou: caracteres especiais no usuário.');
      return;
    }

    if (!bPassword.trim()) {
      setErrorMsg('O campo "Senha de Acesso" é obrigatório.');
      setIsSaving(false);
      console.warn('[Barbers] Validação falhou: Senha vazia.');
      return;
    }
    if (bPassword.trim().length < 4) {
      setErrorMsg('A senha de acesso deve ter pelo menos 4 caracteres.');
      setIsSaving(false);
      console.warn('[Barbers] Validação falhou: Senha muito curta.');
      return;
    }

    // 2. Verificar duplicados localmente
    const normalizedUser = bUsername.trim().toLowerCase();
    const isDuplicate = barbers.some(
      b => b.username.toLowerCase() === normalizedUser && (!editingBarber || b.id !== editingBarber.id)
    );
    if (isDuplicate) {
      setErrorMsg(`O nome de usuário "${bUsername.trim()}" já está sendo utilizado por outro barbeiro.`);
      setIsSaving(false);
      console.warn('[Barbers] Validação falhou: Nome de usuário duplicado.');
      return;
    }

    try {
      if (editingBarber) {
        console.log(`[Barbers] Tentando atualizar barbeiro ID: ${editingBarber.id}`);
        const bDocRef = doc(db, 'barbers', editingBarber.id);
        
        await updateDoc(bDocRef, {
          name: bName.trim(),
          phone: bPhone.trim(),
          email: bEmail.trim(),
          username: bUsername.trim().toLowerCase(),
          password: bPassword.trim(),
          avatarUrl: bAvatarUrl.trim(),
          featurePixEnabled: bFeaturePixEnabled,
          featureAlertsEnabled: bFeatureAlertsEnabled,
          featureEmployeesEnabled: bFeatureEmployeesEnabled,
        });
        
        console.log('[Barbers] Barbeiro atualizado com sucesso no Firestore.');
        triggerToast('Perfil de barbeiro atualizado.');
      } else {
        console.log('[Barbers] Criando uma referência de novo documento para barbeiros...');
        const bColRef = collection(db, 'barbers');
        const newDocRef = doc(bColRef);
        console.log(`[Barbers] Referência de ID gerada: ${newDocRef.id}`);
 
        const payload = {
          id: newDocRef.id,
          name: bName.trim(),
          phone: bPhone.trim(),
          email: bEmail.trim(),
          username: bUsername.trim().toLowerCase(),
          password: bPassword.trim(),
          avatarUrl: bAvatarUrl.trim(),
          featurePixEnabled: bFeaturePixEnabled,
          featureAlertsEnabled: bFeatureAlertsEnabled,
          featureEmployeesEnabled: bFeatureEmployeesEnabled,
          createdAt: new Date().toISOString()
        };

        console.log('[Barbers] Enviando payload ao setDoc no Firestore:', payload);
        await setDoc(newDocRef, payload);
        
        console.log('[Barbers] Novo barbeiro cadastrado com sucesso no Firestore.');
        triggerToast('Novo barbeiro adicionado com sucesso!');
      }
      setModalOpen(false);
    } catch (err: any) {
      console.error('[Barbers] Falha gravíssima ao salvar barbeiro no Firestore:', err);
      
      // Diagnosticar erro de permissão ou conexão do firestore
      const errStr = String(err).toLowerCase();
      if (errStr.includes('permission') || errStr.includes('insufficient')) {
        setErrorMsg('Erro de permissão no Firestore: Você não possui autorização (regras de segurança) para gravar na coleção de barbeiros ("barbers").');
      } else if (errStr.includes('offline') || errStr.includes('network')) {
        setErrorMsg('Erro de Conexão: O Firestore informa que o cliente está offline ou sem internet estável.');
      } else if (errStr.includes('quota') || errStr.includes('exceeded')) {
        setErrorMsg('Erro de Cota Excedida: Limites de leitura/gravação diários do Firestore foram atingidos no projeto Firebase.');
      } else {
        setErrorMsg(`Erro de gravação no banco de dados: ${err.message || String(err)}`);
      }
      
      try {
        handleFirestoreError(err, OperationType.WRITE, 'barbers');
      } catch (logErr) {
        console.error('[Barbers] handleFirestoreError registrou a falha formatada para diagnóstico do sistema.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteBarber = (id: string, name: string) => {
    openConfirmModal(
      'Remover Barbeiro',
      `Tem certeza que deseja remover o barbeiro "${name}"? Essa ação não pode ser desfeita.`,
      async () => {
        try {
          const barberRef = doc(db, 'barbers', id);
          await deleteDoc(barberRef);
          triggerToast(`Barbeiro "${name}" removido.`);
        } catch (error) {
          console.error('Error deleting barber:', error);
          handleFirestoreError(error, OperationType.DELETE, `barbers/${id}`);
        }
      }
    );
  };

  const filteredBarbers = barbers.filter(b => {
    const q = searchQuery.toLowerCase();
    return (
      b.name.toLowerCase().includes(q) ||
      b.username.toLowerCase().includes(q) ||
      (b.phone && b.phone.includes(q))
    );
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none animate-fade-in font-sans">
      {/* Search and Top Info Header Line */}
      <div className="px-4 md:px-6 py-4.5 border-b border-border-dark bg-bg-dark-800 flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between shrink-0 select-none shadow">
        <div>
          <h2 className="font-display font-medium text-xl md:text-2xl text-text-primary">
            Gestão de Barbeiros ({barbers.length})
          </h2>
          <p className="text-text-muted text-[11px] uppercase tracking-wider font-semibold mt-1">
            Controle de acessos profissionais
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="btn bg-brand-amber hover:bg-brand-amber-hover text-[#1a0e00] text-xs font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow transition-all transform hover:scale-[1.01] active:scale-100 min-h-[44px]"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
          <span>Adicionar Barbeiro</span>
        </button>
      </div>

      {/* Main Barbers Overview Scroll */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        
        {/* Help Banner Tip */}
        <div className="rounded-xl p-4 bg-bg-dark-800 border border-border-dark text-text-secondary text-xs flex items-start gap-3 shadow-md">
          <Scissors className="w-5 h-5 shrink-0 text-brand-amber mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold text-text-primary block mb-0.5">Como funciona o login dos barbeiros?</span> 
            Ao adicionar um barbeiro com <b>usuário e senha</b>, ele poderá acessar a plataforma escolhendo a aba "Profissional" na tela de login. Cada barbeiro tem um ambiente totalmente isolado: os clientes, cortes e serviços que eles registrarem pertencerão unicamente ao seu login.
          </div>
        </div>

        {/* Search Filtration Input */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-text-muted" />
          <input
            type="text"
            placeholder="Pesquisar barbeiro por nome, usuário ou telefone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-bg-dark-800 border border-border-dark text-text-primary rounded-xl pl-10.5 pr-4 py-2.5 text-xs md:text-sm focus:outline-none focus:border-brand-amber transition-colors shadow-inner"
          />
        </div>

        {/* Desktop View Table */}
        <div className="hidden md:block bg-bg-dark-800 border border-border-dark rounded-xl overflow-hidden shadow-md">
          <table className="w-full text-left border-collapse select-none">
            <thead>
              <tr className="border-b border-border-dark text-[10px] font-bold uppercase text-text-muted tracking-wider bg-bg-dark-900/40">
                <th className="py-4 px-5">Barbeiro</th>
                <th className="py-4 px-4">Usuário</th>
                <th className="py-4 px-4">Senha</th>
                <th className="py-4 px-4">Contato</th>
                <th className="py-4 px-5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dark text-sm">
              {filteredBarbers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-text-muted italic bg-bg-dark-800">
                    Nenhum barbeiro correspondente encontrado.
                  </td>
                </tr>
              ) : (
                filteredBarbers.map((b) => (
                  <tr key={b.id} className="hover:bg-bg-dark-750/30 transition-colors">
                    <td className="py-4 px-5 flex items-center gap-3">
                      {b.avatarUrl ? (
                        <img 
                          src={b.avatarUrl} 
                          alt={b.name} 
                          referrerPolicy="no-referrer" 
                          className="w-10 h-10 rounded-full object-cover border border-brand-amber-border shrink-0 shadow-sm" 
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-brand-amber-bg border border-brand-amber-border flex items-center justify-center font-bold text-brand-amber text-xs shrink-0 shadow-sm">
                          {initials(b.name)}
                        </div>
                      )}
                      <span className="font-bold text-text-primary truncate max-w-[170px]">{b.name}</span>
                    </td>
                    <td className="py-4 px-4 text-text-secondary select-all font-mono font-bold text-xs bg-bg-dark-900/30 px-2.5 py-1 rounded w-max">
                      {b.username}
                    </td>
                    <td className="py-4 px-4 font-mono text-text-muted select-all">
                      {b.password}
                    </td>
                    <td className="py-4 px-4 space-y-1">
                      {b.phone ? (
                        <div className="text-xs text-text-primary font-mono flex items-center gap-1.5">
                          <Phone className="w-3 h-3 text-text-muted" /> {b.phone}
                        </div>
                      ) : null}
                      {b.email ? (
                        <div className="text-xs text-text-secondary flex items-center gap-1.5">
                          <Mail className="w-3 h-3 text-text-muted" /> {b.email}
                        </div>
                      ) : null}
                      {!b.phone && !b.email ? <span className="text-xs text-text-muted italic">—</span> : null}
                    </td>
                    <td className="py-4 px-5">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => openEditModal(b)}
                          className="p-2 hover:bg-bg-dark-600 border border-border-dark hover:text-text-primary text-text-secondary rounded-lg cursor-pointer transition-colors"
                          title="Editar Perfil"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteBarber(b.id, b.name)}
                          className="p-2 hover:bg-brand-danger-bg/40 border border-border-dark text-brand-danger-text rounded-lg cursor-pointer transition-colors"
                          title="Excluir Acesso"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View Cards */}
        <div className="md:hidden space-y-4 pb-8">
          {filteredBarbers.length === 0 ? (
            <div className="bg-bg-dark-800 border border-border-dark border-dashed p-8 rounded-xl text-center text-text-muted text-sm">
              Nenhum barbeiro cadastrado correspondente encontrado.
            </div>
          ) : (
            filteredBarbers.map((b) => (
              <div key={b.id} className="bg-bg-dark-800 border border-border-dark rounded-xl p-4.5 space-y-4 shadow-md flex flex-col justify-between">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {b.avatarUrl ? (
                      <img 
                        src={b.avatarUrl} 
                        alt={b.name} 
                        referrerPolicy="no-referrer" 
                        className="w-11 h-11 rounded-full object-cover border border-brand-amber-border shrink-0 shadow-sm" 
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-brand-amber-bg border border-brand-amber-border flex items-center justify-center font-bold text-brand-amber text-sm shrink-0">
                        {initials(b.name)}
                      </div>
                    )}
                    <div>
                      <h3 className="font-bold text-text-primary text-base leading-none">{b.name}</h3>
                      <span className="text-[10px] uppercase text-text-muted tracking-wider font-semibold block mt-1">Conta de Acesso</span>
                    </div>
                  </div>

                  <div className="flex gap-1">
                    <button
                      onClick={() => openEditModal(b)}
                      className="p-2 border border-border-dark hover:bg-bg-dark-700 hover:text-text-primary text-text-secondary rounded-lg cursor-pointer transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteBarber(b.id, b.name)}
                      className="p-2 border border-border-dark hover:bg-brand-danger-bg/30 text-brand-danger-text rounded-lg cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-bg-dark-900/60 p-3 rounded-xl border border-border-dark/60 text-xs text-center select-none font-mono">
                  <div>
                    <div className="text-[9px] uppercase text-text-muted font-bold tracking-wider font-sans mb-1">Usuário</div>
                    <div className="text-text-primary font-bold">{b.username}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase text-text-muted font-bold tracking-wider font-sans mb-1">Senha</div>
                    <div className="text-text-secondary">{b.password}</div>
                  </div>
                </div>

                {(b.phone || b.email) && (
                  <div className="text-xs text-text-muted border-t border-border-dark/65 pt-3.5 space-y-1 pl-1">
                    {b.phone && <div className="flex items-center gap-1.5">📞 {b.phone}</div>}
                    {b.email && <div className="flex items-center gap-1.5">✉ {b.email}</div>}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Slide-in / Modal form: Add/Edit Barber */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-bg-dark-800 border border-border-dark w-full max-w-md rounded-2xl overflow-hidden shadow-2xl relative animate-scale-up flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-border-dark flex justify-between items-center bg-bg-dark-850 shrink-0">
              <h3 className="font-display font-medium text-lg text-text-primary">
                {editingBarber ? 'Editar Barbeiro' : 'Adicionar Barbeiro'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-text-muted hover:text-text-primary rounded-lg hover:bg-bg-dark-750 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5.5 space-y-4 overflow-y-auto flex-1 min-h-0">
              {errorMsg && (
                <div id="barber-modal-error" className="bg-red-500/15 border border-red-500/30 text-[#fca5a5] p-3.5 rounded-xl text-xs font-semibold leading-relaxed animate-fade-in text-center">
                  ⚠️ {errorMsg}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary">Nome Completo *</label>
                <input
                  type="text"
                  required
                  disabled={isSaving}
                  placeholder="Nome do barbeiro"
                  value={bName}
                  onChange={(e) => setBName(e.target.value)}
                  className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-brand-amber transition-colors disabled:opacity-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text-secondary">Nome de Usuário *</label>
                  <input
                    type="text"
                    required
                    disabled={isSaving}
                    placeholder="Ex: marcos_barber"
                    value={bUsername}
                    onChange={(e) => setBUsername(e.target.value)}
                    className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-brand-amber transition-colors font-mono font-bold disabled:opacity-50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text-secondary">Senha de Acesso *</label>
                  <input
                    type="text"
                    required
                    disabled={isSaving}
                    placeholder="Ex: 12345"
                    value={bPassword}
                    onChange={(e) => setBPassword(e.target.value)}
                    className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-brand-amber transition-colors disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary">Celular / WhatsApp (Opcional)</label>
                <input
                  type="text"
                  disabled={isSaving}
                  placeholder="(35) 99999-9999"
                  value={bPhone}
                  onChange={(e) => setBPhone(e.target.value)}
                  className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-brand-amber transition-colors disabled:opacity-50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary">E-mail corporativo (Opcional)</label>
                <input
                  type="email"
                  disabled={isSaving}
                  placeholder="barbeiro@email.com"
                  value={bEmail}
                  onChange={(e) => setBEmail(e.target.value)}
                  className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-brand-amber transition-colors disabled:opacity-50"
                />
              </div>

              <div className="bg-bg-dark-950 p-4 rounded-xl border border-border-dark space-y-3.5">
                <span className="text-xs font-bold text-brand-amber block uppercase tracking-wider">
                  Recursos do Plano / Assinatura
                </span>
                
                {/* Pausado temporariamente conforme solicitação do usuário */}
                {false && (
                  <label className="flex items-start gap-3 cursor-pointer select-none group">
                    <input
                      type="checkbox"
                      checked={bFeaturePixEnabled}
                      onChange={(e) => setBFeaturePixEnabled(e.target.checked)}
                      disabled={isSaving}
                      className="w-4 h-4 mt-0.5 rounded border-border-dark text-brand-amber focus:ring-brand-amber bg-bg-dark-900 cursor-pointer accent-brand-amber"
                    />
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-text-primary group-hover:text-white transition-colors">
                        Função Pix Automático (Mercado Pago)
                      </span>
                      <span className="text-[10px] text-text-muted">
                        Permitir que clientes paguem direto no agendamento.
                      </span>
                    </div>
                  </label>
                )}

                <label className="flex items-start gap-3 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={bFeatureAlertsEnabled}
                    onChange={(e) => setBFeatureAlertsEnabled(e.target.checked)}
                    disabled={isSaving}
                    className="w-4 h-4 mt-0.5 rounded border-border-dark text-brand-amber focus:ring-brand-amber bg-bg-dark-900 cursor-pointer accent-brand-amber"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-text-primary group-hover:text-white transition-colors">
                      Avisos de Mensagem (WhatsApp / Alertas)
                    </span>
                    <span className="text-[10px] text-text-muted">
                      Liberar aba de avisos de atrasados e mensagens automáticas.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={bFeatureEmployeesEnabled}
                    onChange={(e) => setBFeatureEmployeesEnabled(e.target.checked)}
                    disabled={isSaving}
                    className="w-4 h-4 mt-0.5 rounded border-border-dark text-brand-amber focus:ring-brand-amber bg-bg-dark-900 cursor-pointer accent-brand-amber"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-text-primary group-hover:text-white transition-colors">
                      Cadastro de Equipe / Barbeiros
                    </span>
                    <span className="text-[10px] text-text-muted">
                      Permitir que a barbearia cadastre colaboradores e funcionários.
                    </span>
                  </div>
                </label>
              </div>

              <ImageUpload
                label="Foto de Perfil do Barbeiro (Opcional)"
                value={bAvatarUrl}
                onChange={(base64) => !isSaving && setBAvatarUrl(base64)}
                onClear={() => !isSaving && setBAvatarUrl('')}
                maxDimensions={{ width: 400, height: 400 }}
                aspectRatioLabel="Proporção 1:1"
              />

              <p className="text-[10px] text-text-muted italic">
                * Campos obrigatórios para habilitar o login.
              </p>

              <div className="border-t border-border-dark pt-4 flex gap-3.5 justify-end">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setModalOpen(false)}
                  className="btn btn-ghost text-xs font-bold border border-border-dark hover:bg-bg-dark-700 px-4 py-2.5 rounded-xl cursor-pointer text-text-secondary disabled:opacity-40"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="btn bg-brand-amber hover:bg-brand-amber-hover text-[#1a0e00] text-xs font-bold px-5 py-2.5 rounded-xl cursor-pointer shadow flex items-center gap-2 min-w-[130px] justify-center disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-[#1a0e00] border-t-transparent rounded-full animate-spin"></div>
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <span>{editingBarber ? 'Salvar Edição' : 'Cadastrar Barbeiro'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
