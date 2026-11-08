// The overnight check of the tariffs behind the buying lines of quotes not yet sent. A line whose
// tariff is still valid stays. One whose tariff has lapsed is moved to the rate now in force of the
// same tariff: quietly when the money is the same, and only after the user's approval when it is
// not (tariffUpdates, the Approve button in Pricing). With no such rate the lines go, with the
// selling lines made from them.

export const TARIFF_CHECK_AUTHOR_ID = "00000000-0000-0000-0000-000000000000";
export const TARIFF_CHECK_AUTHOR_NAME = "Tariff check";

export type TariffKind = "ocean" | "rail" | "collection";
export const ROAD_REF_PREFIX = "trucking:";
export interface Money {
  currency: string;
  amount: number;
}

/** A new rate waiting for the user's approval. Twin of TariffUpdate in the web's Sales types. */
export interface TariffUpdate {
  oldRef: string;
  kind: TariffKind | "road";
  newVersionId: string;
  newRateId: string | null;
  supplierName: string;
  /** On a road quote the selling price, which its tariff also sets */
  was: Money[];
  now: Money[];
  /** On a road quote with a haulier: its buying price */
  buyWas?: Money[];
  buyNow?: Money[];
}

/** The tariff side of a road pricing (data.roadPricing): only what a quiet move to a new version changes. */
export interface RoadSide {
  tariffVersionId: string;
  versionNo: number;
  currency: string;
  total: number;
}

export interface OfferSummary {
  versionId: string;
  rateId: string | null;
  tariffId: string;
  supplierName: string;
  via: string;
  totals: Money[];
}

export type TariffAction =
  | { ref: string; do: "keep" }
  | { ref: string; do: "swap"; newRef: string }
  | { ref: string; do: "update"; update: TariffUpdate }
  | { ref: string; do: "remove" }
  | { ref: string; do: "roadRemove" }
  | { ref: string; do: "roadSwap"; sell: RoadSide; buy: RoadSide | null };

type Doc = Record<string, unknown>;
type Line = Doc & { tariffRef?: unknown };

const isObject = (v: unknown): v is Doc => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => Number(v) || 0;
const linesOf = (data: Doc, key: "buyingLines" | "sellingLines"): Line[] => (Array.isArray(data[key]) ? data[key].filter(isObject) : []);
const cents = (n: number) => Math.round(n * 100) / 100;

export function tariffKindOf(ref: string): TariffKind | null {
  const kind = ref.split(":")[0];
  return kind === "ocean" || kind === "rail" || kind === "collection" ? kind : null;
}

/** Every tariff behind the quote's buying lines, once. */
export function tariffRefsOf(data: Doc): string[] {
  return [...new Set(linesOf(data, "buyingLines").map((l) => text(l.tariffRef)).filter((ref) => tariffKindOf(ref) !== null))];
}

// ─── The route a quote asks the tariffs for: twins of the web's oceanRouteOf, railRouteOf, collectionRouteOf ───

const LOCODE = /\(([A-Z]{2}[A-Z0-9]{3})\)\s*$/;
const PLACE_COUNTRY = /\s*\(([A-Z]{2})(?:[A-Z0-9]{3}(?:[A-Z0-9]{2,6})?|-(?:DP|IT|RR)[0-9]{1,4})\)\s*$/;
const POSTCODE = /(?:^|\D)(\d{3}) ?(\d{2})(?!\d)/;

const directionOf = (data: Doc): "import" | "export" | null => (data.direction === "Import" ? "import" : data.direction === "Export" ? "export" : null);
const containerType = (type: unknown) => text(type).replace(/^(\d\d')\s*GP$/i, "$1 DC");
const objects = (v: unknown): Doc[] => (Array.isArray(v) ? v.filter(isObject) : []);

function boxesOf(data: Doc): { type: string; qty: number; weight: number }[] {
  if (data.serviceType !== "Sea FCL") return [];
  return objects(data.containers)
    .map((c) => ({ type: containerType(c.type), qty: Math.floor(num(c.qty)), weight: num(c.weight) }))
    .filter((c) => c.type && c.qty > 0);
}

/** What to ask the tariffs for this kind of line, today; null when the quote can't be asked for it. */
export function offersRequestOf(kind: TariffKind, data: Doc, date: string): Doc | null {
  const direction = directionOf(data);
  if (kind === "ocean") {
    const polCode = LOCODE.exec(text(data.pol))?.[1];
    const podCode = LOCODE.exec(text(data.pod))?.[1];
    const containers = boxesOf(data).map(({ type, qty }) => ({ type, qty }));
    if (!direction || data.serviceType !== "Sea FCL" || !polCode || !podCode || !containers.length) return null;
    return { ocean: { direction, polCode, podCode, comparePols: false, date, containers, dangerous: !!data.dangerous } };
  }
  if (kind === "rail") {
    if (!direction) return null;
    const port = LOCODE.exec(text(direction === "import" ? data.pod : data.pol))?.[1];
    const address = text(direction === "import" ? data.delivery : data.pickup);
    const town = text(direction === "import" ? data.destination : data.origin);
    const country = PLACE_COUNTRY.exec(town)?.[1] ?? "CZ";
    const postcode = POSTCODE.exec(address);
    const place = postcode ? (country === "CZ" ? `${postcode[1]} ${postcode[2]}` : `${postcode[1]}${postcode[2]}`) : town.replace(PLACE_COUNTRY, "").trim();
    const containers = boxesOf(data).map((c) => ({ type: c.type, qty: c.qty, cargoKg: c.weight > 0 ? c.weight : null }));
    if (!port || !place || !containers.length) return null;
    return { rail: { port, direction, place, country, date, containers } };
  }
  const freightMode = data.serviceType === "Sea LCL" ? "sea_lcl" : data.serviceType === "Air" ? "air" : null;
  const postcode = POSTCODE.exec(text(data.direction === "Export" ? data.pickup : data.delivery));
  if (!freightMode || !postcode) return null;
  const packages = objects(data.packages);
  const linesWeight = packages.reduce((sum, p) => sum + num(p.qty) * num(p.weight), 0);
  const linesCcm = packages.reduce((sum, p) => sum + num(p.qty) * num(p.length) * num(p.width) * num(p.height), 0);
  const weightKg = linesWeight > 0 ? linesWeight : num(data.weight);
  const cbm = linesCcm > 0 ? linesCcm / 1_000_000 : num(data.cbm);
  const longest = Math.max(0, ...packages.flatMap((p) => [num(p.length), num(p.width), num(p.height)]));
  if (!(weightKg > 0) && !(cbm > 0)) return null;
  return {
    collection: {
      freightMode,
      customerPostcode: `${postcode[1]}${postcode[2]}`,
      date,
      weightKg: weightKg > 0 ? weightKg : null,
      cbm: cbm > 0 ? cbm : null,
      longestCm: longest > 0 ? longest : null,
    },
  };
}

// ─── What becomes of a lapsed tariff ───

function totalsOf(lines: Line[]): Money[] {
  const byCurrency = new Map<string, number>();
  for (const line of lines) {
    const currency = text(line.currency);
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + num(line.amount));
  }
  return [...byCurrency].map(([currency, amount]) => ({ currency, amount: cents(amount) })).sort((a, b) => a.currency.localeCompare(b.currency));
}

const sorted = (totals: Money[]) => totals.map((t) => ({ currency: t.currency, amount: cents(t.amount) })).sort((a, b) => a.currency.localeCompare(b.currency));
const sameMoney = (a: Money[], b: Money[]) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

/** The action for a tariff that is no longer valid: the current rate of the same tariff, or removal. */
export function actionForLapsed(ref: string, data: Doc, tariffId: string | null, offers: OfferSummary[]): TariffAction {
  const kind = tariffKindOf(ref)!;
  const lines = linesOf(data, "buyingLines").filter((l) => text(l.tariffRef) === ref);
  const same = tariffId ? offers.filter((o) => o.tariffId === tariffId) : [];
  const description = lines.map((l) => text(l.description)).join(" ");
  const offer = same.find((o) => o.via && description.includes(o.via)) ?? same[0];
  if (!offer) return { ref, do: "remove" };
  const newRef = offer.rateId ? `${kind}:${offer.versionId}:${offer.rateId}` : `${kind}:${offer.versionId}`;
  const was = totalsOf(lines);
  if (sameMoney(was, offer.totals)) return { ref, do: "swap", newRef };
  return { ref, do: "update", update: { oldRef: ref, kind, newVersionId: offer.versionId, newRateId: offer.rateId, supplierName: offer.supplierName, was, now: sorted(offer.totals) } };
}

const money = (totals: Money[]) => totals.map((t) => `${t.currency} ${t.amount.toFixed(2)}`).join(" + ");

// ─── Road: both sides of the price come from the trucking tariffs ───

interface StoredRoadPricing {
  serviceLevel: string;
  sell: RoadSide & { tariffName?: string };
  buy: (RoadSide & { haulierCustomerId?: string; haulierName?: string }) | null;
}

/** The road pricing of a quote that still has lines priced from it; null otherwise. */
export function roadPricingOf(data: Doc): StoredRoadPricing | null {
  const pricing = data.roadPricing;
  if (!isObject(pricing) || !isObject(pricing.sell) || !isObject(data.road)) return null;
  const priced = [...linesOf(data, "buyingLines"), ...linesOf(data, "sellingLines")].some((l) => text(l.tariffRef).startsWith(ROAD_REF_PREFIX));
  return priced ? (pricing as unknown as StoredRoadPricing) : null;
}

/** The day to rate a road quote on: its pickup date, or today once that has passed or when it has none. */
export const roadRatingDay = (pickupDate: unknown, today: string) => (typeof pickupDate === "string" && pickupDate > today ? pickupDate : today);

const sideMoney = (side: Pick<RoadSide, "currency" | "total">): Money[] => [{ currency: side.currency, amount: cents(side.total) }];
const sameSide = (a: RoadSide | null, b: RoadSide | null) => (!a || !b ? !a && !b : sameMoney(sideMoney(a), sideMoney(b)));

/**
 * What becomes of a road quote's pricing. `rated` is what the tariffs give today, null when they
 * can't price it; `versionsValid` whether the versions it was priced from are still binding. A quote
 * that can't be rated for any other reason than a lapsed tariff is left alone.
 */
export function roadActionFor(pricing: StoredRoadPricing, rated: { sell: RoadSide; buy: RoadSide | null } | null, versionsValid: boolean): TariffAction {
  const ref = "road";
  if (!rated) return versionsValid ? { ref, do: "keep" } : { ref, do: "roadRemove" };
  const buy = pricing.buy ? rated.buy : null;
  const sameVersions = rated.sell.tariffVersionId === pricing.sell.tariffVersionId && buy?.tariffVersionId === pricing.buy?.tariffVersionId;
  if (sameSide(rated.sell, pricing.sell) && sameSide(buy, pricing.buy)) return sameVersions ? { ref, do: "keep" } : { ref, do: "roadSwap", sell: rated.sell, buy };
  return {
    ref,
    do: "update",
    update: {
      oldRef: `${ROAD_REF_PREFIX}${pricing.sell.tariffVersionId}:${pricing.serviceLevel}`,
      kind: "road",
      newVersionId: rated.sell.tariffVersionId,
      newRateId: null,
      supplierName: pricing.sell.tariffName || "road",
      was: sideMoney(pricing.sell),
      now: sideMoney(rated.sell),
      ...(pricing.buy && buy ? { buyWas: sideMoney(pricing.buy), buyNow: sideMoney(buy) } : {}),
    },
  };
}

function roadUpdateMessage(update: TariffUpdate): string {
  const buying = update.buyWas && update.buyNow ? ` Buying was ${money(update.buyWas)}, now ${money(update.buyNow)}.` : "";
  return `The road tariff "${update.supplierName}" has a new rate. Selling was ${money(update.was)}, now ${money(update.now)}.${buying} Approve it in Pricing: the quote can't be sent until then. Approving changes the selling price too.`;
}

/** The quote after the night's actions, what to tell the user, and whether anything changed. */
export function applyTariffActions(data: Doc, actions: TariffAction[]): { data: Doc; messages: string[]; changed: boolean } {
  let buying = linesOf(data, "buyingLines");
  let selling = linesOf(data, "sellingLines");
  const before = Array.isArray(data.tariffUpdates) ? (data.tariffUpdates as TariffUpdate[]) : [];
  const updates: TariffUpdate[] = [];
  const messages: string[] = [];
  let linesChanged = false;
  let road: Doc | null | undefined;

  const isRoad = (l: Line) => text(l.tariffRef).startsWith(ROAD_REF_PREFIX);
  for (const action of actions) {
    if (action.do === "roadRemove") {
      buying = buying.filter((l) => !isRoad(l));
      selling = selling.filter((l) => !isRoad(l));
      linesChanged = true;
      road = null;
      messages.push("The road tariff of this quote is no longer valid and no current rate replaces it, so its road buying and selling lines were removed. Price the road transport again in Pricing.");
      continue;
    }
    if (action.do === "roadSwap") {
      const level = text((data.roadPricing as Doc).serviceLevel);
      const moved = (side: RoadSide | null) => (l: Line) => (isRoad(l) && side ? { ...l, tariffRef: `${ROAD_REF_PREFIX}${side.tariffVersionId}:${level}` } : l);
      buying = buying.map(moved(action.buy));
      selling = selling.map(moved(action.sell));
      linesChanged = true;
      const stored = data.roadPricing as Doc;
      const version = (side: RoadSide) => ({ tariffVersionId: side.tariffVersionId, versionNo: side.versionNo });
      road = { ...stored, sell: { ...(stored.sell as Doc), ...version(action.sell) }, ...(action.buy ? { buy: { ...(stored.buy as Doc), ...version(action.buy) } } : {}) };
      continue;
    }
    const lines = buying.filter((l) => text(l.tariffRef) === action.ref);
    const name = text(lines[0]?.description) || text(lines[0]?.type) || "a buying line";
    if (action.do === "swap") {
      buying = buying.map((l) => (text(l.tariffRef) === action.ref ? { ...l, tariffRef: action.newRef } : l));
      linesChanged = true;
    } else if (action.do === "remove") {
      const pairs = new Set(lines.map((l) => text(l.pairId)).filter(Boolean));
      buying = buying.filter((l) => text(l.tariffRef) !== action.ref);
      selling = selling.filter((l) => !pairs.has(text(l.pairId)));
      linesChanged = true;
      messages.push(`The tariff behind "${name}" is no longer valid and no current rate replaces it, so its buying and selling lines were removed from this quote. Pick a new tariff under Tariffs available.`);
    } else if (action.do === "update") {
      updates.push(action.update);
      const known = before.find((u) => u.oldRef === action.update.oldRef);
      const buyMoved = !sameMoney(known?.buyNow ?? [], action.update.buyNow ?? []);
      if (!known || known.newVersionId !== action.update.newVersionId || known.newRateId !== action.update.newRateId || !sameMoney(known.now, action.update.now) || buyMoved) {
        messages.push(
          action.update.kind === "road"
            ? roadUpdateMessage(action.update)
            : `The ${action.update.supplierName} tariff behind "${name}" has a new rate: was ${money(action.update.was)}, now ${money(action.update.now)}. Approve it in Pricing: the quote can't be sent until then. The selling price has not changed.`,
        );
      }
    }
  }

  const next: Doc = { ...data };
  if (linesChanged) {
    next.buyingLines = buying;
    next.sellingLines = selling;
  }
  if (road === null) {
    delete next.roadPricing;
    delete next.marginApproval;
  } else if (road) {
    next.roadPricing = road;
  }
  if (updates.length) next.tariffUpdates = updates;
  else delete next.tariffUpdates;
  return { data: next, messages, changed: linesChanged || JSON.stringify(before) !== JSON.stringify(updates) };
}
