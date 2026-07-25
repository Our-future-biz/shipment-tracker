import { APIError } from "encore.dev/api";
import { customerRepository } from "../repositories/customer.repository";
import { aresService } from "./ares.service";
import { logoService } from "./logo.service";

interface CustomerPatch {
  companyName?: string;
  dic?: string;
  status?: string;
  salesOwner?: string;
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
  async list() {
    return customerRepository.listAll();
  }

  async getById(id: string) {
    return customerRepository.getById(id);
  }

  async createFromAres(ico: string) {
    if (!/^\d{8}$/.test(ico)) {
      throw APIError.invalidArgument("ICO must be exactly 8 digits");
    }
    const existing = await customerRepository.findByIco(ico);
    if (existing) {
      throw APIError.alreadyExists("A customer with this IČO already exists");
    }
    const ares = await aresService.lookup(ico);
    return customerRepository.create({
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

  async update(id: string, patch: CustomerPatch) {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) clean[key] = value;
    }
    return customerRepository.update(id, clean as never);
  }

  async softDelete(id: string) {
    return customerRepository.softDelete(id);
  }

  async fetchLogo(id: string) {
    const customer = await customerRepository.getById(id);
    if (!customer) throw APIError.notFound("Customer not found");
    const website = (customer as { companyWebsite?: string }).companyWebsite ?? "";
    if (!website) throw APIError.invalidArgument("Customer has no website to fetch a logo from");
    const result = await logoService.fetchLogo(website);
    if (!result) throw APIError.notFound("No logo could be fetched for this website");
    return customerRepository.update(id, {
      logoData: result.dataUrl,
      logoSource: result.sourceUrl,
      logoUpdatedAt: result.updatedAt,
    } as never);
  }

  async uploadLogo(id: string, dataUrl: string) {
    return customerRepository.update(id, {
      logoData: dataUrl,
      logoSource: "upload",
      logoUpdatedAt: new Date().toISOString().split("T")[0],
    } as never);
  }

  async deleteLogo(id: string) {
    return customerRepository.update(id, {
      logoData: "",
      logoSource: "",
      logoUpdatedAt: "",
    } as never);
  }
}

export const customerService = new CustomerService();
