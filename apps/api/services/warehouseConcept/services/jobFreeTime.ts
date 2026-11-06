import log from "encore.dev/log";
import { shipments } from "~encore/clients";
import { serviceActor } from "../../../lib/outbox/serviceIdentity";

/** A number as Shipments stores it: "MSKU 611 902-7" is MSKU6119027. */
const canonical = (number: string) => number.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * The carrier's last free day from the job, by the warehouse's own spelling of the number (Council
 * Outlay 8, D21). Shipments being away must not take the warehouse's lists with it: they then show
 * what was typed here.
 */
export async function jobFreeTime(companyId: string, numbers: readonly string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(numbers.map(canonical).filter(Boolean))];
  if (wanted.length === 0) return new Map();
  try {
    const authData = await serviceActor(companyId);
    const { items } = await shipments._internalFreeTimeByContainer({ numbers: wanted }, { authData });
    const byCanonical = new Map(items.map((i) => [i.containerNumber, i.lastFreeDay]));
    return new Map(numbers.flatMap((n) => {
      const day = byCanonical.get(canonical(n));
      return day ? [[n, day] as const] : [];
    }));
  } catch (err) {
    log.warn(err, "warehouse: could not read free time from Shipments");
    return new Map();
  }
}
