// Which shipments may go on which master job (owner decision, 19 Nov 2026): only those that belong
// there by their filling - a CZLCL (Consolidation) job on a CZCONSOL master, a CZFCL (Full Load) job
// on a CZFULL one, a Project Shipment on a PROJECT one. The filling is the Load Type: it gives both
// the master job's letters (lib/masterJobNumber) and the house's (lib/jobNumber), and it is the same
// for an air, rail or road job, whose letters don't show it. Linking copies the master job's Load
// Type onto the house (lib/masterJobSync), so without this rule a Full Load job put on a
// Consolidation master would quietly become one.

export interface KindedShipment {
  jobNumber: string;
  loadType: string | null;
}

export interface KindedMasterJob {
  mczNumber: string;
  loadType: string | null;
}

const filled = (loadType: string | null | undefined): string => (loadType ?? "").trim();
const sameKind = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The distinct Load Types of these shipments, as first written; those without one say nothing. */
export function loadTypesOf(shipments: readonly KindedShipment[]): string[] {
  const out: string[] = [];
  for (const s of shipments) {
    const own = filled(s.loadType);
    if (own && !out.some((k) => sameKind(k, own))) out.push(own);
  }
  return out;
}

/**
 * The filling a master job takes: its own Load Type, or - while it has none (a plain MCZ) - the one
 * of the shipments already on it, so a plain master job does not mix them either. Null when nothing
 * says yet, and when the shipments on a plain one are already of different Load Types (linked before
 * this rule): no one of them is its filling then.
 */
export function masterJobKind(masterJob: KindedMasterJob, houses: readonly KindedShipment[]): { loadType: string; from: string } | null {
  const own = filled(masterJob.loadType);
  if (own) return { loadType: own, from: masterJob.mczNumber };
  const kinds = loadTypesOf(houses);
  if (kinds.length !== 1) return null;
  const house = houses.find((h) => filled(h.loadType))!;
  return { loadType: kinds[0]!, from: house.jobNumber };
}

/**
 * Why these shipments can't go on the master job, or null when they all may. `houses`: those on it
 * already (without the ones being linked). A shipment without a Load Type fits any master job and
 * takes its Load Type; one with a different Load Type does not - also not one of the others linked
 * with it, so a plain master job never gets both.
 */
export function linkKindProblem(masterJob: KindedMasterJob, houses: readonly KindedShipment[], shipments: readonly KindedShipment[]): string | null {
  // A plain master job already holding two fillings (linked before this rule) takes no more of either.
  const mixed = filled(masterJob.loadType) ? [] : loadTypesOf(houses);
  const typed = shipments.find((s) => filled(s.loadType));
  if (mixed.length > 1 && typed) {
    return `${typed.jobNumber} can't go on ${masterJob.mczNumber}: it already holds shipments of different Load Types (${mixed.join(", ")}) - take off those that don't belong first`;
  }
  const onIt = [...houses];
  for (const shipment of shipments) {
    const kind = masterJobKind(masterJob, onIt);
    const own = filled(shipment.loadType);
    if (kind && own && !sameKind(kind.loadType, own)) {
      const why =
        kind.from === masterJob.mczNumber
          ? `${masterJob.mczNumber} is a ${kind.loadType} master job`
          : `${masterJob.mczNumber} holds ${kind.loadType} shipments (${kind.from})`;
      return `${shipment.jobNumber} is ${own} and can't go on ${masterJob.mczNumber}: ${why} - a shipment goes only on a master job of its own Load Type`;
    }
    onIt.push(shipment);
  }
  return null;
}

/**
 * Why the master job can't take this Load Type (set for the first time), or null: a shipment on it
 * with another Load Type would be turned into this one.
 */
export function loadTypeKindProblem(mczNumber: string, loadType: string | null | undefined, houses: readonly KindedShipment[]): string | null {
  const wanted = filled(loadType);
  if (!wanted) return null;
  const other = houses.filter((h) => filled(h.loadType) && !sameKind(filled(h.loadType), wanted));
  if (!other.length) return null;
  const list = other.map((h) => `${h.jobNumber} (${filled(h.loadType)})`).join(", ");
  return `${mczNumber} can't be ${wanted}: ${list} on it ${other.length === 1 ? "is" : "are"} not - take ${other.length === 1 ? "it" : "them"} off the master job first`;
}

/**
 * Why a shipment on a master job can't change to this Load Type, or null: it must stay of the
 * master job's filling. `others`: the other shipments on the master job.
 */
export function houseLoadTypeProblem(shipment: KindedShipment, masterJob: KindedMasterJob, others: readonly KindedShipment[]): string | null {
  const wanted = filled(shipment.loadType);
  const kind = masterJobKind(masterJob, others);
  if (!wanted || !kind || sameKind(kind.loadType, wanted)) return null;
  const why = kind.from === masterJob.mczNumber ? `a ${kind.loadType} master job` : `which holds ${kind.loadType} shipments (${kind.from})`;
  return `${shipment.jobNumber} is on ${masterJob.mczNumber}, ${why}, so its Load Type stays ${kind.loadType} - take it off the master job first`;
}
