import { randomUUID } from "node:crypto";
import { APIError } from "encore.dev/api";
import { auth } from "~encore/clients";
import { gateFileRepository } from "../repositories/gateFile.repository";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { gateFileBucket } from "../storage/gateFileBucket";
import type { GateFileRecord } from "../schemas/gateFile.schema";
import type { GateFileItem } from "../interfaces/gate.interfaces";

// A single upload may be up to 25 MB; the page shows usage against ~20 MB per shipment.
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

const toItem = (f: GateFileRecord): GateFileItem => ({
  id: f.id,
  movementId: f.movementId,
  container: f.container,
  tag: f.tag,
  fileName: f.fileName,
  fileSize: f.fileSize,
  fileType: f.fileType,
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
    input: { fileName: string; fileType: string; contentBase64: string; container?: string; tag?: string },
  ) {
    await this.movement(movementId, companyId);
    if (!input.fileName.trim()) throw APIError.invalidArgument("fileName is required");
    const buffer = Buffer.from(input.contentBase64 ?? "", "base64");
    if (!buffer.length) throw APIError.invalidArgument("The file is empty");
    if (buffer.length > MAX_FILE_BYTES) throw APIError.invalidArgument("The file is larger than 25 MB");

    const storageKey = `${companyId}/${movementId}/${randomUUID()}`;
    await gateFileBucket.upload(storageKey, buffer, { contentType: input.fileType || "application/octet-stream" });
    let uploadedBy = "";
    try {
      const { users } = await auth.usersList();
      const me = users.find((u) => u.id === userId);
      uploadedBy = me?.displayName || me?.email || "";
    } catch {
      // Name is cosmetic — keep the upload.
    }
    const row = await gateFileRepository.create({
      companyId,
      movementId,
      container: input.container ?? "",
      tag: input.tag ?? "",
      fileName: input.fileName.trim(),
      fileSize: buffer.length,
      fileType: input.fileType ?? "",
      storageKey,
      uploadedBy,
    });
    return toItem(row);
  }

  // Bytes come back through an authenticated call; the browser turns them into an object URL.
  async content(movementId: string, fileId: string, companyId: string) {
    const f = await gateFileRepository.findById(fileId, movementId, companyId);
    if (!f) throw APIError.notFound("File not found");
    const buffer = await gateFileBucket.download(f.storageKey);
    return { fileName: f.fileName, fileType: f.fileType, contentBase64: buffer.toString("base64") };
  }

  // Metadata is archived; the stored bytes are kept (survey evidence).
  async remove(movementId: string, fileId: string, companyId: string) {
    const row = await gateFileRepository.softDelete(fileId, movementId, companyId);
    if (!row) throw APIError.notFound("File not found");
  }
}

export const gateFileService = new GateFileService();
