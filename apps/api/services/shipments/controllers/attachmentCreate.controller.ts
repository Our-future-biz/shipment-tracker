import { api } from "encore.dev/api";
import type { Min, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { attachmentService } from "../services/attachment.service";
import type { AttachmentItem } from "../interfaces/interfaces";

interface AttachmentCreateRequest {
  shipmentId: string;
  fileName: string & MinLen<1>;
  fileSize: number & Min<0>;
  fileType: string;
  contentBase64?: string;
  /** Optional business document type set right at upload. */
  documentType?: string;
}

interface AttachmentCreateResponse {
  attachment: AttachmentItem;
}

export const attachmentCreate = api(
  // 50 MiB — base64 inflates bytes ~33%, so this allows raw files up to ~37 MiB.
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/attachments", bodyLimit: 50 * 1024 * 1024 },
  async (req: AttachmentCreateRequest): Promise<AttachmentCreateResponse> => {
    const auth = getAuthData()!;
    const attachment = await attachmentService.create(
      req.shipmentId,
      auth.companyID,
      {
        fileName: req.fileName,
        fileSize: req.fileSize,
        fileType: req.fileType,
        contentBase64: req.contentBase64 ?? "",
        documentType: req.documentType ?? "",
      },
      auth.userID,
    );
    return { attachment };
  },
);
