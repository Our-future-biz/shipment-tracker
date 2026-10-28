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
/** Registered is the company's seat; the others are where invoices and paperwork go and goods are picked up or delivered. */
export type AddressType = "Registered" | "Billing" | "Paperwork" | "Pickup" | "Delivery" | "Warehouse";
/** A risk level set by hand, or "" when it is derived from the registry data. */
export type RiskLevelOverride = "" | "Low" | "Medium" | "High";
export type NoteType = "Note" | "Email" | "Call" | "Follow-up" | "Visit";
export type DocumentType = "Contract" | "NDA" | "Power of attorney" | "Customs" | "Other";
/** Credited = reversed by a credit note; like Paid, it no longer counts as owed. */
export type InvoiceStatus = "Open" | "Overdue" | "Paid" | "Credited";
/**
 * What a company is to us. A customer buys our services; a haulier is a trucking subcontractor; a rail operator sells us rail
 * transport, its tariffs kept under Tariffs; a first / last mile haulier trucks containers between a port or terminal and the
 * customer (pre- and on-carriage); a shipping line sells us ocean freight, its tariffs kept under Tariffs. One company can have
 * several roles.
 */
export type CustomerRole = "customer" | "haulier" | "rail_operator" | "first_last_mile_haulier" | "shipping_line";
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
  /** The owner user's e-mail; without salesOwnerUserId a name typed before owners were users, or "". */
  salesOwner: string;
  salesOwnerUserId: string | null;
  label: CustomerLabel;
  creditLimit: number;
  currency: string;
  paymentTerms: string;
  freightPaymentTerms: string;
  dutyPaymentTerms: string;
  companyWebsite: string;
  /** Where the browser loads the logo from (an API path with a short-lived token); "" when there is none. */
  logoUrl: string;
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

/** A deleted (hidden) customer as the Deleted view of the Customer Database shows it. */
export interface DeletedCustomerItem {
  id: string;
  companyName: string;
  ico: string;
  city: string;
  country: string;
  label: CustomerLabel;
  status: CustomerStatus;
  /** When it was deleted (ISO). */
  deletedAt: string;
  /** Contacts and addresses hidden together with it: a restore brings them back. */
  contactCount: number;
  addressCount: number;
}

/** A haulier company as the trucking service needs it. */
export interface HaulierCompanyItem {
  id: string;
  companyName: string;
  ico: string;
  dic: string;
  city: string;
  /** ISO 3166-1 alpha-2 as stored ("CZ" for most); "" when unknown */
  country: string;
}

/** A company with a supplier role (e.g. a rail operator) as another service lists it. */
export interface RoleCompanyItem {
  id: string;
  companyName: string;
  ico: string;
  dic: string;
  city: string;
  /** ISO 3166-1 alpha-2 as stored ("CZ" for most); "" when unknown */
  country: string;
}

/** A customer as another service links to it: id, current name and account type. */
export interface CustomerRef {
  id: string;
  companyName: string;
  label: CustomerLabel;
}

/** A contact person as another service links to it. */
export interface CustomerContactRef {
  id: string;
  customerId: string;
  /** "First Last". */
  name: string;
  email: string;
  phone: string;
  isMain: boolean;
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
  /** Who wrote it: the signed-in user's e-mail (older notes may hold a name). */
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

/** A shipment's revenue, cost and profit as its Costs Breakdown works them out. */
export interface ShipmentFinancials {
  shipmentId: string;
  /** The currency of revenue / cost / profit (the one asked for). */
  currency: string;
  /** In CZK; null when an amount (or the billing currency) has no ČNB rate, or the job's rates can't be read. */
  revenueCzk: number | null;
  costCzk: number | null;
  profitCzk: number | null;
  /** In `currency` at the job's own rate; null also when that currency has no rate. */
  revenue: number | null;
  cost: number | null;
  profit: number | null;
  /** Currencies without a rate that made the totals unknown. */
  missingCurrencies: string[];
}

/** What a run of POST /customers/people/normalize did to the company's live customers and notes. */
export interface CustomerPeopleNormalizeResult {
  /** Customers with a sales owner and notes with an author that were looked at. */
  checked: number;
  /** Rows whose person is now recorded by a user's e-mail (a customer's owner also linked to that user). */
  changed: number;
  /** Values left as they are, with how many rows have each: they name no single user of the company. */
  unmatched: { field: string; value: string; count: number }[];
}

/** What a run of POST /customers/seats/normalize did to the company's live customers. */
export interface CustomerSeatNormalizeResult {
  /** Live customers looked at. */
  checked: number;
  /** Customers whose registered address, city or country now match their Registered address. */
  changed: number;
  /** Customers without a Registered address (field "registeredAddress", value the company name): left as they are. */
  unmatched: { field: string; value: string; count: number }[];
}
