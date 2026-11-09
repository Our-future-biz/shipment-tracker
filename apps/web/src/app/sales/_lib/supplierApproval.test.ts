import { describe, expect, it } from "vitest";
import { approvalStatusChanged, supplierApprovalOf, supplierSendBlock, typedSupplierLines, typedSupplierMessage, type ApprovalAnswer } from "./supplierApproval";

const directory = new Map([
  ["a", { companyName: "DANGO s.r.o.", approvalStatus: "pending" }],
  ["b", { companyName: "Hapag-Lloyd AG", approvalStatus: "" }],
]);
const none = new Map<string, ApprovalAnswer>();
const declined = new Map<string, ApprovalAnswer>([["c", { companyName: "Nobody s.r.o.", status: "declined", comment: "Unknown company" }]]);
const block = (lines: { supplier?: string; supplierCustomerId?: string; type?: string; tariffRef?: string }[], approvals = declined) =>
  supplierSendBlock(lines, (id) => directory.get(id), approvals);

describe("supplierSendBlock", () => {
  it("holds a quote linked to a supplier waiting for a manager", () => {
    expect(block([{ supplierCustomerId: "b" }, { supplierCustomerId: "a" }])).toMatch(/^The new supplier DANGO s\.r\.o\. waits/);
  });
  it("holds a quote linked to a declined supplier, saying why", () => {
    expect(block([{ supplier: "Nobody", supplierCustomerId: "c" }])).toBe(
      "A manager declined the supplier Nobody s.r.o. (Unknown company) — pick another supplier on its buying line",
    );
  });
  it("lets approved and unknown suppliers go", () => {
    expect(block([{ supplierCustomerId: "b" }, { supplierCustomerId: "zzz" }, { supplier: " " }])).toBeNull();
  });
  it("holds a quote with a supplier only typed, naming the line, as the server does", () => {
    expect(block([{ type: "Road freight", supplier: "Typed" }, { supplierCustomerId: "b" }])).toBe(
      "The supplier of the buying line Road freight (Typed) is only typed — pick it from the Customer Database on Pricing (or add it there)",
    );
    // A tariff's line keeps the tariff's supplier.
    expect(block([{ type: "Rail freight", supplier: "Rail Cargo", tariffRef: "rail:v1:r1" }])).toBeNull();
  });

  it("goes by the Company approval list's answer before the Customer Database list, which is read less often", () => {
    // Approved meanwhile: the directory still says it waits, the list knows better.
    const approved = new Map<string, ApprovalAnswer>([["a", { companyName: "DANGO s.r.o.", status: "", comment: "" }]]);
    expect(block([{ supplierCustomerId: "a" }], approved)).toBeNull();
    // Declined meanwhile: the directory still has it as waiting (it is deleted now), the line says declined.
    const no = new Map<string, ApprovalAnswer>([["a", { companyName: "DANGO s.r.o.", status: "declined", comment: "Duplicate" }]]);
    expect(block([{ supplierCustomerId: "a" }], no)).toBe("A manager declined the supplier DANGO s.r.o. (Duplicate) — pick another supplier on its buying line");
    // Nothing on the list about it: the directory's word.
    expect(block([{ supplierCustomerId: "a" }], none)).toMatch(/waits for a manager's approval/);
  });
});

describe("supplierApprovalOf", () => {
  it("is the list's answer, else the directory's, else unknown", () => {
    expect(supplierApprovalOf("c", (id) => directory.get(id), declined)).toMatchObject({ status: "declined" });
    expect(supplierApprovalOf("a", (id) => directory.get(id), none)).toEqual({ companyName: "DANGO s.r.o.", status: "pending", comment: "" });
    expect(supplierApprovalOf("zzz", (id) => directory.get(id), none)).toBeUndefined();
  });
});

describe("typedSupplierLines", () => {
  it("name each line by its charge, or its description", () => {
    expect(typedSupplierLines([{ type: "", description: "Customs", supplier: " Celní " }, { supplier: "X" }])).toEqual([
      { charge: "Customs", supplier: "Celní" },
      { charge: "a charge", supplier: "X" },
    ]);
    expect(typedSupplierMessage([{ charge: "Road freight", supplier: "A" }, { charge: "THC", supplier: "B" }])).toBe(
      "The suppliers of the buying lines Road freight (A), THC (B) are only typed — pick each from the Customer Database on Pricing (or add it there)",
    );
  });
});

describe("approvalStatusChanged", () => {
  const item = (threadId: string, status: string) => ({ threadId, status });
  it("is news when a supplier is answered, taken back, added or gone; not on the first read", () => {
    expect(approvalStatusChanged(undefined, [item("a", "pending")])).toBe(false);
    expect(approvalStatusChanged([item("a", "pending")], [item("a", "pending")])).toBe(false);
    expect(approvalStatusChanged([item("a", "pending")], [item("a", "")])).toBe(true);
    expect(approvalStatusChanged([item("a", "declined")], [item("a", "pending")])).toBe(true);
    expect(approvalStatusChanged([item("a", "pending")], [item("a", "pending"), item("b", "pending")])).toBe(true);
    expect(approvalStatusChanged([item("a", "pending"), item("b", "")], [item("a", "pending")])).toBe(true);
  });
});
