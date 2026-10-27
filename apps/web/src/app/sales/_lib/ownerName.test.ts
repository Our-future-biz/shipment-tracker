import { describe, expect, it } from "vitest";
import { ownerNameForCustomer, ownerNameLoading } from "./ownerName";

const users = [
  { id: "u1", email: "lukas@ourfuture.biz", displayName: "Lukáš Novák" },
  { id: "u2", email: "info@ourfuture.biz", displayName: "" },
];

describe("ownerNameForCustomer", () => {
  it("names the owner user by their display name, whatever the case of the e-mail", () => {
    expect(ownerNameForCustomer("lukas@ourfuture.biz", users)).toBe("Lukáš Novák");
    expect(ownerNameForCustomer("Lukas@OurFuture.biz", users)).toBe("Lukáš Novák");
  });

  it("gives the e-mail of a user without a display name", () => {
    expect(ownerNameForCustomer("info@ourfuture.biz", users)).toBe("info@ourfuture.biz");
  });

  it("gives an old typed name as it is", () => {
    expect(ownerNameForCustomer(" Austromar ", users)).toBe("Austromar");
    expect(ownerNameForCustomer(undefined, users)).toBe("");
  });

  it("never gives the customer an e-mail in place of a name: somebody who left, or the users not loaded", () => {
    expect(ownerNameForCustomer("karel@ourfuture.biz", users)).toBe("");
    expect(ownerNameForCustomer("lukas@ourfuture.biz", [])).toBe("");
  });
});

describe("ownerNameLoading", () => {
  it("waits for the users only when the owner is recorded by an e-mail", () => {
    expect(ownerNameLoading("lukas@ourfuture.biz", true)).toBe(true);
    expect(ownerNameLoading("lukas@ourfuture.biz", false)).toBe(false);
    expect(ownerNameLoading("Austromar", true)).toBe(false);
    expect(ownerNameLoading("", true)).toBe(false);
  });
});
