import { describe, expect, it } from "vitest";
import { APIError, ErrCode } from "@/lib/api";
import {
  houseRefusedAsMade,
  housesMadeAlready,
  housesMasterBol,
  housesMasterBolShown,
  housesMblFiled,
  housesMblNote,
  madeAlreadyNumbers,
  masterBolToFile,
  otherHousesMbls,
} from "./preAlertMadeAlready";

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
    const houses: Record<string, string>[] = [{ "Master BoL Number": " MEDU123 " }, { "Master BoL Number": "medu-123" }];
    expect(masterBolToFile(null, {}, houses)).toBe("MEDU123");
    expect(masterBolToFile({ Vessel: "X", "Master BoL Number": " " }, {}, houses)).toBe("MEDU123");
    expect(masterBolToFile(null, {}, [{ "Master BoL Number": "MEDU123" }, { "Master BoL Number": "MEDU999" }])).toBe("");
    expect(masterBolToFile(null, {}, [{}])).toBe("");
    expect(masterBolToFile({ "Master BoL Number": "HLCUX6TEST001" }, { "Master BoL Number": false }, houses)).toBe("");
    expect(housesMasterBol([])).toBe("");
  });

  // Review of system-22: one house's B/L (a misread one, say) was shown as named by every House B/L and took every
  // house to its consolidation. The houses' B/L counts only when each house read names one, as on the server.
  it("takes none from the houses while a house read names none", () => {
    expect(housesMasterBol([{ "Master BoL Number": "X" }, {}])).toBe("");
    expect(housesMasterBol([{ "Master BoL Number": "MEDU123" }, { "Master BoL Number": " " }, { "Master BoL Number": "MEDU123" }])).toBe("");
    expect(housesMasterBolShown(null, [{ "Master BoL Number": "MEDU123" }, {}, {}])).toBe("");
    expect(masterBolToFile(null, {}, [{ "Master BoL Number": "MEDU123" }, {}, {}])).toBe("");
  });

  // Mock test run F3, m1: the houses' Master B/L was filed, and its master job taken, unseen.
  it("shows the houses' Master B/L only when none was read, and files it only while it stays ticked", () => {
    const houses: Record<string, string>[] = [{ "Master BoL Number": "MEDU123" }, { "Master BoL Number": "MEDU123" }];
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

  // Review of system-22: the summary worked the houses' B/L out again from every house loaded at the end, so a later
  // batch naming another one dropped "taken from the House B/Ls" from a master job made with it.
  it("keeps the houses' Master B/L a new master job is made with, none when it came from a Master B/L page", () => {
    expect(housesMblFiled(null, " MEDU123 ")).toBe("MEDU123");
    expect(housesMblFiled({ Vessel: "X" }, "MEDU123")).toBe("MEDU123");
    expect(housesMblFiled({ "Master BoL Number": "HLCUX6TEST001" }, "HLCUX6TEST001")).toBe("");
    expect(housesMblFiled(null, "")).toBe("");
  });

  it("says the houses' Master B/L on the summary from what was kept, whatever the houses loaded later", () => {
    expect(housesMblNote("MEDU123")).toBe("Master B/L MEDU123 taken from the House B/Ls");
    expect(housesMblNote(undefined)).toBe("");
    expect(housesMblNote("")).toBe("");
  });

  it("names each Master B/L the houses loaded name other than the one filed from the houses, once", () => {
    const houses: Record<string, string>[] = [
      { "Master BoL Number": "MEDU123" },
      { "Master BoL Number": "medu-123" },
      { "Master BoL Number": "MEDU999" },
      {},
      { "Master BoL Number": " medu999 " },
      { "Master BoL Number": "MSCU5" },
    ];
    expect(otherHousesMbls("MEDU123", houses)).toEqual(["MEDU999", "MSCU5"]);
    expect(otherHousesMbls("MEDU123", houses.slice(0, 2))).toEqual([]);
    // None filed from the houses: nothing to differ from.
    expect(otherHousesMbls("", houses)).toEqual([]);
  });
});
