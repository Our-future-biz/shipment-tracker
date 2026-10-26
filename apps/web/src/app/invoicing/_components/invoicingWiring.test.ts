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

  it("builds the lines table with the tested helper", () => {
    expect(source("InvoicePanel.tsx")).toMatch(/lineTableRows\(/);
  });
});
