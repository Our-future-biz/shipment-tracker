import { APIError } from "encore.dev/api";
import { customerSiteRepository } from "../repositories/customerSite.repository";
import type { NewCustomerSiteRecord } from "../schemas/customerSite.schema";
import type { CustomerSiteItem, CustomerSiteKind } from "../interfaces/interfaces";
import { toCustomerSiteItem } from "../lib/mappers";
import { normaliseCountry, normalisePostcode } from "../lib/postcode";
import { customerService } from "./customer.service";

export interface CustomerSiteInput {
  label: string;
  kind?: CustomerSiteKind;
  street?: string;
  postcode: string;
  city?: string;
  country?: string;
  lat?: number | null;
  lng?: number | null;
  openingHours?: string;
  avizaceName?: string;
  avizacePhone?: string;
  avizaceEmail?: string;
  loadingNotes?: string;
  tailLiftNeeded?: boolean;
  isDefault?: boolean;
}

const DEFAULT_COUNTRY = "CZ";

// The stored postcode for the country, or invalidArgument with what is expected.
const requirePostcode = (country: string, postcode: string): string => {
  const normalised = normalisePostcode(country, postcode);
  if (normalised !== null) return normalised;
  throw APIError.invalidArgument(
    country === "CZ" ? "A Czech postcode has exactly 5 digits, e.g. 110 00" : "Postcode is required",
  );
};

const requireCoordinate = (value: number | null | undefined, limit: number, name: string) => {
  if (value === undefined || value === null) return;
  if (!Number.isFinite(value) || Math.abs(value) > limit) {
    throw APIError.invalidArgument(`${name} must be between -${limit} and ${limit}`);
  }
};

class CustomerSiteService {
  async listByCustomer(customerId: string, companyId: string): Promise<CustomerSiteItem[]> {
    return (await customerSiteRepository.findByCustomer(customerId, companyId)).map(toCustomerSiteItem);
  }

  async create(companyId: string, customerId: string, input: CustomerSiteInput): Promise<CustomerSiteItem> {
    const country = normaliseCountry(input.country ?? DEFAULT_COUNTRY);
    const postcode = requirePostcode(country, input.postcode);
    requireCoordinate(input.lat, 90, "Latitude");
    requireCoordinate(input.lng, 180, "Longitude");
    await customerService.requireLive(customerId, companyId);
    if (input.isDefault) await customerSiteRepository.clearDefaultFlag(customerId, companyId);
    const values: Omit<NewCustomerSiteRecord, "companyId"> = {
      customerId,
      label: input.label,
      kind: input.kind ?? "both",
      street: input.street ?? "",
      postcode,
      city: input.city ?? "",
      country,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      openingHours: input.openingHours ?? "",
      avizaceName: input.avizaceName ?? "",
      avizacePhone: input.avizacePhone ?? "",
      avizaceEmail: input.avizaceEmail ?? "",
      loadingNotes: input.loadingNotes ?? "",
      tailLiftNeeded: input.tailLiftNeeded ?? false,
      isDefault: input.isDefault ?? false,
    };
    const row = await customerSiteRepository.createForCompany(companyId, values);
    return toCustomerSiteItem(row);
  }

  // The site's own customer is used (not one sent by the client), so making it the default can
  // only clear the flag on that customer's other sites. A new country or postcode is checked
  // together with the other one as stored, so the pair always stays valid.
  async update(id: string, companyId: string, input: Partial<CustomerSiteInput>): Promise<CustomerSiteItem> {
    const existing = await customerSiteRepository.getByIdForCompany(id, companyId);
    if (!existing) throw APIError.notFound("Site not found");
    requireCoordinate(input.lat, 90, "Latitude");
    requireCoordinate(input.lng, 180, "Longitude");
    const patch: Partial<NewCustomerSiteRecord> = {};
    if (input.country !== undefined || input.postcode !== undefined) {
      const country = normaliseCountry(input.country ?? existing.country);
      patch.country = country;
      patch.postcode = requirePostcode(country, input.postcode ?? existing.postcode);
    }
    if (input.isDefault) await customerSiteRepository.clearDefaultFlag(existing.customerId, companyId);
    if (input.label !== undefined) patch.label = input.label;
    if (input.kind !== undefined) patch.kind = input.kind;
    if (input.street !== undefined) patch.street = input.street;
    if (input.city !== undefined) patch.city = input.city;
    if (input.lat !== undefined) patch.lat = input.lat;
    if (input.lng !== undefined) patch.lng = input.lng;
    if (input.openingHours !== undefined) patch.openingHours = input.openingHours;
    if (input.avizaceName !== undefined) patch.avizaceName = input.avizaceName;
    if (input.avizacePhone !== undefined) patch.avizacePhone = input.avizacePhone;
    if (input.avizaceEmail !== undefined) patch.avizaceEmail = input.avizaceEmail;
    if (input.loadingNotes !== undefined) patch.loadingNotes = input.loadingNotes;
    if (input.tailLiftNeeded !== undefined) patch.tailLiftNeeded = input.tailLiftNeeded;
    if (input.isDefault !== undefined) patch.isDefault = input.isDefault;
    const row = await customerSiteRepository.updateForCompany(id, companyId, patch);
    if (!row) throw APIError.notFound("Site not found");
    return toCustomerSiteItem(row);
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    if (!(await customerSiteRepository.softDeleteForCompany(id, companyId))) throw APIError.notFound("Site not found");
  }
}

export const customerSiteService = new CustomerSiteService();
