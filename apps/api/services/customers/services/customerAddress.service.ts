import { APIError } from "encore.dev/api";
import { isUniqueViolation } from "../../../lib/db/errors";
import { customerAddressRepository } from "../repositories/customerAddress.repository";
import type { NewCustomerAddressRecord } from "../schemas/customerAddress.schema";
import type { AddressItem, AddressType } from "../interfaces/interfaces";
import { toAddressItem } from "../lib/mappers";
import { customerService } from "./customer.service";

export interface AddressInput {
  type: AddressType;
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

// The stored form of an address: trimmed, the country as an upper-case code.
export function addressValues(input: Partial<AddressInput>): Partial<Omit<NewCustomerAddressRecord, "companyId" | "customerId">> {
  const values: Partial<Omit<NewCustomerAddressRecord, "companyId" | "customerId">> = {};
  if (input.type !== undefined) values.type = input.type;
  if (input.label !== undefined) values.label = input.label.trim();
  if (input.street !== undefined) values.street = required(input.street, "street");
  if (input.city !== undefined) values.city = required(input.city, "city");
  if (input.postalCode !== undefined) values.postalCode = required(input.postalCode, "postalCode");
  if (input.country !== undefined) values.country = input.country.trim().toUpperCase();
  return values;
}

// A customer has one seat: a second live Registered address is refused by a unique index.
async function oneRegistered<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
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
        type: input.type,
      }),
    );
    return toAddressItem(row);
  }

  async update(id: string, companyId: string, input: Partial<AddressInput>): Promise<AddressItem> {
    const row = await oneRegistered(() => customerAddressRepository.updateWithSeat(id, companyId, addressValues(input)));
    if (!row) throw APIError.notFound("Address not found");
    return toAddressItem(row);
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    if (!(await customerAddressRepository.softDeleteWithSeat(id, companyId))) throw APIError.notFound("Address not found");
  }
}

export const customerAddressService = new CustomerAddressService();
