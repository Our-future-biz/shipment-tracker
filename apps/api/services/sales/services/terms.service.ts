import { APIError } from "encore.dev/api";
import { termsConditionRepository } from "../repositories/termsCondition.repository";

const DEFAULT_TEMPLATES = ["AIR IMPORT", "AIR EXPORT", "FCL IMPORT", "FCL EXPORT", "LCL IMPORT", "LCL EXPORT"];

class TermsService {
  // Each company gets its own set of default templates on first use.
  async ensureSeeded(companyId: string) {
    const count = await termsConditionRepository.count(companyId);
    if (count > 0) return;
    for (const name of DEFAULT_TEMPLATES) {
      const existing = await termsConditionRepository.findByNameInsensitive(name, companyId);
      if (!existing) {
        await termsConditionRepository.createForCompany(companyId, { name, includes: "", excludes: "" } as never);
      }
    }
  }

  async list(companyId: string) {
    await this.ensureSeeded(companyId);
    return termsConditionRepository.listAll(companyId);
  }

  async getById(id: string, companyId: string) {
    return termsConditionRepository.getByIdForCompany(id, companyId);
  }

  async create(companyId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw APIError.invalidArgument("name is required");
    const existing = await termsConditionRepository.findByNameInsensitive(trimmed, companyId);
    if (existing) throw APIError.alreadyExists("A terms & conditions template with this name already exists");
    return termsConditionRepository.createForCompany(companyId, { name: trimmed, includes: "", excludes: "" } as never);
  }

  async update(id: string, companyId: string, data: { name?: string; includes?: string; excludes?: string }) {
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.includes !== undefined) patch.includes = data.includes;
    if (data.excludes !== undefined) patch.excludes = data.excludes;
    return termsConditionRepository.updateForCompany(id, companyId, patch as never);
  }

  async softDelete(id: string, companyId: string) {
    return termsConditionRepository.softDeleteForCompany(id, companyId);
  }
}

export const termsService = new TermsService();
