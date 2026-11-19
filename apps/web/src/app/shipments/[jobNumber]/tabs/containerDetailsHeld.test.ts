import { describe, expect, it } from "vitest";
import type { ContainerLine } from "@/lib/cargo";
import { heldContainers } from "./ContainerDetailsTab";

// Review: a Container Details page opened before an accepted remeasurement (the only container 20 pcs
// / 300 kg then, 18 / 250 / 34.65 since) kept its rows while a seal was typed, and the seal's save
// wrote 20 / 300 back. Its saves are held to the containers its rows were drawn from - never to
// fresher ones it did not show, which its old rows would pass.

const box = (packages: string, grossWeight: string): ContainerLine => ({
  id: "c1",
  containerNumber: "MSKU1234567",
  sealNumber: "",
  type: "40' HC",
  teu: "2",
  packages,
  packageType: "Pallet(s)",
  grossWeight,
  volume: "",
});
const drawn = [box("20", "300")];
const accepted = [box("18", "250")];

describe("heldContainers", () => {
  it("keeps the containers drawn while the rows are not drawn again (a row open)", () => {
    expect(heldContainers(drawn, accepted, { redraw: false })).toBe(drawn);
  });

  it("takes the server's containers once the rows are drawn from them", () => {
    expect(heldContainers(drawn, accepted, { redraw: true })).toBe(accepted);
  });
});
