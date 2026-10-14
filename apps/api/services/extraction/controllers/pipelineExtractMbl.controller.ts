import { api } from "encore.dev/api";
import type { MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { extractMbl } from "../services/pipeline.service";
import type { ExtractMblResult } from "../interfaces/interfaces";

interface PipelineExtractMblRequest {
  sessionId: string & MinLen<1>;
}

export const pipelineExtractMbl = api(
  { expose: true, auth: true, method: "POST", path: "/extraction/pipeline/extract-mbl" },
  async (req: PipelineExtractMblRequest): Promise<ExtractMblResult> => {
    const { companyID, userID } = getAuthData()!;
    return extractMbl(req.sessionId, { companyId: companyID, userId: userID });
  },
);
