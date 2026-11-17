import { mainSearchNumber } from "../../../lib/mainSearch";
import { searchGateRecordsMain } from "../repositories/gateMovement.repository";
import type { SearchGateRecordsResponse } from "../interfaces/records.interfaces";

// A reference typed with the Warehouse Concept's letters, the Warehouse pages' (WHCZ…) or none: its
// number, the way a job number is found whatever its letters (2026000003 finds WCZ2026000003).
const REFERENCE_WORD = /^(?:WCZ|WHCZ)?([0-9]+)$/;

/** The number of a warehouse reference typed as `text` (mainSearchNumber's), or null for other text. */
export function gateRefDigits(text: string): string | null {
  return REFERENCE_WORD.exec(text)?.[1] ?? null;
}

/**
 * The main search in the Warehouse Concept: its gate records whose warehouse reference (WCZ…) or gate
 * reference holds what was typed (from 4 characters, spaces left out, in any case), or is that number
 * typed with other letters or none - each with its job, opened on its Gate Log page.
 */
export async function searchGateRecords(companyId: string, q: string, limit: number): Promise<SearchGateRecordsResponse> {
  const text = mainSearchNumber(q);
  if (!text) return { items: [], total: 0 };
  const { rows, total } = await searchGateRecordsMain(companyId, text, gateRefDigits(text), limit);
  return {
    items: rows.map((r) => ({ id: r.id, reference: r.positionRef || r.gateRef, jobNumber: r.jobNumber, customer: r.customer })),
    total,
  };
}
