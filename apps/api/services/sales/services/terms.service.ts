import { APIError } from "encore.dev/api";
import type { Actor } from "../../../lib/rbac";
import { termsConditionRepository } from "../repositories/termsCondition.repository";
import { permissionsService } from "./permissions.service";

const DEFAULT_TEMPLATES = ["AIR IMPORT", "AIR EXPORT", "FCL IMPORT", "FCL EXPORT", "LCL IMPORT", "LCL EXPORT"];

const NAME_TAKEN = "A terms & conditions template with this name already exists";

/** What a change of a template may carry: only the fields that are sent are written. */
export interface TermsChange {
  name?: string;
  includes?: string;
  excludes?: string;
  /** The updatedAt (ISO) of the copy the change was made on; without it the change is written whatever is stored. */
  expectedUpdatedAt?: string;
}

// The Terms & Conditions templates are shared by the whole company: everybody reads them - a
// quotation takes its terms from one - and only who may edit the Sales settings changes them.
class TermsService {
  // Each company gets its own set of default templates on first use - and only then: a company
  // that deleted all its templates keeps an empty list.
  async ensureSeeded(companyId: string) {
    if ((await termsConditionRepository.countEver(companyId)) > 0) return;
    await termsConditionRepository.seed(companyId, DEFAULT_TEMPLATES);
  }

  async list(companyId: string) {
    await this.ensureSeeded(companyId);
    return termsConditionRepository.listAll(companyId);
  }

  async create(actor: Actor, name: string) {
    permissionsService.requireSettingsEditor(actor);
    const trimmed = name.trim();
    if (!trimmed) throw APIError.invalidArgument("name is required");
    const existing = await termsConditionRepository.findByNameInsensitive(trimmed, actor.companyID);
    if (existing) throw APIError.alreadyExists(NAME_TAKEN);
    return termsConditionRepository.createForCompany(actor.companyID, { name: trimmed, includes: "", excludes: "" } as never);
  }

  // Returns the template as written, or null when the company has no such template.
  async update(id: string, actor: Actor, data: TermsChange) {
    permissionsService.requireSettingsEditor(actor);
    const patch: { name?: string; includes?: string; excludes?: string } = {};
    if (data.name !== undefined) {
      // A new name answers to the rules of a new template's name; the template's own name, in
      // whatever capitals, is not "taken".
      const name = data.name.trim();
      if (!name) throw APIError.invalidArgument("name is required");
      const existing = await termsConditionRepository.findByNameInsensitive(name, actor.companyID);
      if (existing && existing.id !== id.toLowerCase()) throw APIError.alreadyExists(NAME_TAKEN);
      patch.name = name;
    }
    if (data.includes !== undefined) patch.includes = data.includes;
    if (data.excludes !== undefined) patch.excludes = data.excludes;
    if (data.expectedUpdatedAt === undefined) return termsConditionRepository.updateForCompany(id, actor.companyID, patch as never);

    const expected = new Date(data.expectedUpdatedAt);
    if (Number.isNaN(expected.getTime())) throw APIError.invalidArgument("expectedUpdatedAt is not a time");
    const written = await termsConditionRepository.updateIfUnchanged(id, actor.companyID, patch, expected);
    if (written) return written;
    // Nothing was written: the template is gone, or it is no longer the version the change was
    // made on. Only the second is a conflict.
    if (await termsConditionRepository.getByIdForCompany(id, actor.companyID)) {
      throw APIError.aborted("the template was changed by someone else - load the latest version");
    }
    return null;
  }

  async softDelete(id: string, actor: Actor) {
    permissionsService.requireSettingsEditor(actor);
    return termsConditionRepository.softDeleteForCompany(id, actor.companyID);
  }
}

export const termsService = new TermsService();
