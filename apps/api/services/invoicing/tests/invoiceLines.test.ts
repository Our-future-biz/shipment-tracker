import { describe, expect, it } from "vitest";
import { invoiceLineProblem, invoiceNumberKey, invoiceRows, invoiceRowsProblem, onMasterJob, ontoEstimates, type InvoiceHouse, type InvoicePostLine } from "../lib/invoiceLines";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "aaaaaaaa-0000-4000-8000-000000000002";
const line = (over: Partial<InvoicePostLine> = {}): InvoicePostLine => ({ category: "ocean_freight", amount: "100.00", currency: "USD", shipmentId: A, ...over });

// Rows of the debit note AS260707595: two of its B/Ls, one with two CFS charges.
const debitNote: InvoicePostLine[] = [
  line({ item: "OCEAN FREIGHT(D)", amount: "109.00", shipmentId: A }),
  line({ item: "OCEAN FREIGHT(D)", amount: "1177.20", shipmentId: B }),
  line({ item: "CFS CHARGES", category: "cfs_destination", amount: "18.00", shipmentId: B }),
  line({ item: "CFS CHARGES", category: "cfs_destination", amount: "151.20", shipmentId: B }),
];

describe("the rows an invoice comes to", () => {
  it("puts each line on the shipment its B/L names, one row per charge", () => {
    expect(invoiceRows(debitNote)).toEqual([
      { shipmentId: A, category: "ocean_freight", amount: "109.00", currency: "USD", description: "OCEAN FREIGHT(D)" },
      { shipmentId: B, category: "ocean_freight", amount: "1177.20", currency: "USD", description: "OCEAN FREIGHT(D)" },
      { shipmentId: B, category: "cfs_destination", amount: "169.20", currency: "USD", description: "CFS CHARGES" },
    ]);
  });

  it("adds up to the lines' total, to the cent", () => {
    const total = invoiceRows(debitNote).reduce((n, r) => n + Math.round(Number(r.amount) * 100), 0);
    expect(total).toBe(145540);
  });

  it("shares a line with no shipment out by its weights, to the cent", () => {
    const rows = invoiceRows([line({ shipmentId: undefined, amount: "100.00", split: [{ shipmentId: A, weight: 2 }, { shipmentId: B, weight: 1 }] })]);
    expect(rows.map((r) => [r.shipmentId, r.amount])).toEqual([[A, "66.67"], [B, "33.33"]]);
  });

  it("adds a shared part to what the shipment already gets under the charge", () => {
    const rows = invoiceRows([line({ amount: "50.00" }), line({ shipmentId: undefined, amount: "10.00", split: [{ shipmentId: A, weight: 1 }, { shipmentId: B, weight: 1 }] })]);
    expect(rows.map((r) => [r.shipmentId, r.amount])).toEqual([[A, "55.00"], [B, "5.00"]]);
  });

  it("gives a shipment of weight 0 nothing", () => {
    const rows = invoiceRows([line({ shipmentId: undefined, split: [{ shipmentId: A, weight: 1 }, { shipmentId: B, weight: 0 }] })]);
    expect(rows.map((r) => r.shipmentId)).toEqual([A]);
  });

  it("keeps two currencies of one charge apart", () => {
    expect(invoiceRows([line(), line({ currency: "eur" })]).map((r) => r.currency)).toEqual(["USD", "EUR"]);
  });

  it("takes a credit off, and leaves out a charge it cancels", () => {
    expect(invoiceRows([line({ amount: "100.00" }), line({ amount: "-30.00" })])[0]!.amount).toBe("70.00");
    expect(invoiceRows([line({ amount: "100.00" }), line({ amount: "-100.00" })])).toEqual([]);
  });

  it("names each charge once in the description", () => {
    const rows = invoiceRows([line({ item: "CFS" }), line({ item: "CFS" }), line({ item: "HANDLING" })]);
    expect(rows[0]!.description).toBe("CFS, HANDLING");
  });
});

describe("a line that can't be posted", () => {
  it("has no amount, a 0 or no number", () => {
    for (const amount of ["", "0", "abc"]) expect(invoiceLineProblem(line({ amount, item: "POD COST" }))).toContain("POD COST");
  });

  it("has no currency or charge", () => {
    expect(invoiceLineProblem(line({ currency: " " }))).toContain("currency");
    expect(invoiceLineProblem(line({ category: "" }))).toContain("charge");
  });

  it("has nobody to go to", () => {
    expect(invoiceLineProblem(line({ shipmentId: undefined }))).toContain("no shipment");
    expect(invoiceLineProblem(line({ shipmentId: undefined, split: [{ shipmentId: A, weight: 0 }] }))).toContain("no shipment");
  });

  it("is fine with a shipment, a credit, or a share", () => {
    expect(invoiceLineProblem(line())).toBeNull();
    expect(invoiceLineProblem(line({ amount: "-5.00" }))).toBeNull();
    expect(invoiceLineProblem(line({ shipmentId: undefined, split: [{ shipmentId: A, weight: 1 }] }))).toBeNull();
  });
});

describe("a credit note's rows", () => {
  it("are minus and say they are a credit note", () => {
    expect(invoiceRows([line({ item: "OCEAN FREIGHT", amount: "-100.00", shipmentId: A })], { creditNote: true })).toEqual([
      { shipmentId: A, category: "ocean_freight", amount: "-100.00", currency: "USD", description: "Credit note: OCEAN FREIGHT" },
    ]);
    expect(invoiceRows([line({ item: "", amount: "-100.00", shipmentId: A })], { creditNote: true })[0]!.description).toBe("Credit note");
    expect(invoiceRows([line({ item: "Credit note - overcharge", amount: "-100.00", shipmentId: A })], { creditNote: true })[0]!.description).toBe("Credit note - overcharge");
  });

  it("share a split to the cent", () => {
    const rows = invoiceRows([line({ amount: "-100.00", shipmentId: undefined, split: [{ shipmentId: A, weight: 1 }, { shipmentId: B, weight: 2 }] })], { creditNote: true });
    expect(rows.map((r) => r.amount)).toEqual(["-33.33", "-66.67"]);
  });

  it("must be a deduction, every one of them", () => {
    const credit = (lines: InvoicePostLine[]) => invoiceRowsProblem(invoiceRows(lines, { creditNote: true }), { creditNote: true });
    // A charge printed among the credits, under the same charge of the same shipment, stays within its deduction.
    expect(credit([line({ amount: "-100.00" }), line({ amount: "10.00" })])).toBeNull();
    // Anywhere else it would add buying, whatever the credit note comes to in all.
    expect(credit([line({ amount: "-100.00" }), line({ amount: "10.00", category: "cfs_destination" })])).toMatch(/deducts/);
    expect(credit([line({ amount: "-100.00" }), line({ amount: "10.00", shipmentId: B })])).toMatch(/deducts/);
    expect(credit([line({ amount: "-100.00" }), line({ amount: "5.00", currency: "EUR" })])).toMatch(/deducts/);
    expect(credit([line({ amount: "100.00" })])).toMatch(/deducts/);
    // An invoice may add and take off as it likes.
    expect(invoiceRowsProblem(invoiceRows([line({ amount: "-100.00" }), line({ amount: "10.00", shipmentId: B })]))).toBeNull();
  });
});

describe("rows that can't be posted", () => {
  it("are none at all: lines that cancel out", () => {
    expect(invoiceRowsProblem(invoiceRows([line({ amount: "100.00" }), line({ amount: "-100.00" })]))).toMatch(/nothing/);
  });

  it("hold more than an amount can", () => {
    const big = Array.from({ length: 2 }, () => line({ amount: "999999999999.99" }));
    expect(invoiceRowsProblem(invoiceRows(big))).toMatch(/more than an amount can hold/);
    expect(invoiceRowsProblem(invoiceRows([line({ amount: "999999999999.99" })]))).toBeNull();
  });
});

describe("an invoice number as compared for a repeat", () => {
  it("is the same without spaces or case", () => {
    expect(invoiceNumberKey(" as 2607 07595 ")).toBe("AS260707595");
    expect(invoiceNumberKey("AS260707595")).toBe("AS260707595");
  });
});

describe("a master job's invoice", () => {
  const C = "aaaaaaaa-0000-4000-8000-000000000003";
  const OTHER = "aaaaaaaa-0000-4000-8000-000000000009";
  const houses: InvoiceHouse[] = [
    { shipmentId: A, jobNumber: "CZ00000001", houseBolNumber: "GLSL26060771", cancelled: false, freightTon: 3 },
    { shipmentId: B, jobNumber: "CZ00000002", houseBolNumber: "glsl-2606 0963, GLGL26050536", cancelled: false, freightTon: 1 },
    { shipmentId: C, jobNumber: "CZ00000003", houseBolNumber: "GLSL26069999", cancelled: true, freightTon: 5 },
  ];
  const placed = (lines: InvoicePostLine[], method?: "wm" | "shipment") => onMasterJob(lines, houses, method);

  it("goes to a shipment by its House B/L, however it is written there", () => {
    expect(placed([line({ shipmentId: A, bl: "GLSL26060771" }), line({ shipmentId: B, bl: "GLSL26060963" })])).toEqual({
      lines: [expect.objectContaining({ shipmentId: A }), expect.objectContaining({ shipmentId: B })],
    });
    expect(placed([line({ shipmentId: B, bl: "GLGL26050536" })])).not.toHaveProperty("problem");
  });

  it("refuses a line placed by a B/L that is not that shipment's House B/L", () => {
    expect(placed([line({ shipmentId: A, bl: "GLSL26060963" })])).toEqual({ problem: expect.stringContaining("not the House B/L of CZ00000001") });
    expect(placed([line({ shipmentId: A, bl: "" })])).toEqual({ problem: expect.stringContaining("names no B/L of CZ00000001") });
  });

  it("lets a person send a line to any shipment of the master job, and to none outside it", () => {
    expect(placed([line({ shipmentId: B, bl: "GLSL26060771", chosen: true })])).not.toHaveProperty("problem");
    expect(placed([line({ shipmentId: OTHER, chosen: true })])).toEqual({ problem: expect.stringContaining("not on this master job") });
  });

  it("posts nothing to a cancelled shipment, by its B/L, by hand or in a split", () => {
    expect(placed([line({ shipmentId: C, bl: "GLSL26069999" })])).toEqual({ problem: expect.stringContaining("CZ00000003 is cancelled") });
    expect(placed([line({ shipmentId: C, chosen: true })])).toEqual({ problem: expect.stringContaining("cancelled") });
    expect(placed([line({ shipmentId: undefined, split: [{ shipmentId: A, weight: 1 }, { shipmentId: C, weight: 1 }] })], "wm")).toEqual({ problem: expect.stringContaining("cancelled") });
  });

  it("weighs a shared line by the master job's own W/M, not the browser's", () => {
    const out = placed([line({ shipmentId: undefined, split: [{ shipmentId: A, weight: 1 }, { shipmentId: B, weight: 1 }] })], "wm");
    expect(out).toEqual({ lines: [expect.objectContaining({ split: [{ shipmentId: A, weight: 3 }, { shipmentId: B, weight: 1 }] })] });
    expect(invoiceRows((out as { lines: InvoicePostLine[] }).lines).map((r) => r.amount)).toEqual(["75.00", "25.00"]);
    const equal = placed([line({ shipmentId: undefined, split: [{ shipmentId: A, weight: 9 }, { shipmentId: B, weight: 0 }] })], "shipment");
    expect(equal).toEqual({ lines: [expect.objectContaining({ split: [{ shipmentId: A, weight: 1 }, { shipmentId: B, weight: 1 }] })] });
  });

  it("asks how to split, and over shipments of the master job only, each once", () => {
    const shared = (split: { shipmentId: string; weight: number }[]) => line({ shipmentId: undefined, split });
    expect(placed([shared([{ shipmentId: A, weight: 1 }])])).toEqual({ problem: expect.stringContaining("how to split") });
    expect(placed([shared([{ shipmentId: OTHER, weight: 1 }])], "wm")).toEqual({ problem: expect.stringContaining("not on this master job") });
    expect(placed([shared([{ shipmentId: A, weight: 1 }, { shipmentId: A, weight: 1 }])], "wm")).toEqual({ problem: expect.stringContaining("twice") });
    const noWm = onMasterJob([shared([{ shipmentId: A, weight: 1 }])], [{ ...houses[0]!, freightTon: 0 }], "wm");
    expect(noWm).toEqual({ problem: expect.stringContaining("W/M") });
  });
});

describe("the estimates an invoice's real cost goes onto", () => {
  const open = [
    { id: "e1", shipmentId: A, category: "ocean_freight" },
    { id: "e2", shipmentId: A, category: "ocean_freight" },
    { id: "e3", shipmentId: B, category: "cfs_destination" },
  ];

  it("are the open estimates of the same shipment and charge, each taken once, in their order", () => {
    const rows = [
      { shipmentId: A, category: "ocean_freight" },
      { shipmentId: B, category: "ocean_freight" },
      { shipmentId: A, category: "ocean_freight" },
      { shipmentId: A, category: "ocean_freight" },
      { shipmentId: B, category: "cfs_destination" },
    ];
    expect(ontoEstimates(rows, open)).toEqual(["e1", null, "e2", null, "e3"]);
  });

  it("are none without an open estimate: a new row is added", () => {
    expect(ontoEstimates([{ shipmentId: A, category: "customs" }], open)).toEqual([null]);
    expect(ontoEstimates([{ shipmentId: A, category: "ocean_freight" }], [])).toEqual([null]);
  });
});
