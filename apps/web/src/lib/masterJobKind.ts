// Which shipments go on which master job (owner decision, 19 Nov 2026): only those of its filling,
// told by the Load Type - a CZLCL (Consolidation) job on a CZCONSOL master, a CZFCL (Full Load) one
// on a CZFULL master, a Project Shipment on a PROJECT one; an air, rail or road job by its Load Type
// too. The server holds the rule (shipments lib/masterJobKind); here it only narrows what is offered.

type Kinded = { loadType?: string | null };

const filled = (loadType: string | null | undefined): string => (loadType ?? "").trim();
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The distinct Load Types of these shipments, as first written; those without one say nothing. */
export function loadTypesOf(shipments: readonly Kinded[]): string[] {
  const out: string[] = [];
  for (const s of shipments) {
    const own = filled(s.loadType);
    if (own && !out.some((k) => same(k, own))) out.push(own);
  }
  return out;
}

/**
 * A master job's filling: its own Load Type, else - a plain MCZ - the one of the shipments on it.
 * "mixed" for a plain one already holding two (linked before the rule): it takes no more of either.
 */
export function masterJobKindOf(masterLoadType: string | null | undefined, houses: readonly Kinded[]): string | "mixed" | null {
  const own = filled(masterLoadType);
  if (own) return own;
  const kinds = loadTypesOf(houses);
  return kinds.length > 1 ? "mixed" : (kinds[0] ?? null);
}

/** Whether shipments of these Load Types may go on a master job of this filling. */
export function kindFits(kind: string | "mixed" | null, loadTypes: readonly string[]): boolean {
  if (kind === "mixed") return loadTypes.length === 0;
  return !kind || loadTypes.every((k) => same(k, kind));
}

/** Whether one shipment fits a master job of this filling: one without a Load Type fits any. */
export function shipmentFits(kind: string | "mixed" | null, shipment: Kinded): boolean {
  const own = filled(shipment.loadType);
  if (kind === "mixed") return !own;
  return !kind || !own || same(own, kind);
}
