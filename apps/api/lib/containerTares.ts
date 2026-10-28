// What an empty container weighs (its tare), by the container types quotes and shipments use.
// Tariffs price by gross weight - the cargo plus the box - while a quote holds the cargo weight
// per container, so the tare is added before a weight band is chosen. The figures are the METRANS
// list of container tares (tara by type); the app uses them for every operator.

const TARE_KG: Record<string, number> = {
  "20' DC": 2300, // 20' standard
  "20' RF": 3000, // 20'rf reefer
  "20' OT": 2300, // 20'ot open top
  // The list has no 20' high-cube open top; its 20' high cube and hard top weigh 2,500.
  "20' HOT": 2500,
  "20' FR": 2800, // 20'ft flat
  "20' HC": 2500, // 20'hc high cube (older quotes)
  "40' DC": 3700, // 40' standard
  "40' HC": 4000, // 40'hc high cube
  "40' RF": 5000, // 40'rf reefer (older quotes)
  "40' HRF": 5300, // 40'rh reefer high cube
  "40' HR": 5300, // the high-cube reefer's former name
  "40' OT": 4000, // 40'ot open top
  "40' HOT": 4000, // 40'oh open top high cube
  "40' FR": 4700, // 40'ft flat
  "40' HFR": 4700, // the list's only 40' flat
  "45' HQ": 4400, // 45'hc high cube
  "45' HC": 4400,
  "45' DC": 4400, // 45' standard
};

/** A container type as the dictionary names it today: "20' GP" saved before is the "20' DC" of now. */
export const containerType = (type: string | null | undefined): string => (type ?? "").trim().replace(/^(\d\d')\s*GP$/i, "$1 DC");

/** The tare of a container type in kg; null for a type the list does not have. */
export function containerTareKg(type: string | null | undefined): number | null {
  const key = containerType(type);
  return Object.hasOwn(TARE_KG, key) ? TARE_KG[key]! : null;
}

/** A container's length in feet from its type ("40' HC" → 40); null when the type names none. */
export function containerLengthFt(type: string | null | undefined): number | null {
  const match = /^(\d{2})'/.exec(containerType(type));
  return match ? Number(match[1]) : null;
}
