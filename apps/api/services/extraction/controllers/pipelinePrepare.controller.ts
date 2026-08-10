import { api, APIError } from "encore.dev/api";
import { prepare } from "../services/pipeline.service";
import type { PrepareResult } from "../interfaces/interfaces";

interface PipelinePrepareRequest {
  fileBase64: string;
  fileName: string;
}

export const pipelinePrepare = api(
  { expose: true, auth: true, method: "POST", path: "/extraction/pipeline/prepare" },
  async (req: PipelinePrepareRequest): Promise<PrepareResult> => {
    if (!req.fileBase64 || !req.fileName) {
      throw APIError.invalidArgument("fileBase64 and fileName are required");
    }
    return prepare(req.fileBase64, req.fileName);
  },
);
