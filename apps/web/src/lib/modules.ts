// Modules a company can have hidden (Platform → Companies, set by a superadmin). For a hidden module
// the menu items disappear, its pages send the user to the dashboard and the server refuses its
// endpoints; screens that embed it (Shipments, Customers, Sales) leave those parts out. A
// superadmin always sees everything. Pure, so it is tested without React.

export type AppModule = "warehouse_concept" | "trucking_concept";

export const APP_MODULES: readonly { module: AppModule; label: string }[] = [
  { module: "warehouse_concept", label: "Warehouse Concept" },
  { module: "trucking_concept", label: "Trucking Concept" },
];

/** The part of the signed-in user this needs (the server sends `hiddenModules`; [] for a superadmin). */
export interface ModuleUser {
  role: string;
  hiddenModules?: readonly string[] | null;
}

/** Whether `module` is on for this user; nobody signed in sees nothing hidden decided yet (true). */
export function isModuleEnabled(user: ModuleUser | null | undefined, module: AppModule): boolean {
  if (!user) return true;
  if (user.role === "superadmin") return true;
  return !(user.hiddenModules ?? []).includes(module);
}

/** The path prefixes of each module's own pages. */
export const MODULE_PATHS: Record<AppModule, readonly string[]> = {
  warehouse_concept: ["/warehouse"],
  trucking_concept: ["/trucking"],
};

/** The module whose own pages `pathname` is under, or null. */
export function moduleOfPath(pathname: string): AppModule | null {
  const path = pathname.replace(/\/$/, "");
  for (const { module } of APP_MODULES) {
    if (MODULE_PATHS[module].some((p) => path === p || path.startsWith(`${p}/`))) return module;
  }
  return null;
}

/**
 * The Shipments → Warehouse tab is read-only while the company has the Warehouse Concept (the
 * warehouse part is edited there); without it the tab is where the warehouse part is edited.
 */
export const shipmentWarehouseReadOnly = (user: ModuleUser | null | undefined) => isModuleEnabled(user, "warehouse_concept");
