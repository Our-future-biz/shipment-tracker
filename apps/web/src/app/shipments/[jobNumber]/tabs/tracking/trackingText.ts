import type { ShipmentItem } from "@/hooks/useShipments";
import type { TrackingMilestone, TrackingTaxDate } from "@/hooks/useShipmentTracking";
import { formatDate } from "@/lib/date";
import { shipmentEmailSubject } from "../../../_lib/shipmentEmail";

// The Tracking tab's sentences. Pure, so they are unit-tested.

const SEPARATOR = " · ";
const CONTAINERS_NAMED = 3;

/** The one line to read out on the phone or paste into a message. */
export function trackingStatusLine(shipment: ShipmentItem, milestones: readonly TrackingMilestone[]): string {
  const row = (key: string) => milestones.find((m) => m.key === key);
  const dated = (actualName: string, plannedName: string, m: TrackingMilestone | undefined) => {
    if (m?.actual) return `${actualName} ${formatDate(m.actual)}`;
    if (!m?.planned) return "";
    return `${plannedName} ${formatDate(m.planned)}${m.wasPlanned ? ` (was ${formatDate(m.wasPlanned)})` : ""}`;
  };

  const containers = (shipment.containers ?? []).map((c) => c.containerNumber).filter(Boolean);
  const named = containers.slice(0, CONTAINERS_NAMED).join(", ");
  const more = containers.length > CONTAINERS_NAMED ? ` +${containers.length - CONTAINERS_NAMED}` : "";
  const last = [...milestones].filter((m) => m.actual).reduce<TrackingMilestone | null>((latest, m) => (!latest || m.actual! >= latest.actual! ? m : latest), null);

  return [
    shipmentEmailSubject(shipment),
    [shipment.freightMode, shipment.tradeDirection].filter(Boolean).join(" "),
    named && `${named}${more}`,
    [shipment.pol, shipment.pod].filter(Boolean).join(" → "),
    dated("ATD", "ETD", row("departed")),
    dated("ATA", "ETA", row("arrived")),
    last ? `last: ${last.label} ${formatDate(last.actual)}` : "",
  ]
    .filter(Boolean)
    .join(SEPARATOR);
}

/** "ETA moved 7 days later", as a mark. */
export const movedDaysLabel = (days: number): string => `${days > 0 ? "+" : "−"}${Math.abs(days)} d`;

const BASIS_NAME: Record<TrackingTaxDate["basis"], string> = {
  ata: "ATA",
  atd: "ATD",
  eta: "ETA",
  etd: "ETD",
  delivery: "delivery",
  plannedDelivery: "planned delivery",
  none: "",
};

/** The date that would fix a provisional tax date. */
const ACTUAL_OF: Partial<Record<TrackingTaxDate["basis"], string>> = {
  eta: "ATA",
  etd: "ATD",
  plannedDelivery: "delivery",
};

/** The job's rates as far as this line needs them. */
export interface TaxDateRates {
  status: "locked" | "provisional";
  ratesMissing: boolean;
  rateDate: string;
  previousRateDate: string | null;
}

/** What the invoice is taxed by, whether that is firm, and what the rates and an invoice make of it. */
export function taxDateParts(tax: TrackingTaxDate, rates: TaxDateRates | undefined): string[] {
  const invoiced = tax.invoiced === true;
  let date: string;
  if (!tax.date) date = "No tax date (DUZP) yet: no date on this job says it";
  else if (tax.actual) date = `Tax date (DUZP) = ${BASIS_NAME[tax.basis]} ${formatDate(tax.date)}`;
  // An issued invoice holds its own tax date, whatever the estimate says now.
  else if (invoiced) date = `Invoiced with no ${ACTUAL_OF[tax.basis]} recorded: the invoice holds its own tax date (DUZP)`;
  else date = `Tax date (DUZP): provisional by ${BASIS_NAME[tax.basis]} ${formatDate(tax.date)}, the ${ACTUAL_OF[tax.basis]} fixes it`;

  const fx = !rates
    ? ""
    : rates.ratesMissing
      ? "ČNB rate missing for this date"
      : rates.status === "locked"
        ? `ČNB rates locked for ${formatDate(rates.rateDate)}${rates.previousRateDate ? ` (re-locked from ${formatDate(rates.previousRateDate)})` : ""}`
        : `ČNB rates provisional, ${formatDate(rates.rateDate)}`;

  const invoice = !invoiced ? "" : tax.actual ? "Invoiced: final, credit the invoice first to change it" : "Credit the invoice first to set it";
  return [date, fx, invoice].filter(Boolean);
}
