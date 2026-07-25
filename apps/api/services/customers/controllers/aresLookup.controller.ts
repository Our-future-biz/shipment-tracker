import { api } from "encore.dev/api";
import { aresService } from "../services/ares.service";
import type { AresResult } from "../interfaces/interfaces";

interface AresLookupRequest {
  ico: string;
}

export const aresLookup = api(
  { expose: true, auth: false, method: "GET", path: "/ares/:ico" },
  async (req: AresLookupRequest): Promise<AresResult> => {
    return aresService.lookup(req.ico);
  },
);
