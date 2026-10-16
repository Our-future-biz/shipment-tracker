import { iso } from "../../../lib/db/serialize";
import type { ContactRecord } from "../schemas/contact.schema";
import type { CustomerAddressRecord } from "../schemas/customerAddress.schema";
import type { CustomerRecord } from "../schemas/customer.schema";
import type { CustomerInvoiceRecord } from "../schemas/customerInvoice.schema";
import type { CustomerNoteRecord } from "../schemas/customerNote.schema";
import type { CustomerSiteRecord } from "../schemas/customerSite.schema";
import type { AddressItem, ContactItem, CustomerItem, CustomerSiteItem, DocumentItem, InvoiceItem, NoteItem } from "../interfaces/interfaces";
import { dateOutput } from "./dates";

// Rows → API items: only the declared fields go out (no companyId, deletedAt, file bytes).

export const toCustomerItem = (r: CustomerRecord): CustomerItem => ({
  id: r.id,
  ico: r.ico,
  dic: r.dic,
  companyName: r.companyName,
  legalForm: r.legalForm,
  registeredAddress: r.registeredAddress,
  city: r.city,
  country: r.country,
  registrationDate: dateOutput(r.registrationDate),
  nace: r.nace,
  industry: r.industry,
  typicalCargo: r.typicalCargo,
  stability: r.stability,
  riskLevel: r.riskLevel,
  dataSource: r.dataSource,
  lastRegistryUpdate: r.lastRegistryUpdate,
  status: r.status,
  salesOwner: r.salesOwner,
  salesOwnerUserId: r.salesOwnerUserId,
  label: r.label,
  creditLimit: r.creditLimit,
  currency: r.currency,
  paymentTerms: r.paymentTerms,
  freightPaymentTerms: r.freightPaymentTerms,
  dutyPaymentTerms: r.dutyPaymentTerms,
  companyWebsite: r.companyWebsite,
  logoData: r.logoData,
  logoSource: r.logoSource,
  logoUpdatedAt: r.logoUpdatedAt,
  totalRevenue: r.totalRevenue,
  totalProfit: r.totalProfit,
  totalShipments: r.totalShipments,
  lastActivityDate: dateOutput(r.lastActivityDate),
  roles: r.roles,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
});

export const toCustomerSiteItem = (r: CustomerSiteRecord): CustomerSiteItem => ({
  id: r.id,
  customerId: r.customerId,
  label: r.label,
  kind: r.kind,
  street: r.street,
  postcode: r.postcode,
  city: r.city,
  country: r.country,
  lat: r.lat,
  lng: r.lng,
  openingHours: r.openingHours,
  avizaceName: r.avizaceName,
  avizacePhone: r.avizacePhone,
  avizaceEmail: r.avizaceEmail,
  loadingNotes: r.loadingNotes,
  tailLiftNeeded: r.tailLiftNeeded,
  isDefault: r.isDefault,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
});

export const toContactItem = (r: ContactRecord): ContactItem => ({
  id: r.id,
  customerId: r.customerId,
  name: r.name,
  firstName: r.firstName,
  lastName: r.lastName,
  email: r.email,
  phone: r.phone,
  role: r.role,
  isMain: r.isMain,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
});

export const toNoteItem = (r: CustomerNoteRecord): NoteItem => ({
  id: r.id,
  customerId: r.customerId,
  type: r.type,
  content: r.content,
  author: r.author,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
});

/** Document metadata only: never the file bytes. */
export const toDocumentItem = (r: Omit<DocumentItem, "createdAt" | "updatedAt"> & { createdAt: Date; updatedAt: Date }): DocumentItem => ({
  id: r.id,
  customerId: r.customerId,
  name: r.name,
  type: r.type,
  fileName: r.fileName,
  fileType: r.fileType,
  fileSize: r.fileSize,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
});

export const toInvoiceItem = (r: CustomerInvoiceRecord): InvoiceItem => ({
  id: r.id,
  customerId: r.customerId,
  invoiceNumber: r.invoiceNumber,
  amount: r.amount,
  currency: r.currency,
  dueDate: dateOutput(r.dueDate),
  status: r.status,
  issuedAt: dateOutput(r.issuedAt),
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
});

export const toAddressItem = (r: CustomerAddressRecord): AddressItem => ({
  id: r.id,
  customerId: r.customerId,
  type: r.type,
  label: r.label,
  street: r.street,
  city: r.city,
  postalCode: r.postalCode,
  country: r.country,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
});
