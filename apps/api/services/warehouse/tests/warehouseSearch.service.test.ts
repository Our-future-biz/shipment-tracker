import { beforeEach, describe, expect, it, vi } from "vitest";

// The main search in the warehouse, run against stand-ins for its repository and the shipments service.
const tasks = vi.hoisted(() => ({ searchMain: vi.fn() }));
const basics = vi.hoisted(() => vi.fn());
vi.mock("../repositories/warehouseTask.repository", () => ({ warehouseTaskRepository: tasks }));
vi.mock("~encore/clients", () => ({ shipments: { _internalShipmentBasics: basics } }));

import { searchWarehouseMain, warehousePageOf, warehouseRefDigits } from "../services/warehouseSearch.service";

const COMPANY = "c1";
const job = (id: string, jobNumber: string, received: string | null = null, released: string | null = null) => ({
  id,
  jobNumber,
  customer: "Alfa s.r.o.",
  warehouseReceivedDate: received,
  warehouseReleasedDate: released,
});

beforeEach(() => vi.clearAllMocks());

describe("a warehouse reference typed in the main search", () => {
  it("is found by its number whatever letters it is typed with, or none", () => {
    expect(warehouseRefDigits("WHCZ2026001")).toBe("2026001");
    expect(warehouseRefDigits("WCZ2026001")).toBe("2026001");
    expect(warehouseRefDigits("2026001")).toBe("2026001");
    expect(warehouseRefDigits("MSCU1234567")).toBeNull();
    expect(warehouseRefDigits("WHCZ")).toBeNull();
  });

  it("opens the record on the Warehouse page its shipment is on", () => {
    expect(warehousePageOf(job("s", "CZ1"))).toBe("in");
    expect(warehousePageOf(job("s", "CZ1", "2026-11-10"))).toBe("stock");
    expect(warehousePageOf(job("s", "CZ1", "2026-11-10", "2026-11-12"))).toBe("out");
  });
});

describe("the main search in the warehouse", () => {
  it("asks for the reference typed, in capitals and without its spaces, and lists each record with its job", async () => {
    tasks.searchMain.mockResolvedValue({
      rows: [
        { id: "t1", taskId: "WHCZ2026001", shipmentId: "s1" },
        { id: "t2", taskId: "WHCZ2026011", shipmentId: "s2" },
      ],
      total: 2,
    });
    basics.mockResolvedValue({ shipments: [job("s2", "CZLCL00000002", "2026-11-10"), job("s1", "CZFCL00000001")] });
    await expect(searchWarehouseMain(COMPANY, "whcz 2026001", 5)).resolves.toEqual({
      items: [
        { id: "t1", reference: "WHCZ2026001", shipmentId: "s1", jobNumber: "CZFCL00000001", customer: "Alfa s.r.o.", page: "in" },
        { id: "t2", reference: "WHCZ2026011", shipmentId: "s2", jobNumber: "CZLCL00000002", customer: "Alfa s.r.o.", page: "stock" },
      ],
      total: 2,
    });
    expect(tasks.searchMain).toHaveBeenCalledWith(COMPANY, "WHCZ2026001", "2026001", 5);
    expect(basics).toHaveBeenCalledWith({ ids: ["s1", "s2"] });
  });

  it("leaves out a record whose job is gone", async () => {
    tasks.searchMain.mockResolvedValue({ rows: [{ id: "t1", taskId: "WHCZ2026001", shipmentId: "s1" }], total: 1 });
    basics.mockResolvedValue({ shipments: [] });
    await expect(searchWarehouseMain(COMPANY, "2026001", 5)).resolves.toMatchObject({ items: [] });
  });

  it("asks nothing for text that can't be a reference, nor the shipments service when nothing is found", async () => {
    await expect(searchWarehouseMain(COMPANY, "gmbh hamburg", 5)).resolves.toEqual({ items: [], total: 0 });
    expect(tasks.searchMain).not.toHaveBeenCalled();
    tasks.searchMain.mockResolvedValue({ rows: [], total: 0 });
    await expect(searchWarehouseMain(COMPANY, "WHCZ2099", 5)).resolves.toEqual({ items: [], total: 0 });
    expect(basics).not.toHaveBeenCalled();
  });
});
