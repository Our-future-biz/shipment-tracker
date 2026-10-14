import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import type { GateMovement } from "@/hooks/useGateLog";
import { formatDate, formatDateTime } from "@/lib/date";

// jsPDF's built-in Helvetica has no Czech diacritics; print the plain letters instead.
const plain = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "");

const num = (v: number, digits = 0) =>
  v ? v.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace(/,/g, " ") : "";

// Warehouse label (100 × 150 mm, the usual thermal label size) led by the internal warehouse
// reference, with a QR code carrying the same details, built in the browser and downloaded
// as WCZ….pdf.
export async function downloadWarehouseLabel(m: GateMovement): Promise<void> {
  const ref = m.positionRef || m.gateRef;
  const doc = new jsPDF({ unit: "mm", format: [100, 150], compress: true });
  const w = 100;
  const margin = 7;
  let y = 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text("WAREHOUSE REFERENCE", margin, y);

  y += 13;
  doc.setTextColor(0);
  doc.setFont("courier", "bold");
  doc.setFontSize(26);
  doc.text(ref, w / 2, y, { align: "center" });

  y += 7;
  doc.setLineWidth(0.6);
  doc.line(margin, y, w - margin, y);

  const rows: [string, string][] = [
    ["Customer", m.customer],
    ["Internal Reference", m.jobNumber],
    ["Trade direction", m.handling],
    ["Operation", m.operationType],
    ["Pieces", m.colli ? `${num(m.colli)}${m.packing ? ` ${m.packing}` : ""}` : m.packing],
    ["Gross weight", m.weightKg ? `${num(m.weightKg)} kg` : ""],
    ["Volume", m.measureCbm ? `${num(m.measureCbm, 2)} cbm` : ""],
    ["Commodity", m.commodity],
    ["Customs", [m.customsMode, m.mrn].filter(Boolean).join(" · ")],
  ];

  // The QR code holds every detail as plain "Label: value" lines, so any phone or scanner
  // reads it without an app (UTF-8, so the diacritics survive here).
  const qrText = [`Warehouse ref: ${ref}`, ...rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`), `Recorded: ${formatDate(m.createdAt)}`].join("\n");
  const qr = await QRCode.toDataURL(qrText, { errorCorrectionLevel: "M", margin: 0, width: 400 });

  y += 8;
  for (const [label, value] of rows) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(label.toUpperCase(), margin, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0);
    const lines = doc.splitTextToSize(plain(value || "-"), w - margin * 2 - 34) as string[];
    doc.text(lines.slice(0, 2), margin + 34, y);
    y += 6 + (Math.min(lines.length, 2) - 1) * 5;
  }

  const qrSize = 32;
  doc.addImage(qr, "PNG", (w - qrSize) / 2, 104, qrSize, qrSize, undefined, "FAST");

  doc.setLineWidth(0.3);
  doc.line(margin, 138, w - margin, 138);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100);
  doc.text(`Recorded ${formatDate(m.createdAt)}`, margin, 143);
  doc.text(`Printed ${formatDateTime(new Date().toISOString())}`, w - margin, 143, { align: "right" });

  doc.save(`${ref}.pdf`);
}
