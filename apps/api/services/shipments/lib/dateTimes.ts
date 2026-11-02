import { APIError } from "encore.dev/api";

// The times beside a shipment's (and master job's) dates — closings, AMS / ISF deadlines, pick-up,
// planned delivery, equipment delivery: each date keeps its own column, and its time, when known,
// sits beside it as "HH:MM" (24 h); "" = none.
export const TIME_FIELDS = [
  "closingTime",
  "vgmClosingTime",
  "siClosingTime",
  "amsDeadlineTime",
  "isfDeadlineTime",
  "pickupTime",
  "plannedDeliveryTime",
  "equipmentDeliveryTime",
] as const;

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Refuses a time that is not "HH:MM" (values read off a document reach here too). */
export function assertTimes(data: Record<string, unknown>): void {
  for (const field of TIME_FIELDS) {
    const value = data[field];
    if (typeof value === "string" && value !== "" && !HH_MM.test(value)) {
      throw APIError.invalidArgument(`${field} must be a time as "HH:MM"`);
    }
  }
}

/** Each date that keeps a time, and the field its time is in. */
const DATE_TIME_PAIRS: Record<string, (typeof TIME_FIELDS)[number]> = {
  closingDate: "closingTime",
  vgmClosing: "vgmClosingTime",
  siClosing: "siClosingTime",
  amsDeadline: "amsDeadlineTime",
  isfDeadline: "isfDeadlineTime",
  pickupDate: "pickupTime",
  plannedDeliveryDate: "plannedDeliveryTime",
  equipmentDeliveryDate: "equipmentDeliveryTime",
};

/**
 * A date moved to another day without a time of its own (a document read, a master job's date
 * copied onto a shipment) loses the time it had: that time was the old day's. Called on a write's
 * values, with the record as stored.
 */
export function clearStaleTimes(data: Record<string, unknown>, existing: Record<string, unknown>): void {
  for (const [date, time] of Object.entries(DATE_TIME_PAIRS)) {
    if (!(date in data) || time in data || !existing[time]) continue;
    if ((data[date] ?? null) !== (existing[date] ?? null)) data[time] = "";
  }
}
