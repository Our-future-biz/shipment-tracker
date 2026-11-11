import { beforeEach, describe, expect, it, vi } from "vitest";

// "Copy estimated costs" of the New Shipment wizard, run against an in-memory stand-in for the
// cost lines: one row per estimate, all at once, and never a second time onto the same shipment.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../../../lib/shipmentRefs", () => ({ assertShipmentExists: vi.fn(async () => ({ jobNumber: "CZ00000001" })) }));
const billing = vi.hoisted(() => ({ billed: new Set<string>() }));
vi.mock("../../repositories/invoice.repository", () => ({ invoiceRepository: { countOpenInvoices: vi.fn(async (shipmentId: string) => (billing.billed.has(shipmentId) ? 1 : 0)) } }));
// A supplier deleted since the source was priced: its link is dropped, its name stays.
const GONE_SUPPLIER = "0b7c2a9e-6d4f-4e1a-8c3b-2f5d6e7a8b9c";
vi.mock("../../services/invoicing.service", () => ({
  withLiveSuppliers: async <T extends { supplierCustomerId: string | null }>(rows: T[]) =>
    rows.map((r) => (r.supplierCustomerId === GONE_SUPPLIER ? { ...r, supplierCustomerId: null } : r)),
}));
const store = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
vi.mock("../../repositories/invoiceCost.repository", () => ({
  invoiceCostRepository: {
    async listByShipmentId(shipmentId: string, companyId: string) {
      return store.rows.filter((r) => r.shipmentId === shipmentId && r.companyId === companyId);
    },
    async addCopiedEstimates(companyId: string, shipmentId: string, rows: Record<string, unknown>[]) {
      if (store.rows.some((r) => r.shipmentId === shipmentId && r.companyId === companyId)) return false;
      store.rows.push(...rows.map((r) => ({ ...r, companyId, shipmentId })));
      return true;
    },
  },
}));

import { ALREADY_HAS_COSTS, copyEstimates } from "../../services/estimateCopy.service";

const COMPANY = "c0000000-0000-4000-8000-000000000001";
const SOURCE = "a0000000-0000-4000-8000-000000000001";
const TARGET = "b0000000-0000-4000-8000-000000000002";

const sourceRow = (over: Record<string, unknown>) => ({
  companyId: COMPANY,
  shipmentId: SOURCE,
  category: "thc_destination",
  description: "",
  vendor: "",
  supplierCustomerId: null,
  estQty: "1.00",
  estAmount: "100.00",
  estCurrency: "CZK",
  realAmount: null,
  unit: "",
  sourceTruckingRef: null,
  sourceMasterJobRef: null,
  ...over,
});
const copiedOnto = (shipmentId: string) => store.rows.filter((r) => r.shipmentId === shipmentId);

beforeEach(() => {
  store.rows.length = 0;
  billing.billed.clear();
});

describe("copyEstimates", () => {
  it("copies every estimate as a row of its own, with its quantity, and nothing of the real cost", async () => {
    store.rows.push(
      sourceRow({ description: "THC 1", estAmount: "1200.00", estQty: "2.00", estCurrency: "USD", realAmount: "2400.00" }),
      sourceRow({ description: "THC 2", estAmount: "1200.00", estQty: "2.00", estCurrency: "USD" }),
      sourceRow({ category: "", description: "Extra", estAmount: "50.00" }),
    );
    expect(await copyEstimates(COMPANY, SOURCE, TARGET)).toBe(3);
    expect(copiedOnto(TARGET).map((r) => [r.category, r.description, r.estQty, r.estAmount, r.estCurrency, r.sortOrder])).toEqual([
      ["thc_destination", "THC 1", "2.00", "1200.00", "USD", 0],
      ["thc_destination", "THC 2", "2.00", "1200.00", "USD", 1],
      ["", "Extra", "1.00", "50.00", "CZK", 2],
    ]);
    expect(copiedOnto(TARGET).some((r) => "realAmount" in r)).toBe(false);
  });

  it("is refused a second time instead of doubling every row", async () => {
    store.rows.push(sourceRow({ description: "THC" }));
    await copyEstimates(COMPANY, SOURCE, TARGET);
    await expect(copyEstimates(COMPANY, SOURCE, TARGET)).rejects.toMatchObject({ code: "failed_precondition", message: ALREADY_HAS_COSTS });
    expect(copiedOnto(TARGET)).toHaveLength(1);
  });

  it("drops a link to a supplier that is gone and keeps its name", async () => {
    store.rows.push(sourceRow({ vendor: "Old Haulier s.r.o.", supplierCustomerId: GONE_SUPPLIER }));
    await copyEstimates(COMPANY, SOURCE, TARGET);
    expect(copiedOnto(TARGET)[0]).toMatchObject({ vendor: "Old Haulier s.r.o.", supplierCustomerId: null });
  });

  it("copies nothing onto a billed shipment, nor a shipment onto itself", async () => {
    store.rows.push(sourceRow({}));
    billing.billed.add(TARGET);
    await expect(copyEstimates(COMPANY, SOURCE, TARGET)).rejects.toMatchObject({ code: "failed_precondition" });
    await expect(copyEstimates(COMPANY, SOURCE, SOURCE)).rejects.toMatchObject({ code: "invalid_argument" });
    expect(copiedOnto(TARGET)).toHaveLength(0);
  });

  it("reads only the caller's company's rows", async () => {
    store.rows.push(sourceRow({ companyId: "d0000000-0000-4000-8000-000000000009" }));
    expect(await copyEstimates(COMPANY, SOURCE, TARGET)).toBe(0);
  });
});
