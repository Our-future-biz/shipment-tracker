import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { readingMatchService } from "../services/readingMatch.service";
import type { ShipmentItem } from "../interfaces/interfaces";

interface ShipmentByHouseBolRequest {
  /** The House B/L number as a document reading has it (compared by letters and digits, any case). */
  houseBol: string & MaxLen<100>;
}

interface ShipmentByHouseBolResponse {
  /** The company's live shipment that has this House B/L already (the oldest), or null. */
  shipment: ShipmentItem | null;
}

// Documents → Shipments, "Create new shipment": before a reading creates a job, the shipment that has its
// House B/L already, shown to the user to write the reading into it or to create a new job anyway.
export const shipmentByHouseBol = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/by-house-bol" },
  async (req: ShipmentByHouseBolRequest): Promise<ShipmentByHouseBolResponse> => {
    return { shipment: await readingMatchService.shipmentOfHouseBol(getAuthData()!.companyID, req.houseBol) };
  },
);
