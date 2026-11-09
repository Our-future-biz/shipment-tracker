import { isPlainObject } from "./quoteDocument.utils";

// A rail or ocean tariff is for import, export or both (Tariffs), and prices a quote only in the
// quote's Trade Direction. A buying line priced from one remembers the direction it was priced in
// (pricedDirection, set by the web's tariffRecheck stampDirection): once the quote's Trade Direction
// is another, its tariff is picked again or the line removed before the quote goes out - the same
// moves the margin and Shipping terms gates hold. Collection tariffs have no direction; lines priced
// before the direction was remembered are not known and not held.

const DIRECTION_PRICED = ["rail:", "ocean:"];

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const directionOf = (data: Record<string, unknown>): "import" | "export" | null => {
  const direction = text(data.direction);
  return direction === "Import" ? "import" : direction === "Export" ? "export" : null;
};

/** A road pricing settles a road rate that waited: the document keys that say so; none when nothing waited. */
export function withoutRoadUpdates(data: Record<string, unknown>): { tariffUpdates?: unknown[] } {
  if (!Array.isArray(data.tariffUpdates)) return {};
  return { tariffUpdates: data.tariffUpdates.filter((u) => !isPlainObject(u) || u.kind !== "road") };
}

/**
 * Why the quote can't go out for a new tariff rate not approved yet (lib/tariffOvernight); null when
 * none waits. A rate waits while a buying line is still priced from the lapsed tariff - a selling line
 * copied from it may keep its tag - and a road rate while the quote has road lines (twin of the web's
 * sales/_lib/tariffUpdates.ts waitingTariffUpdates).
 */
export function tariffUpdateGateMessage(data: unknown): string | null {
  if (!isPlainObject(data) || !Array.isArray(data.tariffUpdates)) return null;
  const linesOf = (side: unknown) => (Array.isArray(side) ? side.filter(isPlainObject) : []);
  const buyingRefs = new Set(linesOf(data.buyingLines).map((line) => text(line.tariffRef)));
  const hasRoadLine = [...linesOf(data.buyingLines), ...linesOf(data.sellingLines)].some((line) => text(line.tariffRef).startsWith("trucking:"));
  const waiting = data.tariffUpdates.filter(isPlainObject).filter((u) => (u.kind === "road" ? hasRoadLine : buyingRefs.has(text(u.oldRef))));
  if (!waiting.length) return null;
  return `${waiting.length === 1 ? "A tariff has" : `${waiting.length} tariffs have`} a new rate — approve it in Pricing, or pick another tariff, before the quote goes out`;
}

/** Why the quote can't go out for its lines priced in another Trade Direction than it has now; null when none is. */
export function tariffDirectionGateMessage(data: unknown): string | null {
  if (!isPlainObject(data) || !Array.isArray(data.buyingLines)) return null;
  const direction = directionOf(data);
  const other = data.buyingLines.filter(isPlainObject).filter((line) => {
    const ref = text(line.tariffRef);
    const priced = line.pricedDirection;
    return DIRECTION_PRICED.some((p) => ref.startsWith(p)) && (priced === "import" || priced === "export") && priced !== direction;
  });
  if (!other.length) return null;
  const was = other[0]!.pricedDirection === "import" ? "an import" : "an export";
  const now = direction ? `now an ${direction}` : "without a Trade Direction";
  const lines = other.length === 1 ? "A buying line was" : `${other.length} buying lines were`;
  return `${lines} priced from ${was} tariff, and the quote is ${now} — pick the tariff again under Tariffs available, or remove the line${other.length === 1 ? "" : "s"}`;
}
