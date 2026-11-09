import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { ImportInstructionAnswers, ImportInstructionChange } from "../interfaces/importInstructions";

// The approved Import Instructions as a page like the paper form, for the shipment's Documents: what the
// customer confirmed, as sent, and after it every answer the reviewer changed before approving, with who
// changed it. DejaVu Sans covers the Czech letters the built-in PDF fonts can't print.

const W = 595.28;
const H = 841.89;
const M = 48;
const DARK = rgb(0.11, 0.13, 0.2);
const MUTED = rgb(0.4, 0.43, 0.5);
const LINE = rgb(0.8, 0.82, 0.86);

interface Meta {
  reference: string;
  /** YYYY-MM-DD HH:mm, UTC. */
  confirmedAt: string;
  approvedBy: string;
  /** What the reviewer changed of the customer's answers; [] when nothing. */
  changes: ImportInstructionChange[];
}

function wrap(text: string, size: number, width: number, font: PDFFont): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function importInstructionsPdf(a: ImportInstructionAnswers, meta: Meta): Promise<Uint8Array> {
  const require = createRequire(import.meta.url);
  const path = (file: string) => require.resolve(`dejavu-fonts-ttf/ttf/${file}`);
  const [regularBytes, boldBytes] = await Promise.all([readFile(path("DejaVuSans.ttf")), readFile(path("DejaVuSans-Bold.ttf"))]);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(new Uint8Array(regularBytes), { subset: true });
  const bold = await doc.embedFont(new Uint8Array(boldBytes), { subset: true });
  doc.setTitle(`Import Instructions ${meta.reference}`);
  doc.setCreator("Shipment Tracker");
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const room = (needed: number) => {
    if (y - needed < M) {
      page = doc.addPage([W, H]);
      y = H - M;
    }
  };
  const text = (t: string, size: number, f: PDFFont = regular, color = DARK, x = M) => {
    for (const line of wrap(t, size, W - M - x, f)) {
      room(size + 4);
      page.drawText(line, { x, y: y - size, size, font: f, color });
      y -= size + 4;
    }
  };
  const gap = (n = 8) => {
    y -= n;
  };
  const heading = (t: string) => {
    gap(8);
    text(t, 10, bold);
    gap(2);
  };
  const field = (label: string, value: string) => {
    if (!value) return;
    text(label, 8, regular, MUTED, M + 10);
    text(value, 10, regular, DARK, M + 10);
    gap(3);
  };

  text("IMPORT INSTRUCTIONS", 16, bold);
  gap(10);
  heading("1. Job / shipment reference number");
  text(meta.reference, 10, regular, DARK, M + 10);
  heading("2. Customs procedure");
  text(
    a.procedure === "free_circulation" ? "a) Release for free circulation (SAD)" : a.procedure === "t1" ? "b) T1 transit" : "c) Customs warehousing (SAD) or another procedure",
    10,
    regular,
    DARK,
    M + 10,
  );
  gap(3);
  field("Bank", a.bank);
  field("Account number", a.accountNumber);
  field("Customs office of destination where the goods will be presented", a.t1Office);
  field("Procedure", a.otherProcedure);
  heading("3. Customs tariff code (Combined Nomenclature)");
  text(a.tariffCode || "Not given: classified from the description, without any guarantee", 10, regular, a.tariffCode ? DARK : MUTED, M + 10);
  heading("4. Detailed description of the goods");
  text(a.description, 10, regular, DARK, M + 10);
  gap(3);
  field("What is it?", a.whatIsIt);
  field("What is it made of?", a.madeOf);
  field("What is it used for?", a.usedFor);
  if (a.deliveryAddress) {
    heading("5. Delivery address");
    text(a.deliveryAddress, 10, regular, DARK, M + 10);
    gap(3);
    field("Contact person", a.deliveryContact);
    field("Telephone", a.deliveryPhone);
  }
  heading("6. Billing address");
  text(a.billingAddress, 10, regular, DARK, M + 10);
  gap(3);
  field("EORI", a.eori);
  field("Company ID", a.companyId);
  field("VAT ID", a.vatId);
  gap(8);
  room(70);
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: LINE });
  gap(8);
  field("Confirmed by", a.name);
  field("Telephone", a.telephone);
  field("Confirmed online on (UTC)", meta.confirmedAt);
  field("Approved by", meta.approvedBy);
  if (meta.changes.length) {
    heading(`Changed on approval by ${meta.approvedBy || "the reviewer"}`);
    text("Approved with these answers in place of the customer's:", 8, regular, MUTED, M + 10);
    gap(3);
    for (const change of meta.changes) {
      text(change.label, 8, regular, MUTED, M + 10);
      text(`Customer: ${change.sent || "(empty)"}`, 10, regular, MUTED, M + 10);
      text(`Approved: ${change.approved || "(empty)"}`, 10, regular, DARK, M + 10);
      gap(3);
    }
  }
  return doc.save();
}
