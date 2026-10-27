import { describe, expect, it } from "vitest";
import { isUnlinkedPerson, sortedUsers, userByEmail, userMatches } from "./people";

const users = [
  { id: "u1", email: "lukas@ourfuture.biz", displayName: "Lukáš" },
  { id: "u2", email: "martin@ourfuture.biz", displayName: "Martin" },
  { id: "u3", email: "marek@ourfuture.biz", displayName: "Marek" },
];

describe("people", () => {
  it("finds a user by e-mail in any case", () => {
    expect(userByEmail(" LUKAS@ourfuture.biz", users)?.id).toBe("u1");
    expect(userByEmail("Lukáš", users)).toBeNull();
    expect(userByEmail("", users)).toBeNull();
  });

  it("tells an old name or free text from a picked user", () => {
    expect(isUnlinkedPerson("Lukáš", users)).toBe(true);
    expect(isUnlinkedPerson("martin@ourfuture.biz", users)).toBe(false);
    expect(isUnlinkedPerson("", users)).toBe(false);
  });

  it("matches what was typed against the name and the e-mail, ignoring accents", () => {
    expect(userMatches(users[0]!, "lukas")).toBe(true);
    expect(userMatches(users[0]!, "Lukáš")).toBe(true);
    expect(userMatches(users[1]!, "martin@our")).toBe(true);
    expect(userMatches(users[2]!, "martin")).toBe(false);
  });

  it("lists users by name", () => {
    expect(sortedUsers(users).map((u) => u.displayName)).toEqual(["Lukáš", "Marek", "Martin"]);
  });
});
