import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { alertReadKey, markReadOptions, newAlertCount, remeasureSettled, shipmentAlerts } from "./useShipmentAlerts";
import type { AttachmentItem } from "@/hooks/useShipmentAttachments";

vi.mock("@/lib/api", () => ({ api: { shipments: { alertMarkRead: vi.fn(async () => ({ ok: true })) } } }));

describe("markReadOptions", () => {
  const client = () => ({ setQueryData: vi.fn(), invalidateQueries: vi.fn(async () => undefined) });

  it("takes the badge off at once, before the server has answered", () => {
    const qc = client();
    markReadOptions(qc as unknown as QueryClient, "s1").onMutate();
    expect(qc.setQueryData).toHaveBeenCalledWith(alertReadKey("s1"), { readAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) });
  });

  it("reads the server's answer back only once the call took - a failed one leaves the badge off, so the tab does not ask again at once", () => {
    const qc = client();
    const options = markReadOptions(qc as unknown as QueryClient, "s1");
    expect(options).not.toHaveProperty("onSettled");
    expect(options).not.toHaveProperty("onError");
    options.onSuccess();
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: alertReadKey("s1") });
  });
});

describe("shipmentAlerts", () => {
  const doc = (id: string, customsStatus: string, customsReviewedAt: string | null) => ({ id, customsStatus, customsReviewedAt }) as unknown as AttachmentItem;

  it("lists what customs declined, newest first", () => {
    const alerts = shipmentAlerts([doc("a", "declined", "2026-11-06T08:00:00Z"), doc("b", "declined", "2026-11-06T09:00:00Z")]);
    expect(alerts.map((d) => d.id)).toEqual(["b", "a"]);
  });

  it("leaves out an approved document, and one not reviewed", () => {
    const alerts = shipmentAlerts([doc("ok", "approved", "2026-11-06T08:00:00Z"), doc("new", "", null), doc("no", "declined", "2026-11-06T07:00:00Z")]);
    expect(alerts.map((d) => d.id)).toEqual(["no"]);
  });
});

// Council finding K3: a remeasurement accepted since, or matched by Cargo Details now, is no new alert.
describe("newAlertCount", () => {
  const informed = (informedAt: string, over: { acceptedAt?: string | null; nowMatches?: boolean } = {}) => ({ informedAt, acceptedAt: null, nowMatches: false, ...over });

  it("counts what came since the Alerts were last opened, a settled remeasurement not", () => {
    const declined = [{ customsReviewedAt: "2026-11-18T08:00:00Z" }];
    const remeasured = [
      informed("2026-11-18T09:00:00Z"),
      informed("2026-11-18T10:00:00Z", { acceptedAt: "2026-11-18T11:00:00Z" }),
      informed("2026-11-18T10:30:00Z", { nowMatches: true }),
      informed("2026-11-17T09:00:00Z"),
    ];
    expect(newAlertCount(declined, remeasured, null)).toBe(3);
    expect(newAlertCount(declined, remeasured, "2026-11-18T08:30:00Z")).toBe(1);
  });

  it("says when one is settled", () => {
    expect(remeasureSettled(informed("x", { acceptedAt: "2026-11-18T11:00:00Z" }))).toBe(true);
    expect(remeasureSettled(informed("x", { nowMatches: true }))).toBe(true);
    expect(remeasureSettled(informed("x"))).toBe(false);
  });
});
