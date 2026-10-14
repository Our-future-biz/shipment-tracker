import { iso } from "../../../lib/db/serialize";
import type { ContactRecord } from "../schemas/contact.schema";
import type { CustomerRecord } from "../schemas/customer.schema";
import type { CustomerInvoiceRecord } from "../schemas/customerInvoice.schema";
import type { CustomerNoteRecord } from "../schemas/customerNote.schema";
import type { ContactItem, CustomerItem, DocumentItem, InvoiceItem, NoteItem } from "../interfaces/interfaces";
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
