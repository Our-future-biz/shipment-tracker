import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import { ADDED_AFTER_BILLING, NOT_INVOICED_YET, jobDuzp, notInvoicedMark, openInvoiceRowIds } from "./openInvoices";

type Doc = Pick<interfaces.InvoiceDocItem, "number" | "duzp" | "kind" | "status" | "lines">;
const doc = (
  number: string,
  duzp: string,
  kind: "invoice" | "credit_note" = "invoice",
  status: "issued" | "credited" = "issued",
  ids: (string | null)[] = [],
): Doc => ({ number, duzp, kind, status, lines: ids.map((sourceSellingCostId) => ({ sourceSellingCostId }) as never) });

describe("jobDuzp", () => {
  it("is the DUZP of the newest open invoice, in the newest-first order the API lists them", () => {
    const docs = [doc("FV26CZ28003", "2026-03-01"), doc("FV26CZ28002", "2026-02-01", "invoice", "credited"), doc("FV26CZ28001", "2026-01-01")];
    expect(jobDuzp(docs, "2026-04-01")).toBe("2026-03-01");
  });

  it("goes by the invoice number, whatever the order", () => {
    expect(jobDuzp([doc("FV26CZ28001", "2026-01-01"), doc("FV26CZ28003", "2026-03-01")], null)).toBe("2026-03-01");
  });

  it("leaves out credit notes and credited invoices, and falls back to the next invoice's DUZP", () => {
    const docs = [doc("DD26CZ28001", "2026-05-01", "credit_note"), doc("FV26CZ28001", "2026-01-01", "invoice", "credited")];
    expect(jobDuzp(docs, "2026-04-01")).toBe("2026-04-01");
    expect(jobDuzp([], null)).toBeNull();
  });
});

describe("openInvoiceRowIds", () => {
  it("collects the selling rows on issued invoices only", () => {
    const docs = [
      doc("FV1", "2026-01-01", "invoice", "issued", ["a", null]),
      doc("FV2", "2026-01-01", "invoice", "credited", ["b"]),
      doc("DD1", "2026-01-01", "credit_note", "issued", ["c"]),
    ];
    expect([...openInvoiceRowIds(docs)]).toEqual(["a"]);
  });
});

describe("notInvoicedMark", () => {
  type Billed = Pick<interfaces.InvoiceDocItem, "kind" | "status" | "lines" | "createdAt">;
  const issued = (createdAt: string, ids: string[], status: "issued" | "credited" = "issued", kind: "invoice" | "credit_note" = "invoice"): Billed => ({
    kind,
    status,
    createdAt,
    lines: ids.map((sourceSellingCostId) => ({ sourceSellingCostId }) as never),
  });
  const first = issued("2026-11-10T09:00:00.000Z", ["a"]);

  it("marks nothing on a shipment that is not billed, or on a row that is invoiced", () => {
    expect(notInvoicedMark({ id: "b", createdAt: "2026-11-12T09:00:00.000Z" }, [])).toBeNull();
    expect(notInvoicedMark({ id: "b" }, [issued("2026-11-10T09:00:00.000Z", ["b"], "credited"), issued("2026-11-11T09:00:00.000Z", [], "issued", "credit_note")])).toBeNull();
    expect(notInvoicedMark({ id: "a", createdAt: "2026-11-01T09:00:00.000Z" }, [first])).toBeNull();
  });

  it("tells a row added after the first open invoice from one left off it", () => {
    expect(notInvoicedMark({ id: "b", createdAt: "2026-11-12T09:00:00.000Z" }, [first])).toBe(ADDED_AFTER_BILLING);
    expect(notInvoicedMark({ id: "c", createdAt: "2026-11-01T09:00:00.000Z" }, [first])).toBe(NOT_INVOICED_YET);
    // A second invoice doesn't move when the shipment was first billed.
    expect(notInvoicedMark({ id: "d", createdAt: "2026-11-15T09:00:00.000Z" }, [issued("2026-11-20T09:00:00.000Z", ["x"]), first])).toBe(ADDED_AFTER_BILLING);
  });

  it("says only that it is not invoiced when it can't tell when the row came", () => {
    expect(notInvoicedMark({ id: "b" }, [first])).toBe(NOT_INVOICED_YET);
  });
});
