import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { refreshShipmentCopies, relinkCargo } from "./useShipments";

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

describe("relinkCargo", () => {
  const line = (containerId: string | null) => ({ containerId, cargoDescription: containerId ?? "loose" });

  it("drops the lines of a container removed from several", () => {
    expect(relinkCargo([line("a"), line("b"), line(null)], [{ id: "a" }, { id: "b" }], [{ id: "a" }, { id: "c" }])).toEqual([line("a"), line(null)]);
  });
  it("gives every line to the one container left", () => {
    expect(relinkCargo([line("a"), line(null)], [{ id: "a" }, { id: "b" }], [{ id: "a" }])).toEqual([line("a"), { ...line(null), containerId: "a" }]);
  });
  it("keeps the cargo of the only container: on its replacement, or without a container", () => {
    expect(relinkCargo([line("a")], [{ id: "a" }], [{ id: "x" }])).toEqual([{ ...line("a"), containerId: "x" }]);
    expect(relinkCargo([line("a")], [{ id: "a" }], [{ id: "x" }, { id: "y" }])).toEqual([{ ...line("a"), containerId: null }]);
    expect(relinkCargo([line("a")], [{ id: "a" }], [])).toEqual([{ ...line("a"), containerId: null }]);
  });
  it("leaves the lines alone when the only container stays and another is added", () => {
    const lines = [line("a"), line(null)];
    expect(relinkCargo(lines, [{ id: "a" }], [{ id: "a" }, { id: "b" }])).toEqual(lines);
  });
});
