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
