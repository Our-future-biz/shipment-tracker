import { describe, expect, it } from "vitest";
import type { OpsMoneyPerson, OpsMoneyRow, OpsMoneyTiles, ShipmentsManagersMoney } from "@/hooks/useShipmentsManagersMoney";
import { handledByOf, tabOf } from "./cockpitAddress";
import {
  MONEY_CAPPED,
  MONEY_CARD_AT_LEAST,
  MONEY_CARD_NOT_READ,
  MONEY_FAMILIES,
  MONEY_LOAD_FAILED,
  MONEY_SIGNAL_NOT_KNOWN,
  approvalLinks,
  isMoneySignalNotKnown,
  moneyCard,
  moneyChips,
  moneyHandledByOptions,
  moneyNotes,
  moneyPersonRows,
  moneySignalFigure,
  moneySignalOf,
  notYetInvoicedView,
} from "./cockpitMoney";
import { SIGNAL_FAMILIES, figureText, listWithSignal, tagsShown, type SignalFamily } from "./cockpitSignals";

// The families of the server's money tags (apps/api services/shipments/lib/managersMoney MONEY_SIGNAL_KINDS).
const SERVER_KINDS = ["margin", "not_invoiced", "unticked", "cost_after_billing", "accrual", "supplier_invoice", "cost_claim", "credit", "not_recharged"];

const family = (key: string): SignalFamily => {
  const found = MONEY_FAMILIES.find((f) => f.key === key);
  if (!found) throw new Error(`no money family ${key}`);
  return found;
};

const zeros = Object.fromEntries(SERVER_KINDS.map((k) => [k, 0]));
const tiles = (over: Partial<OpsMoneyTiles> = {}): OpsMoneyTiles => ({
  notYetInvoiced: [],
  notYetInvoicedCzk: null,
  notYetInvoicedJobs: 0,
  signals: { ...zeros },
  signalsNotKnown: [],
  marginNotKnown: 0,
  ...over,
});

const person = (handledBy: string, over: Partial<OpsMoneyPerson> = {}): OpsMoneyPerson => ({
  handledBy,
  isUser: handledBy === "" ? null : true,
  active: 1,
  notYetInvoiced: [],
  jobsAtLoss: 0,
  estimatesOpen: 0,
  supplierInvoicesWaiting: 0,
  costClaimsOpen: 0,
  ...over,
});

/** What Invoicing leaves when it could not be read at all. */
const invoicingNotRead = { notYetInvoiced: null, jobsAtLoss: null, estimatesOpen: null, supplierInvoicesWaiting: null } as const;

let seq = 0;
const row = (...kinds: string[]): OpsMoneyRow => ({
  id: `id-${++seq}`,
  jobNumber: `CZ${String(seq).padStart(8, "0")}`,
  customer: "",
  mode: "sea",
  tradeDirection: "Import",
  status: "Billing",
  handledBy: "",
  holidayCover: "",
  invoiced: false,
  tags: kinds.map((kind) => ({ text: kind, urgent: false, kind })),
});

const everyone = { mode: "all", direction: "all", handledBy: null, reports: "all" } as const;

describe("Shipments → Managers, Money: the signal tiles", () => {
  it("has one tile per family of the server's money tags, under the labels the page shows", () => {
    expect(MONEY_FAMILIES.map((f) => f.label)).toEqual([
      "Margin",
      "Not invoiced",
      "Selling not ticked",
      "Costs after billing",
      "Estimates with no invoice",
      "Supplier invoices",
      "Cost claims",
      "Customers over limit or overdue",
      "Not recharged",
    ]);
    expect([...MONEY_FAMILIES.flatMap((f) => f.kinds)].sort()).toEqual([...SERVER_KINDS].sort());
    // A family is its kind: the address names what the server names.
    for (const f of MONEY_FAMILIES) expect(f.kinds).toEqual([f.key]);
    for (const f of MONEY_FAMILIES) expect(f.hint).not.toBe("");
  });

  it("words the Not invoiced tile as the server's rule: work left to bill, whether or not an invoice was issued already", () => {
    const hint = moneySignalOf("not_invoiced")!.hint;
    expect(hint).toBe(
      "In Billing for more than 2 working days with work still to invoice (an invoice may already be issued), or past its tax date and not released for billing - with the amount not yet invoiced",
    );
    expect(hint).not.toContain("with no invoice");
  });

  it("reads the family the address names (?msignal=), and nothing for anything else", () => {
    expect(moneySignalOf("margin")?.label).toBe("Margin");
    expect(moneySignalOf(" Cost_Claim ")?.key).toBe("cost_claim");
    expect(moneySignalOf("credit")?.label).toBe("Customers over limit or overdue");
    expect(moneySignalOf(null)).toBeNull();
    expect(moneySignalOf("")).toBeNull();
    // The Cockpit's families are another tab's (?signal=).
    expect(moneySignalOf("cutoff")).toBeNull();
    expect(moneySignalOf("todo")).toBeNull();
  });

  it("is told apart from the Cockpit's ?signal= by the families, not by luck: only credit is a kind of both, and it is no Cockpit tile", () => {
    const cockpitKeys = new Set(SIGNAL_FAMILIES.flatMap((f) => [f.key, ...f.kinds]));
    expect(MONEY_FAMILIES.filter((f) => cockpitKeys.has(f.key))).toEqual([]);
  });

  it("counts a tile by the server's count of the rows with its kind", () => {
    const money = { tiles: tiles({ signals: { ...zeros, margin: 4, accrual: 1 } }) };
    expect(moneySignalFigure(family("margin"), money)).toEqual({ count: 4, atLeast: false });
    expect(moneySignalFigure(family("accrual"), money)).toEqual({ count: 1, atLeast: false });
    expect(moneySignalFigure(family("credit"), money)).toEqual({ count: 0, atLeast: false });
    expect(figureText(moneySignalFigure(family("credit"), money))).toBe("0");
  });

  it("counts none - not a crash - for an answer with no signals, or without the family", () => {
    const money = { tiles: { ...tiles(), signals: undefined as never } };
    expect(moneySignalFigure(family("margin"), money)).toEqual({ count: 0, atLeast: false });
    expect(moneySignalFigure(family("margin"), { tiles: tiles({ signals: {} }) })).toEqual({ count: 0, atLeast: false });
  });

  it("narrows the Money cards with the Cockpit's own helpers", () => {
    const rows = [row("margin"), row("accrual", "margin"), row("credit")];
    const narrowed = listWithSignal({ total: 320, rows }, family("margin"));
    expect(narrowed.rows).toEqual([rows[0], rows[1]]);
    expect(narrowed).toMatchObject({ total: 2, listed: 3, cut: true });
    // The reason a row is listed is never behind "+N more".
    expect(tagsShown(rows[1]!.tags, family("margin"), 1).shown.map((t) => t.kind)).toEqual(["margin"]);
  });
});

describe("Shipments → Managers, Money: a tile the server could not judge", () => {
  it("shows no figure - never 0 - for a kind the answer lists as not known, and the count for every other", () => {
    const money = { tiles: tiles({ signals: { ...zeros, credit: 2 }, signalsNotKnown: ["margin", "not_recharged", "cost_claim"] }) };
    for (const key of ["margin", "not_recharged", "cost_claim"]) {
      expect(isMoneySignalNotKnown(family(key), money.tiles)).toBe(true);
      expect(moneySignalFigure(family(key), money)).toEqual({ count: null, atLeast: false });
      expect(figureText(moneySignalFigure(family(key), money))).toBe("–");
    }
    for (const key of ["not_invoiced", "unticked", "cost_after_billing", "accrual", "supplier_invoice"]) {
      expect(isMoneySignalNotKnown(family(key), money.tiles)).toBe(false);
      expect(figureText(moneySignalFigure(family(key), money))).toBe("0");
    }
    expect(figureText(moneySignalFigure(family("credit"), money))).toBe("2");
  });

  it("goes by the server's list alone: a null elsewhere in the answer makes no tile unknown", () => {
    // Invoicing's amounts not read, and the server still judged every family it lists none of.
    const money = { tiles: tiles({ notYetInvoiced: null, notYetInvoicedJobs: null, marginNotKnown: null, signals: { ...zeros, margin: 1 } }) };
    expect(MONEY_FAMILIES.some((f) => isMoneySignalNotKnown(f, money.tiles))).toBe(false);
    expect(figureText(moneySignalFigure(family("margin"), money))).toBe("1");
    expect(figureText(moneySignalFigure(family("accrual"), money))).toBe("0");
  });

  it("with every family not known - Invoicing, the cost claims and the credit all unread - has no figure at all", () => {
    const money = { tiles: tiles({ signalsNotKnown: [...SERVER_KINDS] }) };
    expect(MONEY_FAMILIES.map((f) => figureText(moneySignalFigure(f, money)))).toEqual(Array(9).fill("–"));
  });

  it("shows rows found of a family it lists all the same as the least there are", () => {
    const money = { tiles: tiles({ signals: { ...zeros, cost_after_billing: 3 }, signalsNotKnown: ["cost_after_billing"] }) };
    expect(moneySignalFigure(family("cost_after_billing"), money)).toEqual({ count: 3, atLeast: true });
    expect(figureText(moneySignalFigure(family("cost_after_billing"), money))).toBe("3+");
  });

  it("names none for an answer without the list (an older server), and ignores a kind it has no tile for", () => {
    const old = { ...tiles(), signalsNotKnown: undefined as never };
    expect(MONEY_FAMILIES.some((f) => isMoneySignalNotKnown(f, old))).toBe(false);
    expect(figureText(moneySignalFigure(family("margin"), { tiles: old }))).toBe("0");
    expect(MONEY_FAMILIES.some((f) => isMoneySignalNotKnown(f, tiles({ signalsNotKnown: ["something_new"] })))).toBe(false);
  });

  it("says why on hover", () => {
    expect(MONEY_SIGNAL_NOT_KNOWN).toBe("Could not be read right now");
  });
});

describe("Shipments → Managers, Money: a card never says nothing for what was not read", () => {
  const card = { title: "Urgent", window: "money at risk now", empty: "Nothing urgent in the money.", dialog: "URGENT · money" };
  const list = (total: number, over: { listed?: number; cut?: boolean } = {}) => ({ total, listed: over.listed ?? total, cut: over.cut ?? false });
  const allRead = tiles();
  const marginNotRead = tiles({ signalsNotKnown: ["margin", "not_recharged"] });

  it("is the card as it is while everything was read", () => {
    expect(moneyCard(card, "urgent", null, allRead, list(0))).toEqual({ card, countNotKnown: false });
    expect(moneyCard(card, "urgent", null, allRead, list(4))).toEqual({ card, countNotKnown: false });
  });

  it("narrowed to a family that was read, is the cockpit's narrowed card", () => {
    expect(moneyCard(card, "urgent", family("credit"), marginNotRead, list(0))).toEqual({
      card: { ...card, empty: "No URGENT job with this signal.", dialog: "URGENT · money · Customers over limit or overdue" },
      countNotKnown: false,
    });
    expect(moneyCard(card, "attention", family("credit"), allRead, list(2, { listed: 200, cut: true })).card.window).toBe("money at risk now · among the first 200");
  });

  it("narrowed to a family that could not be judged, with none found: no count, and why - not 0 and not 'none with this signal'", () => {
    expect(moneyCard(card, "urgent", family("margin"), marginNotRead, list(0))).toEqual({
      card: { ...card, empty: "Could not be read right now", dialog: "URGENT · money · Margin" },
      countNotKnown: true,
    });
    expect(moneyCard(card, "attention", family("not_recharged"), marginNotRead, list(0))).toMatchObject({ card: { empty: MONEY_SIGNAL_NOT_KNOWN }, countNotKnown: true });
  });

  it("narrowed to such a family with rows found all the same: they are the least there are, said beside the count", () => {
    const found = moneyCard(card, "urgent", family("margin"), marginNotRead, list(3));
    expect(found.countNotKnown).toBe(false);
    expect(found.card.window).toBe("money at risk now · or more: could not be read right now");
    expect(found.card.window.endsWith(MONEY_CARD_AT_LEAST)).toBe(true);
    // Of a card the server cut, both are said.
    expect(moneyCard(card, "urgent", family("margin"), marginNotRead, list(3, { listed: 200, cut: true })).card.window).toBe(
      "money at risk now · among the first 200 · or more: could not be read right now",
    );
  });

  it("not narrowed, with a part of the money not read: an empty card says no job was found, and why", () => {
    expect(moneyCard(card, "urgent", null, marginNotRead, list(0))).toEqual({ card: { ...card, empty: "No URGENT job found: part of the money could not be read" }, countNotKnown: false });
    expect(moneyCard(card, "attention", null, marginNotRead, list(0)).card.empty).toBe("No ATTENTION job found: part of the money could not be read");
    expect(MONEY_CARD_NOT_READ.attention).toBe("No ATTENTION job found: part of the money could not be read");
    // A card that holds rows shows them: what is missing is the notes line's to say.
    expect(moneyCard(card, "urgent", null, marginNotRead, list(2))).toEqual({ card, countNotKnown: false });
  });

  it("says nothing of a card whose rows are not there yet, and names none for an answer without the list", () => {
    expect(moneyCard(card, "urgent", family("margin"), marginNotRead, undefined)).toEqual({ card: { ...card, empty: "No URGENT job with this signal.", dialog: "URGENT · money · Margin" }, countNotKnown: false });
    const old = { ...tiles(), signalsNotKnown: undefined as never };
    expect(moneyCard(card, "urgent", null, old, list(0))).toEqual({ card, countNotKnown: false });
  });
});

describe("Shipments → Managers, Money: work not yet invoiced", () => {
  it("writes one amount per currency, in the app's money style, in the server's order", () => {
    expect(
      moneyChips([
        { currency: "CZK", amount: 310000 },
        { currency: "EUR", amount: 12400.5 },
        { currency: "USD", amount: 2100 },
      ]),
    ).toEqual(["310,000 CZK", "12,400.50 EUR", "2,100 USD"]);
    expect(moneyChips([])).toEqual([]);
  });

  it("has no amounts - not an empty list - when they were not read", () => {
    expect(moneyChips(null)).toBeNull();
    expect(moneyChips(undefined)).toBeNull();
  });

  it("never adds amounts of different currencies: a chip each, and only the server's CZK figure beside them", () => {
    const view = notYetInvoicedView({
      notYetInvoiced: [
        { currency: "EUR", amount: 1000 },
        { currency: "USD", amount: 1000 },
      ],
      notYetInvoicedCzk: null,
      notYetInvoicedJobs: 2,
    });
    expect(view).toEqual({ chips: ["1,000 EUR", "1,000 USD"], jobs: "in 2 jobs", czk: null });
  });

  it("shows the CZK total with its label exactly as sent", () => {
    const view = notYetInvoicedView({
      notYetInvoiced: [
        { currency: "EUR", amount: 12400 },
        { currency: "CZK", amount: 310000 },
      ],
      notYetInvoicedCzk: { amount: 623456.78, label: "at today's ČNB rate (18.11.)" },
      notYetInvoicedJobs: 14,
    });
    expect(view.czk).toEqual({ amount: "623,456.78 CZK", label: "at today's ČNB rate (18.11.)" });
    expect(view.jobs).toBe("in 14 jobs");
  });

  it("shows the CZK total only when some amount is in another currency: beside CZK alone it would say the same figure twice", () => {
    const czkOnly = { notYetInvoiced: [{ currency: "CZK", amount: 310000 }], notYetInvoicedCzk: { amount: 310000, label: "at today's ČNB rate (18.11.)" }, notYetInvoicedJobs: 3 };
    expect(notYetInvoicedView(czkOnly)).toEqual({ chips: ["310,000 CZK"], jobs: "in 3 jobs", czk: null });
    expect(notYetInvoicedView({ ...czkOnly, notYetInvoiced: [{ currency: " czk ", amount: 310000 }] }).czk).toBeNull();
    // One other currency is enough - also when it is the only one.
    expect(notYetInvoicedView({ notYetInvoiced: [{ currency: "EUR", amount: 100 }], notYetInvoicedCzk: { amount: 2430, label: "at today's ČNB rate (18.11.)" }, notYetInvoicedJobs: 1 }).czk).toEqual({
      amount: "2,430 CZK",
      label: "at today's ČNB rate (18.11.)",
    });
  });

  it("says one job as one job", () => {
    expect(notYetInvoicedView({ notYetInvoiced: [{ currency: "EUR", amount: 5 }], notYetInvoicedCzk: null, notYetInvoicedJobs: 1 }).jobs).toBe("in 1 job");
  });

  it("with nothing waiting, has no chips, no jobs and no total to show", () => {
    expect(notYetInvoicedView({ notYetInvoiced: [], notYetInvoicedCzk: { amount: 0, label: "at today's ČNB rate (18.11.)" }, notYetInvoicedJobs: 0 })).toEqual({ chips: [], jobs: null, czk: null });
  });

  it("with Invoicing not read, knows none of it - never 0 and never an empty list", () => {
    expect(notYetInvoicedView({ notYetInvoiced: null, notYetInvoicedCzk: null, notYetInvoicedJobs: null })).toEqual({ chips: null, jobs: null, czk: null });
  });

  it("with the amounts read and the number of jobs not, shows the amounts and says no number", () => {
    expect(notYetInvoicedView({ notYetInvoiced: [{ currency: "EUR", amount: 5 }], notYetInvoicedCzk: null, notYetInvoicedJobs: null })).toEqual({ chips: ["5 EUR"], jobs: null, czk: null });
  });
});

describe("Shipments → Managers, Money: the people", () => {
  const people = [
    person("jana@cto.cz", { notYetInvoiced: [{ currency: "EUR", amount: 1200 }], jobsAtLoss: 2, estimatesOpen: 5, supplierInvoicesWaiting: 1, costClaimsOpen: 3 }),
    person("old@cto.cz", { isUser: false, active: 0, costClaimsOpen: 1 }),
    person("", { active: 4 }),
  ];

  it("keeps the server's order: nobody is ranked", () => {
    const worstLast = [person("a@cto.cz"), person("z@cto.cz", { jobsAtLoss: 9 }), person("m@cto.cz", { jobsAtLoss: 4 })];
    expect(moneyPersonRows(worstLast, everyone).map((r) => r.key)).toEqual(["a@cto.cz", "z@cto.cz", "m@cto.cz"]);
  });

  it("names each person as the Team tab does: the e-mail, Nobody for the jobs nobody handles, and who is no longer a user", () => {
    const rows = moneyPersonRows(people, everyone);
    expect(rows.map((r) => [r.name, r.nobody, r.notUser])).toEqual([
      ["jana@cto.cz", false, false],
      ["old@cto.cz", false, true],
      ["Nobody", true, false],
    ]);
  });

  it("marks nobody as not a user while the users could not be read - and never the jobs nobody handles", () => {
    const unread = people.map((p) => ({ ...p, isUser: null }));
    expect(moneyPersonRows(unread, everyone).some((r) => r.notUser)).toBe(false);
    // An answer from before the field (an older server) does not know either.
    const bare = people.map((p) => ({ ...p, isUser: undefined as never }));
    expect(moneyPersonRows(bare, everyone).some((r) => r.notUser)).toBe(false);
    expect(moneyPersonRows([person("", { isUser: false })], everyone)[0]!.notUser).toBe(false);
  });

  it("hands the figures through, and what was not read as null - never 0", () => {
    const [jana] = moneyPersonRows(people, everyone);
    expect(jana).toMatchObject({ notYetInvoiced: [{ currency: "EUR", amount: 1200 }], jobsAtLoss: 2, estimatesOpen: 5, supplierInvoicesWaiting: 1, costClaimsOpen: 3 });
    const [unread] = moneyPersonRows([person("jana@cto.cz", { ...invoicingNotRead, costClaimsOpen: null })], everyone);
    expect(unread).toMatchObject({ notYetInvoiced: null, jobsAtLoss: null, estimatesOpen: null, supplierInvoicesWaiting: null, costClaimsOpen: null });
    // An answer that lacks the fields (an older server) does not know them either.
    const [bare] = moneyPersonRows([{ handledBy: "jana@cto.cz" } as OpsMoneyPerson], everyone);
    expect(bare).toMatchObject({ notYetInvoiced: null, jobsAtLoss: null, estimatesOpen: null, supplierInvoicesWaiting: null, costClaimsOpen: null });
  });

  it("leads each row to the Money tab narrowed to the person, as the tab is otherwise", () => {
    const rows = moneyPersonRows(people, { mode: "sea", direction: "import", handledBy: null, reports: "mine", msignal: "margin" });
    expect(rows.map((r) => r.href)).toEqual([
      "/shipments/managers?tab=money&mode=sea&direction=import&handledBy=jana%40cto.cz&reports=mine&msignal=margin",
      "/shipments/managers?tab=money&mode=sea&direction=import&handledBy=old%40cto.cz&reports=mine&msignal=margin",
      "/shipments/managers?tab=money&mode=sea&direction=import&handledBy=nobody&reports=mine&msignal=margin",
    ]);
    // The address reads back as the tab and the person.
    const params = new URL(rows[2]!.href, "http://x").searchParams;
    expect(tabOf(params.get("tab"))).toBe("money");
    expect(handledByOf(params.get("handledBy"))).toBe("nobody");
    expect(moneySignalOf(params.get("msignal"))?.key).toBe("margin");
    expect(moneyPersonRows(people, everyone)[0]!.href).toBe("/shipments/managers?tab=money&handledBy=jana%40cto.cz");
  });

  it("keeps what the Cockpit's cards are narrowed to in the row's address: each tab keeps its own narrowing", () => {
    const [jana] = moneyPersonRows(people, { ...everyone, signal: "customs", msignal: "margin" });
    expect(jana!.href).toBe("/shipments/managers?tab=money&handledBy=jana%40cto.cz&signal=customs&msignal=margin");
    expect(moneyPersonRows(people, { ...everyone, signal: "customs" })[0]!.href).toBe("/shipments/managers?tab=money&handledBy=jana%40cto.cz&signal=customs");
    expect(moneyPersonRows(people, { ...everyone, signal: null, msignal: null })[0]!.href).toBe("/shipments/managers?tab=money&handledBy=jana%40cto.cz");
  });

  it("marks the person the tab is narrowed to - the table itself is not narrowed", () => {
    const rows = moneyPersonRows(people, { ...everyone, handledBy: "old@cto.cz" });
    expect(rows.map((r) => r.picked)).toEqual([false, true, false]);
    expect(moneyPersonRows(people, { ...everyone, handledBy: "nobody" }).map((r) => r.picked)).toEqual([false, false, true]);
    expect(moneyPersonRows(people, everyone).some((r) => r.picked)).toBe(false);
  });
});

describe("Shipments → Managers, Money: the Handled By select", () => {
  const people = [
    person("jana@cto.cz", { active: 6 }),
    // No active job, and a cost that came after billing on an invoiced one.
    person("petr@cto.cz", { active: 0, supplierInvoicesWaiting: 1 }),
    person("old@cto.cz", { active: 2, isUser: false }),
    // Named on invoiced jobs only, with no figure at all: a colleague all the same, and pickable.
    person("idle@cto.cz", { active: 0 }),
    person("", { active: 3 }),
  ];

  it("lists Everyone, every person the Money answer names, and Nobody - in the answer's order", () => {
    expect(moneyHandledByOptions(people, null)).toEqual([
      { value: "everyone", label: "Everyone" },
      { value: "jana@cto.cz", label: "jana@cto.cz · 6 active" },
      { value: "petr@cto.cz", label: "petr@cto.cz" },
      { value: "old@cto.cz", label: "old@cto.cz · 2 active · not a user" },
      { value: "idle@cto.cz", label: "idle@cto.cz" },
      { value: "nobody", label: "Nobody · 3 active" },
    ]);
  });

  it("lists somebody with only invoiced jobs whatever their figures - read, none, or not read - with no count of active jobs beside the name", () => {
    const invoicedOnly = [
      person("a@cto.cz", { active: 0, notYetInvoiced: [{ currency: "EUR", amount: 5 }] }),
      person("b@cto.cz", { active: 0 }),
      person("c@cto.cz", { active: 0, ...invoicingNotRead, costClaimsOpen: null }),
      person("d@cto.cz", { active: 0, isUser: false }),
    ];
    expect(moneyHandledByOptions(invoicedOnly, null)).toEqual([
      { value: "everyone", label: "Everyone" },
      { value: "a@cto.cz", label: "a@cto.cz" },
      { value: "b@cto.cz", label: "b@cto.cz" },
      { value: "c@cto.cz", label: "c@cto.cz" },
      { value: "d@cto.cz", label: "d@cto.cz · not a user" },
      { value: "nobody", label: "Nobody" },
    ]);
  });

  it("always shows who the tab is narrowed to, also somebody the answer does not name", () => {
    expect(moneyHandledByOptions(people, "gone@cto.cz").map((o) => o.value)).toEqual(["everyone", "jana@cto.cz", "petr@cto.cz", "old@cto.cz", "idle@cto.cz", "gone@cto.cz", "nobody"]);
    // The answer is not there yet.
    expect(moneyHandledByOptions([], "jana@cto.cz")).toEqual([
      { value: "everyone", label: "Everyone" },
      { value: "jana@cto.cz", label: "jana@cto.cz" },
      { value: "nobody", label: "Nobody" },
    ]);
    // Somebody listed, or nobody, is not listed twice.
    expect(moneyHandledByOptions(people, "idle@cto.cz").filter((o) => o.value === "idle@cto.cz")).toHaveLength(1);
    expect(moneyHandledByOptions(people, "nobody").filter((o) => o.value === "nobody")).toHaveLength(1);
  });

  it("says Nobody without a count when the jobs nobody handles are none or all invoiced", () => {
    expect(moneyHandledByOptions([person("", { active: 0, estimatesOpen: 2 })], null).at(-1)).toEqual({ value: "nobody", label: "Nobody" });
    expect(moneyHandledByOptions([person("jana@cto.cz")], null).at(-1)).toEqual({ value: "nobody", label: "Nobody" });
  });

  it("marks nobody as not a user while the users could not be read", () => {
    expect(moneyHandledByOptions([person("old@cto.cz", { isUser: null })], null)[1]).toEqual({ value: "old@cto.cz", label: "old@cto.cz · 1 active" });
  });
});

describe("Shipments → Managers, Money: the notes", () => {
  const answer = (over: Partial<Pick<ShipmentsManagersMoney, "capped" | "holidaysKnown" | "notKnown" | "tiles">> = {}) => ({ capped: false, holidaysKnown: true, notKnown: [], tiles: tiles(), ...over });

  it("says nothing when the answer is whole", () => {
    expect(moneyNotes(answer())).toEqual([]);
  });

  it("says when the read stopped at a limit - of the active jobs, or of the invoiced ones of the last 90 days", () => {
    expect(moneyNotes(answer({ capped: true }))).toEqual([MONEY_CAPPED]);
    expect(MONEY_CAPPED).toBe("More jobs than were read: the figures cover the 2,000 newest active jobs and the 1,000 newest invoiced ones of the last 90 days");
  });

  it("names what could not be read, in the server's words", () => {
    expect(moneyNotes(answer({ notKnown: ["customers' credit"] }))).toEqual(["Not known right now: customers' credit"]);
    // A part whose own name has a comma: semicolons between the parts.
    expect(moneyNotes(answer({ notKnown: ["Invoicing: selling, costs and supplier invoices", "customers' credit"] }))).toEqual([
      "Not known right now: Invoicing: selling, costs and supplier invoices; customers' credit",
    ]);
  });

  it("says for how many jobs the margin is not known, and why", () => {
    expect(moneyNotes(answer({ tiles: tiles({ marginNotKnown: 3 }) }))).toEqual(["Margin not known for 3 jobs: a ČNB rate is missing"]);
    expect(moneyNotes(answer({ tiles: tiles({ marginNotKnown: 1 }) }))).toEqual(["Margin not known for 1 job: a ČNB rate is missing"]);
    // Not read at all is the "Not known right now" line's to say, not "0 jobs".
    expect(moneyNotes(answer({ tiles: tiles({ marginNotKnown: null }) }))).toEqual([]);
  });

  it("does not say it twice: where the server's own words name the margins, they are the only line", () => {
    expect(moneyNotes(answer({ notKnown: ["margin of 3 jobs: a ČNB rate is missing"], tiles: tiles({ marginNotKnown: 3 }) }))).toEqual(["Not known right now: margin of 3 jobs: a ČNB rate is missing"]);
    // Both of the server's reasons, counted in the one figure: neither is said again, and no reason is claimed for the wrong jobs.
    expect(
      moneyNotes(answer({ notKnown: ["margin of 1 job: a ČNB rate is missing", "margin of 2 jobs: their rates are not fixed yet and could not be read"], tiles: tiles({ marginNotKnown: 3 }) })),
    ).toEqual(["Not known right now: margin of 1 job: a ČNB rate is missing, margin of 2 jobs: their rates are not fixed yet and could not be read"]);
    expect(moneyNotes(answer({ notKnown: ["margin of 2 jobs: their rates are not fixed yet and could not be read"], tiles: tiles({ marginNotKnown: 2 }) }))).toHaveLength(1);
    // Another part not known says nothing of the margins: the page's own line stays.
    expect(moneyNotes(answer({ notKnown: ["customers' credit"], tiles: tiles({ marginNotKnown: 2 }) }))).toEqual([
      "Not known right now: customers' credit",
      "Margin not known for 2 jobs: a ČNB rate is missing",
    ]);
  });

  it("says the holidays could not be read, and all of it in one order", () => {
    expect(moneyNotes(answer({ capped: true, holidaysKnown: false, notKnown: ["cost claims"], tiles: tiles({ marginNotKnown: 2 }) }))).toEqual([
      MONEY_CAPPED,
      "The company's holidays could not be read: working days skip weekends and public holidays only",
      "Not known right now: cost claims",
      "Margin not known for 2 jobs: a ČNB rate is missing",
    ]);
  });

  it("has a plain line of its own for a load that failed", () => {
    expect(MONEY_LOAD_FAILED).toBe("Could not load the money.");
  });
});

describe("Shipments → Managers, Approvals: what waits on another page", () => {
  const read = (waiting: number) => ({ waiting, isLoading: false, isError: false });
  const failed = { waiting: 0, isLoading: false, isError: true };
  const loading = { waiting: 0, isLoading: true, isError: false };

  it("counts the billing approvals - credit notes and invoice changes together - and the supplier invoices, each with where it leads", () => {
    expect(approvalLinks([read(2), read(1)], read(4))).toEqual([
      { key: "billing", count: "3", words: "billing approvals waiting", where: "Sales → Managers → Billing approvals", href: "/sales/managers?tab=billing" },
      { key: "supplierInvoices", count: "4", words: "supplier invoices to approve", where: "Accounts Payable", href: "/accounts-payable?tab=to_approve" },
    ]);
  });

  it("says one as one", () => {
    expect(approvalLinks([read(1), read(0)], read(1)).map((l) => `${l.count} ${l.words}`)).toEqual(["1 billing approval waiting", "1 supplier invoice to approve"]);
  });

  it("draws no line for nothing waiting", () => {
    expect(approvalLinks([read(0), read(0)], read(0))).toEqual([]);
    expect(approvalLinks([read(0), read(0)], read(2)).map((l) => l.key)).toEqual(["supplierInvoices"]);
    expect(approvalLinks([read(0), read(5)], read(0)).map((l) => l.key)).toEqual(["billing"]);
  });

  it("shows a count that could not be read as –, never as a missing line", () => {
    expect(approvalLinks([failed, failed], failed).map((l) => `${l.count} ${l.words}`)).toEqual(["– billing approvals waiting", "– supplier invoices to approve"]);
  });

  it("shows what was read of the billing approvals as the least there is when one of the two could not be read", () => {
    expect(approvalLinks([read(2), failed], read(0)).map((l) => `${l.count} ${l.words}`)).toEqual(["2+ billing approvals waiting"]);
    expect(approvalLinks([failed, read(0)], read(0)).map((l) => `${l.count} ${l.words}`)).toEqual(["0+ billing approvals waiting"]);
  });

  it("says nothing of a count that is still loading", () => {
    expect(approvalLinks([loading, read(3)], loading)).toEqual([]);
    expect(approvalLinks([read(3), read(0)], loading).map((l) => l.key)).toEqual(["billing"]);
  });
});
