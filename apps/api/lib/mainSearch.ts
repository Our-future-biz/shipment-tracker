// The app-wide search in the top bar ("main search"): every owning service answers its own
// GET /search/<kind> with the same request and the same shape of answer. This file holds what
// they share: how the typed text and the number of rows asked for are read.

import { foldDiacritics } from "./db/textSearch";

/** Fewer characters than this (after trimming) are not searched: the answer is empty. */
export const MAIN_SEARCH_MIN_LENGTH = 2;
/** Rows per kind when the caller does not say. */
export const MAIN_SEARCH_DEFAULT_LIMIT = 5;
/** The most rows one kind gives. */
export const MAIN_SEARCH_MAX_LIMIT = 50;

/** A number (a container's, a warehouse reference) is looked for from this many characters: a shorter part is in too many. */
export const MAIN_SEARCH_NUMBER_MIN_LENGTH = 4;

/**
 * What a number - a container's, a warehouse reference - is searched for: the text typed, its
 * spaces left out and in capitals ("mscu 123 4567" is MSCU1234567), anywhere in the number, so a
 * part of one finds it too. Both are up to 4 letters and then digits (MSCU1234567, WHCZ2026001),
 * so null for what can't be part of one: shorter than 4 characters, or of any other shape.
 */
export function mainSearchNumber(q: string): string | null {
  const text = q.replace(/\s+/g, "").toUpperCase();
  return text.length >= MAIN_SEARCH_NUMBER_MIN_LENGTH && /^[A-Z]{0,4}[0-9]*$/.test(text) ? text : null;
}

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

/**
 * Whether every word typed is somewhere in these texts, whatever the case and the diacritics -
 * "plzen" finds "Plzeň", as the lists' search does (lib/db/textSearch foldDiacritics): the main
 * search's rule for a kind small enough to be matched in memory (Co-Loading services and sailings).
 */
export function hasEveryWord(texts: readonly (string | null | undefined)[], q: string): boolean {
  const hay = foldDiacritics(texts.filter(Boolean).join(" \u0000 "));
  const words = foldDiacritics(q).split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((w) => hay.includes(w));
}
