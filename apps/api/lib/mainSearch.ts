// The app-wide search in the top bar ("main search"): every owning service answers its own
// GET /search/<kind> with the same request and the same shape of answer. This file holds what
// they share: how the typed text and the number of rows asked for are read.

/** Fewer characters than this (after trimming) are not searched: the answer is empty. */
export const MAIN_SEARCH_MIN_LENGTH = 2;
/** Rows per kind when the caller does not say. */
export const MAIN_SEARCH_DEFAULT_LIMIT = 5;
/** The most rows one kind gives. */
export const MAIN_SEARCH_MAX_LIMIT = 50;

/**
 * The text to look for, trimmed, and how many rows to give (5 when not said, 1 to 50); null when
 * the text is too short to search - the endpoint then answers { items: [], total: 0 }.
 */
export function mainSearchInput(q: string | undefined, limit: number | undefined): { q: string; limit: number } | null {
  const text = (q ?? "").trim();
  if (Array.from(text).length < MAIN_SEARCH_MIN_LENGTH) return null;
  const asked = limit === undefined || !Number.isFinite(limit) ? MAIN_SEARCH_DEFAULT_LIMIT : Math.trunc(limit);
  return { q: text, limit: Math.min(Math.max(asked, 1), MAIN_SEARCH_MAX_LIMIT) };
}
