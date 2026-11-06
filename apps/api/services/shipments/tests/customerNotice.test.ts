import { describe, expect, it } from "vitest";
import { communicationLogText, isNoticeChannel, isNoticeKind, LOGGED_NOTICE_KINDS, noteTypeOf, toldDifferences } from "../lib/customerNotice";

const told = { etaPod: "2026-10-09", etaWarehouse: "2026-10-12", plannedDelivery: "2026-10-14" };
const now = (over = {}) => ({ estimatedArrival: "2026-10-09", actualArrival: null, etaWarehouse: "2026-10-12", warehouseReceivedDate: null, plannedDeliveryDate: "2026-10-14", actualDeliveryDate: null, ...over });

describe("where the dates moved from what was told", () => {
  it("finds nothing while they stand", () => {
    expect(toldDifferences(told, now())).toEqual([]);
  });

  it("names each date that moved, with what was told and what it is now", () => {
    expect(toldDifferences(told, now({ estimatedArrival: "2026-10-16", plannedDeliveryDate: "2026-10-22" }))).toEqual([
      { what: "ETA", field: "estimatedArrival", told: "2026-10-09", now: "2026-10-16" },
      { what: "Delivery", field: "plannedDeliveryDate", told: "2026-10-14", now: "2026-10-22" },
    ]);
  });

  it("counts a date taken away", () => {
    expect(toldDifferences(told, now({ etaWarehouse: null }))).toMatchObject([{ what: "ETA warehouse", now: null }]);
  });

  it("only counts what was told", () => {
    expect(toldDifferences({ etaPod: "2026-10-09", etaWarehouse: null, plannedDelivery: null }, now({ etaWarehouse: "2026-11-01", plannedDeliveryDate: "2026-11-02" }))).toEqual([]);
  });

  it("drops a plan once the real date is known", () => {
    expect(toldDifferences(told, now({ estimatedArrival: "2026-10-16", actualArrival: "2026-10-16" }))).toEqual([]);
    expect(toldDifferences(told, now({ etaWarehouse: "2026-10-20", warehouseReceivedDate: "2026-10-20" }))).toEqual([]);
    expect(toldDifferences(told, now({ plannedDeliveryDate: "2026-10-22", actualDeliveryDate: "2026-10-22" }))).toEqual([]);
  });
});

describe("the Communication log", () => {
  it("takes only what matters to sales", () => {
    expect([...LOGGED_NOTICE_KINDS].sort()).toEqual(["arrival_notice", "eta_change", "pod_sent"]);
  });

  it("gets one readable line", () => {
    expect(communicationLogText("eta_change", "CZ42", "jana@alza.cz", { etaPod: "2026-10-16", etaWarehouse: null, plannedDelivery: "2026-10-22" })).toBe(
      "ETA change for job CZ42 · to jana@alza.cz · ETA 16.10.2026, delivery 22.10.2026",
    );
    expect(communicationLogText("pod_sent", "CZ42", "", { etaPod: null, etaWarehouse: null, plannedDelivery: null })).toBe("POD sent for job CZ42");
  });

  it("files it by how they were told", () => {
    expect(noteTypeOf("email")).toBe("Email");
    expect(noteTypeOf("phone")).toBe("Call");
    expect(noteTypeOf("other")).toBe("Note");
  });
});

describe("kinds and channels", () => {
  it("are checked", () => {
    expect(isNoticeKind("arrival_notice")).toBe(true);
    expect(isNoticeKind("constructor")).toBe(false);
    expect(isNoticeChannel("phone")).toBe(true);
    expect(isNoticeChannel("pigeon")).toBe(false);
  });
});
