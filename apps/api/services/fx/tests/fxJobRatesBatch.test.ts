import { beforeEach, describe, expect, it, vi } from "vitest";

// Several jobs' rates at once (a customer's Shipments tab), against stand-ins for Shipments,
// Invoicing and the fx tables. The planning itself (lib/jobRates) runs for real.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const clients = vi.hoisted(() => ({
  shipmentGet: vi.fn(),
  openInvoiceCount: vi.fn(),
  openInvoiceShipments: vi.fn(),
}));
vi.mock("~encore/clients", () => ({
  shipments: { shipmentGet: clients.shipmentGet },
  invoicing: { openInvoiceCount: clients.openInvoiceCount, _internalOpenInvoiceShipments: clients.openInvoiceShipments },
}));
const cnb = vi.hoisted(() => ({ currencies: vi.fn(async () => ["EUR"]), latestOnOrBefore: vi.fn(async () => []) }));
vi.mock("../repositories/cnbRate.repository", () => ({ cnbRateRepository: cnb }));
const locks = vi.hoisted(() => ({ get: vi.fn(), getMany: vi.fn(), lock: vi.fn() }));
vi.mock("../repositories/jobRate.repository", () => ({ jobRateRepository: locks }));
vi.mock("../lib/dates", () => ({ pragueToday: () => "2026-10-14", expectedLatestFixing: () => "2026-10-13" }));
// ČNB's final rate on whatever day is asked.
vi.mock("../lib/rates", () => ({
  ratesForDate: (_rows: unknown, date: string) => ({ rates: [{ currency: "EUR", rate: 25, fixingDate: date }], retired: [], fixingDate: date, provisional: false, missing: false }),
}));

import { APIError } from "../../../lib/tests/encoreApi.stub";
import { fxJobRatesService } from "../services/fxJobRates.service";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const job = (over: Record<string, unknown> = {}) => ({
  tradeDirection: "Import", estimatedArrival: "2026-10-20", estimatedDeparture: "2026-09-30", actualArrival: null, actualDeparture: null, ...over,
});
const lockRow = (shipmentId: string, rateDate: string) => ({
  shipmentId, rateDate, lockedAt: new Date("2026-10-12T10:00:00Z"), previousRateDate: null, rates: { EUR: { rate: 24, fixingDate: rateDate } },
});

beforeEach(() => {
  vi.clearAllMocks();
  locks.lock.mockImplementation(async (_c: string, shipmentId: string, _basis: string, rateDate: string, rates: unknown) => ({
    shipmentId, rateDate, rates, lockedAt: new Date("2026-10-14T10:00:00Z"), previousRateDate: null,
  }));
});

describe("several jobs' rates at once", () => {
  it("reads the locks in one query and which jobs are invoiced in one call, and values each job as one by one", async () => {
    const shipments: Record<string, ReturnType<typeof job>> = {
      s1: job({ actualArrival: "2026-10-12" }), // arrived, not locked yet: locked now
      s2: job({ actualArrival: "2026-10-13" }), // locked at the 12th, invoiced: the lock holds although ATA moved
      s4: job(), // on its way: provisional by ETA
    };
    clients.shipmentGet.mockImplementation(async ({ shipmentId }: { shipmentId: string }) => {
      if (!shipments[shipmentId]) throw APIError.notFound("Shipment not found");
      return { shipment: shipments[shipmentId] };
    });
    locks.getMany.mockResolvedValue(new Map([["s2", lockRow("s2", "2026-10-12")]]));
    clients.openInvoiceShipments.mockResolvedValue({ shipmentIds: ["s2"] });

    const { jobs, unreadable } = await fxJobRatesService.forShipments(COMPANY, ["s1", "s2", "s3", "s4", "s1"]);

    expect(locks.getMany).toHaveBeenCalledTimes(1);
    expect(locks.getMany).toHaveBeenCalledWith(COMPANY, ["s1", "s2", "s4"]);
    expect(clients.openInvoiceShipments).toHaveBeenCalledTimes(1);
    expect(clients.openInvoiceShipments).toHaveBeenCalledWith({ shipmentIds: ["s2"] });
    expect(clients.openInvoiceCount).not.toHaveBeenCalled();
    expect(clients.shipmentGet).toHaveBeenCalledTimes(4);
    expect(jobs.map((j) => [j.shipmentId, j.status, j.basis, j.rateDate])).toEqual([
      ["s1", "locked", "ata", "2026-10-12"],
      ["s2", "locked", "ata", "2026-10-12"],
      ["s4", "provisional", "eta", "2026-10-20"],
    ]);
    expect(locks.lock).toHaveBeenCalledTimes(1);
    expect(locks.lock).toHaveBeenCalledWith(COMPANY, "s1", "ata", "2026-10-12", { EUR: { rate: 25, fixingDate: "2026-10-12" } });
    // A job that is gone (or another company's) is told apart, not a failure of the others.
    expect(unreadable).toEqual(["s3"]);
  });

  it("reads ČNB's rates once per date, however many jobs are valued on it", async () => {
    clients.shipmentGet.mockResolvedValue({ shipment: job() });
    locks.getMany.mockResolvedValue(new Map());
    const { jobs } = await fxJobRatesService.forShipments(COMPANY, ["a", "b", "c"]);
    expect(jobs).toHaveLength(3);
    expect(cnb.currencies).toHaveBeenCalledTimes(1);
    // Nobody is locked: Invoicing is not asked.
    expect(clients.openInvoiceShipments).not.toHaveBeenCalled();
  });

  it("does not value the locked jobs when Invoicing can't say which are invoiced, so no lock moves that an invoice holds", async () => {
    clients.shipmentGet.mockImplementation(async ({ shipmentId }: { shipmentId: string }) => ({ shipment: shipmentId === "s2" ? job({ actualArrival: "2026-10-13" }) : job() }));
    locks.getMany.mockResolvedValue(new Map([["s2", lockRow("s2", "2026-10-12")]]));
    clients.openInvoiceShipments.mockRejectedValue(APIError.unavailable("invoicing down"));
    const { jobs, unreadable } = await fxJobRatesService.forShipments(COMPANY, ["s1", "s2"]);
    expect(jobs.map((j) => j.shipmentId)).toEqual(["s1"]);
    expect(unreadable).toEqual(["s2"]);
    expect(locks.lock).not.toHaveBeenCalled();
  });

  it("asks nothing for no jobs", async () => {
    await expect(fxJobRatesService.forShipments(COMPANY, [])).resolves.toEqual({ jobs: [], unreadable: [] });
    expect(clients.shipmentGet).not.toHaveBeenCalled();
  });
});

describe("one job's rates", () => {
  it("are worked out as before: the shipment, its lock, and Invoicing asked only for a locked job", async () => {
    clients.shipmentGet.mockResolvedValue({ shipment: job({ actualArrival: "2026-10-13" }) });
    locks.get.mockResolvedValue(lockRow("s2", "2026-10-12"));
    clients.openInvoiceCount.mockResolvedValue({ count: 1 });
    await expect(fxJobRatesService.forShipment(COMPANY, "s2")).resolves.toMatchObject({ status: "locked", rateDate: "2026-10-12" });
    expect(clients.openInvoiceCount).toHaveBeenCalledWith({ shipmentId: "s2" });
    clients.shipmentGet.mockRejectedValue(APIError.notFound("gone"));
    await expect(fxJobRatesService.forShipment(COMPANY, "s9")).rejects.toMatchObject({ code: "not_found", message: "Shipment not found" });
  });
});
