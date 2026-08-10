import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { attachmentService } from "../services/attachment.service";
import type { AttachmentItem } from "../interfaces/interfaces";

interface AttachmentCreateRequest {
  shipmentId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  contentBase64?: string;
}

interface AttachmentCreateResponse {
  attachment: AttachmentItem;
}

export const attachmentCreate = api(
  // 50 MiB — base64 inflates bytes ~33%, so this allows raw files up to ~37 MiB.
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/attachments", bodyLimit: 50 * 1024 * 1024 },
  async (req: AttachmentCreateRequest): Promise<AttachmentCreateResponse> => {
    if (!req.fileName) {
      throw APIError.invalidArgument("fileName is required");
    }
    const attachment = await attachmentService.create(req.shipmentId, getAuthData()!.companyID, req.fileName, req.fileSize ?? 0, req.fileType ?? "", req.contentBase64 ?? "");
    return { attachment: attachment as unknown as AttachmentItem };
  },
);
