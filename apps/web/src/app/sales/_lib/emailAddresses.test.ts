import { describe, expect, it } from "vitest";
import { invalidAddress, splitAddresses, usedAddresses, withAddress } from "./emailAddresses";

describe("email address fields", () => {
  it("hold one address or several", () => {
    expect(splitAddresses(" a@x.cz; b@x.cz ,, ")).toEqual(["a@x.cz", "b@x.cz"]);
    expect(splitAddresses(undefined)).toEqual([]);
  });

  it("name the first entry that is no address", () => {
    expect(invalidAddress("a@x.cz, b@x")).toBe("b@x");
    expect(invalidAddress("a@x.cz; b@x.cz")).toBeNull();
    expect(invalidAddress("")).toBeNull();
  });

  it("take an address picked from a list after the ones they hold, once", () => {
    expect(withAddress("", "a@x.cz")).toBe("a@x.cz");
    expect(withAddress("a@x.cz", "b@x.cz")).toBe("a@x.cz, b@x.cz");
    expect(withAddress("a@x.cz; B@x.cz", "b@X.cz")).toBe("a@x.cz, B@x.cz");
  });

  it("give every address used, each once", () => {
    expect(usedAddresses({ to: "a@x.cz", cc: "b@x.cz, A@x.cz", bcc: "c@x.cz; nope" })).toEqual(["a@x.cz", "b@x.cz", "c@x.cz"]);
  });
});
