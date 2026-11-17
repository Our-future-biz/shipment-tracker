import type { ShipmentItem } from "@/hooks/useShipments";

// A master job's reference: "MCZ", the letters of its Load Type once it has one, and the company's
// number - MCZ00000008, MCZCONSOL00000007, MCZFULL00000006, MCZPROJECT00000004. Which letters a job
// gets is the API's to decide (services/shipments/lib/masterJobNumber).
const MCZ_NUMBER = /^MCZ(?:CONSOL|FULL|PROJECT)?(\d+)/;

const mczDigits = (mcz: string | null | undefined): string | null => MCZ_NUMBER.exec(mcz ?? "")?.[1] ?? null;

/** Orders references by their number (the order they were made in), whatever their letters. */
export function compareMczNumbers(a: string, b: string): number {
  const [x, y] = [mczDigits(a), mczDigits(b)];
  return x !== null && y !== null && Number(x) !== Number(y) ? Number(x) - Number(y) : a.localeCompare(b);
}

/**
 * Whether two references name the same master job: a plain MCZ00000007 held on a screen is still
 * that job once its Load Type has made it MCZCONSOL00000007.
 */
export function sameMczNumber(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a === b) return true;
  const x = mczDigits(a);
  return x !== null && x === mczDigits(b);
}

// A search typed as a reference, with its letters or without, in any case: its digits.
const MCZ_SEARCH = /^MCZ(?:CONSOL|FULL|PROJECT)?(\d+)$/;

/**
 * Whether a master job's reference is found by the text typed: by any part of it, in any case, or
 * as a reference with other letters or none - mcz00000007 finds MCZCONSOL00000007, as the main
 * search does, and digits still being typed find the numbers they start.
 */
export function matchesMczSearch(mcz: string, search: string): boolean {
  const q = search.trim().toUpperCase();
  if (!q || mcz.toUpperCase().includes(q)) return true;
  const digits = MCZ_SEARCH.exec(q)?.[1];
  return digits !== undefined && (mczDigits(mcz)?.startsWith(digits) ?? false);
}

// `masterJobs` are the MCZ numbers of every master job on the server: one created
// on the Master Jobs page has no shipments yet, so the shipments alone miss it.
export function nextMczNumber(shipments: ShipmentItem[], masterJobs: string[] = []): string {
  let max = 0;
  for (const mn of [...shipments.map((s) => s.masterJobMczNumber), ...masterJobs]) {
    const num = Number(mczDigits(mn) ?? 0);
    if (num > max) max = num;
  }
  return `MCZ${String(max + 1).padStart(8, "0")}`;
}

export function existingMczNumbers(shipments: ShipmentItem[], masterJobs: string[] = []): string[] {
  const set = new Set<string>();
  for (const mn of [...shipments.map((s) => s.masterJobMczNumber), ...masterJobs]) {
    if (mn && mn.startsWith("MCZ")) set.add(mn);
  }
  return Array.from(set).sort(compareMczNumbers);
}
