import type { TermsConditionItem } from "../interfaces/interfaces";
import type { TermsConditionRecord } from "../schemas/termsCondition.schema";

/**
 * THE ONE MAPPER from a stored Terms & Conditions template to what the API hands out: the fields
 * the screens use and nothing else of the row - not the company it belongs to, not whether it is
 * deleted. Times are ISO strings, in milliseconds: `updatedAt` is also the version a later save
 * names as the one it was made on.
 */
export function toTermsItem(row: TermsConditionRecord): TermsConditionItem {
  return {
    id: row.id,
    name: row.name,
    includes: row.includes,
    excludes: row.excludes,
    subjectTo: row.subjectTo,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
