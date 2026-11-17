import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { attachmentService } from "../services/attachment.service";
import type { AttachmentFileLink } from "../interfaces/interfaces";

interface AttachmentLinkRequest {
  shipmentId: string & MaxLen<64>;
  attachmentId: string & MaxLen<64>;
}

interface AttachmentLinkResponse {
  /** null: the file is no longer among the shipment's documents */
  file: AttachmentFileLink | null;
}

/** Internal API of the invoicing service: the link to a supplier invoice's read document, for its Accounts Payable drawer. */
export const _internalAttachmentLink = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/attachments/link" },
  async ({ shipmentId, attachmentId }: AttachmentLinkRequest): Promise<AttachmentLinkResponse> => ({
    file: await attachmentService.fileLink(shipmentId, attachmentId, getAuthData()!.companyID),
  }),
);
