import type { OpsCockpitRow, ShipmentsManagersCockpit } from "@/hooks/useShipmentsManagersCockpit";

// The signal tiles of Shipments → Managers. Every tag on a row says what kind of signal it is
// (`kind`, the server's stable keys: cutoff, booking, customs…). A signal tile counts the rows that
// carry a tag of its kinds and, clicked, narrows the two cards to them (?signal= in the address).
// The Cockpit's cards are narrowed by the server (GET /shipments/managers-cockpit ?signal=, its
// copy of these families is apps/api …/lib/managersCockpit SIGNAL_FAMILIES): before it cuts a card
// at its limit, so a tile ranked low still opens every row it counts (serverCard).
// The Money tab's tiles narrow here, over the rows the server sent (_lib/cockpitMoney, ?msignal=):
// a card the server cut at its limit is narrowed among the rows listed, and the page says so. What
// narrows, cuts and orders tags here takes any row that carries tags with a kind.

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
    // The figure is the urgent ones, and the URGENT card it opens lists exactly those (the server
    // puts a row there by its cut-off tags alone); the filter goes by the kind of tag, urgent or not.
    note: "URGENT then lists the jobs this counts; ATTENTION the jobs with a cut-off in the two working days after.",
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
    // Step 5: what our warehouse (kind `warehouse`) and Trucking (kind `road`) report on the job
    // joins the job's own delivery dates - one tile, as one person works on them.
    kinds: ["delivery", "road", "warehouse"],
    // The chip ("Showing only") says the label too: the tile names all the cards then hold.
    label: "Delivery, warehouse and road",
    hint: "Planned delivery or pick-up passed, POD missing, the haulier not confirmed, and what our warehouse or Trucking reports on the job",
  },
  { key: "departure", kinds: ["departure", "arrival"], label: "Departure and arrival late", hint: "ETD passed with no ATD, ETA passed with no ATA, or a job that was rolled" },
  // Step 6 (D21): the job's cargo claims. What it says beyond "open since" depends on the claim time
  // limits, which stay off until a manager confirms them on the Settings tab.
  {
    key: "claim",
    kinds: ["claim"],
    label: "Cargo claims",
    hint: "A cargo claim open for 14 days or longer; with the claim time limits switched on, also the carrier not notified and a notice deadline or suit time bar coming close",
    note: "The claim time limits are switched on or off on the Settings tab.",
  },
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
    // S16: a Holiday Cover who is no user covers nobody - the same want, so the same tile.
    hint: "Handled By or Holiday Cover names somebody who is not an active user of the company",
    figure: "handledByNotUser",
  },
  // Step 6 (D12): beside "is not a user" - both say nobody is at work on the job.
  {
    key: "away",
    kinds: ["away"],
    label: "Away",
    hint: "Handled By away with no Holiday Cover (today, or from within 2 working days on an absence that names no cover), Handled By and Holiday Cover both away, or the Holiday Cover away",
    note: "Absences are recorded under the user menu (Away…) or on Settings → Users; the cover an absence names is set on the jobs within 15 minutes.",
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
    hint: "No change, chat line, to-do, task tick or tracking event for 5 working days (air: 3), on a job with nothing urgent - a manager's nudge, dismissed cut-off or answer to a release request does not count",
  },
];

/**
 * The family an address names (?signal=), or null for none. One of a family's kinds names the
 * family too (?signal=road is Delivery, warehouse and road); anything else is no filter.
 */
export const signalOf = (value: string | null): SignalFamily | null => familyOf(SIGNAL_FAMILIES, value);

/** The family of `families` a value names - by its key, or by one of its kinds; null for none. */
export function familyOf(families: readonly SignalFamily[], value: string | null): SignalFamily | null {
  const named = (value ?? "").trim().toLowerCase();
  if (!named) return null;
  return families.find((f) => f.key === named) ?? families.find((f) => f.kinds.includes(named)) ?? null;
}

/** A tag as the tiles read it: by its kind (a tag from before step 2 has none). */
interface KindTag {
  kind?: string;
}

/** A row the tiles can narrow to: the cockpit's, the Money tab's. */
interface TaggedRow {
  tags: readonly KindTag[];
}

const isOf = (family: SignalFamily) => (tag: KindTag) => !!tag.kind && family.kinds.includes(tag.kind);

/** Whether a row carries a tag of the family. */
export const hasSignal = (row: TaggedRow, family: SignalFamily): boolean => row.tags.some(isOf(family));

/** A card as the page draws it. */
export interface ShownList<R = OpsCockpitRow> {
  total: number;
  rows: R[];
  /** How many rows the server listed, before any narrowing: what a narrowed card was looked through. */
  listed: number;
  /**
   * The server listed only the first of the card's rows, and they are narrowed here: what is found
   * is found among those (windowWithSignal). A card the server narrowed itself is not (serverCard).
   */
  cut: boolean;
}

/**
 * A Cockpit card as the server sent it, narrowed or not: the server narrows to the signal asked for
 * before it cuts the card at its limit, so `total` is every row of the signal and the rows are the
 * first of them - nothing was left out of the narrowing, and the window says no "among the first"
 * (the dialog says itself when only the first rows are listed).
 */
export function serverCard<R>(list: { total: number; rows: R[] }): ShownList<R> {
  return { total: list.total, rows: list.rows, listed: list.rows.length, cut: false };
}

/**
 * A card narrowed here to a family (the Money tab's); the card as it is for no family. Narrowed,
 * `total` counts the rows found among those listed - of a cut card the rest is not here to be
 * looked through.
 */
export function listWithSignal<R extends TaggedRow = OpsCockpitRow>(list: { total: number; rows: R[] }, family: SignalFamily | null): ShownList<R> {
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
export const windowWithSignal = (window: string, list: Pick<ShownList<unknown>, "listed" | "cut"> | undefined): string => (list?.cut ? `${window} · among the first ${list.listed}` : window);

/** What an empty card says while the cards are narrowed to a signal: "nothing urgent" would be more than is known. */
export const EMPTY_WITH_SIGNAL = {
  urgent: "No URGENT job with this signal.",
  attention: "No ATTENTION job with this signal.",
} as const;

/** What the cards are narrowed to, as the chip and the dialog's title name it. */
export const showingLabel = (family: SignalFamily): string => family.showing ?? family.label;

/**
 * A card in the words of what it shows now: as it is for no family; narrowed to one, its window
 * says among how many when the server cut it, its empty text claims no more than "none with this
 * signal", and its dialog's title names the family.
 */
export function cardWithSignal<C extends { window: string; empty: string; dialog: string }>(
  card: C,
  key: keyof typeof EMPTY_WITH_SIGNAL,
  family: SignalFamily | null,
  list: Pick<ShownList<unknown>, "listed" | "cut"> | undefined,
): C {
  if (!family) return card;
  return { ...card, window: windowWithSignal(card.window, list), empty: EMPTY_WITH_SIGNAL[key], dialog: `${card.dialog} · ${showingLabel(family)}` };
}

/** A signal tile's figure: `count` null when it is not known, `atLeast` when there may be more. */
export interface SignalFigure {
  count: number | null;
  atLeast: boolean;
}

type Counted = Pick<ShipmentsManagersCockpit, "tiles">;

/**
 * What a signal tile counts: the server's count of the tile (`tiles.families`) - every row of the
 * page with a tag of its kinds, a row with two of them once - and never the cards', which may be
 * cut at their limit or narrowed to another tile. A tile with a figure of a narrower rule (Cut-offs
 * due, Handled By is not a user) shows that figure.
 */
export function signalFigure(family: SignalFamily, cockpit: Counted): SignalFigure {
  if (family.figure) return { count: cockpit.tiles[family.figure], atLeast: false };
  // An answer from before the server counted the tiles (one still in the cache, the page deployed
  // ahead of the server) has no `families`: none, not a crash.
  const families: Record<string, number> | undefined = cockpit.tiles.families;
  return { count: families?.[family.key] ?? 0, atLeast: false };
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
export function tagsShown<T extends KindTag>(tags: readonly T[], family: SignalFamily | null, limit = Infinity): { shown: T[]; more: T[] } {
  const ordered = family ? [...tags.filter(isOf(family)), ...tags.filter((t) => !isOf(family)(t))] : [...tags];
  return { shown: ordered.slice(0, limit), more: ordered.slice(limit) };
}

/**
 * Whether an answer the page asks for is still to come: the question is asked (`enabled`) and no
 * answer to it is there yet - none at all (`isPending`: also while the request is held back, as
 * with no connection, when nothing is "fetching"), or only the answer to an earlier filter
 * (`isPlaceholderData`). Until then the page shows "…", never figures of zero.
 */
export const isAnswerLoading = ({ enabled, isPending, isPlaceholderData }: { enabled: boolean; isPending: boolean; isPlaceholderData: boolean }): boolean =>
  enabled && (isPending || isPlaceholderData);

/** What the cards and the Team table say when the answer could not be loaded. */
export const LOAD_FAILED = "Could not load Operations.";

/**
 * Why the load failed, in words for the page. The server's own words when it says it cannot
 * answer just now (code "unavailable": with "My reports" on and the users unreadable it says who
 * reports to whom could not be read - an empty page would read as "nobody has anything");
 * anything else - no connection, a fault - is the page's plain line (`plain`: the Money tab has
 * its own).
 */
export function loadFailedText(error: unknown, plain: string = LOAD_FAILED): string {
  if (typeof error !== "object" || error === null) return plain;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === "unavailable" && typeof message === "string" && message.trim() ? message.trim() : plain;
}

/**
 * The parts that could not be read, as one line. With commas between them - with semicolons when
 * a part's own name has a comma ("tracking events (Closing, holds…)").
 */
export const notKnownText = (parts: readonly string[]): string => parts.join(parts.some((p) => p.includes(",")) ? "; " : ", ");
