// Plain interfaces for controllers. Never import Drizzle table types here —
// Encore's parser cannot resolve the $inferSelect generic chain.

export interface CustomerItem {
  id: string;
  ico: string;
  dic: string;
  companyName: string;
  legalForm: string;
  registeredAddress: string;
  city: string;
  country: string;
  companyStatus: string;
  registrationDate: string;
  nace: string;
  dataSource: string;
  lastRegistryUpdate: string;
  status: string;
  salesOwner: string;
  label: string;
  creditLimit: number;
  paymentTerms: string;
  freightPaymentTerms: string;
  dutyPaymentTerms: string;
  companyWebsite: string;
  logoData: string;
  logoSource: string;
  logoUpdatedAt: string;
  totalRevenue: number;
  totalProfit: number;
  totalShipments: number;
  lastActivityDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContactItem {
  id: string;
  customerId: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  isMain: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NoteItem {
  id: string;
  customerId: string;
  type: string;
  content: string;
  author: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentItem {
  id: string;
  customerId: string;
  name: string;
  type: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceItem {
  id: string;
  customerId: string;
  invoiceNumber: string;
  amount: number;
  dueDate: string;
  status: string;
  issuedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TermsConditionItem {
  id: string;
  name: string;
  includes: string;
  excludes: string;
  createdAt: string;
  updatedAt: string;
}

export interface AresResult {
  ico: string;
  dic: string;
  companyName: string;
  legalForm: string;
  registeredAddress: string;
  city: string;
  country: string;
  companyStatus: string;
  registrationDate: string;
  nace: string;
}
