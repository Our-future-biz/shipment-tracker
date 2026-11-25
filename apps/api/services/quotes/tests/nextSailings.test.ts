import { describe, expect, it } from "vitest";
import { coLoadingServiceOf, nextSailingsAnswer, nextSailingsUnavailable } from "../lib/nextSailings";

const SERVICE = "11111111-1111-4111-8111-111111111111";

describe("the Co-Loading service a quote names (Council Outlay 14, C7)", () => {
  it("is the service a Sea LCL quote names", () => {
    expect(coLoadingServiceOf({ serviceType: "Sea LCL", coLoadingServiceId: SERVICE })).toBe(SERVICE);
  });

  it("is none for any other quote, for a quote that names none, and for a pick that is no id", () => {
    expect(coLoadingServiceOf({ serviceType: "Sea FCL", coLoadingServiceId: SERVICE })).toBeNull();
    expect(coLoadingServiceOf({ serviceType: "Sea LCL" })).toBeNull();
    expect(coLoadingServiceOf({ serviceType: "Sea LCL", coLoadingServiceId: "Import from Shanghai" })).toBeNull();
    expect(coLoadingServiceOf(null)).toBeNull();
    expect(coLoadingServiceOf([])).toBeNull();
  });
});

describe("the next sailings a quote carries", () => {
  it("are the open service's, with its name", () => {
    const sailings = [{ id: "a" }] as never;
    expect(nextSailingsAnswer(SERVICE, { open: true, name: "Import from Shanghai", sailings })).toEqual({ serviceId: SERVICE, state: "open", serviceName: "Import from Shanghai", sailings });
  });

  it("are none of a service that is closed or gone, and say so", () => {
    expect(nextSailingsAnswer(SERVICE, { open: false, name: "", sailings: [] })).toEqual({ serviceId: SERVICE, state: "gone", serviceName: "", sailings: [] });
  });

  it("say Co-Loading could not be read - not that there are none - when it did not answer", () => {
    expect(nextSailingsUnavailable(SERVICE)).toEqual({ serviceId: SERVICE, state: "unavailable", serviceName: "", sailings: [] });
  });
});
