export type Role = 'ADMIN' | 'LANDLORD' | 'STAFF' | 'TENANT';
export type RoomStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE';
export type ContractStatus = 'ACTIVE' | 'EXPIRED' | 'TERMINATED';
export type InvoiceStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED' | 'OVERDUE';
export type InvoiceItemType = 'RENT' | 'ELECTRICITY' | 'WATER' | 'INTERNET' | 'PARKING' | 'CLEANING' | 'OTHER';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'OTHER';
export type EntryType = 'INCOME' | 'EXPENSE';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type MaintenanceStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export interface User {
  id: number;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  landlordId: number | null;
  tenantId?: number | null;
  isActive?: boolean;
  createdAt?: string;
  landlord?: { id: number; fullName: string } | null;
}

export interface RoomStats { total: number; occupied: number; available: number; maintenance: number }

export interface Service {
  id: number;
  propertyId: number;
  name: string;
  type: 'INTERNET' | 'PARKING' | 'CLEANING' | 'OTHER';
  unit: 'PER_ROOM' | 'PER_PERSON';
  price: number;
  isActive: boolean;
}

export interface Property {
  id: number;
  ownerId: number;
  name: string;
  address: string;
  description: string | null;
  floors: number;
  contactName: string | null;
  contactPhone: string | null;
  electricityPrice: number;
  waterPrice: number;
  waterMode: 'METER' | 'SPLIT_PER_PERSON';
  createdAt: string;
  owner?: { id: number; fullName: string };
  stats?: RoomStats;
  services?: Service[];
}

export interface TenantLite { id: number; fullName: string; phone: string; idNumber?: string | null }

export interface ContractTenant {
  contractId: number;
  tenantId: number;
  isPrimary: boolean;
  joinedAt: string;
  leftAt: string | null;
  tenant: TenantLite & Partial<Tenant>;
}

export interface RoomImage { id: number; url: string }

export interface Room {
  id: number;
  propertyId: number;
  roomNumber: string;
  floor: number;
  area: number | null;
  price: number;
  maxOccupancy: number;
  description: string | null;
  status: RoomStatus;
  property: { id: number; name: string; address?: string; electricityPrice?: number; waterPrice?: number };
  images: RoomImage[];
  activeContract: (Contract & { tenants: ContractTenant[] }) | null;
  contracts?: (Contract & { tenants: ContractTenant[] })[];
  meterReadings?: MeterReading[];
  invoices?: InvoiceLite[];
}

export interface Tenant {
  id: number;
  ownerId: number;
  fullName: string;
  phone: string;
  email: string | null;
  idNumber: string | null;
  dateOfBirth: string | null;
  gender: Gender | null;
  permanentAddress: string | null;
  notes: string | null;
  createdAt: string;
  currentContract?: { id: number; contractNumber: string; endDate: string; room: { id: number; roomNumber: string; property: { id: number; name: string } } } | null;
  history?: (ContractTenant & { contract: Contract & { room: { id: number; roomNumber: string; property: { id: number; name: string } } } })[];
}

export interface Contract {
  id: number;
  contractNumber: string;
  roomId: number;
  startDate: string;
  endDate: string;
  rentPrice: number;
  deposit: number;
  paymentDueDay: number;
  status: ContractStatus;
  terms: string | null;
  notes: string | null;
  endedAt: string | null;
  endReason: string | null;
  createdAt: string;
  room?: { id: number; roomNumber: string; floor?: number; area?: number | null; maxOccupancy?: number; property: { id: number; name: string; address?: string; contactName?: string | null; contactPhone?: string | null } };
  tenants?: ContractTenant[];
  invoices?: InvoiceLite[];
}

export interface MeterReading {
  id: number;
  roomId: number;
  period: string;
  electricityPrev: number;
  electricityCurr: number;
  electricityPrice: number;
  waterPrev: number;
  waterCurr: number;
  waterPrice: number;
  readingDate: string;
  note: string | null;
  electricityUsage: number;
  waterUsage: number;
  electricityCost: number;
  waterCost: number;
}

export interface MeterSheetRow {
  room: { id: number; roomNumber: string; floor: number; status: RoomStatus };
  property: { id: number; name: string; electricityPrice: number; waterPrice: number; waterMode: 'METER' | 'SPLIT_PER_PERSON' };
  reading: MeterReading | null;
  suggestion: { electricityPrev: number; waterPrev: number; previousPeriod: string | null };
  invoice: { id: number; invoiceNumber: string; paidAmount: number; status: InvoiceStatus } | null;
  locked: boolean;
}

export interface InvoiceLite {
  id: number;
  invoiceNumber: string;
  period: string;
  totalAmount: number;
  paidAmount: number;
  status: InvoiceStatus;
  dueDate: string;
}

export interface InvoiceItem {
  id?: number;
  type: InvoiceItemType;
  description: string;
  quantity: number;
  unitPrice: number;
  amount?: number;
}

export interface Payment {
  id: number;
  receiptNumber: string | null;
  invoiceId: number;
  amount: number;
  method: PaymentMethod;
  paymentDate: string;
  reference: string | null;
  note: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  createdBy?: { id?: number; fullName: string } | null;
  invoice?: InvoiceLite & {
    room: { id: number; roomNumber: string; property: { id: number; name: string; address?: string; contactPhone?: string | null } };
    contract?: { tenants: { tenant: { fullName: string; phone: string } }[] };
  };
}

export interface Invoice extends InvoiceLite {
  roomId: number;
  contractId: number;
  issueDate: string;
  note: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  balance: number;
  displayStatus: InvoiceStatus;
  zaloSentAt?: string | null;
  room: { id: number; roomNumber: string; floor?: number; property: { id: number; name: string; address?: string; contactName?: string | null; contactPhone?: string | null } };
  contract: { id: number; contractNumber: string; tenants: { isPrimary?: boolean; tenant: TenantLite }[] };
  items?: (InvoiceItem & { id: number; amount: number })[];
  payments?: Payment[];
  reading?: MeterReading | null;
}

export interface Category { id: number; ownerId: number | null; type: EntryType; name: string; usage: number; isSystem: boolean }

export interface Expense {
  id: number;
  propertyId: number;
  categoryId: number;
  type: EntryType;
  amount: number;
  entryDate: string;
  description: string;
  note: string | null;
  property: { id: number; name: string };
  category: { id: number; name: string };
  createdBy?: { fullName: string } | null;
  maintenanceRequest?: { id: number; title: string } | null;
}

export interface MaintenanceRequest {
  id: number;
  roomId: number;
  title: string;
  description: string | null;
  priority: Priority;
  requestDate: string;
  status: MaintenanceStatus;
  estimatedCost: number | null;
  actualCost: number | null;
  assignedToId: number | null;
  reportedBy: string | null;
  completedAt: string | null;
  room: { id: number; roomNumber: string; property: { id: number; name: string } };
  assignedTo: { id: number; fullName: string } | null;
  expense: { id: number; amount: number } | null;
}

export interface MonthRow {
  period: string;
  revenue: number;
  otherIncome: number;
  expense: number;
  net: number;
  invoiced: number;
  collectedOfInvoiced: number;
  electricityUsage: number;
  waterUsage: number;
}

export interface Occupancy {
  total: number;
  occupied: number;
  available: number;
  maintenance: number;
  rate: number;
  byProperty: { propertyId: number; propertyName: string; total: number; occupied: number; available: number; maintenance: number; rate: number }[];
}

export interface AuditLog {
  id: number;
  action: string;
  entity: string;
  entityId: number | null;
  oldData: unknown;
  newData: unknown;
  createdAt: string;
  user: { fullName: string } | null;
}

export type NotificationType =
  | 'INVOICE_CREATED' | 'PAYMENT_REMINDER' | 'INVOICE_OVERDUE' | 'PAYMENT_VERIFIED' | 'PAYMENT_REJECTED' | 'PAYMENT_SUBMITTED'
  | 'MAINTENANCE_REQUEST' | 'MAINTENANCE_UPDATE' | 'UNPAID_SUMMARY' | 'CONTRACT_EXPIRING' | 'ANNOUNCEMENT' | 'BANK_TX_UNMATCHED' | 'PAYMENT_AUTO_MATCHED';

export interface AppNotification {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  actionLabel: string | null;
  relatedEntityType: string | null;
  relatedEntityId: number | null;
  isRead: boolean;
  createdAt: string;
}

export type SubmissionStatus = 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED';

export interface PaymentSubmission {
  id: number;
  invoiceId: number;
  amount: number;
  transferReference: string;
  transactionId: string | null;
  transferDate: string;
  note?: string | null;
  status: SubmissionStatus;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  hasReceipt: boolean;
  tenant?: { id: number; fullName: string; phone: string };
  submittedBy?: { id: number; fullName: string; email: string };
  reviewedBy?: { id: number; fullName: string } | null;
  payment?: { id: number; receiptNumber: string | null } | null;
  invoice?: { id: number; invoiceNumber: string; period: string; totalAmount?: number; paidAmount?: number; balance?: number; displayStatus?: InvoiceStatus; paymentReference?: string | null; room?: { id: number; roomNumber: string; property: { id: number; name: string } } };
}

export interface BankAccount {
  id: number;
  landlordId: number;
  propertyId: number | null;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  branch: string | null;
  qrEnabled: boolean;
  isActive: boolean;
  property?: { id: number; name: string } | null;
}

export interface PaymentInfo {
  available: boolean;
  reason?: string;
  reference: string;
  balance: number;
  pendingAmount: number;
  payableAmount: number;
  alternatives: string[];
  bank?: { bankName: string; bankCode: string; accountNumber: string; accountHolder: string; branch: string | null };
  qrDataUrl?: string | null;
  qrError?: string;
}

export type BankTxStatus = 'MATCHED' | 'UNMATCHED' | 'NEEDS_REVIEW' | 'IGNORED';

export interface BankTransaction {
  id: number;
  provider: string;
  providerTxId: string;
  accountNumber: string;
  gateway: string | null;
  transferType: 'in' | 'out';
  amount: number;
  content: string;
  referenceCode: string | null;
  transactionDate: string;
  status: BankTxStatus;
  matchNote: string | null;
  invoiceId: number | null;
  paymentId: number | null;
  resolvedAt: string | null;
  createdAt: string;
  invoice?: { id: number; invoiceNumber: string; period: string; room: { roomNumber: string; property: { name: string } } } | null;
  payment?: { id: number; receiptNumber: string | null } | null;
}

export interface BankIntegrationInfo {
  integration: { id: number; provider: string; apiKeyLast4: string; autoConfirm: boolean; isActive: boolean; lastEventAt: string | null; createdAt: string } | null;
  webhookUrl: string;
  publicUrlConfigured: boolean;
}

export interface SmsSettings {
  settings: { enabled: boolean; invoiceCreated: boolean; reminders: boolean; paymentConfirmed: boolean; landlordAlerts: boolean } | null;
  provider: { name: string; configured: boolean; missing: string[]; testMode: boolean };
  landlordPhone: string | null;
  landlordPhoneValid: boolean;
}

export interface SmsMessage {
  id: number;
  phone: string;
  content: string;
  eventType: string;
  provider: string;
  status: 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED' | 'SKIPPED' | 'TEST';
  error: string | null;
  attempts: number;
  createdAt: string;
  sentAt: string | null;
  user?: { fullName: string } | null;
}
