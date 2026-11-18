import { createHash, randomUUID } from "node:crypto";
import { APIError } from "encore.dev/api";
import { businessDay, isRealYmd } from "../../../lib/businessDate";
import { userEmailOf } from "../../../lib/companyUsers";
import type { Actor } from "../../../lib/rbac";
import { canDecideQuoteInquiry } from "../../../lib/salesPolicy";
import { czDate } from "../lib/invoicePdf";
import { buildPohodaXml, encodeWindows1250, pohodaFileName, pohodaNotes, pohodaOrder, pohodaProblem, type PohodaDocument } from "../lib/pohodaXml";
import { accountingExportRepository as repo, type ExportedBefore } from "../repositories/accountingExport.repository";
import type { InvoiceRecord } from "../schemas/invoice.schema";
import type {
  AccountingExportsResponse,
  PohodaExportNote,
  PohodaExportResponse,
  PohodaExportSkipped,
} from "../interfaces/accountingExport";

// Accounts Receivable step 7: issued invoices and credit notes of a period (by issue day) as a Pohoda XML import file
// (lib/pohodaXml). Managers export; the file and the documents it carried are recorded in the transaction that builds
// it, so the next export leaves them out unless the manager includes them again. Cancelled invoices never go: they
// were withdrawn on the day they were issued and issued again under a new number.

const SYSTEM = "pohoda" as const;
/** More in one period: choose a shorter one (the file stays a size a person can import and check) */
export const MAX_DOCUMENTS = 5000;
/** At most a year per file */
export const MAX_DAYS = 366;
const LIST_LIMIT = 200;

const managersOnly = () => APIError.permissionDenied("Only a manager exports invoices to Pohoda");

const exportedText = (b: ExportedBefore) => `${czDate(businessDay(b.at))} (${b.fileName})`;
const daysFrom = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

const CANCELLED =
  "Cancelled: withdrawn on the day it was issued and issued again under a new number, so it is not a document for the books";

export interface PohodaExportInput {
  from?: string;
  to?: string;
  includeExported?: boolean;
  /** The same key again answers the export it made (the same file and documents), recording nothing more */
  idempotencyKey?: string;
}

/** The export's id for an idempotency key: the same key of the same company is always the same export. */
export function exportIdOfKey(companyId: string, key: string): string {
  const h = createHash("sha256").update(`pohoda-export:${companyId}:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const sameExportElsewhere = () =>
  APIError.failedPrecondition("This export was made already for another period or choice: open the list of exports, or start a new export");

class AccountingExportService {
  canExport = (actor: Pick<Actor, "role">) => canDecideQuoteInquiry(actor.role);

  /**
   * The Pohoda file of the documents issued from `from` to `to`, recorded as an export. With an idempotency key, the
   * same key again (a double click, a retry after a lost answer) answers that export again - built anew from the same
   * documents as its first answer saw them, the file checked against the recorded SHA-256 - and records nothing more.
   */
  async exportPohoda(actor: Actor, input: PohodaExportInput): Promise<PohodaExportResponse> {
    if (!this.canExport(actor)) throw managersOnly();
    const from = (input.from ?? "").trim();
    const to = (input.to ?? "").trim();
    if (!isRealYmd(from) || !isRealYmd(to)) throw APIError.invalidArgument("Choose the first and the last issue day of the export");
    if (from > to) throw APIError.invalidArgument("The first day is after the last one");
    if (daysFrom(from, to) >= MAX_DAYS) throw APIError.invalidArgument("At most a year in one file: choose a shorter period");
    const today = businessDay(new Date());
    if (from > today) throw APIError.invalidArgument("Nothing is issued after today: choose a period that has begun");
    const includeExported = input.includeExported === true;
    // Who exported is recorded with the file: when it cannot be read, the export is refused (try again)
    const by = await userEmailOf(actor.userID);
    const key = String(input.idempotencyKey ?? "").trim();
    const exportId = key ? exportIdOfKey(actor.companyID, key) : randomUUID();
    const period = `${czDate(from)} – ${czDate(to)}`;

    return repo.inExport(actor.companyID, SYSTEM, async (tx) => {
      // The same key made this export before (under the same lock): answered again from what its first answer saw.
      const earlier = key ? await repo.exportById(tx, actor.companyID, exportId) : null;
      if (earlier && (earlier.fromDate !== from || earlier.toDate !== to)) throw sameExportElsewhere();
      const docs = await repo.issuedIn(tx, actor.companyID, from, to, MAX_DOCUMENTS + 1);
      if (docs.length > MAX_DOCUMENTS) throw APIError.invalidArgument(`More than ${MAX_DOCUMENTS} documents were issued from ${period}: choose a shorter period`);
      if (!docs.length) throw APIError.failedPrecondition(`No invoice or credit note was issued from ${period}: there is nothing to export`);

      const correctsIds = docs.flatMap((d) => (d.kind === "credit_note" && d.correctsInvoiceId ? [d.correctsInvoiceId] : []));
      const numbers = await repo.numbersOf(tx, actor.companyID, correctsIds);
      const before = await repo.exportedBefore(tx, actor.companyID, SYSTEM, [...docs.map((d) => d.id), ...correctsIds], earlier?.createdAt);
      const lines = await repo.linesOf(tx, actor.companyID, docs.map((d) => d.id));

      const skipped: PohodaExportSkipped[] = [];
      const taken: { record: InvoiceRecord; doc: PohodaDocument }[] = [];
      const skip = (d: InvoiceRecord, reason: string) => skipped.push({ number: d.number, kind: d.kind, issueDate: d.issueDate, reason });
      for (const d of docs) {
        const earlier = before.get(d.id);
        if (d.status === "cancelled") {
          skip(d, earlier ? `${CANCELLED}. It was exported to Pohoda on ${exportedText(earlier)}: remove it there` : CANCELLED);
          continue;
        }
        if (earlier && !includeExported) {
          skip(d, `Exported to Pohoda on ${exportedText(earlier)}`);
          continue;
        }
        const doc: PohodaDocument = {
          invoice: d,
          lines: lines.get(d.id) ?? [],
          correctsNumber: d.kind === "credit_note" && d.correctsInvoiceId ? (numbers.get(d.correctsInvoiceId) ?? null) : null,
        };
        const problem = pohodaProblem(doc);
        if (problem) {
          skip(d, `Not in the file: ${problem}. Enter it in Pohoda by hand`);
          continue;
        }
        taken.push({ record: d, doc });
      }

      if (!taken.length && !earlier) {
        const cancelled = skipped.filter((s) => s.reason.startsWith("Cancelled")).length;
        const exported = skipped.filter((s) => s.reason.startsWith("Exported")).length;
        const problems = skipped.length - cancelled - exported;
        const why = [
          exported ? `${exported} exported before (include them again to export them once more)` : "",
          cancelled ? `${cancelled} cancelled` : "",
          problems ? `${problems} whose figures do not add up` : "",
        ].filter(Boolean);
        throw APIError.failedPrecondition(`Nothing to export from ${period}: of ${docs.length} documents, ${why.join(", ")}`).withDetails({ skipped });
      }

      const icos = [...new Set(taken.map((x) => (x.record.supplier?.ico ?? "").trim()))];
      if (icos.length > 1) {
        throw APIError.failedPrecondition(`The documents name more than one issuer IČO (${icos.map((i) => i || "none").join(", ")}): Pohoda takes one company per file`);
      }
      const ico = icos[0] ?? "";

      const ordered = [...taken].sort((a, b) => pohodaOrder(a.doc, b.doc));
      const inFile = new Set(ordered.map((x) => x.record.id));
      const warnings: string[] = [];
      if (!ico) warnings.push("The documents carry no IČO of the issuer: Pohoda asks which company the file is for");
      for (const { record, doc } of ordered) {
        if (record.kind !== "credit_note" || !record.correctsInvoiceId) continue;
        if (inFile.has(record.correctsInvoiceId) || before.has(record.correctsInvoiceId)) continue;
        warnings.push(
          `Credit note ${record.number} corrects invoice ${doc.correctsNumber}, which this app has not exported to Pohoda: Pohoda needs that invoice first, or refuses the credit note`,
        );
      }
      const again = ordered.filter((x) => before.has(x.record.id)).map((x) => x.record.number);
      if (again.length) {
        const list = `${again.slice(0, 10).join(", ")}${again.length > 10 ? ` and ${again.length - 10} more` : ""}`;
        warnings.push(`Exported before and in this file again: ${list}. Pohoda refuses a number it already has, so remove them there first`);
      }
      const notes: PohodaExportNote[] = ordered.flatMap(({ record, doc }) => pohodaNotes(doc).map((note) => ({ number: record.number, note })));

      const xml = buildPohodaXml({
        id: `ST-${exportId}`,
        ico,
        note: `Faktury a opravné daňové doklady vystavené ${period} (Shipment Tracker)`,
        documents: ordered.map((x) => x.doc),
      });
      const bytes = encodeWindows1250(xml);
      const fileSha256 = createHash("sha256").update(bytes).digest("hex");
      const fileName = pohodaFileName(from, to);
      if (earlier) {
        // Never a different file under the same export: the documents and the bytes must be the ones recorded.
        const recorded = await repo.documentIdsOf(tx, actor.companyID, earlier.id);
        const same = recorded.size === ordered.length && ordered.every((x) => recorded.has(x.record.id)) && earlier.fileSha256 === fileSha256;
        if (!same) throw sameExportElsewhere();
      } else {
        await repo.record(
          tx,
          { id: exportId, companyId: actor.companyID, system: SYSTEM, fromDate: from, toDate: to, fileName, fileSha256, createdByUserId: actor.userID, createdBy: by },
          ordered.map((x) => x.record.id),
        );
      }

      const creditNotes = ordered.filter((x) => x.record.kind === "credit_note").length;
      return {
        exportId,
        fileName: earlier?.fileName || fileName,
        contentBase64: bytes.toString("base64"),
        contentType: "application/xml; charset=windows-1250",
        encoding: "windows-1250",
        fileSha256,
        from,
        to,
        documents: ordered.length,
        invoices: ordered.length - creditNotes,
        creditNotes,
        numbers: ordered.map((x) => x.record.number),
        skipped,
        notes,
        warnings,
      };
    });
  }

  /** The company's exports, the newest first (everyone). */
  async list(actor: Actor): Promise<AccountingExportsResponse> {
    const rows = await repo.list(actor.companyID, LIST_LIMIT);
    return {
      exports: rows.map((r) => ({
        id: r.id,
        system: r.system,
        from: r.fromDate,
        to: r.toDate,
        documents: r.documents,
        fileName: r.fileName,
        fileSha256: r.fileSha256,
        createdBy: r.createdBy,
        createdAt: r.createdAt.toISOString(),
      })),
      canExport: this.canExport(actor),
    };
  }
}

export const accountingExportService = new AccountingExportService();
