import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { personIn, planPeopleNormalize, requireApprovedBy, type ShipmentPeople } from "../lib/people";

const JAN = { id: "u-jan", email: "jan@firma.cz", displayName: "Jan Novák" };
const LUKAS = { id: "u-lukas", email: "lukas.dvorak@firma.cz", displayName: "Lukáš Dvořák" };
const EVA_1 = { id: "u-eva1", email: "eva.mala@firma.cz", displayName: "Eva" };
const EVA_2 = { id: "u-eva2", email: "eva@firma.cz", displayName: "Eva Velká" };
const USERS = [JAN, LUKAS, EVA_1, EVA_2];

const WHEN = "26. 10. 2026 9:15:00";

describe("requireApprovedBy", () => {
  it("takes nobody, a user's e-mail and the stamp a credit approval leaves - the e-mail lower-cased", () => {
    expect(requireApprovedBy("  ", USERS)).toBe("");
    expect(requireApprovedBy(" Jan@Firma.cz ", USERS)).toBe("jan@firma.cz");
    expect(requireApprovedBy(`JAN@firma.cz — ${WHEN}`, USERS)).toBe(`jan@firma.cz — ${WHEN}`);
  });

  it("refuses a name, an e-mail of nobody in the company and a stamp of either", () => {
    for (const value of ["Jan Novák", "petr@jinde.cz", `Jan Novák — ${WHEN}`, `petr@jinde.cz — ${WHEN}`]) {
      expect(() => requireApprovedBy(value, USERS)).toThrow(expect.objectContaining({ code: "invalid_argument", message: "Approved By: pick a user of the company (by e-mail)" }));
    }
  });

  it("takes only the time after a user's e-mail in a stamp, so no other text (a name) rides along", () => {
    expect(requireApprovedBy("jan@firma.cz — 26. 10. 2026", USERS)).toBe("jan@firma.cz — 26. 10. 2026");
    for (const value of ["jan@firma.cz — Petr Novák", `jan@firma.cz — ${WHEN} Petr`, "jan@firma.cz — ", `jan@firma.cz — eva@firma.cz — ${WHEN}`]) {
      expect(() => requireApprovedBy(value, USERS)).toThrow(expect.objectContaining({ code: "invalid_argument", message: "Approved By: pick a user of the company (by e-mail)" }));
    }
  });
});

describe("personIn", () => {
  it("finds the name in a person field, and in each stamp where that stamp keeps it", () => {
    expect(personIn("personInCharge", " Lukáš ")).toEqual({ prefix: "", name: "Lukáš", suffix: "" });
    expect(personIn("createdBy", `${WHEN} — Jan Novák`)).toEqual({ prefix: `${WHEN} — `, name: "Jan Novák", suffix: "" });
    expect(personIn("createdBy", "Trucking · Jan Novák")).toEqual({ prefix: "Trucking · ", name: "Jan Novák", suffix: "" });
    expect(personIn("approvedBy", `Jan Novák — ${WHEN}`)).toEqual({ prefix: "", name: "Jan Novák", suffix: ` — ${WHEN}` });
    expect(personIn("houseBolRelease", `Jan Novák — ${WHEN}`)).toEqual({ prefix: "", name: "Jan Novák", suffix: ` — ${WHEN}` });
    expect(personIn("approvedBy", "Jan Novák")).toEqual({ prefix: "", name: "Jan Novák", suffix: "" });
  });

  it("finds nobody in an empty value, a stamp that has only its time, and Trucking itself", () => {
    for (const [field, value] of [
      ["salesPerson", "  "],
      ["approvedBy", WHEN],
      ["createdBy", WHEN],
      ["createdBy", "Trucking"],
      ["createdBy", "Trucking (system)"],
      ["createdBy", "Trucking · Trucking (system)"],
    ] as const) {
      expect(personIn(field, value)).toBeNull();
    }
  });
});

describe("planPeopleNormalize", () => {
  const row = (over: Partial<ShipmentPeople> = {}): ShipmentPeople => ({
    id: "s-1",
    personInCharge: "",
    holidayCover: "",
    salesPerson: "",
    switchBolApprovedBy: "",
    createdBy: "",
    approvedBy: "",
    houseBolRelease: "",
    ...over,
  });

  it("turns a name that fits one user into that user's e-mail, keeping the rest of a stamp", () => {
    const plan = planPeopleNormalize(
      [
        row({
          personInCharge: "lukas.dvorak",
          holidayCover: "Jan Novák",
          salesPerson: "LUKAS DVORAK",
          switchBolApprovedBy: "Jan@Firma.cz",
          createdBy: `${WHEN} — Jan Novák`,
          approvedBy: `Lukáš Dvořák — ${WHEN}`,
          houseBolRelease: `jan — ${WHEN}`,
        }),
      ],
      USERS,
    );
    expect(plan.rewrites).toEqual([
      { field: "personInCharge", from: "lukas.dvorak", to: "lukas.dvorak@firma.cz" },
      { field: "holidayCover", from: "Jan Novák", to: "jan@firma.cz" },
      { field: "salesPerson", from: "LUKAS DVORAK", to: "lukas.dvorak@firma.cz" },
      { field: "switchBolApprovedBy", from: "Jan@Firma.cz", to: "jan@firma.cz" },
      { field: "createdBy", from: `${WHEN} — Jan Novák`, to: `${WHEN} — jan@firma.cz` },
      { field: "approvedBy", from: `Lukáš Dvořák — ${WHEN}`, to: `lukas.dvorak@firma.cz — ${WHEN}` },
      { field: "houseBolRelease", from: `jan — ${WHEN}`, to: `jan@firma.cz — ${WHEN}` },
    ]);
    expect(plan).toMatchObject({ checked: 7, unmatched: [] });
  });

  it("rewrites a value held by many shipments once, and a Trucking stamp keeps its Trucking", () => {
    const plan = planPeopleNormalize(
      [row({ id: "s-1", personInCharge: "Jan Novák" }), row({ id: "s-2", personInCharge: "Jan Novák", createdBy: "Trucking · Jan Novák" })],
      USERS,
    );
    expect(plan.rewrites).toEqual([
      { field: "personInCharge", from: "Jan Novák", to: "jan@firma.cz" },
      { field: "createdBy", from: "Trucking · Jan Novák", to: "Trucking · jan@firma.cz" },
    ]);
    expect(plan.checked).toBe(3);
  });

  it("leaves a name that fits nobody or more than one user and reports it, the most frequent first", () => {
    const plan = planPeopleNormalize(
      [
        row({ id: "s-1", personInCharge: "Petr", approvedBy: `Petr — ${WHEN}` }),
        row({ id: "s-2", personInCharge: "Petr", salesPerson: "eva" }),
      ],
      USERS,
    );
    expect(plan.rewrites).toEqual([]);
    expect(plan.unmatched).toEqual([
      { field: "personInCharge", value: "Petr", count: 2 },
      { field: "approvedBy", value: "Petr", count: 1 },
      // "eva" is the start of one user's e-mail and the name of another: no guess.
      { field: "salesPerson", value: "eva", count: 1 },
    ]);
    expect(plan.checked).toBe(4);
  });

  it("finds nothing to do the second time", () => {
    const first = planPeopleNormalize([row({ personInCharge: "Jan Novák", createdBy: `${WHEN} — Lukáš Dvořák`, approvedBy: WHEN, houseBolRelease: "" })], USERS);
    const after = row(Object.fromEntries(first.rewrites.map((r) => [r.field, r.to])));
    after.approvedBy = WHEN;
    const second = planPeopleNormalize([after], USERS);
    expect(second.rewrites).toEqual([]);
    expect(second).toMatchObject({ checked: 2, unmatched: [] });
  });
});
