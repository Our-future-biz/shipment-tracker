import { APIError } from "encore.dev/api";
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

// The stored form of an address: trimmed, the country as an upper-case code.
export function addressValues(input: Partial<AddressInput>): Partial<Omit<NewCustomerAddressRecord, "companyId" | "customerId">> {
  const values: Partial<Omit<NewCustomerAddressRecord, "companyId" | "customerId">> = {};
  if (input.type !== undefined) values.type = input.type;
  if (input.label !== undefined) values.label = input.label.trim();
  if (input.street !== undefined) values.street = input.street.trim();
  if (input.city !== undefined) values.city = input.city.trim();
  if (input.postalCode !== undefined) values.postalCode = input.postalCode.trim();
  if (input.country !== undefined) values.country = input.country.trim().toUpperCase();
  return values;
}

class CustomerAddressService {
  async listByCustomer(customerId: string, companyId: string): Promise<AddressItem[]> {
    return (await customerAddressRepository.findByCustomer(customerId, companyId)).map(toAddressItem);
  }

  async create(companyId: string, customerId: string, input: AddressInput): Promise<AddressItem> {
    await customerService.requireLive(customerId, companyId);
    const row = await customerAddressRepository.createForCompany(companyId, {
      customerId,
      label: "",
      ...addressValues(input),
      type: input.type,
    });
    return toAddressItem(row);
  }

  async update(id: string, companyId: string, input: Partial<AddressInput>): Promise<AddressItem> {
    const row = await customerAddressRepository.updateForCompany(id, companyId, addressValues(input));
    if (!row) throw APIError.notFound("Address not found");
    return toAddressItem(row);
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    if (!(await customerAddressRepository.softDeleteForCompany(id, companyId))) throw APIError.notFound("Address not found");
  }
}

export const customerAddressService = new CustomerAddressService();
