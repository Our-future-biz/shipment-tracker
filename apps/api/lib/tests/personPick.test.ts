import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("./encoreApi.stub"));

import { matchUser, requireUserEmail, userByEmail } from "../personPick";

const users = [
  { id: "u1", email: "lukas@ourfuture.biz", displayName: "Lukáš" },
  { id: "u2", email: "martin@ourfuture.biz", displayName: "Martin" },
  { id: "u3", email: "marek@ourfuture.biz", displayName: "Marek" },
  { id: "u4", email: "petr.novak@ourfuture.biz", displayName: "Petr" },
  { id: "u5", email: "petr.svoboda@ourfuture.biz", displayName: "Petr" },
];

describe("a picked person", () => {
  it("is stored as the user's e-mail, lower-cased", () => {
    expect(requireUserEmail(" Lukas@OurFuture.biz ", "Person In Charge", users)).toBe("lukas@ourfuture.biz");
    expect(requireUserEmail("", "Person In Charge", users)).toBe("");
    expect(requireUserEmail(undefined, "Person In Charge", users)).toBe("");
  });

  it("is refused when it is not the e-mail of a user of the company", () => {
    expect(() => requireUserEmail("Lukáš", "Person In Charge", users)).toThrow("Person In Charge: pick a user of the company");
    expect(() => requireUserEmail("someone@else.com", "Holiday Cover", users)).toThrow("Holiday Cover: pick a user of the company");
  });

  it("is found by e-mail only through userByEmail", () => {
    expect(userByEmail("MARTIN@ourfuture.biz", users)?.id).toBe("u2");
    expect(userByEmail("Martin", users)).toBeNull();
  });
});

describe("an old typed value", () => {
  it("means the one user with that name, e-mail or e-mail name, without regard to case or accents", () => {
    expect(matchUser("Lukáš", users)?.email).toBe("lukas@ourfuture.biz");
    expect(matchUser("lukas", users)?.email).toBe("lukas@ourfuture.biz");
    expect(matchUser(" martin ", users)?.email).toBe("martin@ourfuture.biz");
    expect(matchUser("petr.novak", users)?.email).toBe("petr.novak@ourfuture.biz");
  });

  it("means nobody when it fits no user or more than one", () => {
    expect(matchUser("Petr", users)).toBeNull();
    expect(matchUser("Pepa", users)).toBeNull();
    expect(matchUser("", users)).toBeNull();
  });
});
