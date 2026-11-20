import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(join(__dirname, file), "utf8");

describe("Create consignment", () => {
  // It makes a Road job or books on one, as the New Shipment wizard does (User Council T7, Council Outlay 10 D21).
  it("shows the customer's credit warning under the customer line, to read, never a stop", () => {
    const modal = source("ConsignmentCreateModal.tsx");
    expect(modal).toMatch(/<CreditWarning customerId=\{form\.customerId\} showPrepayment \/>/);
    expect(modal.indexOf("<CreditWarning")).toBeGreaterThan(modal.indexOf("{jobLine}"));
    // Create is not held back by it.
    expect(modal).not.toMatch(/disabled=\{[^}]*credit/i);
  });

  // "Not created — No Standard LTL sell list." stood on after switching to Agreed price (User Council T2).
  it("shows a refusal only while the form is the one it was given for", () => {
    const modal = source("ConsignmentCreateModal.tsx");
    expect(modal).toContain("setRefusal({ form, text: `Not created — ${apiErrorMessage(e)}.` });");
    expect(modal).toContain("const shownRefusal = refusal && refusal.form === form ? refusal.text : null;");
    expect(modal).toContain("{shownRefusal && <Alert");
  });

  it("asks the fixed delivery date for Express fixed date, with an optional time", () => {
    const fields = source("ConsignmentFormFields.tsx");
    expect(fields).toContain('aria-label="Fixed delivery date"');
    expect(fields).toContain('aria-label="Delivery by time"');
    expect(fields).toMatch(/const fixed = form\.serviceLevel === FIXED_LEVEL;/);
  });
});
