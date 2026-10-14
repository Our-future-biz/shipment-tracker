import { api } from "encore.dev/api";
import type { Min, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { extractHblBatch } from "../services/pipeline.service";
import type { ExtractHblResult } from "../interfaces/interfaces";

interface PipelineExtractHblRequest {
  sessionId: string & MinLen<1>;
  batchIndex: number & Min<0>;
}

export const pipelineExtractHbl = api(
  { expose: true, auth: true, method: "POST", path: "/extraction/pipeline/extract-hbl-batch" },
  async (req: PipelineExtractHblRequest): Promise<ExtractHblResult> => {
    const { companyID, userID } = getAuthData()!;
    return extractHblBatch(req.sessionId, req.batchIndex, { companyId: companyID, userId: userID });
  },
);
