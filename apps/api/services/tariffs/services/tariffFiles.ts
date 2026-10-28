import { randomUUID } from "node:crypto";
import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { businessDay } from "../../../lib/businessDate";
import { iso, isoOrNull } from "../../../lib/db/serialize";
import { userRefs } from "../../../lib/userNames";
import { isUuid } from "../../../lib/uuid";
import type { SupplierTariffMode, SupplierTariffVersion, TariffFile } from "../interfaces/interfaces";
import { readSheets, type ReadOptions, type Sheet } from "../lib/sheet";
import { tariffRepository } from "../repositories/tariff.repository";
import type { TariffRecord, TariffVersionRecord } from "../schemas/tariff.schema";
import { tariffFileBucket } from "../storage/tariffFileBucket";

// What every kind of supplier tariff (rail, collections) does the same way: the uploaded file and
// where it is kept, a version found by its id and its tariff's kind, and a version as listed.

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const CONTENT_TYPES: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  csv: "text/csv",
  txt: "text/plain",
};
export const contentTypeOf = (fileName: string) => CONTENT_TYPES[fileName.toLowerCase().split(".").pop() ?? ""] ?? "application/octet-stream";

export const businessToday = () => businessDay(new Date());

export const isRealDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d);

/** A version or tariff id from a URL; one that cannot be an id is simply not found. */
export function requireId(id: string, what: string): string {
  if (!isUuid(id)) throw APIError.notFound(`${what} not found`);
  return id;
}

/** The file of an upload as bytes, refused when it has no name, is empty or is over 10 MB. */
export function uploadedFile(req: { fileName: string; fileBase64: string }): { fileName: string; bytes: Buffer } {
  const fileName = req.fileName.trim().slice(0, 200);
  if (!fileName) throw APIError.invalidArgument("The file name is missing");
  const bytes = Buffer.from(req.fileBase64, "base64");
  if (!bytes.length) throw APIError.invalidArgument("The file is empty");
  if (bytes.length > MAX_FILE_BYTES) throw APIError.invalidArgument("The file is larger than 10 MB");
  return { fileName, bytes };
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

/** Keeps an uploaded file in the bucket; its key goes on the version. */
export async function storeSource(companyId: string, fileName: string, bytes: Buffer): Promise<string> {
  const key = `${companyId}/${randomUUID()}/${fileName.replace(/[^\w.-]+/g, "_")}`;
  await tariffFileBucket.upload(key, bytes, { contentType: contentTypeOf(fileName) });
  return key;
}

/** Removes the file of an upload whose draft could not be saved. */
export async function dropSource(key: string): Promise<void> {
  await tariffFileBucket.remove(key).catch((e) => log.warn("could not remove the file of a tariff upload that failed", { key, error: String(e) }));
}

/** The file a version was read from. */
export async function sourceFile(v: TariffVersionRecord): Promise<TariffFile> {
  if (!v.sourceKey) throw APIError.notFound("This version has no file");
  const fileName = v.sourceFileName ?? `tariff-v${v.versionNo}.xlsx`;
  const bytes = await tariffFileBucket.download(v.sourceKey);
  return { fileName, fileBase64: bytes.toString("base64"), contentType: contentTypeOf(fileName) };
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
export async function tariffOfMode(companyId: string, tariffId: string, mode: SupplierTariffMode): Promise<TariffRecord> {
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
export const pricesOn = (v: TariffVersionRecord, day: string) => v.status === "active" && (v.validFrom ?? "") <= day && (v.validTo === null || v.validTo >= day);
