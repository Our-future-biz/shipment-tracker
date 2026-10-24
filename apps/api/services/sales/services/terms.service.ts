import { APIError } from "encore.dev/api";
import type { Actor } from "../../../lib/rbac";
import { termsConditionRepository } from "../repositories/termsCondition.repository";
import type { NewTermsConditionRecord } from "../schemas/termsCondition.schema";
import type { TermsConditionItem } from "../interfaces/interfaces";
import { toTermsItem } from "../utils/termsItem.utils";
import { permissionsService } from "./permissions.service";

const DEFAULT_TEMPLATES = ["AIR IMPORT", "AIR EXPORT", "FCL IMPORT", "FCL EXPORT", "LCL IMPORT", "LCL EXPORT"];

const NAME_TAKEN = "A terms & conditions template with this name already exists";
const notFound = () => APIError.notFound("Terms & conditions not found");

/** What a change of a template may carry: only the fields that are sent are written. */
export interface TermsChange {
  name?: string;
  includes?: string;
  excludes?: string;
  subjectTo?: string;
  /** The updatedAt (ISO) of the copy the change was made on; without it the change is written whatever is stored. */
  expectedUpdatedAt?: string;
}

// The Terms & Conditions templates are shared by the whole company: everybody reads them - a
// quotation takes its terms from one - and only who may edit the Sales settings changes them.
class TermsService {
  // Each company gets its own set of default templates on first use - and only then: a company
  // that deleted all its templates keeps an empty list.
  async ensureSeeded(companyId: string): Promise<void> {
    if ((await termsConditionRepository.countEver(companyId)) > 0) return;
    await termsConditionRepository.seed(companyId, DEFAULT_TEMPLATES);
  }

  async list(companyId: string): Promise<TermsConditionItem[]> {
    await this.ensureSeeded(companyId);
    return (await termsConditionRepository.listAll(companyId)).map(toTermsItem);
  }

  async create(actor: Actor, name: string): Promise<TermsConditionItem> {
    permissionsService.requireSettingsEditor(actor);
    const trimmed = name.trim();
    if (!trimmed) throw APIError.invalidArgument("name is required");
    const existing = await termsConditionRepository.findByNameInsensitive(trimmed, actor.companyID);
    if (existing) throw APIError.alreadyExists(NAME_TAKEN);
    return toTermsItem(await termsConditionRepository.createForCompany(actor.companyID, { name: trimmed, includes: "", excludes: "", subjectTo: "" }));
  }

  // The template as written; not found when the company has no such live template.
  async update(id: string, actor: Actor, data: TermsChange): Promise<TermsConditionItem> {
    permissionsService.requireSettingsEditor(actor);
    const patch: Partial<NewTermsConditionRecord> = {};
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
    if (data.subjectTo !== undefined) patch.subjectTo = data.subjectTo;
    if (data.expectedUpdatedAt === undefined) {
      const row = await termsConditionRepository.updateForCompany(id, actor.companyID, patch);
      if (!row) throw notFound();
      return toTermsItem(row);
    }

    const expected = new Date(data.expectedUpdatedAt);
    if (Number.isNaN(expected.getTime())) throw APIError.invalidArgument("expectedUpdatedAt is not a time");
    const written = await termsConditionRepository.updateIfUnchanged(id, actor.companyID, patch, expected);
    if (written) return toTermsItem(written);
    // Nothing was written: the template is gone, or it is no longer the version the change was
    // made on. Only the second is a conflict.
    if (await termsConditionRepository.getByIdForCompany(id, actor.companyID)) {
      throw APIError.aborted("the template was changed by someone else - load the latest version");
    }
    throw notFound();
  }

  async softDelete(id: string, actor: Actor): Promise<void> {
    permissionsService.requireSettingsEditor(actor);
    if (!(await termsConditionRepository.softDeleteForCompany(id, actor.companyID))) throw notFound();
  }
}

export const termsService = new TermsService();
