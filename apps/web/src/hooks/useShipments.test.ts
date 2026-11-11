import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { invalidateAfterMasterJobLink, invalidateAfterShipmentUpdate, refreshShipmentCopies, relinkCargo } from "./useShipments";

/** The keys a write marked stale, as the query client was asked. */
function invalidatedBy(write: (queryClient: QueryClient) => unknown): unknown[] {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
  write(queryClient);
  return invalidate.mock.calls.map(([filters]) => filters?.queryKey);
}

describe("what a shipment write leaves stale", () => {
  it("an edit: the Invoicing queue too, which lists the jobs with their status, customer and dates", () => {
    const keys = invalidatedBy((queryClient) => invalidateAfterShipmentUpdate(queryClient, { status: "Arrived [IMP]" }));
    expect(keys).toEqual(expect.arrayContaining([["shipments"], ["invoice-queue"]]));
    // the master jobs only when the containers change
    expect(keys).not.toContainEqual(["master-jobs"]);
    expect(invalidatedBy((queryClient) => invalidateAfterShipmentUpdate(queryClient, { containers: [] }))).toContainEqual(["master-jobs"]);
  });

  it("a link to a master job or off one: the master jobs' list, houses and tracking, with the shipments", () => {
    expect(invalidatedBy(invalidateAfterMasterJobLink)).toEqual(expect.arrayContaining([["shipments"], ["master-jobs"], ["master-job-tracking"]]));
  });
});

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
