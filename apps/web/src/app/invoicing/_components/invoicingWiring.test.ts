import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(join(__dirname, file), "utf8");

describe("Invoicing job view wiring", () => {
  it("shows the DUZP of the newest open invoice, not the last one listed (the API lists newest first)", () => {
    const view = source("InvoicingView.tsx");
    expect(view).toMatch(/jobDuzp\(/);
    expect(view).not.toMatch(/open\[open\.length - 1\]/);
  });

  it("offers the check 'Marked Invoiced, not every charge on an invoice - or a credit owed' as a tab of the queue, with its own count (P16, M3)", () => {
    const queue = source("BillingQueue.tsx");
    expect(queue).toMatch(/"invoiced_charges_open"/);
    expect(queue).toMatch(/invoiced_charges_open: "invoicedChargesOpen"/);
    expect(queue).toContain('label: "Invoiced, charges or credits open"');
    expect(queue).toContain('title: "Marked Invoiced, not every charge on an invoice - or a credit owed to the customer"');
    // The Lines Invoiced cell says a credit owed, by the tested helper.
    expect(source("queueColumns.tsx")).toMatch(/linesInvoicedCell\(r\)/);
  });

  it("takes a Billed job as released for billing, not warned about as no Billing (mock test run)", () => {
    const panel = source("InvoicePanel.tsx");
    const found = /const isBillingStatus = [^\n]*?\/(\^[^\n]*?\$)\/\.test/.exec(panel);
    expect(found).not.toBeNull();
    const released = new RegExp(found![1]!);
    for (const status of ["Billing [IMP]", "Billing [EXP]", "Billing [DOM]", "Billed [IMP]", "Billed [EXP]", "Billed [DOM]"]) expect(released.test(status)).toBe(true);
    for (const status of ["Delivered [IMP]", "Invoiced [EXP]", "Billed", ""]) expect(released.test(status)).toBe(false);
  });

  it("builds the lines table with the tested helper", () => {
    expect(source("InvoicePanel.tsx")).toMatch(/lineTableRows\(/);
  });
});
