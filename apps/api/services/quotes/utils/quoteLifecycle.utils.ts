import type { SettableQuoteStatus, ShownQuoteStatus } from "../interfaces/interfaces";
import { addDays, isRealYmd } from "../../../lib/businessDate";
import { isPlainObject } from "./quoteDocument.utils";

// THE ONE DEFINITION of the lifecycle rules of a sales quote: which status may follow which,
// what each change stamps, when a quote counts as expired and when a follow-up is due. Pure -
// "now", "today" and the acting user are passed in - so every rule is covered by a unit test.

/** The lifecycle facts of one quote, as its columns hold them. Days are YYYY-MM-DD. */
export interface LifecycleState {
  status: string;
  substatus: string | null;
  lostReason: string | null;
  lostComment: string | null;
  /** The last sending. */
  sentAt: Date | null;
  /** The first sending; never moved once set. */
  firstSentAt: Date | null;
  decidedAt: Date | null;
  validUntil: string | null;
  lastContactAt: Date | null;
  ownerUserId: string | null;
  ownerLabel: string;
  shipmentId: string | null;
  shipmentJobNumber: string | null;
  createdAt: Date;
}

// A text without the spaces it ends with: what SQL's btrim leaves of its end - spaces, nothing
// else. A loop, because / +$/ starts anew at every space of a long run inside the text.
function withoutTrailingSpaces(text: string): string;
function withoutTrailingSpaces(text: string | null): string | null;
function withoutTrailingSpaces(text: string | null): string | null {
  if (text === null) return null;
  let end = text.length;
  while (end > 0 && text[end - 1] === " ") end--;
  return text.slice(0, end);
}

/**
 * The lifecycle facts of a stored sales quote, read from its row: the schema names its columns as
 * the state names its facts. A text is read without the spaces it ends with. The adoption
 * (quote_lifecycle_of, migration 0004) trims a text and then cuts it, so the cut of an overlong
 * legacy text can end in a space - one the derivation would not read back from the mirror. Read
 * without it, the next write stores the same text in the columns and in the document.
 */
export function stateOf(row: LifecycleState): LifecycleState {
  return {
    status: withoutTrailingSpaces(row.status),
    substatus: withoutTrailingSpaces(row.substatus),
    lostReason: withoutTrailingSpaces(row.lostReason),
    lostComment: withoutTrailingSpaces(row.lostComment),
    sentAt: row.sentAt,
    firstSentAt: row.firstSentAt,
    decidedAt: row.decidedAt,
    validUntil: row.validUntil,
    lastContactAt: row.lastContactAt,
    ownerUserId: row.ownerUserId,
    ownerLabel: withoutTrailingSpaces(row.ownerLabel),
    shipmentId: row.shipmentId,
    shipmentJobNumber: row.shipmentJobNumber,
    createdAt: row.createdAt,
  };
}

/** The columns that hold a state: what an insert or a lifecycle write stores. A row has its creation date by itself. */
export function columnsOf(state: LifecycleState): Omit<LifecycleState, "createdAt"> {
  return {
    status: state.status,
    substatus: state.substatus,
    lostReason: state.lostReason,
    lostComment: state.lostComment,
    sentAt: state.sentAt,
    firstSentAt: state.firstSentAt,
    decidedAt: state.decidedAt,
    validUntil: state.validUntil,
    lastContactAt: state.lastContactAt,
    ownerUserId: state.ownerUserId,
    ownerLabel: state.ownerLabel,
    shipmentId: state.shipmentId,
    shipmentJobNumber: state.shipmentJobNumber,
  };
}

/**
 * One line of a quote's history (data.timeline). An entry without `kind` was written before
 * kinds existed and is a status entry; only status entries carry a status.
 */
export interface TimelineEntry {
  kind?: "status" | "validity" | "owner" | "follow_up" | "shipment" | "deleted" | "road_price" | "margin_approval";
  at: string;
  /** Display name of who did it; absent when it could not be resolved. */
  user?: string;
  userId?: string;
  status?: string;
  lostReason?: string;
  comment?: string;
  /**
   * The status before: on a Won the system made, and on a line by which a quote left a status
   * that proves it was sent while no sent date says so.
   */
  from?: string;
  shipmentId?: string;
  jobNumber?: string;
  action?: "linked" | "removed";
  auto?: boolean;
}

/** Who acts and when. `today` is the business day of `at`. */
export interface LifecycleContext {
  at: Date;
  today: string;
  userId: string;
  userName: string;
}

/** What the user chose when changing a quote's status. */
export interface StatusChange {
  /** Checked here, not trusted: internal callers and old data can name anything. */
  to: string;
  comment?: string;
  /** To Quoted: "valid N days" from today, used only when the quote has no validity that still holds. */
  validityDays?: number;
  /** To Lost: "Category: reason". */
  lostReason?: string;
}

export type LifecycleChange<Entry = TimelineEntry> =
  | { changed: false }
  | { changed: true; state: LifecycleState; entry: Entry };

/**
 * A change the rules refuse. `not_allowed`: not from the state the quote is in. `invalid`: the
 * request itself is wrong. The message finishes the sentence "QCZ… - …" shown to the user.
 */
export class LifecycleError extends Error {
  constructor(
    readonly code: "not_allowed" | "invalid",
    message: string,
  ) {
    super(message);
    this.name = "LifecycleError";
  }
}

/** Which statuses may follow which. `expired` is the effective status, or one stored by the old bulk menu. */
export const NEXT: Record<ShownQuoteStatus, readonly SettableQuoteStatus[]> = {
  draft: ["ready_to_send", "quoted", "lost"],
  ready_to_send: ["quoted", "draft", "lost"],
  quoted: ["feedback", "revised", "won", "lost"],
  feedback: ["revised", "won", "lost", "quoted"],
  revised: ["quoted", "won", "lost"],
  won: [],
  lost: ["draft"],
  expired: ["draft", "revised"],
  // Its revision took its place: the quote stays as the record of what was sent.
  replaced: [],
};

// A status this code does not know (old data) can only be brought back into the flow.
const NEXT_OF_UNKNOWN: readonly string[] = ["draft"];

/** Still in play: neither decided nor expired. */
export const OPEN: readonly string[] = ["draft", "ready_to_send", "quoted", "feedback", "revised"];

/** With the customer, waiting for an answer: these expire and get followed up. */
export const AWAITING: readonly string[] = ["quoted", "feedback"];

/**
 * A quote in one of these went out to the customer at some point, even if no sent date was
 * recorded. Not Revised: a revision is a new quote (revisionOf) that starts as Revised before it
 * is sent, so the status proves nothing - a quote revised in place after sending has its dates.
 */
export const SENT_EVIDENCE: readonly string[] = ["quoted", "feedback", "won", "expired", "replaced"];

/**
 * A quote in one of these went out as it stands, or is decided: its buying and selling are what
 * the customer was given and stay as they are. New prices for a sent quote are a revision of it
 * (applyRevision); a Lost or Expired quote reopened as a Draft can be priced again.
 */
export const PRICING_CLOSED: readonly string[] = ["quoted", "feedback", "won", "lost", "expired", "replaced"];

/** The keys of the document that hold a quote's prices: those a save cannot change once PRICING_CLOSED. */
export const PRICING_KEYS: readonly string[] = ["buyingLines", "sellingLines", "currency", "allIn", "road"];

// The statuses (as shown) a quote is revised from: it went out and is not decided.
const REVISABLE: readonly string[] = ["quoted", "feedback", "expired"];

/** The statuses a quote can be set to, each with the win probability it carries. */
export const WIN_PROBABILITY: Record<SettableQuoteStatus, number> = {
  draft: 10,
  ready_to_send: 20,
  quoted: 30,
  feedback: 60,
  revised: 50,
  won: 100,
  lost: 0,
};

/** Every status a quote can show: the ones it can be set to, and Expired. */
export const SHOWN_STATUSES: readonly ShownQuoteStatus[] = ["draft", "ready_to_send", "quoted", "feedback", "revised", "won", "lost", "expired", "replaced"];

/** Whether a stored or requested text is a status a quote can be set to. */
export function isSettableStatus(status: string): status is SettableQuoteStatus {
  return Object.hasOwn(WIN_PROBABILITY, status);
}

/** Whether a text is a status a quote can show. */
export function isShownStatus(status: string): status is ShownQuoteStatus {
  return (SHOWN_STATUSES as readonly string[]).includes(status);
}

export const FOLLOW_UP_INTERVAL_DAYS = 3;

const LABELS: Record<string, string> = {
  draft: "Draft",
  ready_to_send: "Ready to Send",
  quoted: "Quoted",
  feedback: "Feedback",
  revised: "Revised",
  won: "Won",
  lost: "Lost",
  expired: "Expired",
  replaced: "Replaced",
};

function label(status: string): string {
  return Object.hasOwn(LABELS, status) ? LABELS[status] : `"${status}"`;
}

// The limits of quote_lifecycle_of (migration 0004). Text is stored trimmed and no longer than
// what the derivation reads back, so the columns and the document they mirror cannot differ.
const MAX_LOST_REASON = 500;
const MAX_COMMENT = 4000;
const MAX_OWNER_LABEL = 200;
// A note on a recorded follow-up is refused when longer, not cut: it is what the user typed.
const MAX_FOLLOW_UP_NOTE = 2000;

function clip(text: string | undefined, max: number): string | null {
  // Cut by character, not by UTF-16 unit, so an emoji is never split in half.
  const cut = Array.from((text ?? "").trim()).slice(0, max).join("").trimEnd();
  return cut || null;
}

function entryBy(kind: NonNullable<TimelineEntry["kind"]>, ctx: LifecycleContext): TimelineEntry {
  const entry: TimelineEntry = { kind, at: ctx.at.toISOString(), userId: ctx.userId };
  if (ctx.userName) entry.user = ctx.userName;
  return entry;
}

// The history line of a quote entering a status.
function statusEntry(status: string, ctx: LifecycleContext): TimelineEntry {
  return { ...entryBy("status", ctx), status };
}

/**
 * What a quote starts with: a Draft that belongs to whoever created it - never to the owner of
 * a quote it was copied from - and a history that begins with that.
 */
export function newQuote(ctx: LifecycleContext): { state: LifecycleState; entry: TimelineEntry } {
  const state: LifecycleState = {
    status: "draft",
    substatus: null,
    lostReason: null,
    lostComment: null,
    sentAt: null,
    firstSentAt: null,
    decidedAt: null,
    validUntil: null,
    lastContactAt: null,
    ownerUserId: ctx.userId,
    ownerLabel: clip(ctx.userName, MAX_OWNER_LABEL) ?? "",
    shipmentId: null,
    shipmentJobNumber: null,
    createdAt: ctx.at,
  };
  return { state, entry: statusEntry("draft", ctx) };
}

/**
 * The status a quote shows: a Quoted or Feedback quote whose validity date has passed is
 * Expired. Nothing stores that - it follows from the date - so it can never go stale.
 */
export function effectiveStatus(status: string, validUntil: string | null, today: string): string {
  return AWAITING.includes(status) && validUntil !== null && validUntil < today ? "expired" : status;
}

/** The statuses the quote may be set to now, in menu order. */
export function allowedTransitions(state: LifecycleState, today: string): string[] {
  const status = effectiveStatus(state.status, state.validUntil, today);
  const next: string[] = [...(isShownStatus(status) ? NEXT[status] : NEXT_OF_UNKNOWN)];
  // A shipment exists, so the order is a fact whatever the status says.
  if (state.shipmentId && (OPEN.includes(status) || status === "expired") && !next.includes("won")) next.push("won");
  return next;
}

/**
 * Refuses a change that was decided on a status the quote no longer has. `expected` is the status
 * the caller saw - the one shown, so "expired" for a quote whose validity has passed.
 */
export function expectStatus(state: LifecycleState, expected: string, today: string): void {
  const status = effectiveStatus(state.status, state.validUntil, today);
  if (status !== expected) throw new LifecycleError("not_allowed", `the quote is now ${label(status)}`);
}

// The validity of a quote that is being sent. One that still holds is kept, days or not.
function validityOnSending(validUntil: string | null, validityDays: number | undefined, today: string): string | null {
  if (validityDays !== undefined && !(Number.isInteger(validityDays) && validityDays >= 1 && validityDays <= 365)) {
    throw new LifecycleError("invalid", "the validity must be between 1 and 365 days");
  }
  if (validUntil !== null && validUntil >= today) return validUntil;
  if (validityDays !== undefined) return addDays(today, validityDays);
  if (validUntil === null) return null;
  // Kept as it is, the quote would be Expired the moment it is sent.
  throw new LifecycleError("not_allowed", "the validity date has passed - choose a new validity");
}

/**
 * A change of status with everything it stamps. Judged on the effective status: an expired
 * quote is not "Quoted" for this purpose. Setting the status a quote already has is no change:
 * nothing is dated anew and the history gets no line.
 */
export function applyTransition(state: LifecycleState, change: StatusChange, ctx: LifecycleContext): LifecycleChange {
  const { to } = change;
  if (to === "expired") {
    throw new LifecycleError("invalid", "a quote cannot be set to Expired - it expires when its validity date has passed");
  }
  if (!isSettableStatus(to)) throw new LifecycleError("invalid", `"${to}" is not a quote status`);

  const from = effectiveStatus(state.status, state.validUntil, ctx.today);
  if (to === from) return { changed: false };
  // Revised is among the next statuses - it is what says the quote can be revised - but the quote
  // that was sent does not become it: a new quote, its revision, does (applyRevision).
  if (to === "revised") {
    throw new LifecycleError("not_allowed", "a quote that was sent is revised as a new quote - use Revise");
  }
  if (!allowedTransitions(state, ctx.today).includes(to)) {
    throw new LifecycleError("not_allowed", `a quote cannot go from ${label(from)} to ${label(to)}`);
  }

  // Lost reason and decision date describe the current status only; sent dates and the last
  // contact stay, whatever comes next. The sub-status is no longer kept: nothing used it.
  const next: LifecycleState = {
    ...state,
    status: to,
    substatus: null,
    lostReason: to === "lost" ? clip(change.lostReason, MAX_LOST_REASON) : null,
    lostComment: to === "lost" ? clip(change.comment, MAX_COMMENT) : null,
    decidedAt: to === "won" || to === "lost" ? ctx.at : null,
  };
  if (to === "quoted") {
    next.sentAt = ctx.at;
    next.firstSentAt = state.firstSentAt ?? ctx.at;
    next.lastContactAt = ctx.at;
    next.validUntil = validityOnSending(state.validUntil, change.validityDays, ctx.today);
  }
  if (to === "feedback") next.lastContactAt = ctx.at;

  const entry = statusEntry(to, ctx);
  // The status it leaves is all that says this quote went out - no sent date was recorded for
  // it. The line keeps it, or a reopened Draft would pass for one the customer never got.
  if (state.firstSentAt === null && SENT_EVIDENCE.includes(state.status)) entry.from = state.status;
  const comment = clip(change.comment, MAX_COMMENT);
  if (comment) entry.comment = comment;
  if (next.lostReason) entry.lostReason = next.lostReason;
  return { changed: true, state: next, entry };
}

/**
 * A quote that was sent, revised: it becomes Replaced - kept as the record of what the customer
 * was given, out of the open quotes - and names its revision. Judged on the effective status, so
 * an expired quote can be revised. Nothing is decided by it: no decision date, as quote_lifecycle_of
 * (migration 0005) gives one only to Won and Lost.
 */
export function applyRevision(state: LifecycleState, revision: string, ctx: LifecycleContext): { state: LifecycleState; entry: TimelineEntry } {
  const from = effectiveStatus(state.status, state.validUntil, ctx.today);
  if (!REVISABLE.includes(from)) {
    throw new LifecycleError("not_allowed", `only a Quoted, Feedback or Expired quote can be revised - this one is ${label(from)}`);
  }
  return {
    state: { ...state, status: "replaced", substatus: null, lostReason: null, lostComment: null, decidedAt: null },
    entry: { ...statusEntry("replaced", ctx), comment: `Replaced by ${revision}` },
  };
}

/**
 * What the revision of a quote starts with: Revised, so it is priced again and then sent; the
 * owner and the validity of the quote it revises (a validity that has passed is chosen anew
 * when it is sent); no sending, contact or shipment of its own yet.
 */
export function revisionOf(source: LifecycleState, sourceReference: string, ctx: LifecycleContext): { state: LifecycleState; entry: TimelineEntry } {
  const state: LifecycleState = {
    status: "revised",
    substatus: null,
    lostReason: null,
    lostComment: null,
    sentAt: null,
    firstSentAt: null,
    decidedAt: null,
    validUntil: source.validUntil,
    lastContactAt: null,
    ownerUserId: source.ownerUserId,
    ownerLabel: source.ownerLabel,
    shipmentId: null,
    shipmentJobNumber: null,
    createdAt: ctx.at,
  };
  return { state, entry: { ...statusEntry("revised", ctx), comment: `Revision of ${sourceReference}` } };
}

/**
 * A new "Valid until" date, or none. A decided quote keeps the validity it was decided with.
 * The history gets a line only once the customer has the quote: before the first sending the
 * date is part of preparing it.
 */
export function applyValidity(
  state: LifecycleState,
  validUntil: string | null,
  ctx: LifecycleContext,
): LifecycleChange<TimelineEntry | null> {
  if (state.status === "won" || state.status === "lost") {
    throw new LifecycleError("not_allowed", `the validity of a ${label(state.status)} quote cannot be changed`);
  }
  // Only what quote_lifecycle_of reads back as the same date.
  if (validUntil !== null && (!isRealYmd(validUntil) || validUntil < "2000-01-01" || validUntil > "2099-12-31")) {
    throw new LifecycleError("invalid", "the validity must be a real date (YYYY-MM-DD)");
  }
  if (validUntil === state.validUntil) return { changed: false };

  let entry: TimelineEntry | null = null;
  if (state.firstSentAt) {
    const was = state.validUntil ? ` (was ${state.validUntil})` : "";
    entry = { ...entryBy("validity", ctx), comment: validUntil ? `Valid until ${validUntil}${was}` : `No validity date${was}` };
  }
  return { changed: true, state: { ...state, validUntil }, entry };
}

/**
 * A new owner, or nobody. The owner is a user; the label old readers see is that user's display
 * name, so one person is spelled one way. Naming the owner the quote already has is no change.
 */
export function applyOwner(
  state: LifecycleState,
  owner: { userId: string; name: string } | null,
  ctx: LifecycleContext,
): LifecycleChange {
  const ownerUserId = owner?.userId ?? null;
  const ownerLabel = clip(owner?.name, MAX_OWNER_LABEL) ?? "";
  if (ownerUserId === state.ownerUserId && ownerLabel === state.ownerLabel) return { changed: false };

  const was = state.ownerLabel ? ` (was ${state.ownerLabel})` : "";
  const entry = { ...entryBy("owner", ctx), comment: owner ? `Owner: ${ownerLabel}${was}` : `No owner${was}` };
  return { changed: true, state: { ...state, ownerUserId, ownerLabel }, entry };
}

/** A recorded contact with the customer, with or without a note on it: the follow-up clock starts again. */
export function applyFollowUp(
  state: LifecycleState,
  note: string | undefined,
  ctx: LifecycleContext,
): { state: LifecycleState; entry: TimelineEntry } {
  const comment = (note ?? "").trim();
  if (Array.from(comment).length > MAX_FOLLOW_UP_NOTE) {
    throw new LifecycleError("invalid", `a follow-up note can have at most ${MAX_FOLLOW_UP_NOTE} characters`);
  }
  const status = effectiveStatus(state.status, state.validUntil, ctx.today);
  if (!AWAITING.includes(status)) {
    throw new LifecycleError("not_allowed", `a follow-up can be recorded only on a Quoted or Feedback quote - this one is ${label(status)}`);
  }
  const entry = entryBy("follow_up", ctx);
  if (comment) entry.comment = comment;
  return { state: { ...state, lastContactAt: ctx.at }, entry };
}

/**
 * The last line of a quote's history: who deleted it, and when. Whether they may is not a rule
 * of the lifecycle but of the policy (salesPolicy). The line carries no status - a deleted quote
 * keeps the one it had.
 */
export function deletionEntry(ctx: LifecycleContext): TimelineEntry {
  return entryBy("deleted", ctx);
}

/**
 * The history line of a quote priced from the trucking tariffs, or of a margin below the floor a
 * manager approved. `comment` is the whole sentence ("Priced from tariff: Standard v3, +1 day,
 * 4 250 CZK"). Neither changes the status.
 */
export function pricingEntry(kind: "road_price" | "margin_approval", comment: string, ctx: LifecycleContext): TimelineEntry {
  return { ...entryBy(kind, ctx), comment };
}

/** A live shipment that names a quote in its Sales Number. */
export interface LinkedShipment {
  id: string;
  jobNumber: string;
}

/** What the shipments that name a quote make of it. */
export interface ShipmentLinkChange {
  /** False when the quote already knows exactly these shipments: there is nothing to write. */
  changed: boolean;
  state: LifecycleState;
  entries: TimelineEntry[];
  /** The shipment created from the quote made it Won. */
  becameWon: boolean;
  /** The status a quote went back to when the last shipment of a Won that a shipment had made was gone. */
  revertedTo: string | null;
  /** Why the shipment created from the quote did not make it Won. */
  note: string | null;
}

// Who a history line names when nobody did it: the link was repaired by the system.
const SYSTEM_USER = "System";

/**
 * Brings a quote in step with the shipments that name it - `live`, all of them, oldest first.
 * The quote is told the whole truth each time, never "link" or "unlink": the same list again
 * changes nothing, so a call that was lost is repaired by the next one.
 *
 * The link is the oldest shipment. The history gets a line for every shipment the quote did not
 * know yet and for every one it knew that is gone; which ones it knows is read from the history
 * itself (`timeline`, the stored data.timeline).
 *
 * `wonByShipmentId` - the shipment was created from this quote - makes an open quote Won, also
 * one shown as Expired, without inventing a sent date; a Lost quote is linked and stays Lost.
 * Such a Won is undone when no shipment names the quote any more: the quote returns to the
 * status it had, a Feedback quote with its sub-status. A Won set by hand is final and never
 * touched.
 *
 * `automatic`: nobody asked for this - the lines say "System" instead of a user.
 */
export function applyShipmentLinks(
  state: LifecycleState,
  timeline: unknown,
  live: LinkedShipment[],
  opts: { wonByShipmentId?: string; automatic?: boolean },
  ctx: LifecycleContext,
): ShipmentLinkChange {
  const history: Record<string, unknown>[] = Array.isArray(timeline) ? timeline.filter(isPlainObject) : [];
  const line = (kind: NonNullable<TimelineEntry["kind"]>): TimelineEntry =>
    opts.automatic ? { kind, at: ctx.at.toISOString(), user: SYSTEM_USER, auto: true } : entryBy(kind, ctx);

  // The shipments the quote knows, with their job numbers: those whose last line says "linked",
  // and the one it is linked to.
  const known = new Map<string, string>();
  for (const entry of history) {
    if (entry.kind !== "shipment" || typeof entry.shipmentId !== "string") continue;
    if (entry.action === "linked") known.set(entry.shipmentId, typeof entry.jobNumber === "string" ? entry.jobNumber : "");
    else known.delete(entry.shipmentId);
  }
  if (state.shipmentId && !known.has(state.shipmentId)) known.set(state.shipmentId, state.shipmentJobNumber ?? "");

  const entries: TimelineEntry[] = [];
  const gone: LinkedShipment[] = [];
  const liveIds = new Set<string>();
  for (const shipment of live) {
    liveIds.add(shipment.id);
    if (known.has(shipment.id)) continue;
    known.set(shipment.id, shipment.jobNumber);
    entries.push({
      ...line("shipment"),
      action: "linked",
      shipmentId: shipment.id,
      jobNumber: shipment.jobNumber,
      comment: `Shipment ${shipment.jobNumber} linked`,
    });
  }
  for (const [id, jobNumber] of known) {
    if (liveIds.has(id)) continue;
    gone.push({ id, jobNumber });
    entries.push({ ...line("shipment"), action: "removed", shipmentId: id, jobNumber, comment: `Shipment ${jobNumber} removed` });
  }

  const first = live.length ? live[0] : null;
  let next: LifecycleState = { ...state, shipmentId: first?.id ?? null, shipmentJobNumber: first?.jobNumber ?? null };
  let becameWon = false;
  let revertedTo: string | null = null;
  let note: string | null = null;

  const wonBy = live.find((shipment) => shipment.id === opts.wonByShipmentId);
  if (wonBy && next.status !== "won") {
    const shown = effectiveStatus(next.status, next.validUntil, ctx.today);
    if (OPEN.includes(shown) || shown === "expired") {
      // The order is a fact, so the quote is Won with everything marking it Won by hand stamps.
      const won = applyTransition(next, { to: "won" }, ctx);
      if (won.changed) {
        next = won.state;
        becameWon = true;
        // `from` is the status as stored: what the quote returns to should this shipment go.
        entries.push({
          ...line("status"),
          status: "won",
          from: state.status,
          shipmentId: wonBy.id,
          jobNumber: wonBy.jobNumber,
          comment: `Shipment ${wonBy.jobNumber} was created from this quote`,
        });
      }
    } else {
      note = `the quote is ${label(shown)} and stays ${label(shown)}`;
    }
  }

  if (!live.length && next.status === "won") {
    // The last status line tells who made the quote Won: only the system's carries a shipment.
    const statusLines = history.filter((entry) => (entry.kind === undefined || entry.kind === "status") && typeof entry.status === "string");
    const made = statusLines.length ? statusLines[statusLines.length - 1] : null;
    if (made?.status === "won" && typeof made.shipmentId === "string") {
      const back = typeof made.from === "string" && OPEN.includes(made.from) ? made.from : "draft";
      // The shipment whose removal left the quote without any; the one that made it Won when
      // the history already says that all are gone.
      const last = gone.length ? gone[gone.length - 1] : { id: made.shipmentId, jobNumber: typeof made.jobNumber === "string" ? made.jobNumber : "" };
      next = { ...next, status: back, substatus: null, decidedAt: null };
      revertedTo = back;
      entries.push({
        ...line("status"),
        status: back,
        shipmentId: last.id,
        jobNumber: last.jobNumber,
        comment: `Shipment ${last.jobNumber} removed - status back to ${label(back)}`,
      });
    }
  }

  const changed = entries.length > 0 || next.shipmentId !== state.shipmentId || next.shipmentJobNumber !== state.shipmentJobNumber;
  return { changed, state: next, entries, becameWon, revertedTo, note };
}

/** The moment up to which a last contact is old enough, at `now`, for a follow-up to be due: three days (72 hours) back. */
export function followUpDueBefore(now: Date): Date {
  return new Date(now.getTime() - FOLLOW_UP_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Whether the customer should be contacted again: the quote is with them (not expired) and the
 * last contact - or the sending, or for a quote that never got a sent date its creation - is
 * three days (72 hours) or more ago. List queries state the same rule in SQL
 * (salesQuote.repository), with the same moment.
 */
export function isFollowUpDue(state: LifecycleState, now: Date, today: string): boolean {
  if (!AWAITING.includes(effectiveStatus(state.status, state.validUntil, today))) return false;
  const since = state.lastContactAt ?? state.sentAt ?? state.createdAt;
  return since.getTime() <= followUpDueBefore(now).getTime();
}

/** When the customer last heard from us, for "Last contact 5 days ago". */
export function lastContact(state: LifecycleState): Date | null {
  return state.lastContactAt ?? state.sentAt;
}

/**
 * Whether the quote ever went out to the customer, as far as anything stored tells: a sent date,
 * or a status that proves it (SENT_EVIDENCE) - the one it is stored with, or one its history
 * (`timeline`, the stored data.timeline) shows it had: set by a line, or named by a line as the
 * status the quote left (`from`). A Won a shipment made proves nothing in the history: such a
 * quote returns to what it was when the shipment goes, and no sending was invented for it.
 * A quote that was set to Quoted without a sent date and left that status before lines said
 * what they left cannot be told from one that was never sent.
 */
export function wasEverSent(state: LifecycleState, timeline: unknown): boolean {
  const proves = (status: unknown) => typeof status === "string" && SENT_EVIDENCE.includes(status);
  if (state.firstSentAt !== null || proves(state.status)) return true;
  const history: Record<string, unknown>[] = Array.isArray(timeline) ? timeline.filter(isPlainObject) : [];
  return history.some((entry) => {
    const wonByShipment = entry.status === "won" && typeof entry.shipmentId === "string";
    return proves(entry.from) || (!wonByShipment && proves(entry.status));
  });
}

/**
 * The lifecycle keys of the JSON document that restate a column state, for readers that still
 * look into the document: what to set and which keys to remove. A key without a value is
 * removed, validityDays always (the validity is a date now). The win probability of a status
 * this code does not know is left as stored.
 */
export function mirrorOf(state: LifecycleState): { set: Record<string, unknown>; remove: string[] } {
  const set: Record<string, unknown> = { quoteStatus: state.status };
  const remove = ["validityDays"];
  const values: Record<string, string | null> = {
    substatus: state.substatus,
    lostReason: state.lostReason,
    lostComment: state.lostComment,
    sentAt: state.sentAt?.toISOString() ?? null,
    decidedAt: state.decidedAt?.toISOString() ?? null,
    validUntil: state.validUntil,
    salesOwner: state.ownerLabel || null,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value === null) remove.push(key);
    else set[key] = value;
  }
  if (isSettableStatus(state.status)) set.winProbability = WIN_PROBABILITY[state.status];
  return { set, remove };
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && !(typeof value === "string" && value.trim() === "");
}

/**
 * What a lifecycle write has to keep aside before it restates the mirror, as document keys to
 * set (nothing when there is nothing to keep). `state` is the stored one, before the change. A
 * date an old document holds in a form the adoption could not read left its column empty, so
 * restating the mirror from the columns would delete the only copy: it goes to
 * `lifecycleUnreadable`, once. The same for a history that is not a list, which goes to
 * `timelineUnreadable`.
 */
export function legacyUnreadable(state: LifecycleState, data: Record<string, unknown>): Record<string, unknown> {
  const already = isPlainObject(data.lifecycleUnreadable) ? data.lifecycleUnreadable : {};
  // validityDays only ever meant something through the date worked out from it.
  const columns: Record<string, unknown> = {
    sentAt: state.sentAt,
    decidedAt: state.decidedAt,
    validUntil: state.validUntil,
    validityDays: state.validUntil,
  };
  const found: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(columns)) {
    if (column === null && hasValue(data[key]) && !Object.hasOwn(already, key)) found[key] = data[key];
  }

  const keep: Record<string, unknown> = {};
  if (Object.keys(found).length) keep.lifecycleUnreadable = { ...already, ...found };
  if (hasValue(data.timeline) && !Array.isArray(data.timeline) && !hasValue(data.timelineUnreadable)) {
    keep.timelineUnreadable = data.timeline;
  }
  return keep;
}
