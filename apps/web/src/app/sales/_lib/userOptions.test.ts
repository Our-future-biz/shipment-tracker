import { describe, expect, it } from "vitest";
import { matchesUserOption, userIdOptions } from "./userOptions";

const users = [
  { id: "u2", email: "martin@ourfuture.biz", displayName: "Martin Koubek" },
  { id: "u1", email: "lukas@ourfuture.biz", displayName: "Lukáš Novák" },
];

describe("userIdOptions", () => {
  it("keys each user by id and labels them by e-mail, with the name for the list, in name order", () => {
    expect(userIdOptions(users)).toEqual([
      { value: "u1", label: "lukas@ourfuture.biz", name: "Lukáš Novák" },
      { value: "u2", label: "martin@ourfuture.biz", name: "Martin Koubek" },
    ]);
  });
});

describe("matchesUserOption", () => {
  const [lukas] = userIdOptions(users);

  it("finds a user by name - without accents - or by e-mail", () => {
    expect(matchesUserOption("lukas", lukas)).toBe(true);
    expect(matchesUserOption("Novák", lukas)).toBe(true);
    expect(matchesUserOption("lukas@our", lukas)).toBe(true);
    expect(matchesUserOption("martin", lukas)).toBe(false);
  });

  it("finds the options that are no user by their label", () => {
    expect(matchesUserOption("me", { label: "Me" })).toBe(true);
    expect(matchesUserOption("no own", { label: "No owner" })).toBe(true);
    expect(matchesUserOption("x", undefined)).toBe(false);
  });
});
