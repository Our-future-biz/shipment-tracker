import { APIError } from "encore.dev/api";
import { customerRepository } from "../repositories/customer.repository";
import type { CustomerListFilters } from "../repositories/customer.repository";
import type { CustomerRecord, NewCustomerRecord } from "../schemas/customer.schema";
import type { CustomerItem, CustomerLabel, CustomerPipelineItem, CustomerRollups, CustomerStatus } from "../interfaces/interfaces";
import { iso } from "../../../lib/db/serialize";
import { dateInput } from "../lib/dates";
import { toCustomerItem } from "../lib/mappers";
import { aresService } from "./ares.service";
import { logoService } from "./logo.service";

/** What a user may change on a customer (the rollups belong to the shipments service). */
export interface CustomerPatch {
  companyName?: string;
  dic?: string;
  status?: CustomerStatus;
  salesOwner?: string;
  currency?: string;
  label?: CustomerLabel;
  creditLimit?: number;
  paymentTerms?: string;
  freightPaymentTerms?: string;
  dutyPaymentTerms?: string;
  companyWebsite?: string;
  city?: string;
  country?: string;
  registeredAddress?: string;
  nace?: string;
}

// Must match the "PREPAYMENT" option of the web app's payment-terms selects (customers/_lib/constants.ts).
const NEW_CUSTOMER_PAYMENT_TERMS = "PREPAYMENT";

const today = () => new Date().toISOString().slice(0, 10);

// Only the fields actually sent are written.
const definedOnly = <T extends object>(patch: T): Partial<T> =>
  Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>;

class CustomerService {
  async list(companyId: string, filters: CustomerListFilters = {}): Promise<CustomerItem[]> {
    return (await customerRepository.listFiltered(companyId, filters)).map(toCustomerItem);
  }

  async get(id: string, companyId: string): Promise<CustomerItem> {
    const row = await customerRepository.getByIdForCompany(id, companyId);
    if (!row) throw APIError.notFound("Customer not found");
    return toCustomerItem(row);
  }

  /** Throws not found unless the customer is live in this company (for writes under it). */
  /** The live customer of this company; notFound otherwise. */
  async requireLive(id: string, companyId: string): Promise<CustomerRecord> {
    const customer = await customerRepository.getByIdForCompany(id, companyId);
    if (!customer) throw APIError.notFound("Customer not found");
    return customer;
  }

  // The company's customers as the sales pipeline needs them: every live one, a few fields each.
  async pipelineList(companyId: string): Promise<CustomerPipelineItem[]> {
    const customers = await customerRepository.pipelineList(companyId);
    return customers.map((customer) => ({ ...customer, createdAt: iso(customer.createdAt) }));
  }

  async createFromAres(companyId: string, ico: string): Promise<CustomerItem> {
    if (await customerRepository.findByIco(ico, companyId)) {
      throw APIError.alreadyExists("A customer with this IČO already exists");
    }
    const ares = await aresService.lookup(ico);
    const values: Omit<NewCustomerRecord, "companyId"> = {
      ico: ares.ico,
      dic: ares.dic,
      companyName: ares.companyName,
      legalForm: ares.legalForm,
      registeredAddress: ares.registeredAddress,
      city: ares.city,
      country: ares.country,
      companyStatus: ares.companyStatus,
      registrationDate: dateInput(ares.registrationDate, "registrationDate") ?? null,
      nace: ares.nace,
      dataSource: "ARES",
      lastRegistryUpdate: today(),
      status: "Prospect",
      label: "PROSPECT",
      // A new customer pays in advance until payment terms are agreed and set on its page.
      paymentTerms: NEW_CUSTOMER_PAYMENT_TERMS,
      freightPaymentTerms: NEW_CUSTOMER_PAYMENT_TERMS,
      dutyPaymentTerms: NEW_CUSTOMER_PAYMENT_TERMS,
    };
    const row = await customerRepository.createForCompany(companyId, values);
    return toCustomerItem(row);
  }

  async update(id: string, companyId: string, patch: CustomerPatch): Promise<CustomerItem> {
    const row = await customerRepository.updateForCompany(id, companyId, definedOnly(patch));
    if (!row) throw APIError.notFound("Customer not found");
    return toCustomerItem(row);
  }

  // Written only by the shipments service, which owns the shipments these are computed from.
  async updateRollups(id: string, companyId: string, rollups: CustomerRollups): Promise<void> {
    const values: Partial<NewCustomerRecord> = {
      totalRevenue: rollups.totalRevenue,
      totalProfit: rollups.totalProfit,
      totalShipments: rollups.totalShipments,
      lastActivityDate: dateInput(rollups.lastActivityDate, "lastActivityDate") ?? null,
    };
    if (!(await customerRepository.updateForCompany(id, companyId, values))) {
      throw APIError.notFound("Customer not found");
    }
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    if (!(await customerRepository.softDeleteWithChildren(id, companyId))) {
      throw APIError.notFound("Customer not found");
    }
  }

  async fetchLogo(id: string, companyId: string): Promise<CustomerItem> {
    const customer = await customerRepository.getByIdForCompany(id, companyId);
    if (!customer) throw APIError.notFound("Customer not found");
    if (!customer.companyWebsite) throw APIError.invalidArgument("Customer has no website to fetch a logo from");
    const result = await logoService.fetchLogo(customer.companyWebsite);
    if (!result) throw APIError.notFound("No logo could be fetched for this website");
    return this.setLogo(id, companyId, { logoData: result.dataUrl, logoSource: result.sourceUrl, logoUpdatedAt: result.updatedAt });
  }

  async uploadLogo(id: string, companyId: string, dataUrl: string): Promise<CustomerItem> {
    const match = /^data:(image\/(png|jpeg|jpg|webp|svg\+xml));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) {
      throw APIError.invalidArgument("Logo must be a base64 PNG, JPG, WebP, or SVG data URL");
    }
    const base64 = match[3] ?? "";
    if (Math.floor((base64.length * 3) / 4) > 2 * 1024 * 1024) {
      throw APIError.invalidArgument("Logo must be under 2 MB");
    }
    return this.setLogo(id, companyId, { logoData: dataUrl, logoSource: "upload", logoUpdatedAt: today() });
  }

  async deleteLogo(id: string, companyId: string): Promise<CustomerItem> {
    return this.setLogo(id, companyId, { logoData: "", logoSource: "", logoUpdatedAt: "" });
  }

  private async setLogo(
    id: string,
    companyId: string,
    logo: Pick<NewCustomerRecord, "logoData" | "logoSource" | "logoUpdatedAt">,
  ): Promise<CustomerItem> {
    const row = await customerRepository.updateForCompany(id, companyId, logo);
    if (!row) throw APIError.notFound("Customer not found");
    return toCustomerItem(row);
  }
}

export const customerService = new CustomerService();
