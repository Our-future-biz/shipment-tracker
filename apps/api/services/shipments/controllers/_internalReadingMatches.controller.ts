import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { readingMatchService } from "../services/readingMatch.service";
import type { ReadingMatches } from "../interfaces/interfaces";

interface ReadingMatchesRequest {
  /** House B/L numbers as a pre-alert's reading has them. */
  houseBols: string[] & MaxLen<500>;
  /** The pre-alert's Master B/L, when one was read. */
  masterBol?: string & MaxLen<100>;
}

// What a document reading made already (Documents, extraction): the caller's company's live
// shipments with these House B/Ls and its live master job with this Master B/L, so the reading
// shows them as created before anything is created twice.
export const _internalReadingMatches = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/reading-matches" },
  async (req: ReadingMatchesRequest): Promise<ReadingMatches> => {
    return readingMatchService.matches(getAuthData()!.companyID, req.houseBols, req.masterBol ?? "");
  },
);
