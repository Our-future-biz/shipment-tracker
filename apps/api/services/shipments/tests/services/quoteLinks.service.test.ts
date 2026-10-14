import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The service is run for real against a stand-in for the shipments table - with the lock on a
// reference the real one reads under - and for the quotes service, which here keeps one link per
// quote the way the real one does: the oldest shipment it is told, or none.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("~encore/clients", () => ({
  quotes: { _internalSalesQuoteShipmentSync: vi.fn(), _internalSalesQuoteShipmentLinks: vi.fn() },
}));
vi.mock("../../repositories/shipment.repository", () => ({
  shipmentRepository: { withLiveBySalesNumber: vi.fn(), salesReferenceShipments: vi.fn() },
}));

import log from "encore.dev/log";
import { quotes } from "~encore/clients";
import { SALES_REFERENCE_PATTERN } from "../../../../lib/salesReference";
import { shipmentRepository } from "../../repositories/shipment.repository";
import { quoteLinksService } from "../../services/quoteLinks.service";

const repository = vi.mocked(shipmentRepository);
const syncCall = vi.mocked(quotes._internalSalesQuoteShipmentSync);
const linksCall = vi.mocked(quotes._internalSalesQuoteShipmentLinks);

const NOW = new Date("2026-10-10T10:00:00.000Z");
const MINUTE = 60 * 1000;
const ref = (n: number) => `QCZ20261010${String(n).padStart(3, "0")}`;

interface Shipment {
  id: string;
  jobNumber: string;
  reference: string;
}
const shipment = (n: number, reference: string): Shipment => ({ id: `shipment-${n}`, jobNumber: `CZ${String(n).padStart(8, "0")}`, reference });

// A company of its own for every test: what the service remembers about one must not decide
// what happens in the next.
let company: string;
/** The live shipments that carry a sales reference, oldest first. */
let shipments: Shipment[];
/** The live sales quotes with the shipment each is linked to. */
let links: Map<string, string | null>;
/** Who holds the lock on a reference, or held it last. */
let locks: Map<string, Promise<unknown>>;
/** The items of every sync call, in order. */
const sent = () => syncCall.mock.calls.map(([request]) => request.items);
const sentRefs = () => sent().flat().map((item) => item.quoteNumber);
const naming = (reference: string) => shipments.filter((s) => s.reference === reference).map(({ id, jobNumber }) => ({ id, jobNumber }));

/** The quotes service as the stand-in answers: the quote takes the oldest shipment it is told as its link. */
const quotesAnswer: typeof quotes._internalSalesQuoteShipmentSync = async ({ items }) => ({
  results: items.map(({ quoteNumber, shipments: told, wonByShipmentId }) => {
    const found = links.has(quoteNumber);
    const first = found && told.length ? told[0]! : null;
    if (found) links.set(quoteNumber, first?.id ?? null);
    return {
      quoteNumber,
      found,
      shipmentId: first?.id ?? null,
      shipmentJobNumber: first?.jobNumber ?? null,
      status: found ? (wonByShipmentId ? "won" : "quoted") : null,
      becameWon: found && wonByShipmentId !== undefined,
      revertedTo: null,
      note: null,
    };
  }),
});

/** Lets everything that can go on without an answer of the quotes service go on. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  company = randomUUID();
  shipments = [];
  links = new Map();
  locks = new Map();

  repository.salesReferenceShipments.mockImplementation(async () => shipments);
  // As the real one: whoever asks about a reference waits until the one before is done with it,
  // and reads the shipments only then.
  repository.withLiveBySalesNumber.mockImplementation((_companyId, reference, tell) => {
    const turn = (locks.get(reference) ?? Promise.resolve()).then(() => tell(naming(reference)));
    locks.set(reference, turn.catch(() => undefined));
    return turn;
  });
  linksCall.mockImplementation(async () => ({
    links: [...links].flatMap(([quoteNumber, shipmentId]) => (shipmentId ? [{ quoteNumber, shipmentId }] : [])),
  }));
  syncCall.mockImplementation(quotesAnswer);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("syncReference", () => {
  it("tells the quote every live shipment that carries its number, the oldest first, and returns what the quote made of it", async () => {
    links.set(ref(1), null);
    shipments = [shipment(1, ref(1)), shipment(2, ref(2)), shipment(3, ref(1))];
    await expect(quoteLinksService.syncReference(company, ref(1))).resolves.toMatchObject({
      quoteNumber: ref(1),
      found: true,
      shipmentId: "shipment-1",
      shipmentJobNumber: "CZ00000001",
      becameWon: false,
    });
    expect(repository.withLiveBySalesNumber).toHaveBeenCalledWith(company, ref(1), expect.any(Function));
    expect(syncCall).toHaveBeenCalledWith({
      items: [
        {
          quoteNumber: ref(1),
          shipments: [
            { id: "shipment-1", jobNumber: "CZ00000001" },
            { id: "shipment-3", jobNumber: "CZ00000003" },
          ],
          wonByShipmentId: undefined,
        },
      ],
    });
  });

  it("names the shipment that was created from the quote", async () => {
    links.set(ref(1), null);
    shipments = [shipment(1, ref(1))];
    await expect(quoteLinksService.syncReference(company, ref(1), { wonByShipmentId: "shipment-1" })).resolves.toMatchObject({ becameWon: true, status: "won" });
    expect(sent()[0]![0]).toMatchObject({ wonByShipmentId: "shipment-1" });
  });

  it("sends an empty list when no live shipment carries the number any more: that is how a quote loses its link", async () => {
    links.set(ref(1), "shipment-1");
    await expect(quoteLinksService.syncReference(company, ref(1))).resolves.toMatchObject({ found: true, shipmentId: null });
    expect(sent()).toEqual([[{ quoteNumber: ref(1), shipments: [], wonByShipmentId: undefined }]]);
  });

  it("asks nobody about a Sales Number that is not a sales reference: free text links nothing", async () => {
    for (const salesNumber of ["", "PO 4411", "qcz20261010001", `${ref(1)} `, "QCZ2026101001", "CZ00000001"]) {
      await expect(quoteLinksService.syncReference(company, salesNumber), salesNumber).resolves.toBeNull();
    }
    expect(repository.withLiveBySalesNumber).not.toHaveBeenCalled();
    expect(syncCall).not.toHaveBeenCalled();
  });

  it("passes on a reference that names no quote as not found, and a failure as a failure", async () => {
    shipments = [shipment(1, ref(1))];
    await expect(quoteLinksService.syncReference(company, ref(1))).resolves.toMatchObject({ found: false, shipmentId: null });
    syncCall.mockRejectedValueOnce(new Error("quotes is unreachable"));
    await expect(quoteLinksService.syncReference(company, ref(1))).rejects.toThrow("quotes is unreachable");
  });

  it("says that nobody asked for it only when that is so", async () => {
    links.set(ref(1), null);
    await quoteLinksService.syncReference(company, ref(1));
    await quoteLinksService.syncReference(company, ref(1), { automatic: true });
    expect(syncCall.mock.calls.map(([request]) => request.automatic)).toEqual([undefined, true]);
  });

  describe("two reports about one quote at the same moment", () => {
    // The quotes service takes its time over the first report, and lets go when told to.
    const slowFirstAnswer = () => {
      let answer = () => {};
      const waiting = new Promise<void>((resolve) => (answer = resolve));
      syncCall.mockImplementationOnce(async (request) => {
        await waiting;
        return quotesAnswer(request);
      });
      return () => answer();
    };

    it("never lets the older list reach the quote last: a delete that crosses a create", async () => {
      // The quote is Won by its only shipment, which one user deletes ...
      links.set(ref(1), "shipment-1");
      const answer = slowFirstAnswer();
      const deleted = quoteLinksService.syncReference(company, ref(1));
      await settle();
      // ... while another creates the next shipment from the same quote.
      shipments = [shipment(2, ref(1))];
      const created = quoteLinksService.syncReference(company, ref(1), { wonByShipmentId: "shipment-2" });
      await settle();
      // The second report waits its turn: its list is not even read while the first is not done.
      expect(syncCall).toHaveBeenCalledTimes(1);

      answer();
      await expect(deleted).resolves.toMatchObject({ shipmentId: null });
      await expect(created).resolves.toMatchObject({ shipmentId: "shipment-2", becameWon: true });
      expect(sent()).toEqual([
        [{ quoteNumber: ref(1), shipments: [] }],
        [{ quoteNumber: ref(1), shipments: [{ id: "shipment-2", jobNumber: "CZ00000002" }], wonByShipmentId: "shipment-2" }],
      ]);
      expect(links.get(ref(1))).toBe("shipment-2");
    });

    it("never lets the older list reach the quote last: two shipments created from one quote", async () => {
      links.set(ref(1), null);
      shipments = [shipment(1, ref(1))];
      const answer = slowFirstAnswer();
      const first = quoteLinksService.syncReference(company, ref(1), { wonByShipmentId: "shipment-1" });
      await settle();
      shipments = [shipment(1, ref(1)), shipment(2, ref(1))];
      const second = quoteLinksService.syncReference(company, ref(1), { wonByShipmentId: "shipment-2" });
      await settle();
      expect(syncCall).toHaveBeenCalledTimes(1);

      answer();
      await Promise.all([first, second]);
      // The list with both shipments is the one the quote hears last, so it never reads the
      // second one as removed.
      expect(sent().map(([item]) => item!.shipments.map((s) => s.id))).toEqual([["shipment-1"], ["shipment-1", "shipment-2"]]);
    });

    it("does not hold up a report about another quote", async () => {
      links.set(ref(1), null);
      links.set(ref(2), null);
      shipments = [shipment(1, ref(1)), shipment(2, ref(2))];
      const answer = slowFirstAnswer();
      const first = quoteLinksService.syncReference(company, ref(1));
      await settle();
      await expect(quoteLinksService.syncReference(company, ref(2))).resolves.toMatchObject({ shipmentId: "shipment-2" });
      answer();
      await expect(first).resolves.toMatchObject({ shipmentId: "shipment-1" });
    });

    it("lets the next report through after one that failed", async () => {
      links.set(ref(1), null);
      shipments = [shipment(1, ref(1))];
      syncCall.mockRejectedValueOnce(new Error("quotes is unreachable"));
      await expect(quoteLinksService.syncReference(company, ref(1))).rejects.toThrow("quotes is unreachable");
      await expect(quoteLinksService.syncReference(company, ref(1))).resolves.toMatchObject({ shipmentId: "shipment-1" });
    });
  });
});

describe("reconcile", () => {
  it("reads the shipments that carry a sales reference, by the one definition of its format", async () => {
    await quoteLinksService.reconcile(company);
    expect(repository.salesReferenceShipments).toHaveBeenCalledWith(company, SALES_REFERENCE_PATTERN);
  });

  it("tells exactly the quotes whose link differs, in both directions, as a repair - and marks none Won", async () => {
    shipments = [
      shipment(1, ref(1)), // the quote does not know it yet
      shipment(2, ref(2)), // in step
      shipment(3, ref(3)), // the quote is linked to a later shipment of the same reference
      shipment(4, ref(3)),
      shipment(5, ref(5)), // no such quote
    ];
    links = new Map([
      [ref(1), null],
      [ref(2), "shipment-2"],
      [ref(3), "shipment-4"],
      [ref(4), "shipment-9"], // linked, but no live shipment carries its number any more
      [ref(6), null], // a quote without a shipment
    ]);

    await expect(quoteLinksService.reconcile(company)).resolves.toEqual({ linked: 2, unlinked: 1, unchanged: 0, quoteNotFound: 1, remaining: 0 });

    // One quote per call: each is told under the lock on its own reference.
    expect(syncCall.mock.calls.map(([request]) => request.automatic)).toEqual([true, true, true, true]);
    expect(sent().flat()).toEqual([
      { quoteNumber: ref(1), shipments: [{ id: "shipment-1", jobNumber: "CZ00000001" }] },
      {
        quoteNumber: ref(3),
        shipments: [
          { id: "shipment-3", jobNumber: "CZ00000003" },
          { id: "shipment-4", jobNumber: "CZ00000004" },
        ],
      },
      { quoteNumber: ref(5), shipments: [{ id: "shipment-5", jobNumber: "CZ00000005" }] },
      { quoteNumber: ref(4), shipments: [] },
    ]);
    expect(Object.fromEntries(links)).toEqual({ [ref(1)]: "shipment-1", [ref(2)]: "shipment-2", [ref(3)]: "shipment-3", [ref(4)]: null, [ref(6)]: null });
  });

  it("calls nobody a second time when everything is in step", async () => {
    shipments = [shipment(1, ref(1))];
    links.set(ref(1), "shipment-1");
    await expect(quoteLinksService.reconcile(company)).resolves.toEqual({ linked: 0, unlinked: 0, unchanged: 0, quoteNotFound: 0, remaining: 0 });
    expect(syncCall).not.toHaveBeenCalled();
  });

  it("tells nothing to a linked quote whose own number is not a sales reference", async () => {
    links.set("PO 4411", "shipment-9");
    await expect(quoteLinksService.reconcile(company)).resolves.toEqual({ linked: 0, unlinked: 0, unchanged: 1, quoteNotFound: 0, remaining: 0 });
    expect(syncCall).not.toHaveBeenCalled();
  });

  it("counts a quote that got in step by itself meanwhile as unchanged", async () => {
    shipments = [shipment(1, ref(1))];
    links.set(ref(1), null);
    // Between the comparison and the sync somebody else links the quote and the shipment goes.
    syncCall.mockImplementationOnce(async ({ items }) => ({
      results: items.map(({ quoteNumber }) => ({ quoteNumber, found: true, shipmentId: null, shipmentJobNumber: null, status: "quoted", becameWon: false, revertedTo: null, note: null })),
    }));
    await expect(quoteLinksService.reconcile(company)).resolves.toMatchObject({ linked: 0, unlinked: 0, unchanged: 1 });
  });

  describe("what changes while it runs", () => {
    it("does not take the link from a quote whose shipment was created between its two reads", async () => {
      links.set(ref(1), null);
      // The quotes' links are read; then a shipment is created from the quote and the quote told.
      linksCall.mockImplementationOnce(async () => {
        shipments = [shipment(1, ref(1))];
        links.set(ref(1), "shipment-1");
        return { links: [] };
      });
      await expect(quoteLinksService.reconcile(company)).resolves.toMatchObject({ unlinked: 0 });
      expect(sent()).toEqual([[{ quoteNumber: ref(1), shipments: [{ id: "shipment-1", jobNumber: "CZ00000001" }] }]]);
      expect(links.get(ref(1))).toBe("shipment-1");
    });

    it("does not give a quote back a shipment that was deleted between its two reads", async () => {
      shipments = [shipment(1, ref(1))];
      links.set(ref(1), "shipment-1");
      // The quotes' links are read; then the shipment is deleted and the quote told.
      linksCall.mockImplementationOnce(async () => {
        shipments = [];
        links.set(ref(1), null);
        return { links: [{ quoteNumber: ref(1), shipmentId: "shipment-1" }] };
      });
      await quoteLinksService.reconcile(company);
      expect(sent()).toEqual([[{ quoteNumber: ref(1), shipments: [] }]]);
      expect(links.get(ref(1))).toBeNull();
    });

    it("does not link a quote to a shipment that was deleted after the comparison", async () => {
      shipments = [shipment(1, ref(1))];
      links.set(ref(1), null);
      // The shipments are read, the last of the two reads; then the only one is deleted.
      repository.salesReferenceShipments.mockImplementationOnce(async () => {
        const read = shipments;
        shipments = [];
        return read;
      });
      await expect(quoteLinksService.reconcile(company)).resolves.toMatchObject({ linked: 0, unchanged: 1 });
      expect(sent()).toEqual([[{ quoteNumber: ref(1), shipments: [] }]]);
      expect(links.get(ref(1))).toBeNull();
    });

    it("tells each quote what names it when its turn comes, not what the comparison read", async () => {
      shipments = [shipment(1, ref(1)), shipment(2, ref(2))];
      links = new Map([
        [ref(1), null],
        [ref(2), null],
      ]);
      // While the first quote is told, a second shipment is created from the other quote.
      syncCall.mockImplementationOnce(async (request) => {
        shipments = [...shipments, shipment(3, ref(2))];
        return quotesAnswer(request);
      });
      await quoteLinksService.reconcile(company);
      expect(sent()[1]).toEqual([
        {
          quoteNumber: ref(2),
          shipments: [
            { id: "shipment-2", jobNumber: "CZ00000002" },
            { id: "shipment-3", jobNumber: "CZ00000003" },
          ],
        },
      ]);
    });
  });

  it("stops at its limit and goes on from there the next time: every reference gets its turn once, also behind quotes that do not exist", async () => {
    // Five references of which the first three name no quote: they come up as a difference every time.
    shipments = [1, 2, 3, 4, 5].map((n) => shipment(n, ref(n)));
    links = new Map([
      [ref(4), null],
      [ref(5), null],
    ]);

    await expect(quoteLinksService.reconcile(company, { maxRefs: 3 })).resolves.toEqual({ linked: 0, unlinked: 0, unchanged: 0, quoteNotFound: 3, remaining: 2 });
    await expect(quoteLinksService.reconcile(company, { maxRefs: 3 })).resolves.toEqual({ linked: 2, unlinked: 0, unchanged: 0, quoteNotFound: 0, remaining: 0 });
    expect(sentRefs()).toEqual([ref(1), ref(2), ref(3), ref(4), ref(5)]);
    // A run that goes on has nothing to compare: the shipments were read once.
    expect(repository.salesReferenceShipments).toHaveBeenCalledTimes(1);

    // Got through: the next run compares everything anew.
    syncCall.mockClear();
    await expect(quoteLinksService.reconcile(company, { maxRefs: 3 })).resolves.toMatchObject({ quoteNotFound: 3, remaining: 0 });
    expect(sentRefs()).toEqual([ref(1), ref(2), ref(3)]);
  });

  it("tells a reference left over by an earlier run what names it now, not what named it then", async () => {
    shipments = [shipment(1, ref(1)), shipment(2, ref(2))];
    links = new Map([
      [ref(1), null],
      [ref(2), null],
    ]);
    await quoteLinksService.reconcile(company, { maxRefs: 1 });
    // The shipment of the second reference is deleted before its turn comes.
    shipments = [shipment(1, ref(1))];
    await expect(quoteLinksService.reconcile(company, { maxRefs: 1 })).resolves.toMatchObject({ unchanged: 1, remaining: 0 });
    expect(sent()[1]).toEqual([{ quoteNumber: ref(2), shipments: [] }]);
  });

  it("keeps the companies apart", async () => {
    const other = randomUUID();
    shipments = [shipment(1, ref(1)), shipment(2, ref(2))];
    links = new Map([
      [ref(1), null],
      [ref(2), null],
    ]);
    await expect(quoteLinksService.reconcile(company, { maxRefs: 1 })).resolves.toMatchObject({ remaining: 1 });
    // The other company starts from the beginning, not from what the first one left.
    links.set(ref(1), null);
    await expect(quoteLinksService.reconcile(other, { maxRefs: 1 })).resolves.toMatchObject({ linked: 1, remaining: 1 });
    expect(sentRefs()).toEqual([ref(1), ref(1)]);
  });
});

describe("ensureQuoteLinksSynced", () => {
  const runs = () => linksCall.mock.calls.length;

  it("compares the links the first time a process is asked, then once an hour", async () => {
    await quoteLinksService.ensureQuoteLinksSynced(company);
    expect(runs()).toBe(1);
    vi.setSystemTime(NOW.getTime() + 59 * MINUTE);
    await quoteLinksService.ensureQuoteLinksSynced(company);
    expect(runs()).toBe(1);
    vi.setSystemTime(NOW.getTime() + 60 * MINUTE);
    await quoteLinksService.ensureQuoteLinksSynced(company);
    expect(runs()).toBe(2);
  });

  it("handles 400 references per run and goes on at the next occasion while some are left", async () => {
    shipments = Array.from({ length: 900 }, (_, i) => shipment(i + 1, ref(i + 1)));
    for (const s of shipments) links.set(s.reference, null);
    for (const linkedSoFar of [400, 800, 900, 900]) {
      await quoteLinksService.ensureQuoteLinksSynced(company);
      expect([...links.values()].filter(Boolean)).toHaveLength(linkedSoFar);
    }
    expect(runs()).toBe(3);
  });

  it("runs again at the next occasion after a sync was marked as failed - once", async () => {
    await quoteLinksService.ensureQuoteLinksSynced(company);
    quoteLinksService.markDirty(company);
    await quoteLinksService.ensureQuoteLinksSynced(company);
    await quoteLinksService.ensureQuoteLinksSynced(company);
    expect(runs()).toBe(2);
  });

  it("does not forget a failure that is marked while a run is under way", async () => {
    linksCall.mockImplementationOnce(async () => {
      // A shipment write fails to tell its quote after this run has started to compare.
      quoteLinksService.markDirty(company);
      return { links: [] };
    });
    await quoteLinksService.ensureQuoteLinksSynced(company);
    await quoteLinksService.ensureQuoteLinksSynced(company);
    expect(runs()).toBe(2);
  });

  it("never fails its caller: a run that fails is logged, left alone for a minute and then tried again", async () => {
    linksCall.mockRejectedValueOnce(new Error("quotes is unreachable"));
    await expect(quoteLinksService.ensureQuoteLinksSynced(company)).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledTimes(1);

    // Not even a sync marked as failed makes it run within that minute.
    quoteLinksService.markDirty(company);
    vi.setSystemTime(NOW.getTime() + MINUTE - 1);
    await quoteLinksService.ensureQuoteLinksSynced(company);
    expect(runs()).toBe(1);

    vi.setSystemTime(NOW.getTime() + MINUTE);
    await quoteLinksService.ensureQuoteLinksSynced(company);
    expect(runs()).toBe(2);
    // That one got through: the hour starts.
    await quoteLinksService.ensureQuoteLinksSynced(company);
    expect(runs()).toBe(2);
  });

  it("starts with a fresh comparison after a run that failed half way", async () => {
    shipments = Array.from({ length: 5 }, (_, i) => shipment(i + 1, ref(i + 1)));
    for (const s of shipments) links.set(s.reference, null);
    // The first run links two quotes, then the quotes service fails.
    syncCall.mockImplementationOnce(quotesAnswer).mockImplementationOnce(quotesAnswer).mockRejectedValueOnce(new Error("quotes is unreachable"));
    await quoteLinksService.ensureQuoteLinksSynced(company);
    expect([...links.values()].filter(Boolean)).toHaveLength(2);

    vi.setSystemTime(NOW.getTime() + MINUTE);
    syncCall.mockClear();
    await quoteLinksService.ensureQuoteLinksSynced(company);
    expect([...links.values()].filter(Boolean)).toHaveLength(5);
    // Only what still differs is sent.
    expect(sentRefs()).toEqual([ref(3), ref(4), ref(5)]);
  });
});

describe("sync", () => {
  it("says that it did not run when no run is due", async () => {
    await expect(quoteLinksService.sync(company, "admin", false)).resolves.toEqual({ ran: true, linked: 0, unlinked: 0, unchanged: 0, quoteNotFound: 0, remaining: 0 });
    shipments = [shipment(1, ref(1))];
    links.set(ref(1), null);
    await expect(quoteLinksService.sync(company, "admin", false)).resolves.toEqual({ ran: false, linked: 0, unlinked: 0, unchanged: 0, quoteNotFound: 0, remaining: 0 });
    expect(links.get(ref(1))).toBeNull();
  });

  it("shares the hour with the list of shipments: whichever runs first, the other waits", async () => {
    await quoteLinksService.ensureQuoteLinksSynced(company);
    await expect(quoteLinksService.sync(company, "admin", false)).resolves.toMatchObject({ ran: false });
    vi.setSystemTime(NOW.getTime() + 60 * MINUTE);
    await expect(quoteLinksService.sync(company, "admin", false)).resolves.toMatchObject({ ran: true });
    await quoteLinksService.ensureQuoteLinksSynced(company);
    expect(linksCall).toHaveBeenCalledTimes(2);
  });

  it("forced, runs although none is due and goes on until nothing is left, adding up what it did", async () => {
    await quoteLinksService.sync(company, "admin", false);
    shipments = Array.from({ length: 900 }, (_, i) => shipment(i + 1, ref(i + 1)));
    for (const s of shipments.slice(0, 850)) links.set(s.reference, null);
    links.set(ref(999), "shipment-999");

    await expect(quoteLinksService.sync(company, "admin", true)).resolves.toEqual({ ran: true, linked: 850, unlinked: 1, unchanged: 0, quoteNotFound: 50, remaining: 0 });
    // Three runs of at most 400 references.
    expect(linksCall).toHaveBeenCalledTimes(4);
  });

  it("forced, ends although more quotes are missing than one run handles", async () => {
    shipments = Array.from({ length: 900 }, (_, i) => shipment(i + 1, ref(i + 1)));
    await expect(quoteLinksService.sync(company, "admin", true)).resolves.toEqual({ ran: true, linked: 0, unlinked: 0, unchanged: 0, quoteNotFound: 900, remaining: 0 });
    expect(sentRefs()).toHaveLength(900);
  });

  it("forced, compares everything anew instead of going on where a run stopped", async () => {
    shipments = Array.from({ length: 450 }, (_, i) => shipment(i + 1, ref(i + 1)));
    for (const s of shipments) links.set(s.reference, null);
    await quoteLinksService.sync(company, "admin", false);
    // A link is lost again among the references the first run already handled.
    links.set(ref(1), null);
    await expect(quoteLinksService.sync(company, "admin", true)).resolves.toMatchObject({ ran: true, linked: 51, remaining: 0 });
    expect(links.get(ref(1))).toBe("shipment-1");
  });

  it("answers a failure as a failure - and the next run waits the minute", async () => {
    linksCall.mockRejectedValueOnce(new Error("quotes is unreachable"));
    await expect(quoteLinksService.sync(company, "admin", false)).rejects.toThrow("quotes is unreachable");
    await expect(quoteLinksService.sync(company, "admin", false)).resolves.toMatchObject({ ran: false });
    await expect(quoteLinksService.sync(company, "admin", true)).resolves.toMatchObject({ ran: true });
  });
});
