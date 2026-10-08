import { APIError } from "encore.dev/api";
import { departmentRepository, branchRepository } from "../repositories/orgUnit.repository";
import { userRepository } from "../repositories/user.repository";

export interface DepartmentInfo {
  id: string;
  name: string;
}

export interface BranchInfo {
  id: string;
  name: string;
  country: string;
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
    return rows.map((b) => ({ id: b.id, name: b.name, country: b.country }));
  }

  async createBranch(companyId: string, input: { name: string; country: string }): Promise<BranchInfo> {
    const name = requireText(input.name, "name");
    const country = requireText(input.country, "country");
    const row = await guardDuplicate("branch", () => branchRepository.createForCompany(companyId, { name, country }));
    return { id: row.id, name: row.name, country: row.country };
  }

  async updateBranch(id: string, companyId: string, input: { name: string; country: string }): Promise<BranchInfo | null> {
    const name = requireText(input.name, "name");
    const country = requireText(input.country, "country");
    const row = await guardDuplicate("branch", () => branchRepository.updateForCompany(id, companyId, { name, country }));
    return row ? { id: row.id, name: row.name, country: row.country } : null;
  }

  async deleteBranch(id: string, companyId: string): Promise<boolean> {
    const row = await branchRepository.softDeleteForCompany(id, companyId);
    if (!row) return false;
    await userRepository.clearBranch(companyId, id);
    return true;
  }
}

export const orgUnitService = new OrgUnitService();
