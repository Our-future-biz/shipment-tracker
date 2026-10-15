import { APIError } from "encore.dev/api";
import { customerListPrefRepository } from "../repositories/customerListPref.repository";

// The keys a user may store for the Customer Database list.
export const CUSTOMER_LIST_PREF_KEYS = ["columns", "filter-templates", "column-templates"] as const;

function requireKnownKey(prefKey: string): void {
  if (!(CUSTOMER_LIST_PREF_KEYS as readonly string[]).includes(prefKey)) {
    throw APIError.invalidArgument(`prefKey must be one of: ${CUSTOMER_LIST_PREF_KEYS.join(", ")}`);
  }
}

// The value travels as a JSON string: Encore can't carry a free-form object in a request or response.
class CustomerListPrefService {
  /** The saved JSON; null while the user has saved nothing under this key. */
  async get(companyId: string, userId: string, prefKey: string): Promise<string | null> {
    requireKnownKey(prefKey);
    const row = await customerListPrefRepository.get(companyId, userId, prefKey);
    return row ? JSON.stringify(row.value) : null;
  }

  async set(companyId: string, userId: string, prefKey: string, json: string): Promise<void> {
    requireKnownKey(prefKey);
    // Refuse malformed JSON instead of storing {}: a silent reset would wipe what the user was saving.
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw APIError.invalidArgument("value must be valid JSON");
    }
    await customerListPrefRepository.set(companyId, userId, prefKey, parsed);
  }
}

export const customerListPrefService = new CustomerListPrefService();
