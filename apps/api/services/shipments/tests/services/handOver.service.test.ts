import { beforeEach, describe, expect, it, vi } from "vitest";

const shipments = vi.hoisted(() => ({ getByIdForCompany: vi.fn() }));
const service = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({ auth: { usersList: vi.fn() } }));
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: shipments }));
vi.mock("../../services/shipment.service", () => ({ shipmentService: service }));

import { auth } from "~encore/clients";
import { APIError } from "../../../../lib/tests/encoreApi.stub";
import { handOverService } from "../../services/handOver.service";

// Handing many jobs over, against stand-ins for the shipment repository and service: every job
// goes through the shipment service's update as the manager (the single edit's own write), with
// the hand-over's history line riding along; one job's failure never stops the others.

const manager = { userID: "5a7c9e11-3b2d-4f6a-8c0e-1d2f3a4b5c02", companyID: "c1", role: "manager" };
const id = (n: number) => `7b0e4d53-08a5-4e5e-9a0b-${String(n).padStart(12, "0")}`;
const job = (n: number, over = {}) => ({ id: id(n), jobNumber: `CZFCL${String(n).padStart(8, "0")}`, personInCharge: "jan@firma.cz", holidayCover: "", ...over });
let jobs: Map<string, ReturnType<typeof job>>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(auth.usersList).mockResolvedValue({
    users: [
      { id: "u-jan", email: "jan@firma.cz", displayName: "Jan Novák" },
      { id: "u-eva", email: "Eva@Firma.cz", displayName: "Eva Malá" },
    ],
  } as never);
  jobs = new Map([1, 2, 3].map((n) => [id(n), job(n)]));
  shipments.getByIdForCompany.mockImplementation(async (shipmentId: string) => jobs.get(shipmentId) ?? null);
  service.update.mockResolvedValue({});
});

describe("handing jobs over", () => {
  it("changes each job through the shipment's own update, as the manager, with the hand-over's line in the same write", async () => {
    const result = await handOverService.handOver(manager, { shipmentIds: [id(1), id(2)], handledBy: " EVA@firma.cz ", reason: " Jan is ill " });
    expect(result).toEqual({ changed: 2, skipped: [] });
    expect(service.update).toHaveBeenCalledTimes(2);
    expect(service.update).toHaveBeenCalledWith(id(1), "c1", { personInCharge: "eva@firma.cz" }, manager.userID, "manager", undefined, undefined, {
      history: [{ field: "handOver", oldValue: null, newValue: "jan@firma.cz → eva@firma.cz: Jan is ill" }],
    });
  });

  it("sets a Holiday Cover, clears one with \"\", and leaves Handled By when it is not named", async () => {
    await handOverService.handOver(manager, { shipmentIds: [id(1)], holidayCover: "eva@firma.cz", reason: "Jan on holiday" });
    expect(service.update.mock.lastCall![2]).toEqual({ holidayCover: "eva@firma.cz" });
    expect(service.update.mock.lastCall![7]).toEqual({ history: [{ field: "handOver", oldValue: null, newValue: "Holiday Cover nobody → eva@firma.cz: Jan on holiday" }] });

    jobs.set(id(1), job(1, { holidayCover: "eva@firma.cz" }));
    await handOverService.handOver(manager, { shipmentIds: [id(1)], handledBy: "", holidayCover: "", reason: "Jan is back" });
    expect(service.update.mock.lastCall![2]).toEqual({ holidayCover: "" });
  });

  it("names the jobs it left as they are, each with why, and goes on with the others", async () => {
    jobs.set(id(2), job(2, { personInCharge: "eva@firma.cz" }));
    service.update.mockImplementation(async (shipmentId: string) => {
      if (shipmentId === id(3)) throw APIError.failedPrecondition("The tax date (ATA / ATD) can't change once the job is invoiced");
      return {};
    });
    const result = await handOverService.handOver(manager, { shipmentIds: [id(1), id(2), id(3), id(9), "not-an-id"], handledBy: "eva@firma.cz", reason: "Jan is ill" });
    expect(result).toEqual({
      changed: 1,
      skipped: [
        { shipmentId: id(2), jobNumber: "CZFCL00000002", why: "Already so: nothing to change" },
        { shipmentId: id(3), jobNumber: "CZFCL00000003", why: "The tax date (ATA / ATD) can't change once the job is invoiced" },
        { shipmentId: id(9), jobNumber: "", why: "Job not found" },
        { shipmentId: "not-an-id", jobNumber: "", why: "Job not found" },
      ],
    });
  });

  it("does not let a failure that is no refusal stop the rest, and gives it plain words", async () => {
    service.update.mockImplementation(async (shipmentId: string) => {
      if (shipmentId === id(1)) throw new Error("connection reset");
      return {};
    });
    const result = await handOverService.handOver(manager, { shipmentIds: [id(1), id(2), id(3)], handledBy: "eva@firma.cz", reason: "Jan is ill" });
    expect(result).toEqual({ changed: 2, skipped: [{ shipmentId: id(1), jobNumber: "CZFCL00000001", why: "Could not be changed just now: try this job again" }] });
  });

  it("takes a job named twice once", async () => {
    const result = await handOverService.handOver(manager, { shipmentIds: [id(1), id(1)], handledBy: "eva@firma.cz", reason: "Jan is ill" });
    expect(result.changed).toBe(1);
    expect(service.update).toHaveBeenCalledTimes(1);
  });

  it("refuses the whole hand-over to somebody who is no user of the company - the single edit's rule - before any job is touched", async () => {
    await expect(handOverService.handOver(manager, { shipmentIds: [id(1)], handledBy: "nobody@else.cz", reason: "Jan is ill" })).rejects.toMatchObject({
      code: "invalid_argument",
      message: "Handled By: pick a user of the company (by e-mail)",
    });
    await expect(handOverService.handOver(manager, { shipmentIds: [id(1)], holidayCover: "Eva Malá", reason: "Jan is ill" })).rejects.toThrow("Holiday Cover: pick a user of the company (by e-mail)");
    expect(shipments.getByIdForCompany).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
  });

  it("wants jobs (1 to 200), a reason, and a new Handled By or a Holiday Cover", async () => {
    const ok = { handledBy: "eva@firma.cz", reason: "Jan is ill" };
    await expect(handOverService.handOver(manager, { ...ok, shipmentIds: [] })).rejects.toThrow("Choose at least one job to hand over");
    await expect(handOverService.handOver(manager, { ...ok, shipmentIds: Array.from({ length: 201 }, (_, n) => id(n)) })).rejects.toThrow("At most 200 jobs can be handed over at once");
    await expect(handOverService.handOver(manager, { ...ok, shipmentIds: [id(1)], reason: " . " })).rejects.toThrow("Say why the jobs are handed over");
    await expect(handOverService.handOver(manager, { ...ok, shipmentIds: [id(1)], reason: "x".repeat(501) })).rejects.toThrow("too long");
    await expect(handOverService.handOver(manager, { shipmentIds: [id(1)], reason: "Jan is ill" })).rejects.toThrow("Choose a new Handled By, a Holiday Cover, or both");
    // Handled By "" names nobody to hand over to: alone, it asks for nothing.
    await expect(handOverService.handOver(manager, { shipmentIds: [id(1)], handledBy: " ", reason: "Jan is ill" })).rejects.toThrow("Choose a new Handled By, a Holiday Cover, or both");
    expect(service.update).not.toHaveBeenCalled();
  });

  it("bounds the list as it was sent, before anything is done with it: more than 1,000 entries are refused, the same job named over and over too", async () => {
    const tooMany = { code: "invalid_argument", message: "At most 200 jobs can be handed over at once" };
    await expect(handOverService.handOver(manager, { shipmentIds: Array.from({ length: 1001 }, () => id(1)), handledBy: "eva@firma.cz", reason: "Jan is ill" })).rejects.toMatchObject(tooMany);
    expect(auth.usersList).not.toHaveBeenCalled();
    expect(shipments.getByIdForCompany).not.toHaveBeenCalled();
    // Up to 1,000 entries are looked at: one job named 1,000 times is one job …
    await expect(handOverService.handOver(manager, { shipmentIds: Array.from({ length: 1000 }, () => id(1)), handledBy: "eva@firma.cz", reason: "Jan is ill" })).resolves.toEqual({ changed: 1, skipped: [] });
    expect(service.update).toHaveBeenCalledTimes(1);
    // … and 201 different ones are still too many.
    await expect(handOverService.handOver(manager, { shipmentIds: Array.from({ length: 201 }, (_, n) => id(n)), handledBy: "eva@firma.cz", reason: "Jan is ill" })).rejects.toMatchObject(tooMany);
    // What is no list at all asks for no job.
    await expect(handOverService.handOver(manager, { shipmentIds: "all" as never, handledBy: "eva@firma.cz", reason: "Jan is ill" })).rejects.toThrow("Choose at least one job to hand over");
  });

  it("takes 200 jobs in one request", async () => {
    const many = Array.from({ length: 200 }, (_, n) => id(n + 100));
    for (const [n, shipmentId] of many.entries()) jobs.set(shipmentId, job(n + 100));
    const result = await handOverService.handOver(manager, { shipmentIds: many, handledBy: "eva@firma.cz", reason: "Jan left" });
    expect(result).toEqual({ changed: 200, skipped: [] });
    // The users are read once for the whole hand-over.
    expect(auth.usersList).toHaveBeenCalledTimes(1);
  });

  it("is refused, to be tried again, when the company's users can't be read", async () => {
    vi.mocked(auth.usersList).mockRejectedValue(new Error("auth is unreachable"));
    await expect(handOverService.handOver(manager, { shipmentIds: [id(1)], handledBy: "eva@firma.cz", reason: "Jan is ill" })).rejects.toMatchObject({ code: "unavailable" });
    expect(service.update).not.toHaveBeenCalled();
  });
});
