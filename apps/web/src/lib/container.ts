// A container number is 4 letters + 7 digits (ISO 6346). The app stores and shows
// it in one canonical form: uppercase, with no spaces/hyphens/other separators.
// e.g. "MSMU 272727-7" or "msmu272727-7" → "MSMU2727277".
export function normalizeContainerNumber(raw?: string | null): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// What a container number field keeps while typing: uppercase letters for the first 4 places,
// then digits for the next 7; anything else (a digit among the letters, a letter among the
// digits, separators, a 12th character) is dropped. A pasted "msmu 272727-7" → "MSMU2727277".
export function containerNumberInput(raw: string): string {
  let out = "";
  for (const ch of normalizeContainerNumber(raw)) {
    if (out.length < 4 ? /[A-Z]/.test(ch) : out.length < 11 && /[0-9]/.test(ch)) out += ch;
  }
  return out;
}

/** Canonical shape: 4 letters + 7 digits. An empty value is allowed (row not filled in yet). */
export function isValidContainerNumber(raw?: string | null): boolean {
  const n = normalizeContainerNumber(raw);
  return n === "" || /^[A-Z]{4}[0-9]{7}$/.test(n);
}

// ISO 6346 values of the owner code's letters: A is 10, and every multiple of 11 is skipped.
const LETTER_VALUES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").reduce<{ next: number; values: Record<string, number> }>(
  (acc, letter) => {
    if (acc.next % 11 === 0) acc.next += 1;
    acc.values[letter] = acc.next;
    acc.next += 1;
    return acc;
  },
  { next: 10, values: {} },
).values;

/**
 * Whether the last digit of a complete number is the one ISO 6346 works out from the rest: a typing
 * mistake usually breaks it. Empty or unfinished numbers don't count as wrong: the shape check says those.
 */
export function containerCheckDigitOk(raw?: string | null): boolean {
  const n = normalizeContainerNumber(raw);
  if (!/^[A-Z]{4}[0-9]{7}$/.test(n)) return true;
  const sum = n
    .slice(0, 10)
    .split("")
    .reduce((total, ch, i) => total + (LETTER_VALUES[ch] ?? Number(ch)) * 2 ** i, 0);
  return (sum % 11) % 10 === Number(n[10]);
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
