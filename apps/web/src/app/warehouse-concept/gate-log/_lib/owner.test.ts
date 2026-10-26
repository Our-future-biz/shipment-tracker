import { describe, expect, it } from "vitest";
import { NOTIFY_OPS_HINT, shipmentOwnerHint, shipmentOwnerOf } from "./owner";

describe("shipment owner", () => {
  it("reads the old walk-in placeholder as nobody and keeps anything else", () => {
    expect(shipmentOwnerOf(NOTIFY_OPS_HINT)).toBe("");
    expect(shipmentOwnerOf("lukas.novak@example.cz")).toBe("lukas.novak@example.cz");
    expect(shipmentOwnerOf("Lukáš")).toBe("Lukáš");
    expect(shipmentOwnerOf(null)).toBe("");
  });

  it("hints that ops name the owner of an unlinked record", () => {
    expect(shipmentOwnerHint({ warehouseTaskId: null })).toBe(NOTIFY_OPS_HINT);
    expect(shipmentOwnerHint({ warehouseTaskId: "t1" })).toBe("—");
  });
});
