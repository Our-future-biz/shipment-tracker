import { api, APIError } from "encore.dev/api";
import { extractHblBatch } from "../services/pipeline.service";
import type { ExtractHblResult } from "../interfaces/interfaces";

interface PipelineExtractHblRequest {
  sessionId: string;
  batchIndex: number;
}

export const pipelineExtractHbl = api(
  { expose: true, auth: true, method: "POST", path: "/extraction/pipeline/extract-hbl-batch" },
  async (req: PipelineExtractHblRequest): Promise<ExtractHblResult> => {
    if (!req.sessionId) {
      throw APIError.invalidArgument("sessionId is required");
    }
    try {
      return await extractHblBatch(req.sessionId, req.batchIndex);
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) {
        throw APIError.notFound(err.message);
      }
      throw err;
    }
  },
);
