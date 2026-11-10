import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { auth } from "~encore/clients";
import { customerRepository } from "../repositories/customer.repository";
import type { CustomerListFilters } from "../repositories/customer.repository";
import type { CustomerRecord, NewCustomerRecord } from "../schemas/customer.schema";
import type {
  CustomerDetail,
  CustomerItem,
  CustomerLabel,
  CustomerOwnerFilter,
  CustomerPipelineItem,
  CustomerRatingFilter,
  CustomerRole,
  CustomerRollups,
  CustomerStatus,
  CustomerViewCounts,
  DeletedCustomerItem,
  NewCustomerContact,
  RoleCompanyItem,
  RiskLevelOverride,
} from "../interfaces/interfaces";
import { isSupplier, SUPPLIER_ROLES } from "../interfaces/interfaces";
import type { NewContactRecord } from "../schemas/contact.schema";
import { iso } from "../../../lib/db/serialize";
import { canManageSales, canManageSupplierTerms, canRateSupplier } from "../../../lib/salesPolicy";
import { constraintOf, isUniqueViolation } from "../../../lib/db/errors";
import { isUuid } from "../../../lib/uuid";
import { isSalesReference } from "../../../lib/salesReference";
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
import { billingCurrencies } from "../lib/billingCurrencies";
import { supplierTermsService } from "./supplierTerms.service";

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
export function firstContact(contact: NewCustomerContact): Omit<NewContactRecord, "companyId" | "customerId"> {
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
  secondaryCurrencies?: string[];
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

/**
 * A new company with a supplier role (any role but Customer: haulier, rail operator, first / last mile haulier,
 * shipping line) is a manager's decision, as changing the roles later is.
 */
export function assertMayGiveRoles(actorRole: string, roles: CustomerRole[] | undefined, forApproval = false): void {
  if (forApproval) {
    if (!roles || !isSupplier(roles)) throw APIError.invalidArgument("A new supplier needs a supplier role");
    // Added from a quote it is a supplier only: a customer (one the quote customer picker offers) is added
    // in the Customer Database, where giving it supplier roles too is a manager's decision.
    if (roles.includes("customer")) throw APIError.invalidArgument("A supplier added from a quote can't be a customer too: add the customer in the Customer Database");
    return;
  }
  if (roles && isSupplier(roles) && !canManageSales(actorRole)) {
    throw APIError.permissionDenied("Only a manager can add a supplier (a company with a role other than Customer)");
  }
}

/** A supplier added from a quote's Pricing: who adds it and from which quote. */
export interface NewSupplierRequest {
  userId: string;
  quoteNumber: string;
  /** Registered through a link instead: who created it, by e-mail as a person is recorded. The company itself filled it in. */
  viaLink?: { requestedBy: string };
}

/**
 * The request a create carries when it adds a supplier from a quote; none without a quote. The quote is
 * named by its Sales Reference (QCZ…): the managers' list and the bell lead to it.
 */
export function supplierRequestOf(userId: string, fromQuote: string | undefined): NewSupplierRequest | undefined {
  const quoteNumber = fromQuote?.trim() ?? "";
  if (!quoteNumber) return undefined;
  if (!isSalesReference(quoteNumber)) throw APIError.invalidArgument("A new supplier is added from a quote: fromQuote is its Sales Reference (QCZ…)");
  return { userId, quoteNumber };
}

/**
 * The approval columns of a new company. A supplier a user who is no manager adds from a quote waits
 * for a manager (Sales → Managers → Company approval); a manager's own is approved at once, as adding a
 * supplier is already a manager's right. Anything else needs no approval.
 */
async function approvalOf(actorRole: string, request: NewSupplierRequest | undefined): Promise<Partial<NewCustomerRecord>> {
  if (request?.viaLink) {
    return { approvalStatus: "pending", approvalRequestedBy: request.viaLink.requestedBy, approvalRequestedByUserId: request.userId, approvalRequestedAt: new Date() };
  }
  if (!request || canManageSales(actorRole)) return {};
  const quoteNumber = request.quoteNumber.trim();
  if (!quoteNumber) throw APIError.invalidArgument("A new supplier names the quote it is added from");
  const { users } = await auth.userLookup({ ids: [request.userId], selfInOwnCompany: true });
  const user = users.find((u) => u.id === request.userId);
  return {
    approvalStatus: "pending",
    approvalRequestedBy: user ? storedEmail(user.email) : "",
    approvalRequestedByUserId: request.userId,
    approvalRequestedAt: new Date(),
    approvalQuoteNumber: quoteNumber,
  };
}

const today = () => new Date().toISOString().slice(0, 10);

const NOT_DECLINED = "This supplier is no longer declined: another manager took the decline back, or it was restored";

/**
 * A deleted customer back with what was deleted together with it (a restore, or a decline taken back).
 * Refused while a live customer has the same registration number. Null when it is not deleted (as asked)
 * any more: somebody brought it back in this very moment.
 */
async function bringBack(id: string, deleted: CustomerRecord, companyId: string, as: "restore" | "undoDecline"): Promise<CustomerRecord | null> {
  const clash = deleted.ico ? await customerRepository.findByIco(deleted.ico, companyId) : null;
  if (clash) {
    throw APIError.alreadyExists(
      `${clash.companyName} already has the registration number ${deleted.ico}, so ${deleted.companyName} can't be restored`,
    );
  }
  try {
    return await customerRepository.restoreWithChildren(id, companyId, as);
  } catch (err) {
    // Its addresses would come back with two Billing ones (one billing address per customer).
    if (isUniqueViolation(err) && constraintOf(err) === "customer_address_one_billing") {
      throw APIError.failedPrecondition(`${deleted.companyName} can't be restored: two of its addresses are its billing address`);
    }
    // Another customer with the same registration number was added in the meantime.
    if (isUniqueViolation(err)) throw APIError.alreadyExists("A customer with this registration number already exists");
    throw err;
  }
}

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
  "secondaryCurrencies",
  "paymentTerms",
  "freightPaymentTerms",
  "dutyPaymentTerms",
  "industry",
  "typicalCargo",
  "stability",
  "riskLevel",
  // A supplier role puts the company into Trucking and its payables (haulier) or under Tariffs (the others).
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
  /**
   * The list as a user asks for it: their own companies for "mine", the supplier types and the rating filter
   * as the repository takes them. Filtered here, on the server, so they cover every company and not only the
   * newest 2000 the list holds.
   */
  async listFor(
    companyId: string,
    userId: string,
    req: Omit<CustomerListFilters, "salesOwner" | "anyRole" | "rating" | "limit"> & { owner?: CustomerOwnerFilter; types?: string; rating?: CustomerRatingFilter },
  ): Promise<{ data: CustomerItem[]; total: number }> {
    const { owner, types, rating, ...filters } = req;
    const anyRole = (types ?? "").split(",").map((t) => t.trim()).filter(Boolean);
    const unknown = anyRole.find((t) => !SUPPLIER_ROLES.includes(t as CustomerRole));
    if (unknown) throw APIError.invalidArgument(`"${unknown}" is not a supplier type`);
    return this.list(companyId, {
      ...filters,
      ...(owner ? { salesOwner: owner === "none" ? "none" : userId } : {}),
      ...(anyRole.length ? { anyRole: anyRole as CustomerRole[] } : {}),
      ...(rating ? { rating: rating === "none" ? "unrated" : rating === "low" ? { max: 2 } : { min: Number(rating) } } : {}),
    });
  }

  /** The newest matching customers (at most 2000) and how many match in all. */
  async list(companyId: string, filters: CustomerListFilters = {}): Promise<{ data: CustomerItem[]; total: number }> {
    const { rows, total } = await customerRepository.listFiltered(companyId, filters);
    return { data: rows.map((row) => ({ ...toCustomerItem(row), lastContactAt: row.lastContactAt ? iso(row.lastContactAt) : null })), total };
  }

  async get(id: string, companyId: string): Promise<CustomerItem> {
    const row = await customerRepository.getItemForCompany(id, companyId);
    if (!row) throw APIError.notFound("Customer not found");
    return toCustomerItem(row);
  }

  /**
   * A company as its page reads it: a haulier's terms as they are shown (Trucking's copy while none were saved
   * here), and what the signed-in user (`role`) may do with it.
   */
  async detail(id: string, companyId: string, role: string): Promise<CustomerDetail> {
    const customer = await this.get(id, companyId);
    const supplier = isSupplier(customer.roles);
    const { terms, fromTrucking, truckingUnavailable } = await supplierTermsService.shown(customer);
    return {
      customer: { ...customer, supplierTerms: terms },
      canRateSupplier: canRateSupplier(role) && supplier,
      canEditSupplierTerms: canManageSupplierTerms(role) && supplier,
      supplierTermsFromTrucking: fromTrucking,
      supplierTermsUnavailable: truckingUnavailable,
    };
  }

  /** How many live companies each view of the list holds: customers, suppliers (any other role), all. */
  async viewCounts(companyId: string): Promise<CustomerViewCounts> {
    return customerRepository.viewCounts(companyId);
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

  // The company's companies with a role: the hauliers for the trucking service, the rail operators, first / last
  // mile hauliers and shipping lines for the tariffs service. Only `ids` among them when given (none for an empty
  // list). Ids that are not uuids cannot be a customer and are left out before they reach SQL.
  async listWithRole(companyId: string, role: CustomerRole, ids?: string[]): Promise<RoleCompanyItem[]> {
    if (ids) {
      ids = ids.filter(isUuid);
      if (!ids.length) return [];
    }
    return customerRepository.listWithRole(companyId, role, ids);
  }

  async createFromAres(
    companyId: string,
    actorRole: string,
    ico: string,
    contact: NewCustomerContact,
    roles: CustomerRole[] = ["customer"],
    supplierRequest?: NewSupplierRequest,
  ): Promise<CustomerItem> {
    // The roles of a company registered through a link were given when the link was created.
    if (!supplierRequest?.viaLink) assertMayGiveRoles(actorRole, roles, !!supplierRequest);
    const checkedRoles = requireRoles(roles);
    const mainContact = firstContact(contact);
    if (await customerRepository.findByIco(ico, companyId)) {
      throw APIError.alreadyExists("A customer with this IČO already exists");
    }
    const ares = await aresService.lookup(ico);
    const approval = await approvalOf(actorRole, supplierRequest);
    const values: Omit<NewCustomerRecord, "companyId"> = {
      ...approval,
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
    const registered = { types: ["Registered" as const], street: ares.street, city: ares.postalCity || ares.city, postalCode: ares.postalCode, country: ares.country };
    const row = await insertUnique(() => customerRepository.createWithContact(companyId, values, mainContact, registered), "IČO");
    return toCustomerItem(row);
  }

  async createManual(companyId: string, actorRole: string, input: ManualCustomerInput, supplierRequest?: NewSupplierRequest): Promise<CustomerItem> {
    if (!supplierRequest?.viaLink) assertMayGiveRoles(actorRole, input.roles, !!supplierRequest);
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
    const approval = await approvalOf(actorRole, supplierRequest);
    const values: Omit<NewCustomerRecord, "companyId"> = {
      ...approval,
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
    const registered = { types: ["Registered" as const], street, city, postalCode, country };
    const row = await insertUnique(() => customerRepository.createWithContact(companyId, values, mainContact, registered), "registration number");
    return toCustomerItem(row);
  }

  /**
   * `options.addRoles`: roles added to those the company has when the row is locked (a manager's approval of a
   * registration of a company already in the database) - a change of roles like any other, a manager's.
   */
  async update(id: string, companyId: string, role: string, patch: CustomerPatch, actorUserId = "", options: { addRoles?: CustomerRole[] } = {}): Promise<CustomerItem> {
    const addRoles = options.addRoles ?? [];
    const restricted = managerFieldsIn(patch);
    if (addRoles.length && !restricted.includes("roles")) restricted.push("roles");
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
    // What depends on the row as it is now is worked out with the row locked, after every check above: a change
    // of roles may write to Trucking first (K3), and it then runs one after the other with a save of the terms.
    const fromCurrent = values.roles !== undefined || addRoles.length > 0 || values.currency !== undefined || values.secondaryCurrencies !== undefined;
    const row = fromCurrent
      ? await customerRepository.updateLocked(id, companyId, async (current) => {
          const locked = { ...values };
          if (addRoles.length) {
            // Each role kept once, the company's own first; unchanged when it has them all.
            const union = requireRoles([...(locked.roles ?? current.roles), ...addRoles]);
            if (locked.roles || union.length > current.roles.length) locked.roles = union;
          }
          if (locked.currency !== undefined || locked.secondaryCurrencies !== undefined) {
            Object.assign(locked, billingCurrencies(locked.currency ?? current.currency, locked.secondaryCurrencies ?? current.secondaryCurrencies));
          }
          if (locked.roles) {
            const wasCustomer = current.roles.includes("customer");
            const isCustomer = locked.roles.includes("customer");
            // A supplier only that is made a customer starts as a Prospect: its stored status meant "In use" /
            // "Not in use" until now (Council Review 5, K14). A status sent with the change is kept.
            if (!wasCustomer && isCustomer && patch.status === undefined) locked.status = "Prospect";
            // And the other way: a customer stored Inactive (it stopped buying) that is now a supplier only is still
            // in use as one - its Inactive said nothing of its supply - unless a status comes with the change.
            if (wasCustomer && !isCustomer && current.status === "Inactive" && patch.status === undefined) locked.status = "Active";
            // A supplier with terms set here that becomes a haulier: Trucking gets them first (K3), the last step.
            Object.assign(locked, await supplierTermsService.beforeRolesChange(current, locked.roles, actorUserId));
          }
          return locked;
        })
      : await customerRepository.updateForCompany(id, companyId, values);
    if (!row) throw APIError.notFound("Customer not found");
    await announce(companyId, row, false);
    return toCustomerItem(row);
  }

  /**
   * The roles added to those the company has: a manager approving a registration of a company already in
   * the Customer Database, through a link made for these roles. Nothing is written when it has them all.
   */
  async addRoles(id: string, companyId: string, actorRole: string, roles: CustomerRole[], actorUserId: string): Promise<void> {
    const current = await this.requireLive(id, companyId);
    if (roles.every((r) => current.roles.includes(r))) return;
    await this.update(id, companyId, actorRole, {}, actorUserId, { addRoles: roles });
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
    await this.announceDeleted(companyId, row);
  }

  /**
   * Tells the copies that a customer was deleted (here, or by a manager's decline of a new supplier).
   * The delete is done and can't be done again, so nothing here fails the request: it is only logged.
   */
  async announceDeleted(companyId: string, row: CustomerRecord): Promise<void> {
    await announceLogged(companyId, row, true);
    // Its contacts were hidden with it: each gets its own delete event with its last name, so a
    // rename of one whose event is handled after this delete still reaches the copies.
    if (!row.deletedAt) return;
    let hidden: Awaited<ReturnType<typeof contactRepository.hiddenWithCustomer>>;
    try {
      hidden = await contactRepository.hiddenWithCustomer(companyId, row.id, row.deletedAt);
    } catch (err) {
      log.error(err, "contacts of a deleted customer not read", { companyId, customerId: row.id });
      return;
    }
    for (const contact of hidden) {
      try {
        await contactChanged.publish({
          companyId, customerId: row.id, contactId: contact.id, name: contact.name, email: contact.email, phone: contact.phone, deleted: true,
        });
      } catch (err) {
        log.error(err, "contact delete not published", { companyId, customerId: row.id, contactId: contact.id });
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
    // A declined new supplier brought back is a company like any other: its decline ends there.
    const row = await bringBack(id, deleted, companyId, "restore");
    if (!row) throw APIError.notFound("Deleted customer not found");
    await announceLogged(companyId, row, false);
    return toCustomerItem(row);
  }

  /**
   * A manager takes back the decline of a new supplier: it comes back with what was deleted with it, and
   * waits for a manager again (Sales → Managers → Company approval) - its quote stays held until it is
   * answered. Only a supplier declined so and still deleted; a second try is refused.
   */
  async undoDecline(id: string, companyId: string): Promise<void> {
    const deleted = await customerRepository.getDeletedForCompany(id, companyId);
    if (!deleted || deleted.approvalDecision !== "declined") throw APIError.failedPrecondition(NOT_DECLINED);
    const row = await bringBack(id, deleted, companyId, "undoDecline");
    if (!row) throw APIError.failedPrecondition(NOT_DECLINED);
    await announceLogged(companyId, row, false);
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
