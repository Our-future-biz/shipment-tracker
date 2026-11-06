// Warehouse Concept and Trucking Concept are prototypes shown to superadmins only (menu, pages and
// the concept parts other screens embed). Everyone else works with the normal modules. Pure, so it
// is tested without React.

export interface ConceptUser {
  role: string;
}

/** Whether `user` sees the concept modules. */
export const canSeeConcepts = (user: ConceptUser | null | undefined): boolean => user?.role === "superadmin";

/** The one page of Warehouse Concept open to more than superadmins: the warehouse managers' page. */
export const WAREHOUSE_MANAGERS_PATH = "/warehouse-concept/managers";

/** Whether `user` opens that page without seeing the rest of the concept module: an admin or a manager. */
export const isWarehouseManagerOnly = (user: ConceptUser | null | undefined): boolean => user?.role === "admin" || user?.role === "manager";

/** The path prefixes of the concept modules' own pages. */
export const CONCEPT_PATHS = ["/warehouse-concept", "/trucking"] as const;
