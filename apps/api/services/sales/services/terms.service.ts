import { APIError } from "encore.dev/api";
import { termsConditionRepository } from "../repositories/termsCondition.repository";
import type { NewTermsConditionRecord } from "../schemas/termsCondition.schema";
import type { TermsConditionItem } from "../interfaces/interfaces";
import { toTermsItem } from "../lib/mappers";

const DEFAULT_TEMPLATES = ["AIR IMPORT", "AIR EXPORT", "FCL IMPORT", "FCL EXPORT", "LCL IMPORT", "LCL EXPORT"];

export interface TermsPatch {
  name?: string;
  includes?: string;
  excludes?: string;
}

class TermsService {
  // Each company gets its own set of default templates on first use.
  async ensureSeeded(companyId: string): Promise<void> {
    if ((await termsConditionRepository.count(companyId)) > 0) return;
    await termsConditionRepository.insertMissing(companyId, DEFAULT_TEMPLATES);
  }

  async list(companyId: string): Promise<TermsConditionItem[]> {
    await this.ensureSeeded(companyId);
    return (await termsConditionRepository.listAll(companyId)).map(toTermsItem);
  }

  async get(id: string, companyId: string): Promise<TermsConditionItem> {
    const row = await termsConditionRepository.getByIdForCompany(id, companyId);
    if (!row) throw APIError.notFound("Terms & conditions not found");
    return toTermsItem(row);
  }

  async create(companyId: string, name: string): Promise<TermsConditionItem> {
    const trimmed = await this.freeName(name, companyId);
    const values: Omit<NewTermsConditionRecord, "companyId"> = { name: trimmed, includes: "", excludes: "" };
    return toTermsItem(await termsConditionRepository.createForCompany(companyId, values));
  }

  async update(id: string, companyId: string, data: TermsPatch): Promise<TermsConditionItem> {
    const patch: Partial<NewTermsConditionRecord> = {};
    if (data.name !== undefined) patch.name = await this.freeName(data.name, companyId, id);
    if (data.includes !== undefined) patch.includes = data.includes;
    if (data.excludes !== undefined) patch.excludes = data.excludes;
    const row = await termsConditionRepository.updateForCompany(id, companyId, patch);
    if (!row) throw APIError.notFound("Terms & conditions not found");
    return toTermsItem(row);
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    if (!(await termsConditionRepository.softDeleteForCompany(id, companyId))) {
      throw APIError.notFound("Terms & conditions not found");
    }
  }

  // A template name, trimmed, that no other live template of the company uses (case-insensitive).
  private async freeName(name: string, companyId: string, ownId?: string): Promise<string> {
    const trimmed = name.trim();
    if (!trimmed) throw APIError.invalidArgument("name is required");
    const existing = await termsConditionRepository.findByNameInsensitive(trimmed, companyId);
    if (existing && existing.id !== ownId) {
      throw APIError.alreadyExists("A terms & conditions template with this name already exists");
    }
    return trimmed;
  }
}

export const termsService = new TermsService();
