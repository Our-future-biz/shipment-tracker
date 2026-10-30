import { APIError } from "encore.dev/api";
import { customerAddressRepository, type SiteDetails } from "../repositories/customerAddress.repository";
import { customerSiteRepository } from "../repositories/customerSite.repository";
import type { NewCustomerAddressRecord } from "../schemas/customerAddress.schema";
import type { NewCustomerSiteRecord } from "../schemas/customerSite.schema";
import type { CustomerSiteItem, CustomerSiteKind } from "../interfaces/interfaces";
import { toCustomerSiteItem } from "../lib/mappers";
import { normaliseCountry, normalisePostcode } from "../lib/postcode";
import { typesForKind, typesWithoutSite } from "../lib/addressSite";
import { addressTypes } from "./customerAddress.service";
import { customerService } from "./customer.service";
import { isUniqueViolation } from "../../../lib/db/errors";
import { assertCzechPhone } from "../../../lib/phone";

const checkedAvizacePhone = (phone: string): string => {
  assertCzechPhone(phone, "Avizace phone");
  return phone;
};

// Two saves making different sites the default at the same moment: the one-default index refuses the second.
const DEFAULT_RACE = "Another site of this customer was made the default at the same moment - reload and try again";
const oneDefault = async <T>(write: () => Promise<T>): Promise<T> => {
  try {
    return await write();
  } catch (err) {
    if (isUniqueViolation(err)) throw APIError.aborted(DEFAULT_RACE);
    throw err;
  }
};

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

// What the Sites tab sets on a site besides its address: the fields sent, checked.
function siteDetails(input: Partial<CustomerSiteInput>): SiteDetails {
  const details: SiteDetails = {};
  if (input.lat !== undefined) details.lat = input.lat;
  if (input.lng !== undefined) details.lng = input.lng;
  if (input.openingHours !== undefined) details.openingHours = input.openingHours;
  if (input.avizaceName !== undefined) details.avizaceName = input.avizaceName;
  if (input.avizacePhone !== undefined) details.avizacePhone = checkedAvizacePhone(input.avizacePhone);
  if (input.avizaceEmail !== undefined) details.avizaceEmail = input.avizaceEmail;
  if (input.loadingNotes !== undefined) details.loadingNotes = input.loadingNotes;
  if (input.tailLiftNeeded !== undefined) details.tailLiftNeeded = input.tailLiftNeeded;
  if (input.isDefault !== undefined) details.isDefault = input.isDefault;
  return details;
}

const SITE_GONE = "Site not found";

// A site is a Pickup / Delivery address of the customer's Addresses (lib/addressSite): adding one
// adds its address, and a change of its name, use or address is a change of the address, which
// writes the site again. The site's own details (opening hours, avizace, tail lift, notes,
// default) are written with it, in the same transaction. A site from before they were linked
// (no address) is still changed on its own.
class CustomerSiteService {
  async listByCustomer(customerId: string, companyId: string): Promise<CustomerSiteItem[]> {
    return (await customerSiteRepository.findByCustomer(customerId, companyId)).map(toCustomerSiteItem);
  }

  async create(companyId: string, customerId: string, input: CustomerSiteInput): Promise<CustomerSiteItem> {
    const country = normaliseCountry(input.country ?? DEFAULT_COUNTRY);
    requirePostcode(country, input.postcode);
    requireCoordinate(input.lat, 90, "Latitude");
    requireCoordinate(input.lng, 180, "Longitude");
    const details = siteDetails(input);
    await customerService.requireLive(customerId, companyId);
    if (input.isDefault) await customerSiteRepository.clearDefaultFlag(customerId, companyId);
    const address = await oneDefault(() =>
      customerAddressRepository.createWithSeat(
        companyId,
        {
          customerId,
          types: typesForKind([], input.kind ?? "both"),
          label: input.label.trim(),
          street: (input.street ?? "").trim(),
          city: (input.city ?? "").trim(),
          postalCode: input.postcode.trim(),
          country,
        },
        details,
      ),
    );
    return this.siteOf(address.id, companyId);
  }

  // The site an address write left; it is there, written in the same transaction.
  private async siteOf(addressId: string, companyId: string): Promise<CustomerSiteItem> {
    const site = await customerSiteRepository.findByAddress(addressId, companyId);
    if (!site) throw APIError.notFound(SITE_GONE);
    return toCustomerSiteItem(site);
  }

  // The site's own customer is used (not one sent by the client), so making it the default can
  // only clear the flag on that customer's other sites. A new country or postcode is checked
  // together with the other one as stored, so the pair always stays valid.
  async update(id: string, companyId: string, input: Partial<CustomerSiteInput>): Promise<CustomerSiteItem> {
    const existing = await customerSiteRepository.getByIdForCompany(id, companyId);
    if (!existing) throw APIError.notFound(SITE_GONE);
    requireCoordinate(input.lat, 90, "Latitude");
    requireCoordinate(input.lng, 180, "Longitude");
    const address = existing.addressId ? await customerAddressRepository.findLive(existing.addressId, companyId) : null;
    if (address) {
      const details = siteDetails(input);
      const change: Partial<Omit<NewCustomerAddressRecord, "companyId">> = {};
      if (input.country !== undefined || input.postcode !== undefined) {
        const country = normaliseCountry(input.country ?? existing.country);
        requirePostcode(country, input.postcode ?? existing.postcode);
        change.country = country;
        change.postalCode = (input.postcode ?? address.postalCode).trim();
      }
      if (input.label !== undefined) change.label = input.label.trim();
      if (input.street !== undefined) change.street = input.street.trim();
      if (input.city !== undefined) change.city = input.city.trim();
      if (input.kind !== undefined) change.types = addressTypes(typesForKind(address.types, input.kind));
      if (input.isDefault) await customerSiteRepository.clearDefaultFlag(existing.customerId, companyId);
      const row = await oneDefault(() => customerAddressRepository.updateWithSeat(address.id, companyId, change, details));
      if (!row) throw APIError.notFound(SITE_GONE);
      return this.siteOf(address.id, companyId);
    }
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
    if (input.avizacePhone !== undefined) patch.avizacePhone = checkedAvizacePhone(input.avizacePhone);
    if (input.avizaceEmail !== undefined) patch.avizaceEmail = input.avizaceEmail;
    if (input.loadingNotes !== undefined) patch.loadingNotes = input.loadingNotes;
    if (input.tailLiftNeeded !== undefined) patch.tailLiftNeeded = input.tailLiftNeeded;
    if (input.isDefault !== undefined) patch.isDefault = input.isDefault;
    const row = await oneDefault(() => customerSiteRepository.updateForCompany(id, companyId, patch));
    if (!row) throw APIError.notFound(SITE_GONE);
    return toCustomerSiteItem(row);
  }

  // A site goes with its address's Pickup / Delivery: the address keeps its other types, and goes
  // too when it has none left.
  async softDelete(id: string, companyId: string): Promise<void> {
    const existing = await customerSiteRepository.getByIdForCompany(id, companyId);
    if (!existing) throw APIError.notFound(SITE_GONE);
    const address = existing.addressId ? await customerAddressRepository.findLive(existing.addressId, companyId) : null;
    if (address) {
      const left = typesWithoutSite(address.types);
      const done = left.length
        ? await customerAddressRepository.updateWithSeat(address.id, companyId, { types: left })
        : await customerAddressRepository.softDeleteWithSeat(address.id, companyId);
      if (!done) throw APIError.notFound(SITE_GONE);
      return;
    }
    if (!(await customerSiteRepository.softDeleteForCompany(id, companyId))) throw APIError.notFound(SITE_GONE);
  }
}

export const customerSiteService = new CustomerSiteService();
