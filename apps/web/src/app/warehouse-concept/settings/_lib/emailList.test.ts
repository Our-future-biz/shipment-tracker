import { describe, expect, it } from "vitest";
import { isEmailAddress, normaliseList, recipientsProblem, splitAddresses } from "./emailList";

describe("supplier e-mail recipients (settings screen)", () => {
  it("accepts plain addresses only", () => {
    expect(isEmailAddress(" Ops@Supplier.cz ")).toBe(true);
    for (const a of ["ops", "ops@x", "a b@x.cz", "a..b@x.cz", "Ops <ops@x.cz>"]) expect(isEmailAddress(a)).toBe(false);
  });

  it("splits pasted lists and drops repeats", () => {
    expect(splitAddresses("a@x.cz; b@y.cz,\nc@z.cz  <d@w.cz>")).toEqual(["a@x.cz", "b@y.cz", "c@z.cz", "d@w.cz"]);
    expect(normaliseList(["A@x.cz", "a@x.cz; nope"])).toEqual({ ok: ["a@x.cz"], bad: ["nope"] });
  });

  it("says why recipients cannot be saved", () => {
    expect(recipientsProblem({ enabled: true, to: ["a@x.cz"], cc: [] })).toBeNull();
    expect(recipientsProblem({ enabled: false, to: [], cc: [] })).toBeNull();
    expect(recipientsProblem({ enabled: true, to: [], cc: ["b@x.cz"] })).toBe("Add at least one To address, or switch e-mail off");
    expect(recipientsProblem({ enabled: false, to: ["bad"], cc: [] })).toBe("Not an e-mail address: bad");
  });
});
