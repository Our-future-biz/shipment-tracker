import { describe, expect, it } from "vitest";
import { supplierSendBlock } from "./supplierApproval";

const directory = new Map([
  ["a", { companyName: "DANGO s.r.o.", approvalStatus: "pending" }],
  ["b", { companyName: "Hapag-Lloyd AG", approvalStatus: "" }],
]);
const declined = new Map([["c", { companyName: "Nobody s.r.o.", comment: "Unknown company" }]]);
const block = (lines: { supplier?: string; supplierCustomerId?: string }[]) => supplierSendBlock(lines, (id) => directory.get(id), declined);

describe("supplierSendBlock", () => {
  it("holds a quote linked to a supplier waiting for a manager", () => {
    expect(block([{ supplier: "Typed" }, { supplierCustomerId: "b" }, { supplierCustomerId: "a" }])).toMatch(/^The new supplier DANGO s\.r\.o\. waits/);
  });
  it("holds a quote linked to a declined supplier, saying why", () => {
    expect(block([{ supplier: "Nobody", supplierCustomerId: "c" }])).toBe(
      "A manager declined the supplier Nobody s.r.o. (Unknown company) — pick another supplier on its buying line",
    );
  });
  it("lets approved, typed and unknown suppliers go", () => {
    expect(block([{ supplier: "Typed" }, { supplierCustomerId: "b" }, { supplierCustomerId: "zzz" }])).toBeNull();
  });
});
