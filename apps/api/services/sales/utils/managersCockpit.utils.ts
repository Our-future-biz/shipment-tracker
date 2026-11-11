import { addDays, businessDay } from "../../../lib/businessDate";
import { plainSalesReference } from "../../../lib/salesReference";
import { workingDaysAfter } from "../../../lib/workingDays";
import type { SalesManagersFacts, SalesManagersQuoteFact } from "../../quotes/interfaces/interfaces";
import type {
  SalesCockpitAudit,
  SalesCockpitList,
  SalesCockpitMode,
  SalesCockpitRow,
  SalesCockpitTag,
  SalesCockpitTeam,
  SalesCockpitTiles,
  SalesManagersCockpit,
} from "../interfaces/interfaces";
import {
  APPROVAL_RATE_MIN_ANSWERS,
  APPROVAL_RUBBER_STAMP_PERCENT,
  APPROVAL_TOO_STRICT_PERCENT,
  APPROVED_NOT_SENT_HOURS,
  BIG_DEAL_PROFIT_CZK,
  BIG_DEAL_SELLING_CZK,
  CARGO_READY_DAYS,
  COCKPIT_LIST_LIMIT,
  DRAFT_AIR_WORKING_DAYS,
  DRAFT_WORKING_DAYS,
  EXPIRED_DAYS,
  NO_CONTACT_DAYS,
  READY_TO_SEND_WORKING_DAYS,
  TASK_OVERDUE_DAYS,
  VALIDITY_ATTENTION_DAYS,
  VALID_UNTIL_TILE_DAYS,
  WAREHOUSE_INQUIRY_HOURS,
  WON_LOSS_DAYS,
  WON_NO_SHIPMENT_WORKING_DAYS,
} from "./cockpitThresholds";

// The Sales managers' cockpit, worked out from the quotes service's facts and the open follow-up
// tasks (Council Outlay 6, step 2: the signals the quote rows give today). Pure: no database,
// tested in tests/managersCockpit.utils.test.ts.
//
//   tiles   counts over the quotes of the chosen freight mode
//   cards   a quote appears once: in URGENT when any of its signals is urgent, else in
//           ATTENTION, with all its signals as tags; the most urgent first. A task that names a
//           quote listed adds its tag to that quote; any other task is a row of its own.
// Today is the Prague business day of `now` on the server, never the browser's.

/** An open follow-up task as the cockpit reads it. */
export interface CockpitTask {
  id: string;
  type: string;
  note: string;
  dueDate: string | null;
  assigneeUserId: string | null;
  assigneeName: string;
  customerLabel: string;
  quoteNumber: string | null;
}

export interface SalesCockpitInput {
  quotes: SalesManagersQuoteFact[];
  tasks: CockpitTask[];
  capped: boolean;
  mode: SalesCockpitMode;
  now: Date;
  /** The quotes service's lines and questions that belong to no quote read (step 6). */
  lines?: Pick<SalesManagersFacts, "audit" | "team" | "inquiriesOnClosedQuotes" | "answersNobodyReceived">;
}

/** The category of a lost reason, as the quote's Lost dialog groups them (web sales/_lib/types LOST_REASONS). */
const LOST_CATEGORY: Record<string, string> = Object.fromEntries(
  Object.entries({
    Pricing: ["Price too high", "Competitor cheaper", "Margin too low"],
    Operational: ["Transit time too long", "No suitable schedule", "Capacity unavailable"],
    Customer: ["Shipment canceled", "Customer postponed shipment", "Customer inactive", "No response"],
    Internal: ["Quote sent too late", "Missing follow-up", "Incorrect quotation"],
    Commercial: ["Existing supplier retained", "Lost tender", "Customer chose direct carrier"],
  }).flatMap(([category, reasons]) => reasons.map((r) => [r, category])),
);
const LOST_CATEGORIES = new Set(Object.values(LOST_CATEGORY));
/** The category of a stored lost reason: "Customer: No response" as the Lost dialog writes it, or a bare reason. */
export function lostCategoryOf(stored: string): string {
  const reason = stored.trim();
  if (!reason) return "Not given";
  const category = reason.split(":")[0]!.trim();
  return LOST_CATEGORIES.has(category) ? category : (LOST_CATEGORY[reason] ?? "Other");
}

const OPEN = new Set(["draft", "ready_to_send", "quoted", "feedback", "revised"]);
const AWAITING = new Set(["quoted", "feedback"]);
const UNSENT = new Set(["draft", "ready_to_send", "revised"]);
const DAY = 86_400_000;
const HOUR = 3_600_000;

const MODES: Record<Exclude<SalesCockpitMode, "all">, readonly string[]> = {
  sea: ["Sea FCL", "Sea LCL", "Sea Break Bulk"],
  air: ["Air"],
  rail: ["Rail"],
  road: ["Road"],
};

/** Whether a quote of this freight mode is counted in `mode`. */
export function inMode(serviceType: string, mode: SalesCockpitMode): boolean {
  return mode === "all" || MODES[mode].includes(serviceType);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** "04.11." of a YYYY-MM-DD day. */
const dm = (ymd: string) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}.`;
/** Calendar days from `from` to `to` (YYYY-MM-DD), negative when `to` is earlier. */
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
/** Working days after `from` up to and including `to`: how many working days have passed since `from`. */
export const workingDaysSince = (from: string, to: string): number => workingDaysAfter(from, to);
// The Prague day of a moment; null for none, or one that is no date (a history line a browser wrote).
const dayOf = (at: string | null) => {
  const time = at ? Date.parse(at) : NaN;
  return Number.isFinite(time) ? businessDay(new Date(time)) : null;
};
// A margin that moved by less than this since it was asked about has not changed.
const CHANGED_TOLERANCE_CZK = 1;
/** "45 min", "3 h", "1 day 2 h" of office minutes (a day = 9 office hours). */
export function officeTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 9) return `${hours} h`;
  const days = Math.floor(hours / 9);
  const rest = hours % 9;
  return `${plural(days, "office day")}${rest ? ` ${rest} h` : ""}`;
}
const PRAGUE_STAMP = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** "04.11. 14:00" (Prague) of an ISO time. */
function stampText(iso: string): string {
  const p = Object.fromEntries(PRAGUE_STAMP.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day}.${p.month}. ${p.hour}:${p.minute}`;
}

interface Signal extends SalesCockpitTag {
  /** Lower comes first. */
  rank: number;
}
const urgent = (rank: number, text: string): Signal => ({ rank, text, urgent: true });
const attention = (rank: number, text: string): Signal => ({ rank, text, urgent: false });

/** The signals of one quote on `today`. */
export function quoteSignals(q: SalesManagersQuoteFact, today: string, now: Date): Signal[] {
  const out: Signal[] = [];
  const open = OPEN.has(q.shownStatus);
  const readyIn = q.readyDate ? daysBetween(today, q.readyDate) : null;
  const cargoReady = readyIn !== null && readyIn <= CARGO_READY_DAYS;
  const contactDays = q.lastContactAt ? daysBetween(dayOf(q.lastContactAt)!, today) : null;

  // URGENT
  if (AWAITING.has(q.shownStatus) && q.validUntil === today) {
    out.push(urgent(1, contactDays !== null && contactDays > 0 ? `Expires today · last contact ${plural(contactDays, "day")} ago` : "Expires today"));
  }
  // "04.11." ahead, "since 20.10." once the day has passed.
  const readyDay = cargoReady ? `${readyIn! < 0 ? "since " : ""}${dm(q.readyDate!)}` : "";
  if (UNSENT.has(q.shownStatus) && cargoReady) out.push(urgent(2, `Cargo ready ${readyDay}, no quotation out`));
  if (q.status === "won" && !q.shipmentId && cargoReady) out.push(urgent(3, `Won, cargo ready ${readyDay}, no shipment`));
  if (q.shownStatus === "feedback" && q.followUpDue && (q.sellingCzk >= BIG_DEAL_SELLING_CZK || (q.marginCzk ?? 0) >= BIG_DEAL_PROFIT_CZK)) {
    out.push(urgent(4, "Big deal · Feedback · follow-up due"));
  }
  // A Won quote's revision stays Won while its prices change, so no send gate sees them (Council Outlay 6 U2).
  if (q.status === "won" && q.wonRevision && q.belowFloor) out.push(urgent(5, "Won revision below its floor, not approved"));
  const wonDay = dayOf(q.decidedAt);
  if (q.status === "won" && q.marginCzk !== null && q.marginCzk < 0 && wonDay && daysBetween(wonDay, today) <= WON_LOSS_DAYS) {
    out.push(urgent(5, "Won at a loss"));
  }
  // A customer who owes too much, at the moment the quote goes out or the job is to start (D17: warn).
  const credit = q.credit;
  if (credit && (q.shownStatus === "ready_to_send" || (q.status === "won" && !q.shipmentId))) {
    const parts = [credit.overLimitCzk !== null ? "Credit limit exceeded" : "", credit.overdueCount > 0 ? plural(credit.overdueCount, "invoice") + " overdue" : ""].filter(Boolean);
    if (parts.length) out.push(urgent(6, parts.join(" · ")));
  }

  // A rep's question to a manager: urgent once the admins are told too (4 office hours, or the
  // customer's moment close), and when the quote got worse than what was asked about.
  const mi = q.marginInquiry;
  if (mi) {
    const waited = `Discount waiting ${officeTime(mi.waitedOfficeMinutes)}${mi.needsBy ? ` · needs it by ${stampText(mi.needsBy)}` : ""}`;
    out.push(mi.escalated ? urgent(0, waited) : attention(9, waited));
    if (mi.askedMarginCzk !== null && q.marginCzk !== null && q.marginCzk < mi.askedMarginCzk - CHANGED_TOLERANCE_CZK) {
      out.push(urgent(0, `Changed since asked · margin now ${Math.round(q.marginCzk).toLocaleString("en-US")} CZK`));
    }
  }

  // ATTENTION
  if (open && q.belowFloor && !mi) out.push(attention(10, q.marginCzk === null ? "Margin unknown · can't be sent" : "Below margin floor, not approved"));
  if (open && q.approvalLapsed) out.push(attention(10, `Approval no longer covers it: ${q.approvalLapsed}`));
  if (UNSENT.has(q.shownStatus) && q.approvalAt) {
    const hours = Math.floor((now.getTime() - Date.parse(q.approvalAt)) / HOUR);
    if (hours >= APPROVED_NOT_SENT_HOURS) out.push(attention(10, `Approved, not sent ${hours} h`));
  }
  if (AWAITING.has(q.shownStatus) && q.validUntil && q.validUntil > today && daysBetween(today, q.validUntil) <= VALIDITY_ATTENTION_DAYS) {
    out.push(attention(11, `Valid until in ${plural(daysBetween(today, q.validUntil), "day")}`));
  }
  if (open && q.warehouseInquiry) {
    const hours = Math.floor((now.getTime() - Date.parse(q.warehouseInquiry.requestedAt)) / HOUR);
    if (q.warehouseInquiry.status === "pending" && hours >= WAREHOUSE_INQUIRY_HOURS) out.push(attention(12, `Warehouse asked ${hours} h ago`));
    if (q.warehouseInquiry.status === "rejected") out.push(attention(12, "Warehouse rejected the heavy pieces"));
  }
  if (q.status === "won" && !q.shipmentId && !cargoReady && wonDay) {
    const since = workingDaysSince(wonDay, today);
    if (since >= WON_NO_SHIPMENT_WORKING_DAYS) out.push(attention(13, `Won ${plural(since, "working day")} ago, no shipment`));
  }
  if (q.shownStatus === "draft" && !q.firstSentAt) {
    const since = workingDaysSince(dayOf(q.createdAt)!, today);
    const limit = q.serviceType === "Air" ? DRAFT_AIR_WORKING_DAYS : DRAFT_WORKING_DAYS;
    if (since >= limit) out.push(attention(14, `Draft ${plural(since, "working day")}, never sent`));
  }
  if (q.shownStatus === "ready_to_send") {
    const since = dayOf(q.statusSince);
    if (since && workingDaysSince(since, today) >= READY_TO_SEND_WORKING_DAYS) out.push(attention(14, `Ready to Send since ${dm(since)}`));
  }
  if (AWAITING.has(q.shownStatus) && contactDays !== null && contactDays >= NO_CONTACT_DAYS) out.push(attention(15, `No contact ${plural(contactDays, "day")}`));
  if (q.shownStatus === "expired" && q.validUntil) {
    const ago = daysBetween(q.validUntil, today);
    if (ago <= EXPIRED_DAYS) out.push(attention(16, `Expired ${plural(ago, "day")} ago, no answer recorded`));
  }
  if (open && !q.ownerUserId) out.push(attention(17, "Quoted by nobody"));
  if (q.shownStatus === "ready_to_send" && q.marginProblem && !q.belowFloor) out.push(attention(18, "Margin unknown: a ČNB rate is missing"));
  return out;
}

/** The signals of one open task on `today`. */
export function taskSignals(t: CockpitTask, today: string): Signal[] {
  const out: Signal[] = [];
  const late = t.dueDate ? daysBetween(t.dueDate, today) : null;
  if (late !== null && late >= TASK_OVERDUE_DAYS) out.push(attention(19, `${t.type} overdue ${plural(late, "day")}`));
  if (!t.assigneeUserId) out.push(attention(19, `${t.type} task unassigned`));
  return out;
}

interface Ranked {
  row: SalesCockpitRow;
  urgent: boolean;
  rank: number;
}

function ranked(row: Omit<SalesCockpitRow, "tags">, signals: Signal[]): Ranked | null {
  if (!signals.length) return null;
  const isUrgent = signals.some((s) => s.urgent);
  const ordered = [...signals].sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.rank - b.rank);
  const lead = ordered.filter((s) => s.urgent === isUrgent);
  return { row: { ...row, tags: ordered.map(({ text, urgent: u }) => ({ text, urgent: u })) }, urgent: isUrgent, rank: Math.min(...lead.map((s) => s.rank)) };
}

function card(rows: Ranked[]): SalesCockpitList {
  const sorted = [...rows].sort((a, b) => a.rank - b.rank || b.row.ref.localeCompare(a.row.ref));
  return { total: sorted.length, rows: sorted.slice(0, COCKPIT_LIST_LIMIT).map((r) => r.row) };
}

const quoteRow = (q: SalesManagersQuoteFact): Omit<SalesCockpitRow, "tags"> => ({
  kind: "quote",
  id: q.quoteNumber,
  ref: q.quoteNumber,
  status: q.shownStatus,
  serviceType: q.serviceType,
  customer: q.customer,
  ownerName: q.ownerName,
  sellingCzk: q.sellingCzk,
});

const taskRow = (t: CockpitTask): Omit<SalesCockpitRow, "tags"> => ({
  kind: "task",
  id: t.id,
  ref: t.customerLabel || "Follow-up task",
  status: t.type,
  serviceType: "",
  customer: t.note,
  ownerName: t.assigneeName,
  sellingCzk: null,
});

export function buildSalesCockpit(input: SalesCockpitInput): SalesManagersCockpit {
  const { now, mode } = input;
  const today = businessDay(now);
  const monthStart = `${today.slice(0, 8)}01`;
  const quotes = input.quotes.filter((q) => inMode(q.serviceType, mode));
  const open = quotes.filter((q) => OPEN.has(q.shownStatus));
  const decidedThisMonth = (status: string) => quotes.filter((q) => q.status === status && (dayOf(q.decidedAt) ?? "") >= monthStart).length;
  const validBy = addDays(today, VALID_UNTIL_TILE_DAYS);
  const tiles: SalesCockpitTiles = {
    openQuotes: open.length,
    openSellingCzk: Math.round(open.reduce((sum, q) => sum + q.sellingCzk, 0)),
    followUpDue: quotes.filter((q) => q.followUpDue).length,
    draftsToFinish: open.filter((q) => q.shownStatus === "draft" && !q.firstSentAt).length,
    validSoon: open.filter((q) => !!q.validUntil && q.validUntil >= today && q.validUntil <= validBy).length,
    noOwner: open.filter((q) => !q.ownerUserId).length,
    awaitingApproval: quotes.filter((q) => !!q.marginInquiry).length,
    wonThisMonth: decidedThisMonth("won"),
    lostThisMonth: decidedThisMonth("lost"),
  };

  // A task naming a quote of the list adds to that quote. Any other task is a row of its own, in
  // "All" only: it has no freight mode to be filtered by.
  // Matched without the Freight Mode letters: a task that still names the quote as it read before
  // its letters changed is that quote's (lib/salesReference).
  const byPlainQuote = new Map(quotes.map((q) => [plainSalesReference(q.quoteNumber), q.quoteNumber]));
  const taskTags = new Map<string, Signal[]>();
  const taskRows: Ranked[] = [];
  for (const t of input.tasks) {
    const signals = taskSignals(t, today);
    if (!signals.length) continue;
    const quoteNumber = t.quoteNumber ? byPlainQuote.get(plainSalesReference(t.quoteNumber)) : undefined;
    if (quoteNumber) {
      taskTags.set(quoteNumber, [...(taskTags.get(quoteNumber) ?? []), ...signals]);
    } else if (mode === "all") {
      const r = ranked(taskRow(t), signals);
      if (r) taskRows.push(r);
    }
  }

  // A question nobody can act on any more, or an answer nobody got: on its quote when listed, a
  // row of its own in "All" when the quote is no longer read (deleted, replaced, long closed).
  const extra = new Map<string, Signal[]>();
  const addExtra = (quoteNumber: string, s: Signal) => extra.set(quoteNumber, [...(extra.get(quoteNumber) ?? []), s]);
  for (const n of input.lines?.inquiriesOnClosedQuotes ?? []) addExtra(n, attention(9, "Inquiry on a closed quote · decide or close it"));
  for (const n of input.lines?.answersNobodyReceived ?? []) addExtra(n, attention(9, "Answer nobody received · tell the new owner"));
  const read = new Set(input.quotes.map((q) => q.quoteNumber));
  const loose: Ranked[] = [];
  for (const [quoteNumber, signals] of extra) {
    if (read.has(quoteNumber) || mode !== "all") continue;
    const r = ranked({ kind: "quote", id: quoteNumber, ref: quoteNumber, status: "", serviceType: "", customer: "", ownerName: "", sellingCzk: null }, signals);
    if (r) loose.push(r);
  }

  const rows = [
    ...quotes.map((q) => ranked(quoteRow(q), [...quoteSignals(q, today, now), ...(taskTags.get(q.quoteNumber) ?? []), ...(extra.get(q.quoteNumber) ?? [])])),
    ...taskRows,
    ...loose,
  ].filter((r): r is Ranked => r !== null);

  return {
    asOf: now.toISOString(),
    today,
    mode,
    tiles,
    urgent: card(rows.filter((r) => r.urgent)),
    attention: card(rows.filter((r) => !r.urgent)),
    health: {
      marginUnknown: open.filter((q) => !!q.marginProblem).length,
      sentNoCustomer: open.filter((q) => !!q.firstSentAt && !q.customerId).length,
      capped: input.capped,
    },
    audit: input.lines ? auditLine(input.lines.audit, input.quotes) : null,
    team: input.lines ? teamLine(input.lines.team) : null,
  };
}

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

function auditLine(a: SalesManagersFacts["audit"], quotes: SalesManagersQuoteFact[]): SalesCockpitAudit {
  return { ...a, approvalsLapsed: quotes.filter((q) => OPEN.has(q.shownStatus) && !!q.approvalLapsed).length };
}

/** The team line of the quotes service's figures (H3). */
export function teamLine(t: SalesManagersFacts["team"]): SalesCockpitTeam {
  const byCategory = new Map<string, number>();
  for (const r of t.lostReasons) byCategory.set(lostCategoryOf(r.reason), (byCategory.get(lostCategoryOf(r.reason)) ?? 0) + r.count);
  const answered = t.approved + t.rejected;
  const rate = percent(t.approved, answered);
  return {
    days: t.days,
    won: t.won,
    lost: t.lost,
    hitRatePercent: percent(t.won, t.won + t.lost),
    sent: t.sent,
    medianHoursToFirstSent: t.medianHoursToFirstSent,
    lostByCategory: [...byCategory].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
    // Quotes asked about per quote sent: a quote asked about again, or not sent yet, can take it past 100.
    neededApprovalPercent: t.sent > 0 ? Math.min(100, percent(t.asked, t.sent)!) : null,
    approvalRatePercent: rate,
    approvalWarning:
      rate === null || answered < APPROVAL_RATE_MIN_ANSWERS ? null : rate > APPROVAL_RUBBER_STAMP_PERCENT ? "rubber_stamp" : rate < APPROVAL_TOO_STRICT_PERCENT ? "too_strict" : null,
  };
}
