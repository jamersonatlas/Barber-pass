import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc, 
  query, 
  where 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Employee } from '../types';
import { initials } from '../utils';
import { 
  Users, 
  Plus, 
  Trash2, 
  Edit2, 
  Phone, 
  User as UserIcon, 
  Image as ImageIcon, 
  X, 
  UserPlus2, 
  CheckCircle,
  HelpCircle
} from 'lucide-react';

interface EmployeesProps {
  user: {
    uid: string;
    displayName: string;
    email: string;
    role: 'admin' | 'barber' | 'client';
  };
  triggerToast: (msg: string) => void;
  openConfirmModal: (title: string, message: string, onConfirm: () => void) => void;
}

const FALLBACK_AVATARS = [
  'https://images.unsplash.com/photo-1621605815971-fbc98d665033?q=80&w=250&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=250&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=250&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?q=80&w=250&auto=format&fit=crop'
];

export default function Employees({ user, triggerToast, openConfirmModal }: EmployeesProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Modal form states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  
  const [empName, setEmpName] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empAvatarUrl, setEmpAvatarUrl] = useState('');

  // Sync employees in real-time
  useEffect(() => {
    const colRef = collection(db, 'barber_employees');
    // Filter only employees belonging to this logged-in Barbearia
    const q = query(colRef, where('barbeariaId', '==', user.uid));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Employee[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Employee);
      });
      // Sort alphabetically by name
      list.sort((a, b) => a.name.localeCompare(b.name));
      setEmployees(list);
      setLoading(false);
    }, (error) => {
      console.error('Error syncing employees:', error);
      handleFirestoreError(error, OperationType.LIST, 'barber_employees');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleOpenAddModal = () => {
    setEditingEmployee(null);
    setEmpName('');
    setEmpPhone('');
    setEmpAvatarUrl('');
    setModalOpen(true);
  };

  const handleOpenEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setEmpName(emp.name);
    setEmpPhone(emp.phone || '');
    setEmpAvatarUrl(emp.avatarUrl || '');
    setModalOpen(true);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empName.trim()) {
      triggerToast('Por favor, informe o nome do barbeiro.');
      return;
    }

    try {
      if (editingEmployee) {
        // Edit 
        const docRef = doc(db, 'barber_employees', editingEmployee.id);
        await updateDoc(docRef, {
          name: empName.trim(),
          phone: empPhone.trim(),
          avatarUrl: empAvatarUrl.trim(),
        });
        triggerToast('Barbeiro atualizado!');
      } else {
        // Add
        const colRef = collection(db, 'barber_employees');
        await addDoc(colRef, {
          barbeariaId: user.uid,
          name: empName.trim(),
          phone: empPhone.trim(),
          avatarUrl: empAvatarUrl.trim(),
          createdAt: new Date().toISOString()
        });
        triggerToast('Novo barbeiro contratado com sucesso!');
      }
      setModalOpen(false);
    } catch (error) {
      console.error('Error saving employee:', error);
      triggerToast('Erro ao salvar os dados.');
    }
  };

  const handleDeleteEmployee = (emp: Employee) => {
    openConfirmModal(
      'Remover Barbeiro',
      `Tem certeza que deseja remover o barbeiro profissional "${emp.name}"? Ele deixará de aparecer na página de agendamentos da sua barbearia.`,
      async () => {
        try {
          const docRef = doc(db, 'barber_employees', emp.id);
          await deleteDoc(docRef);
          triggerToast('Barbeiro profissional removido.');
        } catch (error) {
          console.error('Error deleting employee:', error);
          triggerToast('Erro de exclusão.');
        }
      }
    );
  };

  const filteredEmployees = employees.filter(emp =>
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (emp.phone && emp.phone.includes(searchQuery))
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none animate-fade-in font-sans text-text-primary">
      
      {/* Header Bar */}
      <div className="px-4 md:px-6 py-4.5 border-b border-border-dark bg-bg-dark-800 flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between shrink-0 select-none shadow">
        <div>
          <h2 className="font-display font-medium text-xl md:text-2xl text-text-primary flex items-center gap-2">
            <span>💈</span>
            <span>Meus Barbeiros ({employees.length})</span>
          </h2>
          <p className="text-text-muted text-[11px] uppercase tracking-wider font-semibold mt-1">
            Profissionais e Colaboradores da sua Barbearia
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="btn bg-[#c5a880] hover:bg-[#c5a880]/90 text-black text-xs font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow transition-all active:scale-[0.98]"
        >
          <Plus className="w-4.5 h-4.5" />
          <span>Adicionar Barbeiro</span>
        </button>
      </div>

      {/* Main Content scrollable */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        
        {/* Info card box banner */}
        <div className="bg-gradient-to-r from-bg-dark-800 to-bg-dark-850 border border-border-dark rounded-xl p-5 relative overflow-hidden flex flex-col sm:flex-row items-center gap-4 shadow-md">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-[#c5a880]"></div>
          <div className="w-12 h-12 rounded-full bg-[#c5a880]/10 border border-[#c5a880]/20 flex items-center justify-center text-[#c5a880] shrink-0 font-bold text-lg">
            ?
          </div>
          <div className="space-y-1">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Configure sua Equipe de Profissionais</h3>
            <p className="text-xs text-text-secondary leading-relaxed max-w-2xl">
              Cadastre todos os barbeiros que trabalham no seu estabelecimento comercial. No seu link exclusivo de agendamento publico, os clientes poderão escolher exatamente qual profissional preferem para realizar o corte!
            </p>
          </div>
        </div>

        {/* Filter input */}
        <div className="relative">
          <input
            type="text"
            placeholder="Pesquisar barbeiro por nome ou telefone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-bg-dark-800 border border-border-dark text-text-primary rounded-xl pl-4 pr-4 py-2.5 text-xs md:text-sm focus:outline-none focus:border-[#c5a880] transition-colors shadow-inner"
          />
        </div>

        {loading ? (
          <div className="py-20 text-center flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-2 border-[#c5a880] border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-xs text-text-secondary">Carregando lista de profissionais...</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="bg-bg-dark-800 border border-border-dark border-dashed rounded-xl p-12 text-center text-text-muted italic text-xs max-w-lg mx-auto">
            <UserPlus2 className="w-12 h-12 mx-auto stroke-[1.5] text-border-dark mb-3" />
            <p className="font-semibold text-text-secondary">Nenhum barbeiro adicionado à sua barbearia.</p>
            <p className="mt-1 text-text-muted">Adicione os barbeiros que trabalham com você para que fiquem disponíveis para reserva no seu link de agendamento automático!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEmployees.map((emp, idx) => {
              const photoSrc = emp.avatarUrl || FALLBACK_AVATARS[idx % FALLBACK_AVATARS.length];
              return (
                <div key={emp.id} className="bg-bg-dark-800 border border-border-dark rounded-xl p-5 flex items-center justify-between gap-4 shadow hover:border-text-muted transition-all group">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <img 
                      src={photoSrc} 
                      alt={emp.name} 
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded-full object-cover border border-border-dark bg-bg-dark-900 shadow-sm" 
                    />
                    <div className="min-w-0">
                      <h4 className="font-bold text-white text-sm truncate leading-tight">{emp.name}</h4>
                      <p className="text-[10px] text-brand-amber font-bold uppercase tracking-widest mt-1">
                        Profissional
                      </p>
                      {emp.phone && (
                        <span className="text-[10px] text-text-muted font-mono flex items-center gap-1 mt-1 truncate">
                          <Phone className="w-2.5 h-2.5 shrink-0" />
                          {emp.phone}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleOpenEditModal(emp)}
                      className="p-2 border border-border-dark hover:bg-bg-dark-750 text-text-secondary hover:text-white rounded-lg cursor-pointer transition-colors"
                      title="Editar Perfil"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteEmployee(emp)}
                      className="p-2 border border-border-dark hover:bg-brand-danger-bg/40 text-brand-danger-text rounded-lg cursor-pointer transition-colors"
                      title="Remover Funcionario"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CREATE / EDIT MODAL DRAWER DIALOG */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4 z-50 animate-fade-in">
          <div 
            className="bg-bg-dark-800 border border-border-dark w-full max-w-md rounded-2xl p-6 shadow-2xl relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-0 inset-x-0 h-1 bg-[#c5a880]"></div>
            
            <div className="flex items-center justify-between pb-4 border-b border-border-dark select-none">
              <h3 className="font-display font-bold text-lg text-white">
                {editingEmployee ? 'Editar Perfil de Barbeiro' : 'Adicionar Novo Barbeiro'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 hover:bg-bg-dark-750 text-text-muted hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} className="space-y-4.5 pt-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary flex items-center gap-1">
                  <UserIcon className="w-3.5 h-3.5 text-brand-amber" />
                  <span>Nome do Barbeiro *</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Tom, Marcos, etc."
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#c5a880] transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-brand-amber" />
                  <span>WhatsApp / Celular (Opcional)</span>
                </label>
                <input
                  type="tel"
                  placeholder="Ex: (35) 99999-9999"
                  value={empPhone}
                  onChange={(e) => setEmpPhone(e.target.value)}
                  className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold focus:outline-none focus:border-[#c5a880] transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary flex items-center gap-1">
                  <ImageIcon className="w-3.5 h-3.5 text-brand-amber" />
                  <span>URL da Foto de Perfil (Opcional)</span>
                </label>
                <input
                  type="url"
                  placeholder="Ex: https://images.unsplash.com/photo-..."
                  value={empAvatarUrl}
                  onChange={(e) => setEmpAvatarUrl(e.target.value)}
                  className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-[#c5a880] transition-colors"
                />
              </div>

              <p className="text-[10px] text-text-muted italic leading-normal pb-1 leading-normal pl-1 select-none">
                * Os barbeiros cadastrados aqui aparecerão na agenda simplificada do seu link profissional de agendamentos para clientes realizarem agendamentos avulsos de horário.
              </p>

              <div className="pt-3 border-t border-border-dark flex gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 btn border border-border-dark font-bold text-xs py-3 rounded-xl hover:bg-bg-dark-750 text-text-secondary transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!empName.trim()}
                  className="flex-[2] btn bg-[#c5a880] hover:bg-[#c5a880]/90 text-black font-bold text-xs py-3 rounded-xl cursor-pointer disabled:opacity-40 shadow transition-colors"
                >
                  {editingEmployee ? 'Salvar Edições' : 'Contratar e Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
