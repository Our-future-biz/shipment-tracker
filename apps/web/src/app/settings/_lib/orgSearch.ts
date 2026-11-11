// The Organization page's one search box, applied to each of its sections. Accents are ignored,
// the stroked letters' too (lib/fold), so "plzen" finds "Plzeň" and "lodz" "Łódź".

import { fold } from "@/lib/fold";

export const matchesSearch = (search: string, ...values: (string | null | undefined)[]) => {
  const q = fold(search.trim());
  return !q || values.some((v) => !!v && fold(v).includes(q));
};

// "Branches (4)", or "Branches (1 of 4)" while a search hides some.
export const sectionTitle = (title: string, shown: number, total: number) =>
  `${title} (${shown === total ? total : `${shown} of ${total}`})`;

export const emptyText = (search: string, nothingYet: string) => (search.trim() ? "No matches" : nothingYet);
