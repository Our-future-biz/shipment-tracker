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

// A B/L number as two are compared (as the server's billOfLadingKey): letters and digits, upper case.
const bolKey = (ref: string | undefined) => (ref ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * The Master B/L the houses read name, when every house names one and the same; "" otherwise. Review of
 * system-22: a house naming none no longer leaves it to the others (one misread B/L was "named by every House
 * B/L" and took every house to its consolidation). The server's copy (extraction pipeline) has the same rule.
 */
export function housesMasterBol(houses: readonly Record<string, string>[]): string {
  const named = houses.map((h) => (h[MASTER_BOL] ?? "").trim());
  return named.length > 0 && named.every((b) => bolKey(b)) && new Set(named.map(bolKey)).size === 1 ? (named[0] ?? "") : "";
}

/**
 * The Master B/L of the houses the review shows ("Master B/L from the houses"), ticked to be filed like a read
 * one: only when no Master B/L number was read, and every house names the same one ("" when one names none or two differ).
 */
export function housesMasterBolShown(info: Record<string, string> | null, houses: readonly Record<string, string>[]): string {
  return bolKey(info?.[MASTER_BOL]) ? "" : housesMasterBol(houses);
}

/**
 * The Master B/L a new master job is asked for: the one read, when it is ticked to be filed onto it.
 * With no Master B/L number read (no Master B/L page), the one the houses agree on (mock test run F3:
 * the master job was made without it, so a second read found none and offered a second master job),
 * when it is left ticked on the review (`housesTicked`; mock test run F3, m1: it was used unseen).
 */
export function masterBolToFile(
  info: Record<string, string> | null,
  ticked: Record<string, boolean>,
  houses: readonly Record<string, string>[] = [],
  housesTicked = true,
): string {
  if (!bolKey(info?.[MASTER_BOL])) return housesTicked ? housesMasterBol(houses) : "";
  return ticked[MASTER_BOL] ? (info?.[MASTER_BOL] ?? "").trim() : "";
}

/**
 * Of the Master B/L a new master job is asked for (`filed`, masterBolToFile's answer): the one taken from the
 * houses, kept with the batch's master job for its summary; "" when it is the one read from a Master B/L page.
 */
export function housesMblFiled(info: Record<string, string> | null, filed: string): string {
  return bolKey(info?.[MASTER_BOL]) ? "" : filed.trim();
}

/**
 * The summary's line on the houses' Master B/L the batch's master job was made with or found by (kept when it
 * was, review of system-22: worked out again from every house loaded at the end, a later batch naming another
 * B/L dropped it from a master job made with it).
 */
export function housesMblNote(filed: string | undefined): string {
  return filed ? `Master B/L ${filed} taken from the House B/Ls` : "";
}

/**
 * The Master B/Ls the houses loaded name other than `filed` (the one taken from the houses), each once, as read
 * first: a later batch's houses under another consolidation (review of system-22). None when none was filed.
 */
export function otherHousesMbls(filed: string, houses: readonly Record<string, string>[]): string[] {
  if (!bolKey(filed)) return [];
  const others = new Map<string, string>();
  for (const h of houses) {
    const bol = (h[MASTER_BOL] ?? "").trim();
    const key = bolKey(bol);
    if (key && key !== bolKey(filed) && !others.has(key)) others.set(key, bol);
  }
  return [...others.values()];
}
