import { createHash, randomUUID } from "node:crypto";
import { APIError } from "encore.dev/api";
import { businessDay, isRealYmd } from "../../../lib/businessDate";
import { userEmailOf } from "../../../lib/companyUsers";
import type { Actor } from "../../../lib/rbac";
import { canDecideQuoteInquiry } from "../../../lib/salesPolicy";
import { isUuid } from "../../../lib/uuid";
import { czDate } from "../lib/invoicePdf";
import { buildPohodaXml, encodeWindows1250, pohodaFileName, pohodaNotes, pohodaOrder, pohodaProblem, type PohodaDocument } from "../lib/pohodaXml";
import { accountingExportRepository as repo, type ExportedBefore, type ExportTx } from "../repositories/accountingExport.repository";
import type { AccountingExportRecord } from "../schemas/accountingExport.schema";
import type { InvoiceRecord } from "../schemas/invoice.schema";
import type {
  AccountingExportFileResponse,
  AccountingExportsResponse,
  PohodaExportNote,
  PohodaExportResponse,
  PohodaExportSkipped,
} from "../interfaces/accountingExport";

// Accounts Receivable step 7: issued invoices and credit notes of a period (by issue day) as a Pohoda XML import file
// (lib/pohodaXml). Managers export; the file and the documents it carried are recorded in the transaction that builds
// it, so the next export leaves them out unless the manager includes them again. Cancelled invoices never go: they
// were withdrawn on the day they were issued and issued again under a new number.
//
// An export answered again (its idempotency key sent again after a lost answer) and "Download again" on the list both
// build the file from the export's own recorded documents, never from the period as it is now (a document issued in
// the period since would make it another file), and check it against the recorded SHA-256 (mock test council m1).
// Managers only, the list too (X6).

const SYSTEM = "pohoda" as const;
/** More in one period: choose a shorter one (the file stays a size a person can import and check) */
export const MAX_DOCUMENTS = 5000;
/** At most a year per file */
export const MAX_DAYS = 366;
const LIST_LIMIT = 200;

const managersOnly = () => APIError.permissionDenied("Only a manager exports invoices to Pohoda");
const listManagersOnly = () => APIError.permissionDenied("Only a manager sees the exports to Pohoda");
const exportNotThere = () => APIError.notFound("This export is not there");

const exportedText = (b: ExportedBefore) => `${czDate(businessDay(b.at))} (${b.fileName})`;
const daysFrom = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

const CANCELLED =
  "Cancelled: withdrawn on the day it was issued and issued again under a new number, so it is not a document for the books";
const NOT_IN_THIS_EXPORT = "Not in this export (it was made before this document could go in): it goes in the next export";

/**
 * Mock test council n4: a document an export recorded that is cancelled now - answered again or downloaded again, the
 * file stays the recorded bytes (it carries the document), so each such one is named, once.
 */
export function cancelledSinceWarnings(docs: readonly Pick<InvoiceRecord, "number" | "status">[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of docs) {
    if (d.status !== "cancelled" || seen.has(d.number)) continue;
    seen.add(d.number);
    out.push(`${d.number} was cancelled after this export was made: it is still in this file. If the file was imported in Pohoda, remove ${d.number} there`);
  }
  return out;
}

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
const notTheSameFile = () =>
  APIError.failedPrecondition("The file of this export could not be built again exactly as it was recorded: export the period again, or ask for help before importing anything");

type Taken = { record: InvoiceRecord; doc: PohodaDocument };

/** The file of these documents: Pohoda's order, one issuer IČO, the XML in Windows-1250 bytes and their SHA-256. */
function fileOf(exportId: string, from: string, to: string, taken: readonly Taken[]): { ordered: Taken[]; ico: string; bytes: Buffer; fileSha256: string } {
  const icos = [...new Set(taken.map((x) => (x.record.supplier?.ico ?? "").trim()))];
  if (icos.length > 1) {
    throw APIError.failedPrecondition(`The documents name more than one issuer IČO (${icos.map((i) => i || "none").join(", ")}): Pohoda takes one company per file`);
  }
  const ico = icos[0] ?? "";
  const ordered = [...taken].sort((a, b) => pohodaOrder(a.doc, b.doc));
  const xml = buildPohodaXml({
    id: `ST-${exportId}`,
    ico,
    note: `Faktury a opravné daňové doklady vystavené ${czDate(from)} – ${czDate(to)} (Shipment Tracker)`,
    documents: ordered.map((x) => x.doc),
  });
  const bytes = encodeWindows1250(xml);
  return { ordered, ico, bytes, fileSha256: createHash("sha256").update(bytes).digest("hex") };
}

/** Each document with its lines and, for a credit note, the number of the invoice it corrects (read once for all). */
async function pohodaDocsOf(tx: ExportTx, companyId: string, docs: readonly InvoiceRecord[]): Promise<(d: InvoiceRecord) => PohodaDocument> {
  const correctsIds = docs.flatMap((d) => (d.kind === "credit_note" && d.correctsInvoiceId ? [d.correctsInvoiceId] : []));
  const [numbers, lines] = await Promise.all([repo.numbersOf(tx, companyId, correctsIds), repo.linesOf(tx, companyId, docs.map((d) => d.id))]);
  return (d) => ({
    invoice: d,
    lines: lines.get(d.id) ?? [],
    correctsNumber: d.kind === "credit_note" && d.correctsInvoiceId ? (numbers.get(d.correctsInvoiceId) ?? null) : null,
  });
}

/** An export's own documents as recorded, read again (their issued records never change); null when one is gone. */
async function recordedDocs(tx: ExportTx, companyId: string, record: AccountingExportRecord, period?: readonly InvoiceRecord[]): Promise<InvoiceRecord[] | null> {
  const ids = await repo.documentIdsOf(tx, companyId, record.id);
  const inPeriod = (period ?? []).filter((d) => ids.has(d.id));
  const missing = [...ids].filter((id) => !inPeriod.some((d) => d.id === id));
  const rest = missing.length ? await repo.documentsByIds(tx, companyId, missing) : [];
  const docs = [...inPeriod, ...rest];
  return docs.length === ids.size ? docs : null;
}

class AccountingExportService {
  canExport = (actor: Pick<Actor, "role">) => canDecideQuoteInquiry(actor.role);

  /**
   * The Pohoda file of the documents issued from `from` to `to`, recorded as an export. With an idempotency key, the
   * same key again (a double click, a retry after a lost answer) answers that export again - its file built from the
   * documents it recorded, checked against the recorded SHA-256 - and records nothing more.
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
      // The same key made this export before (under the same lock): answered again from what it recorded.
      const earlier = key ? await repo.exportById(tx, actor.companyID, exportId) : null;
      if (earlier && (earlier.fromDate !== from || earlier.toDate !== to)) throw sameExportElsewhere();
      const docs = await repo.issuedIn(tx, actor.companyID, from, to, MAX_DOCUMENTS + 1);
      if (!earlier && docs.length > MAX_DOCUMENTS) throw APIError.invalidArgument(`More than ${MAX_DOCUMENTS} documents were issued from ${period}: choose a shorter period`);
      if (!earlier && !docs.length) throw APIError.failedPrecondition(`No invoice or credit note was issued from ${period}: there is nothing to export`);
      const recorded = earlier ? await recordedDocs(tx, actor.companyID, earlier, docs) : null;
      if (earlier && !recorded) throw notTheSameFile();
      const recordedIds = new Set((recorded ?? []).map((d) => d.id));
      const all = [...docs, ...(recorded ?? []).filter((d) => !docs.some((x) => x.id === d.id))];

      const correctsIds = all.flatMap((d) => (d.kind === "credit_note" && d.correctsInvoiceId ? [d.correctsInvoiceId] : []));
      // An export answered again sees what its first answer saw: the exports made before it.
      const before = await repo.exportedBefore(tx, actor.companyID, SYSTEM, [...all.map((d) => d.id), ...correctsIds], earlier?.createdAt);
      const docOf = await pohodaDocsOf(tx, actor.companyID, all);

      const skipped: PohodaExportSkipped[] = [];
      const chosen: Taken[] = [];
      const skip = (d: InvoiceRecord, reason: string) => skipped.push({ number: d.number, kind: d.kind, issueDate: d.issueDate, reason });
      for (const d of docs) {
        // Answered again: a recorded document is in the file whatever became of it since (cancelled, or the
        // "include exported" choice not sent again), so it is never listed as skipped.
        if (earlier && recordedIds.has(d.id)) continue;
        const exported = before.get(d.id);
        if (d.status === "cancelled") {
          skip(d, exported ? `${CANCELLED}. It was exported to Pohoda on ${exportedText(exported)}: remove it there` : CANCELLED);
          continue;
        }
        if (exported && !includeExported) {
          skip(d, `Exported to Pohoda on ${exportedText(exported)}`);
          continue;
        }
        const doc = docOf(d);
        const problem = pohodaProblem(doc);
        if (problem) {
          skip(d, `Not in the file: ${problem}. Enter it in Pohoda by hand`);
          continue;
        }
        // Answered again: only what the export recorded is in its file; anything else of the period waits for the next.
        if (earlier && !recordedIds.has(d.id)) {
          skip(d, NOT_IN_THIS_EXPORT);
          continue;
        }
        chosen.push({ record: d, doc });
      }
      // Answered again: exactly the recorded documents, whatever the period holds now.
      const taken: Taken[] = earlier ? (recorded ?? []).map((d) => ({ record: d, doc: docOf(d) })) : chosen;

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

      const { ordered, ico, bytes, fileSha256 } = fileOf(exportId, from, to, taken);
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
        warnings.push(`Exported before and in this file again: ${list}. Pohoda refuses a number it already has: if an earlier file was imported there, remove them in Pohoda first`);
      }
      // Answered again: a recorded document cancelled since is in the file all the same - named (n4).
      if (earlier) warnings.push(...cancelledSinceWarnings(ordered.map((x) => x.record)));
      const notes: PohodaExportNote[] = ordered.flatMap(({ record, doc }) => pohodaNotes(doc).map((note) => ({ number: record.number, note })));

      const fileName = pohodaFileName(from, to);
      if (earlier) {
        // Never a different file under the same export: the bytes must be the ones recorded.
        if (earlier.fileSha256 !== fileSha256) throw notTheSameFile();
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

  /**
   * "Download again" (m1): an export's file built again from the documents it recorded, checked against the recorded
   * SHA-256 - the same bytes as its first answer. Records nothing. Managers only. A recorded document cancelled since is
   * named in a warning (n4): the bytes stay as recorded.
   */
  async exportFile(actor: Actor, exportId: string): Promise<AccountingExportFileResponse> {
    if (!this.canExport(actor)) throw managersOnly();
    if (!isUuid(exportId)) throw exportNotThere();
    return repo.inExport(actor.companyID, SYSTEM, async (tx) => {
      const record = await repo.exportById(tx, actor.companyID, exportId);
      if (!record) throw exportNotThere();
      const docs = await recordedDocs(tx, actor.companyID, record);
      if (!docs || !docs.length) throw notTheSameFile();
      const docOf = await pohodaDocsOf(tx, actor.companyID, docs);
      const { ordered, bytes, fileSha256 } = fileOf(record.id, record.fromDate, record.toDate, docs.map((d) => ({ record: d, doc: docOf(d) })));
      if (fileSha256 !== record.fileSha256) throw notTheSameFile();
      return {
        exportId: record.id,
        fileName: record.fileName,
        contentBase64: bytes.toString("base64"),
        contentType: "application/xml; charset=windows-1250",
        encoding: "windows-1250",
        fileSha256,
        documents: ordered.length,
        warnings: cancelledSinceWarnings(ordered.map((x) => x.record)),
      };
    });
  }

  /** The company's exports, the newest first (managers only, X6: the list names every file handed to the books). */
  async list(actor: Actor): Promise<AccountingExportsResponse> {
    if (!this.canExport(actor)) throw listManagersOnly();
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
