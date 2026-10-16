import { randomUUID } from "node:crypto";
import { APIError } from "encore.dev/api";
import { gateFileRepository } from "../repositories/gateFile.repository";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { gateFileBucket } from "../storage/gateFileBucket";
import type { GateFileRecord } from "../schemas/gateFile.schema";
import type { GateFileItem } from "../interfaces/gate.interfaces";
import { checkRequestId } from "./offline";
import { isUniqueViolation } from "../../../lib/db/errors";
import { userName } from "./users";
import { servedFileType, storedFileType } from "./fileType";

// A single upload may be up to 25 MB; the page shows usage against ~20 MB per shipment.
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

const toItem = (f: GateFileRecord): GateFileItem => ({
  id: f.id,
  movementId: f.movementId,
  container: f.container,
  tag: f.tag,
  fileName: f.fileName,
  fileSize: f.fileSize,
  fileType: servedFileType(f.fileType),
  uploadedBy: f.uploadedBy,
  createdAt: f.createdAt.toISOString(),
});

class GateFileService {
  private async movement(movementId: string, companyId: string) {
    const m = await gateMovementRepository.findById(movementId, companyId);
    if (!m) throw APIError.notFound("Gate movement not found");
    return m;
  }

  async list(movementId: string, companyId: string) {
    await this.movement(movementId, companyId);
    return (await gateFileRepository.listForMovement(movementId, companyId)).map(toItem);
  }

  async upload(
    movementId: string,
    companyId: string,
    userId: string,
    input: { fileName: string; fileType: string; contentBase64: string; container?: string; tag?: string; clientRequestId?: string },
  ) {
    await this.movement(movementId, companyId);
    // Floor mode: a photo sent again (offline queue, lost answer) returns the file already stored.
    const requestId = checkRequestId(input.clientRequestId);
    const prev = requestId ? await gateFileRepository.findByRequestId(movementId, companyId, requestId) : null;
    if (prev) return toItem(prev);
    if (!input.fileName.trim()) throw APIError.invalidArgument("fileName is required");
    const buffer = Buffer.from(input.contentBase64 ?? "", "base64");
    if (!buffer.length) throw APIError.invalidArgument("The file is empty");
    if (buffer.length > MAX_FILE_BYTES) throw APIError.invalidArgument("The file is larger than 25 MB");

    // The type comes from the bytes, never from what the client claims: an HTML or SVG file
    // named .jpg is stored (and served) as a download.
    const fileType = storedFileType(buffer);
    const storageKey = `${companyId}/${movementId}/${randomUUID()}`;
    await gateFileBucket.upload(storageKey, buffer, { contentType: fileType });
    const uploadedBy = await userName(userId);
    try {
      const row = await gateFileRepository.create({
        companyId,
        movementId,
        container: input.container ?? "",
        tag: input.tag ?? "",
        fileName: input.fileName.trim(),
        fileSize: buffer.length,
        fileType,
        storageKey,
        uploadedBy,
        ...(requestId ? { clientRequestId: requestId } : {}),
      });
      return toItem(row);
    } catch (err) {
      // Two copies of one upload at once: the first one stored is the file (the other copy's
      // bytes stay in the bucket unused, as removed files' bytes do).
      const first = requestId && isUniqueViolation(err) ? await gateFileRepository.findByRequestId(movementId, companyId, requestId) : null;
      if (!first) throw err;
      return toItem(first);
    }
  }

  // Bytes come back through an authenticated call; the browser turns them into an object URL.
  async content(movementId: string, fileId: string, companyId: string) {
    const f = await gateFileRepository.findById(fileId, movementId, companyId);
    if (!f) throw APIError.notFound("File not found");
    const buffer = await gateFileBucket.download(f.storageKey);
    return { fileName: f.fileName, fileType: servedFileType(f.fileType), contentBase64: buffer.toString("base64") };
  }

  // Metadata is archived; the stored bytes are kept (survey evidence).
  async remove(movementId: string, fileId: string, companyId: string) {
    const row = await gateFileRepository.softDelete(fileId, movementId, companyId);
    if (!row) throw APIError.notFound("File not found");
  }
}

export const gateFileService = new GateFileService();
