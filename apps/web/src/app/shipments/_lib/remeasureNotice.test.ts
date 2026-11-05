import { describe, expect, it } from "vitest";
import { remeasureNotice } from "./remeasureNotice";

const users = [
  { id: "u1", email: "lukas@ourfuture.biz", displayName: "Lukáš" },
  { id: "u2", email: "marek@ourfuture.biz", displayName: "" },
  { id: "u3", email: "martin@ourfuture.biz", displayName: "Martin" },
];
const shipment = { colli: 20, weightKg: 3000, volumeCbm: 10 };
const remeasured = { colli: 11, weightKg: 2750, volumeCbm: 31.68 };

describe("remeasureNotice", () => {
  it("says the cargo was remeasured, both sets of figures, and tags Person in Charge and Holiday Cover", () => {
    const n = remeasureNotice({ personInCharge: "lukas@ourfuture.biz", holidayCover: "Marek@OurFuture.biz" }, users, shipment, remeasured);
    expect(n.message).toBe(
      [
        "Cargo has been remeasured by the warehouse.",
        "Shipment values: 20 colli · 3,000.0 kg · 10.000 CBM",
        "Remeasured values: 11 colli · 2,750.0 kg · 31.680 CBM",
        "@Lukáš @marek@ourfuture.biz",
      ].join("\n"),
    );
    expect(n.mentionedUserIds).toEqual(["u1", "u2"]);
  });

  it("tags someone named in both fields once", () => {
    expect(remeasureNotice({ personInCharge: "lukas@ourfuture.biz", holidayCover: "lukas@ourfuture.biz" }, users, shipment, remeasured).mentionedUserIds).toEqual(["u1"]);
  });

  it("tags nobody for empty fields or people who are no users, and still writes the message", () => {
    const n = remeasureNotice({ personInCharge: "", holidayCover: "someone@else.com" }, users, shipment, { colli: 0, weightKg: 0, volumeCbm: 0 });
    expect(n.mentionedUserIds).toEqual([]);
    expect(n.message).toBe(
      ["Cargo has been remeasured by the warehouse.", "Shipment values: 20 colli · 3,000.0 kg · 10.000 CBM", "Remeasured values: — colli · — kg · — CBM"].join("\n"),
    );
  });

  it("reads who from a value carrying a stamp's date", () => {
    expect(remeasureNotice({ personInCharge: "martin@ourfuture.biz — 26. 10. 2026 14:03:05" }, users, shipment, remeasured).mentionedUserIds).toEqual(["u3"]);
  });
});
