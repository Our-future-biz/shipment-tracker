import { describe, expect, it, vi } from "vitest";
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { siteFieldsOf, siteKindOf, typesForKind, typesWithoutSite } from "../lib/addressSite";

describe("an address's site", () => {
  it("is used for loading, delivery or both by the address's Pickup and Delivery, and there is none without them", () => {
    expect(siteKindOf(["Pickup"])).toBe("loading");
    expect(siteKindOf(["Registered", "Delivery"])).toBe("delivery");
    expect(siteKindOf(["Registered", "Billing", "Pickup", "Delivery"])).toBe("both");
    expect(siteKindOf(["Registered", "Billing"])).toBeNull();
  });

  it("changes only the address's Pickup / Delivery when its use changes, or when it goes", () => {
    expect(typesForKind(["Registered", "Pickup", "Delivery"], "loading")).toEqual(["Registered", "Pickup"]);
    expect(typesForKind(["Billing"], "both")).toEqual(["Billing", "Pickup", "Delivery"]);
    expect(typesForKind([], "delivery")).toEqual(["Delivery"]);
    expect(typesWithoutSite(["Registered", "Pickup", "Delivery"])).toEqual(["Registered"]);
  });

  it("is named after the address, else its street, and keeps a Czech postcode as 5 digits", () => {
    const address = { types: ["Pickup" as const], label: "", street: " V jame ", city: "Praha 6", postalCode: "160 00", country: "cz" };
    expect(siteFieldsOf(address, "loading")).toEqual({ label: "V jame", kind: "loading", street: "V jame", postcode: "16000", city: "Praha 6", country: "CZ" });
    expect(siteFieldsOf({ ...address, label: "Alza (nakladka)" }, "loading").label).toBe("Alza (nakladka)");
    expect(siteFieldsOf({ ...address, country: "DE", postalCode: " 80333 " }, "both").postcode).toBe("80333");
    expect(() => siteFieldsOf({ ...address, postalCode: "160" }, "loading")).toThrow(/5 digits/);
  });
});
