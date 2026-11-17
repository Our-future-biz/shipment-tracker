import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { warehouseImportService } from "../services/warehouseImport.service";
import { searchGateRecords } from "../services/gateSearch.service";
import { shipmentData } from "./shipmentFakes";

// The main search's Warehouse Concept section against its database: a gate record found by its
// warehouse reference (WCZ…), typed in full, in part or without its letters - and only the company's.

const { shipmentGet } = vi.hoisted(() => ({ shipmentGet: vi.fn() }));
vi.mock("~encore/clients", async () => ({
  shipments: { shipmentUpdate: vi.fn(async () => ({})), shipmentGet },
  auth: (await import("./authFake")).authFake([]),
}));

beforeEach(async () => {
  const { getShipment } = await import("./shipmentFakes");
  shipmentGet.mockReset();
  shipmentGet.mockImplementation(getShipment);
});

describe("the main search in the Warehouse Concept", () => {
  it("finds a gate record by its WCZ reference, also without its letters, and not another company's", async () => {
    const company = randomUUID();
    const s = randomUUID();
    shipmentData.set(s, { tradeDirection: "Import", jobNumber: "CZ00000901", customer: "Odra s.r.o." });
    const [r] = await warehouseImportService.importShipments(company, randomUUID(), [s]);
    const ref = r!.ref!;
    expect(ref).toMatch(/^WCZ\d{10}$/);

    const full = await searchGateRecords(company, ref.toLowerCase(), 5);
    expect(full.items).toEqual([expect.objectContaining({ id: r!.movementId, reference: ref })]);
    expect(full.total).toBe(1);
    expect((await searchGateRecords(company, ref.slice(3), 5)).items.map((i) => i.id)).toEqual([r!.movementId]);
    expect((await searchGateRecords(randomUUID(), ref, 5)).items).toEqual([]);
  });
});
