import { describe, expect, it } from "vitest";
import { anyToSplit, blKey, invoicePostLines, lineAmount, lineFlagged, linesTotals, lineTarget, matchLine, matchNote, namesBls, SPLIT_TARGET, type BlShipment, type InvoiceLineDraft, creditAmount, creditLines, creditLinesAbove0, invoiceLinesInvalid } from "./invoiceLines";

const shipments: BlShipment[] = [
  { shipmentId: "s1", jobNumber: "CZ00000001", houseBol: "GLSL26060771" },
  { shipmentId: "s2", jobNumber: "CZ00000002", houseBol: "glsl-2606 0963" },
  { shipmentId: "s3", jobNumber: "CZ00000003", houseBol: "GLGL26060288, GLGL26050536" },
  { shipmentId: "s4", jobNumber: "CZ00000004", houseBol: "" },
];
const rows = shipments.map((s) => ({ shipmentId: s.shipmentId, jobNumber: s.jobNumber, freightTon: s.shipmentId === "s4" ? 0 : 2 }));
const ticked = new Set(["s1", "s2"]);
const line = (over: Partial<InvoiceLineDraft> = {}): InvoiceLineDraft => ({ bl: "GLSL26060771", item: "POD COST", amount: "399.60", currency: "", category: "other", ...over });

describe("a B/L", () => {
  it("is compared without case, spaces or punctuation", () => {
    expect(blKey(" glsl-2606 0963 ")).toBe("GLSL26060963");
    expect(blKey(null)).toBe("");
  });
});

describe("whether an invoice is sorted by B/L", () => {
  it("is when any line names one, not otherwise", () => {
    expect(namesBls([line({ bl: "" }), line()])).toBe(true);
    expect(namesBls([line({ bl: " " })])).toBe(false);
    expect(namesBls([])).toBe(false);
  });
});

describe("where a line's B/L says it belongs", () => {
  it("is the shipment whose House B/L it is", () => {
    expect(matchLine(line(), shipments)).toEqual({ kind: "bl", shipmentId: "s1" });
  });

  it("finds it however it was written on the shipment", () => {
    expect(matchLine(line({ bl: "GLSL26060963" }), shipments)).toEqual({ kind: "bl", shipmentId: "s2" });
  });

  it("finds one of several numbers on a shipment", () => {
    expect(matchLine(line({ bl: "GLGL26050536" }), shipments)).toEqual({ kind: "bl", shipmentId: "s3" });
  });

  it("is nobody for a B/L no shipment of the master job has", () => {
    expect(matchLine(line({ bl: "OTHER123" }), shipments)).toEqual({ kind: "not-found" });
  });

  it("is everybody for the master job's own B/L", () => {
    expect(matchLine(line({ bl: "MEDUYE177983" }), shipments, ["MEDUYE177983"])).toEqual({ kind: "master" });
  });

  it("prefers a House B/L to the master's", () => {
    expect(matchLine(line(), shipments, ["GLSL26060771"])).toEqual({ kind: "bl", shipmentId: "s1" });
  });

  it("is said to be unclear when two shipments have it", () => {
    const two = [...shipments, { shipmentId: "s5", jobNumber: "CZ00000005", houseBol: "GLSL26060771" }];
    expect(matchLine(line(), two)).toEqual({ kind: "ambiguous", jobNumbers: ["CZ00000001", "CZ00000005"] });
  });

  it("is nothing for a line with no B/L", () => {
    expect(matchLine(line({ bl: "" }), shipments)).toEqual({ kind: "no-bl" });
  });

  it("is never a cancelled shipment: it is said, and the line asks to be looked at", () => {
    const withCancelled = [...shipments, { shipmentId: "s9", jobNumber: "CZ00000009", houseBol: "GLSL26069999", cancelled: true }];
    const match = matchLine(line({ bl: "GLSL26069999" }), withCancelled);
    expect(match).toEqual({ kind: "cancelled", jobNumber: "CZ00000009" });
    expect(lineTarget(line(), match)).toBe(SPLIT_TARGET);
    expect(lineFlagged(line(), match)).toBe(true);
    expect(matchNote(match)).toContain("CZ00000009");
    // A live shipment with the same House B/L takes it.
    const copy = [...withCancelled, { shipmentId: "s10", jobNumber: "CZ00000010", houseBol: "GLSL26069999" }];
    expect(matchLine(line({ bl: "GLSL26069999" }), copy)).toEqual({ kind: "bl", shipmentId: "s10" });
  });
});

describe("where a line goes", () => {
  it("follows its B/L, and otherwise the split", () => {
    expect(lineTarget(line(), { kind: "bl", shipmentId: "s1" })).toBe("s1");
    expect(lineTarget(line(), { kind: "not-found" })).toBe(SPLIT_TARGET);
    expect(lineTarget(line(), { kind: "master" })).toBe(SPLIT_TARGET);
    expect(lineTarget(line(), { kind: "no-bl" })).toBe(SPLIT_TARGET);
  });

  it("follows a person's choice over its B/L", () => {
    expect(lineTarget(line({ target: "s2" }), { kind: "not-found" })).toBe("s2");
    expect(lineTarget(line({ target: SPLIT_TARGET }), { kind: "bl", shipmentId: "s1" })).toBe(SPLIT_TARGET);
  });
});

describe("a line that asks to be looked at", () => {
  it("is one whose shipment couldn't be identified", () => {
    expect(lineFlagged(line(), { kind: "not-found" })).toBe(true);
    expect(lineFlagged(line(), { kind: "no-bl" })).toBe(true);
    expect(lineFlagged(line(), { kind: "ambiguous", jobNumbers: ["a", "b"] })).toBe(true);
  });

  it("isn't one that was identified, the master's, or one somebody decided", () => {
    expect(lineFlagged(line(), { kind: "bl", shipmentId: "s1" })).toBe(false);
    expect(lineFlagged(line(), { kind: "master" })).toBe(false);
    expect(lineFlagged(line({ target: "s2" }), { kind: "not-found" })).toBe(false);
    expect(lineFlagged(line({ target: SPLIT_TARGET }), { kind: "not-found" })).toBe(false);
  });

  it("says why, except when identified", () => {
    expect(matchNote({ kind: "not-found" })).toContain("no shipment");
    expect(matchNote({ kind: "no-bl" })).toContain("No B/L");
    expect(matchNote({ kind: "ambiguous", jobNumbers: ["CZ1", "CZ2"] })).toContain("CZ1, CZ2");
    expect(matchNote({ kind: "bl", shipmentId: "s1" })).toBeNull();
  });
});

describe("the debit note AS260707595", () => {
  const debit = (bl: string, item: string, amount: string): InvoiceLineDraft => ({ bl, item, amount, currency: "USD", category: "other" });
  const lines = [
    debit("GLGL26050536", "POD COST", "464.62"),
    debit("GLGL26060288", "POD COST", "37.00"),
    debit("GLGL26060288", "OCEAN FREIGHT(D)", "109.00"),
    debit("GLSL26060771", "POD COST", "399.60"),
    debit("GLSL26060771", "OCEAN FREIGHT(D)", "1177.20"),
    debit("GLSL26060771", "CFS CHARGES", "18.00"),
    debit("GLSL26060771", "CFS CHARGES", "151.20"),
    debit("GLSL26060771", "PICK UP CHARGE", "62.00"),
    debit("GLSL26060771", "Import Control System 2", "15.00"),
    debit("GLSL26060771", "CUSTOM CLEARANCE", "45.00"),
    debit("GLSL26060963", "POD COST", "296.96"),
    debit("GLSL26060963", "OCEAN FREIGHT(D)", "874.83"),
  ];

  it("adds up to its total", () => {
    expect(linesTotals(lines, "USD").get("USD")).toBe(365041);
  });

  it("goes entirely to the shipments its B/Ls name", () => {
    const targets = lines.map((l) => lineTarget(l, matchLine(l, shipments)));
    expect(targets).toEqual(["s3", "s3", "s3", "s1", "s1", "s1", "s1", "s1", "s1", "s1", "s2", "s2"]);
    expect(anyToSplit(lines, lines.map((l) => matchLine(l, shipments)))).toBe(false);
  });
});

describe("what is posted", () => {
  const match = { kind: "bl", shipmentId: "s1" } as const;
  const none = { kind: "not-found" } as const;

  it("sends an identified line to its shipment with its B/L, without asking how to split", () => {
    expect(invoicePostLines([line()], [match], rows, ticked, null, "USD")).toEqual([
      { category: "other", amount: "399.60", currency: "USD", item: "POD COST", bl: "GLSL26060771", shipmentId: "s1", chosen: false },
    ]);
  });

  it("says when a person chose the shipment, so it is checked against the master job only", () => {
    expect(invoicePostLines([line({ target: "s2" })], [match], rows, ticked, null, "USD")![0]).toMatchObject({ shipmentId: "s2", chosen: true });
  });

  it("posts an amount typed with thousands or a decimal comma to the cent", () => {
    expect(invoicePostLines([line({ amount: "1,177.20" })], [match], rows, ticked, null, "USD")![0]!.amount).toBe("1177.20");
    expect(invoicePostLines([line({ amount: "1 177,2" })], [match], rows, ticked, null, "USD")![0]!.amount).toBe("1177.20");
    expect(invoicePostLines([line({ amount: "12abc" })], [match], rows, ticked, null, "USD")).toBeNull();
  });

  it("shares any other line over the ticked shipments only", () => {
    const out = invoicePostLines([line({ bl: "X" })], [none], rows, ticked, "wm", "USD")!;
    expect(out[0]).toMatchObject({ split: [{ shipmentId: "s1", weight: 2 }, { shipmentId: "s2", weight: 2 }] });
  });

  it("keeps a line's own currency", () => {
    expect(invoicePostLines([line({ currency: "EUR" })], [match], rows, ticked, null, "USD")![0]!.currency).toBe("EUR");
  });

  it("waits for how to split when a line goes to the split", () => {
    expect(invoicePostLines([line({ bl: "X" })], [none], rows, ticked, null, "USD")).toBeNull();
  });

  it("waits when nobody can take a share", () => {
    expect(invoicePostLines([line({ bl: "X" })], [none], rows, new Set(), "shipment", "USD")).toBeNull();
    expect(invoicePostLines([line({ bl: "X" })], [none], rows, new Set(["s4"]), "wm", "USD")).toBeNull();
  });

  it("waits for a charge and an amount on every line", () => {
    expect(invoicePostLines([line({ category: "" })], [match], rows, ticked, null, "USD")).toBeNull();
    expect(invoicePostLines([line({ amount: "" })], [match], rows, ticked, null, "USD")).toBeNull();
    expect(invoicePostLines([], [], rows, ticked, null, "USD")).toBeNull();
  });

  it("waits for a currency on a line that has none of its own while the invoice has none either", () => {
    expect(invoicePostLines([line({ currency: "" })], [match], rows, ticked, null, "")).toBeNull();
    expect(invoicePostLines([line({ currency: "PLN" })], [match], rows, ticked, null, "")?.[0]?.currency).toBe("PLN");
  });
});

describe("a line's amount", () => {
  it("is read as the money fields read it", () => {
    expect(lineAmount("1,177.20")).toBe(1177.2);
    expect(lineAmount("1.177,20")).toBe(1177.2);
    expect(lineAmount("1 177,20")).toBe(1177.2);
    expect(lineAmount(" -45 ")).toBe(-45);
    expect(lineAmount("399.60")).toBe(399.6);
  });

  it("reads a lone comma before three digits as thousands, as an invoice prints them", () => {
    expect(lineAmount("1,250")).toBe(1250);
    expect(lineAmount("12,500")).toBe(12500);
    expect(lineAmount("1,234,567")).toBe(1234567);
    expect(lineAmount("-1,250")).toBe(-1250);
  });

  it("reads any other comma as the decimal one", () => {
    expect(lineAmount("1,25")).toBe(1.25);
    expect(lineAmount("1250,5")).toBe(1250.5);
  });

  it("is rounded to the cent, as the server reads the invoice's lines", () => {
    expect(lineAmount("40.0858")).toBe(40.09);
    expect(lineAmount("399.600")).toBe(399.6);
  });

  it("is none when it is no number or 0", () => {
    for (const text of ["", " ", "abc", "12abc", "0", "0,00", "1e3", "1.2.3,4.5", undefined]) expect(lineAmount(text)).toBeNull();
  });
});

describe("a credit note", () => {
  const draft = (amount: string) => ({ bl: "", item: "x", amount, currency: "EUR", category: "ocean_freight" });

  it("posts its total as a minus, however it is printed", () => {
    expect(creditAmount("150")).toBe("-150.00");
    expect(creditAmount("-150.50")).toBe("-150.50");
    expect(creditAmount("1 234,50")).toBe("-1234.50");
    expect(creditAmount("not a number")).toBe("not a number");
    expect(creditAmount(undefined)).toBe("");
  });

  it("turns round lines printed plus", () => {
    expect(creditLines([draft("100"), draft("50.5")]).map((l) => l.amount)).toEqual(["-100.00", "-50.50"]);
  });

  it("leaves lines printed minus", () => {
    expect(creditLines([draft("-100"), draft("-50")]).map((l) => l.amount)).toEqual(["-100", "-50"]);
  });

  it("marks a line that would add buying, not one among credits of its own charge", () => {
    const one = { kind: "bl", shipmentId: "s1" } as const;
    const two = { kind: "bl", shipmentId: "s2" } as const;
    // Under the same charge and shipment it stays within the deduction.
    expect(creditLinesAbove0([draft("-100"), draft("10")], [one, one], "EUR")).toEqual(new Set());
    // On another shipment, or another charge, it would add buying there.
    expect(creditLinesAbove0([draft("-100"), draft("10")], [one, two], "EUR")).toEqual(new Set([1]));
    expect(creditLinesAbove0([draft("-100"), { ...draft("10"), category: "customs" }], [one, one], "EUR")).toEqual(new Set([1]));
    // A line edited to a plus amount on its own.
    expect(creditLinesAbove0([draft("1,177.20")], [one], "EUR")).toEqual(new Set([0]));
  });

  it("waits to be posted while a line adds buying or isn't an amount, as the table marks them", () => {
    const one = { kind: "bl", shipmentId: "s1" } as const;
    expect(invoiceLinesInvalid([draft("-100"), draft("10")], [one, one], "EUR", true)).toBe(false);
    expect(invoiceLinesInvalid([draft("10")], [one], "EUR", true)).toBe(true);
    expect(invoiceLinesInvalid([draft("10")], [one], "EUR", false)).toBe(false);
    expect(invoiceLinesInvalid([draft("ten")], [one], "EUR", false)).toBe(true);
  });

  it("keeps a charge among the credits, so the lines still add up to the credit", () => {
    expect(creditLines([draft("100"), draft("-10")]).map((l) => l.amount)).toEqual(["-100.00", "10.00"]);
    expect(creditLines([draft("-100"), draft("10")]).map((l) => l.amount)).toEqual(["-100", "10"]);
  });
});
