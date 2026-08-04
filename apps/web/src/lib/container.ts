// A container number is 4 letters + 7 digits (ISO 6346). The app stores and shows
// it in one canonical form: uppercase, with no spaces/hyphens/other separators.
// e.g. "MSMU 272727-7" or "msmu272727-7" → "MSMU2727277".
export function normalizeContainerNumber(raw?: string | null): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Pull every canonical container number out of a free-text value. A document may
// list several and use spaces/hyphens, so we strip separators first, then extract
// each 4-letter + 7-digit number. Falls back to the cleaned string when nothing
// matches the canonical shape, so an unusual value isn't silently dropped.
export function extractContainerNumbers(raw?: string | null): string[] {
  const cleaned = normalizeContainerNumber(raw);
  const matches = cleaned.match(/[A-Z]{4}[0-9]{7}/g);
  if (matches && matches.length > 0) return matches;
  return cleaned ? [cleaned] : [];
}
