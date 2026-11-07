import { describe, expect, it } from "vitest";
import { chosenIds, linkEach, linkedCount, shipmentsOffered } from "./MasterJobDialog";

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

describe("the shipments the dialog lists", () => {
  const ship = (id: string, jobNumber: string, shipper = "") => ({ id, jobNumber, shipper, consignee: "" });
  const all = [ship("a", "CZLCL1", "Acme"), ship("b", "CZLCL2", "Beta"), ship("c", "CZLCL3", "Gamma"), ship("q", "CZQ9", "Acme"), ship("n", "")];

  it("lists only those chosen in the grid", () => {
    expect(shipmentsOffered(all, "", ["a", "c"]).map((s) => s.id)).toEqual(["a", "c"]);
  });

  it("does not let a search bring in others when the shipments were chosen", () => {
    expect(shipmentsOffered(all, "beta", ["a", "c"]).map((s) => s.id)).toEqual(["a", "c"]);
  });

  it("offers every shipment, narrowed by the search, when none were chosen", () => {
    expect(shipmentsOffered(all, "").map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(shipmentsOffered(all, "beta").map((s) => s.id)).toEqual(["b"]);
  });

  it("leaves out a quote's number and a shipment without one, chosen or not", () => {
    expect(shipmentsOffered(all, "", ["q", "n", "a"]).map((s) => s.id)).toEqual(["a"]);
  });

  it("links only what it lists when the grid chose: a ticked quote's number is not linked unseen", () => {
    const listed = shipmentsOffered(all, "", ["q", "a", "b"]);
    expect(chosenIds(["q", "a", "b"], new Set(["b"]), listed)).toEqual(["a"]);
    // picked in the dialog itself: whatever is ticked and may be linked
    expect(chosenIds(["a", "c"], new Set())).toEqual(["a", "c"]);
  });
});
