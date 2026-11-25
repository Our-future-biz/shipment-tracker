import { describe, expect, it } from "vitest";
import { hasSection, pickCarried, pickSections } from "./quoteSections";
import type { SalesQuoteData } from "./types";

const SERVICE = "11111111-1111-4111-8111-111111111111";

describe("the Routing section of a quote", () => {
  const source: SalesQuoteData = { origin: "Shanghai", destination: "Praha", pol: "CNSHA", pod: "DEHAM", serviceType: "Sea LCL", coLoadingServiceId: SERVICE };

  it("takes the Co-Loading service picked in Routing with the route: Duplicate keeps it", () => {
    expect(pickSections(source, ["routing"])).toMatchObject({ origin: "Shanghai", pod: "DEHAM", coLoadingServiceId: SERVICE });
    expect(hasSection({ coLoadingServiceId: SERVICE }, "routing")).toBe(true);
  });

  it("copied from a quote without one, leaves none of the old service under the new route", () => {
    const patch = pickSections({ origin: "Busan", pod: "DEHAM" }, ["routing"]);
    expect(patch).toHaveProperty("coLoadingServiceId", undefined);
    expect({ ...source, ...patch }.coLoadingServiceId).toBeUndefined();
  });

  it("copied from a shipment, which names no service, keeps the quote's own", () => {
    expect(pickCarried({ origin: "Busan" }, ["routing"])).not.toHaveProperty("coLoadingServiceId");
  });
});
