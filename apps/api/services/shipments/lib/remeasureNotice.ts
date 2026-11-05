// The message the warehouse's "Inform Operations" posts to a shipment's chat: the cargo was
// remeasured, the shipment's figures against the remeasured ones, and the shipment's Person in
// Charge and Holiday Cover tagged, so it reaches their notifications (a chat @mention). Built here,
// on the server, from the shipment as stored and the company's users, so who is tagged is never
// what a browser says. Pure; comment.service posts it.

import { cargoNum, dimensionVolumePerPiece, type PieceSizes } from "../../../lib/cargoVolume";
import { userByEmail, type CompanyUser } from "../../../lib/personPick";

export interface CargoFigures {
  colli: number;
  weightKg: number;
  volumeCbm: number;
}

/**
 * What the warehouse's screen compared its remeasured lines with: the totals of the shipment's
 * cargo dimension lines (Shipments → Warehouse), or what the shipment declares - its pieces,
 * weight and volume, the dimension lines filling in a missing one (Warehouse Concept's position).
 */
export const COMPARED_WITH = ["dimensions", "declared"] as const;
export type ComparedWith = (typeof COMPARED_WITH)[number];

export interface RemeasureNotice {
  message: string;
  /** Who is tagged: the users the two fields name, each once (the one clicking too, when named). */
  tagged: CompanyUser[];
}

type DimensionLine = PieceSizes & { pieces: string; weightPerPcKg: string };

const round = (n: number, decimals: number) => Math.round(n * 10 ** decimals) / 10 ** decimals;

/** The totals of cargo dimension lines: pieces, pieces × kg per piece, pieces × m³ of a piece. */
export function dimensionFigures(lines: readonly DimensionLine[]): CargoFigures {
  let colli = 0;
  let kg = 0;
  let m3 = 0;
  for (const l of lines) {
    const pieces = cargoNum(l.pieces);
    colli += pieces;
    kg += pieces * cargoNum(l.weightPerPcKg);
    m3 += pieces * dimensionVolumePerPiece(l);
  }
  return { colli, weightKg: round(kg, 1), volumeCbm: round(m3, 3) };
}

/**
 * What a shipment declares: its pieces (shown with thousands separators), weight (tonnes → kg) and
 * volume; a missing one from its cargo dimension lines.
 */
export function declaredFigures(s: { pcs?: string | null; totalWeightTons?: string | null; totalVolumeCbm?: string | null; cargoDimensions?: readonly DimensionLine[] | null }): CargoFigures {
  const dims = dimensionFigures(s.cargoDimensions ?? []);
  const pcs = cargoNum((s.pcs ?? "").replace(/,/g, ""));
  const tons = cargoNum(s.totalWeightTons);
  const cbm = cargoNum(s.totalVolumeCbm);
  return {
    colli: pcs > 0 ? pcs : dims.colli,
    weightKg: tons > 0 ? round(tons * 1000, 1) : dims.weightKg,
    volumeCbm: cbm > 0 ? round(cbm, 3) : dims.volumeCbm,
  };
}

const figures = (f: CargoFigures) =>
  [
    `${f.colli > 0 ? f.colli : "—"} colli`,
    `${f.weightKg > 0 ? f.weightKg.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—"} kg`,
    `${f.volumeCbm > 0 ? f.volumeCbm.toFixed(3) : "—"} CBM`,
  ].join(" · ");

// A person field holds a user's e-mail; a stamp keeps the time after " — ".
const personOf = (value: string | null | undefined) => (value ?? "").split(" — ")[0]!.trim();

/**
 * The notice for a shipment whose Person in Charge and Holiday Cover hold `people` (users stored
 * by e-mail). A field naming nobody, or someone who is no user of the company, tags no one; the
 * message still goes to the chat. A note typed with Inform Operations goes with it.
 */
export function remeasureNotice(
  people: { personInCharge?: string | null; holidayCover?: string | null },
  users: readonly CompanyUser[],
  shipment: CargoFigures,
  remeasured: CargoFigures,
  note = "",
): RemeasureNotice {
  const tagged: CompanyUser[] = [];
  for (const value of [people.personInCharge, people.holidayCover]) {
    const user = userByEmail(personOf(value), [...users]);
    if (user && !tagged.includes(user)) tagged.push(user);
  }
  const lines = ["Cargo has been remeasured by the warehouse.", `Shipment values: ${figures(shipment)}`, `Remeasured values: ${figures(remeasured)}`];
  if (note.trim()) lines.push(`Note: ${note.trim()}`);
  // Written as the chat writes a tag: "@" and the name the @ list shows.
  if (tagged.length) lines.push(tagged.map((u) => `@${u.displayName || u.email}`).join(" "));
  return { message: lines.join("\n"), tagged };
}
