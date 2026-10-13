import { APIError } from "encore.dev/api";
import { countryName } from "../../../lib/geo/format";
import { departmentRepository, branchRepository, countryRepository, locationRepository } from "../repositories/orgUnit.repository";
import type { Place } from "../../../lib/geo/place";
import { userRepository } from "../repositories/user.repository";

export interface DepartmentInfo {
  id: string;
  name: string;
}

export interface BranchInfo {
  id: string;
  name: string;
  country: string;
  countryCode: string | null;
  locationId: number | null;
  city: string | null;
}

export interface BranchInput {
  name: string;
  // One of the company's countries, by code.
  countryCode: string;
  // The UN/LOCODE place (its Record ID) the branch is in; it must lie in that country.
  locationId: number;
}

// A UN/LOCODE place as the city pickers list it.
export interface LocationInfo {
  id: number;
  code: string;
  name: string;
  nameAscii: string;
  subdivisionName: string | null;
}

// A UN/LOCODE place as shipments and quotes use it, written "Name (CODE)".
export type PlaceInfo = Place;

export interface PlaceCandidateQuery {
  // The written name (accents are folded here).
  name: string;
  countryCode?: string;
}

const asciiFold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
// LIKE wildcards in typed text match literally.
const likeSafe = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

type BranchRow = { id: string; name: string; country: string; countryCode: string | null; locationId: number | null; city: string | null };

const toBranchInfo = (b: BranchRow): BranchInfo => ({
  id: b.id,
  name: b.name,
  country: b.country,
  countryCode: b.countryCode,
  locationId: b.locationId,
  city: b.city,
});

export interface CountryInfo {
  id: string;
  code: string;
  name: string;
}

export interface CountryInput {
  // ISO 3166-1 alpha-2; the name comes from the server's country list.
  code: string;
}

function requireCountry(input: CountryInput): { code: string; name: string } {
  const code = input.code.trim().toUpperCase();
  const name = countryName(code);
  if (!name) throw APIError.invalidArgument(`Unknown country code ${code}`);
  return { code, name };
}

function requireText(value: string | undefined, field: string): string {
  const text = value?.trim();
  if (!text) throw APIError.invalidArgument(`${field} is required`);
  return text;
}

// The live rows are unique by (company, lower(name)); surface that as a readable error.
async function guardDuplicate<T>(what: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      throw APIError.alreadyExists(`A ${what} with this name already exists`);
    }
    throw err;
  }
}

class OrgUnitService {
  async listDepartments(companyId: string): Promise<DepartmentInfo[]> {
    const rows = await departmentRepository.listByName(companyId);
    return rows.map((d) => ({ id: d.id, name: d.name }));
  }

  async createDepartment(companyId: string, input: { name: string }): Promise<DepartmentInfo> {
    const name = requireText(input.name, "name");
    const row = await guardDuplicate("department", () => departmentRepository.createForCompany(companyId, { name }));
    return { id: row.id, name: row.name };
  }

  async updateDepartment(id: string, companyId: string, input: { name: string }): Promise<DepartmentInfo> {
    const name = requireText(input.name, "name");
    const row = await guardDuplicate("department", () => departmentRepository.updateForCompany(id, companyId, { name }));
    if (!row) throw APIError.notFound("Department not found");
    return { id: row.id, name: row.name };
  }

  async deleteDepartment(id: string, companyId: string): Promise<void> {
    const row = await departmentRepository.softDeleteForCompany(id, companyId);
    if (!row) throw APIError.notFound("Department not found");
    await userRepository.clearDepartment(companyId, id);
  }

  async listBranches(companyId: string): Promise<BranchInfo[]> {
    const rows = await branchRepository.listByName(companyId);
    return rows.map(toBranchInfo);
  }

  // The stored values of a branch: the country's name (the country noticeboard matches on it)
  // and the city's name are copied from the country and the place picked.
  private async branchValues(companyId: string, input: BranchInput) {
    const name = requireText(input.name, "name");
    const countryCode = requireText(input.countryCode, "countryCode").toUpperCase();
    const country = await countryRepository.findByCode(companyId, countryCode);
    if (!country) throw APIError.invalidArgument("Choose one of the organization's countries");
    const location = Number.isInteger(input.locationId) ? await locationRepository.getById(input.locationId) : null;
    if (!location || location.countryCode !== countryCode) throw APIError.invalidArgument("Choose a city in this country");
    return { name, country: country.name, countryCode, locationId: location.id, city: location.name };
  }

  async createBranch(companyId: string, input: BranchInput): Promise<BranchInfo> {
    const values = await this.branchValues(companyId, input);
    const row = await guardDuplicate("branch", () => branchRepository.createForCompany(companyId, values));
    return toBranchInfo(row);
  }

  async updateBranch(id: string, companyId: string, input: BranchInput): Promise<BranchInfo> {
    const values = await this.branchValues(companyId, input);
    const row = await guardDuplicate("branch", () => branchRepository.updateForCompany(id, companyId, values));
    if (!row) throw APIError.notFound("Branch not found");
    return toBranchInfo(row);
  }

  async listLocations(countryCode: string): Promise<LocationInfo[]> {
    return locationRepository.listByCountry(requireText(countryCode, "countryCode").toUpperCase());
  }

  async searchPlaces(query: string, countryCode?: string): Promise<PlaceInfo[]> {
    const q = likeSafe(asciiFold(query ?? ""));
    if (q.length < 2) return [];
    return locationRepository.search(q, countryCode ? countryCode.toUpperCase() : null, 30);
  }

  async placesByCodes(codes: string[]): Promise<PlaceInfo[]> {
    const clean = [...new Set(codes.map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}[A-Z0-9]{3}$/.test(c)))];
    return locationRepository.findByCodes(clean);
  }

  async placeCandidates(queries: PlaceCandidateQuery[]): Promise<PlaceInfo[][]> {
    return Promise.all(
      queries.map((q) => {
        const name = likeSafe(asciiFold(q.name));
        if (name.length < 2) return [];
        return locationRepository.findCandidates(name, q.countryCode ? q.countryCode.toUpperCase() : null, 25);
      }),
    );
  }

  async deleteBranch(id: string, companyId: string): Promise<void> {
    const row = await branchRepository.softDeleteForCompany(id, companyId);
    if (!row) throw APIError.notFound("Branch not found");
    await userRepository.clearBranch(companyId, id);
  }

  async listCountries(companyId: string): Promise<CountryInfo[]> {
    const rows = await countryRepository.listByName(companyId);
    return rows.map((c) => ({ id: c.id, code: c.code, name: c.name }));
  }

  async createCountry(companyId: string, input: CountryInput): Promise<CountryInfo> {
    const values = requireCountry(input);
    const row = await guardDuplicate("country", () => countryRepository.createForCompany(companyId, values));
    return { id: row.id, code: row.code, name: row.name };
  }

  // The country's branches follow a changed code/name (they keep a copy of both).
  async updateCountry(id: string, companyId: string, input: CountryInput): Promise<CountryInfo> {
    const values = requireCountry(input);
    const row = await guardDuplicate("country", () => countryRepository.updateWithBranches(id, companyId, values));
    if (!row) throw APIError.notFound("Country not found");
    return { id: row.id, code: row.code, name: row.name };
  }

  // A country that branches are still in can't be removed: they would point at nothing.
  async deleteCountry(id: string, companyId: string): Promise<void> {
    const country = await countryRepository.getByIdForCompany(id, companyId);
    if (!country) throw APIError.notFound("Country not found");
    const branches = await branchRepository.countByCountryCode(companyId, country.code);
    if (branches > 0) {
      throw APIError.failedPrecondition(
        `${country.name} still has ${branches} branch${branches === 1 ? "" : "es"}. Move or remove them first.`,
      );
    }
    await countryRepository.softDeleteForCompany(id, companyId);
  }
}

export const orgUnitService = new OrgUnitService();
