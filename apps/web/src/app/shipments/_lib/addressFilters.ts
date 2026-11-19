// Filters the Shipments list takes from its address alone. The page has no control for them: a
// link sets them (the tiles of Shipments → Managers), so each one shows as a chip over the table,
// with a × that drops it - or the list would be short with nothing on the page saying why.
// The search (?q=), the status (?status=), the column filters (?f.…=) and the Overview tiles
// (?tile=active…) have their own controls and are not among them.

/** How a job travels, as the list's `mode` filter names it (the server's freightKindOf). */
const MODE_LABELS = { sea: "Sea", air: "Air", rail: "Rail", road: "Road" } as const;
export type ListMode = keyof typeof MODE_LABELS;

/**
 * Which way a job goes, as the list's `direction` filter names it: Shipments → Managers' Trade
 * Direction, matched on the server over every job (trimmed, in any case), not among the rows loaded.
 */
const DIRECTION_LABELS = { import: "Import", export: "Export", domestic: "Domestic" } as const;
export type ListDirection = keyof typeof DIRECTION_LABELS;

/** The address value of Handled By that asks for the jobs nobody handles. */
export const HANDLED_BY_NOBODY = "nobody";

// The tile of Shipments → Managers that the list's Overview does not have: nothing on the page
// lights for it, so it gets a chip. (The Overview's own tiles light themselves. The cockpit's
// cut-off and booking tiles open no list: they narrow its own cards.)
const COCKPIT_TILE_LABELS = {
  claims: "Open claims",
} as const;

// The one value each of these takes; the chip says it in the page's words.
const CUSTOMS_LABELS = { urgent: "Customs: urgent" } as const;
const INVOICING_LABELS = { "unbilled-arrivals": "Arrived, not released for billing" } as const;

/** The address parameters that show as a chip. */
export type AddressFilterParam = "handledBy" | "mode" | "direction" | "customs" | "invoicing" | "tile";

/** One filter the address holds, as the chip over the table says it. */
export interface AddressFilterChip {
  /** The parameter its × takes out of the address. */
  param: AddressFilterParam;
  label: string;
}

export interface AddressFilters {
  /** What the list request is narrowed by; a value the list does not know is left out. */
  request: { handledBy?: string; mode?: ListMode; direction?: ListDirection; customs?: string; invoicing?: string };
  /** The chips, in a fixed order: who, how and which way it travels, then what is wrong with it. */
  chips: AddressFilterChip[];
}

const known = <T extends Record<string, string>>(labels: T, value: string): value is Extract<keyof T, string> => Object.hasOwn(labels, value);

/**
 * The filters the list's address holds. A value the list does not know (`mode=ship`,
 * `direction=inbound`, `customs=later`) is ignored: no chip, and nothing sent for it. Handled By
 * takes any text - a person nobody is, is simply found on no job, and the chip says who was asked for.
 */
export function addressFiltersOf(params: Pick<URLSearchParams, "get">): AddressFilters {
  const request: AddressFilters["request"] = {};
  const chips: AddressFilterChip[] = [];
  const value = (param: AddressFilterParam) => (params.get(param) ?? "").trim();

  const handledBy = value("handledBy");
  if (handledBy) {
    const nobody = handledBy.toLowerCase() === HANDLED_BY_NOBODY;
    request.handledBy = nobody ? HANDLED_BY_NOBODY : handledBy;
    chips.push({ param: "handledBy", label: `Handled By: ${nobody ? HANDLED_BY_NOBODY : handledBy}` });
  }

  const mode = value("mode").toLowerCase();
  if (known(MODE_LABELS, mode)) {
    request.mode = mode;
    chips.push({ param: "mode", label: `Mode: ${MODE_LABELS[mode]}` });
  }

  const direction = value("direction").toLowerCase();
  if (known(DIRECTION_LABELS, direction)) {
    request.direction = direction;
    chips.push({ param: "direction", label: `Trade Direction: ${DIRECTION_LABELS[direction]}` });
  }

  const customs = value("customs").toLowerCase();
  if (known(CUSTOMS_LABELS, customs)) {
    request.customs = customs;
    chips.push({ param: "customs", label: CUSTOMS_LABELS[customs] });
  }

  const invoicing = value("invoicing").toLowerCase();
  if (known(INVOICING_LABELS, invoicing)) {
    request.invoicing = invoicing;
    chips.push({ param: "invoicing", label: INVOICING_LABELS[invoicing] });
  }

  // The tile itself goes to the list as it always did (ShipmentsView); here it is only named.
  const tile = value("tile");
  if (known(COCKPIT_TILE_LABELS, tile)) chips.push({ param: "tile", label: COCKPIT_TILE_LABELS[tile] });

  return { request, chips };
}

/**
 * Whether the address is a link's: it names a tile, or holds a filter above. Such a link (a tile
 * of Shipments → Managers) is to open exactly the rows it counted, so the list does not add the
 * Status and column filters it remembers from the last visit, as it does on a plain arrival.
 */
export function arrivesByLink(params: Pick<URLSearchParams, "get">): boolean {
  const tile = (params.get("tile") ?? "").trim();
  const { request, chips } = addressFiltersOf(params);
  return (tile !== "" && tile !== "all") || chips.length > 0 || Object.keys(request).length > 0;
}

/**
 * The filters above that narrow the list request, as one text: it changes when one of them is
 * set, changed or cleared, and with nothing else in the address (the list goes back to its first
 * page then). The tile is not in it: the list follows that one by itself.
 */
export function addressFiltersKey(params: Pick<URLSearchParams, "get">): string {
  const { handledBy = "", mode = "", direction = "", customs = "", invoicing = "" } = addressFiltersOf(params).request;
  return [handledBy, mode, direction, customs, invoicing].join("\n");
}

/** The list's address with one of its chips cleared: that parameter goes, every other stays. */
export function withoutAddressFilter(current: Pick<URLSearchParams, "toString">, param: AddressFilterParam): URLSearchParams {
  const params = new URLSearchParams(current.toString());
  params.delete(param);
  return params;
}
