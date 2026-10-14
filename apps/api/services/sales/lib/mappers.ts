import { iso } from "../../../lib/db/serialize";
import type { TermsConditionRecord } from "../schemas/termsCondition.schema";
import type { TermsConditionItem } from "../interfaces/interfaces";

export const toTermsItem = (r: TermsConditionRecord): TermsConditionItem => ({
  id: r.id,
  name: r.name,
  includes: r.includes,
  excludes: r.excludes,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
});
