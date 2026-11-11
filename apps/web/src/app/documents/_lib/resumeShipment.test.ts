import { describe, expect, it, vi } from "vitest";
import { createAndWrite, type ShipmentProgress } from "./resumeShipment";

const box = () => ({ current: null as ShipmentProgress<string> | null });

describe("a read written into a new shipment", () => {
  it("creates the shipment, then writes the read to it", async () => {
    const progress = box();
    const write = vi.fn(async () => undefined);
    await expect(createAndWrite(progress, async () => "CZ1", write)).resolves.toBe("CZ1");
    expect(write).toHaveBeenCalledWith("CZ1");
    expect(progress.current).toEqual({ shipment: "CZ1", written: true });
  });

  it("writes to the shipment it created when the retry follows a failed write, without creating another", async () => {
    const progress = box();
    const create = vi.fn(async () => "CZ1");
    const write = vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValue(undefined);
    await expect(createAndWrite(progress, create, write)).rejects.toThrow("timeout");
    expect(progress.current).toEqual({ shipment: "CZ1", written: false });
    await expect(createAndWrite(progress, create, write)).resolves.toBe("CZ1");
    expect(create).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("neither creates nor writes again on the retry of a later step (a pre-alert house's link)", async () => {
    const progress = box();
    const create = vi.fn(async () => "CZ1");
    const write = vi.fn(async () => undefined);
    await createAndWrite(progress, create, write);
    await createAndWrite(progress, create, write);
    expect(create).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("creates on the retry when creating failed", async () => {
    const progress = box();
    const create = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue("CZ2");
    await expect(createAndWrite(progress, create, async () => undefined)).rejects.toThrow("offline");
    expect(progress.current).toBeNull();
    await expect(createAndWrite(progress, create, async () => undefined)).resolves.toBe("CZ2");
  });
});
