import { api } from "encore.dev/api";
import type { MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { prepare } from "../services/pipeline.service";
import type { PipelineFile, PrepareResult } from "../interfaces/interfaces";

interface PipelinePrepareRequest {
  /** The pre-alert's files; all of them are read as one batch. */
  files: PipelineFile[] & MinLen<1>;
}

// A pre-alert can be a dozen PDFs sent together as base64 (a third larger than
// the files), so the default request size limit is raised for this endpoint.
export const pipelinePrepare = api(
  { expose: true, auth: true, method: "POST", path: "/extraction/pipeline/prepare", bodyLimit: 100 * 1024 * 1024 },
  async (req: PipelinePrepareRequest): Promise<PrepareResult> => {
    const { companyID, userID } = getAuthData()!;
    return prepare(req.files, { companyId: companyID, userId: userID });
  },
);
