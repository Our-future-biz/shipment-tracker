import { APIError } from "encore.dev/api";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/db";
import { contactTable } from "../schemas/contact.schema";
import { customerNoteTable } from "../schemas/customerNote.schema";
import { customerDocumentTable } from "../schemas/customerDocument.schema";
import { customerInvoiceTable } from "../schemas/customerInvoice.schema";
import { customerRepository } from "../repositories/customer.repository";
import { aresService } from "./ares.service";
import { logoService } from "./logo.service";

interface CustomerPatch {
  companyName?: string;
  dic?: string;
  status?: string;
  salesOwner?: string;
  currency?: string;
  label?: string;
  creditLimit?: number;
  paymentTerms?: string;
  freightPaymentTerms?: string;
  dutyPaymentTerms?: string;
  companyWebsite?: string;
  city?: string;
  country?: string;
  registeredAddress?: string;
  nace?: string;
  totalRevenue?: number;
  totalProfit?: number;
  totalShipments?: number;
  lastActivityDate?: string;
}

class CustomerService {
  async list(companyId: string) {
    return customerRepository.listAll(companyId);
  }

  async getById(id: string, companyId: string) {
    return customerRepository.getByIdForCompany(id, companyId);
  }

  async createFromAres(companyId: string, ico: string) {
    if (!/^\d{8}$/.test(ico)) {
      throw APIError.invalidArgument("ICO must be exactly 8 digits");
    }
    const existing = await customerRepository.findByIco(ico, companyId);
    if (existing) {
      throw APIError.alreadyExists("A customer with this IČO already exists");
    }
    const ares = await aresService.lookup(ico);
    return customerRepository.createForCompany(companyId, {
      ico: ares.ico,
      dic: ares.dic,
      companyName: ares.companyName,
      legalForm: ares.legalForm,
      registeredAddress: ares.registeredAddress,
      city: ares.city,
      country: ares.country,
      companyStatus: ares.companyStatus,
      registrationDate: ares.registrationDate,
      nace: ares.nace,
      dataSource: "ARES",
      lastRegistryUpdate: new Date().toISOString().split("T")[0],
      status: "Prospect",
      label: "PROSPECT",
    } as never);
  }

  async update(id: string, companyId: string, patch: CustomerPatch) {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) clean[key] = value;
    }
    return customerRepository.updateForCompany(id, companyId, clean as never);
  }

  async softDelete(id: string, companyId: string) {
    // Ensure the customer belongs to the caller's company before cascading.
    const customer = await customerRepository.getByIdForCompany(id, companyId);
    if (!customer) return null;
    // Cascade: soft-delete all child records so nothing is left orphaned.
    const now = new Date();
    for (const table of [contactTable, customerNoteTable, customerDocumentTable, customerInvoiceTable]) {
      await db
        .update(table)
        .set({ deletedAt: now, updatedAt: now } as never)
        .where(and(eq(table.companyId, companyId), eq(table.customerId, id), isNull(table.deletedAt)));
    }
    return customerRepository.softDeleteForCompany(id, companyId);
  }

  async fetchLogo(id: string, companyId: string) {
    const customer = await customerRepository.getByIdForCompany(id, companyId);
    if (!customer) throw APIError.notFound("Customer not found");
    const website = (customer as { companyWebsite?: string }).companyWebsite ?? "";
    if (!website) throw APIError.invalidArgument("Customer has no website to fetch a logo from");
    const result = await logoService.fetchLogo(website);
    if (!result) throw APIError.notFound("No logo could be fetched for this website");
    return customerRepository.updateForCompany(id, companyId, {
      logoData: result.dataUrl,
      logoSource: result.sourceUrl,
      logoUpdatedAt: result.updatedAt,
    } as never);
  }

  async uploadLogo(id: string, companyId: string, dataUrl: string) {
    const match = /^data:(image\/(png|jpeg|jpg|webp|svg\+xml));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) {
      throw APIError.invalidArgument("Logo must be a base64 PNG, JPG, WebP, or SVG data URL");
    }
    const base64 = match[3] ?? "";
    const bytes = Math.floor((base64.length * 3) / 4);
    if (bytes > 2 * 1024 * 1024) {
      throw APIError.invalidArgument("Logo must be under 2 MB");
    }
    return customerRepository.updateForCompany(id, companyId, {
      logoData: dataUrl,
      logoSource: "upload",
      logoUpdatedAt: new Date().toISOString().split("T")[0],
    } as never);
  }

  async deleteLogo(id: string, companyId: string) {
    return customerRepository.updateForCompany(id, companyId, {
      logoData: "",
      logoSource: "",
      logoUpdatedAt: "",
    } as never);
  }
}

export const customerService = new CustomerService();
