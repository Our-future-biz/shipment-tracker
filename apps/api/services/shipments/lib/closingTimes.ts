import { APIError } from "encore.dev/api";

// The times beside a shipment's (and master job's) closings and AMS / ISF deadlines: each date
// keeps its own column, and its time, when known, sits beside it as "HH:MM" (24 h); "" = none.
export const TIME_FIELDS = ["closingTime", "vgmClosingTime", "siClosingTime", "amsDeadlineTime", "isfDeadlineTime"] as const;

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Refuses a time that is not "HH:MM" (values read off a document reach here too). */
export function assertClosingTimes(data: Record<string, unknown>): void {
  for (const field of TIME_FIELDS) {
    const value = data[field];
    if (typeof value === "string" && value !== "" && !HH_MM.test(value)) {
      throw APIError.invalidArgument(`${field} must be a time as "HH:MM"`);
    }
  }
}
