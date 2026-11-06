import { describe, expect, it } from "vitest";
import { linkEach, linkedCount } from "./MasterJobDialog";

describe("linkEach", () => {
  it("links the others when one is refused, and says how many and why", async () => {
    const refusal = new Error("Only the Person in Charge, Holiday Cover or a manager can change CZE0002");
    const linked: string[] = [];
    const result = await linkEach(["a", "b", "c"], async (id) => {
      if (id === "b") throw refusal;
      linked.push(id);
    });
    expect(linked).toEqual(["a", "c"]);
    expect(result).toEqual({ linked: 2, failed: 1, error: refusal });
  });

  it("has no error when every one links", async () => {
    expect(await linkEach(["a"], async () => undefined)).toEqual({ linked: 1, failed: 0, error: undefined });
  });
});

describe("linkedCount", () => {
  it("counts shipments", () => {
    expect(linkedCount(1)).toBe("1 shipment");
    expect(linkedCount(3)).toBe("3 shipments");
  });
});
