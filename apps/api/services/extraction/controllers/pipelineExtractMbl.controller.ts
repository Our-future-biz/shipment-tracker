import { api, APIError } from "encore.dev/api";
import { extractMbl } from "../services/pipeline.service";
import type { ExtractMblResult } from "../interfaces/interfaces";

interface PipelineExtractMblRequest {
  sessionId: string;
}

export const pipelineExtractMbl = api(
  { expose: true, auth: true, method: "POST", path: "/extraction/pipeline/extract-mbl" },
  async (req: PipelineExtractMblRequest): Promise<ExtractMblResult> => {
    if (!req.sessionId) {
      throw APIError.invalidArgument("sessionId is required");
    }
    try {
      return await extractMbl(req.sessionId);
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) {
        throw APIError.notFound(err.message);
      }
      throw err;
    }
  },
);
