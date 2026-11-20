import { describe, expect, it } from "vitest";
import { CONCEPT_TRUCK_TYPE, filledPickupRows, pickupHome } from "./pickupHome";

const position = { taskId: "WCZ2026000001", type: "LCL consolidation" };
const truck = { taskId: "TCZ2026000004", type: CONCEPT_TRUCK_TYPE };

describe("pickupHome — which pick-up the job's Warehouse tab keeps (Q17, per job)", () => {
  it("keeps the normal pick-up for a user who can't see the Concept, whatever the job is", () => {
    expect(pickupHome({ canSeeConcept: false, isLoading: false, isError: false, positions: [position] })).toEqual({ kind: "basic", checkFailed: false });
    expect(pickupHome({ canSeeConcept: false, isLoading: true, isError: true, positions: [] })).toEqual({ kind: "basic", checkFailed: false });
  });

  it("offers neither pick-up while it still asks the Concept", () => {
    expect(pickupHome({ canSeeConcept: true, isLoading: true, isError: false, positions: undefined })).toEqual({ kind: "checking" });
  });

  it("makes the Concept's pick-up the live one for a job that is a position", () => {
    expect(pickupHome({ canSeeConcept: true, isLoading: false, isError: false, positions: [position] })).toEqual({ kind: "concept", positionRef: "WCZ2026000001" });
  });

  it("keeps the normal pick-up for a job with no position — a truck reference is not one", () => {
    expect(pickupHome({ canSeeConcept: true, isLoading: false, isError: false, positions: [] })).toEqual({ kind: "basic", checkFailed: false });
    expect(pickupHome({ canSeeConcept: true, isLoading: false, isError: false, positions: [truck] })).toEqual({ kind: "basic", checkFailed: false });
    expect(pickupHome({ canSeeConcept: true, isLoading: false, isError: false, positions: [truck, position] })).toEqual({ kind: "concept", positionRef: "WCZ2026000001" });
  });

  it("keeps the normal pick-up, with a note, when the Concept could not be asked", () => {
    expect(pickupHome({ canSeeConcept: true, isLoading: false, isError: true, positions: undefined })).toEqual({ kind: "basic", checkFailed: true });
  });

  it("decides from positions already read when a later refetch fails (no editable old pick-up again)", () => {
    expect(pickupHome({ canSeeConcept: true, isLoading: false, isError: true, positions: [position] })).toEqual({ kind: "concept", positionRef: "WCZ2026000001" });
    expect(pickupHome({ canSeeConcept: true, isLoading: false, isError: true, positions: [] })).toEqual({ kind: "basic", checkFailed: false });
  });

  it("keeps the normal pick-up when nothing is asked yet (no shipment id)", () => {
    expect(pickupHome({ canSeeConcept: true, isLoading: false, isError: false, positions: undefined })).toEqual({ kind: "basic", checkFailed: false });
  });
});

describe("filledPickupRows — the normal pick-up shown read-only", () => {
  it("keeps rows that hold anything, as text", () => {
    const json = JSON.stringify([
      { haulier: "Haulier s.r.o.", licensePlate: "1AB 2345", driver: "Jan Novak" },
      { haulier: "", licensePlate: " ", driver: "" },
      { haulier: "Only a haulier", licensePlate: 12 },
    ]);
    expect(filledPickupRows(json)).toEqual([
      { haulier: "Haulier s.r.o.", licensePlate: "1AB 2345", driver: "Jan Novak" },
      { haulier: "Only a haulier", licensePlate: "", driver: "" },
    ]);
  });

  it("reads nothing from an empty, broken or non-list value", () => {
    expect(filledPickupRows(undefined)).toEqual([]);
    expect(filledPickupRows("")).toEqual([]);
    expect(filledPickupRows("{not json")).toEqual([]);
    expect(filledPickupRows(JSON.stringify({ haulier: "x" }))).toEqual([]);
    expect(filledPickupRows(JSON.stringify([null, "x"]))).toEqual([]);
  });
});
