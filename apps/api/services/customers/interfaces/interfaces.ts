// Plain interfaces for controllers. Never import Drizzle table types here —
// Encore's parser cannot resolve the $inferSelect generic chain.

// The closed sets the database CHECK constraints allow (schemas/*.schema.ts). Spelled out as
// literal unions so Encore validates requests against them and the web client gets them.
export type CustomerStatus = "Active" | "Prospect" | "Inactive";
export type CustomerLabel = "KEY ACCOUNT" | "STANDARD" | "TARGET CUSTOMER" | "RISK";
export type ContactRole =
  | "Purchasing / Procurement"
  | "Customer Service"
  | "Logistics Manager"
  | "Warehouse"
  | "Finance / Accounting"
  | "Sales"
  | "Management"
  | "Owner";
/** Registered is the company's seat; the others are where invoices go and goods are picked up or delivered. */
export type AddressType = "Registered" | "Billing" | "Pickup" | "Delivery" | "Warehouse";
/** A risk level set by hand, or "" when it is derived from the registry data. */
export type RiskLevelOverride = "" | "Low" | "Medium" | "High";
export type NoteType = "Note" | "Email" | "Call" | "Follow-up" | "Visit";
export type DocumentType = "Contract" | "NDA" | "Power of attorney" | "Customs" | "Other";
/** Credited = reversed by a credit note; like Paid, it no longer counts as owed. */
export type InvoiceStatus = "Open" | "Overdue" | "Paid" | "Credited";

export interface CustomerItem {
  id: string;
  ico: string;
  dic: string;
  companyName: string;
  legalForm: string;
  registeredAddress: string;
  city: string;
  country: string;
  /** yyyy-mm-dd, or "" when unknown */
  registrationDate: string;
  nace: string;
  /** Company analysis set by hand; "" where the derived value applies. */
  industry: string;
  typicalCargo: string;
  stability: string;
  riskLevel: RiskLevelOverride;
  dataSource: string;
  lastRegistryUpdate: string;
  status: CustomerStatus;
  /** The owner's name; without salesOwnerUserId a name typed before owners were users, or "". */
  salesOwner: string;
  salesOwnerUserId: string | null;
  label: CustomerLabel;
  creditLimit: number;
  currency: string;
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
  /** yyyy-mm-dd, or "" when the customer has no shipments */
  lastActivityDate: string;
  createdAt: string;
  updatedAt: string;
}

/** A customer as the pipeline of the sales service needs it. */
export interface CustomerPipelineItem {
  id: string;
  companyName: string;
  /** Active / Prospect / Inactive, as set by hand on the customer. */
  status: CustomerStatus;
  label: CustomerLabel;
  salesOwner: string;
  createdAt: string;
}

export interface ContactItem {
  id: string;
  customerId: string;
  /** "First Last", for showing and for quotes and shipments. */
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: ContactRole;
  isMain: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NoteItem {
  id: string;
  customerId: string;
  type: NoteType;
  content: string;
  author: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentItem {
  id: string;
  customerId: string;
  name: string;
  type: DocumentType;
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
  currency: string;
  /** yyyy-mm-dd, or "" */
  dueDate: string;
  status: InvoiceStatus;
  /** yyyy-mm-dd, or "" */
  issuedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AddressItem {
  id: string;
  customerId: string;
  type: AddressType;
  label: string;
  street: string;
  city: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2 */
  country: string;
  createdAt: string;
  updatedAt: string;
}

/** The contact person a new customer is created with; it becomes its main contact. */
export interface NewCustomerContact {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  role?: ContactRole;
}

/** One company found in ARES by its name, enough to pick it; its full record is then read by IČO. */
export interface AresSearchHit {
  ico: string;
  companyName: string;
  /** The registered address in one line, e.g. "Jankovcova 1522/53, Holešovice, 17000 Praha 7". */
  address: string;
}

export interface AresResult {
  ico: string;
  dic: string;
  companyName: string;
  legalForm: string;
  registeredAddress: string;
  city: string;
  country: string;
  registrationDate: string;
  nace: string;
  /** Street and house number, e.g. "Jankovcova 1522/53" */
  street: string;
  /** City as used in a postal address, e.g. "Praha 7" */
  postalCity: string;
  /** e.g. "170 00" */
  postalCode: string;
  /** Registered for VAT (plátce DPH) */
  vatPayer: boolean;
  /** Commercial register entry, e.g. "B 8573 vedená u Městského soudu v Praze"; "" when none */
  registerEntry: string;
}

/** What the shipments service recomputes for a customer from its shipments. */
export interface CustomerRollups {
  totalRevenue: number;
  totalProfit: number;
  totalShipments: number;
  /** yyyy-mm-dd, or "" when the customer has no shipments */
  lastActivityDate: string;
}
