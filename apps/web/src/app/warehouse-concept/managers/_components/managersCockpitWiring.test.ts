import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(join(__dirname, "ManagersCockpit.tsx"), "utf8");

describe("Warehouse Concept → Managers", () => {
  it("has no count on the Approvals tab: they are decided on Shipments → Managers (user council M16)", () => {
    expect(page).toMatch(/\{ key: "approvals", label: "Approvals" \}/);
  });

  it("writes money as Shipments → Managers does, the currency after the amount (user council M17)", () => {
    expect(page).toMatch(/est\. \$\{nf\(t\.chargeableCzk\)\} CZK/);
    expect(page).not.toMatch(/est\. CZK/);
  });
});
