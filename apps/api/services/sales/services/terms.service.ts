import { APIError } from "encore.dev/api";
import { termsConditionRepository } from "../repositories/termsCondition.repository";

const DEFAULT_TEMPLATES = ["AIR IMPORT", "AIR EXPORT", "FCL IMPORT", "FCL EXPORT", "LCL IMPORT", "LCL EXPORT"];

class TermsService {
  async ensureSeeded() {
    const count = await termsConditionRepository.count();
    if (count > 0) return;
    for (const name of DEFAULT_TEMPLATES) {
      const existing = await termsConditionRepository.findByNameInsensitive(name);
      if (!existing) {
        await termsConditionRepository.create({ name, includes: "", excludes: "" } as never);
      }
    }
  }

  async list() {
    await this.ensureSeeded();
    return termsConditionRepository.listAll();
  }

  async getById(id: string) {
    return termsConditionRepository.getById(id);
  }

  async create(name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw APIError.invalidArgument("name is required");
    const existing = await termsConditionRepository.findByNameInsensitive(trimmed);
    if (existing) throw APIError.alreadyExists("A terms & conditions template with this name already exists");
    return termsConditionRepository.create({ name: trimmed, includes: "", excludes: "" } as never);
  }

  async update(id: string, data: { name?: string; includes?: string; excludes?: string }) {
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.includes !== undefined) patch.includes = data.includes;
    if (data.excludes !== undefined) patch.excludes = data.excludes;
    return termsConditionRepository.update(id, patch as never);
  }

  async softDelete(id: string) {
    return termsConditionRepository.softDelete(id);
  }
}

export const termsService = new TermsService();
