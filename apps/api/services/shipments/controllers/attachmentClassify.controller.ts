import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { attachmentService } from "../services/attachment.service";
import type { AttachmentItem } from "../interfaces/interfaces";

/** Assign a business document type (Invoice, Packing list, …) to an uploaded file. */
interface AttachmentClassifyRequest {
  shipmentId: string;
  attachmentId: string;
  documentType: string;
}

interface AttachmentClassifyResponse {
  attachment: AttachmentItem;
}

export const attachmentClassify = api(
  { expose: true, auth: true, method: "PATCH", path: "/shipments/:shipmentId/attachments/:attachmentId/type" },
  async (req: AttachmentClassifyRequest): Promise<AttachmentClassifyResponse> => {
    const companyId = getAuthData()!.companyID;
    return { attachment: await attachmentService.classify(req.shipmentId, req.attachmentId, companyId, req.documentType) };
  },
);
