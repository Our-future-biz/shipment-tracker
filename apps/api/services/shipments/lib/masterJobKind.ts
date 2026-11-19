// Which shipments may go on which master job (owner decision, 19 Nov 2026): only those that belong
// there by their filling - a CZLCL (Consolidation) job on a CZCONSOL master, a CZFCL (Full Load) job
// on a CZFULL one, a Project Shipment on a PROJECT one. The filling is the Load Type: it gives both
// the master job's letters (lib/masterJobNumber) and the house's (lib/jobNumber), and it is the same
// for an air, rail or road job, whose letters don't show it. Linking copies the master job's Load
// Type onto the house (lib/masterJobSync), so without this rule a Full Load job put on a
// Consolidation master would quietly become one. The messages name a Load Type as the screens do
// (lib/loadTypeLabel): an air Full Load is a Single Shipment.

import { loadTypeLabel } from "./loadTypeLabel";

export interface KindedShipment {
  jobNumber: string;
  loadType: string | null;
  /** Names its Load Type in the messages; left out, the master job's is used. */
  freightMode?: string | null;
}

export interface KindedMasterJob {
  mczNumber: string;
  loadType: string | null;
  freightMode?: string | null;
}

const filled = (loadType: string | null | undefined): string => (loadType ?? "").trim();
const sameKind = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
// The first freight mode given (a house's own, else its master job's: a house takes the master job's).
const modeOf = (...modes: (string | null | undefined)[]) => modes.find((m) => (m ?? "").trim()) ?? null;

/**
 * Shipments of a Load Type in words: "Full Load shipments", "Consolidation shipments" - but "Single Shipments" and
 * "Project Shipments", never "Single Shipment shipments" (mock test council n31).
 */
export const kindShipments = (name: string): string => (/shipment$/i.test(name.trim()) ? `${name.trim()}s` : `${name.trim()} shipments`);

/**
 * The freight mode a master job goes by (mock test council n31): its own, else - while it has none - the one mode
 * all its houses share, so a master job of air houses with no Freight Mode is not named or served as sea. "" when
 * it has none and its houses have none, or several.
 */
export function masterJobMode(freightMode: string | null | undefined, houses: readonly { freightMode?: string | null }[]): string {
  const own = (freightMode ?? "").trim();
  if (own) return own;
  const modes: string[] = [];
  for (const h of houses) {
    const mode = (h.freightMode ?? "").trim();
    if (mode && !modes.some((m) => sameKind(m, mode))) modes.push(mode);
  }
  return modes.length === 1 ? modes[0]! : "";
}

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
  const kind = kindWithMode(masterJob, houses);
  return kind && { loadType: kind.loadType, from: kind.from };
}

/** The filling as masterJobKind gives it, with the freight mode that names it: the master job's, else its house's. */
function kindWithMode(masterJob: KindedMasterJob, houses: readonly KindedShipment[]): { loadType: string; from: string; name: string } | null {
  const own = filled(masterJob.loadType);
  // Named by the master job's mode - with none, its houses' one (n31).
  if (own) return { loadType: own, from: masterJob.mczNumber, name: loadTypeLabel(own, masterJobMode(masterJob.freightMode, houses)) };
  const kinds = loadTypesOf(houses);
  if (kinds.length !== 1) return null;
  const house = houses.find((h) => filled(h.loadType))!;
  return { loadType: kinds[0]!, from: house.jobNumber, name: loadTypeLabel(kinds[0], modeOf(masterJob.freightMode, house.freightMode)) };
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
    const names = mixed.map((k) => loadTypeLabel(k, modeOf(masterJob.freightMode, typed.freightMode)));
    return `${typed.jobNumber} can't go on ${masterJob.mczNumber}: it already holds shipments of different Load Types (${names.join(", ")}) - take off those that don't belong first`;
  }
  const onIt = [...houses];
  for (const shipment of shipments) {
    const kind = kindWithMode(masterJob, onIt);
    const own = filled(shipment.loadType);
    if (kind && own && !sameKind(kind.loadType, own)) {
      const why =
        kind.from === masterJob.mczNumber
          ? `${masterJob.mczNumber} is a ${kind.name} master job`
          : `${masterJob.mczNumber} holds ${kindShipments(kind.name)} (${kind.from})`;
      const ownName = loadTypeLabel(own, modeOf(shipment.freightMode, masterJob.freightMode));
      return `${shipment.jobNumber} is ${ownName} and can't go on ${masterJob.mczNumber}: ${why} - a shipment goes only on a master job of its own Load Type`;
    }
    onIt.push(shipment);
  }
  return null;
}

/**
 * Why the master job can't take this Load Type (set for the first time), or null: a shipment on it
 * with another Load Type would be turned into this one. `freightMode`: the master job's.
 */
export function loadTypeKindProblem(
  mczNumber: string,
  loadType: string | null | undefined,
  houses: readonly KindedShipment[],
  freightMode?: string | null,
): string | null {
  const wanted = filled(loadType);
  if (!wanted) return null;
  const other = houses.filter((h) => filled(h.loadType) && !sameKind(filled(h.loadType), wanted));
  if (!other.length) return null;
  // The shipments in the way by their Load Type: "CZFCL00000019 on it is Full Load", or with more than
  // one Load Type "on it, CZFCL00000019 is Full Load and CZ00000020 is Project Shipment".
  const groups: { name: string; jobs: string[] }[] = [];
  for (const h of other) {
    const name = loadTypeLabel(h.loadType, modeOf(h.freightMode, freightMode));
    const group = groups.find((g) => sameKind(g.name, name));
    if (group) group.jobs.push(h.jobNumber);
    else groups.push({ name, jobs: [h.jobNumber] });
  }
  const said = (g: { name: string; jobs: string[] }) => `${g.jobs.join(", ")} ${g.jobs.length === 1 ? "is" : "are"} ${g.name}`;
  const inTheWay =
    groups.length === 1
      ? `${groups[0]!.jobs.join(", ")} on it ${groups[0]!.jobs.length === 1 ? "is" : "are"} ${groups[0]!.name}`
      : `on it, ${groups.map(said).join(" and ")}`;
  return `${mczNumber} can't become ${loadTypeLabel(wanted, freightMode)}: ${inTheWay} - take ${other.length === 1 ? "it" : "them"} off the master job first.`;
}

/**
 * Why a shipment on a master job can't change to this Load Type, or null: it must stay of the
 * master job's filling. `others`: the other shipments on the master job.
 */
export function houseLoadTypeProblem(shipment: KindedShipment, masterJob: KindedMasterJob, others: readonly KindedShipment[]): string | null {
  const wanted = filled(shipment.loadType);
  const kind = kindWithMode(masterJob, others);
  if (!wanted || !kind || sameKind(kind.loadType, wanted)) return null;
  const why = kind.from === masterJob.mczNumber ? `a ${kind.name} master job` : `which holds ${kindShipments(kind.name)} (${kind.from})`;
  return `${shipment.jobNumber} is on ${masterJob.mczNumber}, ${why}, so its Load Type stays ${kind.name} - take it off the master job first`;
}
