import { APIError } from "encore.dev/api";
import { auth } from "~encore/clients";
import { customerRepository } from "../repositories/customer.repository";
import type { CustomerListFilters } from "../repositories/customer.repository";
import type { CustomerRecord, NewCustomerRecord } from "../schemas/customer.schema";
import type { CustomerItem, CustomerLabel, CustomerPipelineItem, CustomerRollups, CustomerStatus, NewCustomerContact, RiskLevelOverride } from "../interfaces/interfaces";
import type { NewContactRecord } from "../schemas/contact.schema";
import { iso } from "../../../lib/db/serialize";
import { nameOf } from "../../../lib/userNames";
import { isUuid } from "../../../lib/uuid";
import { dateInput } from "../lib/dates";
import { toCustomerItem } from "../lib/mappers";
import { aresService } from "./ares.service";
import { fullName } from "./contact.service";

/** A company outside the Czech Republic, typed in by hand: there is no registry to read it from. */
export interface ManualCustomerInput {
  /** ISO 3166-1 alpha-2, not CZ. */
  country: string;
  companyName: string;
  registrationNumber?: string;
  vatId?: string;
  street: string;
  city: string;
  postalCode: string;
  contact: NewCustomerContact;
}

// The first contact of a new customer: its main one. Somebody must be reachable, so an email or a phone is needed.
function firstContact(contact: NewCustomerContact): Omit<NewContactRecord, "companyId" | "customerId"> {
  const firstName = contact.firstName.trim();
  const lastName = contact.lastName.trim();
  const email = (contact.email ?? "").trim();
  const phone = (contact.phone ?? "").trim();
  if (!firstName || !lastName) throw APIError.invalidArgument("The contact person needs a first and a last name");
  if (!email && !phone) throw APIError.invalidArgument("The contact person needs an email or a phone number");
  return { name: fullName(firstName, lastName), firstName, lastName, email, phone, role: contact.role ?? "Logistics Manager", isMain: true };
}

/** What a user may change on a customer (the rollups belong to the shipments service). */
export interface CustomerPatch {
  companyName?: string;
  dic?: string;
  status?: CustomerStatus;
  salesOwnerUserId?: string | null;
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
  registrationDate?: string;
  industry?: string;
  typicalCargo?: string;
  stability?: string;
  riskLevel?: RiskLevelOverride;
}

// Must match the "PREPAYMENT" option of the web app's payment-terms selects (customers/_lib/constants.ts).
const NEW_CUSTOMER_PAYMENT_TERMS = "PREPAYMENT";

const today = () => new Date().toISOString().slice(0, 10);

// Only the fields actually sent are written.
const definedOnly = <T extends object>(patch: T): Partial<T> =>
  Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>;

// The owner columns for a picked user (its id and name), or for nobody.
async function salesOwnerOf(userId: string | null): Promise<Pick<NewCustomerRecord, "salesOwner" | "salesOwnerUserId">> {
  if (userId === null) return { salesOwner: "", salesOwnerUserId: null };
  if (!isUuid(userId)) throw APIError.invalidArgument("salesOwnerUserId must be the id of a user");
  const { users } = await auth.usersList();
  const user = users.find((u) => u.id === userId);
  if (!user) throw APIError.invalidArgument("salesOwnerUserId must be a user of the company");
  return { salesOwner: nameOf(user), salesOwnerUserId: user.id };
}

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

  async createFromAres(companyId: string, ico: string, contact: NewCustomerContact): Promise<CustomerItem> {
    const mainContact = firstContact(contact);
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
      registrationDate: dateInput(ares.registrationDate, "registrationDate") ?? null,
      nace: ares.nace,
      dataSource: "ARES",
      lastRegistryUpdate: today(),
      status: "Prospect",
      label: "TARGET CUSTOMER",
      // A new customer pays in advance until payment terms are agreed and set on its page.
      paymentTerms: NEW_CUSTOMER_PAYMENT_TERMS,
      freightPaymentTerms: NEW_CUSTOMER_PAYMENT_TERMS,
      dutyPaymentTerms: NEW_CUSTOMER_PAYMENT_TERMS,
    };
    const registered = { type: "Registered" as const, street: ares.street, city: ares.postalCity || ares.city, postalCode: ares.postalCode, country: ares.country };
    const row = await customerRepository.createWithContact(companyId, values, mainContact, registered);
    return toCustomerItem(row);
  }

  async createManual(companyId: string, input: ManualCustomerInput): Promise<CustomerItem> {
    const mainContact = firstContact(input.contact);
    const country = input.country.trim().toUpperCase();
    if (country === "CZ") throw APIError.invalidArgument("A Czech company is added from ARES by its IČO");
    const registrationNumber = (input.registrationNumber ?? "").trim();
    if (registrationNumber && (await customerRepository.findByIco(registrationNumber, companyId))) {
      throw APIError.alreadyExists("A customer with this registration number already exists");
    }
    const street = input.street.trim();
    const city = input.city.trim();
    const postalCode = input.postalCode.trim();
    const values: Omit<NewCustomerRecord, "companyId"> = {
      // The column holds the IČO of a Czech customer and the registration number of a foreign one.
      ico: registrationNumber,
      dic: (input.vatId ?? "").trim(),
      companyName: input.companyName.trim(),
      registeredAddress: [street, [postalCode, city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      city,
      country,
      dataSource: "Manual",
      status: "Prospect",
      label: "TARGET CUSTOMER",
      paymentTerms: NEW_CUSTOMER_PAYMENT_TERMS,
      freightPaymentTerms: NEW_CUSTOMER_PAYMENT_TERMS,
      dutyPaymentTerms: NEW_CUSTOMER_PAYMENT_TERMS,
    };
    const registered = { type: "Registered" as const, street, city, postalCode, country };
    const row = await customerRepository.createWithContact(companyId, values, mainContact, registered);
    return toCustomerItem(row);
  }

  async update(id: string, companyId: string, patch: CustomerPatch): Promise<CustomerItem> {
    const { salesOwnerUserId, registrationDate, ...fields } = patch;
    const values: Partial<NewCustomerRecord> = definedOnly(fields);
    // A date column: "" clears it, anything but a date is refused.
    const regDate = dateInput(registrationDate, "registrationDate");
    if (regDate !== undefined) values.registrationDate = regDate;
    for (const key of ["industry", "typicalCargo", "stability"] as const) {
      if (values[key] !== undefined) values[key] = values[key]!.trim();
    }
    if (salesOwnerUserId !== undefined) Object.assign(values, await salesOwnerOf(salesOwnerUserId));
    const row = await customerRepository.updateForCompany(id, companyId, values);
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

  // A won quote makes its customer Active, from Prospect or Inactive alike. A customer deleted meanwhile is skipped.
  async activate(id: string, companyId: string): Promise<boolean> {
    const customer = await customerRepository.getByIdForCompany(id, companyId);
    if (!customer || customer.status === "Active") return false;
    return !!(await customerRepository.updateForCompany(id, companyId, { status: "Active" }));
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    if (!(await customerRepository.softDeleteWithChildren(id, companyId))) {
      throw APIError.notFound("Customer not found");
    }
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
