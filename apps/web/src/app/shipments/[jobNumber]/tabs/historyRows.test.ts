import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import { historyLabel, historyRows, historyValue, historyWho } from "./historyRows";

const entry = (over: Partial<interfaces.ShipmentHistoryEntry> = {}): interfaces.ShipmentHistoryEntry => ({
  id: "h1",
  field: "estimatedArrival",
  label: null,
  oldValue: "2026-11-20",
  newValue: "2026-11-24",
  cut: false,
  // 14:05 in Prague (CET, UTC+1)
  changedAt: "2026-11-19T13:05:00.000Z",
  userId: "u1",
  userName: "Jana Nováková",
  userEmail: "jana@cto.cz",
  ...over,
});

describe("a job's history", () => {
  it("names a change by the server's label, else the column's title, else the key", () => {
    expect(historyLabel(entry({ field: "claimStatus", label: "Cargo claim (Damaged): status" }))).toBe("Cargo claim (Damaged): status");
    expect(historyLabel(entry())).toBe("ETA Estimated");
    expect(historyLabel(entry({ field: "originalsReceivedDate" }))).toBe("Originals Received");
    expect(historyLabel(entry({ field: "cancelReason" }))).toBe("Cancel Reason");
    // an API field whose column has another key; a date's time
    expect(historyLabel(entry({ field: "masterJobMczNumber" }))).toBe("Master job");
    expect(historyLabel(entry({ field: "closingTime" }))).toBe("Closing Date (time)");
    expect(historyLabel(entry({ field: "task:customs" }))).toBe("task:customs");
  });

  it("shows a day as DD.MM.YYYY, a moment on Prague's clock, anything else as stored", () => {
    expect(historyValue("2026-11-20")).toBe("20.11.2026");
    expect(historyValue("2026-07-01T08:30:00.000Z")).toBe("01.07.2026 10:30");
    expect(historyValue("Billing [IMP]")).toBe("Billing [IMP]");
    expect(historyValue(null)).toBe("");
  });

  it("reads a list the history kept as JSON a line per row, never as raw JSON", () => {
    const dims =
      '[{"containerId":null,"pieces":"1","lengthCm":"120","widthCm":"80","heightCm":"100","dimensionUnit":"cm","weightPerPcKg":"300","volumePerPcM3":"","packageType":"","stackable":"","adrUn":null,"adrLimitedQuantity":false}]';
    expect(historyValue(dims)).toBe("1 × 120×80×100 cm, 300 kg/pc");
    expect(historyValue('[{"pieces":"20","lengthCm":"","widthCm":"","heightCm":"","weightPerPcKg":"150","packageType":"Pallet(s)"}]')).toBe("20 pcs, 150 kg/pc, Pallet(s)");
    const containers =
      `[{"id":"0ca1","containerNumber":"GCXU2218720","sealNumber":"LKAB74987","type":"20' DC","teu":"1","packages":"","packageType":"Cartons","grossWeight":"","volume":"7.74"},` +
      `{"id":"0ca2","containerNumber":"","type":"40' HC","teu":"2","packages":"","packageType":"","grossWeight":"","volume":""}]`;
    expect(historyValue(containers)).toBe("1. GCXU2218720 20' DC, seal LKAB74987, Cartons, 7.74 m³\n2. 40' HC");
    const cargo =
      '[{"containerId":"fef5","cargoDescription":"AUTOMOTIVE PARTS","hsCode":"870899","pieces":"10","packageType":"Pallet(s)","grossWeight":"1442","commercialInvoiceValue":"5000","currency":"EUR"}]';
    expect(historyValue(cargo)).toBe("10 Pallet(s) AUTOMOTIVE PARTS, HS 870899, 1442 kg, value 5000 EUR");
    expect(historyValue('{"colli":1,"weightKg":500,"volumeCbm":6.292,"comparedWith":"dimensions","commentId":"d132"}')).toBe("1 colli, 500 kg, 6.292 m³");
    expect(historyValue("[]")).toBe("none");
    // a value cut at 2,000 characters no longer reads as JSON: shown as stored
    expect(historyValue('[{"pieces":"1","lengthCm":"12')).toBe('[{"pieces":"1","lengthCm":"12');
  });

  it("names the detail-row lists and any other key in words, never as code (x5)", () => {
    expect(historyLabel(entry({ field: "cargoItems" }))).toBe("Cargo lines");
    expect(historyLabel(entry({ field: "containers" }))).toBe("Containers");
    expect(historyLabel(entry({ field: "cargoDimensions" }))).toBe("Dimensions");
    expect(historyLabel(entry({ field: "commercialInvoices" }))).toBe("Commercial invoices");
    expect(historyLabel(entry({ field: "pickupSiteNote" }))).toBe("Pickup site note");
  });

  it("rounds a figure nobody typed to three decimals, in a list and alone (x5)", () => {
    expect(historyValue('[{"pieces":"11","lengthCm":"","weightPerPcKg":"745.454545455"}]')).toBe("11 pcs, 745.455 kg/pc");
    expect(historyValue("745.454545455", "totalWeightTons")).toBe("745.455");
    expect(historyValue("12.5000", "totalVolumeCbm")).toBe("12.5");
    expect(historyValue("24.335", "totalVolumeCbm")).toBe("24.335");
    expect(historyValue("CZ00000053")).toBe("CZ00000053");
  });

  it("rounds only the computed weights and volumes, never an HS code, a rate or text (mock council S7-2)", () => {
    expect(historyValue("8708.9997", "hsCode")).toBe("8708.9997");
    expect(historyValue("8471.3000", "hsCode")).toBe("8471.3000");
    expect(historyValue("0.1234", "customsDutyRate")).toBe("0.1234");
    expect(historyValue("745.454545455")).toBe("745.454545455");
    expect(historyValue('[{"pieces":"10","packageType":"Pallet(s)","cargoDescription":"PARTS","hsCode":"8708.9997","grossWeight":"1442.123456"}]')).toBe(
      "10 Pallet(s) PARTS, HS 8708.9997, 1442.123 kg",
    );
  });

  it("keeps a row per save of a dropdown, a status or a date; merges a typed text field (mock council S7-3)", () => {
    const at = (min: number) => new Date(Date.UTC(2026, 10, 19, 13, min)).toISOString();
    const rows = historyRows([
      {
        entries: [
          entry({ id: "s2", field: "status", oldValue: "Cancelled Shipment", newValue: "Booking Confirmation Pending [IMP]", changedAt: at(3) }),
          entry({ id: "s1", field: "status", oldValue: "Booking Confirmation Pending [IMP]", newValue: "Cancelled Shipment", changedAt: at(1) }),
          entry({ id: "e2", field: "estimatedArrival", oldValue: "2026-11-21", newValue: "2026-11-22", changedAt: at(0) }),
          entry({ id: "e1", field: "estimatedArrival", oldValue: "2026-11-20", newValue: "2026-11-21", changedAt: at(0) }),
          entry({ id: "v2", field: "vessel", oldValue: "MSC AN", newValue: "MSC ANNA", changedAt: at(0) }),
          entry({ id: "v1", field: "vessel", oldValue: "", newValue: "MSC AN", changedAt: at(0) }),
        ],
        namesKnown: true,
      },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["s2", "s1", "e2", "e1", "v2"]);
    expect(rows.at(-1)).toMatchObject({ from: "", to: "MSC ANNA" });
  });

  it("leaves out an entry that only says a linked record's id changed (x5)", () => {
    const rows = historyRows([
      {
        entries: [
          entry({ id: "a", field: "customerId", oldValue: null, newValue: "55199341-55b9-4b33-bf26-d9491b17daa8" }),
          entry({ id: "b", field: "customer", oldValue: null, newValue: "Fubar s.r.o." }),
        ],
        namesKnown: true,
      },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["b"]);
  });

  it("makes a field typed save by save one row: before the first, after the last (x5, E16)", () => {
    const at = (min: number) => new Date(Date.UTC(2026, 10, 19, 13, min)).toISOString();
    const dims = (w: string) => `[{"pieces":"1","lengthCm":"120","widthCm":"${w}","heightCm":"","weightPerPcKg":""}]`;
    const rows = historyRows([
      {
        entries: [
          entry({ id: "3", field: "cargoDimensions", oldValue: dims("80"), newValue: dims("800"), changedAt: at(4) }),
          entry({ id: "2", field: "cargoDimensions", oldValue: dims("8"), newValue: dims("80"), changedAt: at(2) }),
          entry({ id: "1", field: "cargoDimensions", oldValue: "[]", newValue: dims("8"), changedAt: at(0) }),
          // the same field by someone else, and by the same person long before: rows of their own
          entry({ id: "0", field: "cargoDimensions", userId: "u2", oldValue: "[]", newValue: "[]", changedAt: at(0) }),
        ],
        namesKnown: true,
      },
      { entries: [entry({ id: "-1", field: "cargoDimensions", oldValue: "[]", newValue: "[]", changedAt: at(-30) })], namesKnown: true },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["3", "0", "-1"]);
    expect(rows[0]).toMatchObject({ label: "Dimensions", from: "none", to: "1 × 120×800×? cm", when: "19.11.2026 14:04" });
  });

  it("never merges events the server labels: two claims raised within minutes keep a row each", () => {
    const at = (min: number) => new Date(Date.UTC(2026, 10, 19, 13, min)).toISOString();
    const rows = historyRows([
      {
        entries: [
          entry({ id: "2", field: "claimCreated", label: "Cargo claim raised", oldValue: "", newValue: "Damaged", changedAt: at(3) }),
          entry({ id: "1", field: "claimCreated", label: "Cargo claim raised", oldValue: "", newValue: "Short", changedAt: at(1) }),
        ],
        namesKnown: true,
      },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["2", "1"]);
  });

  it("says who by name and e-mail; by id when the names could not be read", () => {
    expect(historyWho(entry(), true)).toEqual({ who: "Jana Nováková", hint: "jana@cto.cz" });
    expect(historyWho(entry({ userName: "" }), true)).toEqual({ who: "jana@cto.cz", hint: "" });
    expect(historyWho(entry({ userName: "", userEmail: "" }), false)).toEqual({ who: "u1", hint: "The names could not be read just now" });
    expect(historyWho(entry({ userName: "", userEmail: "" }), true)).toEqual({ who: "A user no longer known", hint: "u1" });
  });

  it("makes one row an entry, newest first across the pages read, each page with what it says of the names", () => {
    const rows = historyRows([
      { entries: [entry(), entry({ id: "h2", field: "status", oldValue: "Billing [IMP]", newValue: "Cancelled Shipment", cut: true })], namesKnown: true },
      { entries: [entry({ id: "h3", userName: "", userEmail: "" })], namesKnown: false },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["h1", "h2", "h3"]);
    expect(rows[0]).toEqual({
      id: "h1",
      label: "ETA Estimated",
      from: "20.11.2026",
      to: "24.11.2026",
      cut: false,
      who: "Jana Nováková",
      whoHint: "jana@cto.cz",
      when: "19.11.2026 14:05",
    });
    expect(rows[1]).toMatchObject({ label: "Shipment Status", from: "Billing [IMP]", to: "Cancelled Shipment", cut: true });
    expect(rows[2]!.who).toBe("u1");
  });
});
