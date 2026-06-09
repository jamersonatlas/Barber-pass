import { collection, doc, getDocs, setDoc, writeBatch, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { Client, Service } from './types';

// Initial default services from HTML
const INITIAL_SERVICES = [
  { name: 'Corte simples', desc: 'Tesoura ou máquina', value: 40, package: 'Básico' },
  { name: 'Corte + Barba', desc: 'Corte completo + barba na navalha', value: 70, package: 'Premium' },
  { name: 'Barba', desc: 'Barba na navalha com toalha quente', value: 35, package: 'Todos' },
  { name: 'Hidratação', desc: 'Hidratação capilar profissional', value: 50, package: 'VIP' },
  { name: 'Pacote VIP', desc: 'Corte + Barba + Hidratação', value: 120, package: 'VIP' }
];

// Initial default clients from HTML as sandbox starter
const INITIAL_CLIENTS = [
  { name: 'André Costa', phone: '(35) 98888-1111', email: 'andre@email.com', package: 'Premium', value: 120, due: 15, status: 'ok', obs: '', lastPaid: '2026-05-15', username: 'andre', password: '123456', cuts: [
    { service: 'Corte + Barba', date: '2026-05-10', obs: 'Degradê fino nas laterais' },
    { service: 'Corte simples', date: '2026-04-22', obs: '' }
  ]},
  { name: 'Marcos Rocha', phone: '(35) 99111-2222', email: '', package: 'Básico', value: 70, due: 1, status: 'atrasado', obs: '', lastPaid: '2026-04-01', username: 'marcos', password: '123456', cuts: [
    { service: 'Corte simples', date: '2026-04-28', obs: '' }
  ]},
  { name: 'João Silva', phone: '(35) 97777-3333', email: 'joao@email.com', package: 'VIP', value: 200, due: 5, status: 'atrasado', obs: 'Cliente VIP desde 2023', lastPaid: '2026-04-05', username: 'joao', password: '123456', cuts: [
    { service: 'Corte + Barba', date: '2026-05-02', obs: '' },
    { service: 'Hidratação', date: '2026-04-15', obs: 'Hidratação com óleo de argan' }
  ]},
  { name: 'Rafael Nunes', phone: '(35) 96666-4444', email: '', package: 'Básico', value: 70, due: 20, status: 'ok', obs: '', lastPaid: '2026-05-20', username: 'rafael', password: '123456', cuts: [] },
  { name: 'Bruno Martins', phone: '(35) 95555-5555', email: 'bruno@email.com', package: 'Premium', value: 120, due: 25, status: 'ok', obs: '', lastPaid: '2026-05-25', username: 'bruno', password: '123456', cuts: [
    { service: 'Corte + Barba', date: '2026-05-12', obs: '' }
  ]},
  { name: 'Pedro Oliveira', phone: '(35) 94444-6666', email: '', package: 'Premium', value: 120, due: 8, status: 'atrasado', obs: '', lastPaid: '2026-04-08', username: 'pedro', password: '123456', cuts: [] }
];

export function getDefaultChecklist(pkg: 'Básico' | 'Premium' | 'VIP'): { id: string; serviceName: string; done: boolean; dateDone?: string; cutId?: string }[] {
  if (pkg === 'Básico') {
    return [
      { id: 'item_1', serviceName: 'Corte simples', done: false },
      { id: 'item_2', serviceName: 'Corte simples', done: false },
    ];
  } else if (pkg === 'Premium') {
    return [
      { id: 'item_1', serviceName: 'Corte + Barba', done: false },
      { id: 'item_2', serviceName: 'Corte + Barba', done: false },
      { id: 'item_3', serviceName: 'Corte + Barba', done: false },
      { id: 'item_4', serviceName: 'Barba', done: false },
    ];
  } else {
    return [
      { id: 'item_1', serviceName: 'Pacote VIP', done: false },
      { id: 'item_2', serviceName: 'Pacote VIP', done: false },
      { id: 'item_3', serviceName: 'Pacote VIP', done: false },
      { id: 'item_4', serviceName: 'Barba', done: false },
      { id: 'item_5', serviceName: 'Sobrancelha', done: false },
    ];
  }
}

export async function seedDatabaseIfEmpty(userId: string) {
  try {
    // 1. Check services with query filters to comply with secure rules and avoid permission-denied errors
    const qServices = query(collection(db, 'services'), where('ownerId', '==', userId));
    const servicesSnap = await getDocs(qServices);
    const myServices = servicesSnap.docs;
    
    if (myServices.length === 0) {
      console.log('Seeding default services for user', userId);
      const batch = writeBatch(db);
      
      INITIAL_SERVICES.forEach((s, idx) => {
        // Document ID is of standard shape
        const serviceRef = doc(db, 'services', `svc_${userId}_${idx + 1}`);
        batch.set(serviceRef, {
          ...s,
          id: `svc_${userId}_${idx + 1}`,
          ownerId: userId
        });
      });
      await batch.commit();
    }

    // 2. Check clients with query filters to comply with secure rules and avoid permission-denied errors
    const qClients = query(collection(db, 'clients'), where('ownerId', '==', userId));
    const clientsSnap = await getDocs(qClients);
    const myClients = clientsSnap.docs;

    if (myClients.length === 0) {
      console.log('Seeding default clients for user', userId);
      
      for (let i = 0; i < INITIAL_CLIENTS.length; i++) {
        const c = INITIAL_CLIENTS[i];
        const clientId = `cli_${userId}_${i + 1}`;
        const clientRef = doc(db, 'clients', clientId);
        
        const defaultChecklist = getDefaultChecklist(c.package as any);
        const seededChecklist = defaultChecklist.map((item, index) => {
          if (index < c.cuts.length) {
            const cut = c.cuts[index];
            return {
              ...item,
              done: true,
              dateDone: cut.date,
              cutId: `cut_${clientId}_${index + 1}`
            };
          }
          return item;
        });

        await setDoc(clientRef, {
          id: clientId,
          name: c.name,
          phone: c.phone,
          email: c.email,
          package: c.package,
          value: c.value,
          due: c.due,
          status: c.status,
          obs: c.obs,
          lastPaid: c.lastPaid,
          username: c.username,
          password: c.password,
          ownerId: userId,
          checklist: seededChecklist,
          createdAt: new Date().toISOString()
        });

        // Seed cuts inside subcollections
        for (let j = 0; j < c.cuts.length; j++) {
          const cut = c.cuts[j];
          const cutId = `cut_${clientId}_${j + 1}`;
          const cutRef = doc(db, 'clients', clientId, 'cuts', cutId);
          await setDoc(cutRef, {
            id: cutId,
            clientId,
            service: cut.service,
            date: cut.date,
            obs: cut.obs,
            ownerId: userId,
            createdAt: new Date().toISOString()
          });
        }
      }
    }

    // 3. Check and seed a default barber if empty
    const qBarbers = query(collection(db, 'barbers'));
    const barbersSnap = await getDocs(qBarbers);
    if (barbersSnap.empty) {
      console.log('Seeding default barber lucas');
      const barberRef = doc(db, 'barbers', 'barber_default');
      await setDoc(barberRef, {
        id: 'barber_default',
        name: 'Lucas Barbeiro',
        phone: '(35) 99999-8888',
        email: 'lucas@barberpass.com',
        username: 'lucas',
        password: '123456',
        licenseStatus: 'active',
        licenseValue: 50.00,
        licenseDueDay: 10,
        contractDurationMonths: 12,
        planType: 'mensal',
        createdAt: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error seeding database:', error);
    handleFirestoreError(error, OperationType.WRITE, 'seeding');
  }
}

// FORMATTING ROUTINES
export function initials(name: string): string {
  if (!name) return '??';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0] || '')
    .join('')
    .toUpperCase();
}

export function fmtDate(d: string | undefined): string {
  if (!d) return '—';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  const [y, m, da] = parts;
  return `${da}/${m}/${y}`;
}

export function todayDate(): string {
  return new Date().toISOString().split('T')[0];
}

export function fmtMoney(v: number): string {
  return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
}

// WhatsApp notice sender link helper
export function getWhatsAppLink(phone: string, name: string, value: number): string {
  const num = phone.replace(/\D/g, '');
  const firstName = name.trim().split(/\s+/)[0];
  const msg = encodeURIComponent(
    `Olá ${firstName}! Passando para avisar que sua mensalidade de R$ ${value},00 está em atraso. Qualquer dúvida estou à disposição. Obrigado! ✂`
  );
  return `https://wa.me/55${num}?text=${msg}`;
}
