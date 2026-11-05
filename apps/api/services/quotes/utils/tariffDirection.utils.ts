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
