import { createHash, randomUUID } from "node:crypto";
import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { tariffRepository } from "../repositories/tariff.repository";
import { tariffFileBucket } from "../storage/tariffFileBucket";
import type { TruckingTariffRecord, TruckingTariffVersionRecord } from "../schemas/truckingTariff.schema";
import type { FileDownload, TariffImportResult } from "../interfaces/interfaces";
import { businessDay } from "../../../lib/businessDate";
import { isManager } from "../lib/roles";
import { cleanVersionInput } from "../lib/tariffRules";
import {
  emptyTemplateInput,
  fileSlug,
  MAX_FILE_BYTES,
  readTariffWorkbook,
  UnreadableFileError,
  writeTariffWorkbook,
  XLSX_CONTENT_TYPE,
} from "../lib/tariffWorkbook";
import { settingsService } from "./settings.service";
import { customerNames, tariffService } from "./tariff.service";

// The Excel side of tariffs: the template to fill in (a version exported, or the empty template),
// the import of a filled file into a new draft (the file is kept), and the file a version came from.

export const DISCOUNT_NO_FILE = "A discount tariff follows the Standard list and has no file of its own";

const today = () => businessDay(new Date());

/** The base64 length of MAX_FILE_BYTES, with room for padding and line breaks. */
const MAX_BASE64_LENGTH = Math.ceil(MAX_FILE_BYTES / 3) * 4 + 1024;

const download = (fileName: string, bytes: Buffer): FileDownload => ({
  fileName,
  fileBase64: bytes.toString("base64"),
  contentType: XLSX_CONTENT_TYPE,
});

class TariffFileService {
  /** A MATRIX tariff, or invalid_argument for a discount tariff (it has no file). */
  private async matrixTariff(companyId: string, tariffId: string): Promise<TruckingTariffRecord> {
    const t = await tariffService.tariff(companyId, tariffId);
    if (t.mode === "DISCOUNT") throw APIError.invalidArgument(DISCOUNT_NO_FILE);
    return t;
  }

  /**
   * The file to fill in: the chosen version exported, else the version active today, else the
   * empty template (Meta from the settings factors, a D1 sheet without prices, the fuel surcharge).
   */
  async template(companyId: string, tariffId: string, versionId?: string): Promise<FileDownload> {
    const t = await this.matrixTariff(companyId, tariffId);
    const day = today();
    let version: TruckingTariffVersionRecord | null;
    if (versionId) {
      version = await tariffService.versionRow(companyId, versionId);
      if (version.tariffId !== t.id) throw APIError.notFound("Tariff version not found");
    } else {
      version = (await tariffRepository.bindingOn(companyId, [t.id], day))[0] ?? null;
    }
    const [settings, names] = await Promise.all([settingsService.get(companyId), customerNames([t.ownerCustomerId])]);
    const bytes = await writeTariffWorkbook({
      tariff: {
        name: t.name,
        side: t.side,
        scope: t.scope,
        ownerName: t.ownerCustomerId ? (names.get(t.ownerCustomerId) ?? null) : null,
        currency: t.currency,
        zoneBy: t.zoneBy,
      },
      input: version ? version.input : emptyTemplateInput(settings.factors, day),
      levelLabels: Object.fromEntries(settings.serviceLevels.map((l) => [l.code, l.label])),
      extraLevels: version ? [] : ["D1"],
    });
    return download(`${fileSlug(t.name)}-${version ? `v${version.versionNo}` : "template"}.xlsx`, bytes);
  }

  /**
   * Manager only. Reads a filled file into a new DRAFT, saved even with errors (they keep it from
   * activation): the findings are the problems met reading the file plus the version's own. The
   * file is kept in the bucket under the new version's id.
   */
  async import(companyId: string, userId: string, role: string, tariffId: string, fileName: string, fileBase64: string): Promise<TariffImportResult> {
    if (!isManager(role)) throw APIError.permissionDenied("Only a manager can upload a tariff file");
    const t = await this.matrixTariff(companyId, tariffId);
    const name = typeof fileName === "string" ? fileName.trim().slice(0, 200) : "";
    if (!name) throw APIError.invalidArgument("The file name is missing");
    if (typeof fileBase64 !== "string" || !fileBase64) throw APIError.invalidArgument("The file is empty");
    if (fileBase64.length > MAX_BASE64_LENGTH) throw APIError.invalidArgument("The file is larger than 5 MB");
    const bytes = Buffer.from(fileBase64, "base64");
    if (!bytes.length) throw APIError.invalidArgument("The file is empty");

    const settings = await settingsService.get(companyId);
    let parsed;
    try {
      parsed = await readTariffWorkbook(bytes, { factors: settings.factors, today: today() });
    } catch (e) {
      if (e instanceof UnreadableFileError) throw APIError.invalidArgument(e.message);
      throw e;
    }
    const input = cleanVersionInput(parsed.input);

    const id = randomUUID();
    const key = `${companyId}/${t.id}/${id}.xlsx`;
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    await tariffFileBucket.upload(key, bytes, { contentType: XLSX_CONTENT_TYPE });
    try {
      const version = await tariffService.saveDraft(companyId, userId, t, input, { id, name, sha256, key, parseFindings: parsed.findings });
      return { version, sheets: parsed.sheets };
    } catch (e) {
      await tariffFileBucket.remove(key).catch((err) => log.warn("could not remove the file of a tariff import that failed", { key, error: String(err) }));
      throw e;
    }
  }

  /** The file a version was imported from; not_found when it was entered without one. */
  async source(companyId: string, versionId: string): Promise<FileDownload> {
    const row = await tariffService.versionRow(companyId, versionId);
    if (!row.sourceKey) throw APIError.notFound("This version was not uploaded from a file");
    return download(row.sourceFileName ?? `tariff-v${row.versionNo}.xlsx`, await tariffFileBucket.download(row.sourceKey));
  }
}

export const tariffFileService = new TariffFileService();
