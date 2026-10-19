// Text as a search compares it: letters without their diacritics (and the stroked ones, which
// decomposition leaves whole, as plain letters), in lower case - the same folding the server's
// list search does (apps/api lib/db/textSearch.ts). "zelezny" then finds "Železný".
const MARKS = /[̀-ͯ]/g;
const PLAIN = new Map(Array.from("đĐħĦıłŁøØŧŦ", (letter, at) => [letter, "ddhhilloott"[at]!]));

export function fold(text: string): string {
  const unmarked = text.normalize("NFD").replace(MARKS, "");
  return Array.from(unmarked, (letter) => PLAIN.get(letter) ?? letter)
    .join("")
    .toLowerCase();
}

/** Whether `text` contains `query`, ignoring diacritics and case (and the spaces around the query). */
export const foldIncludes = (text: string, query: string): boolean => fold(text).includes(fold(query.trim()));
