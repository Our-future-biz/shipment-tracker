import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { avizaceService } from "../services/avizace.service";
import type { ConsignmentDetail } from "../interfaces/interfaces";
import type { AvizaceChannel, AvizaceTemplate } from "../interfaces/avizace.interfaces";
import { requireModule } from "../../../lib/modules";

interface TruckingAvizaceTemplateRequest {
  id: string;
}

interface TruckingAvizaceTemplateResponse {
  template: AvizaceTemplate;
}

// The avizace text to copy (Czech and English; never the Pick-up PIN). Any user.
export const truckingAvizaceTemplate = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/consignments/:id/avizace/template" },
  async ({ id }: TruckingAvizaceTemplateRequest): Promise<TruckingAvizaceTemplateResponse> => {
    await requireModule("trucking_concept");
    return { template: await avizaceService.template(requireRole(), id) };
  },
);

interface TruckingAvizaceRecordRequest {
  id: string;
  channel: AvizaceChannel;
  /** Who was told (name, phone or e-mail) */
  contact: string;
  /** ISO or null: the window agreed with the consignee */
  agreedFrom: string | null;
  agreedTo: string | null;
  note: string;
}

interface TruckingAvizaceRecordResponse {
  consignment: ConsignmentDetail;
}

// Records how and when the consignee was told of the delivery. Any user.
export const truckingAvizaceRecord = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/consignments/:id/avizace" },
  async ({ id, ...input }: TruckingAvizaceRecordRequest): Promise<TruckingAvizaceRecordResponse> => {
    await requireModule("trucking_concept");
    return { consignment: await avizaceService.record(requireRole(), id, input) };
  },
);
