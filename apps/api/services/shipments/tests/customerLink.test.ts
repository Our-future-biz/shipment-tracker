import { describe, expect, it } from "vitest";
import { customerLinkUrl, hashLinkToken, linkMayOpen, linkOpenUntil, looksLikeLinkToken, newLinkToken, publicStatusOf } from "../lib/customerLink";
import type { TrackingMilestone } from "../interfaces/interfaces";

const job = { status: "Arrived [IMP]", actualDeliveryDate: null as string | null };
const milestone = (over: Partial<TrackingMilestone> = {}) =>
  ({
    key: "arrived",
    label: "Arrived",
    basis: "ETA / ATA",
    leg: "main",
    place: "Hamburg",
    planned: "2026-11-10",
    plannedTime: "",
    actual: null,
    actualTime: "",
    wasPlanned: "2026-11-01",
    movedDays: 9,
    lateDays: 3,
    detail: "",
    containerNumber: "",
    state: "open",
    taxDate: true,
    recorded: { by: "jana@firma.cz", source: "Person", at: "2026-11-01T10:00:00Z" },
    proposed: { day: "2026-11-09", source: "Document read" },
    ...over,
  }) as unknown as TrackingMilestone;
const shipment = { jobNumber: "CZFCL1", customerReference: "PO-7", tradeDirection: "Import", freightMode: "Sea Freight", pol: "Shanghai", pod: "Hamburg", vessel: "EVER TEST", voyage: "123E" };

describe("the token", () => {
  it("is long, random, and only its hash is kept", () => {
    const a = newLinkToken();
    expect(looksLikeLinkToken(a.token)).toBe(true);
    expect(a.hash).toBe(hashLinkToken(a.token));
    expect(a.hash).not.toContain(a.token);
    expect(newLinkToken().token).not.toBe(a.token);
  });
  it("turns away anything of another shape", () => {
    expect(looksLikeLinkToken("short")).toBe(false);
    expect(looksLikeLinkToken(`${"a".repeat(42)}/`)).toBe(false);
    expect(looksLikeLinkToken(undefined)).toBe(false);
  });
  it("makes a page address", () => {
    expect(customerLinkUrl("https://app.test/", "abc")).toBe("https://app.test/track/abc");
  });
});

describe("how long a link opens", () => {
  it("stays open until 30 days after the delivery", () => {
    expect(linkOpenUntil(null)).toBeNull();
    expect(linkOpenUntil("2026-11-01")).toBe("2026-12-01");
    expect(linkMayOpen(job, "2030-01-01")).toBe(true);
    expect(linkMayOpen({ ...job, actualDeliveryDate: "2026-11-01" }, "2026-12-01")).toBe(true);
    expect(linkMayOpen({ ...job, actualDeliveryDate: "2026-11-01" }, "2026-12-02")).toBe(false);
  });
  it("closes on a cancelled job", () => {
    expect(linkMayOpen({ ...job, status: "Cancelled Shipment" }, "2026-11-01")).toBe(false);
  });
});

describe("what a customer sees", () => {
  const status = publicStatusOf({ ...shipment, internalNote: "margin 40%" } as typeof shipment, [milestone()], ["CSQU3054383"], "Our Firm s.r.o.", new Date("2026-11-06T12:00:00Z"));

  it("shows the job's route and dates", () => {
    expect(status).toMatchObject({ ourCompany: "Our Firm s.r.o.", reference: "CZFCL1", customerReference: "PO-7", pol: "Shanghai", pod: "Hamburg", vessel: "EVER TEST 123E", containers: ["CSQU3054383"] });
    expect(status.milestones[0]).toEqual({ key: "arrived", label: "Arrived", leg: "main", place: "Hamburg", planned: "2026-11-10", actual: null, detail: "", state: "open" });
  });

  it("lets out no name, mark, proposal or unnamed field", () => {
    const text = JSON.stringify(status);
    for (const inner of ["jana@firma.cz", "Document read", "2026-11-09", "2026-11-01", "margin", "taxDate", "lateDays", "recorded", "proposed"]) expect(text).not.toContain(inner);
  });

  it("shows a late step as the next one", () => {
    expect(publicStatusOf(shipment, [milestone({ state: "late" })], [], "", new Date()).milestones[0]!.state).toBe("next");
  });

  it("keeps a detail only on the customs row: others can hold a person's note", () => {
    const rows = publicStatusOf(shipment, [milestone({ key: "pod", detail: "Left with the guard, ring Jana" }), milestone({ key: "customs", detail: "Under Customs Clearance" })], [], "", new Date()).milestones;
    expect(rows.map((r) => r.detail)).toEqual(["", "Under Customs Clearance"]);
  });
});
