import { describe, expect, it, vi } from "vitest";
import type { ShipmentItem } from "@/hooks/useShipments";
import type { CargoDimensionLine } from "@/lib/cargo";
import { dialogLines, linesChangedMeanwhile, saveDialogLines } from "./DimensionsModal";

// The grid's Dimensions dialog saves its lines held to the lines it opened with, as Cargo Details
// does (mock test council Y10): before, it sent them unguarded and wrote a dialog's old lines back
// over a colleague's save or an accepted remeasurement.

const line = (over: Partial<CargoDimensionLine> = {}): CargoDimensionLine => ({
  containerId: null,
  pieces: "2",
  lengthCm: "120",
  widthCm: "80",
  heightCm: "100",
  weightPerPcKg: "300",
  volumePerPcM3: "",
  packageType: "",
  stackable: "",
  ...over,
});
const shipment = (over: Partial<ShipmentItem> = {}) => ({ id: "s1", freightMode: "Sea Freight", containers: [], cargoDimensions: [line()], ...over }) as unknown as ShipmentItem;
const refusal = (code: string) => Object.assign(new Error("Cargo Details changed meanwhile: they are shown again - make your change again"), { code });

describe("dialogLines", () => {
  it("shows the saved lines, all on the only container, and an empty line for a container that has none", () => {
    const one = shipment({ containers: [{ id: "c1" }] as never, cargoDimensions: [line({ containerId: "gone" })] });
    expect(dialogLines(one, false).map((l) => l.containerId)).toEqual(["c1"]);
    const two = shipment({ containers: [{ id: "c1" }, { id: "c2" }] as never, cargoDimensions: [line({ containerId: "c1" })] });
    expect(dialogLines(two, false).map((l) => [l.containerId, l.pieces])).toEqual([["c1", "2"], ["c2", ""]]);
    // Read-only: only the saved lines.
    expect(dialogLines(two, true)).toHaveLength(1);
  });

  it("shows a line typed in inches in inches", () => {
    expect(dialogLines(shipment({ cargoDimensions: [line({ lengthCm: "111.76", dimensionUnit: "in" })] }), true)[0]!.lengthCm).toBe("44");
  });
});

describe("linesChangedMeanwhile", () => {
  it("is the server's refusal of lines changed meanwhile (code aborted), nothing else", () => {
    expect(linesChangedMeanwhile(refusal("aborted"))).toBe(true);
    expect(linesChangedMeanwhile(refusal("invalid_argument"))).toBe(false);
    expect(linesChangedMeanwhile(new Error("offline"))).toBe(false);
    expect(linesChangedMeanwhile(null)).toBe(false);
  });
});

describe("saveDialogLines", () => {
  const opened = [line()];
  const typed = [line({ pieces: "3" })];

  it("sends the lines with the lines the dialog opened with", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    expect(await saveDialogLines(shipment(), typed, opened, onSave, undefined)).toEqual({ outcome: "saved" });
    expect(onSave).toHaveBeenCalledExactlyOnceWith(shipment(), typed, opened);
  });

  it("refused as changed meanwhile, reads the shipment again so the dialog shows its lines as saved", async () => {
    const fresh = shipment({ cargoDimensions: [line({ pieces: "5" })] });
    const reload = vi.fn().mockResolvedValue(fresh);
    const out = await saveDialogLines(shipment(), typed, opened, () => Promise.reject(refusal("aborted")), reload);
    expect(out).toEqual({ outcome: "reloaded", shipment: fresh });
    expect(reload).toHaveBeenCalledExactlyOnceWith(shipment());
  });

  it("says when the shipment could not be read again", async () => {
    const out = await saveDialogLines(shipment(), typed, opened, () => Promise.reject(refusal("aborted")), () => Promise.reject(new Error("offline")));
    expect(out).toEqual({ outcome: "unread" });
  });

  it("throws any other failure on, and reads nothing again", async () => {
    const reload = vi.fn();
    const failure = refusal("permission_denied");
    await expect(saveDialogLines(shipment(), typed, opened, () => Promise.reject(failure), reload)).rejects.toBe(failure);
    expect(reload).not.toHaveBeenCalled();
  });
});
