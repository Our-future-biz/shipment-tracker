import { ErrCode, isAPIError } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";

// A pre-alert read again: what the company made from it already. The server says which houses have
// a live shipment and which master job has the Master B/L (extraction asks Shipments on every
// answer), and refuses a second shipment of a House B/L (409). The review shows such a house as
// created, links to its job and creates nothing; the houses go to the master job that has the MBL.

export type MadeAlready = interfaces.ReadingMadeAlready;

const MASTER_BOL = "Master BoL Number";

/** For each house of a batch answer, in step with its shipments: the shipment made already, or null. */
export function housesMadeAlready(res: Pick<interfaces.ExtractHblResult, "shipments" | "existing">): (MadeAlready | null)[] {
  return (res.shipments ?? []).map((_, i) => res.existing?.[i] ?? null);
}

/** The shipment a refused create names (409: its House B/L has one already), or null for any other failure. */
export function houseRefusedAsMade(err: unknown): MadeAlready | null {
  if (!isAPIError(err) || err.code !== ErrCode.AlreadyExists) return null;
  const { shipmentId, jobNumber } = (err.details ?? {}) as { shipmentId?: unknown; jobNumber?: unknown };
  return typeof shipmentId === "string" && typeof jobNumber === "string" ? { id: shipmentId, number: jobNumber } : null;
}

/** The job numbers of the houses made before, each once, in the order met. */
export function madeAlreadyNumbers(existing: readonly (MadeAlready | null)[]): string[] {
  return [...new Set(existing.flatMap((e) => (e ? [e.number] : [])))];
}

/** The Master B/L a new master job is asked for: the one read, when it is ticked to be filed onto it. */
export function masterBolToFile(info: Record<string, string> | null, ticked: Record<string, boolean>): string {
  return info && ticked[MASTER_BOL] ? (info[MASTER_BOL] ?? "").trim() : "";
}
