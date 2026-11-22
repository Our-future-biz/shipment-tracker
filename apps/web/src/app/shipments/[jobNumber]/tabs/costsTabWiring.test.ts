import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The Costs tab's real-cost wiring, read from its source: what the pure helpers' tests can't show (review of system-22).
describe("the Costs tab's real cost (mock test run F1)", () => {
  const tab = readFileSync(join(__dirname, "CostsTab.tsx"), "utf8");

  it("draws Qty and Real Cost as boxes that follow a reloaded line (RealCostInput), not a defaultValue set once", () => {
    expect(tab).not.toMatch(/defaultValue=\{amountInBox\(r\.real(Qty|Amount)\)\}/);
    expect(tab.match(/<RealCostInput\b/g)).toHaveLength(2);
    expect(tab).toMatch(/stored=\{r\.realQty\}/);
    expect(tab).toMatch(/stored=\{r\.realAmount\}/);
  });

  it("writes a reloaded value into the box itself (amountLoaded on a stored change), never by a remount that takes the focus", () => {
    const box = readFileSync(join(__dirname, "RealCostInput.tsx"), "utf8");
    expect(box).toMatch(/amountLoaded\(box\.current, el\.value, stored\)[^]*?\}, \[stored\]\);/);
    expect(box).toMatch(/defaultValue=\{initial\}/);
    expect(box).not.toMatch(/\bkey=/);
  });

  it("sends as was-values what the line's boxes show, not the row as last loaded", () => {
    expect(tab).not.toMatch(/drawn: r,/);
    expect(tab).toMatch(/drawn: shownRealCost\(r, shownReal\.current\.get\(r\.id\)\)/);
  });

  it("saves through the job page's one queue, which outlives the tab", () => {
    expect(tab).not.toMatch(/useState\(realCostQueue\)/);
    expect(tab).toMatch(/realCostSaves\(r\.id, \{/);
  });
});
