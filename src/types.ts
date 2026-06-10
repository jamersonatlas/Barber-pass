export interface Cut {
  id: string;
  service: string;
  date: string; // YYYY-MM-DD
  obs?: string;
  clientId: string;
  ownerId: string;
  createdAt: string; // ISO string or timestamp
}

export interface ChecklistItem {
  id: string;
  serviceName: string;
  done: boolean;
  dateDone?: string;
  cutId?: string;
}

export interface Client {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  package: 'Básico' | 'Premium' | 'VIP';
  value: number;
  due: number; // 1 to 28
  status: 'ok' | 'atrasado';
  obs?: string;
  lastPaid?: string; // YYYY-MM-DD
  ownerId: string;
  createdAt: string;
  updatedAt?: string;
  checklist?: ChecklistItem[];
  username?: string;
  password?: string;
}

export interface Barber {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  username: string;
  password: string;
  createdAt: string;
  avatarUrl?: string;
  
  // Customization fields
  logoUrl?: string;
  bannerUrl?: string;
  slogan?: string;
  instagram?: string;
  address?: string;
  
  // Platform license parameters
  licenseStatus?: 'active' | 'suspended' | 'pending';
  licenseValue?: number;
  licenseDueDay?: number;
  contractDurationMonths?: number;
  nextPaymentDate?: string;
  planType?: 'mensal' | 'semestral' | 'anual';
  notes?: string;
}

export interface Service {
  id: string;
  name: string;
  desc?: string;
  value: number;
  package: 'Todos' | 'Básico' | 'Premium' | 'VIP';
  ownerId: string;
  imageUrl?: string; // photo/example image of the service
}

export interface Employee {
  id: string;
  barbeariaId: string; // references Barberid (owner barbearia)
  name: string;
  phone?: string;
  avatarUrl?: string;
  createdAt: string;
}
