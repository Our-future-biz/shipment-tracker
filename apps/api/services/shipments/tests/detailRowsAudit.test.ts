import { describe, expect, it } from "vitest";
import { detailRowChanges, type DetailRowLists } from "../lib/detailRowsAudit";

const container = { id: "c-1", containerNumber: "MSKU1234567", sealNumber: "", type: "40' HC", teu: "2", packages: "", packageType: "", grossWeight: "", volume: "" };
const invoice = { invoiceNumber: "INV-1", value: "100", currency: "EUR" };
const lists = (over: Partial<DetailRowLists> = {}): DetailRowLists => ({ containers: [container], cargoItems: [], cargoDimensions: [], commercialInvoices: [invoice], ...over });

describe("detailRowChanges", () => {
  it("names each list that came out different, with its lines before and after", () => {
    const renamed = { ...container, containerNumber: "TGHU2205539" };
    expect(detailRowChanges(lists(), lists({ containers: [renamed], commercialInvoices: [] }))).toEqual([
      { field: "containers", oldValue: JSON.stringify([container]), newValue: JSON.stringify([renamed]) },
      { field: "commercialInvoices", oldValue: JSON.stringify([invoice]), newValue: "[]" },
    ]);
  });

  it("names nothing when the lines are the same", () => {
    expect(detailRowChanges(lists(), lists({ containers: [{ ...container }] }))).toEqual([]);
  });
});
