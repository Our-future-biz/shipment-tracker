import { describe, expect, it } from "vitest";
import { APIError, ErrCode } from "@/lib/api";
import { houseRefusedAsMade, housesMadeAlready, housesMasterBol, housesMasterBolShown, madeAlreadyNumbers, masterBolToFile } from "./preAlertMadeAlready";

// X6: read again, the pre-alert's houses showed as new and HBLTEST-A1 was created twice.
describe("a pre-alert read again", () => {
  const A1 = { id: "s1", number: "CZLCL00000134" };

  it("keeps each house's shipment made already in step with the houses read, none for a server that sends none", () => {
    expect(housesMadeAlready({ shipments: [{}, {}, {}], existing: [A1, null, null] })).toEqual([A1, null, null]);
    expect(housesMadeAlready({ shipments: [{}, {}], existing: undefined })).toEqual([null, null]);
  });

  it("reads the shipment a refused create names (409 with its id and job number), nothing from any other failure", () => {
    const refused = new APIError(409, { code: ErrCode.AlreadyExists, message: "House B/L HBLTEST-A1 is already on shipment CZLCL00000134, so it is not created again", details: { shipmentId: "s1", jobNumber: "CZLCL00000134" } });
    expect(houseRefusedAsMade(refused)).toEqual(A1);
    expect(houseRefusedAsMade(new APIError(409, { code: ErrCode.AlreadyExists, message: "taken" }))).toBeNull();
    expect(houseRefusedAsMade(new APIError(400, { code: ErrCode.InvalidArgument, message: "bad", details: { shipmentId: "s1", jobNumber: "x" } }))).toBeNull();
    expect(houseRefusedAsMade(new Error("offline"))).toBeNull();
  });

  it("lists the jobs made before once each, for the done screen", () => {
    expect(madeAlreadyNumbers([A1, null, { id: "s2", number: "CZLCL00000135" }, A1])).toEqual(["CZLCL00000134", "CZLCL00000135"]);
    expect(madeAlreadyNumbers([null])).toEqual([]);
  });

  it("asks for the master job of the Master B/L only when it is read and ticked to be filed", () => {
    const info = { "Master BoL Number": " HLCUX6TEST001 ", Vessel: "X" };
    expect(masterBolToFile(info, { "Master BoL Number": true })).toBe("HLCUX6TEST001");
    expect(masterBolToFile(info, { "Master BoL Number": false })).toBe("");
    expect(masterBolToFile(null, { "Master BoL Number": true })).toBe("");
  });

  // Mock test run F3: a manifest and House B/Ls with no Master B/L page made a master job without its B/L.
  it("asks for the Master B/L the houses agree on when none was read, but not over one read and unticked", () => {
    const houses: Record<string, string>[] = [{ "Master BoL Number": " MEDU123 " }, { "Master BoL Number": "medu-123" }, {}];
    expect(masterBolToFile(null, {}, houses)).toBe("MEDU123");
    expect(masterBolToFile({ Vessel: "X", "Master BoL Number": " " }, {}, houses)).toBe("MEDU123");
    expect(masterBolToFile(null, {}, [{ "Master BoL Number": "MEDU123" }, { "Master BoL Number": "MEDU999" }])).toBe("");
    expect(masterBolToFile(null, {}, [{}])).toBe("");
    expect(masterBolToFile({ "Master BoL Number": "HLCUX6TEST001" }, { "Master BoL Number": false }, houses)).toBe("");
    expect(housesMasterBol([])).toBe("");
  });

  // Mock test run F3, m1: the houses' Master B/L was filed, and its master job taken, unseen.
  it("shows the houses' Master B/L only when none was read, and files it only while it stays ticked", () => {
    const houses: Record<string, string>[] = [{ "Master BoL Number": "MEDU123" }, {}];
    expect(housesMasterBolShown(null, houses)).toBe("MEDU123");
    expect(housesMasterBolShown({ Vessel: "X" }, houses)).toBe("MEDU123");
    expect(housesMasterBolShown({ "Master BoL Number": "HLCUX6TEST001" }, houses)).toBe("");
    // Two houses naming two: none shown, none filed.
    expect(housesMasterBolShown(null, [{ "Master BoL Number": "MEDU123" }, { "Master BoL Number": "MEDU999" }])).toBe("");
    expect(masterBolToFile(null, {}, houses, true)).toBe("MEDU123");
    expect(masterBolToFile(null, {}, houses, false)).toBe("");
    // A read one goes by its own tick, whatever the houses' one.
    expect(masterBolToFile({ "Master BoL Number": "HLCUX6TEST001" }, { "Master BoL Number": true }, houses, false)).toBe("HLCUX6TEST001");
  });
});
