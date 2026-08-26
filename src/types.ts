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
  package: string;
  value: number;
  due: number; // 1 to 31
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
  featurePixEnabled?: boolean;
  featureAlertsEnabled?: boolean;
  featureEmployeesEnabled?: boolean;
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

export interface WhatsAppDispatchLog {
  id: string;
  timestamp: string;
  type: 'reminder' | 'billing' | 'winback' | 'test';
  clientName: string;
  clientPhone: string;
  status: 'success' | 'error';
  messagePreview: string;
  errorMessage?: string;
}

export interface WhatsAppConfig {
  enabled: boolean;
  provider: 'meta_cloud' | 'evolution' | 'zapi' | 'ultramsg' | 'wapi' | 'wa_link' | 'custom';
  instanceId: string;
  token: string;
  apiUrl?: string;
  autoRemindersEnabled: boolean; // Reminders for upcoming bookings
  autoBillingEnabled: boolean;   // Reminders for due/overdue monthly subscriber payments
  autoWinbackEnabled: boolean;   // Automatic winback messages for inactive clients
  reminderHoursBefore: number;   // Hours before appointment (default e.g. 2)
  testPhone?: string;            // Test phone number
  logs?: WhatsAppDispatchLog[];
}
