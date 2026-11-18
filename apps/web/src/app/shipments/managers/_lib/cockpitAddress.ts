import type { OpsCockpitDirection, OpsCockpitFilter, OpsCockpitMode, OpsCockpitRow, OpsCockpitTiles } from "@/hooks/useShipmentsManagersCockpit";

// Shipments → Managers keeps what it shows in its address - the tab (?tab=approvals), the mode
// (?mode=), the Trade Direction (?direction=), the Handled By person (?handledBy=) and the signal
// its cards are narrowed to (?signal=, read by _lib/cockpitSignals) - so it survives a reload and
// can be linked to. This file reads that address, writes it, and builds the addresses the page
// leads to: the Shipments list behind a list tile, the shipment or the Master Job behind a row.

const SHIPMENTS_MANAGERS_PATH = "/shipments/managers";

/** Who opens the page; the server asks for the same roles (requireRole on the cockpit and on both approvals). */
const SHIPMENTS_MANAGER_ROLES: readonly string[] = ["superadmin", "admin", "manager"];
export const canOpenShipmentsManagers = (user: { role: string } | null | undefined): boolean => !!user && SHIPMENTS_MANAGER_ROLES.includes(user.role);

export const OPS_MODES: { key: OpsCockpitMode; label: string }[] = [
  { key: "all", label: "All" },
  { key: "sea", label: "Sea" },
  { key: "air", label: "Air" },
  { key: "rail", label: "Rail" },
  { key: "road", label: "Road" },
];

export const OPS_DIRECTIONS: { value: OpsCockpitDirection; label: string }[] = [
  { value: "all", label: "All" },
  { value: "import", label: "Import" },
  { value: "export", label: "Export" },
  { value: "domestic", label: "Domestic" },
];

/** A row's mode in words; "" for a job with no Freight Mode (it gets no chip). */
export const modeLabel = (mode: string): string => OPS_MODES.find((m) => m.key !== "all" && m.key === mode)?.label ?? "";

export type ShipmentsManagersTab = "cockpit" | "approvals";

/** The Handled By filter's value for the jobs nobody handles, in the address and in the request. */
export const NOBODY = "nobody";

/** The Handled By select's value for no filter. The address then names nobody at all; typed there by hand it means the same. */
export const EVERYONE = "everyone";

/** The tab an address names, or the cockpit. */
export const tabOf = (value: string | null): ShipmentsManagersTab => (value === "approvals" ? "approvals" : "cockpit");

/** The mode an address names, or All. */
export const modeOf = (value: string | null): OpsCockpitMode => OPS_MODES.find((m) => m.key === value)?.key ?? "all";

/** The Trade Direction an address names, or All. */
export const directionOf = (value: string | null): OpsCockpitDirection => OPS_DIRECTIONS.find((d) => d.value === value)?.value ?? "all";

/**
 * The Handled By person an address names: an e-mail in lower case (as the server's `people` has
 * it), "nobody", or null for everyone.
 */
export function handledByOf(value: string | null): string | null {
  const named = (value ?? "").trim().toLowerCase();
  return named && named !== EVERYONE ? named : null;
}

/** The page's address, leaving out what is the default. `signal` is a signal family's key (_lib/cockpitSignals), null for none. */
export function shipmentsManagersHref({
  tab = "cockpit",
  mode = "all",
  direction = "all",
  handledBy = null,
  signal = null,
}: { tab?: ShipmentsManagersTab; signal?: string | null } & Partial<OpsCockpitFilter> = {}): string {
  const params = new URLSearchParams();
  if (tab !== "cockpit") params.set("tab", tab);
  if (mode !== "all") params.set("mode", mode);
  if (direction !== "all") params.set("direction", direction);
  if (handledBy) params.set("handledBy", handledBy);
  if (signal) params.set("signal", signal);
  const qs = params.toString();
  return qs ? `${SHIPMENTS_MANAGERS_PATH}?${qs}` : SHIPMENTS_MANAGERS_PATH;
}

/**
 * The tiles that open the Shipments list: the list has a filter that lists exactly what they
 * count. Every other figure of the answer is counted by the cockpit's own rules (working days,
 * missed cut-offs, facts the list does not read), which no filter of the list repeats: those are
 * the signal tiles, and they narrow the cards on the page instead (_lib/cockpitSignals).
 */
export type OpsListTileKey = Extract<keyof OpsCockpitTiles, "active" | "noHandledBy" | "etdEtaMoved" | "notReleased" | "openClaims">;

/** A list tile; where it leads is tileHref. */
export interface ListTile {
  key: OpsListTileKey;
  label: string;
  /** What the tile counts, in one line, shown on hover. */
  hint: string;
  /** Its figure is red when it counts something. */
  danger?: boolean;
}

/** The list tiles, in the order they are drawn. */
export const LIST_TILES: readonly ListTile[] = [
  { key: "active", label: "Active jobs", hint: "Every job that is not invoiced or cancelled" },
  { key: "noHandledBy", label: "Nobody in Handled By", hint: "Active jobs with nobody in Handled By", danger: true },
  { key: "etdEtaMoved", label: "ETA Moved", hint: "An ETD or ETA moved in the last 7 days", danger: true },
  // Counted by the list's own rule (unbilled-arrivals), so the tile is the rows it opens.
  { key: "notReleased", label: "Arrived, not released for billing", hint: "Tax date reached (ATA, ATD or delivery) and the job is not in Billing yet" },
  { key: "openClaims", label: "Open claims", hint: "Active jobs with a claim" },
];

// The Shipments list's own filters that list what a tile counted (apps/api shipment.repository:
// TILE_PREDICATES, handledByMatch, the invoicing filter). The tiles count active jobs only; a
// filter that is not narrowed to them by itself (Handled By, unbilled arrivals) is joined by
// tile=active.
const TILE_FILTERS: Record<OpsListTileKey, Record<string, string>> = {
  active: { tile: "active" },
  noHandledBy: { tile: "active", handledBy: NOBODY },
  etdEtaMoved: { tile: "etamoved" },
  notReleased: { tile: "active", invoicing: "unbilled-arrivals" },
  openClaims: { tile: "claims" },
};

// The list has no Trade Direction filter of its own beside a tile (its Imports and Exports are
// tiles themselves), so the page's direction goes as the list's column filter on Trade Direction
// (?f.tradeDirection=, lib/columnConfig; ShipmentsTable matches it ignoring case). That filter is
// applied in the browser to the rows the list has loaded: a list longer than the list's own limit
// shows the direction's jobs among those, under the list's notice that it is cut.
const DIRECTION_COLUMN_FILTER = "f.tradeDirection";

/**
 * The Shipments list behind a list tile, narrowed to the page's mode, Trade Direction and Handled
 * By person as the tile is; undefined where the list would not be what the tile counted. The
 * signal the cards are narrowed to does not go along: the list tiles do not change with it.
 */
export function tileHref(key: OpsListTileKey, page: OpsCockpitFilter): string | undefined {
  const filters = TILE_FILTERS[key];
  const params = new URLSearchParams(filters);
  if (filters.handledBy) {
    // "Nobody in Handled By" names its own. On a page narrowed to one person it counts none of
    // their jobs, and the list of the jobs nobody handles would not be what it counted: no link.
    if (page.handledBy && page.handledBy !== filters.handledBy) return undefined;
  } else if (page.handledBy) {
    params.set("handledBy", page.handledBy);
  }
  if (page.mode !== "all") params.set("mode", page.mode);
  const direction = OPS_DIRECTIONS.find((d) => d.value !== "all" && d.value === page.direction);
  // The value as Trade Direction stores it: Import, Export, Domestic.
  if (direction) params.set(DIRECTION_COLUMN_FILTER, direction.label);
  return `/shipments?${params}`;
}

// The shipment page's tab (its ?tab=) where a row's first signal is worked on. Billing is worked
// on from Costs Breakdown; "details" is the tab the page opens on, so it needs no parameter.
const AREA_TAB: Record<OpsCockpitRow["area"], string | null> = {
  tracking: "tracking",
  customs: "customs",
  finance: "costs",
  details: null,
};

// A Master Job is a row only while no shipment is linked to it, and Linked Shipments is the tab
// where one is linked (master-jobs MasterJobsView: ?open=<id>&tab=<key>).
const MASTER_JOB_TAB = "shipments";

/**
 * Where a row leads. A job: its shipment (the page is addressed by the shipment's id), on the tab
 * its first signal belongs to. A Master Job: its page, opened inside Master Jobs by its id.
 */
export function rowHref(row: Pick<OpsCockpitRow, "id" | "area"> & { kind?: OpsCockpitRow["kind"] }): string {
  if (row.kind === "masterJob") return `/master-jobs?${new URLSearchParams({ open: row.id, tab: MASTER_JOB_TAB })}`;
  // A value the page does not know (a newer server) opens the shipment where it always opens.
  const tab = AREA_TAB[row.area] ?? null;
  return `/shipments/${encodeURIComponent(row.id)}${tab ? `?tab=${tab}` : ""}`;
}
