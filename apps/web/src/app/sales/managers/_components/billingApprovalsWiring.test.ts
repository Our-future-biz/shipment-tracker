import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(__dirname, "BillingApprovals.tsx"), "utf8");
const body = (fn: string) => {
  const at = source.indexOf(`function ${fn}(`);
  const next = source.indexOf("\nfunction ", at + 1);
  return source.slice(at, next < 0 ? undefined : next);
};

describe("Billing approvals wiring", () => {
  it("shows the write-offs and bank charges waiting in a card of their own, not inside the supplier invoices' card (mock test run)", () => {
    expect(body("SupplierInvoiceApprovals")).not.toContain("<WriteOffsWaiting");
    expect(body("BillingApprovals")).toMatch(/<SupplierInvoiceApprovals \/>\s*<WriteOffsWaiting \/>/);
    const card = body("WriteOffsWaiting");
    expect(card).toContain("<section");
    expect(card).toContain("Write-offs and bank charges to confirm");
  });
});
