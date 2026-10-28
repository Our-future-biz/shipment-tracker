import { createHash, randomUUID } from "node:crypto";
import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { customers } from "~encore/clients";
import { businessDay } from "../../../lib/businessDate";
import { iso, isoOrNull } from "../../../lib/db/serialize";
import type { Actor } from "../../../lib/rbac";
import { userRefs } from "../../../lib/userNames";
import { isUuid } from "../../../lib/uuid";
import type { SheetPreview, SupplierTariffMode, SupplierTariffVersion, TariffFile, TariffFinding } from "../interfaces/interfaces";
import { findingTotals } from "../lib/railConvert";
import { readSheets, type ReadOptions, type Sheet } from "../lib/sheet";
import { tariffRepository, type DraftRows, type DraftTariff, type TariffFields } from "../repositories/tariff.repository";
import type { TariffLayout, TariffRecord, TariffVersionRecord } from "../schemas/tariff.schema";
import { tariffFileBucket } from "../storage/tariffFileBucket";

// What every kind of supplier tariff (rail, collections, ocean) does the same way: its suppliers in
// the Customer Database, the uploaded file and where it is kept, a draft saved, read again, approved
// or thrown away, a version found by its id and its tariff's kind, and a version as listed.

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const CONTENT_TYPES: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  csv: "text/csv",
  txt: "text/plain",
};
const contentTypeOf = (fileName: string) => CONTENT_TYPES[fileName.toLowerCase().split(".").pop() ?? ""] ?? "application/octet-stream";

export const businessToday = () => businessDay(new Date());

// Who supplies each kind of tariff: the Customer Database role, and how a refusal names it.
const SUPPLIERS = {
  rail: { role: "rail_operator", notOne: "This company is not a rail operator in the Customer Database", notTheirs: "This tariff is not one of the rail operator's" },
  collection: {
    role: "first_last_mile_haulier",
    notOne: "This company is not a first / last mile haulier in the Customer Database",
    notTheirs: "This tariff is not one of the haulier's",
  },
  ocean: { role: "shipping_line", notOne: "This company is not a shipping line in the Customer Database", notTheirs: "This tariff is not one of the shipping line's" },
} as const;

/** A version or tariff id from a URL; one that cannot be an id is simply not found. */
function requireId(id: string, what: string): string {
  if (!isUuid(id)) throw APIError.notFound(`${what} not found`);
  return id;
}

/**
 * The caller's company's suppliers of a kind of tariff (Customer Database companies with its role),
 * or those of `ids` that have it. The customers service takes the company from the caller's sign-in.
 */
export async function suppliersOf(mode: SupplierTariffMode, ids?: string[]) {
  if (ids && !ids.length) return [];
  const { companies } = await customers._internalCompaniesWithRole({ role: SUPPLIERS[mode].role, ids });
  return companies;
}

/** A supplier company as the Customer Database gives it. */
export type SupplierCompany = Awaited<ReturnType<typeof suppliersOf>>[number];

/** A supplier with its tariffs of one kind and their versions, newest first. */
export interface SupplierTariffs {
  company: SupplierCompany;
  tariffs: TariffRecord[];
  versions: TariffVersionRecord[];
}

/** The suppliers of a kind of tariff (or those of `ids`), by company name, each with its tariffs and their versions. */
export async function supplierTariffs(companyId: string, mode: SupplierTariffMode, ids?: string[]): Promise<SupplierTariffs[]> {
  const companies = await suppliersOf(mode, ids);
  if (!companies.length) return [];
  const tariffs = await tariffRepository.list(companyId, mode, companies.map((c) => c.id));
  const versions = await tariffRepository.versionsOf(companyId, tariffs.map((t) => t.id));
  return companies.map((company) => {
    const own = tariffs.filter((t) => t.supplierCustomerId === company.id);
    const ownIds = new Set(own.map((t) => t.id));
    return { company, tariffs: own, versions: versions.filter((v) => ownIds.has(v.tariffId)) };
  });
}

/** What every supplier list shows of a supplier: the company, and its tariffs at a glance. */
export interface SupplierGlance {
  customerId: string;
  companyName: string;
  ico: string;
  city: string;
  country: string;
  tariffCount: number;
  /** Versions that price on the day */
  activeCount: number;
  draftCount: number;
  /** The soonest end of a version pricing on the day, YYYY-MM-DD; null when none ends */
  activeUntil: string | null;
}

export function supplierGlance({ company, tariffs, versions }: SupplierTariffs, day: string): SupplierGlance {
  const pricing = versions.filter((v) => pricesOn(v, day));
  const ends = pricing.map((v) => v.validTo).filter((d): d is string => d !== null);
  return {
    customerId: company.id,
    companyName: company.companyName,
    ico: company.ico,
    city: company.city,
    country: company.country,
    tariffCount: tariffs.length,
    activeCount: pricing.length,
    draftCount: versions.filter((v) => v.status === "draft").length,
    activeUntil: ends.length ? ends.sort()[0]! : null,
  };
}

/** The file of an upload as bytes, refused when it has no name, is empty or is over 10 MB. */
export function uploadedFile(req: { fileName: string; fileBase64: string }): UploadedFile {
  const fileName = req.fileName.trim().slice(0, 200);
  if (!fileName) throw APIError.invalidArgument("The file name is missing");
  const bytes = Buffer.from(req.fileBase64, "base64");
  if (!bytes.length) throw APIError.invalidArgument("The file is empty");
  if (bytes.length > MAX_FILE_BYTES) throw APIError.invalidArgument("The file is larger than 10 MB");
  return { fileName, bytes };
}

export interface UploadedFile {
  fileName: string;
  bytes: Buffer;
}

/** What an upload is for: a supplier of the kind, and the tariff when it is a new version of one; refused otherwise. */
export interface UploadTarget {
  supplier: SupplierCompany;
  /** null for a new tariff */
  tariff: TariffRecord | null;
}

export async function uploadTarget(companyId: string, mode: SupplierTariffMode, supplierCustomerId: string, tariffId: string | undefined): Promise<UploadTarget> {
  const [supplier] = await suppliersOf(mode, [supplierCustomerId]);
  if (!supplier) throw APIError.notFound(SUPPLIERS[mode].notOne);
  if (!tariffId) return { supplier, tariff: null };
  const tariff = isUuid(tariffId) ? await tariffRepository.get(companyId, tariffId) : null;
  if (!tariff || tariff.mode !== mode || tariff.supplierCustomerId !== supplier.id) throw APIError.notFound(SUPPLIERS[mode].notTheirs);
  return { supplier, tariff };
}

/** The sheets of a file; a file that is no readable spreadsheet is refused as such. */
export async function sheetsOf(bytes: Buffer, fileName: string, options: ReadOptions = {}): Promise<Sheet[]> {
  let sheets: Sheet[];
  try {
    sheets = await readSheets(bytes, fileName, options);
  } catch (err) {
    if (err instanceof APIError) throw err;
    log.warn(err, "tariff: file not readable", { fileName });
    throw APIError.invalidArgument("The file could not be read as a spreadsheet. Save it as .xlsx in Excel and upload it again.");
  }
  if (!sheets.length) throw APIError.invalidArgument("The file has no rows");
  return sheets;
}

/** What reading a file with a layout gives a draft besides its rows: the layout and its dates, what the checks found, the sheets' first rows. */
export interface ReadFields {
  validFrom: string | null;
  validTo: string | null;
  currency: string;
  layout: TariffLayout;
  findings: TariffFinding[];
  preview: SheetPreview[];
  rowCount: number;
  warningCount: number;
  errorCount: number;
}

/** The finding of a layout the file cannot be read with at all (a sheet it does not have). */
export const unusableLayout = (problem: string): TariffFinding => ({ level: "error", code: "layout_unusable", message: problem, count: 1, rows: [] });

export function readFields(read: { layout: TariffLayout; currency: string; findings: TariffFinding[]; rowCount: number }, preview: SheetPreview[]): ReadFields {
  const totals = findingTotals(read.findings);
  return {
    validFrom: read.layout.validFrom,
    validTo: read.layout.validTo,
    currency: read.currency,
    layout: read.layout,
    findings: read.findings,
    preview,
    rowCount: read.rowCount,
    warningCount: totals.warnings,
    errorCount: totals.errors,
  };
}

/** Keeps an uploaded file in the bucket under the company's own prefix; its key goes on the version. */
async function storeSource(companyId: string, fileName: string, bytes: Buffer): Promise<string> {
  const key = `${companyId}/${randomUUID()}/${fileName.replace(/[^\w.-]+/g, "_")}`;
  await tariffFileBucket.upload(key, bytes, { contentType: contentTypeOf(fileName) });
  return key;
}

/** Removes the file of an upload whose draft could not be saved. */
async function dropSource(key: string): Promise<void> {
  await tariffFileBucket.remove(key).catch((e) => log.warn("could not remove the file of a tariff upload that failed", { key, error: String(e) }));
}

/**
 * Saves an upload as a new draft with its rows: the file is kept first, and removed again when the
 * draft cannot be saved. The id of the new version.
 */
export async function saveDraft(
  actor: Actor,
  file: UploadedFile,
  tariff: DraftTariff,
  fields: ReadFields & { layoutSource: "ai" | "remembered" },
  rows: DraftRows,
): Promise<string> {
  const key = await storeSource(actor.companyID, file.fileName, file.bytes);
  try {
    const version = await tariffRepository.createDraft(
      actor.companyID,
      tariff,
      {
        ...fields,
        sourceFileName: file.fileName,
        sourceSha256: createHash("sha256").update(file.bytes).digest("hex"),
        sourceKey: key,
        createdByUserId: actor.userID,
        createdBy: await userName(actor.userID),
      },
      rows,
    );
    return version.id;
  } catch (err) {
    await dropSource(key);
    throw err;
  }
}

/** The sheets of a draft's kept file, to read again with a corrected layout; refused for a version that is no draft or has no file. */
export async function draftSheets(v: TariffVersionRecord, options: ReadOptions = {}): Promise<Sheet[]> {
  if (v.status !== "draft") throw APIError.failedPrecondition("Only a draft's layout can be changed");
  if (!v.sourceKey) throw APIError.failedPrecondition("This version has no file to read again");
  return sheetsOf(await tariffFileBucket.download(v.sourceKey), v.sourceFileName ?? "tariff.xlsx", options);
}

/** Replaces a draft's rows and findings with those of a corrected layout. */
export async function replaceDraft(companyId: string, versionId: string, fields: ReadFields, rows: DraftRows): Promise<void> {
  const updated = await tariffRepository.replaceDraft(companyId, versionId, { ...fields, layoutSource: "edited" }, rows);
  if (!updated) throw APIError.failedPrecondition("This version is not a draft any more");
}

/** Approves a draft without errors: it prices from its start date, earlier versions give way. The repository's reason when it cannot. */
export async function approveVersion(actor: Actor, versionId: string): Promise<void> {
  const result = await tariffRepository.approve(actor.companyID, requireId(versionId, "Tariff version"), (await userName(actor.userID)) ?? "");
  if (result.ok) return;
  if (result.reason === "not_found") throw APIError.notFound("Tariff version not found");
  throw APIError.failedPrecondition(result.reason);
}

/** Throws a draft of the kind away; the file stays in storage with the soft-deleted version. */
export async function discardVersion(companyId: string, versionId: string, mode: SupplierTariffMode): Promise<void> {
  await versionOfMode(companyId, versionId, mode);
  if (!(await tariffRepository.discard(companyId, versionId))) throw APIError.failedPrecondition("Only a draft can be discarded");
}

/** The file a version of the kind was read from, as uploaded. */
export async function sourceFile(companyId: string, versionId: string, mode: SupplierTariffMode): Promise<TariffFile> {
  const { v } = await versionOfMode(companyId, versionId, mode);
  if (!v.sourceKey) throw APIError.notFound("This version has no file");
  const fileName = v.sourceFileName ?? `tariff-v${v.versionNo}.xlsx`;
  const bytes = await tariffFileBucket.download(v.sourceKey);
  return { fileName, fileBase64: bytes.toString("base64"), contentType: contentTypeOf(fileName) };
}

/** A tariff's name as saved: trimmed, at most 200 characters; refused when empty. */
export function tariffName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw APIError.invalidArgument("The tariff needs a name");
  return trimmed.slice(0, 200);
}

/** Changes a tariff of the kind; its versions and prices stay as they are. */
export async function updateTariff(companyId: string, tariffId: string, mode: SupplierTariffMode, fields: Partial<TariffFields>): Promise<TariffRecord> {
  await tariffOfMode(companyId, tariffId, mode);
  const row = await tariffRepository.update(companyId, tariffId, fields);
  if (!row) throw APIError.notFound("Tariff not found");
  return row;
}

/** A user's display name, for who uploaded or approved; null when unknown. */
export async function userName(userId: string): Promise<string | null> {
  return (await userRefs([userId])).get(userId)?.name ?? null;
}

/**
 * A live version and its tariff, when the tariff is of the kind asked for: a rail version is not
 * found among collections and the other way round.
 */
export async function versionOfMode(companyId: string, versionId: string, mode: SupplierTariffMode): Promise<{ v: TariffVersionRecord; t: TariffRecord }> {
  const v = await tariffRepository.getVersion(companyId, requireId(versionId, "Tariff version"));
  const t = v ? await tariffRepository.get(companyId, v.tariffId) : null;
  if (!v || !t || t.mode !== mode) throw APIError.notFound("Tariff version not found");
  return { v, t };
}

/** A tariff of the kind asked for; not found otherwise. */
async function tariffOfMode(companyId: string, tariffId: string, mode: SupplierTariffMode): Promise<TariffRecord> {
  const t = await tariffRepository.get(companyId, requireId(tariffId, "Tariff"));
  if (!t || t.mode !== mode) throw APIError.notFound("Tariff not found");
  return t;
}

export const summaryOf = (v: TariffVersionRecord): SupplierTariffVersion => ({
  id: v.id,
  tariffId: v.tariffId,
  versionNo: v.versionNo,
  status: v.status,
  validFrom: v.validFrom,
  validTo: v.validTo,
  currency: v.currency,
  rowCount: v.rowCount,
  warningCount: v.warningCount,
  errorCount: v.errorCount,
  layoutSource: v.layoutSource,
  sourceFileName: v.sourceFileName,
  createdAt: iso(v.createdAt),
  createdBy: v.createdBy,
  activatedAt: isoOrNull(v.activatedAt),
  activatedBy: v.activatedBy,
});

/** Whether a version prices on `day`: approved and within its dates. */
const pricesOn = (v: TariffVersionRecord, day: string) => v.status === "active" && (v.validFrom ?? "") <= day && (v.validTo === null || v.validTo >= day);
