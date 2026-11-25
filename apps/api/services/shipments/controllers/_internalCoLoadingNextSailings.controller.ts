import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import type { CoLoadingBoardSailing } from "../interfaces/interfaces";
import { coLoadingSailingService } from "../services/coLoadingSailing.service";

/** How many sailings a quote shows. */
const NEXT_SAILINGS = 3;

interface CoLoadingNextSailingsRequest {
  serviceId: string & MaxLen<100>;
}

interface CoLoadingNextSailingsResponse {
  /** The service is one of the company's open services; false for a closed one, and for one the company does not have. */
  open: boolean;
  /** The service's name; "" unless open. */
  name: string;
  /** Its next three sailings still to come, the soonest first, each as the board of sailings shows it; none unless open. */
  sailings: CoLoadingBoardSailing[];
}

// Internal only (Sales, as a Sea LCL quote that names the service is read - Council Outlay 14, C7):
// the service's next sailings with their cut-off, departure and the room left in the box. No money.
// Company from the caller's auth.
export const _internalCoLoadingNextSailings = api(
  { expose: false, auth: true, method: "POST", path: "/internal/co-loading/next-sailings" },
  async ({ serviceId }: CoLoadingNextSailingsRequest): Promise<CoLoadingNextSailingsResponse> => {
    return coLoadingSailingService.nextOfService(serviceId, getAuthData()!.companyID, NEXT_SAILINGS);
  },
);
