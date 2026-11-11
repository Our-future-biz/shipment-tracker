import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { mainSearchInput } from "../../../lib/mainSearch";
import { masterJobService } from "../services/masterJob.service";
import type { SearchMasterJobsRequest, SearchMasterJobsResponse } from "../interfaces/interfaces";

/**
 * The main search (the top bar) in master jobs: the newest live master jobs of the company these
 * words find - by MCZ number, master B/L, booking, vessel, voyage, shipping line, ports,
 * container numbers and their houses' job numbers - and how many match in all. Fewer than 2
 * characters give nothing.
 */
export const searchMasterJobs = api(
  { expose: true, auth: true, method: "GET", path: "/search/master-jobs" },
  async (req: SearchMasterJobsRequest): Promise<SearchMasterJobsResponse> => {
    const input = mainSearchInput(req.q, req.limit);
    if (!input) return { items: [], total: 0 };
    return masterJobService.searchMain(getAuthData()!.companyID, input.q, input.limit);
  },
);
