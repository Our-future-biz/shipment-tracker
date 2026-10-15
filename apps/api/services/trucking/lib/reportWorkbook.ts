import ExcelJS from "exceljs";
import type { MarginRow, TruckingReport } from "../interfaces/reports.interfaces";

// The Reports tab as an Excel workbook (Phase 7): one sheet per section, the figures as the
// report gives them (CZK).

export const REPORT_SHEETS = ["KPIs", "Margin by customer", "Margin by lane", "Margin by service level", "Hauliers", "Coverage gaps", "Department"] as const;

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF4" } };
const MONEY = "#,##0.00";

type Column = { header: string; width: number; money?: boolean };

function sheet(wb: ExcelJS.Workbook, name: string, columns: Column[], rows: (string | number | null)[][]): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, width: c.width, ...(c.money ? { style: { numFmt: MONEY } } : {}) }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = HEADER_FILL;
  for (const r of rows) ws.addRow(r);
  return ws;
}

const MARGIN_COLUMNS: Column[] = [
  { header: "Consignments", width: 14 },
  { header: "Sell CZK", width: 16, money: true },
  { header: "Buy CZK", width: 16, money: true },
  { header: "Margin CZK", width: 16, money: true },
  { header: "Margin %", width: 10 },
  { header: "Below floor", width: 12 },
];
const marginCells = (r: MarginRow) => [r.consignments, r.sellCzk, r.buyCzk, r.marginCzk, r.marginPercent, r.belowFloor];

export async function buildReportWorkbook(report: TruckingReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Shipment Tracker";
  const period = `Period ${report.from} – ${report.to} (delivered date, Prague)`;

  const kpis = sheet(
    wb,
    "KPIs",
    [
      { header: "KPI", width: 24 },
      { header: "Value", width: 12 },
      { header: "Unit", width: 20 },
      { header: "n", width: 8 },
      { header: "Breakdown", width: 70 },
      { header: "How it is measured", width: 90 },
      { header: "Not measured", width: 60 },
    ],
    report.kpis.map((k) => [
      k.label,
      k.value,
      k.unit,
      k.n,
      k.breakdown.map((b) => `${b.label}: ${b.value ?? "–"} ${b.unit} (n ${b.n})`).join("; "),
      k.measured,
      k.notMeasured,
    ]),
  );
  kpis.addRow([]);
  kpis.addRow([period]);

  sheet(wb, "Margin by customer", [{ header: "Customer", width: 40 }, ...MARGIN_COLUMNS], report.marginByCustomer.map((r) => [r.label, ...marginCells(r)]));
  sheet(wb, "Margin by lane", [{ header: "Lane", width: 40 }, ...MARGIN_COLUMNS], report.marginByLane.map((r) => [r.label, ...marginCells(r)]));
  sheet(wb, "Margin by service level", [{ header: "Service level", width: 24 }, ...MARGIN_COLUMNS], report.marginByServiceLevel.map((r) => [r.label, ...marginCells(r)]));

  sheet(
    wb,
    "Hauliers",
    [
      { header: "Haulier", width: 36 },
      { header: "Status", width: 10 },
      { header: "Trips", width: 8 },
      { header: "Consignments", width: 14 },
      { header: "On time %", width: 11 },
      { header: "First attempt %", width: 15 },
      { header: "Avg days to POD", width: 15 },
      { header: "Claims", width: 8 },
      { header: "Claimed CZK", width: 14, money: true },
      { header: "Cost CZK", width: 16, money: true },
      { header: "Cost per kg", width: 12 },
      { header: "Invoices blocked", width: 15 },
      { header: "Invoice difference CZK", width: 20, money: true },
    ],
    report.hauliers.map((h) => [
      h.name,
      h.status,
      h.trips,
      h.consignments,
      h.onTimePercent,
      h.firstAttemptPercent,
      h.avgDaysToPod,
      h.claims,
      h.claimedCzk,
      h.costCzk,
      h.costPerKg,
      h.invoicesBlocked,
      h.invoiceDifferenceCzk,
    ]),
  );

  sheet(
    wb,
    "Coverage gaps",
    [
      { header: "Side", width: 10 },
      { header: "Scope", width: 10 },
      { header: "Service level", width: 14 },
      { header: "Postcode", width: 10 },
      { header: "Reason", width: 70 },
      { header: "Asked", width: 8 },
      { header: "Last asked", width: 22 },
    ],
    report.coverageGaps.map((g) => [g.side, g.scope, g.serviceLevel ?? "", g.postcode, g.reason, g.count, g.lastAt]),
  );

  const d = report.department;
  const dep = sheet(
    wb,
    "Department",
    [
      { header: "Line", width: 40 },
      { header: "CZK", width: 18, money: true },
      { header: "Consignments", width: 14 },
    ],
    [
      ["External sell (Road)", d.externalSellCzk, null],
      ["+ Internal charges", d.internalChargesCzk, null],
      ["− Haulier cost", d.haulierCostCzk, null],
      ["= Result", d.resultCzk, null],
      [],
      ["Internal charges by department", null, null],
      ...d.internalByDepartment.map((x) => [x.department, x.amountCzk, x.consignments]),
    ],
  );
  dep.getRow(5).font = { bold: true };
  dep.addRow([]);
  dep.addRow([period]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
