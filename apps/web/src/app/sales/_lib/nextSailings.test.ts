import { describe, expect, it } from "vitest";
import { lclServicesFor, namedServiceLabel, nextSailingsEmpty, nextSailingsHidden, servicesProblem, type NextSailingsAnswer } from "./nextSailings";

const service = (id: string, more = {}) => ({ id, name: id, mode: "sea_lcl", direction: "import", closedAt: null as string | null, ...more });
const answer = (more: Partial<NextSailingsAnswer> = {}): NextSailingsAnswer => ({ serviceId: "s1", state: "open", serviceName: "Import from Shanghai", sailings: [{ id: "a" }], ...more });

describe("next sailings on a Sea LCL quote (Council Outlay 14, C7)", () => {
  it("offers the open sea-LCL services, those of the quote's direction first", () => {
    const services = [service("Export to NY", { direction: "export" }), service("Import from Shanghai"), service("Air", { mode: "air" }), service("Closed", { closedAt: "2026-11-01" }), service("Import from Busan")];
    expect(lclServicesFor(services, "Import").map((s) => s.name)).toEqual(["Import from Busan", "Import from Shanghai", "Export to NY"]);
    expect(lclServicesFor(services, undefined).map((s) => s.name)).toEqual(["Export to NY", "Import from Busan", "Import from Shanghai"]);
    // The one the quote names stays in the list, closed or not.
    expect(lclServicesFor(services, "Import", "Closed").map((s) => s.name)).toContain("Closed");
  });

  it("shows the table of the sailings the quote was read with, for the service it names", () => {
    expect(nextSailingsEmpty("s1", answer(), false)).toBeNull();
    // The services to pick from failing does not hide the sailings of the one named.
    expect(nextSailingsEmpty("s1", answer(), true)).toBeNull();
  });

  it("says why it has nothing to show", () => {
    expect(nextSailingsEmpty(undefined, null, false)).toEqual({ text: expect.stringContaining("Pick the Co-Loading service"), alert: false });
    expect(nextSailingsEmpty("s1", answer({ state: "gone", sailings: [] }), false)?.text).toContain("closed or no longer exists");
    expect(nextSailingsEmpty("s1", answer({ sailings: [] }), false)?.text).toContain("no sailing still to come");
  });

  it("shows no sailings of the service named before under a service picked since, until the quote is saved", () => {
    expect(nextSailingsEmpty("s2", answer(), false)).toEqual({ text: "This service's next sailings show once the quote is saved.", alert: false });
    expect(nextSailingsEmpty("s2", null, false)?.text).toContain("once the quote is saved");
  });

  it("says Co-Loading could not be read - not that there are no sailings, nor that the service is closed", () => {
    const note = nextSailingsEmpty("s1", answer({ state: "unavailable", serviceName: "", sailings: [] }), false);
    expect(note).toMatchObject({ alert: true, text: expect.stringContaining("could not be read") });
    expect(note?.text).not.toMatch(/no sailing|closed/);
  });

  it("says the services could not be read, never that the service is closed, when their list fails", () => {
    expect(nextSailingsEmpty(undefined, null, true)).toEqual({ text: expect.stringContaining("The Co-Loading services could not be read"), alert: true });
    expect(servicesProblem("s1", true)).toContain("could not be read");
    expect(servicesProblem("s1", false)).toBeNull();
    expect(servicesProblem(undefined, true)).toBeNull();
    expect(namedServiceLabel("s1", null, true)).toBe("The service this quote names");
  });

  it("is left out only when the quote names no service and the company surely runs none", () => {
    expect(nextSailingsHidden(undefined, 0, false, false)).toBe(true);
    expect(nextSailingsHidden(undefined, 0, false, true)).toBe(false);
    expect(nextSailingsHidden(undefined, 0, true, false)).toBe(false);
    expect(nextSailingsHidden("s1", 0, false, false)).toBe(false);
    expect(nextSailingsHidden(undefined, 2, false, false)).toBe(false);
  });

  it("names a service the picker does not offer by the quote's answer, or as no longer open", () => {
    expect(namedServiceLabel("s1", answer(), false)).toBe("Import from Shanghai");
    expect(namedServiceLabel("s1", answer({ state: "gone", serviceName: "" }), false)).toBe("A service no longer open");
    expect(namedServiceLabel("s2", answer(), false)).toBe("A service no longer open");
  });
});
