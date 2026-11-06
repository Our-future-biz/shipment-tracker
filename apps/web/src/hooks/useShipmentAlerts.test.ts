import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { alertReadKey, markReadOptions, shipmentAlerts } from "./useShipmentAlerts";
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
