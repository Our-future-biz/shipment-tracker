import { describe, expect, it } from "vitest";
import { buildBoard, pipelineStage, type BoardView, type CustomerQuoteFeed, type CustomerShipmentFeed, type PipelineCustomer } from "../../utils/pipelineStage.utils";

const SHIPPED = "2026-10-06T08:00:00.000Z";

describe("pipelineStage", () => {
  it("is Won for a customer that has a shipment - a shipment beats everything", () => {
    for (const status of ["Prospect", "Active", "Inactive", "something else"]) {
      for (const hasSentQuote of [true, false]) {
        expect(pipelineStage({ status, hasSentQuote, firstShipmentAt: SHIPPED }), `${status} ${hasSentQuote}`).toBe("won");
      }
    }
  });

  it("hides an Inactive customer unless it ordered", () => {
    expect(pipelineStage({ status: "Inactive", hasSentQuote: true, firstShipmentAt: null })).toBeNull();
    expect(pipelineStage({ status: "Inactive", hasSentQuote: false, firstShipmentAt: null })).toBeNull();
    expect(pipelineStage({ status: "Inactive", hasSentQuote: false, firstShipmentAt: SHIPPED })).toBe("won");
  });

  it("is Proposal once a quote went out, whatever the status on the customer says", () => {
    expect(pipelineStage({ status: "Prospect", hasSentQuote: true, firstShipmentAt: null })).toBe("proposal");
    expect(pipelineStage({ status: "Active", hasSentQuote: true, firstShipmentAt: null })).toBe("proposal");
  });

  it("is Prospect for a customer of that status without a sent quote and without a shipment", () => {
    expect(pipelineStage({ status: "Prospect", hasSentQuote: false, firstShipmentAt: null })).toBe("prospect");
  });

  it("does not show an Active customer with neither a sent quote nor a shipment", () => {
    expect(pipelineStage({ status: "Active", hasSentQuote: false, firstShipmentAt: null })).toBeNull();
    expect(pipelineStage({ status: "", hasSentQuote: false, firstShipmentAt: null })).toBeNull();
  });
});

const customer = (id: string, status: string, createdAt: string, over: Partial<PipelineCustomer> = {}): PipelineCustomer => ({
  id,
  companyName: `${id} s.r.o.`,
  status,
  label: "STANDARD",
  salesOwner: "Martin",
  createdAt,
  ...over,
});

const quoted = (customerId: string, over: Partial<CustomerQuoteFeed["customers"][number]> = {}): CustomerQuoteFeed["customers"][number] => ({
  customerId,
  hasSentQuote: true,
  sentQuotes: 1,
  firstSentAt: "2026-10-03T09:00:00.000Z",
  firstSentAtKnown: true,
  sentQuotesWithoutDate: 0,
  lastActivityAt: "2026-10-04T09:00:00.000Z",
  ...over,
});

const shipped = (customerId: string, over: Partial<CustomerShipmentFeed["customers"][number]> = {}): CustomerShipmentFeed["customers"][number] => ({
  customerId,
  firstShipmentAt: SHIPPED,
  firstShipmentId: `shipment-of-${customerId}`,
  firstJobNumber: "CZ00000012",
  lastShipmentAt: SHIPPED,
  shipmentCount: 1,
  ...over,
});

const openQuote = (customerId: string, quoteNumber: string): CustomerQuoteFeed["openQuotes"][number] => ({
  customerId,
  quoteNumber,
  status: "quoted",
  validUntil: "2026-10-25",
  currency: "EUR",
  rates: { USD: { rate: 23.1, week: "2026-W41" } },
  sellingLines: [{ type: "Ocean freight", currency: "USD", amount: 2400 }],
});

const quotes = (over: Partial<CustomerQuoteFeed> = {}): CustomerQuoteFeed => ({ customers: [], openQuotes: [], quotesWithoutCustomer: 0, ...over });
const shipments = (over: Partial<CustomerShipmentFeed> = {}): CustomerShipmentFeed => ({ customers: [], shipmentsWithoutCustomer: 0, ...over });
const ALL: BoardView = { wonSince: null, limit: 100 };
const ids = (cards: { customerId: string }[]) => cards.map((card) => card.customerId);

describe("buildBoard", () => {
  it("places every customer on one stage by its facts, joined by customer id", () => {
    const board = buildBoard(
      [
        customer("ravak", "Active", "2026-01-10T08:00:00.000Z", { label: "KEY ACCOUNT", salesOwner: "Jana" }),
        customer("ittec", "Prospect", "2026-09-01T08:00:00.000Z"),
        customer("vp", "Prospect", "2026-09-20T08:00:00.000Z"),
        customer("quiet", "Active", "2026-03-01T08:00:00.000Z"),
        customer("gone-cold", "Inactive", "2026-02-01T08:00:00.000Z"),
      ],
      quotes({ customers: [quoted("ittec"), quoted("gone-cold"), quoted("ravak", { lastActivityAt: "2026-10-08T09:00:00.000Z" })], openQuotes: [openQuote("ittec", "QCZ20261010001")] }),
      shipments({ customers: [shipped("ravak", { shipmentCount: 2, lastShipmentAt: "2026-10-07T08:00:00.000Z" })] }),
      ALL,
    );
    expect(board.totals).toEqual({ prospect: 1, proposal: 1, won: 1 });
    expect(ids(board.cards.prospect)).toEqual(["vp"]);
    expect(ids(board.cards.proposal)).toEqual(["ittec"]);
    expect(ids(board.cards.won)).toEqual(["ravak"]);
    expect(board.cards.won[0]).toEqual({
      customerId: "ravak",
      companyName: "ravak s.r.o.",
      label: "KEY ACCOUNT",
      salesOwner: "Jana",
      stage: "won",
      firstQuoteSentAt: "2026-10-03T09:00:00.000Z",
      firstQuoteSentAtKnown: true,
      firstShipmentAt: SHIPPED,
      firstShipmentId: "shipment-of-ravak",
      firstJobNumber: "CZ00000012",
      shipmentCount: 2,
      // The later of the last quote write and the newest shipment.
      lastActivityAt: "2026-10-08T09:00:00.000Z",
      openQuotes: [],
    });
    expect(board.cards.proposal[0]).toMatchObject({
      stage: "proposal",
      firstShipmentAt: null,
      firstShipmentId: null,
      firstJobNumber: null,
      shipmentCount: 0,
      lastActivityAt: "2026-10-04T09:00:00.000Z",
      // The quote as the feed gave it, without the customer id the card already carries.
      openQuotes: [
        { quoteNumber: "QCZ20261010001", status: "quoted", validUntil: "2026-10-25", currency: "EUR", rates: { USD: { rate: 23.1, week: "2026-W41" } }, sellingLines: [{ type: "Ocean freight", currency: "USD", amount: 2400 }] },
      ],
    });
    expect(board.cards.prospect[0]).toMatchObject({ stage: "prospect", firstQuoteSentAt: null, firstQuoteSentAtKnown: false, lastActivityAt: null, openQuotes: [] });
  });

  it("keeps a Prospect with unsent quotes under Prospect, with those quotes and their last write on the card", () => {
    const board = buildBoard(
      [customer("vp", "Prospect", "2026-09-20T08:00:00.000Z")],
      quotes({
        customers: [quoted("vp", { hasSentQuote: false, sentQuotes: 0, firstSentAt: null, firstSentAtKnown: false, lastActivityAt: "2026-10-09T09:00:00.000Z" })],
        openQuotes: [openQuote("vp", "QCZ20261009002"), openQuote("vp", "QCZ20261009001")],
      }),
      shipments(),
      ALL,
    );
    expect(board.totals).toEqual({ prospect: 1, proposal: 0, won: 0 });
    expect(board.cards.prospect[0]).toMatchObject({ lastActivityAt: "2026-10-09T09:00:00.000Z", firstQuoteSentAt: null });
    // In the order the feed gave them: the newest first.
    expect(board.cards.prospect[0]!.openQuotes.map((quote) => quote.quoteNumber)).toEqual(["QCZ20261009002", "QCZ20261009001"]);
  });

  it("puts a customer whose only quote is Quoted without any sent date under Proposal, and says the date is not a sending", () => {
    // Set to Quoted in bulk before sent dates were recorded: the feed counts it as sent by its
    // status and dates it by its creation.
    const board = buildBoard(
      [customer("legacy", "Prospect", "2026-05-01T08:00:00.000Z"), customer("dated", "Prospect", "2026-05-02T08:00:00.000Z")],
      quotes({
        customers: [
          quoted("legacy", { firstSentAt: "2026-06-01T08:00:00.000Z", firstSentAtKnown: false, sentQuotesWithoutDate: 1 }),
          quoted("dated", { sentQuotes: 3, sentQuotesWithoutDate: 2 }),
        ],
      }),
      shipments(),
      ALL,
    );
    expect(board.totals).toEqual({ prospect: 0, proposal: 2, won: 0 });
    const legacy = board.cards.proposal.find((card) => card.customerId === "legacy")!;
    expect(legacy).toMatchObject({ stage: "proposal", firstQuoteSentAt: "2026-06-01T08:00:00.000Z", firstQuoteSentAtKnown: false });
    expect(board.notes.sentQuotesWithoutDate).toBe(3);
  });

  it("counts sent quotes without a date only for the customers under Proposal - the only place the board shows that date", () => {
    const board = buildBoard(
      [customer("won", "Active", "2026-01-01T08:00:00.000Z"), customer("hidden", "Inactive", "2026-01-02T08:00:00.000Z"), customer("proposal", "Active", "2026-01-03T08:00:00.000Z")],
      quotes({
        customers: [quoted("won", { sentQuotesWithoutDate: 4 }), quoted("hidden", { sentQuotesWithoutDate: 2 }), quoted("proposal", { sentQuotesWithoutDate: 1 })],
      }),
      shipments({ customers: [shipped("won")] }),
      ALL,
    );
    expect(board.notes.sentQuotesWithoutDate).toBe(1);
  });

  describe("the period of the Won column", () => {
    // Prague is two hours ahead of UTC in July: 13 July starts at 22:00 UTC on the 12th.
    const board = (wonSince: string | null) =>
      buildBoard(
        [
          customer("just-before", "Active", "2026-01-01T08:00:00.000Z"),
          customer("at-midnight", "Active", "2026-01-02T08:00:00.000Z"),
          customer("long-ago", "Prospect", "2026-01-03T08:00:00.000Z"),
          customer("proposal", "Prospect", "2026-01-04T08:00:00.000Z"),
          customer("prospect", "Prospect", "2026-01-05T08:00:00.000Z"),
        ],
        quotes({ customers: [quoted("proposal"), quoted("long-ago")] }),
        shipments({
          customers: [
            shipped("just-before", { firstShipmentAt: "2026-07-12T21:59:59.999Z", lastShipmentAt: "2026-10-01T08:00:00.000Z", shipmentCount: 5 }),
            shipped("at-midnight", { firstShipmentAt: "2026-07-12T22:00:00.000Z", lastShipmentAt: "2026-07-12T22:00:00.000Z" }),
            shipped("long-ago", { firstShipmentAt: "2024-03-01T08:00:00.000Z", lastShipmentAt: "2024-03-01T08:00:00.000Z" }),
          ],
        }),
        { wonSince, limit: 100 },
      );

    it("holds the customers whose first shipment was created on that Prague day or later", () => {
      expect(ids(board("2026-07-13").cards.won)).toEqual(["at-midnight"]);
      expect(ids(board("2026-07-12").cards.won).sort()).toEqual(["at-midnight", "just-before"]);
      expect(board("2026-07-14").totals.won).toBe(0);
    });

    it("judges by the FIRST shipment: a customer that ordered before the period is not won in it, however new its last shipment", () => {
      expect(ids(board("2026-07-13").cards.won)).not.toContain("just-before");
    });

    it("holds every customer that ever ordered when no period is asked for", () => {
      expect(ids(board(null).cards.won).sort()).toEqual(["at-midnight", "just-before", "long-ago"]);
    });

    it("changes the Won column alone: a customer that ordered before it does not fall back to Proposal", () => {
      for (const wonSince of [null, "2026-07-13", "2030-01-01"]) {
        const { cards, totals } = board(wonSince);
        expect(ids(cards.proposal), String(wonSince)).toEqual(["proposal"]);
        expect(ids(cards.prospect), String(wonSince)).toEqual(["prospect"]);
        expect([totals.prospect, totals.proposal]).toEqual([1, 1]);
      }
    });

    it("hands the period back as it was asked", () => {
      expect(board("2026-07-13").wonSince).toBe("2026-07-13");
      expect(board(null).wonSince).toBeNull();
    });
  });

  describe("what cannot be placed", () => {
    it("counts the sent quotes and the shipments of a customer id that is no longer in the customer list - and shows no card for it", () => {
      const board = buildBoard(
        [customer("ittec", "Prospect", "2026-09-01T08:00:00.000Z")],
        quotes({
          customers: [quoted("ittec"), quoted("deleted-cez", { sentQuotes: 3 }), quoted("deleted-draft-only", { hasSentQuote: false, sentQuotes: 0, firstSentAt: null })],
          openQuotes: [openQuote("deleted-cez", "QCZ20260901001")],
        }),
        shipments({ customers: [shipped("deleted-cez", { shipmentCount: 4 }), shipped("deleted-shipper")], shipmentsWithoutCustomer: 14 }),
        ALL,
      );
      expect(board.totals).toEqual({ prospect: 0, proposal: 1, won: 0 });
      expect(ids([...board.cards.prospect, ...board.cards.proposal, ...board.cards.won])).toEqual(["ittec"]);
      expect(board.notes.quotesOfMissingCustomers).toBe(3);
      // The 14 that name no customer record, and the 4 + 1 of the two customers that are gone.
      expect(board.notes.shipmentsWithoutCustomer).toBe(19);
    });

    it("does not count the shipments of a customer the period leaves off the board: it is in the customer list", () => {
      const board = buildBoard(
        [customer("ravak", "Active", "2026-01-10T08:00:00.000Z")],
        quotes(),
        shipments({ customers: [shipped("ravak", { shipmentCount: 2 })], shipmentsWithoutCustomer: 14 }),
        { wonSince: "2026-10-07", limit: 100 },
      );
      expect(board.totals.won).toBe(0);
      expect(board.notes.shipmentsWithoutCustomer).toBe(14);
    });

    it("passes on what the services counted: quotes and shipments that name no customer record", () => {
      const board = buildBoard([], quotes({ quotesWithoutCustomer: 2 }), shipments({ shipmentsWithoutCustomer: 19 }), ALL);
      expect(board.notes).toEqual({ shipmentsWithoutCustomer: 19, quotesWithoutCustomer: 2, quotesOfMissingCustomers: 0, sentQuotesWithoutDate: 0 });
      expect(board.totals).toEqual({ prospect: 0, proposal: 0, won: 0 });
      expect(board.cards).toEqual({ prospect: [], proposal: [], won: [] });
    });
  });

  describe("order and cut", () => {
    const many = (n: number, status: string) => Array.from({ length: n }, (_, i) => customer(`c${String(i).padStart(3, "0")}`, status, new Date(Date.UTC(2026, 0, 1 + i)).toISOString()));

    it("orders prospects by when the customer was created, the newest first", () => {
      const board = buildBoard(
        [customer("old", "Prospect", "2026-01-01T08:00:00.000Z"), customer("new", "Prospect", "2026-09-01T08:00:00.000Z"), customer("mid", "Prospect", "2026-05-01T08:00:00.000Z")],
        quotes(),
        shipments(),
        ALL,
      );
      expect(ids(board.cards.prospect)).toEqual(["new", "mid", "old"]);
    });

    it("orders Proposal and Won by last activity, the newest first; equal activity by the newer customer", () => {
      const board = buildBoard(
        [
          customer("a", "Active", "2026-01-01T08:00:00.000Z"),
          customer("b", "Active", "2026-01-02T08:00:00.000Z"),
          customer("c", "Active", "2026-01-03T08:00:00.000Z"),
          customer("w1", "Active", "2026-01-04T08:00:00.000Z"),
          customer("w2", "Active", "2026-01-05T08:00:00.000Z"),
        ],
        quotes({
          customers: [
            quoted("a", { lastActivityAt: "2026-10-09T09:00:00.000Z" }),
            quoted("b", { lastActivityAt: "2026-10-01T09:00:00.000Z" }),
            quoted("c", { lastActivityAt: "2026-10-01T09:00:00.000Z" }),
            quoted("w1", { lastActivityAt: "2026-10-10T09:00:00.000Z" }),
          ],
        }),
        shipments({ customers: [shipped("w1", { lastShipmentAt: "2026-09-01T08:00:00.000Z" }), shipped("w2", { lastShipmentAt: "2026-10-05T08:00:00.000Z" })] }),
        ALL,
      );
      expect(ids(board.cards.proposal)).toEqual(["a", "c", "b"]);
      expect(ids(board.cards.won)).toEqual(["w1", "w2"]);
    });

    it("cuts every column to the limit while the totals cover everything", () => {
      const board = buildBoard(many(312, "Prospect"), quotes(), shipments(), { wonSince: null, limit: 100 });
      expect(board.totals.prospect).toBe(312);
      expect(board.cards.prospect).toHaveLength(100);
      // The newest customer first.
      expect(board.cards.prospect[0]!.customerId).toBe("c311");
    });

    it("fetches more of one column with stage and offset: the next cards of that column, none of the others, the same totals", () => {
      const customers = [...many(250, "Prospect"), customer("ittec", "Active", "2026-09-01T08:00:00.000Z")];
      const feed = quotes({ customers: [quoted("ittec")] });
      const first = buildBoard(customers, feed, shipments(), { wonSince: null, limit: 100 });
      const second = buildBoard(customers, feed, shipments(), { wonSince: null, limit: 100, stage: "prospect", offset: 100 });
      const third = buildBoard(customers, feed, shipments(), { wonSince: null, limit: 100, stage: "prospect", offset: 200 });
      expect(second.totals).toEqual(first.totals);
      expect(second.cards.proposal).toEqual([]);
      expect(second.cards.won).toEqual([]);
      expect(third.cards.prospect).toHaveLength(50);
      // Walked page by page, every card comes exactly once.
      const walked = [...first.cards.prospect, ...second.cards.prospect, ...third.cards.prospect];
      expect(new Set(ids(walked)).size).toBe(250);
      expect(walked).toHaveLength(250);
    });

    it("ignores an offset without a stage: every column starts at its first card", () => {
      const board = buildBoard(many(5, "Prospect"), quotes(), shipments(), { wonSince: null, limit: 2, offset: 3 });
      expect(ids(board.cards.prospect)).toEqual(["c004", "c003"]);
    });

    it("cuts a column at the same place every time, whatever order the customers arrive in", () => {
      const same = Array.from({ length: 6 }, (_, i) => customer(`s${i}`, "Prospect", "2026-01-01T08:00:00.000Z"));
      const forward = buildBoard(same, quotes(), shipments(), { wonSince: null, limit: 3 });
      const backward = buildBoard([...same].reverse(), quotes(), shipments(), { wonSince: null, limit: 3 });
      expect(ids(backward.cards.prospect)).toEqual(ids(forward.cards.prospect));
    });
  });
});
