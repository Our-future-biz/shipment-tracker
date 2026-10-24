import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A user's email templates are stored as one list, written whole (emailTemplate.service save):
// a save made while the list was not read yet - still loading, or its request failed - would
// put a list of one in the place of every template saved before.
describe("Save as template", () => {
  it("waits for the user's templates to be read, in the button and in the save itself", () => {
    const source = readFileSync(join(__dirname, "EmailQuoteModal.tsx"), "utf8");
    expect(source).toMatch(/const saveTemplate = async \(name: string\) => \{[^}]*?if \(!templates\.ready\) return;/);
    expect(source).toMatch(/disabled=\{!templates\.ready\}/);
  });
});
