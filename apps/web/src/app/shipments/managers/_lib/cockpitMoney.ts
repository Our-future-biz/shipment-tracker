import type { OpsCockpitFilter } from "@/hooks/useShipmentsManagersCockpit";
import type { MoneyAmount, OpsMoneyPerson, OpsMoneyTiles, ShipmentsManagersMoney } from "@/hooks/useShipmentsManagersMoney";
import { salesManagersHref } from "@/app/sales/_lib/tabs";
import { formatAmount } from "@/lib/money";
import { EVERYONE, NOBODY, shipmentsManagersHref } from "./cockpitAddress";
import { filterValueOf, isNotUser, personName } from "./cockpitPeople";
import { cardWithSignal, familyOf, notKnownText, type ShownList, type SignalFamily, type SignalFigure } from "./cockpitSignals";

// The Money tab of Shipments → Managers (Council Outlay 11, step 4): what the money of the active
// jobs - and of the jobs invoiced in the last 90 days that still have money to look at - asks of a manager. The server judges every job (apps/api services/shipments
// lib/managersMoney) and sends tiles, the URGENT and ATTENTION cards and each person's money; this
// file words them. Its signal tiles are the cockpit's in kind - a tile counts the rows with a tag of
// its family and narrows the two cards to them (?msignal=) - so the narrowing itself is
// _lib/cockpitSignals'.
// D24: money is per currency, never added across currencies; the one CZK figure is the server's,
// shown with the rate it names. D29: what could not be read is "–", never 0.

/** The Money tab's signal tiles, in the order they are drawn: one per family of the server's money tags (MONEY_SIGNAL_KINDS). */
export const MONEY_FAMILIES: readonly SignalFamily[] = [
  {
    key: "margin",
    kinds: ["margin"],
    label: "Margin",
    hint: "A loss on a job in Billing or invoiced, a margin under 5 % or a profit under 1,000 CZK, a real cost more than 10 % and 2,000 CZK over its estimate, or costs with no selling line",
    note: "In CZK at the job's own rates, as Costs Breakdown shows it.",
  },
  {
    key: "not_invoiced",
    kinds: ["not_invoiced"],
    label: "Not invoiced",
    // The server's rule (lib/managersMoney inBillingSignals) goes by the work left to bill, whether or not some invoice exists already.
    hint: "In Billing for more than 2 working days with work still to invoice (an invoice may already be issued), or past its tax date and not released for billing - with the amount not yet invoiced",
  },
  { key: "unticked", kinds: ["unticked"], label: "Selling not ticked", hint: "A job in Billing with a valued selling line that is not ticked: it holds the job open" },
  {
    key: "cost_after_billing",
    kinds: ["cost_after_billing"],
    label: "Costs after billing",
    hint: "A supplier invoice booked in the last 30 days on a job that was already invoiced; urgent when it is above its estimate",
  },
  {
    key: "accrual",
    kinds: ["accrual"],
    label: "Estimates with no invoice",
    hint: "Estimates with no supplier invoice 30 days after the job's tax date; urgent from 60 days, or as soon as the job is in Billing or invoiced",
  },
  {
    key: "supplier_invoice",
    kinds: ["supplier_invoice"],
    label: "Supplier invoices",
    hint: "A supplier invoice waiting for approval for more than 2 working days, refused in the last 14 days, claimed, or approved and overdue",
    note: "They are approved on Accounts Payable.",
  },
  { key: "cost_claim", kinds: ["cost_claim"], label: "Cost claims", hint: "A cost claim open for more than 30 days; urgent when open for more than 60" },
  {
    key: "credit",
    kinds: ["credit"],
    label: "Customers over limit or overdue",
    hint: "The job's customer is over the credit limit or has overdue invoices; urgent once the job has arrived and is not released",
  },
  { key: "not_recharged", kinds: ["not_recharged"], label: "Not recharged", hint: "Demurrage, detention, storage or waiting bought on the job and not sold on" },
];

/** The money family an address names (?msignal=), or null for none. */
export const moneySignalOf = (value: string | null): SignalFamily | null => familyOf(MONEY_FAMILIES, value);

type Counted = Pick<ShipmentsManagersMoney, "tiles">;

/** What a money tile says on hover, under its own hint, when its family could not be judged. */
export const MONEY_SIGNAL_NOT_KNOWN = "Could not be read right now";

/**
 * Whether a money family could not be judged in this answer: the server names the kinds whose
 * part it could not read (`tiles.signalsNotKnown`) - their 0 among the counts says nothing. An
 * answer without the list (an older server) names none.
 */
export function isMoneySignalNotKnown(family: SignalFamily, tiles: Pick<OpsMoneyTiles, "signalsNotKnown">): boolean {
  const notKnown: readonly string[] = tiles.signalsNotKnown ?? [];
  return family.kinds.some((kind) => notKnown.includes(kind));
}

/**
 * What a money tile counts: the server's count of the rows carrying a tag of the family. Of a
 * family the server could not judge there is no figure ("–"), never 0; should it have found some
 * rows all the same, they are the least there are ("3+").
 */
export function moneySignalFigure(family: SignalFamily, money: Counted): SignalFigure {
  // An answer with no `signals` (an older server) counts none rather than crash.
  const signals: Record<string, number> | undefined = money.tiles.signals;
  // Every money family is one kind, so the kinds' counts are the family's.
  const count = family.kinds.reduce((sum, kind) => sum + (signals?.[kind] ?? 0), 0);
  if (!isMoneySignalNotKnown(family, money.tiles)) return { count, atLeast: false };
  return count > 0 ? { count, atLeast: true } : { count: null, atLeast: false };
}

/** What a Money card with no rows says while a part of the money could not be read: "nothing urgent" would be more than is known. */
export const MONEY_CARD_NOT_READ = {
  urgent: "No URGENT job found: part of the money could not be read",
  attention: "No ATTENTION job found: part of the money could not be read",
} as const;

/** What a narrowed card's window adds when rows were found of a family that was not all read: the count is the least there are. */
export const MONEY_CARD_AT_LEAST = "or more: could not be read right now";

/** A Money card as it is drawn. */
export interface MoneyCard<C> {
  card: C;
  /** The card has no count to show ("–"): it is narrowed to a family that could not be judged, and none was found. */
  countNotKnown: boolean;
}

/**
 * A Money card in the words of what it shows now, never "0 / nothing" for what was not read:
 *  - narrowed to a family the server could not judge (`tiles.signalsNotKnown`): with no row found
 *    it has no count and says "Could not be read right now"; with rows found they are the least
 *    there are, and its window says so;
 *  - not narrowed, with some family not judged: an empty card says no job was FOUND, and why;
 *  - otherwise it is the cockpit's card (cardWithSignal).
 */
export function moneyCard<C extends { window: string; empty: string; dialog: string }>(
  card: C,
  key: keyof typeof MONEY_CARD_NOT_READ,
  family: SignalFamily | null,
  tiles: Pick<OpsMoneyTiles, "signalsNotKnown">,
  list: Pick<ShownList<unknown>, "total" | "listed" | "cut"> | undefined,
): MoneyCard<C> {
  const shown = cardWithSignal(card, key, family, list);
  // Nothing is said of a card whose rows are not there yet.
  if (!list) return { card: shown, countNotKnown: false };
  if (family && isMoneySignalNotKnown(family, tiles)) {
    if (list.total > 0) return { card: { ...shown, window: `${shown.window} · ${MONEY_CARD_AT_LEAST}` }, countNotKnown: false };
    return { card: { ...shown, empty: MONEY_SIGNAL_NOT_KNOWN }, countNotKnown: true };
  }
  const someNotKnown = (tiles.signalsNotKnown ?? []).length > 0;
  if (!family && someNotKnown && list.total === 0) return { card: { ...shown, empty: MONEY_CARD_NOT_READ[key] }, countNotKnown: false };
  return { card: shown, countNotKnown: false };
}

/** "3 jobs", "1 job". */
const jobsText = (n: number): string => `${n} ${n === 1 ? "job" : "jobs"}`;

/** Amounts as the page shows them, one text per currency ("1,250.50 EUR"); null for amounts that were not read. */
export const moneyChips = (amounts: readonly MoneyAmount[] | null | undefined): string[] | null => (amounts ? amounts.map((a) => formatAmount(a.amount, a.currency)) : null);

/** The "Work not yet invoiced" block, in the words it shows. */
export interface NotYetInvoicedView {
  /** One per currency; [] when nothing waits to be invoiced; null when Invoicing could not be read. */
  chips: string[] | null;
  /** "in 14 jobs"; null when not known - and when nothing waits. */
  jobs: string | null;
  /** The one CZK figure and the rate it was worked out at, in the server's words; null when there is none - and when every amount is in CZK already. */
  czk: { amount: string; label: string } | null;
}

/**
 * Work not yet invoiced: per currency, in how many jobs, and the server's one CZK total with its
 * label exactly as sent ("at today's ČNB rate (18.11.)"). Nothing is added here: a currency with
 * no rate leaves no total rather than a total that lacks it. The total is shown only when some
 * amount is in another currency than CZK: beside CZK alone it would say the same figure twice.
 */
export function notYetInvoicedView(tiles: Pick<OpsMoneyTiles, "notYetInvoiced" | "notYetInvoicedCzk" | "notYetInvoicedJobs">): NotYetInvoicedView {
  const chips = moneyChips(tiles.notYetInvoiced);
  if (chips === null) return { chips: null, jobs: null, czk: null };
  const total = tiles.notYetInvoicedCzk;
  const converted = (tiles.notYetInvoiced ?? []).some((a) => a.currency.trim().toUpperCase() !== "CZK");
  return {
    chips,
    jobs: typeof tiles.notYetInvoicedJobs === "number" && tiles.notYetInvoicedJobs > 0 ? `in ${jobsText(tiles.notYetInvoicedJobs)}` : null,
    czk: total && converted ? { amount: formatAmount(total.amount, "CZK"), label: total.label } : null,
  };
}

/** A row of the Money tab's people table. A figure that was not read is null ("–" on the page). */
export interface MoneyPersonRow {
  /** The Handled By filter's value for the person: the e-mail, "nobody" for the jobs nobody handles. */
  key: string;
  name: string;
  /** The jobs nobody handles: not a person. */
  nobody: boolean;
  /** Handled By names somebody who is no longer a user - said only when the users are known (the answer's `isUser`). */
  notUser: boolean;
  /** The Money tab is narrowed to this person. */
  picked: boolean;
  notYetInvoiced: MoneyAmount[] | null;
  jobsAtLoss: number | null;
  estimatesOpen: number | null;
  supplierInvoicesWaiting: number | null;
  costClaimsOpen: number | null;
  /** The Money tab narrowed to the person, as the page is otherwise - each tab's own narrowing kept. */
  href: string;
}

/** What a person's row keeps of the page: its filters, and what each tab's cards are narrowed to. */
export type MoneyPage = OpsCockpitFilter & { signal?: string | null; msignal?: string | null };

/**
 * The people table's rows, in the server's order - the cockpit's; no ranking (D27). Who is no
 * longer a user is the answer's own word (`isUser`): while the users could not be read (null, or
 * an answer without the field) nobody is marked - not known is not "no".
 */
export function moneyPersonRows(people: readonly OpsMoneyPerson[], page: MoneyPage): MoneyPersonRow[] {
  return people.map((p) => {
    const key = filterValueOf(p);
    return {
      key,
      name: personName(p.handledBy),
      nobody: p.handledBy === "",
      notUser: isNotUser({ handledBy: p.handledBy, isUser: p.isUser ?? null }),
      picked: page.handledBy === key,
      // An answer that lacks a field (an older server) does not know it either.
      notYetInvoiced: p.notYetInvoiced ?? null,
      jobsAtLoss: p.jobsAtLoss ?? null,
      estimatesOpen: p.estimatesOpen ?? null,
      supplierInvoicesWaiting: p.supplierInvoicesWaiting ?? null,
      costClaimsOpen: p.costClaimsOpen ?? null,
      href: shipmentsManagersHref({ tab: "money", mode: page.mode, direction: page.direction, reports: page.reports, handledBy: key, signal: page.signal ?? null, msignal: page.msignal ?? null }),
    };
  });
}

/**
 * The Handled By select on the Money tab, from the Money answer's own people: Everyone, every
 * person the answer names - also somebody whose jobs all read Invoiced (no active job: no count
 * beside the name), since a cost can still come after billing - and Nobody. A person the address
 * names who is not among them (no job of this mode and direction, or the answer is not there
 * yet) is listed too, so the select always shows who the tab is narrowed to.
 */
export function moneyHandledByOptions(people: readonly OpsMoneyPerson[], handledBy: string | null): { value: string; label: string }[] {
  const active = (p: OpsMoneyPerson) => p.active ?? 0;
  const named = people.filter((p) => p.handledBy !== "");
  const nobody = people.find((p) => p.handledBy === "");
  const listed = new Set([EVERYONE, NOBODY, ...named.map((p) => p.handledBy)]);
  const missing = handledBy && !listed.has(handledBy) ? [{ value: handledBy, label: handledBy }] : [];
  const marks = (p: OpsMoneyPerson) => `${active(p) > 0 ? ` · ${active(p)} active` : ""}${isNotUser({ handledBy: p.handledBy, isUser: p.isUser ?? null }) ? " · not a user" : ""}`;
  return [
    { value: EVERYONE, label: "Everyone" },
    ...named.map((p) => ({ value: p.handledBy, label: `${p.handledBy}${marks(p)}` })),
    ...missing,
    { value: NOBODY, label: nobody && active(nobody) > 0 ? `Nobody · ${active(nobody)} active` : "Nobody" },
  ];
}

/** What the notes say when the server read fewer jobs than there are: more active jobs than its limit, or more invoiced ones of the last 90 days. */
export const MONEY_CAPPED = "More jobs than were read: the figures cover the 2,000 newest active jobs and the 1,000 newest invoiced ones of the last 90 days";

/** What the Money tab's cards and table say when the answer could not be loaded. */
export const MONEY_LOAD_FAILED = "Could not load the money.";

// The server's own lines for the margins it could not work out ("margin of 3 jobs: a ČNB rate is
// missing", "margin of 2 jobs: their rates are not fixed yet and could not be read").
const SERVER_SAYS_MARGIN = /^margin of \d+ jobs?\b/i;

/**
 * The notes under the Money tab: what keeps its figures from being whole. A read that stopped at
 * its limit, the holidays its working days could not use, what could not be read at all (the
 * server's words), and the jobs whose margin is not known - said here only when the server's
 * words do not already say it, never twice. Empty when there is nothing to say.
 */
export function moneyNotes(money: Pick<ShipmentsManagersMoney, "capped" | "holidaysKnown" | "notKnown" | "tiles">): string[] {
  const notKnown = money.notKnown ?? [];
  const marginNotKnown = notKnown.some((part) => SERVER_SAYS_MARGIN.test(part.trim())) ? 0 : (money.tiles.marginNotKnown ?? 0);
  return [
    // The server reads the newest 2,000 active jobs (COCKPIT_JOB_LIMIT), as for the cockpit, and
    // the newest 1,000 jobs invoiced in the last 90 days (MONEY_INVOICED_JOB_LIMIT): either can be cut.
    ...(money.capped ? [MONEY_CAPPED] : []),
    ...(money.holidaysKnown === false ? ["The company's holidays could not be read: working days skip weekends and public holidays only"] : []),
    ...(notKnown.length > 0 ? [`Not known right now: ${notKnownText(notKnown)}`] : []),
    ...(marginNotKnown > 0 ? [`Margin not known for ${jobsText(marginNotKnown)}: a ČNB rate is missing`] : []),
  ];
}

/** One queue's count as its hook reports it. */
interface Waiting {
  waiting: number;
  isLoading: boolean;
  isError: boolean;
}

/** A line of the Approvals tab that counts what is answered on another page, and leads there. */
export interface ApprovalLink {
  key: "billing" | "supplierInvoices";
  /** "3", "3+" when a part could not be read, "–" when none of it could. */
  count: string;
  /** What is counted, after the count: "billing approvals waiting". */
  words: string;
  /** Where they are answered, as the link names it. */
  where: string;
  href: string;
}

// Where each line leads: the Billing approvals tab of Sales → Managers; Accounts Payable's To
// approve tab, as Billing approvals itself links there.
const APPROVAL_PLACES: Record<ApprovalLink["key"], Pick<ApprovalLink, "where" | "href">> = {
  billing: { where: "Sales → Managers → Billing approvals", href: salesManagersHref({ tab: "billing" }) },
  supplierInvoices: { where: "Accounts Payable", href: "/accounts-payable?tab=to_approve" },
};

/**
 * The Approvals tab's two lines for what a manager answers elsewhere: the billing approvals of
 * Sales → Managers (partial credit notes and issue-day invoice changes, read apart) and the
 * supplier invoices to approve on Accounts Payable. A line with nothing waiting is not drawn, nor
 * one still loading; a count that could not be read is "–" ("3+" when only a part of it was) -
 * never 0, which would hide the line.
 */
export function approvalLinks(billing: readonly Waiting[], supplierInvoices: Waiting): ApprovalLink[] {
  const line = (key: ApprovalLink["key"], parts: readonly Waiting[], one: string, many: string): ApprovalLink[] => {
    const settled = parts.filter((p) => p.isError || !p.isLoading);
    // Nothing is said before every part has answered or failed: a count that grows on screen reads as news.
    if (settled.length < parts.length) return [];
    const read = parts.filter((p) => !p.isError);
    const waiting = read.reduce((sum, p) => sum + p.waiting, 0);
    const place = APPROVAL_PLACES[key];
    if (read.length === 0) return [{ key, count: "–", words: many, ...place }];
    if (read.length < parts.length) return [{ key, count: `${waiting}+`, words: many, ...place }];
    return waiting > 0 ? [{ key, count: String(waiting), words: waiting === 1 ? one : many, ...place }] : [];
  };
  return [
    ...line("billing", billing, "billing approval waiting", "billing approvals waiting"),
    ...line("supplierInvoices", [supplierInvoices], "supplier invoice to approve", "supplier invoices to approve"),
  ];
}
