import { APIError } from "encore.dev/api";
import { constraintOf, isUniqueViolation } from "../../../lib/db/errors";
import { customerAddressRepository } from "../repositories/customerAddress.repository";
import type { NewCustomerAddressRecord } from "../schemas/customerAddress.schema";
import { ADDRESS_TYPES, type AddressItem, type AddressType } from "../interfaces/interfaces";
import { toAddressItem } from "../lib/mappers";
import { SITE_RACE, isSiteRace } from "../lib/addressSite";
import { CUSTOMER_ICO_UNIQUE } from "../lib/registerNumber";
import { customerService } from "./customer.service";

export interface AddressInput {
  types: AddressType[];
  label?: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

// A field an address must have: trimmed, and refused when only spaces were sent.
function required(value: string, field: string): string {
  const v = value.trim();
  if (!v) throw APIError.invalidArgument(`${field} is required`);
  return v;
}

// An address's types as stored: each once, in the list's order; refused when none is left.
export function addressTypes(types: readonly AddressType[]): AddressType[] {
  const chosen = ADDRESS_TYPES.filter((t) => types.includes(t));
  if (!chosen.length) throw APIError.invalidArgument("Choose at least one type");
  return chosen;
}

// The stored form of an address: trimmed, its types in order, the country as an upper-case code.
export function addressValues(input: Partial<AddressInput>): Partial<Omit<NewCustomerAddressRecord, "companyId" | "customerId">> {
  const values: Partial<Omit<NewCustomerAddressRecord, "companyId" | "customerId">> = {};
  if (input.types !== undefined) values.types = addressTypes(input.types);
  if (input.label !== undefined) values.label = input.label.trim();
  if (input.street !== undefined) values.street = required(input.street, "street");
  if (input.city !== undefined) values.city = required(input.city, "city");
  if (input.postalCode !== undefined) values.postalCode = required(input.postalCode, "postalCode");
  if (input.country !== undefined) values.country = input.country.trim().toUpperCase();
  return values;
}

// What a second Billing address is answered with, by the write that met it.
const SECOND_BILLING: Record<"create" | "update" | "makeBilling", string> = {
  create: "The customer already has a billing address — add this one without Billing, then use “Use for invoices” on it",
  update: "The customer already has a billing address — use “Use for invoices” on this one to move it here",
  makeBilling: "The billing address was changed by someone else at the same moment — reload and try again",
};

// A customer has one seat and one billing address: a second live Registered or Billing address is
// refused by a unique index. So is a second site of one address, given by another save at the same
// moment (lib/addressSite).
async function oneRegistered<T>(write: () => Promise<T>, as: keyof typeof SECOND_BILLING): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (isSiteRace(err)) throw APIError.aborted(SITE_RACE);
    if (isUniqueViolation(err) && constraintOf(err) === "customer_address_one_billing") throw APIError.alreadyExists(SECOND_BILLING[as]);
    // The seat moved to another country, where another customer has the same registration number.
    if (isUniqueViolation(err) && constraintOf(err) === CUSTOMER_ICO_UNIQUE) {
      throw APIError.alreadyExists("Another customer in that country has the same registration number");
    }
    if (isUniqueViolation(err)) throw APIError.alreadyExists("The customer already has a registered address — edit that one");
    throw err;
  }
}

// A Registered address is also written to the customer's own seat columns, in the same
// transaction (see lib/seat.ts): the repository's *WithSeat writes do that.
class CustomerAddressService {
  async listByCustomer(customerId: string, companyId: string): Promise<AddressItem[]> {
    return (await customerAddressRepository.findByCustomer(customerId, companyId)).map(toAddressItem);
  }

  async create(companyId: string, customerId: string, input: AddressInput): Promise<AddressItem> {
    await customerService.requireLive(customerId, companyId);
    const row = await oneRegistered(() =>
      customerAddressRepository.createWithSeat(companyId, {
        customerId,
        label: "",
        ...addressValues(input),
        types: addressTypes(input.types),
      }),
      "create",
    );
    return toAddressItem(row);
  }

  async update(id: string, companyId: string, input: Partial<AddressInput>): Promise<AddressItem> {
    const row = await oneRegistered(() => customerAddressRepository.updateWithSeat(id, companyId, addressValues(input)), "update");
    if (!row) throw APIError.notFound("Address not found");
    return toAddressItem(row);
  }

  // The address made the customer's billing address: Billing moves here from the one that had it
  // (which keeps its other types, or becomes Paperwork when Billing was all it was).
  async makeBilling(id: string, companyId: string): Promise<AddressItem> {
    const row = await oneRegistered(() => customerAddressRepository.moveBilling(id, companyId), "makeBilling");
    if (!row) throw APIError.notFound("Address not found");
    return toAddressItem(row);
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    if (!(await customerAddressRepository.softDeleteWithSeat(id, companyId))) throw APIError.notFound("Address not found");
  }
}

export const customerAddressService = new CustomerAddressService();
