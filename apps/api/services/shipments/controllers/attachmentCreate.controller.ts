import { api, APIError } from "encore.dev/api";
import { attachmentService } from "../services/attachment.service";
import type { AttachmentItem } from "../interfaces/interfaces";

interface AttachmentCreateRequest {
  shipmentId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  storageKey?: string;
}

interface AttachmentCreateResponse {
  attachment: AttachmentItem;
}

export const attachmentCreate = api(
  { expose: true, auth: false, method: "POST", path: "/shipments/:shipmentId/attachments" },
  async (req: AttachmentCreateRequest): Promise<AttachmentCreateResponse> => {
    if (!req.fileName) {
      throw APIError.invalidArgument("fileName is required");
    }
    const attachment = await attachmentService.create(req.shipmentId, req.fileName, req.fileSize ?? 0, req.fileType ?? "", req.storageKey ?? "");
    return { attachment: attachment as unknown as AttachmentItem };
  },
);
