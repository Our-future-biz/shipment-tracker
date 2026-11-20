import { beforeEach, describe, expect, it, vi } from "vitest";

// The Encore runtime isn't loaded under vitest: api() hands back the handler, and the signed-in user comes from a
// stubbed getAuthData.
const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
vi.mock("encore.dev/api", () => ({ api: (_opts: unknown, handler: unknown) => handler }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/auth", () => ({ getAuthData: () => ({ userID: "u1", companyID: COMPANY, role: "user" }) }));
vi.mock("../repositories/invoice.repository", () => ({ invoiceRepository: { lateChargeShipmentIds: vi.fn() } }));

import log from "encore.dev/log";
import { LATE_CHARGE_JOB_LIMIT, _internalLateChargeShipments } from "../controllers/_internalLateChargeShipments.controller";
import { invoiceRepository } from "../repositories/invoice.repository";

const read = vi.mocked(invoiceRepository.lateChargeShipmentIds);
const ask = _internalLateChargeShipments as unknown as () => Promise<{ shipmentIds: string[] }>;
const ids = (n: number) => Array.from({ length: n }, (_, i) => `job-${i}`);

// Review 4, Minor 2: the cap is well above one queue view, and reaching it is said in the log, not silent.
describe("the jobs with a charge added after their invoice, as the shipments list asks for them", () => {
  beforeEach(() => vi.clearAllMocks());

  it("are read for the caller's company, up to 5000", async () => {
    read.mockResolvedValue(["job-55"]);
    expect(await ask()).toEqual({ shipmentIds: ["job-55"] });
    expect(LATE_CHARGE_JOB_LIMIT).toBe(5000);
    expect(read).toHaveBeenCalledWith(COMPANY, 5000);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("log when the limit is reached: the oldest such jobs are then left out", async () => {
    read.mockResolvedValue(ids(LATE_CHARGE_JOB_LIMIT - 1));
    await ask();
    expect(log.warn).not.toHaveBeenCalled();
    read.mockResolvedValue(ids(LATE_CHARGE_JOB_LIMIT));
    expect((await ask()).shipmentIds).toHaveLength(LATE_CHARGE_JOB_LIMIT);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("reached the limit"), { companyId: COMPANY, limit: LATE_CHARGE_JOB_LIMIT });
  });
});
