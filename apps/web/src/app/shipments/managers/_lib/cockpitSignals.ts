import type { OpsCockpitList, OpsCockpitRow, ShipmentsManagersCockpit } from "@/hooks/useShipmentsManagersCockpit";

// The signal tiles of Shipments → Managers. Every tag on a row says what kind of signal it is
// (`kind`, the server's stable keys: cutoff, booking, customs…). A signal tile counts the rows that
// carry a tag of its kinds and, clicked, narrows the two cards to them (?signal= in the address).
// The narrowing is done here, over the rows the server sent: a card the server cut at its limit is
// narrowed among the rows listed, and the page says so.

/** What a signal tile stands for: one kind of tag, or a few that are worked on together. */
export interface SignalFamily {
  /** The value of ?signal= in the address. */
  key: string;
  /** The tags' kinds the family holds; a row with any of them is one of its rows. */
  kinds: readonly string[];
  /** The tile's label. */
  label: string;
  /** What the "Showing only" chip says, where the cards then hold more than the tile's label names. */
  showing?: string;
  /** What the tile counts, in one line, shown on hover. */
  hint: string;
  /** A second line on hover: what a click shows beyond the figure, or where the work is done. */
  note?: string;
  /**
   * A figure the server counts by a narrower rule than "any tag of these kinds". Without it the
   * tile counts the rows carrying a tag of the family.
   */
  figure?: "cutoffsDue" | "handledByNotUser";
}

/** The signal tiles, in the order they are drawn. The other kinds have no tile: they are read as tags. */
export const SIGNAL_FAMILIES: readonly SignalFamily[] = [
  {
    key: "cutoff",
    kinds: ["cutoff"],
    label: "Cut-offs due or missed",
    showing: "Cut-offs",
    hint: "A cut-off (Closing, VGM, SI, AMS, ISF) due today or the next working day, or missed before the job departed",
    // The figure is the urgent ones; the filter goes by the kind of tag, urgent or not.
    note: "The cards then show every job with a cut-off tag, also the ones in the two working days after.",
    figure: "cutoffsDue",
  },
  { key: "booking", kinds: ["booking"], label: "Booking at risk", hint: "Booking Confirmation still Pending with the cargo ready or the ETD close" },
  {
    key: "customs",
    kinds: ["customs"],
    // Every customs tag, the ones that only ask for a look among them: the name promises no more.
    label: "Customs to look at",
    hint: "Customs urgent with its deadline near, passed or not typed, a customs hold, a T1 with no Customs Office, a release with no MRN, or a clearance open for more than 3 working days",
  },
  {
    key: "paperwork",
    kinds: ["paperwork"],
    label: "Paperwork not ready",
    hint: "Waiting For Commercial Paperwork with the arrival close, a document not reviewed, or a declined document not replaced",
  },
  {
    key: "free_time",
    kinds: ["free_time"],
    label: "Free time",
    hint: "A container's free time ending or over, or an import arriving with no free time typed or no container number",
  },
  {
    key: "delivery",
    kinds: ["delivery", "road", "warehouse"],
    label: "Delivery and POD",
    hint: "A planned delivery or pick-up passed or not ready (no plate number, haulier not confirmed), cargo not received or waiting in our warehouse, or a delivery with no POD",
  },
  { key: "departure", kinds: ["departure", "arrival"], label: "Departure and arrival late", hint: "ETD passed with no ATD, ETA passed with no ATA, or a job that was rolled" },
  {
    key: "request",
    kinds: ["request"],
    label: "Waiting for approval",
    hint: "A change of Customs Office or of an approved document waiting for approval for more than a working day (or at all on a Customs urgent job), or a request to release a job before payment waiting for more than a working day",
    note: "They are answered on the Approvals tab.",
  },
  // Its own kind: "Nobody in Handled By" is `owner`, and has the list tile that opens those jobs.
  {
    key: "not_user",
    kinds: ["not_user"],
    label: "Handled By is not a user",
    hint: "Handled By names somebody who is not an active user of the company",
    figure: "handledByNotUser",
  },
  // Step 3: what people left undone. Two kinds on one tile - a row with both is counted once.
  {
    key: "todo",
    kinds: ["todo", "mention"],
    label: "To-dos and @mentions",
    hint: "A to-do past its day, or an @mention the job's Handled By or Holiday Cover has not read for 4 office hours or longer",
  },
  {
    key: "not_touched",
    kinds: ["not_touched"],
    label: "Not touched",
    hint: "No change, chat line, to-do, task tick or tracking event for 5 working days (air: 3), on a job with nothing urgent",
  },
];

/**
 * The family an address names (?signal=), or null for none. One of a family's kinds names the
 * family too (?signal=road is Delivery and POD); anything else is no filter.
 */
export function signalOf(value: string | null): SignalFamily | null {
  const named = (value ?? "").trim().toLowerCase();
  if (!named) return null;
  return SIGNAL_FAMILIES.find((f) => f.key === named) ?? SIGNAL_FAMILIES.find((f) => f.kinds.includes(named)) ?? null;
}

type Tag = OpsCockpitRow["tags"][number];

const isOf = (family: SignalFamily) => (tag: Pick<Tag, "kind">) => !!tag.kind && family.kinds.includes(tag.kind);

/** Whether a row carries a tag of the family. */
export const hasSignal = (row: Pick<OpsCockpitRow, "tags">, family: SignalFamily): boolean => row.tags.some(isOf(family));

/** A card as the page draws it. */
export interface ShownList {
  total: number;
  rows: OpsCockpitRow[];
  /** How many rows the server listed, before any narrowing: what a narrowed card was looked through. */
  listed: number;
  /** The server listed only the first of the card's rows. */
  cut: boolean;
}

/**
 * A card narrowed to a family; the card as it is for no family. Narrowed, `total` counts the rows
 * found among those listed - of a cut card the rest is not here to be looked through.
 */
export function listWithSignal(list: OpsCockpitList, family: SignalFamily | null): ShownList {
  const listed = list.rows.length;
  const cut = list.total > listed;
  if (!family) return { total: list.total, rows: list.rows, listed, cut };
  const rows = list.rows.filter((r) => hasSignal(r, family));
  return { total: rows.length, rows, listed, cut };
}

/**
 * A narrowed card's window, beside its count: of a card the server cut, the count is what was
 * found among the rows it listed ("among the first 200" - the rows listed, not the rows found).
 */
export const windowWithSignal = (window: string, list: Pick<ShownList, "listed" | "cut"> | undefined): string => (list?.cut ? `${window} · among the first ${list.listed}` : window);

/** A signal tile's figure: `count` null when it is not known, `atLeast` when there may be more. */
export interface SignalFigure {
  count: number | null;
  atLeast: boolean;
}

type Counted = Pick<ShipmentsManagersCockpit, "tiles" | "urgent" | "attention">;

/**
 * What a signal tile counts. A family of one kind is the server's count of the rows with that
 * kind. A family of several kinds is counted over the rows of both cards, since a row with two of
 * the kinds is one row and the server's counts are per kind. Should a card be cut, the rows
 * listed and the largest of the kinds' counts are both the least it can be: "12+" unless the
 * kinds' counts leave no room for more.
 */
export function signalFigure(family: SignalFamily, cockpit: Counted): SignalFigure {
  if (family.figure) return { count: cockpit.tiles[family.figure], atLeast: false };
  // An answer from before step 2 (the page deployed ahead of the server, or an answer still in the
  // cache) has no `signals`: its tags name no kind either, so no row would be found - none, not a crash.
  const signals: Record<string, number> | undefined = cockpit.tiles.signals;
  const perKind = family.kinds.map((kind) => signals?.[kind] ?? 0);
  const [only] = perKind;
  if (perKind.length === 1 && only !== undefined) return { count: only, atLeast: false };
  const cards = [cockpit.urgent, cockpit.attention];
  const listed = cards.reduce((sum, card) => sum + card.rows.filter((r) => hasSignal(r, family)).length, 0);
  if (cards.every((card) => card.total <= card.rows.length)) return { count: listed, atLeast: false };
  const least = Math.max(listed, ...perKind);
  return { count: least, atLeast: least < perKind.reduce((sum, n) => sum + n, 0) };
}

/** The figure as the tile shows it; "–" for one that is not known (not known is not zero). */
export const figureText = ({ count, atLeast }: SignalFigure): string => (count === null ? "–" : `${count}${atLeast ? "+" : ""}`);

/** How many tags a card's row shows before "+N more"; the dialog shows them all. */
export const CARD_TAG_LIMIT = 4;

/**
 * The tags a row shows: the server's order (the urgent ones first), with the tags of the family
 * the cards are narrowed to in front - so the reason a row is listed is never behind "+N more".
 * `more` holds what did not fit under `limit`.
 */
export function tagsShown<T extends Pick<Tag, "kind">>(tags: readonly T[], family: SignalFamily | null, limit = Infinity): { shown: T[]; more: T[] } {
  const ordered = family ? [...tags.filter(isOf(family)), ...tags.filter((t) => !isOf(family)(t))] : [...tags];
  return { shown: ordered.slice(0, limit), more: ordered.slice(limit) };
}

/** What the cards and the Team table say when the answer could not be loaded. */
export const LOAD_FAILED = "Could not load Operations.";

/**
 * Why the load failed, in words for the page. The server's own words when it says it cannot
 * answer just now (code "unavailable": with "My reports" on and the users unreadable it says who
 * reports to whom could not be read - an empty page would read as "nobody has anything");
 * anything else - no connection, a fault - is the page's plain line.
 */
export function loadFailedText(error: unknown): string {
  if (typeof error !== "object" || error === null) return LOAD_FAILED;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === "unavailable" && typeof message === "string" && message.trim() ? message.trim() : LOAD_FAILED;
}

/**
 * The parts that could not be read, as one line. With commas between them - with semicolons when
 * a part's own name has a comma ("tracking events (Closing, holds…)").
 */
export const notKnownText = (parts: readonly string[]): string => parts.join(parts.some((p) => p.includes(",")) ? "; " : ", ");
