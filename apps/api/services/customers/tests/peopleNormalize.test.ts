import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { planOwners, planValues } from "../lib/peopleNormalize";

const LUKAS = { id: "u1", email: "lukas@ourfuture.biz", displayName: "Lukáš Novák" };
const MARTIN = { id: "u2", email: "martin@ourfuture.biz", displayName: "Martin" };
const PETR_N = { id: "u3", email: "petr.novak@ourfuture.biz", displayName: "Petr" };
const PETR_S = { id: "u4", email: "petr.svoboda@ourfuture.biz", displayName: "Petr" };
const USERS = [LUKAS, MARTIN, PETR_N, PETR_S];

describe("the sales owners of customers", () => {
  it("of a linked customer become the user's e-mail", () => {
    const { changes, unmatched } = planOwners([{ userId: "u1", label: "Lukáš Novák", count: 3 }], USERS);
    expect(changes).toEqual([{ from: { userId: "u1", label: "Lukáš Novák" }, to: LUKAS, count: 3 }]);
    expect(unmatched).toEqual([]);
  });

  it("are left alone when they already are the e-mail, or the user is no longer in the company", () => {
    const groups = [
      { userId: "u1", label: "lukas@ourfuture.biz", count: 2 },
      { userId: "u-gone", label: "Karel", count: 1 },
    ];
    expect(planOwners(groups, USERS)).toEqual({ changes: [], unmatched: [] });
  });

  it("typed by hand are linked to the one user they name - by name, e-mail or the part before the @, any case or accents", () => {
    const groups = [
      { userId: null, label: "lukas novak", count: 1 },
      { userId: null, label: "MARTIN@ourfuture.biz", count: 2 },
      { userId: null, label: "petr.novak", count: 1 },
    ];
    expect(planOwners(groups, USERS).changes).toEqual([
      { from: { userId: null, label: "lukas novak" }, to: LUKAS, count: 1 },
      { from: { userId: null, label: "MARTIN@ourfuture.biz" }, to: MARTIN, count: 2 },
      { from: { userId: null, label: "petr.novak" }, to: PETR_N, count: 1 },
    ]);
  });

  it("typed by hand stay as they are, and are listed, when they name nobody or several users", () => {
    const groups = [
      { userId: null, label: "Petr", count: 4 },
      { userId: null, label: "Obchod", count: 1 },
      { userId: null, label: "  ", count: 1 },
    ];
    expect(planOwners(groups, USERS)).toEqual({
      changes: [],
      unmatched: [
        { value: "Petr", count: 4 },
        { value: "Obchod", count: 1 },
      ],
    });
  });
});

describe("the authors of notes", () => {
  it("become the e-mail of the one user they name; an e-mail already stored stays", () => {
    const groups = [
      { value: "Lukáš Novák", count: 5 },
      { value: "Martin@OurFuture.biz", count: 1 },
      { value: "martin@ourfuture.biz", count: 7 },
    ];
    expect(planValues(groups, USERS)).toEqual({
      changes: [
        { from: "Lukáš Novák", to: "lukas@ourfuture.biz", count: 5 },
        { from: "Martin@OurFuture.biz", to: "martin@ourfuture.biz", count: 1 },
      ],
      unmatched: [],
    });
  });

  it("that name nobody or several users stay and are listed", () => {
    expect(planValues([{ value: "Austromar", count: 2 }, { value: "Petr", count: 1 }, { value: "", count: 9 }], USERS)).toEqual({
      changes: [],
      unmatched: [
        { value: "Austromar", count: 2 },
        { value: "Petr", count: 1 },
      ],
    });
  });
});
