import ExcelJS from "exceljs";
import type { DocParty } from "./documentTypes";
import { formatDate, formatMoney, formatNumber, label, titleLines, type LabelKey } from "./docFormat";
import { A4, drawCells, drawDocHeader, drawTable, M, MUTED, Writer, type TableColumn } from "./docPdf";
import { statementGroups } from "./internalBilling";

// The internal statement of a closed month for one receiving department (PDF, Czech and English
// on one page, no VAT) and the month's Excel export (one sheet per department and a summary).

export interface StatementLine {
  deliveredAt: string;
  consignmentRef: string;
  jobNumber: string;
  serviceLevel: string | null;
  chargeableKg: number | null;
  kind: string;
  description: string;
  amount: number;
}

export interface InternalStatementDoc {
  number: string;
  month: string;
  department: string;
  issuedAt: string;
  ourCompany: DocParty;
  lines: StatementLine[];
  total: number;
}

const LANG = "both" as const;
const L = (key: LabelKey) => label(LANG, key);
const WIDTHS = { delivered: 62, ref: 84, job: 66, level: 44, kg: 50, amount: 76 };

export async function buildInternalStatementPdf(doc: InternalStatementDoc): Promise<Uint8Array> {
  const title = titleLines(LANG, "internalStatement");
  const w = await Writer.create({ title: `${title.main} ${doc.number}`, author: doc.ourCompany.name, issuedAt: doc.issuedAt }, A4);
  drawDocHeader(w, doc.ourCompany, title, doc.number, `${L("issued")}: ${formatDate(doc.issuedAt, LANG)}`);
  drawCells(w, [
    [L("receivingDepartment"), doc.department],
    [L("month"), doc.month],
    [L("total"), formatMoney(doc.total, "CZK", LANG)],
  ]);
  w.y -= 6;
  const fixed = Object.values(WIDTHS).reduce((a, b) => a + b, 0);
  const columns: TableColumn[] = [
    { title: L("delivered"), width: WIDTHS.delivered },
    { title: L("consignmentRef"), width: WIDTHS.ref },
    { title: L("jobNo"), width: WIDTHS.job },
    { title: L("service"), width: WIDTHS.level },
    { title: L("chargeableKg"), width: WIDTHS.kg, align: "right" },
    { title: L("chargeText"), width: w.right - M - fixed },
    { title: L("amount"), width: WIDTHS.amount, align: "right" },
  ];
  const rows = doc.lines.map((l) => [
    formatDate(l.deliveredAt, LANG),
    { text: l.consignmentRef, bold: true },
    l.jobNumber,
    l.serviceLevel ?? "",
    l.chargeableKg === null ? "" : formatNumber(l.chargeableKg, LANG, 0),
    l.kind === "CHARGE" ? l.description : `${l.kind}: ${l.description}`,
    formatMoney(l.amount, "CZK", LANG),
  ]);
  drawTable(w, columns, rows, {
    continuedTitle: `${title.main} ${doc.number} (${L("continued")})`,
    totals: ["", L("total"), "", "", "", "", formatMoney(doc.total, "CZK", LANG)],
    keepAfter: 30,
  });
  for (const line of w.wrap(L("noVat"), 8.5, w.right - M)) {
    w.ensure(12);
    w.text(line, M, w.y - 10, 8.5, { color: MUTED });
    w.y -= 12;
  }
  const c = doc.ourCompany;
  return w.finish([
    [c.name, c.ico && `${L("ico")} ${c.ico}`, c.dic && `${L("dic")} ${c.dic}`].filter(Boolean).join("  ·  "),
    `${title.main} ${doc.number}  ·  ${doc.department}  ·  ${doc.month}`,
  ]);
}

export interface MonthExportLine extends StatementLine {
  department: string;
  createdAt: string;
}

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF4" } };
const MONEY = "#,##0.00";

/** Excel sheet names: at most 31 characters, none of : \ / ? * [ ]. */
const sheetName = (name: string, used: Set<string>) => {
  const base = (name.replace(/[:\\/?*[\]]/g, " ").trim() || "Department").slice(0, 28);
  let out = base;
  for (let i = 2; used.has(out.toLowerCase()); i += 1) out = `${base} ${i}`;
  used.add(out.toLowerCase());
  return out;
};

/** The month's charges as a workbook: a Summary sheet (per department, with its statement) and one sheet per department. */
export async function buildInternalMonthWorkbook(month: string, status: string, lines: MonthExportLine[], statements: Map<string, string>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Shipment Tracker";
  const used = new Set<string>();
  const summary = wb.addWorksheet(sheetName("Summary", used));
  summary.columns = [
    { header: "Department", width: 30 },
    { header: "Lines", width: 10 },
    { header: "Amount CZK", width: 16, style: { numFmt: MONEY } },
    { header: "Statement", width: 16 },
  ];
  summary.getRow(1).font = { bold: true };
  summary.getRow(1).fill = HEADER_FILL;
  const groups = statementGroups(lines);
  for (const g of groups) summary.addRow([g.department, g.lineCount, g.amount, statements.get(g.department) ?? ""]);
  summary.addRow([]);
  summary.addRow([`Month ${month} (${status.toLowerCase()}); internal charges, no VAT`]);

  for (const g of groups) {
    const ws = wb.addWorksheet(sheetName(g.department, used), { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = [
      { header: "Delivered", width: 12 },
      { header: "Consignment", width: 16 },
      { header: "Job", width: 14 },
      { header: "Service level", width: 12 },
      { header: "Chargeable kg", width: 14 },
      { header: "Kind", width: 12 },
      { header: "Description", width: 50 },
      { header: "Amount CZK", width: 14, style: { numFmt: MONEY } },
    ];
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = HEADER_FILL;
    for (const l of lines.filter((x) => x.department === g.department)) {
      ws.addRow([l.deliveredAt.slice(0, 10), l.consignmentRef, l.jobNumber, l.serviceLevel ?? "", l.chargeableKg, l.kind, l.description, l.amount]);
    }
    const total = ws.addRow(["Total", "", "", "", "", "", "", g.amount]);
    total.font = { bold: true };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
