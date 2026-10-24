import { APIError } from "encore.dev/api";
import type { Actor } from "../../../lib/rbac";
import { salesPreferenceRepository } from "../repositories/salesPreference.repository";
import { permissionsService } from "./permissions.service";
import { EMAIL_TEMPLATES_PREFIX } from "./emailTemplate.service";
import { EMAIL_ADDRESSES_PREFIX } from "./emailAddress.service";

const PERSONAL_PREFIXES = [EMAIL_TEMPLATES_PREFIX, EMAIL_ADDRESSES_PREFIX];

// Preferences that are settings of the whole company rather than the layout of a screen: they
// print on every quotation, so only who may edit the Sales settings writes them. The other
// preferences that can be written (WRITABLE) are written by any user, as before.
const SETTINGS_KEYS: readonly string[] = ["company_details"];

// The manual follow-up tasks used to be one list under this key, replaced whole by every change.
// They are rows of their own now (followupTask.service), copied from the list once. The list
// stays stored and readable as an archive, and is never written again: a page from before the
// move would overwrite colleagues' tasks with its old copy, into a list nobody reads any more.
const FOLLOWUP_TASKS_KEY = "followup_tasks";

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

// The preferences that can be written, each with the form its value has. Only the form is looked
// at - a list of texts, not which texts - so a column set stored by an older version of the list
// stays writable.
const WRITABLE: ReadonlyMap<string, (value: unknown) => boolean> = new Map([
  // The columns of the Quotes list, in their order.
  ["qh_cols", (value: unknown) => Array.isArray(value) && value.every((key) => typeof key === "string")],
  // The saved views of the Quotes list. What a view filters by is the screen's to read.
  ["saved_views", (value: unknown) => Array.isArray(value) && value.every((view) => isObject(view) && typeof view.id === "string" && typeof view.label === "string")],
  // Who quotations are from.
  ["company_details", isObject],
]);

// More than any of them comes near: the value is one cell, read whole by every screen that uses it.
const MAX_VALUE_BYTES = 64 * 1024;

class PreferenceService {
  async get(prefKey: string, companyId: string): Promise<unknown | null> {
    // A user's email templates and the addresses they emailed are theirs alone: read only through
    // emailTemplate.service and emailAddress.service.
    if (PERSONAL_PREFIXES.some((prefix) => prefKey.startsWith(prefix))) throw APIError.permissionDenied("this is read by its own user only");
    return salesPreferenceRepository.get(prefKey, companyId);
  }

  async set(prefKey: string, actor: Actor, value: unknown): Promise<void> {
    if (prefKey === FOLLOWUP_TASKS_KEY) throw APIError.failedPrecondition("follow-up tasks have moved - reload the page");
    const hasForm = WRITABLE.get(prefKey);
    if (!hasForm) throw APIError.invalidArgument(`there is no preference "${prefKey}" to store`);
    if (SETTINGS_KEYS.includes(prefKey)) permissionsService.requireSettingsEditor(actor);
    // A request without a value stores nothing: an empty one put in its place would wipe what is stored.
    if (value === undefined || value === null) throw APIError.invalidArgument("value is required");
    if (!hasForm(value)) throw APIError.invalidArgument(`the value of "${prefKey}" does not have the form this preference is stored in`);
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_VALUE_BYTES) throw APIError.invalidArgument("the value is too large - at most 64 KB");
    await salesPreferenceRepository.set(prefKey, actor.companyID, value);
  }
}

export const preferenceService = new PreferenceService();
