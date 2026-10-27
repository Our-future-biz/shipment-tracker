import { describe, expect, it } from "vitest";
import { whoDid } from "./whoDid";

const users = [{ id: "u1", email: "lukas@ourfuture.biz", displayName: "Lukáš Novák" }];

describe("whoDid", () => {
  it("names the user by their e-mail, also where a display name was recorded", () => {
    expect(whoDid("u1", "Lukáš Novák", users)).toBe("lukas@ourfuture.biz");
    expect(whoDid("u1", "", users)).toBe("lukas@ourfuture.biz");
  });

  it("keeps what was recorded for somebody it does not know, or without a user id", () => {
    expect(whoDid("u-gone", " Karel ", users)).toBe("Karel");
    expect(whoDid("u1", "Lukáš Novák", [])).toBe("Lukáš Novák");
    expect(whoDid(undefined, "You", users)).toBe("You");
    expect(whoDid(null, null, users)).toBe("");
  });
});
