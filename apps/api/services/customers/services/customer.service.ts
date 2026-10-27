import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { auth } from "~encore/clients";
import { customerRepository } from "../repositories/customer.repository";
import type { CustomerListFilters } from "../repositories/customer.repository";
import type { CustomerRecord, NewCustomerRecord } from "../schemas/customer.schema";
import type {
  CustomerItem,
  CustomerLabel,
  CustomerPipelineItem,
  HaulierCompanyItem,
  CustomerRole,
  CustomerRollups,
  CustomerStatus,
  DeletedCustomerItem,
  NewCustomerContact,
  RiskLevelOverride,
} from "../interfaces/interfaces";
import type { NewContactRecord } from "../schemas/contact.schema";
import { iso } from "../../../lib/db/serialize";
import { canManageSales } from "../../../lib/salesPolicy";
import { isUniqueViolation } from "../../../lib/db/errors";
import { isUuid } from "../../../lib/uuid";
import { storedEmail } from "../../../lib/personPick";
import { dateInput } from "../lib/dates";
import { toCustomerItem } from "../lib/mappers";
import { companyOfLogoToken } from "../lib/logoUrl";
import { aresService } from "./ares.service";
import { contactNames } from "./contact.service";
import { assertCzechPhone } from "../../../lib/phone";
import { contactChanged, customerChanged } from "../topics";
import { contactRepository } from "../repositories/contact.repository";
import { seatText } from "../lib/seat";

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
  /** ["customer"] when left out (a foreign haulier is added here too). */
  roles?: CustomerRole[];
}

// The first contact of a new customer: its main one. Somebody must be reachable, so an email or a phone is needed.
function firstContact(contact: NewCustomerContact): Omit<NewContactRecord, "companyId" | "customerId"> {
  const names = contactNames(contact.firstName, contact.lastName);
  const email = (contact.email ?? "").trim();
  const phone = (contact.phone ?? "").trim();
  if (!email && !phone) throw APIError.invalidArgument("The contact person needs an email or a phone number");
  assertCzechPhone(phone);
  return { ...names, email, phone, role: contact.role ?? "Logistics Manager", isMain: true };
}

// Tells the services that copy the customer's name and account type (shipments, quotes, follow-ups,
// trucking). After the write and outside its transaction; for an edit a publish that fails fails the
// request, so the user sees it and can save again. Subscribers are idempotent, so every edit is sent.
// Lost events are repaired by the superadmin …/links/normalize backfills (shipments, quotes, sales,
// trucking, warehouse-concept).
async function announce(companyId: string, row: CustomerRecord, deleted: boolean): Promise<void> {
  await customerChanged.publish({ companyId, customerId: row.id, companyName: row.companyName, label: row.label, deleted });
}

// A delete or restore can't be done again (a second try gets 404), so a failed publish after it is only logged.
async function announceLogged(companyId: string, row: CustomerRecord, deleted: boolean): Promise<void> {
  try {
    await announce(companyId, row, deleted);
  } catch (err) {
    log.error(err, "customer change not published", { companyId, customerId: row.id, deleted });
  }
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
  nace?: string;
  roles?: CustomerRole[];
  registrationDate?: string;
  industry?: string;
  typicalCargo?: string;
  stability?: string;
  riskLevel?: RiskLevelOverride;
}

// Must match the "PREPAYMENT" option of the web app's payment-terms selects (customers/_lib/constants.ts).
const NEW_CUSTOMER_PAYMENT_TERMS = "PREPAYMENT";

// A company always has at least one role; each one is kept once, in the order sent.
const requireRoles = (roles: CustomerRole[]): CustomerRole[] => {
  const unique = [...new Set(roles)];
  if (unique.length === 0) throw APIError.invalidArgument("A company needs at least one role");
  return unique;
};

const today = () => new Date().toISOString().slice(0, 10);

// Only the fields actually sent are written.
function definedOnly<T extends object>(patch: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(patch) as (keyof T)[]) {
    if (patch[key] !== undefined) out[key] = patch[key];
  }
  return out;
}

/**
 * Commercial fields of the whole company's relationship with a customer: who owns it, its
 * credit, label, payment terms and the risk set by hand. Only a manager (or above) may change
 * them; any user may edit the rest of the record.
 */
const MANAGER_FIELDS = [
  "salesOwnerUserId",
  "label",
  "creditLimit",
  "currency",
  "paymentTerms",
  "freightPaymentTerms",
  "dutyPaymentTerms",
  "industry",
  "typicalCargo",
  "stability",
  "riskLevel",
  // A haulier role puts the company into Trucking and its payables.
  "roles",
] as const satisfies readonly (keyof CustomerPatch)[];

/** The manager-only fields a patch writes; empty when a plain user may make it. */
export function managerFieldsIn(patch: CustomerPatch): string[] {
  return MANAGER_FIELDS.filter((key) => patch[key] !== undefined);
}

// The owner columns for a picked user (its id and e-mail - a person is recorded by e-mail), or for nobody.
async function salesOwnerOf(userId: string | null): Promise<Pick<NewCustomerRecord, "salesOwner" | "salesOwnerUserId">> {
  if (userId === null) return { salesOwner: "", salesOwnerUserId: null };
  if (!isUuid(userId)) throw APIError.invalidArgument("salesOwnerUserId must be the id of a user");
  // Only that user, of the caller's company and not deleted (auth looks it up by id).
  const { users } = await auth.userLookup({ ids: [userId] });
  const user = users.find((u) => u.id === userId);
  if (!user) throw APIError.invalidArgument("salesOwnerUserId must be a user of the company");
  return { salesOwner: storedEmail(user.email), salesOwnerUserId: user.id };
}

/**
 * The insert of a new customer. The IČO check before it gives the friendly answer; two creates
 * racing past it are stopped by the unique index, and the loser gets the same answer, not a 500.
 */
async function insertUnique<T>(insert: () => Promise<T>, what: string): Promise<T> {
  try {
    return await insert();
  } catch (err) {
    if (isUniqueViolation(err)) throw APIError.alreadyExists(`A customer with this ${what} already exists`);
    throw err;
  }
}

class CustomerService {
  /** The newest matching customers (at most 2000) and how many match in all. */
  async list(companyId: string, filters: CustomerListFilters = {}): Promise<{ data: CustomerItem[]; total: number }> {
    const { rows, total } = await customerRepository.listFiltered(companyId, filters);
    return { data: rows.map(toCustomerItem), total };
  }

  async get(id: string, companyId: string): Promise<CustomerItem> {
    const row = await customerRepository.getItemForCompany(id, companyId);
    if (!row) throw APIError.notFound("Customer not found");
    return toCustomerItem(row);
  }

  /** The live customer of this company (for writes under it); notFound otherwise. */
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

  // The company's hauliers (role "haulier") for the trucking service; only `ids` among them when
  // given. Ids that are not uuids cannot be a customer and are left out before they reach SQL.
  async haulierList(companyId: string, ids?: string[]): Promise<HaulierCompanyItem[]> {
    if (ids) {
      ids = ids.filter(isUuid);
      if (!ids.length) return [];
    }
    return customerRepository.haulierList(companyId, ids);
  }

  async createFromAres(
    companyId: string,
    ico: string,
    contact: NewCustomerContact,
    roles: CustomerRole[] = ["customer"],
  ): Promise<CustomerItem> {
    const checkedRoles = requireRoles(roles);
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
      roles: checkedRoles,
    };
    const registered = { type: "Registered" as const, street: ares.street, city: ares.postalCity || ares.city, postalCode: ares.postalCode, country: ares.country };
    const row = await insertUnique(() => customerRepository.createWithContact(companyId, values, mainContact, registered), "IČO");
    return toCustomerItem(row);
  }

  async createManual(companyId: string, input: ManualCustomerInput): Promise<CustomerItem> {
    const mainContact = firstContact(input.contact);
    const checkedRoles = requireRoles(input.roles ?? ["customer"]);
    const country = input.country.trim().toUpperCase();
    const companyName = input.companyName.trim();
    if (!companyName) throw APIError.invalidArgument("The company name can't be empty");
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
      companyName,
      registeredAddress: seatText(street, postalCode, city),
      city,
      country,
      dataSource: "Manual",
      roles: checkedRoles,
      status: "Prospect",
      label: "TARGET CUSTOMER",
      paymentTerms: NEW_CUSTOMER_PAYMENT_TERMS,
      freightPaymentTerms: NEW_CUSTOMER_PAYMENT_TERMS,
      dutyPaymentTerms: NEW_CUSTOMER_PAYMENT_TERMS,
    };
    const registered = { type: "Registered" as const, street, city, postalCode, country };
    const row = await insertUnique(() => customerRepository.createWithContact(companyId, values, mainContact, registered), "registration number");
    return toCustomerItem(row);
  }

  async update(id: string, companyId: string, role: string, patch: CustomerPatch): Promise<CustomerItem> {
    const restricted = managerFieldsIn(patch);
    if (restricted.length && !canManageSales(role)) {
      throw APIError.permissionDenied(`Only a manager can change: ${restricted.join(", ")}`);
    }
    const { salesOwnerUserId, registrationDate, ...fields } = patch;
    const values: Partial<NewCustomerRecord> = definedOnly(fields);
    // Other services copy the name as sent in the event: a padded or blank one is refused here.
    if (values.companyName !== undefined) {
      values.companyName = values.companyName.trim();
      if (!values.companyName) throw APIError.invalidArgument("The company name can't be empty");
    }
    if (values.roles) values.roles = requireRoles(values.roles);
    // A date column: "" clears it, anything but a date is refused.
    const regDate = dateInput(registrationDate, "registrationDate");
    if (regDate !== undefined) values.registrationDate = regDate;
    for (const key of ["industry", "typicalCargo", "stability"] as const) {
      if (values[key] !== undefined) values[key] = values[key]!.trim();
    }
    if (salesOwnerUserId !== undefined) Object.assign(values, await salesOwnerOf(salesOwnerUserId));
    const row = await customerRepository.updateForCompany(id, companyId, values);
    if (!row) throw APIError.notFound("Customer not found");
    await announce(companyId, row, false);
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
  /** One statement, so a delete or a manual status change in between is never overwritten. */
  async activate(id: string, companyId: string): Promise<boolean> {
    return customerRepository.activate(id, companyId);
  }

  // Its contacts go with it; the one customer event tells the copies of both.
  async softDelete(id: string, companyId: string): Promise<void> {
    const row = await customerRepository.softDeleteWithChildren(id, companyId);
    if (!row) throw APIError.notFound("Customer not found");
    await announceLogged(companyId, row, true);
    // Its contacts were hidden with it: each gets its own delete event with its last name, so a
    // rename of one whose event is handled after this delete still reaches the copies.
    if (row.deletedAt) {
      for (const contact of await contactRepository.hiddenWithCustomer(companyId, id, row.deletedAt)) {
        try {
          await contactChanged.publish({
            companyId, customerId: id, contactId: contact.id, name: contact.name, email: contact.email, phone: contact.phone, deleted: true,
          });
        } catch (err) {
          log.error(err, "contact delete not published", { companyId, customerId: id, contactId: contact.id });
        }
      }
    }
  }

  /** The company's deleted customers, the most recently deleted first. */
  async listDeleted(companyId: string): Promise<DeletedCustomerItem[]> {
    const rows = await customerRepository.listDeleted(companyId);
    return rows.map((r) => ({ ...r, deletedAt: iso(r.deletedAt) }));
  }

  /**
   * Brings a deleted customer back with the contacts, addresses, notes, documents, invoices and
   * sites deleted together with it. Refused while a live customer has the same registration number.
   */
  async restore(id: string, companyId: string): Promise<CustomerItem> {
    const deleted = await customerRepository.getDeletedForCompany(id, companyId);
    if (!deleted) throw APIError.notFound("Deleted customer not found");
    const clash = deleted.ico ? await customerRepository.findByIco(deleted.ico, companyId) : null;
    if (clash) {
      throw APIError.alreadyExists(
        `${clash.companyName} already has the registration number ${deleted.ico}, so ${deleted.companyName} can't be restored`,
      );
    }
    let row: CustomerRecord | null;
    try {
      row = await customerRepository.restoreWithChildren(id, companyId);
    } catch (err) {
      // Another customer with the same registration number was added in the meantime.
      if (isUniqueViolation(err)) throw APIError.alreadyExists("A customer with this registration number already exists");
      throw err;
    }
    if (!row) throw APIError.notFound("Deleted customer not found");
    await announceLogged(companyId, row, false);
    return toCustomerItem(row);
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

  /**
   * The logo's bytes for the public image endpoint: only with a valid token for this customer,
   * and only from the company the token names. Null otherwise, or when there is no logo.
   */
  async logoImage(id: string, token: string | null): Promise<{ contentType: string; buffer: Buffer } | null> {
    const companyId = companyOfLogoToken(token, id);
    if (!companyId) return null;
    const match = /^data:(image\/[a-z+]+);base64,(.+)$/.exec((await customerRepository.logoOf(id, companyId)) ?? "");
    return match ? { contentType: match[1]!, buffer: Buffer.from(match[2]!, "base64") } : null;
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
