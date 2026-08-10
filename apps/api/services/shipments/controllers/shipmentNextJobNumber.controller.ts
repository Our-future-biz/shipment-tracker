import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";

interface NextJobNumberResponse {
  jobNumber: string;
}

// Returns the next CZ job number, accounting for archived shipments so a
// reference is never reused.
export const shipmentNextJobNumber = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/next-job-number" },
  async (): Promise<NextJobNumberResponse> => {
    const jobNumber = await shipmentService.nextJobNumber(getAuthData()!.companyID);
    return { jobNumber };
  },
);
