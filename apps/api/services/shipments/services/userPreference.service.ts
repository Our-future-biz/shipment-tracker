import { APIError } from "encore.dev/api";
import { userPreferenceRepository } from "../repositories/userPreference.repository";

// UI settings saved per user (e.g. which fields the Details cards show). The value travels
// as a JSON string: Encore can't carry a free-form object in a request or response.
class UserPreferenceService {
  /** The saved JSON; null while the user has saved nothing under this key. */
  async get(companyId: string, userId: string, prefKey: string): Promise<string | null> {
    const row = await userPreferenceRepository.get(companyId, userId, prefKey);
    return row ? JSON.stringify(row.value) : null;
  }

  async set(companyId: string, userId: string, prefKey: string, json: string): Promise<void> {
    // Refuse malformed JSON instead of storing {}: a silent reset would wipe the preference
    // the caller was trying to save.
    let parsed: unknown;
    try {
      parsed = JSON.parse(json || "{}");
    } catch {
      throw APIError.invalidArgument("value must be valid JSON");
    }
    await userPreferenceRepository.set(companyId, userId, prefKey, parsed);
  }
}

export const userPreferenceService = new UserPreferenceService();
