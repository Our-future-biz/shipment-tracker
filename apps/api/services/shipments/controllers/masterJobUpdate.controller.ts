import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { masterJobService } from "../services/masterJob.service";
import type { MasterJobItem } from "../interfaces/interfaces";

interface MasterJobUpdateRequest {
  masterJobId: string;
  freightMode?: string;
  tradeDirection?: string;
  incotermOrigin?: string;
  incotermDestination?: string;
  bookingNumber?: string;
  closingDate?: string;
  destination?: string;
  shipper?: string;
  shipperId?: string | null;
  consignee?: string;
  consigneeId?: string | null;
  loadType?: string;
  serviceName?: string;
  shippingLine?: string;
  pol?: string;
  pod?: string;
  estimatedDeparture?: string;
  estimatedArrival?: string;
  actualDeparture?: string;
  actualArrival?: string;
  etaWarehouse?: string;
  warehouseReceivedDate?: string;
  releaseDepot?: string;
  redeliveryReference?: string;
  redeliveryDepot?: string;
  supplierPic?: string;
  masterBolNumber?: string;
  masterBolType?: string;
  vessel?: string;
  voyage?: string;
}

interface MasterJobUpdateResponse {
  masterJob: MasterJobItem;
}

// Saves MBL details; the synced ones are written onto every linked shipment too.
export const masterJobUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/master-jobs/:masterJobId" },
  async (req: MasterJobUpdateRequest): Promise<MasterJobUpdateResponse> => {
    const { masterJobId, ...data } = req;
    const auth = getAuthData()!;
    return { masterJob: await masterJobService.update(masterJobId, auth.companyID, data, auth.userID) };
  },
);
