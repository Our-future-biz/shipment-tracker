// How names are compared wherever a typed name has to find a user. No imports: safe in any test.

/** A name as it is compared: lower case, without diacritics, single spaces ("Lukáš" = "lukas"). */
export function normaliseName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
