import type { interfaces } from "@/lib/api/client";

// Pure helpers of the shipping lines' ocean tariffs: where a line and a version live, and how
// containers, surcharge bases and port matches read.

export const shippingLineHref = (customerId: string) => `/tariffs/shipping-lines/${customerId}`;
export const oceanVersionHref = (customerId: string, versionId: string) => `/tariffs/shipping-lines/${customerId}/versions/${versionId}`;

/** The containers an ocean tariff prices, in the order they are shown. */
export const OCEAN_EQUIPMENT: { value: interfaces.OceanEquipment; label: string }[] = [
  { value: "20DC", label: "20' DC" },
  { value: "40DC", label: "40' DC" },
  { value: "40HC", label: "40' HC" },
  { value: "20RF", label: "20' RF" },
  { value: "40RF", label: "40' HRF" },
];

export const equipmentLabel = (e: interfaces.OceanEquipment) => OCEAN_EQUIPMENT.find((x) => x.value === e)?.label ?? e;

export const SURCHARGE_BASIS_TEXT: Record<interfaces.OceanSurchargeBasis, string> = {
  teu: "per TEU",
  container: "per container",
  bl: "per B/L",
  booking: "per booking",
};

export const SURCHARGE_CONDITION_TEXT: Record<interfaces.OceanSurchargeCondition, string> = {
  always: "",
  dangerous: "dangerous goods only",
  manual_booking: "manual booking / B/L only",
};

export const PORT_STATUS_TEXT: Record<interfaces.OceanPortStatus, string> = {
  matched: "Matched",
  manual: "Picked",
  skipped: "Left out",
  pending: "To pick",
};

/** "Hamburg (DEHAM)" for a matched port, the name alone otherwise. */
export const portText = (name: string, code: string | null) => (code ? `${name} (${code})` : name);

/** The quote charge a surcharge goes on, in words. */
export const SURCHARGE_CHARGE_TEXT: Record<interfaces.OceanSurchargeCharge, string> = {
  fcl_baf: "BAF",
  ams_ens: "AMS",
  fcl_documentation: "B/L fee",
  other: "own line",
};

/** The UN/LOCODE in a place picker's value, "Hamburg (DEHAM)" → "DEHAM"; null when it has none. */
export function placeCodeOf(value: string): string | null {
  return /\(([A-Z]{2}[A-Z0-9]{3})\)$/.exec(value.trim())?.[1] ?? null;
}

/** "TWKHH — Kaohsiung, TW": a candidate place of a port name, its code first. */
export const placeText = (p: Pick<interfaces.OceanPlace, "code" | "name" | "subdivisionName" | "countryCode">) =>
  `${p.code} — ${[p.name, p.subdivisionName, p.countryCode].filter(Boolean).join(", ")}`;

/** The containers a version's tables price, in the order they are shown. */
export function equipmentOf(tables: readonly Pick<interfaces.OceanTable, "prices">[]): interfaces.OceanEquipment[] {
  const used = new Set(tables.flatMap((t) => t.prices.map((p) => p.equipment)));
  return OCEAN_EQUIPMENT.map((e) => e.value).filter((e) => used.has(e));
}

/** Which port names a version's port list shows: all, those to pick, or one status. */
export type PortFilter = "all" | interfaces.OceanPortStatus;

export const portsOf = <T extends Pick<interfaces.OceanPort, "status">>(ports: readonly T[], filter: PortFilter): T[] =>
  filter === "all" ? [...ports] : ports.filter((p) => p.status === filter);

/** Which rates a surcharge is added to, in words: "Far East direct · reefer only · ports of discharge in CN, HK". */
export function surchargeScopeText(
  s: Pick<interfaces.OceanSurcharge, "tables" | "equipment" | "countries" | "exceptCountries" | "ports" | "exceptPorts">,
  tables: readonly Pick<interfaces.OceanTable, "label">[],
): string {
  const parts = [s.tables.length ? s.tables.map((i) => tables[i]?.label || `Table ${i + 1}`).join(", ") : "Every table"];
  if (s.equipment.length === 1) parts.push(`${s.equipment[0]} only`);
  if (s.countries.length) parts.push(`ports of discharge in ${s.countries.join(", ")}`);
  if (s.exceptCountries.length) parts.push(`not to ${s.exceptCountries.join(", ")}`);
  if (s.ports.length) parts.push(`to ${s.ports.join(", ")}`);
  if (s.exceptPorts.length) parts.push(`not to ${s.exceptPorts.join(", ")}`);
  return parts.join(" · ");
}
