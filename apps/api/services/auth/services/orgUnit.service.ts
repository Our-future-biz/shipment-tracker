import { APIError } from "encore.dev/api";
import { departmentRepository, branchRepository, countryRepository, locationRepository } from "../repositories/orgUnit.repository";
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
  code: string;
  name: string;
}

// The web app picks the country from its fixed list and sends both its code and its name.
function requireCountry(input: CountryInput): CountryInput {
  const code = input.code?.trim().toUpperCase();
  if (!code || !/^[A-Z]{2}$/.test(code)) throw APIError.invalidArgument("code must be a two-letter country code");
  return { code, name: requireText(input.name, "name") };
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

  async updateDepartment(id: string, companyId: string, input: { name: string }): Promise<DepartmentInfo | null> {
    const name = requireText(input.name, "name");
    const row = await guardDuplicate("department", () => departmentRepository.updateForCompany(id, companyId, { name }));
    return row ? { id: row.id, name: row.name } : null;
  }

  async deleteDepartment(id: string, companyId: string): Promise<boolean> {
    const row = await departmentRepository.softDeleteForCompany(id, companyId);
    if (!row) return false;
    await userRepository.clearDepartment(companyId, id);
    return true;
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

  async updateBranch(id: string, companyId: string, input: BranchInput): Promise<BranchInfo | null> {
    const values = await this.branchValues(companyId, input);
    const row = await guardDuplicate("branch", () => branchRepository.updateForCompany(id, companyId, values));
    return row ? toBranchInfo(row) : null;
  }

  async listLocations(countryCode: string): Promise<LocationInfo[]> {
    return locationRepository.listByCountry(requireText(countryCode, "countryCode").toUpperCase());
  }

  async deleteBranch(id: string, companyId: string): Promise<boolean> {
    const row = await branchRepository.softDeleteForCompany(id, companyId);
    if (!row) return false;
    await userRepository.clearBranch(companyId, id);
    return true;
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

  async updateCountry(id: string, companyId: string, input: CountryInput): Promise<CountryInfo | null> {
    const values = requireCountry(input);
    const row = await guardDuplicate("country", () => countryRepository.updateForCompany(id, companyId, values));
    return row ? { id: row.id, code: row.code, name: row.name } : null;
  }

  async deleteCountry(id: string, companyId: string): Promise<boolean> {
    return !!(await countryRepository.softDeleteForCompany(id, companyId));
  }
}

export const orgUnitService = new OrgUnitService();
