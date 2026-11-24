import { describe, expect, it } from "vitest";
import type { BoxRow } from "./boxUtilization";
import { loadListCells, loadListFileName, loadListMarks, loadListOf } from "./loadList";
import { buildLoadListPdf } from "./loadListPdf";

const sailing = { vessel: "MSC Anna", voyage: "445W", pol: "Shanghai (CNSHA)", pod: "Hamburg (DEHAM)", hub: "Praha (CZPRG)", containerType: "40' HC", containerCount: 2, cutoffDate: "2026-12-03", departureDate: null };
const row = (more: Partial<BoxRow> = {}): BoxRow => ({
  shipmentId: "s1",
  jobNumber: "CZLCL00000002",
  customer: "Alfa",
  status: "active",
  counted: true,
  colli: 12,
  weightKg: 1950,
  volumeCbm: 9.08,
  freightTons: 9.08,
  weightMissing: false,
  volumeMissing: false,
  weightSharePct: 7,
  volumeSharePct: 14,
  notStackable: false,
  dangerous: false,
  adr: [],
  outOfGauge: false,
  temperatureControlled: false,
  odd: null,
  implausible: false,
  ...more,
});
const job = (id: string, more = {}) => ({ id, jobNumber: "", houseBolNumber: "HBL123", shipper: "Shanghai  Tools\nCo.", consignee: "Alfa s.r.o.", typeOfPackages: "Pallets", cargoDescription: "Hand tools", deliveryAddress: "Praha 9", ...more });
const day = (d: string) => d.split("-").reverse().join(".");

describe("a sailing's load list (Council Outlay 14, A8)", () => {
  const list = loadListOf(
    sailing,
    "Import from Shanghai",
    [job("s1"), job("s2", { houseBolNumber: null, deliveryAddress: "" })],
    [row({ shipmentId: "s2", jobNumber: "CZLCL00000009", colli: 3, weightKg: 400.5, volumeCbm: 1.25, dangerous: true, adr: ["UN 1263 · class 3"], notStackable: true }), row(), row({ shipmentId: "s3", jobNumber: "CZLCL00000001", counted: false })],
    "2026-11-24",
    day,
  );

  it("heads it with the sailing's facts, and no money anywhere", () => {
    expect(list.title).toBe("Load list MSC Anna 445W");
    expect(list.facts).toEqual([
      ["Service", "Import from Shanghai"],
      ["Vessel / voyage", "MSC Anna 445W"],
      ["Port of Loading", "Shanghai (CNSHA)"],
      ["Port of Discharge", "Hamburg (DEHAM)"],
      ["HUB", "Praha (CZPRG)"],
      ["Containers", "2 × 40' HC"],
      ["Cut-off", "03.12.2026"],
      ["Departure", "—"],
    ]);
    expect(JSON.stringify(list)).not.toMatch(/profit|cost|selling|EUR|CZK/i);
  });

  it("lists the counted shipments by job number with the box's own figures, and leaves a cancelled one off", () => {
    expect(list.rows.map((r) => [r.no, r.jobNumber, r.colli, r.weightKg, r.volumeCbm])).toEqual([
      [1, "CZLCL00000002", 12, 1950, 9.08],
      [2, "CZLCL00000009", 3, 400.5, 1.25],
    ]);
    expect(list.rows[0]).toMatchObject({ houseBol: "HBL123", shipper: "Shanghai Tools Co.", consignee: "Alfa s.r.o.", packages: "Pallets", cargo: "Hand tools", delivery: "Praha 9", marks: [] });
    expect(list.rows[1]).toMatchObject({ houseBol: "", delivery: "", marks: ["DG UN 1263 · class 3", "Not stackable"] });
    expect(list.totals).toEqual({ shipments: 2, colli: 15, weightKg: 2350.5, volumeCbm: 10.33 });
    expect(list.cancelled).toBe(1);
  });

  it("marks what the stuffing must know of", () => {
    expect(loadListMarks(row({ dangerous: true, outOfGauge: true, temperatureControlled: true, weightMissing: true, volumeMissing: true }))).toEqual(["DG", "Out of gauge", "Temperature controlled", "Weight missing", "Volume missing"]);
  });

  it("writes itself as rows of cells for a spreadsheet, numbers plain", () => {
    const cells = loadListCells(list);
    expect(cells[0]).toEqual(["Load list MSC Anna 445W"]);
    expect(cells[9]).toEqual(["Made on", "24.11.2026"]);
    expect(cells[11]).toEqual(["No.", "Shipment", "House B/L", "Shipper", "Consignee", "Colli", "Packages", "Weight (kg)", "Volume (cbm)", "Cargo", "Marks", "Delivery"]);
    expect(cells[13]).toEqual(["2", "CZLCL00000009", "", "Shanghai Tools Co.", "Alfa s.r.o.", "3", "Pallets", "400.5", "1.25", "Hand tools", "DG UN 1263 · class 3; Not stackable", ""]);
    expect(cells[14]!.slice(0, 9)).toEqual(["", "Total: 2 shipments", "", "", "", "15", "", "2350.5", "10.33"]);
    expect(cells[15]).toEqual(["", "1 cancelled, not on the list"]);
  });

  it("names its file plainly", () => {
    expect(loadListFileName("Load list MSC Anna 445W")).toBe("Load list MSC Anna 445W");
    expect(loadListFileName("Load list Žofie/2")).toBe("Load list Zofie 2");
  });
});

describe("the load list as a PDF", () => {
  it("is made for an empty box and for one long enough to run over pages", () => {
    const empty = loadListOf(sailing, "Import from Shanghai", [], [], "2026-11-24");
    expect(buildLoadListPdf(empty).getNumberOfPages()).toBe(1);
    const many = Array.from({ length: 80 }, (_, i) => row({ shipmentId: `s${i}`, jobNumber: `CZLCL${String(i).padStart(8, "0")}`, dangerous: i % 9 === 0, adr: i % 9 === 0 ? ["UN 1263 · class 3"] : [] }));
    const long = loadListOf(sailing, "Import from Shanghai", many.map((r) => job(r.shipmentId, { cargoDescription: "Žluťoučký kůň: hand tools, spare parts and a long description that wraps" })), many, "2026-11-24");
    const doc = buildLoadListPdf(long);
    expect(doc.getNumberOfPages()).toBeGreaterThan(2);
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(5000);
  });
});
