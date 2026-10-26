import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import { jobDuzp, openInvoiceRowIds } from "./openInvoices";

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
