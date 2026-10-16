// Warehouse Concept and Trucking Concept are prototypes shown to superadmins only (menu, pages and
// the concept parts other screens embed). Everyone else works with the normal modules. Pure, so it
// is tested without React.

export interface ConceptUser {
  role: string;
}

/** Whether `user` sees the concept modules. */
export const canSeeConcepts = (user: ConceptUser | null | undefined): boolean => user?.role === "superadmin";

/** The path prefixes of the concept modules' own pages. */
export const CONCEPT_PATHS = ["/warehouse-concept", "/trucking"] as const;
