import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { sectionItem } from "../services/warehouse.service";
import { emailSupplierService } from "../services/emailSupplier.service";
import type { WarehouseSectionItem } from "../interfaces/interfaces";
import type { SupplierEmailItem, SupplierEmailPreview } from "../interfaces/settings.interfaces";
import { requireModule } from "../../../lib/modules";

// Supplier e-mail of a position: VGM, survey or remeasurement e-mailed to the recipients set in
// Warehouse settings. Only an e-mail the provider took is marked as sent (with the recipients in
// its history); a failed one is logged and not marked. A type that is off or has no recipients is
// refused (failed_precondition, "Not set up — recorded only …") and stays "Mark as sent".

interface SendToSupplierRequest {
  taskId: string;
  /** vgm | survey | remeasurement */
  what: string;
  note?: string;
  /** A UUID made once per send: a double click or a replay sends once. Not needed for a preview. */
  clientRequestId?: string;
  /** Only return what would be e-mailed (nothing is sent or recorded). */
  previewOnly?: boolean;
}

interface SendToSupplierResponse {
  /** The saved Shipment Details (null for a preview). */
  section: WarehouseSectionItem | null;
  /** The attempt that was sent (null for a preview). */
  email: SupplierEmailItem | null;
  preview: SupplierEmailPreview | null;
}

export const warehousePositionSendToSupplier = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-positions/:taskId/send-to-supplier" },
  async ({ taskId, what, note, clientRequestId, previewOnly }: SendToSupplierRequest): Promise<SendToSupplierResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID } = getAuthData()!;
    if (previewOnly) {
      return { section: null, email: null, preview: await emailSupplierService.preview(taskId, what, note ?? "", companyID, userID) };
    }
    const res = await emailSupplierService.send(taskId, what, note ?? "", clientRequestId ?? "", companyID, userID);
    return { section: sectionItem(res.section), email: res.email, preview: null };
  },
);

interface SupplierEmailsRequest {
  taskId: string;
}

// The latest supplier e-mail attempts of a position, newest first (sent, failed, still sending).
export const warehousePositionSupplierEmails = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-positions/:taskId/supplier-emails" },
  async ({ taskId }: SupplierEmailsRequest): Promise<{ emails: SupplierEmailItem[] }> => {
    await requireModule("warehouse_concept");
    return { emails: await emailSupplierService.list(taskId, getAuthData()!.companyID) };
  },
);
