// A job's POL and POD as its screens show them. Pure, so it is unit-tested.

import { seaPortText } from "../../../lib/geo/carrierPorts";
import { freightKindOf } from "./trackingEvents";

/**
 * A job's stored place text as the job shows it (lib/geo/carrierPorts seaPortText): by sea, a carrier
 * code saved before the pickers named it reads by its port's name ("Shanghai (CNSHA)"), stored as it is.
 * By sea as lib/trackingEvents freightKindOf judges the job - its direction and Department too, as the
 * field defaults do (lib/fieldDefaults) - so a Domestic or Road Department job whose Freight Mode says
 * "Sea Freight" goes by road, and its CNSHA stays the airport (review of system-22). And only while the
 * Freight Mode says sea, as before: a job with none counts as sea, but nothing says it sails.
 */
export function jobPortText(
  text: string | null | undefined,
  job: { freightMode?: string | null; tradeDirection?: string | null; department?: string | null },
): string {
  const bySea = freightKindOf({ freightMode: job.freightMode ?? "", tradeDirection: job.tradeDirection ?? "", department: job.department }) === "sea";
  return bySea ? seaPortText(text, job.freightMode) : (text ?? "");
}
