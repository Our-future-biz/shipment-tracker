import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { aresService } from "../services/ares.service";
import type { AresResult } from "../interfaces/interfaces";

interface AresLookupRequest {
  ico: string;
}

// A Czech company's record by IČO. Counted per company like the name search (two calls to ARES each).
export const aresLookup = api(
  { expose: true, auth: true, method: "GET", path: "/ares/:ico" },
  async (req: AresLookupRequest): Promise<AresResult> => {
    return aresService.lookup(req.ico, getAuthData()!.companyID);
  },
);
