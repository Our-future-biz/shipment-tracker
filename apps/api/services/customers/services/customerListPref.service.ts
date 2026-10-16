import { APIError } from "encore.dev/api";
import { customerListPrefRepository } from "../repositories/customerListPref.repository";

// The keys a user may store for the Customer Database list.
export const CUSTOMER_LIST_PREF_KEYS = ["columns", "filter-templates", "column-templates"] as const;
export type CustomerListPrefKey = (typeof CUSTOMER_LIST_PREF_KEYS)[number];

const isKnownKey = (prefKey: string): prefKey is CustomerListPrefKey =>
  (CUSTOMER_LIST_PREF_KEYS as readonly string[]).includes(prefKey);

// The key arrives in the path, which Encore can only type as a string: narrowed here.
function knownKey(prefKey: string): CustomerListPrefKey {
  if (!isKnownKey(prefKey)) throw APIError.invalidArgument(`prefKey must be one of: ${CUSTOMER_LIST_PREF_KEYS.join(", ")}`);
  return prefKey;
}

// The value travels as a JSON string: Encore can't carry a free-form object in a request or response.
class CustomerListPrefService {
  /** The saved JSON; null while the user has saved nothing under this key. */
  async get(companyId: string, userId: string, prefKey: string): Promise<string | null> {
    const row = await customerListPrefRepository.get(companyId, userId, knownKey(prefKey));
    return row ? JSON.stringify(row.value) : null;
  }

  async set(companyId: string, userId: string, prefKey: string, json: string): Promise<void> {
    const key = knownKey(prefKey);
    // Refuse malformed JSON instead of storing {}: a silent reset would wipe what the user was saving.
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw APIError.invalidArgument("value must be valid JSON");
    }
    // The column is NOT NULL: "null" would fail in the database; nothing to save is not a value.
    if (parsed === null) throw APIError.invalidArgument("value must not be null");
    await customerListPrefRepository.set(companyId, userId, key, parsed);
  }
}

export const customerListPrefService = new CustomerListPrefService();
