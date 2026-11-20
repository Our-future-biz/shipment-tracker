import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(join(__dirname, file), "utf8");

// The job page's own wiring, read from its source: what a unit test of a pure function can't show.
describe("the job page (user council O24, x2, M23, O25, c4)", () => {
  const page = source("ShipmentDetailContent.tsx");

  it("opens a tab on the click: the URL changes at once, with no server round trip first", () => {
    const setTab = page.slice(page.indexOf("const setActiveTab"), page.indexOf("\n", page.indexOf("const setActiveTab")));
    expect(setTab).toMatch(/replaceSearchParams\(pathname/);
    expect(setTab).not.toMatch(/router\.replace/);
  });

  it("draws its tabs with antd Tabs, which puts those that don't fit under a menu", () => {
    expect(page).toMatch(/<Tabs\s+activeKey=\{activeTab\}/);
  });

  it("says what the red values mean when the job waits for an original B/L", () => {
    expect(page).toMatch(/const oblWaiting = waitsForOriginalBl\(buildRowData\(shipment\)\)/);
    expect(page).toMatch(/\{oblWaiting && \(/);
  });

  it("leaves Cancel Reason out of the Overview's fields on a job that is not cancelled", () => {
    expect(page).toMatch(/\.filter\(\(f\) => f\.key !== "cancelReason" \|\| isCancelled\(shipment\.status\)\)/);
  });

  it("names where the job's Invoice Value comes from", () => {
    expect(page).toMatch(/jobInvoiceValue\(/);
    expect(page).toMatch(/"commercial invoices"/);
    expect(page).toMatch(/"Cargo Details lines"/);
  });

  it("shows Loading on Costs and Customs while their data is on its way, not 'No … yet'", () => {
    expect(source("tabs/CostsTab.tsx").match(/Rows\.length && costsLoading && \(/g)).toHaveLength(2);
    expect(source("tabs/CustomsTab.tsx")).toMatch(/documents\.length === 0 && documentsLoading\s*\?\s*"Loading documents…"/);
  });
});
