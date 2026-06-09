/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { 
  collection, 
  doc, 
  onSnapshot, 
  query, 
  where, 
  setDoc, 
  deleteDoc, 
  addDoc, 
  updateDoc 
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { Client, Cut, Service } from './types';
import { seedDatabaseIfEmpty, todayDate, initials, getDefaultChecklist } from './utils';

// Icons
import { 
  Scissors, 
  Users, 
  ClipboardList, 
  CreditCard, 
  Bell, 
  LogOut, 
  Plus, 
  X, 
  Check, 
  Trash2,
  Menu,
  User as UserIcon,
  HelpCircle
} from 'lucide-react';

// Modular Components
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';
import Clients from './components/Clients';
import ClientDetail from './components/ClientDetail';
import Services from './components/Services';
import Payments from './components/Payments';
import Alerts from './components/Alerts';
import Barbers from './components/Barbers';
import ClientPortal from './components/ClientPortal';

export default function App() {
  // Authentication & Loading
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  // Sync State
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [rawCutsMap, setRawCutsMap] = useState<{ [clientId: string]: Cut[] }>({});
  
  // Navigation & Details
  const [currentPage, setCurrentPage] = useState<string>('dashboard');
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Modals & Forms State
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  
  const [cutModalOpen, setCutModalOpen] = useState(false);
  const [activeCutClientId, setActiveCutClientId] = useState<string | null>(null);

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Form inputs
  const [cName, setCName] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cPackage, setCPackage] = useState<'Básico' | 'Premium' | 'VIP'>('Básico');
  const [cValue, setCValue] = useState('');
  const [cDue, setCDue] = useState('');
  const [cObs, setCObs] = useState('');
  const [cChecklist, setCChecklist] = useState<string[]>([]);
  const [cUsername, setCUsername] = useState('');
  const [cPassword, setCPassword] = useState('');

  const [sName, setSName] = useState('');
  const [sDesc, setSDesc] = useState('');
  const [sValue, setSValue] = useState('');
  const [sPackage, setSPackage] = useState<'Todos' | 'Básico' | 'Premium' | 'VIP'>('Todos');

  const [cutService, setCutService] = useState('');
  const [cutDate, setCutDate] = useState(todayDate());
  const [cutObs, setCutObs] = useState('');

  // Notifications Alert Toast
  const [toast, setToast] = useState<{ show: boolean; message: string } | null>(null);

  const triggerToast = (message: string) => {
    setToast({ show: true, message });
    setTimeout(() => {
      setToast(null);
    }, 2500);
  };

  // 1. Auth Status monitor
  useEffect(() => {
    // Check local storage session for credentials login
    const cached = localStorage.getItem('barberpass_session');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setUser(parsed);
        setLoading(false);
        return;
      } catch (e) {
        console.error('Failed to parse cached session', e);
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Read cached session first to prevent anonymous login overwrites
        const activeCached = localStorage.getItem('barberpass_session');
        if (activeCached) {
          try {
            const parsed = JSON.parse(activeCached);
            if (parsed && (parsed.role === 'client' || parsed.role === 'barber' || parsed.role === 'admin')) {
              setUser(parsed);
              setLoading(false);
              return;
            }
          } catch (e) {
            console.error('Failed to parse cached session:', e);
          }
        }

        const email = currentUser.email || '';
        const isSystemAdmin = email.trim().toLowerCase() === 'jamersonferramentas@gmail.com';
        const targetUid = isSystemAdmin ? 'admin_master' : currentUser.uid;
        const shapeSession = {
          uid: targetUid,
          displayName: currentUser.displayName || 'Administrador',
          email: email,
          role: isSystemAdmin ? 'admin' : 'barber',
          photoURL: currentUser.photoURL
        };
        setUser(shapeSession);
        localStorage.setItem('barberpass_session', JSON.stringify(shapeSession));
        
        setSeeding(true);
        try {
          // Automatic starter demo seed configuration
          await seedDatabaseIfEmpty(targetUid);
        } catch (error) {
          console.error('Failed to seed default database:', error);
        } finally {
          setSeeding(false);
        }
      } else {
        const activeCached = localStorage.getItem('barberpass_session');
        if (!activeCached) {
          setUser(null);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Real-time Subscribers syncing
  useEffect(() => {
    if (!user) {
      setClients([]);
      return;
    }

    const qClients = query(collection(db, 'clients'), where('ownerId', '==', user.uid));
    const unsubscribe = onSnapshot(qClients, (snapshot) => {
      const clientsList: Client[] = [];
      snapshot.forEach(docSnap => {
        clientsList.push({ id: docSnap.id, ...docSnap.data() } as Client);
      });
      // Sort clients alphabetically by name
      clientsList.sort((a, b) => a.name.localeCompare(b.name));
      setClients(clientsList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'clients');
    });

    return () => unsubscribe();
  }, [user?.uid]);

  // 3. Real-time Offered Services syncing
  useEffect(() => {
    if (!user) {
      setServices([]);
      return;
    }

    const qServices = query(collection(db, 'services'), where('ownerId', '==', user.uid));
    const unsubscribe = onSnapshot(qServices, (snapshot) => {
      const servicesList: Service[] = [];
      snapshot.forEach(docSnap => {
        servicesList.push({ id: docSnap.id, ...docSnap.data() } as Service);
      });
      setServices(servicesList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'services');
    });

    return () => unsubscribe();
  }, [user?.uid]);

  // 4. Real-time Client Cuts Subcollection syncing
  useEffect(() => {
    if (!user || clients.length === 0) {
      setRawCutsMap({});
      return;
    }

    const unsubscribers = clients.map(client => {
      const refCuts = collection(db, 'clients', client.id, 'cuts');
      return onSnapshot(refCuts, (snapshot) => {
        const clientCutList: Cut[] = [];
        snapshot.forEach(docSnap => {
          clientCutList.push({ id: docSnap.id, ...docSnap.data() } as Cut);
        });
        // Sort cuts descending by date
        clientCutList.sort((a, b) => b.date.localeCompare(a.date));
        
        setRawCutsMap(prev => ({
          ...prev,
          [client.id]: clientCutList
        }));
      }, (error) => {
        console.error(`Listen cuts failed for client ${client.id}:`, error);
      });
    });

    return () => unsubscribers.forEach(unsub => unsub());
  }, [user?.uid, clients.map(c => c.id).join(',')]);

  // Compile aggregate lists of all cuts for overall metrics
  const allCuts: Cut[] = Object.values(rawCutsMap).flat() as Cut[];

  // Helper values for active alerts
  const lateClientsCount = clients.filter(c => c.status === 'atrasado').length;

  // Sign out
  const handleSignOut = async () => {
    try {
      if (auth.currentUser) {
        try {
          // Clean up the temporary admin session document if they log out
          await deleteDoc(doc(db, 'admin_sessions', auth.currentUser.uid));
        } catch (dbErr) {
          console.debug('Clean of admin session omitted or failed:', dbErr);
        }
      }
      await signOut(auth);
      localStorage.removeItem('barberpass_session');
      setUser(null);
      setCurrentPage('dashboard');
      setActiveClientId(null);
      triggerToast('Sessão encerrada.');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // CLIENT CRUD OPERATIONS
  const openAddClientModal = () => {
    setEditingClient(null);
    setCName('');
    setCPhone('');
    setCEmail('');
    setCPackage('Básico');
    setCValue('70'); // seed default fee
    setCDue('5'); // seed default billing billing day
    setCObs('');
    setCChecklist(getDefaultChecklist('Básico').map(x => x.serviceName));
    setCUsername('');
    setCPassword('');
    setClientModalOpen(true);
  };

  const openEditClientModal = (client: Client) => {
    setEditingClient(client);
    setCName(client.name);
    setCPhone(client.phone || '');
    setCEmail(client.email || '');
    setCPackage(client.package);
    setCValue(String(client.value));
    setCDue(String(client.due));
    setCObs(client.obs || '');
    setCChecklist(client.checklist?.map(x => x.serviceName) || []);
    setCUsername(client.username || '');
    setCPassword(client.password || '');
    setClientModalOpen(true);
  };

  const handleSaveClient = async () => {
    if (!user) return;
    const nameStr = cName.trim();
    const valNum = parseFloat(cValue);
    const dueNum = parseInt(cDue);

    if (!nameStr || isNaN(valNum) || isNaN(dueNum) || dueNum < 1 || dueNum > 28) {
      triggerToast('Preencha nome completo, valor de cobrança e vencimento (1 a 28).');
      return;
    }

    const finalUsername = cUsername.trim()
      ? cUsername.trim().toLowerCase()
      : nameStr
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]/g, "")
          .substring(0, 15);

    const finalPassword = cPassword.trim() || Math.floor(100000 + Math.random() * 900000).toString();

    try {
      if (editingClient) {
        // Edit Client
        const existingChecklist = editingClient.checklist || [];
        const newChecklist = cChecklist.map((serviceName, index) => {
          if (existingChecklist[index]) {
            return {
              ...existingChecklist[index],
              serviceName,
            };
          } else {
            return {
              id: `item_${Date.now()}_${index}`,
              serviceName,
              done: false,
            };
          }
        });

        const clientRef = doc(db, 'clients', editingClient.id);
        await updateDoc(clientRef, {
          name: nameStr,
          phone: cPhone.trim(),
          email: cEmail.trim(),
          package: cPackage,
          value: valNum,
          due: dueNum,
          obs: cObs.trim(),
          checklist: newChecklist,
          username: finalUsername,
          password: finalPassword,
          updatedAt: new Date().toISOString()
        });
        triggerToast('Cliente atualizado com sucesso!');
      } else {
        // Add Client
        const newClientId = `cli_${user.uid}_${Date.now()}`;
        const newClientRef = doc(db, 'clients', newClientId);
        
        const newChecklist = cChecklist.map((serviceName, index) => ({
          id: `item_${Date.now()}_${index}`,
          serviceName,
          done: false,
        }));

        await setDoc(newClientRef, {
          id: newClientId,
          name: nameStr,
          phone: cPhone.trim(),
          email: cEmail.trim(),
          package: cPackage,
          value: valNum,
          due: dueNum,
          status: 'ok',
          obs: cObs.trim(),
          lastPaid: todayDate(),
          checklist: newChecklist,
          ownerId: user.uid,
          username: finalUsername,
          password: finalPassword,
          createdAt: new Date().toISOString()
        });
        triggerToast('Cliente cadastrado com sucesso!');
      }
      setClientModalOpen(false);
    } catch (error) {
      console.error('Error saving client:', error);
      handleFirestoreError(error, OperationType.WRITE, 'clients');
    }
  };

  const handleDeleteClient = (clientId: string, clientName: string) => {
    setConfirmConfig({
      title: 'Remover Assinante',
      message: `Tem certeza que deseja excluir permanentemente o cliente "${clientName}"? Todos os relatórios de atendimento associados a este cadastro também serão apagados do sistema.`,
      onConfirm: async () => {
        try {
          const clientRef = doc(db, 'clients', clientId);
          await deleteDoc(clientRef);
          
          if (activeClientId === clientId) {
            setActiveClientId(null);
            setCurrentPage('clients');
          }
          triggerToast('Assinante removido.');
        } catch (error) {
          console.error('Error deleting client:', error);
          handleFirestoreError(error, OperationType.DELETE, 'clients/' + clientId);
        }
      }
    });
    setConfirmModalOpen(true);
  };

  // CLIENT STATUS ACTION TRIGGER
  const handleToggleStatus = async (clientId: string, currentStatus: 'ok' | 'atrasado') => {
    try {
      const nextStatus = currentStatus === 'ok' ? 'atrasado' : 'ok';
      const clientRef = doc(db, 'clients', clientId);
      
      const updateData: any = { status: nextStatus };
      if (nextStatus === 'ok') {
        updateData.lastPaid = todayDate();
        // Reseta o checklist ao confirmar pagamento (renovação mensal dos créditos)
        const targetClient = clients.find(c => c.id === clientId);
        if (targetClient && targetClient.checklist) {
          updateData.checklist = targetClient.checklist.map(item => ({
            ...item,
            done: false,
            dateDone: null,
            cutId: null
          }));
        }
      }
      
      await updateDoc(clientRef, updateData);
      triggerToast(nextStatus === 'ok' ? 'Pagamento confirmado e créditos renovados!' : 'Status definido como inadimplente.');
    } catch (error) {
      console.error('Error changing subscriber status:', error);
      handleFirestoreError(error, OperationType.WRITE, 'clients/' + clientId);
    }
  };

  // CHECKLIST ITEM TOGGLE HANDLER
  const handleToggleChecklistItem = async (clientId: string, itemId: string, done: boolean) => {
    if (!user) return;
    const client = clients.find(c => c.id === clientId);
    if (!client) return;

    const currentChecklist = client.checklist || [];
    const updatedChecklist = [...currentChecklist];
    const itemIndex = updatedChecklist.findIndex(item => item.id === itemId);

    if (itemIndex === -1) return;

    const clickedItem = { ...updatedChecklist[itemIndex] };

    try {
      if (done) {
        // Mark as consumed: log a Cut record inside client subcollection
        const cutId = `cut_${clientId}_${itemId}_${Date.now()}`;
        const cutRef = doc(db, 'clients', clientId, 'cuts', cutId);
        
        await setDoc(cutRef, {
          id: cutId,
          clientId,
          service: clickedItem.serviceName,
          date: todayDate(),
          obs: 'Consumido via checklist mensal',
          ownerId: user.uid,
          createdAt: new Date().toISOString()
        });

        clickedItem.done = true;
        clickedItem.dateDone = todayDate();
        clickedItem.cutId = cutId;
      } else {
        // Uncheck: delete linked Cut record if we have one
        if (clickedItem.cutId) {
          const cutRef = doc(db, 'clients', clientId, 'cuts', clickedItem.cutId);
          await deleteDoc(cutRef);
        }
        clickedItem.done = false;
        delete clickedItem.dateDone;
        delete clickedItem.cutId;
      }

      updatedChecklist[itemIndex] = clickedItem;

      const clientRef = doc(db, 'clients', clientId);
      await updateDoc(clientRef, {
        checklist: updatedChecklist,
        updatedAt: new Date().toISOString()
      });

      triggerToast(done ? 'Serviço marcado como consumido!' : 'Serviço liberado no checklist.');
    } catch (error) {
      console.error('Error toggling checklist item:', error);
      triggerToast('Falha ao atualizar o serviço no banco de dados.');
    }
  };

  // SERVICES CRUD OPERATIONS
  const openAddServiceModal = () => {
    setSName('');
    setSDesc('');
    setSValue('');
    setSPackage('Todos');
    setServiceModalOpen(true);
  };

  const handleSaveService = async () => {
    if (!user) return;
    const nameStr = sName.trim();
    const valNum = parseFloat(sValue);

    if (!nameStr || isNaN(valNum)) {
      triggerToast('Preencha o nome do serviço e o valor base de cobrança.');
      return;
    }

    try {
      const newServiceId = `svc_${user.uid}_${Date.now()}`;
      const serviceRef = doc(db, 'services', newServiceId);
      
      await setDoc(serviceRef, {
        id: newServiceId,
        name: nameStr,
        desc: sDesc.trim(),
        value: valNum,
        package: sPackage,
        ownerId: user.uid
      });

      triggerToast('Serviço cadastrado com sucesso!');
      setServiceModalOpen(false);
    } catch (error) {
      console.error('Error saving service:', error);
      handleFirestoreError(error, OperationType.WRITE, 'services');
    }
  };

  const handleDeleteService = (serviceId: string, serviceName: string) => {
    setConfirmConfig({
      title: 'Remover Serviço',
      message: `Deletar o serviço "${serviceName}"? Ele continuará listado em atendimentos já efetuados, mas não aparecerá para novos registros.`,
      onConfirm: async () => {
        try {
          const serviceRef = doc(db, 'services', serviceId);
          await deleteDoc(serviceRef);
          triggerToast('Serviço removido.');
        } catch (error) {
          console.error('Error deleting service:', error);
          handleFirestoreError(error, OperationType.DELETE, 'services/' + serviceId);
        }
      }
    });
    setConfirmModalOpen(true);
  };

  // CUT LOG RECORDS CRUD
  const openAddCutModal = (clientId: string) => {
    setActiveCutClientId(clientId);
    // Find client package to smart filter service dropdown
    const client = clients.find(c => c.id === clientId);
    const clientPkg = client ? client.package : '';
    
    // Choose appropriate default service based on package
    const matchingSvc = services.find(s => s.package === clientPkg || s.package === 'Todos');
    setCutService(matchingSvc ? matchingSvc.name : (services[0]?.name || 'Corte simples'));
    
    setCutDate(todayDate());
    setCutObs('');
    setCutModalOpen(true);
  };

  const handleSaveCut = async () => {
    if (!user || !activeCutClientId) return;
    const serviceName = cutService;
    const dateStr = cutDate;
    const obsStr = cutObs.trim();

    if (!serviceName || !dateStr) {
      triggerToast('Selecione um serviço e a data do atendimento.');
      return;
    }

    try {
      const newCutId = `cut_${activeCutClientId}_${Date.now()}`;
      const cutRef = doc(db, 'clients', activeCutClientId, 'cuts', newCutId);
      
      await setDoc(cutRef, {
        id: newCutId,
        clientId: activeCutClientId,
        service: serviceName,
        date: dateStr,
        obs: obsStr,
        ownerId: user.uid,
        createdAt: new Date().toISOString()
      });

      triggerToast('Atendimento registrado!');
      setCutModalOpen(false);
      
      // If we are looking at details, the details component updates automatically via snapshot snap
    } catch (error) {
      console.error('Error recording cut:', error);
      handleFirestoreError(error, OperationType.WRITE, `clients/${activeCutClientId}/cuts`);
    }
  };

  const handleRemoveCut = (cutId: string) => {
    if (!activeClientId) return;
    setConfirmConfig({
      title: 'Excluir Atendimento',
      message: 'Tem certeza que deseja deletar este registro de serviço do histórico do cliente?',
      onConfirm: async () => {
        try {
          const cutRef = doc(db, 'clients', activeClientId, 'cuts', cutId);
          await deleteDoc(cutRef);
          triggerToast('Atendimento excluído.');
        } catch (error) {
          console.error('Error deleting cut:', error);
          handleFirestoreError(error, OperationType.DELETE, `clients/${activeClientId}/cuts/${cutId}`);
        }
      }
    });
    setConfirmModalOpen(true);
  };

  // Navigations route helper
  const navigateToPage = (pageName: string) => {
    setCurrentPage(pageName);
    setActiveClientId(null);
    setMobileMenuOpen(false);
  };

  const viewClientDetailsPage = (clientId: string) => {
    setActiveClientId(clientId);
    setCurrentPage('detail');
    setMobileMenuOpen(false);
  };

  // Render Page Content based on routing states
  const renderMainContent = () => {
    switch (currentPage) {
      case 'dashboard':
        if (user?.role === 'admin') {
          return (
            <AdminDashboard 
              triggerToast={triggerToast}
            />
          );
        }
        return (
          <Dashboard 
            clients={clients} 
            allCuts={allCuts} 
            onNavigate={navigateToPage} 
          />
        );
      case 'clients':
        return (
          <Clients
            clients={clients}
            onViewDetail={viewClientDetailsPage}
            onEditClient={openEditClientModal}
            onDeleteClient={handleDeleteClient}
            onOpenAddModal={openAddClientModal}
          />
        );
      case 'detail':
        return activeClientId ? (
          <ClientDetail
            clientId={activeClientId}
            clients={clients}
            clientCuts={rawCutsMap[activeClientId] || []}
            onBack={() => navigateToPage('clients')}
            onEditClient={openEditClientModal}
            onAddCutClick={() => openAddCutModal(activeClientId)}
            onRemoveCut={handleRemoveCut}
            onToggleStatus={handleToggleStatus}
            onToggleChecklistItem={handleToggleChecklistItem}
          />
        ) : null;
      case 'services':
        return (
          <Services
            services={services}
            onOpenAddModal={openAddServiceModal}
            onDeleteService={handleDeleteService}
          />
        );
      case 'payments':
        return (
          <Payments
            clients={clients}
            onToggleStatusFromPayments={handleToggleStatus}
            onNavigate={navigateToPage}
          />
        );
      case 'alerts':
        return (
          <Alerts
            clients={clients}
            onConfirmPayment={(id) => handleToggleStatus(id, 'atrasado')}
          />
        );
      case 'barbers':
        return (
          <Barbers
            onBack={() => navigateToPage('dashboard')}
            triggerToast={triggerToast}
            openConfirmModal={(title, message, onConfirm) => {
              setConfirmConfig({ title, message, onConfirm });
              setConfirmModalOpen(true);
            }}
          />
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-dark-900 flex items-center justify-center p-6 select-none">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-brand-amber border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-text-secondary font-medium uppercase tracking-wider animate-pulse">
            Carregando BarberPass...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Login 
        onLoginSuccess={(session) => {
          const shapeSession = {
            uid: session.uid,
            displayName: session.name,
            email: session.email,
            role: session.role,
            clientId: session.clientId
          };
          setUser(shapeSession);
          localStorage.setItem('barberpass_session', JSON.stringify(shapeSession));
        }}
      />
    );
  }

  if (user.role === 'client') {
    return <ClientPortal clientId={user.clientId || user.uid} onLogout={handleSignOut} />;
  }

  return (
    <div className="app flex flex-col md:flex-row h-screen overflow-hidden bg-bg-dark-900 font-sans antialiased text-text-primary select-none">
      
      {/* MOBILE HEADER */}
      <header className="md:hidden flex h-14 bg-bg-dark-800 border-b border-border-dark items-center justify-between px-4 shrink-0 z-30 select-none">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-2 hover:bg-bg-dark-700 text-text-secondary hover:text-text-primary rounded-lg cursor-pointer transition-colors"
          title="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="font-display font-bold text-lg text-white flex items-center gap-1.5">
          <span>✂</span>
          <span>
            <span className="text-brand-amber">Barber</span>Pass
          </span>
        </div>
        <div className="flex items-center gap-1">
          {lateClientsCount > 0 ? (
            <button
              onClick={() => navigateToPage('alerts')}
              className="p-2 hover:bg-bg-dark-700 text-brand-danger-text rounded-lg cursor-pointer transition-colors relative"
              title="Avisos"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-brand-danger rounded-full animate-ping"></span>
              <span className="absolute top-1 right-1 w-2 h-2 bg-brand-danger rounded-full"></span>
            </button>
          ) : (
            <div className="w-9 h-9"></div>
          )}
        </div>
      </header>

      {/* MOBILE NAV DRAWER */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden flex select-none">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300"
            onClick={() => setMobileMenuOpen(false)}
          />
          
          {/* Sheet */}
          <div className="relative flex flex-col w-[260px] max-w-[85vw] h-full bg-bg-dark-800 border-r border-border-dark shadow-2xl z-50 animate-fade-in">
            {/* Close & Logo header */}
            <div className="p-4 border-b border-border-dark flex items-center justify-between">
              <div className="logo-mark font-display text-xl font-bold tracking-tight text-white flex items-center gap-2">
                <span>✂</span>
                <span>
                  <span className="text-brand-amber">Barber</span>Pass
                </span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 hover:bg-bg-dark-700 text-text-muted hover:text-text-primary rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile Links */}
            <nav className="p-3 grow space-y-6 overflow-y-auto">
              {/* Section: PRINCIPAL */}
              <div className="space-y-1">
                <div className="nav-section text-[9px] font-bold text-text-muted uppercase tracking-widest px-3 mb-1.5">
                  Principal
                </div>
                <button
                  onClick={() => navigateToPage('dashboard')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                    currentPage === 'dashboard'
                      ? 'bg-brand-amber-bg text-brand-amber border border-brand-amber-border/40'
                      : 'text-text-secondary hover:bg-bg-dark-700 hover:text-text-primary border border-transparent'
                  }`}
                >
                  <ClipboardList className="w-4 h-4 shrink-0" />
                  <span>Dashboard</span>
                </button>
                
                {user?.role !== 'admin' && (
                  <button
                    onClick={() => navigateToPage('clients')}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                      currentPage === 'clients' || currentPage === 'detail'
                        ? 'bg-brand-amber-bg text-brand-amber border border-brand-amber-border/40'
                        : 'text-text-secondary hover:bg-bg-dark-700 hover:text-text-primary border border-transparent'
                    }`}
                  >
                    <Users className="w-4 h-4 shrink-0" />
                    <span>Clientes</span>
                  </button>
                )}
              </div>

              {/* Section: GESTÃO */}
              {user?.role !== 'admin' && (
                <div className="space-y-1">
                  <div className="nav-section text-[9px] font-bold text-text-muted uppercase tracking-widest px-3 mb-1.5">
                    Gestão
                  </div>
                  <button
                    onClick={() => navigateToPage('services')}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                      currentPage === 'services'
                        ? 'bg-brand-amber-bg text-brand-amber border border-brand-amber-border/40'
                        : 'text-text-secondary hover:bg-bg-dark-700 hover:text-text-primary border border-transparent'
                    }`}
                  >
                    <Scissors className="w-4 h-4 shrink-0" />
                    <span>Serviços / Planos</span>
                  </button>

                  <button
                    onClick={() => navigateToPage('payments')}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                      currentPage === 'payments'
                        ? 'bg-brand-amber-bg text-brand-amber border border-brand-amber-border/40'
                        : 'text-text-secondary hover:bg-bg-dark-700 hover:text-text-primary border border-transparent'
                    }`}
                  >
                    <CreditCard className="w-4 h-4 shrink-0" />
                    <span>Pagamentos</span>
                  </button>

                  <button
                    onClick={() => navigateToPage('alerts')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                      currentPage === 'alerts'
                        ? 'bg-brand-amber-bg text-brand-amber border border-brand-amber-border/40'
                        : 'text-text-secondary hover:bg-bg-dark-700 hover:text-text-primary border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Bell className="w-4 h-4 shrink-0" />
                      <span>Avisos</span>
                    </div>
                    {lateClientsCount > 0 && (
                      <span className="bg-brand-danger text-white text-[10px] leading-none font-bold px-1.5 py-0.5 rounded-full">
                        {lateClientsCount}
                      </span>
                    )}
                  </button>
                </div>
              )}

              {/* Section: ADMINISTRADOR MASTER */}
              {user?.role === 'admin' && (
                <div className="space-y-1">
                  <div className="nav-section text-[9px] font-bold text-text-muted uppercase tracking-widest px-3 mb-1.5">
                    Administrador Master
                  </div>
                  <button
                    onClick={() => {
                      navigateToPage('barbers');
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                      currentPage === 'barbers'
                        ? 'bg-brand-amber-bg text-brand-amber border border-brand-amber-border/40'
                        : 'text-text-secondary hover:bg-bg-dark-700 hover:text-text-primary border border-transparent'
                    }`}
                  >
                    <Users className="w-4 h-4 shrink-0" />
                    <span>Barbeiros</span>
                  </button>
                </div>
              )}
            </nav>

            {/* Mobile Drawer Footer User Card */}
            <div className="p-4 border-t border-border-dark bg-bg-dark-850 shrink-0 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt="Avatar"
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 rounded-full border border-border-dark shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-bg-dark-700 border border-border-dark flex items-center justify-center font-bold text-text-primary text-[10px] shrink-0">
                    {initials(user.displayName || user.email || 'Admin')}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-text-primary truncate max-w-[110px]">
                    {user.displayName || 'Administrador'}
                  </div>
                  <div className="text-[9px] text-text-muted truncate max-w-[110px]">
                    {user.email || ''}
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleSignOut();
                }}
                className="p-1.5 hover:bg-bg-dark-700 text-text-muted hover:text-brand-danger-text rounded-lg cursor-pointer transition-colors shrink-0"
                title="Sair"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SIDEBAR MAIN MENU (DESKTOP MODE) */}
      <aside className="sidebar hidden md:flex w-[220px] min-w-[220px] bg-bg-dark-800 border-r border-border-dark flex-col justify-between shrink-0 h-full overflow-hidden">
        <div className="flex flex-col h-full">
          {/* Logo Heading */}
          <div className="logo p-5 border-b border-border-dark shrink-0">
            <div className="logo-mark font-display text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>✂</span>
              <span>
                <span className="text-brand-amber">Barber</span>Pass
              </span>
            </div>
            <div className="logo-sub text-[10px] uppercase text-text-muted font-semibold tracking-wider mt-1.5 pl-0.5">
              Gestão por assinatura
            </div>
          </div>

          {/* Nav Links */}
          <nav className="nav p-3 grow space-y-7 overflow-y-auto">
            
            {/* Section: PRINCIPAL */}
            <div className="space-y-1">
              <div className="nav-section text-[9px] font-bold text-text-muted uppercase tracking-widest px-3 mb-2">
                Principal
              </div>
              <button
                onClick={() => navigateToPage('dashboard')}
                className={`nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                  currentPage === 'dashboard'
                    ? 'bg-brand-amber-bg text-brand-amber border border-brand-amber-border/40'
                    : 'text-text-secondary hover:bg-bg-dark-700 hover:text-text-primary border border-transparent'
                }`}
              >
                <ClipboardList className="w-4 h-4 shrink-0" />
                <span>Dashboard</span>
              </button>
              
              {user?.role !== 'admin' && (
                <button
                  onClick={() => navigateToPage('clients')}
                  className={`nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                    currentPage === 'clients' || currentPage === 'detail'
                      ? 'bg-brand-amber-bg text-brand-amber border border-brand-amber-border/40'
                      : 'text-text-secondary hover:bg-bg-dark-700 hover:text-text-primary border border-transparent'
                  }`}
                >
                  <Users className="w-4 h-4 shrink-0" />
                  <span>Clientes</span>
                </button>
              )}
            </div>

            {/* Section: GESTÃO */}
            {user?.role !== 'admin' && (
              <div className="space-y-1">
                <div className="nav-section text-[9px] font-bold text-text-muted uppercase tracking-widest px-3 mb-2">
                  Gestão
                </div>
                <button
                  onClick={() => navigateToPage('services')}
                  className={`nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                    currentPage === 'services'
                      ? 'bg-brand-amber-bg text-brand-amber border border-brand-amber-border/40'
                      : 'text-text-secondary hover:bg-bg-dark-700 hover:text-text-primary border border-transparent'
                  }`}
                >
                  <Scissors className="w-4 h-4 shrink-0" />
                  <span>Serviços / Planos</span>
                </button>

                <button
                  onClick={() => navigateToPage('payments')}
                  className={`nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                    currentPage === 'payments'
                      ? 'bg-brand-amber-bg text-brand-amber border border-brand-amber-border/40'
                      : 'text-text-secondary hover:bg-bg-dark-700 hover:text-text-primary border border-transparent'
                  }`}
                >
                  <CreditCard className="w-4 h-4 shrink-0" />
                  <span>Pagamentos</span>
                </button>

                <button
                  onClick={() => navigateToPage('alerts')}
                  className={`nav-item w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                    currentPage === 'alerts'
                      ? 'bg-brand-amber-bg text-brand-amber border border-brand-amber-border/40'
                      : 'text-text-secondary hover:bg-bg-dark-700 hover:text-text-primary border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Bell className="w-4 h-4 shrink-0" />
                    <span>Avisos</span>
                  </div>
                  {lateClientsCount > 0 && (
                    <span className="bg-brand-danger text-white text-[10px] leading-none font-bold px-1.5 py-0.5 rounded-full">
                      {lateClientsCount}
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* Section: ADMINISTRADOR MASTER */}
            {user?.role === 'admin' && (
              <div className="space-y-1">
                <div className="nav-section text-[9px] font-bold text-text-muted uppercase tracking-widest px-3 mb-2">
                  Administrador Master
                </div>
                <button
                  onClick={() => navigateToPage('barbers')}
                  className={`nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                    currentPage === 'barbers'
                      ? 'bg-brand-amber-bg text-brand-amber border border-brand-amber-border/40'
                      : 'text-text-secondary hover:bg-bg-dark-700 hover:text-text-primary border border-transparent'
                  }`}
                >
                  <Users className="w-4 h-4 shrink-0" />
                  <span>Barbeiros</span>
                </button>
              </div>
            )}
          </nav>
        </div>

        {/* User Card & Sign Out footer */}
        <div className="p-4 border-t border-border-dark bg-bg-dark-800 shrink-0 flex items-center justify-between gap-2.5 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt="Avatar"
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full border border-border-dark shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-bg-dark-700 border border-border-dark flex items-center justify-center font-bold text-text-primary shrink-0">
                {initials(user.displayName || user.email || 'Admin')}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-xs font-semibold text-text-primary truncate max-w-[100px]" title={user.displayName || 'Admin'}>
                {user.displayName || 'Administrador'}
              </div>
              <div className="text-[9px] text-text-muted truncate max-w-[100px]" title={user.email || ''}>
                {user.email || ''}
              </div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="p-1.5 hover:bg-bg-dark-600 text-text-muted hover:text-brand-danger-text rounded-lg cursor-pointer shrink-0 transition-colors"
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* PRIMARY VIEWER */}
      <main className="main flex-1 flex flex-col overflow-hidden bg-bg-dark-900">
        {seeding ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-4 border-brand-amber border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs text-text-secondary font-medium">Iniciando ambiente administrativo...</p>
          </div>
        ) : (
          renderMainContent()
        )}
      </main>

      {/* CLIENT ADD/EDIT DIALOG PANEL */}
      {clientModalOpen && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setClientModalOpen(false)}>
          <div className="modal bg-bg-dark-800 border-border-dark shadow-2xl relative w-full max-w-md rounded-2xl overflow-hidden animate-fade-in">
            <div className="modal-header border-b border-border-dark p-5 flex justify-between items-center bg-bg-dark-850">
              <h3 className="text-sm font-semibold text-text-primary">
                {editingClient ? 'Editar Cliente' : 'Novo Cliente'}
              </h3>
              <button onClick={() => setClientModalOpen(false)} className="modal-close text-text-muted hover:text-text-primary p-1 rounded-lg cursor-pointer">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            
            <div className="modal-body p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Field 1: Name */}
              <div className="grid grid-cols-1 gap-2">
                <label className="text-xs font-medium text-text-secondary">Nome completo *</label>
                <input
                  type="text"
                  placeholder="Ex: André Costa"
                  value={cName}
                  onChange={e => setCName(e.target.value)}
                />
              </div>

              {/* Field 2: Contact Phone */}
              <div className="grid grid-cols-1 gap-2">
                <label className="text-xs font-medium text-text-secondary">Telefone celular</label>
                <input
                  type="tel"
                  placeholder="Ex: (35) 98888-1111"
                  value={cPhone}
                  onChange={e => setCPhone(e.target.value)}
                />
              </div>

              {/* Field 3: Email */}
              <div className="grid grid-cols-1 gap-2">
                <label className="text-xs font-medium text-text-secondary">E-mail</label>
                <input
                  type="email"
                  placeholder="Ex: andre@email.com"
                  value={cEmail}
                  onChange={e => setCEmail(e.target.value)}
                />
              </div>

              {/* Client Portal Credentials Access Fields */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-bg-dark-900/60 border border-border-dark rounded-xl">
                <div className="flex flex-col gap-1 col-span-2">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-[10px] uppercase font-bold text-brand-amber tracking-wider">🔐 Acesso do Cliente ao Portal</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (!cName.trim()) {
                          triggerToast("Nome completo é obrigatório para gerar acesso!");
                          return;
                        }
                        const autoUser = cName.trim()
                          .toLowerCase()
                          .normalize("NFD")
                          .replace(/[\u0300-\u036f]/g, "") // remove accents
                          .replace(/[^a-z0-9]/g, "") // alphanumeric only
                          .substring(0, 15);
                        const autoPass = Math.floor(100000 + Math.random() * 900000).toString();
                        setCUsername(autoUser);
                        setCPassword(autoPass);
                        triggerToast("Usuário e Senha gerados!");
                      }}
                      className="text-[9px] bg-brand-amber text-black hover:bg-brand-amber-hover font-extrabold px-2 py-0.5 rounded cursor-pointer transition-colors"
                    >
                      Gerar dados
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-400">Só você pode criar o acesso. O cliente não pode se registrar sozinho.</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-text-secondary">Usuário</label>
                  <input
                    type="text"
                    placeholder="Ex: andrecosta"
                    value={cUsername}
                    onChange={e => setCUsername(e.target.value)}
                    className="font-mono h-9 text-xs"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-text-secondary">Senha</label>
                  <input
                    type="text"
                    placeholder="Ex: 123456"
                    value={cPassword}
                    onChange={e => setCPassword(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                {cUsername && cPassword && (
                  <button
                    type="button"
                    onClick={() => {
                      const appUrl = window.location.origin;
                      const msg = `✂️ *Seu acesso ao Club BarberPass!* ✂️\n\nOlá, *${cName || "cliente"}*!\nSeu barbeiro acaba de cadastrar o seu plano de créditos e o seu acesso ao portal:\n\n🌐 *Acesse o app:* ${appUrl}\n👤 *Seu Usuário:* ${cUsername}\n🔑 *Sua Senha:* ${cPassword}\n\nNo portal, você pode consultar seus cortes restantes no mês e prazos de renovação!`;
                      navigator.clipboard.writeText(msg);
                      triggerToast("Mensagem copiada para enviar ao cliente!");
                    }}
                    className="col-span-2 mt-1 py-1 px-2.5 rounded text-[10px] bg-brand-amber-bg text-brand-amber hover:bg-brand-amber-bg/80 border border-brand-amber-border/40 font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <span>📋 Copiar dados para enviar ao WhatsApp</span>
                  </button>
                )}
              </div>

              {/* Package and Monthly value row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-text-secondary">Pacote ativo *</label>
                  <select
                    value={cPackage}
                    onChange={e => {
                      const selPkg = e.target.value as 'Básico' | 'Premium' | 'VIP';
                      setCPackage(selPkg);
                      // Auto-fill default packages pricing and checklists
                      if (selPkg === 'Básico') {
                        setCValue('70');
                        setCChecklist(getDefaultChecklist('Básico').map(x => x.serviceName));
                      } else if (selPkg === 'Premium') {
                        setCValue('120');
                        setCChecklist(getDefaultChecklist('Premium').map(x => x.serviceName));
                      } else if (selPkg === 'VIP') {
                        setCValue('200');
                        setCChecklist(getDefaultChecklist('VIP').map(x => x.serviceName));
                      }
                    }}
                    className="cursor-pointer"
                  >
                    <option>Básico</option>
                    <option>Premium</option>
                    <option>VIP</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-text-secondary">Mensalidade (R$) *</label>
                  <input
                    type="number"
                    placeholder="Ex: 120"
                    value={cValue}
                    onChange={e => setCValue(e.target.value)}
                  />
                </div>
              </div>

              {/* Billing Due day */}
              <div className="grid grid-cols-1 gap-2">
                <label className="text-xs font-medium text-text-secondary">Dia de vencimento da mensalidade (1 a 28) *</label>
                <input
                  type="number"
                  placeholder="Ex: 10"
                  min="1"
                  max="28"
                  value={cDue}
                  onChange={e => setCDue(e.target.value)}
                />
              </div>

              {/* Checklist Services Items Configurator */}
              <div className="grid grid-cols-1 gap-2.5 pt-3.5 border-t border-border-dark">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-text-secondary">
                    Serviços inclusos no mês ({cChecklist.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => setCChecklist([...cChecklist, 'Corte simples'])}
                    className="text-[10px] bg-bg-dark-750 hover:bg-bg-dark-700 border border-border-dark rounded px-2.5 py-1 text-brand-amber cursor-pointer flex items-center gap-1 font-semibold"
                  >
                    + Adicionar Serviço
                  </button>
                </div>
                
                {cChecklist.length === 0 ? (
                  <p className="text-[10px] text-text-muted italic">Nenhum serviço configurado para este checklist.</p>
                ) : (
                  <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                    {cChecklist.map((srvName, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-[10px] text-text-muted font-mono bg-bg-dark-750 px-2 py-1.5 rounded border border-border-dark shrink-0">
                          Serviço {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={srvName}
                          onChange={(e) => {
                            const updated = [...cChecklist];
                            updated[idx] = e.target.value;
                            setCChecklist(updated);
                          }}
                          placeholder="Nome do serviço"
                          className="flex-grow py-1 px-2.5 text-xs h-8 rounded border border-border-dark bg-bg-dark-900"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...cChecklist];
                            updated.splice(idx, 1);
                            setCChecklist(updated);
                          }}
                          className="p-1.5 hover:bg-bg-dark-700 hover:text-brand-danger-text rounded text-text-muted cursor-pointer transition-colors"
                          title="Remover recurso"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Suggestions row for quick template fill */}
              <div className="flex gap-1.5 flex-wrap">
                <span className="text-[9px] text-text-muted flex items-center">Preencher modelo:</span>
                <button
                  type="button"
                  onClick={() => setCChecklist(['Corte simples', 'Corte simples'])}
                  className="text-[9px] bg-bg-dark-750 hover:bg-bg-dark-700 border border-border-dark rounded px-2 py-0.5 text-text-secondary cursor-pointer"
                >
                  2x Corte
                </button>
                <button
                  type="button"
                  onClick={() => setCChecklist(['Corte simples', 'Corte simples', 'Barba', 'Sobrancelha'])}
                  className="text-[9px] bg-bg-dark-750 hover:bg-bg-dark-700 border border-border-dark rounded px-2 py-0.5 text-text-secondary cursor-pointer"
                >
                  2xCorte + Barba + Sobrancelha
                </button>
                <button
                  type="button"
                  onClick={() => setCChecklist(['Corte + Barba', 'Corte + Barba', 'Barba', 'Hidratação', 'Corte simples'])}
                  className="text-[9px] bg-bg-dark-750 hover:bg-bg-dark-700 border border-border-dark rounded px-2 py-0.5 text-text-secondary cursor-pointer"
                >
                  Pacote VIP Completo (5x)
                </button>
              </div>

              {/* Observations notes */}
              <div className="grid grid-cols-1 gap-2">
                <label className="text-xs font-medium text-text-secondary">Observações / Notas</label>
                <textarea
                  placeholder="Ex: Cabelo liso, prefere corte clássico degradê nas laterais..."
                  rows={2}
                  value={cObs}
                  onChange={e => setCObs(e.target.value)}
                  className="resize-none"
                />
              </div>
            </div>

            <div className="modal-footer border-t border-border-dark p-4 flex justify-end gap-3 bg-bg-dark-850">
              <button
                onClick={() => setClientModalOpen(false)}
                className="btn btn-ghost text-xs cursor-pointer rounded-lg px-4 py-2 border border-border-dark text-text-secondary hover:text-text-primary hover:bg-bg-dark-700"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveClient}
                className="btn bg-brand-amber hover:bg-brand-amber-hover text-[#1a0e00] font-bold text-xs cursor-pointer rounded-lg px-4 py-2"
              >
                Salvar cliente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SERVICE ADD DIALOG PANEL */}
      {serviceModalOpen && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setServiceModalOpen(false)}>
          <div className="modal bg-bg-dark-800 border-border-dark shadow-2xl relative w-full max-w-md rounded-2xl overflow-hidden animate-fade-in">
            <div className="modal-header border-b border-border-dark p-5 flex justify-between items-center bg-bg-dark-850">
              <h3 className="text-sm font-semibold text-text-primary font-sans">Novo serviço</h3>
              <button onClick={() => setServiceModalOpen(false)} className="modal-close text-text-muted hover:text-text-primary p-1 rounded-lg cursor-pointer">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            
            <div className="modal-body p-5 space-y-4">
              <div className="grid grid-cols-1 gap-2">
                <label className="text-xs font-medium text-text-secondary">Nome do serviço *</label>
                <input
                  type="text"
                  placeholder="Ex: Sobrancelha na navalha"
                  value={sName}
                  onChange={e => setSName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 gap-2">
                <label className="text-xs font-medium text-text-secondary">Prerequisito / Descrição rápida</label>
                <input
                  type="text"
                  placeholder="Ex: Alinhamento completo com pinça e navalha"
                  value={sDesc}
                  onChange={e => setSDesc(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-text-secondary">Preço base (R$) *</label>
                  <input
                    type="number"
                    placeholder="Ex: 25"
                    value={sValue}
                    onChange={e => setSValue(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-text-secondary">Inclusão em Pacote</label>
                  <select
                    value={sPackage}
                    onChange={e => setSPackage(e.target.value as any)}
                    className="cursor-pointer"
                  >
                    <option>Todos</option>
                    <option>Básico</option>
                    <option>Premium</option>
                    <option>VIP</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="modal-footer border-t border-border-dark p-4 flex justify-end gap-3 bg-bg-dark-850">
              <button
                onClick={() => setServiceModalOpen(false)}
                className="btn btn-ghost text-xs cursor-pointer rounded-lg px-4 py-2 border border-border-dark text-text-secondary hover:text-text-primary hover:bg-bg-dark-700"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveService}
                className="btn bg-brand-amber hover:bg-brand-amber-hover text-[#1a0e00] font-bold text-xs cursor-pointer rounded-lg px-4 py-2"
              >
                Salvar serviço
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECORD ATENDIMENTO CUT REGISTER OVERLAY */}
      {cutModalOpen && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setCutModalOpen(false)}>
          <div className="modal bg-bg-dark-800 border-border-dark shadow-2xl relative w-full max-w-sm rounded-2xl overflow-hidden animate-fade-in">
            <div className="modal-header border-b border-border-dark p-5 flex justify-between items-center bg-bg-dark-850">
              <h3 className="text-sm font-semibold text-text-primary font-sans">Registrar Atendimento</h3>
              <button onClick={() => setCutModalOpen(false)} className="modal-close text-text-muted hover:text-text-primary p-1 rounded-lg cursor-pointer">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            
            <div className="modal-body p-5 space-y-4">
              <div className="grid grid-cols-1 gap-2">
                <label className="text-xs font-medium text-text-secondary">Serviço prestado *</label>
                <select
                  value={cutService}
                  onChange={e => setCutService(e.target.value)}
                  className="cursor-pointer"
                >
                  {services.length === 0 ? (
                    <option>Corte simples</option>
                  ) : (
                    services.map(s => (
                      <option key={s.id} value={s.name}>
                        {s.name} ({s.package !== 'Todos' ? s.package : 'Livre'})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <label className="text-xs font-medium text-text-secondary">Data do atendimento *</label>
                <input
                  type="date"
                  value={cutDate}
                  onChange={e => setCutDate(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 gap-2">
                <label className="text-xs font-medium text-text-secondary">Observações do corte / Notas</label>
                <input
                  type="text"
                  placeholder="Ex: Usou máquina 2 nas laterais, franja desfiada"
                  value={cutObs}
                  onChange={e => setCutObs(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-footer border-t border-border-dark p-4 flex justify-end gap-3 bg-bg-dark-850">
              <button
                onClick={() => setCutModalOpen(false)}
                className="btn btn-ghost text-xs cursor-pointer rounded-lg px-4 py-2 border border-border-dark text-text-secondary hover:text-text-primary hover:bg-bg-dark-700"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveCut}
                className="btn bg-brand-amber hover:bg-brand-amber-hover text-[#1a0e00] font-bold text-xs cursor-pointer rounded-lg px-4 py-2"
              >
                Gravar registro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMation OVERLAY MODAL */}
      {confirmModalOpen && confirmConfig && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setConfirmModalOpen(false)}>
          <div className="modal bg-bg-dark-800 border-border-dark shadow-2xl relative w-full max-w-sm rounded-xl overflow-hidden animate-fade-in p-5">
            <h3 className="text-sm font-semibold text-text-primary mb-2">{confirmConfig.title}</h3>
            <p className="text-xs text-text-secondary leading-normal mb-5">{confirmConfig.message}</p>
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setConfirmModalOpen(false)}
                className="btn btn-ghost text-xs cursor-pointer rounded-lg px-3 py-1.5 border border-border-dark text-text-secondary hover:text-text-primary hover:bg-bg-dark-700"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  confirmConfig.onConfirm();
                  setConfirmModalOpen(false);
                }}
                className="btn bg-brand-danger-bg hover:bg-bg-dark-700 hover:text-brand-danger-text text-brand-danger-text font-semibold border border-brand-danger-border text-xs cursor-pointer rounded-lg px-3 py-1.5"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REAL-TIME DYNAMIC NOTIFIER TOASTS */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-bg-dark-700 border border-border-dark-light text-text-primary px-4 py-2.5 rounded-lg text-xs z-[2000] shadow-2xl flex items-center gap-2 animate-bounce">
          <div className="w-4 h-4 rounded-full bg-brand-success-bg border border-brand-success-border flex items-center justify-center">
            <Check className="w-3 h-3 text-brand-success-text" />
          </div>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
