import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The master job's Costs Breakdown, read from its source: a real amount typed as 0 is filled in, as on a shipment's.
describe("the master job's filled-in amounts", () => {
  const tab = readFileSync(join(__dirname, "MasterJobCostsTab.tsx"), "utf8");

  it("mirrors a new estimate currency to Real only while the real amount is blank", () => {
    expect(tab).toMatch(/amountFilledIn\(line\.realAmount\) \|\| line\.invoicePaidOn \? \{\} : \{ realCurrency: currency \}/);
  });

  it("locks a line with an amount typed as 0, estimated or real", () => {
    expect(tab).toMatch(/amountFilledIn\(l\.estAmount\) \|\| amountFilledIn\(l\.realAmount\)/);
    expect(tab).not.toMatch(/Number\(l(ine)?\.realAmount\)/);
  });
});
