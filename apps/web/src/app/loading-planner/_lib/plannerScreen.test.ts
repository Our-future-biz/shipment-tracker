import { afterEach, describe, expect, it, vi } from "vitest";
import type { interfaces, lib } from "@/lib/api/client";
import { newDraftLine, type DraftLine } from "./cargoForm";
import { alreadyInPlan, linkAfterSave, newerVersionStep, rememberedUnit, rememberUnit, shipmentLines, shipmentLookup, shipmentWithJobNumber } from "./plannerScreen";

const plan = (more: Partial<interfaces.LoadingPlanItem> = {}): interfaces.LoadingPlanItem => ({
  id: "p1",
  name: "Machines",
  linkKind: "shipment",
  linkId: "s1",
  linkRef: "CZLCL00000053",
  lines: [],
  nominated: null,
  createdBy: "eva@firma.cz",
  updatedBy: "eva@firma.cz",
  createdAt: "2026-11-20T08:00:00.000Z",
  updatedAt: "2026-11-20T08:00:00.000Z",
  linkGone: false,
  ...more,
});

describe("the unit sizes are typed in", () => {
  afterEach(() => vi.unstubAllGlobals());
  const storage = (stored: string | null, fails = false) => ({
    localStorage: {
      getItem: () => {
        if (fails) throw new Error("blocked");
        return stored;
      },
      setItem: () => {
        if (fails) throw new Error("blocked");
      },
    },
  });

  it("is the one remembered, or mm", () => {
    vi.stubGlobal("window", storage("cm"));
    expect(rememberedUnit()).toBe("cm");
    vi.stubGlobal("window", storage("inch"));
    expect(rememberedUnit()).toBe("mm");
    vi.stubGlobal("window", storage(null));
    expect(rememberedUnit()).toBe("mm");
  });

  it("falls back to mm where the browser keeps nothing, and is then simply not remembered", () => {
    vi.stubGlobal("window", storage("m", true));
    expect(rememberedUnit()).toBe("mm");
    expect(() => rememberUnit("m")).not.toThrow();
  });
});

describe("a plan saved", () => {
  const sent = { kind: "shipment" as const, id: "s1", ref: "CZ00000053" };

  it("names its job as the server calls it now", () => {
    expect(linkAfterSave(sent, plan())).toEqual({ kind: "shipment", id: "s1", ref: "CZLCL00000053" });
  });

  it("keeps a link changed while the save was on its way", () => {
    // Unlinked meanwhile: the plan stays unlinked, still to be saved.
    expect(linkAfterSave(null, plan())).toBeNull();
    // Linked to another job meanwhile.
    const other = { kind: "quote" as const, id: "q9", ref: "QCZ00000012" };
    expect(linkAfterSave(other, plan())).toBe(other);
    expect(linkAfterSave({ ...sent, id: "s2" }, plan())).toEqual({ ...sent, id: "s2" });
    // Linked while a plan without a link was being saved.
    expect(linkAfterSave(sent, plan({ linkKind: null, linkId: null, linkRef: "" }))).toBe(sent);
  });
});

describe("a newer version of the plan", () => {
  const opened = plan();
  const later = plan({ updatedAt: "2026-11-20T09:30:00.000Z", updatedBy: "jan@firma.cz" });

  it("is taken over at once while nothing is unsaved, and offered while something is", () => {
    expect(newerVersionStep(later, opened, false)).toBe("adopt");
    expect(newerVersionStep(later, opened, true)).toBe("offer");
  });

  it("is no news when it is the version on screen or an older one", () => {
    expect(newerVersionStep(opened, opened, true)).toBeNull();
    expect(newerVersionStep(opened, later, false)).toBeNull();
    expect(newerVersionStep(null, opened, false)).toBeNull();
    expect(newerVersionStep(later, null, false)).toBeNull();
  });
});

describe("cargo read twice", () => {
  const read = (more: Partial<lib.CargoLineRead> = {}): lib.CargoLineRead => ({ name: "Case", lengthMm: 2500, widthMm: 1200, heightMm: 1800, weightKg: 950, colli: 2, stackable: null, note: "", ...more });
  const have: DraftLine[] = [{ ...newDraftLine("a"), name: " case ", lengthMm: 2500, widthMm: 1200, heightMm: 1800, weightKg: 950, colli: 2 }];

  it("is pointed out when its name and every figure are already in the plan", () => {
    expect(alreadyInPlan(read(), have)).toBe(true);
    expect(alreadyInPlan(read({ weightKg: 900 }), have)).toBe(false);
    expect(alreadyInPlan(read({ colli: 3 }), have)).toBe(false);
    expect(alreadyInPlan(read({ name: "Crate" }), have)).toBe(false);
    expect(alreadyInPlan(read(), [])).toBe(false);
  });

  it("is not pointed out while a figure is missing", () => {
    const unfinished: DraftLine[] = [{ ...have[0]!, weightKg: null }];
    expect(alreadyInPlan(read({ weightKg: null }), unfinished)).toBe(false);
  });
});

describe("the shipment a plan is linked to", () => {
  const id = "0b7c2e1a-1111-4111-8111-111111111111";
  const row = (more: Partial<interfaces.CargoDimensionLine> = {}): interfaces.CargoDimensionLine => ({
    pieces: "4",
    lengthCm: "120",
    widthCm: "80",
    heightCm: "100",
    weightPerPcKg: "400",
    packageType: "Pallet",
    stackable: "",
    ...more,
  });
  let n = 0;
  const newId = () => `id-${++n}`;

  it("is looked up by its id, or by the job number typed", () => {
    expect(shipmentLookup(id)).toEqual({ id });
    expect(shipmentLookup(" CZ00000053 ")).toEqual({ jobNumber: "CZ00000053" });
  });

  it("is the one the search found under that number, whatever letters it carries now", () => {
    const found = [{ id: "a", jobNumber: "CZLCL00000530" }, { id: "b", jobNumber: "CZLCL00000053" }, { id: "c", jobNumber: null }];
    expect(shipmentWithJobNumber(found, "CZ00000053")?.id).toBe("b");
    expect(shipmentWithJobNumber(found, "CZ00000054")).toBeUndefined();
  });

  it("gives its own Dimensions rows, or else the ones booked with its quote", () => {
    const own = [row()];
    const booked = [row({ packageType: "Crate", pieces: "1" })];
    expect(shipmentLines({ cargoDimensions: own, bookedDimensions: booked }, newId).map((l) => l.name)).toEqual(["Pallet"]);
    expect(shipmentLines({ cargoDimensions: [], bookedDimensions: booked }, newId).map((l) => l.name)).toEqual(["Crate"]);
    expect(shipmentLines({ cargoDimensions: null, bookedDimensions: booked }, newId).map((l) => l.name)).toEqual(["Crate"]);
    // Own rows with nothing in them count as none.
    expect(shipmentLines({ cargoDimensions: [row({ pieces: "", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "", packageType: "" })], bookedDimensions: booked }, newId)).toHaveLength(1);
    expect(shipmentLines({ cargoDimensions: null, bookedDimensions: [] }, newId)).toEqual([]);
  });
});
