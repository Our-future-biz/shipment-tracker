import { describe, expect, it } from "vitest";
import type { ColumnsType } from "antd/es/table";
import type { interfaces } from "@/lib/api/client";
import { matchesGridFilters } from "@/components/gridFilters";
import { queueColumns } from "../_components/queueColumns";
import {
  QUEUE_COLUMN_META,
  QUEUE_DEFAULT_COLUMNS,
  arrangeQueueColumns,
  filterQueueRows,
  normalizeQueueColumns,
  queueCellText,
  type QueueRow,
} from "./queueColumnModel";

const row = (partial: Partial<interfaces.BillingQueueItem> = {}): QueueRow => ({
  shipmentId: "s1",
  jobNumber: "J-001",
  customer: "Acme",
  shipper: "",
  consignee: "",
  customerId: null,
  department: "",
  houseBolType: "",
  masterBolType: "",
  tradeDirection: "Import",
  estimatedDeparture: null,
  estimatedArrival: null,
  duzp: "2026-01-01",
  shipmentStatus: "Billing [IMP]",
  invoicingStatus: "Not Invoiced",
  billingState: "to_bill",
  billingCurrency: "CZK",
  amountToBill: 0,
  rowsToBill: 0,
  missingCurrencies: [],
  invoiceNumbers: [],
  invoiced: [],
  ...partial,
});

const NO_FILTERS = { columnFilters: [], flagMissingLines: false };

describe("normalizeQueueColumns", () => {
  it("keeps known keys once, in order, Internal Reference first, without the actions column", () => {
    // "status" (Shipment Status) and "selling" are no longer columns: a stored layout that has them drops them
    expect(normalizeQueueColumns(["customer", "nope", "jobNumber", "customer", "__open", "status", "selling", "invoices"])).toEqual([
      "jobNumber",
      "customer",
      "invoices",
    ]);
  });

  it("always shows Internal Reference, whatever is stored", () => {
    expect(normalizeQueueColumns([])).toEqual(["jobNumber"]);
    expect(normalizeQueueColumns(null)).toEqual(["jobNumber"]);
    expect(normalizeQueueColumns([1, {}])).toEqual(["jobNumber"]);
  });

  it("defaults to the 7 columns in table order", () => {
    expect(QUEUE_DEFAULT_COLUMNS).toEqual([
      "jobNumber",
      "customer",
      "tradeDirection",
      "serviceDate",
      "duzp",
      "invoices",
      "invoicingStatus",
    ]);
  });
});

describe("arrangeQueueColumns", () => {
  const cols = ["jobNumber", "customer", "status", "__open", "selling"].map((key) => ({ key })) as ColumnsType<QueueRow>;
  const keys = (c: ColumnsType<QueueRow>) => c.map((x) => String(x.key));
  const headerOf = (c: ColumnsType<QueueRow>, key: string) => {
    const col = c.find((x) => x.key === key)!;
    // antd types the argument as rc-table's column; the column itself is what it gets at run time
    return col.onHeaderCell?.(col as never);
  };

  it("follows the visible order, drops hidden columns and keeps the actions column last", () => {
    expect(keys(arrangeQueueColumns(cols, ["jobNumber", "selling", "customer"], false))).toEqual([
      "jobNumber",
      "selling",
      "customer",
      "__open",
    ]);
    expect(keys(arrangeQueueColumns(cols, ["jobNumber", "__open", "nope", "status"], false))).toEqual([
      "jobNumber",
      "status",
      "__open",
    ]);
  });

  it("adds no header ids unless reordering", () => {
    expect(arrangeQueueColumns(cols, ["jobNumber", "customer"], false).every((c) => !c.onHeaderCell)).toBe(true);
  });

  it("while reordering every header but Internal Reference and the actions column carries its key", () => {
    const shown = arrangeQueueColumns(cols, ["jobNumber", "customer", "status"], true);
    expect(headerOf(shown, "customer")).toEqual({ id: "customer" });
    expect(headerOf(shown, "status")).toEqual({ id: "status" });
    expect(headerOf(shown, "jobNumber")).toBeUndefined();
    expect(headerOf(shown, "__open")).toBeUndefined();
  });

  it("merges a header's own attributes", () => {
    const own = [{ key: "jobNumber" }, { key: "customer", onHeaderCell: () => ({ className: "x" }) }] as ColumnsType<QueueRow>;
    expect(headerOf(arrangeQueueColumns(own, ["jobNumber", "customer"], true), "customer")).toEqual({ className: "x", id: "customer" });
  });
});

describe("queueColumns and the column list", () => {
  it("has the listed columns in order, with the actions column last", () => {
    const keys = queueColumns({ info: new Map(), jobHref: () => "", onDocs: () => {}, onChat: () => {}, unreadBy: new Map() }).map((c) => String(c.key));
    expect(keys.filter((k) => k !== "__open")).toEqual(QUEUE_COLUMN_META.map((c) => c.key));
    expect(keys[keys.length - 1]).toBe("__open");
  });
});

describe("queueCellText", () => {
  it("shows ETD for exports and ETA otherwise, as DD.MM.YYYY", () => {
    const dates = { estimatedDeparture: "2026-03-05", estimatedArrival: "2026-04-10" };
    expect(queueCellText(row({ ...dates, tradeDirection: "Export" }), "serviceDate", false)).toBe("05.03.2026");
    expect(queueCellText(row({ ...dates, tradeDirection: "Import" }), "serviceDate", false)).toBe("10.04.2026");
    expect(queueCellText(row({ tradeDirection: "Export" }), "serviceDate", false)).toBe("");
  });

  it("shows the shipment status without its direction suffix", () => {
    expect(queueCellText(row({ shipmentStatus: "Billing [IMP]" }), "status", false)).toBe("Billing");
  });

  it("writes the amount to bill with plain spaces, so a typed amount matches", () => {
    const r = row({ amountToBill: 12500, rowsToBill: 2 });
    expect(queueCellText(r, "selling", false)).not.toMatch(/[  ]/);
    expect(matchesGridFilters(r, [{ key: "selling", value: "12 500" }], (x, k) => queueCellText(x, k, false))).toBe(true);
    expect(queueCellText(row({ amountToBill: 0, rowsToBill: 0 }), "selling", false)).toBe("");
  });

  it("says No selling lines only where missing lines are flagged", () => {
    expect(queueCellText(row({ billingState: "none" }), "selling", true)).toBe("No selling lines");
    expect(queueCellText(row({ billingState: "none" }), "selling", false)).toBe("");
  });

  it("lists invoice numbers, else the lines to bill", () => {
    expect(queueCellText(row({ invoiceNumbers: ["FV1", "FV2"], rowsToBill: 3 }), "invoices", false)).toBe("FV1, FV2");
    expect(queueCellText(row({ rowsToBill: 1 }), "invoices", false)).toBe("1 line");
    expect(queueCellText(row({ rowsToBill: 2 }), "invoices", false)).toBe("2 lines");
    expect(queueCellText(row(), "invoices", false)).toBe("");
  });

  it("reads an empty invoicing status as Not Invoiced", () => {
    expect(queueCellText(row({ invoicingStatus: "" }), "invoicingStatus", false)).toBe("Not Invoiced");
  });
});

describe("filterQueueRows", () => {
  const rows = [
    row({ shipmentId: "a", customer: "Acme", tradeDirection: "Import", invoicingStatus: "Invoiced", estimatedArrival: "2026-02-01" }),
    row({ shipmentId: "b", customer: "Acme", tradeDirection: "Export", invoicingStatus: "Not Invoiced", estimatedDeparture: "2026-01-01" }),
    row({ shipmentId: "c", customer: "", tradeDirection: "Import", invoicingStatus: "", estimatedArrival: null }),
    row({ shipmentId: "d", customer: "Beta Praha", tradeDirection: "Import", invoicingStatus: "Invoiced", estimatedArrival: "2026-01-15" }),
  ];
  const ids = (list: QueueRow[]) => list.map((r) => r.shipmentId);

  it("keeps rows that pass the selects and the column filters together", () => {
    const kept = filterQueueRows(rows, { ...NO_FILTERS, columnFilters: [{ key: "customer", value: "acme" }, { key: "tradeDirection", value: "Import" }] });
    expect(ids(kept)).toEqual(["a"]);
  });

  it("matches Invoicing Status exactly", () => {
    const kept = filterQueueRows(rows, { ...NO_FILTERS, columnFilters: [{ key: "invoicingStatus", value: "Invoiced" }] });
    expect(ids(kept)).toEqual(["d", "a"]);
  });

  it("needs every filter on the same column to match", () => {
    const kept = filterQueueRows(rows, {
      ...NO_FILTERS,
      columnFilters: [
        { key: "customer", value: "beta" },
        { key: "customer", value: "praha" },
      ],
    });
    expect(ids(kept)).toEqual(["d"]);
    const none = filterQueueRows(rows, {
      ...NO_FILTERS,
      columnFilters: [
        { key: "customer", value: "beta" },
        { key: "customer", value: "acme" },
      ],
    });
    expect(none).toEqual([]);
  });

  it("returns every row with no filters, by service date, missing dates last", () => {
    expect(ids(filterQueueRows(rows, NO_FILTERS))).toEqual(["b", "d", "a", "c"]);
  });
});
