import { beforeEach, describe, expect, it, vi } from "vitest";

// Many jobs' rates READ ONLY (Shipments → Managers, the Money tab), against stand-ins for the fx tables - and,
// to compare, the read that fixes rates (services/fxJobRates) over the same tables with stand-ins for Shipments
// and Invoicing. The planning and ČNB's rules (lib/jobRates, lib/rates) run for real.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const clients = vi.hoisted(() => ({ shipmentGet: vi.fn(), openInvoiceCount: vi.fn(), openInvoiceShipments: vi.fn() }));
vi.mock("~encore/clients", () => ({
  shipments: { shipmentGet: clients.shipmentGet },
  invoicing: { openInvoiceCount: clients.openInvoiceCount, _internalOpenInvoiceShipments: clients.openInvoiceShipments },
}));

// ČNB's fixings as stored: every working day from 5 to 13 Oct 2026 (the 14th is not published yet) - and BGN,
// which ČNB published for the last time on the 5th.
const FIXINGS = vi.hoisted(() => [
  { validDate: "2026-10-05", currency: "BGN", amount: 1, rate: "12.400" },
  ...["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-12", "2026-10-13"].flatMap((validDate, i) => [
    { validDate, currency: "EUR", amount: 1, rate: (24 + i / 10).toFixed(3) },
    { validDate, currency: "USD", amount: 1, rate: (21 + i / 10).toFixed(3) },
    { validDate, currency: "HUF", amount: 100, rate: (6 + i / 10).toFixed(3) },
  ]),
]);
const ALL = ["BGN", "EUR", "HUF", "USD"];
const cnb = vi.hoisted(() => ({ currencies: vi.fn(), latestOnOrBefore: vi.fn(), between: vi.fn(), insertNew: vi.fn() }));
vi.mock("../repositories/cnbRate.repository", () => ({ cnbRateRepository: cnb }));
const locks = vi.hoisted(() => ({ get: vi.fn(), getMany: vi.fn(), lock: vi.fn(), softDeleteForShipment: vi.fn() }));
vi.mock("../repositories/jobRate.repository", () => ({ jobRateRepository: locks }));
vi.mock("../lib/dates", async (original) => ({
  ...(await original<typeof import("../lib/dates")>()),
  pragueToday: () => "2026-10-14",
  expectedLatestFixing: () => "2026-10-13",
}));

import { fxJobRatesService } from "../services/fxJobRates.service";
import { fxJobRatesReadService } from "../services/fxJobRatesRead.service";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const id = (n: number) => `7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c0${n}`;
const job = (over: Record<string, unknown> = {}) => ({
  tradeDirection: "Import", estimatedArrival: "2026-10-20", estimatedDeparture: "2026-09-30", actualArrival: null as string | null, actualDeparture: null as string | null, ...over,
});
const lockRow = (shipmentId: string, rateDate: string, basis = "ata") => ({
  shipmentId, basis, rateDate, lockedAt: new Date("2026-10-12T10:00:00Z"), previousRateDate: null,
  rates: { EUR: { rate: 99, fixingDate: rateDate }, USD: { rate: 88, fixingDate: rateDate } },
});

beforeEach(() => {
  vi.clearAllMocks();
  cnb.currencies.mockResolvedValue(ALL);
  cnb.between.mockImplementation(async (from: string, to: string, currencies?: string[]) =>
    FIXINGS.filter((r) => r.validDate >= from && r.validDate <= to && (!currencies?.length || currencies.includes(r.currency))),
  );
  cnb.latestOnOrBefore.mockImplementation(async (date: string, currencies: string[]) =>
    currencies.flatMap((currency) => FIXINGS.filter((r) => r.currency === currency && r.validDate <= date).slice(-1)),
  );
  locks.getMany.mockResolvedValue(new Map());
  locks.lock.mockImplementation(async (_c: string, shipmentId: string, _basis: string, rateDate: string, rates: unknown) => ({
    shipmentId, rateDate, rates, lockedAt: new Date("2026-10-14T10:00:00Z"), previousRateDate: null,
  }));
  clients.openInvoiceShipments.mockResolvedValue({ shipmentIds: [] });
});

describe("many jobs' rates, read only", () => {
  it("answers each job the rates the fixing read would - and fixes none", async () => {
    const shipments: Record<string, ReturnType<typeof job>> = {
      [id(1)]: job({ actualArrival: "2026-10-12" }), // arrived, not fixed yet: the fixing read fixes it now
      [id(2)]: job({ actualArrival: "2026-10-13" }), // fixed at the 9th and invoiced: the stored rates hold although the ATA moved
      [id(3)]: job(), // on its way: by ETA, ahead of every fixing
      [id(4)]: job({ actualArrival: "2026-10-11" }), // arrived on a Sunday: Friday's fixing, final
      [id(5)]: job({ tradeDirection: "Export", actualDeparture: "2026-10-14" }), // left today, before today's fixing: not final
      [id(6)]: job({ actualArrival: "2026-10-12" }), // fixed at the 9th, not invoiced, the ATA moved: fixed again by the fixing read
      [id(7)]: job({ tradeDirection: "", estimatedArrival: null }), // no direction, no dates: today, as an import
    };
    const stored = new Map([[id(2), lockRow(id(2), "2026-10-09")], [id(6), lockRow(id(6), "2026-10-09")]]);
    locks.getMany.mockResolvedValue(stored);
    clients.shipmentGet.mockImplementation(async ({ shipmentId }: { shipmentId: string }) => ({ shipment: shipments[shipmentId] }));
    clients.openInvoiceShipments.mockResolvedValue({ shipmentIds: [id(2)] });
    const ids = Object.keys(shipments);

    const read = await fxJobRatesReadService.forJobs(COMPANY, ids.map((shipmentId) => ({ shipmentId, dates: shipments[shipmentId]!, invoiced: shipmentId === id(2) })));

    // Two statements, whatever the number of jobs and dates; nothing written.
    expect(locks.getMany).toHaveBeenCalledTimes(1);
    expect(locks.getMany).toHaveBeenCalledWith(COMPANY, ids);
    expect(cnb.between).toHaveBeenCalledTimes(1);
    expect(cnb.latestOnOrBefore).not.toHaveBeenCalled();
    expect(locks.lock).not.toHaveBeenCalled();
    expect(read.unreadable).toEqual([]);
    expect(read.notFixed).toEqual([]);
    expect(read.jobs.map((j) => [j.shipmentId, j.status, j.basis, j.rateDate])).toEqual([
      [id(1), "provisional", "ata", "2026-10-12"],
      [id(2), "locked", "ata", "2026-10-09"],
      [id(3), "provisional", "eta", "2026-10-20"],
      [id(4), "provisional", "ata", "2026-10-11"],
      [id(5), "provisional", "atd", "2026-10-14"],
      [id(6), "provisional", "ata", "2026-10-12"],
      [id(7), "provisional", "today", "2026-10-14"],
    ]);

    // The read that fixes, over the same tables: the same rates of the same date for every job.
    const fixing = await fxJobRatesService.forShipments(COMPANY, ids);
    expect(fixing.unreadable).toEqual([]);
    expect(locks.lock.mock.calls.map((c) => [c[1], c[3]])).toEqual([[id(1), "2026-10-12"], [id(4), "2026-10-11"], [id(6), "2026-10-12"]]);
    const shown = (jobs: typeof read.jobs) => jobs.map((j) => ({ shipmentId: j.shipmentId, basis: j.basis, rateDate: j.rateDate, direction: j.direction, directionAssumed: j.directionAssumed, ratesMissing: j.ratesMissing, rates: j.rates }));
    expect(shown(read.jobs)).toEqual(shown(fixing.jobs));
    // …and of them only the stored ones are said to be fixed here.
    expect(fixing.jobs.filter((j) => j.status === "locked").map((j) => j.shipmentId)).toEqual([id(1), id(2), id(4), id(6)]);
    expect(read.jobs.find((j) => j.shipmentId === id(4))!.rates).toEqual([
      { currency: "EUR", rate: 24.4, fixingDate: "2026-10-09" },
      { currency: "HUF", rate: 0.064, fixingDate: "2026-10-09" },
      { currency: "USD", rate: 21.4, fixingDate: "2026-10-09" },
    ]);
  });

  it("answers only the currencies asked for, and reads only their fixings", async () => {
    locks.getMany.mockResolvedValue(new Map([[id(2), lockRow(id(2), "2026-10-09")]]));
    const asked = [{ shipmentId: id(1), dates: job(), invoiced: false }, { shipmentId: id(2), dates: job({ actualArrival: "2026-10-09" }), invoiced: false }];
    const eur = await fxJobRatesReadService.forJobs(COMPANY, asked, ["eur"]);
    expect(eur.jobs.map((j) => j.rates)).toEqual([[{ currency: "EUR", rate: 24.6, fixingDate: "2026-10-13" }], [{ currency: "EUR", rate: 99, fixingDate: "2026-10-09" }]]);
    expect(cnb.between).toHaveBeenLastCalledWith("2026-09-13", "2026-10-20", ["EUR"]);

    // Another currency is read with the one ČNB always publishes beside it - and still only it is answered.
    const usd = await fxJobRatesReadService.forJobs(COMPANY, asked, ["USD", "HUF"]);
    expect(cnb.between).toHaveBeenLastCalledWith("2026-09-13", "2026-10-20", ["EUR", "HUF", "USD"]);
    expect(usd.jobs[0]!.rates).toEqual([{ currency: "HUF", rate: 0.066, fixingDate: "2026-10-13" }, { currency: "USD", rate: 21.6, fixingDate: "2026-10-13" }]);
    // Every currency is read only when none is named.
    await fxJobRatesReadService.forJobs(COMPANY, asked);
    expect(cnb.between).toHaveBeenLastCalledWith("2026-09-13", "2026-10-20");
  });

  it("gives no rate for a currency ČNB no longer publishes, also when it alone is asked for - as the fixing read gives none", async () => {
    clients.shipmentGet.mockResolvedValue({ shipment: job() });
    const read = await fxJobRatesReadService.forJobs(COMPANY, [{ shipmentId: id(1), dates: job(), invoiced: false }], ["BGN"]);
    expect(cnb.between).toHaveBeenLastCalledWith("2026-09-13", "2026-10-20", ["BGN", "EUR"]);
    // Its last fixing of the 5th is not the rate of the 20th: it is left out, not carried.
    expect(read.jobs[0]).toMatchObject({ shipmentId: id(1), rates: [], ratesMissing: false });
    const fixing = await fxJobRatesService.forShipments(COMPANY, [id(1)]);
    expect(fixing.jobs[0]!.rates.map((r) => r.currency)).toEqual(["EUR", "HUF", "USD"]);
    // While it was published, it has its rate.
    const then = await fxJobRatesReadService.forJobs(COMPANY, [{ shipmentId: id(2), dates: job({ actualArrival: "2026-10-05" }), invoiced: false }], ["BGN"]);
    expect(then.jobs[0]!.rates).toEqual([{ currency: "BGN", rate: 12.4, fixingDate: "2026-10-05" }]);
  });

  it("reads no date for a job that answers its stored rates: old fixed jobs take none of the reads of old dates", async () => {
    // Thirty jobs that arrived in 2019, each on its own day, all fixed then: invoiced, or fixed at their ATA.
    const old = Array.from({ length: 30 }, (_, i) => ({ shipmentId: `7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1d${String(i).padStart(2, "0")}`, day: `2019-03-${String(i + 1).padStart(2, "0")}` }));
    locks.getMany.mockResolvedValue(new Map(old.map((o) => [o.shipmentId, lockRow(o.shipmentId, o.day)])));
    const out = await fxJobRatesReadService.forJobs(COMPANY, [
      ...old.map((o, i) => ({ shipmentId: o.shipmentId, dates: job({ actualArrival: i % 2 ? o.day : "2019-04-15" }), invoiced: i % 2 ? false : true })),
      { shipmentId: id(1), dates: job(), invoiced: false },
    ]);
    expect(out.unreadable).toEqual([]);
    expect(out.jobs.map((j) => j.status)).toEqual([...old.map(() => "locked"), "provisional"]);
    // Only the one job not fixed had its date's rates read.
    expect(cnb.latestOnOrBefore).not.toHaveBeenCalled();
    expect(cnb.currencies).not.toHaveBeenCalled();
    expect(cnb.between).toHaveBeenCalledTimes(1);
    expect(cnb.between).toHaveBeenLastCalledWith("2026-09-13", "2026-10-20");

    // With stored rates only, ČNB's fixings are not read at all.
    vi.clearAllMocks();
    locks.getMany.mockResolvedValue(new Map(old.map((o) => [o.shipmentId, lockRow(o.shipmentId, o.day)])));
    const fixed = await fxJobRatesReadService.forJobs(COMPANY, old.map((o) => ({ shipmentId: o.shipmentId, dates: job({ actualArrival: o.day }), invoiced: null })));
    expect(fixed.jobs).toHaveLength(30);
    expect(cnb.between).not.toHaveBeenCalled();
  });

  it("without a job's dates answers its stored rates, and names a job with none as not fixed", async () => {
    locks.getMany.mockResolvedValue(new Map([[id(1), lockRow(id(1), "2026-10-09", "atd")]]));
    const out = await fxJobRatesReadService.forJobs(COMPANY, [{ shipmentId: id(1), invoiced: null }, { shipmentId: id(2), dates: null, invoiced: true }]);
    expect(out.jobs).toEqual([
      expect.objectContaining({ shipmentId: id(1), status: "locked", basis: "atd", direction: "export", rateDate: "2026-10-09", lockedAt: "2026-10-12T10:00:00.000Z" }),
    ]);
    expect(out.notFixed).toEqual([id(2)]);
    expect(out.unreadable).toEqual([]);
    // No date to value by: ČNB's fixings are not read at all.
    expect(cnb.between).not.toHaveBeenCalled();
  });

  it("does not value a job whose stored rates may move while it is not known whether it is invoiced", async () => {
    locks.getMany.mockResolvedValue(new Map([[id(1), lockRow(id(1), "2026-10-09")], [id(2), lockRow(id(2), "2026-10-09")]]));
    const out = await fxJobRatesReadService.forJobs(COMPANY, [
      { shipmentId: id(1), dates: job({ actualArrival: "2026-10-12" }), invoiced: null }, // the ATA moved
      { shipmentId: id(2), dates: job({ actualArrival: "2026-10-09" }), invoiced: null }, // fixed at its ATA: holds either way
    ]);
    expect(out.jobs.map((j) => [j.shipmentId, j.status])).toEqual([[id(2), "locked"]]);
    expect(out.unreadable).toEqual([id(1)]);
  });

  it("does not value what is no id of a job, or a job with a date that is no date - and answers a job asked twice once", async () => {
    const out = await fxJobRatesReadService.forJobs(COMPANY, [
      { shipmentId: "nope", dates: job(), invoiced: false },
      { shipmentId: id(1), dates: job({ actualArrival: "next week" }), invoiced: false },
      { shipmentId: id(2), dates: job(), invoiced: false },
      { shipmentId: id(2), dates: job({ actualArrival: "2026-10-12" }), invoiced: false },
    ]);
    expect(out.unreadable).toEqual(["nope", id(1)]);
    expect(out.jobs.map((j) => [j.shipmentId, j.basis])).toEqual([[id(2), "eta"]]);
    expect(locks.getMany).toHaveBeenCalledWith(COMPANY, [id(2)]);
  });

  it("reads a date older than its window on its own, as the fixing read reads every date", async () => {
    const old = { validDate: "2023-03-01", currency: "EUR", amount: 1, rate: "23.500" };
    cnb.latestOnOrBefore.mockResolvedValue([old]);
    const out = await fxJobRatesReadService.forJobs(COMPANY, [
      { shipmentId: id(1), dates: job({ actualArrival: "2023-03-01" }), invoiced: false },
      { shipmentId: id(2), dates: job(), invoiced: false },
    ]);
    expect(cnb.between).toHaveBeenCalledTimes(1);
    expect(cnb.currencies).toHaveBeenCalledTimes(1);
    expect(cnb.latestOnOrBefore).toHaveBeenCalledTimes(1);
    expect(cnb.latestOnOrBefore).toHaveBeenCalledWith("2023-03-01", ALL);
    expect(out.jobs[0]).toMatchObject({ shipmentId: id(1), rateDate: "2023-03-01", rates: [{ currency: "EUR", rate: 23.5, fixingDate: "2023-03-01" }] });
    expect(locks.lock).not.toHaveBeenCalled();

    // Asked for some currencies only, the old date is read for those (no list of all of them is needed).
    vi.clearAllMocks();
    locks.getMany.mockResolvedValue(new Map());
    cnb.latestOnOrBefore.mockResolvedValue([old]);
    await fxJobRatesReadService.forJobs(COMPANY, [{ shipmentId: id(1), dates: job({ actualArrival: "2023-03-01" }), invoiced: false }], ["USD"]);
    expect(cnb.latestOnOrBefore).toHaveBeenCalledWith("2023-03-01", ["EUR", "USD"]);
    expect(cnb.currencies).not.toHaveBeenCalled();
    expect(cnb.between).not.toHaveBeenCalled();
  });

  it("reads the fixings from a month before the earliest date - or before today, for a job still ahead - to the latest", async () => {
    await fxJobRatesReadService.forJobs(COMPANY, [{ shipmentId: id(1), dates: job({ actualArrival: "2026-10-01" }), invoiced: false }, { shipmentId: id(2), dates: job({ estimatedArrival: "2026-12-24" }), invoiced: false }]);
    expect(cnb.between).toHaveBeenLastCalledWith("2026-08-31", "2026-12-24");
    await fxJobRatesReadService.forJobs(COMPANY, [{ shipmentId: id(2), dates: job({ estimatedArrival: "2026-12-24" }), invoiced: false }]);
    expect(cnb.between).toHaveBeenLastCalledWith("2026-09-13", "2026-12-24");
  });

  it("reads nothing when no job is asked", async () => {
    await expect(fxJobRatesReadService.forJobs(COMPANY, [])).resolves.toEqual({ jobs: [], notFixed: [], unreadable: [] });
    expect(locks.getMany).not.toHaveBeenCalled();
  });
});
