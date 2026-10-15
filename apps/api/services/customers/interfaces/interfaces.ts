// Plain interfaces for controllers. Never import Drizzle table types here —
// Encore's parser cannot resolve the $inferSelect generic chain.

// The closed sets the database CHECK constraints allow (schemas/*.schema.ts). Spelled out as
// literal unions so Encore validates requests against them and the web client gets them.
export type CustomerStatus = "Active" | "Prospect" | "Inactive";
export type CustomerLabel = "KEY ACCOUNT" | "STANDARD" | "TARGET CUSTOMER" | "PROSPECT" | "RISK";
export type ContactRole = "Sales" | "Operations" | "Finance";
export type NoteType = "Note" | "Email" | "Call" | "Follow-up" | "Visit";
export type DocumentType = "Contract" | "NDA" | "Power of attorney" | "Customs" | "Other";
/** Credited = reversed by a credit note; like Paid, it no longer counts as owed. */
export type InvoiceStatus = "Open" | "Overdue" | "Paid" | "Credited";
/** What a company is to us. A customer buys our services; a haulier is a trucking subcontractor. One company can be both. */
export type CustomerRole = "customer" | "haulier";
/** What happens at a site: goods are picked up (loading), dropped off (delivery), or both. */
export type CustomerSiteKind = "loading" | "delivery" | "both";

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
  /** yyyy-mm-dd, or "" when unknown */
  registrationDate: string;
  nace: string;
  dataSource: string;
  lastRegistryUpdate: string;
  status: CustomerStatus;
  salesOwner: string;
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
  /** Never empty; "customer" for every company added before roles existed. */
  roles: CustomerRole[];
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
  name: string;
  email: string;
  phone: string;
  role: ContactRole;
  isMain: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A loading or delivery address of a customer, structured for zone pricing. */
export interface CustomerSiteItem {
  id: string;
  customerId: string;
  label: string;
  kind: CustomerSiteKind;
  street: string;
  /** Czech postcodes as 5 digits without the space ("11000"); free text for other countries. */
  postcode: string;
  city: string;
  /** ISO 3166-1 alpha-2, e.g. "CZ" */
  country: string;
  lat: number | null;
  lng: number | null;
  openingHours: string;
  /** Who to call before arriving (avizace). */
  avizaceName: string;
  avizacePhone: string;
  avizaceEmail: string;
  loadingNotes: string;
  tailLiftNeeded: boolean;
  /** At most one site per customer is the default. */
  isDefault: boolean;
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
