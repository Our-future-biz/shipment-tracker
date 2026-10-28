import { containerType } from "../../../lib/containerTares";
import type { OceanEquipment, OceanOfferLine, OceanOfferSurcharge, OceanSurcharge } from "../interfaces/interfaces";

// What a shipping line's rate row asks for a quote's containers: each container type at the row's
// price for its equipment, and the tariff's surcharges that apply to the row's table, the port of
// discharge and the containers, worked out per TEU, container, B/L or booking. Pure.

const EQUIPMENT_OF: Record<string, OceanEquipment> = {
  "20' DC": "20DC",
  "40' DC": "40DC",
  "40' HC": "40HC",
  "20' RF": "20RF",
  "40' HRF": "40RF",
  // The high-cube reefer's former name, and a standard-height 40' reefer of older quotes.
  "40' HR": "40RF",
  "40' RF": "40RF",
};

/** The equipment an ocean tariff prices a quote's container type by; null for one it does not (special equipment, 45'). */
export const oceanEquipmentOf = (type: string): OceanEquipment | null => EQUIPMENT_OF[containerType(type)] ?? null;

export const teuOf = (equipment: OceanEquipment) => (equipment.startsWith("20") ? 1 : 2);

export const equipmentKind = (equipment: OceanEquipment): "dry" | "reefer" => (equipment.endsWith("RF") ? "reefer" : "dry");

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A quote's container line as an ocean tariff prices it. */
export interface OceanContainer {
  type: string;
  qty: number;
  equipment: OceanEquipment;
}

/** Where a surcharge would be added: the rate's table, its port of discharge, and what the quote is. */
export interface SurchargeContext {
  table: number;
  podCode: string;
  dangerous: boolean;
}

/** Whether a surcharge applies to a rate: "yes", "no", or "manual" for one only charged on a booking made by hand. */
export function surchargeApplies(s: OceanSurcharge, ctx: SurchargeContext): "yes" | "no" | "manual" {
  const country = ctx.podCode.slice(0, 2);
  if (s.tables.length && !s.tables.includes(ctx.table)) return "no";
  if (s.countries.length && !s.countries.includes(country)) return "no";
  if (s.exceptCountries.includes(country)) return "no";
  if (s.ports.length && !s.ports.includes(ctx.podCode)) return "no";
  if (s.exceptPorts.includes(ctx.podCode)) return "no";
  if (s.condition === "dangerous" && !ctx.dangerous) return "no";
  if (s.condition === "manual_booking") return "manual";
  return "yes";
}

/** How many of a surcharge's basis the containers make: TEU or containers (of its equipment kind), or 1 per B/L or booking; 0 when none of them is of its kind. */
export function surchargeUnits(s: OceanSurcharge, containers: readonly OceanContainer[]): number {
  const counted = containers.filter((c) => !s.equipment.length || s.equipment.includes(equipmentKind(c.equipment)));
  if (!counted.length) return 0;
  if (s.basis === "teu") return counted.reduce((sum, c) => sum + c.qty * teuOf(c.equipment), 0);
  if (s.basis === "container") return counted.reduce((sum, c) => sum + c.qty, 0);
  return 1;
}

export type RateOffer =
  | { ok: true; lines: OceanOfferLine[]; freight: number; surcharges: OceanOfferSurcharge[]; manual: string[]; totals: { currency: string; amount: number }[] }
  | { ok: false; missing: string };

/**
 * What a rate row asks for the containers: every container at the row's price for its equipment
 * (refused with the first type it has no price for), and each surcharge that applies, with its
 * units. The ones only charged on a manual booking are named apart, not added. Totals per currency.
 */
export function rateOffer(
  rate: { prices: Partial<Record<OceanEquipment, number>>; currency: string },
  containers: readonly OceanContainer[],
  surcharges: readonly OceanSurcharge[],
  ctx: SurchargeContext,
): RateOffer {
  const lines: OceanOfferLine[] = [];
  for (const c of containers) {
    const price = rate.prices[c.equipment];
    if (price === undefined) return { ok: false, missing: c.type };
    lines.push({ type: c.type, qty: c.qty, equipment: c.equipment, price, amount: round2(price * c.qty) });
  }
  const freight = round2(lines.reduce((sum, l) => sum + l.amount, 0));
  const added: OceanOfferSurcharge[] = [];
  const manual: string[] = [];
  for (const s of surcharges) {
    const applies = surchargeApplies(s, ctx);
    if (applies === "no") continue;
    const units = surchargeUnits(s, containers);
    if (!units) continue;
    if (applies === "manual") {
      manual.push(s.name);
      continue;
    }
    added.push({ name: s.name, code: s.code, charge: s.charge, basis: s.basis, units, rate: s.amount, total: round2(s.amount * units), currency: s.currency });
  }
  const byCurrency = new Map<string, number>([[rate.currency, freight]]);
  for (const s of added) byCurrency.set(s.currency, round2((byCurrency.get(s.currency) ?? 0) + s.total));
  return { ok: true, lines, freight, surcharges: added, manual, totals: [...byCurrency].map(([currency, amount]) => ({ currency, amount })) };
}
