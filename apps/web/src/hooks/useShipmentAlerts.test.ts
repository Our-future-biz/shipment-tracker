import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { alertReadKey, markReadOptions } from "./useShipmentAlerts";

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
