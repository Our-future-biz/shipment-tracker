import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { truckingExpectService } from "../services/truckingExpect.service";
import { gateExceptionService } from "../services/gateException.service";
import { truckingExceptionsService } from "../services/truckingExceptions.service";

// The read-only list of OS&D exceptions Trucking shows with a consignment
// (_internalWarehouseExceptionsForShipments): by shipment, through the exception's position.

vi.mock("../topics", () => ({ warehouseGateStamped: { publish: vi.fn(async () => "msg") } }));
vi.mock("~encore/clients", async () => {
  const { getShipment } = await import("./shipmentFakes");
  return {
    shipments: { shipmentUpdate: vi.fn(async () => ({})), shipmentGet: vi.fn(getShipment) },
    auth: (await import("./authFake")).authFake([]),
  };
});

const user = randomUUID();

// A shipment's position made the way a trip announces it (expect-arrival).
async function positionFor(c: string, shipmentId: string): Promise<string> {
  const r = await truckingExpectService.expectArrival(c, user, {
    shipmentId,
    tripRef: "LCZ2026000001",
    tripKind: "PICKUP_RUN",
    haulierName: "Rapid Trans s.r.o.",
    plate: "1AB2345",
    driver: "Jan Novák",
    driverPhone: "+420 777 111 222",
    expectedAt: "2026-10-15T08:00:00.000Z",
    pieces: 4,
    weightKg: 1250,
    cbm: 3.2,
  });
  return r.gateMovementId;
}

describe("exceptions for shipments", () => {
  it("lists the exceptions of the shipments' positions with their shipment, open and resolved", async () => {
    const c = randomUUID();
    const [s1, s2] = [randomUUID(), randomUUID()];
    const m1 = await positionFor(c, s1);
    const m2 = await positionFor(c, s2);
    await gateExceptionService.create(m1, c, user, { type: "Damaged", pieces: 2, note: "forks through the carton" });
    await gateExceptionService.create(m2, c, user, { type: "Short", pieces: 1, note: "one carton missing" });

    const one = await truckingExceptionsService.forShipments(c, [s1]);
    expect(one).toEqual([expect.objectContaining({ shipmentId: s1, kind: "Damaged", pieces: 2, note: "forks through the carton", status: "open" })]);
    const both = await truckingExceptionsService.forShipments(c, [s1, s2]);
    expect(both.map((e) => e.shipmentId).sort()).toEqual([s1, s2].sort());
  });

  it("gives nothing for unknown ids, other companies' shipments or no ids", async () => {
    const c = randomUUID();
    const s = randomUUID();
    const m = await positionFor(c, s);
    await gateExceptionService.create(m, c, user, { type: "Over", pieces: 1 });
    expect(await truckingExceptionsService.forShipments(randomUUID(), [s])).toEqual([]);
    expect(await truckingExceptionsService.forShipments(c, ["not-a-uuid", randomUUID()])).toEqual([]);
    expect(await truckingExceptionsService.forShipments(c, [])).toEqual([]);
  });

  it("refuses more than 500 shipments at once", async () => {
    const ids = Array.from({ length: 501 }, () => randomUUID());
    await expect(truckingExceptionsService.forShipments(randomUUID(), ids)).rejects.toThrow(/At most 500/);
  });
});
