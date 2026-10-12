import { api, APIError } from "encore.dev/api";
import type { MinLen } from "encore.dev/validate";
import { prepare } from "../services/pipeline.service";
import type { PipelineFile, PrepareResult } from "../interfaces/interfaces";

interface PipelinePrepareRequest {
  /** The pre-alert's files; all of them are read as one batch. */
  files: PipelineFile[] & MinLen<1>;
}

export const pipelinePrepare = api(
  { expose: true, auth: true, method: "POST", path: "/extraction/pipeline/prepare" },
  async (req: PipelinePrepareRequest): Promise<PrepareResult> => {
    if (req.files.some((f) => !f.fileBase64 || !f.fileName)) {
      throw APIError.invalidArgument("every file needs fileBase64 and fileName");
    }
    return prepare(req.files);
  },
);
