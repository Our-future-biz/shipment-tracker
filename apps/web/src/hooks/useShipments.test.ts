import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { refreshShipmentCopies } from "./useShipments";

afterEach(() => {
  vi.useRealTimers();
});

describe("refreshShipmentCopies", () => {
  it("marks the shipments stale at once and reads the shown ones again once the server has rewritten them", () => {
    vi.useFakeTimers();
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();

    refreshShipmentCopies(queryClient, 1000);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["shipments"], refetchType: "none" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["customer-shipments"], refetchType: "none" });
    const marked = invalidate.mock.calls.length;

    vi.advanceTimersByTime(999);
    expect(invalidate).toHaveBeenCalledTimes(marked);
    vi.advanceTimersByTime(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["shipments"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["customer-shipments"] });
    expect(invalidate).toHaveBeenCalledTimes(marked * 2);
  });
});
