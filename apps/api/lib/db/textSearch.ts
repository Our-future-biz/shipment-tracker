import { and, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

// How typed text is compared with stored text when a list is searched (quotes, shipments,
// customers). ONE definition for both sides: the words the user typed are folded here, the stored
// text by SQL (foldSql) - with the constants of this file as its parameters - so the two cannot
// drift apart. Folded means: letters without their diacritics, in lower case. "sanghaj" then finds
// "Šanghaj", "zelezny" finds "Železný".

/**
 * The accents canonical decomposition (NFD) splits off a letter, as a character class that a
 * JavaScript RegExp and a Postgres regular expression read the same way.
 */
export const COMBINING_MARKS = "[\u0300-\u036f]";

/**
 * The letters with a stroke, which decomposition leaves whole, and the plain letter each one
 * becomes: the from and to of SQL translate(), character by character.
 */
export const FOLD_FROM = "đĐħĦıłŁøØŧŦ";
export const FOLD_TO = "ddhhilloott";

/**
 * The lower-case Greek sigma as it is written at the end of a word, and everywhere else. Lower
 * case alone does not settle which of the two a capital Σ becomes: JavaScript writes ς at the end
 * of a word, Postgres lower() σ everywhere or, with an ICU locale, ς as well - and stored text
 * holds either. Both sides therefore end by writing every ς as σ.
 */
export const FINAL_SIGMA = "ς";
export const SIGMA = "σ";

const MARKS = new RegExp(COMBINING_MARKS, "g");
const PLAIN = new Map(Array.from(FOLD_FROM, (letter, at) => [letter, FOLD_TO[at]]));

/**
 * A text as it is compared: without diacritics, in lower case. The same steps in the same order
 * as the SQL (foldSql). Lower case comes after the diacritics: by then every such
 * letter is plain ASCII, and how far lower() reaches beyond ASCII depends on the locale of the
 * database. The sigma comes last, because it is lower case that writes it two ways.
 */
export function foldDiacritics(text: string): string {
  const unmarked = text.normalize("NFD").replace(MARKS, "");
  return Array.from(unmarked, (letter) => PLAIN.get(letter) ?? letter)
    .join("")
    .toLowerCase()
    .replaceAll(FINAL_SIGMA, SIGMA);
}

/**
 * A text as part of a LIKE pattern that matches it literally: % and _ would stand for any text
 * and any character. The backslash is the escape character LIKE has unless told otherwise.
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

// More words than this are not looked for, and no word longer than this: what one search may
// cost the database is bounded.
const MAX_TOKENS = 5;
const MAX_TOKEN_LENGTH = 50;

/**
 * The words of a search text, as the list query looks for them: folded and escaped for LIKE.
 * Every one of them has to occur somewhere in a quote's searched text.
 */
export function searchTokens(text: string): string[] {
  return (
    foldDiacritics(text)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, MAX_TOKENS)
      // Cut by character, and before escaping: a pattern must not end in half an escape.
      .map((word) => escapeLike(Array.from(word).slice(0, MAX_TOKEN_LENGTH).join("")))
  );
}

/** `text` folded in SQL exactly as foldDiacritics folds a JavaScript string (the same steps and constants). */
export const foldSql = (text: SQL): SQL =>
  sql`replace(lower(translate(regexp_replace(normalize(${text}, NFD), ${COMBINING_MARKS}, '', 'g'), ${FOLD_FROM}, ${FOLD_TO})), ${FINAL_SIGMA}, ${SIGMA})`;

/**
 * Rows whose `columns`, joined and folded, contain every word of `search` (see searchTokens),
 * ignoring diacritics and case; % and _ typed by the user are literal. Undefined for no words.
 * A column can also be an SQL expression (e.g. a value of a related table).
 */
export function containsAllWords(columns: (PgColumn | SQL)[], search: string): SQL | undefined {
  const words = searchTokens(search);
  if (!words.length) return undefined;
  const text = foldSql(sql`concat_ws(' ', ${sql.join(columns, sql`, `)})`);
  return and(...words.map((word) => sql`${text} LIKE ${`%${word}%`}`));
}
