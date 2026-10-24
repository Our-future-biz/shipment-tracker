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

// A quote that went out is locked whole (every step inside a disabled fieldset), but its validity
// is the server's, not the document's: a Quoted, Feedback or Expired quote takes a new Valid until
// (applyValidity refuses won and lost only), and the lifecycle band sends people to Shipping terms
// for it. So the Valid until row is the step's open part, rendered after the lock.
describe("Valid until on a closed quote", () => {
  it("stays usable: the row is the Shipping terms step's open part, outside the locked fieldset", () => {
    const source = readFileSync(join(__dirname, "QuoteWorkflow.tsx"), "utf8");
    expect(source).toMatch(/open: \(\s*<InfoRow label="Valid until">/);
    expect(source).toMatch(/<\/ConfigProvider>\s*\{shown\.open\}/);
  });
});
