import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Export PDF on the quote's page closes a quote that has not gone out (ExportCloseDialog: it is
// marked as sent, Quoted) and prints any other as it stands. The revision of a Won quote is open
// to change yet stays Won - the server does not mark it as sent - so it is printed as it stands
// too: the decision goes by exportClosesQuote(status), not by whether the page shows the quote
// closed (quoteClosed), which a Won revision is not.
describe("Export PDF on the quote page", () => {
  it("prints a quote whose status does not close on export as it stands, the revision of a Won quote among them", () => {
    const source = readFileSync(join(__dirname, "QuoteWorkflow.tsx"), "utf8");
    expect(source).toMatch(/const exportPdf = \(\) => \{\s*if \(quote && !exportClosesQuote\(quote\.status\)\) printNow\(\);/);
  });
});

// A quote that went out is locked whole (every step inside a disabled fieldset), its validity too:
// a closed quote keeps the Valid until the customer was given (applyValidity refuses another) and a
// new date is a revision. So the Valid until row is part of the Shipping terms step's content, and
// its picker names no `disabled` of its own - antd's own `false` would override the lock.
describe("Valid until on a closed quote", () => {
  it("is locked with the rest of the step: no part of a step is rendered outside the locked fieldset", () => {
    const source = readFileSync(join(__dirname, "QuoteWorkflow.tsx"), "utf8");
    expect(source).toMatch(/<InfoRow label="Valid until">\s*<DatePicker(?![^>]*disabled=)[^>]*aria-label="Valid until"/);
    expect(source).not.toMatch(/shown\.open/);
  });
});
