import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../../../lib/rbac";
import { gateMovementService, type StampKind } from "../services/gateMovement.service";
import { gateFileService } from "../services/gateFile.service";
import type { GateFileItem, GateMovementInput, GateMovementItem, GateSurveyInput } from "../interfaces/gate.interfaces";

interface GateMovementResponse {
  movement: GateMovementItem;
}

export const gateMovementList = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-gate" },
  async (): Promise<{ movements: GateMovementItem[] }> => {
    return { movements: await gateMovementService.list(getAuthData()!.companyID) };
  },
);

export const gateMovementGet = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-gate/:id" },
  async ({ id }: { id: string }): Promise<GateMovementResponse> => {
    return { movement: await gateMovementService.get(id, getAuthData()!.companyID) };
  },
);

interface GateMovementCreateRequest extends GateMovementInput {
  /** Truck at the fence with no pre-advice: creates an unlinked row. */
  walkIn?: boolean;
}

export const gateMovementCreate = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate" },
  async (req: GateMovementCreateRequest): Promise<GateMovementResponse> => {
    const { companyID, userID } = getAuthData()!;
    return { movement: await gateMovementService.create(companyID, userID, req) };
  },
);

interface GateMovementUpdateRequest extends GateMovementInput {
  id: string;
}

export const gateMovementUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/warehouse-gate/:id" },
  async ({ id, ...data }: GateMovementUpdateRequest): Promise<GateMovementResponse> => {
    const { companyID, userID } = getAuthData()!;
    return { movement: await gateMovementService.update(id, companyID, userID, data) };
  },
);

export const gateMovementDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/warehouse-gate/:id" },
  async ({ id }: { id: string }): Promise<{ ok: boolean }> => {
    await gateMovementService.remove(id, getAuthData()!.companyID);
    return { ok: true };
  },
);

export const gateMovementStamp = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/stamp" },
  async ({ id, kind }: { id: string; kind: StampKind }): Promise<GateMovementResponse> => {
    const { companyID, userID } = getAuthData()!;
    return { movement: await gateMovementService.stamp(id, companyID, userID, kind) };
  },
);

export const gateMovementRefuse = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/refuse" },
  async ({ id, reason }: { id: string; reason: string }): Promise<GateMovementResponse> => {
    const { companyID, userID } = getAuthData()!;
    return { movement: await gateMovementService.refuse(id, companyID, userID, reason) };
  },
);

// Asks ops to clear the release gates; logged on the movement, changes no gate itself.
export const gateMovementRequestRelease = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/request-release" },
  async ({ id }: { id: string }): Promise<GateMovementResponse> => {
    const { companyID, userID } = getAuthData()!;
    return { movement: await gateMovementService.requestRelease(id, companyID, userID) };
  },
);

// Asks customs / ops for the MRN; logged on the movement.
export const gateMovementRequestMrn = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/request-mrn" },
  async ({ id }: { id: string }): Promise<GateMovementResponse> => {
    const { companyID, userID } = getAuthData()!;
    return { movement: await gateMovementService.requestMrn(id, companyID, userID) };
  },
);

// Overriding the release box is a supervisor permission, not a button everyone has.
export const gateMovementOverride = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/override" },
  async ({ id, reason }: { id: string; reason: string }): Promise<GateMovementResponse> => {
    const { companyID, userID } = requireRole("superadmin", "admin", "manager");
    return { movement: await gateMovementService.override(id, companyID, userID, reason) };
  },
);

interface GatePinVerifyResponse {
  result: "match" | "no_match" | "locked" | "no_pin";
  tries: number;
}

export const gateMovementVerifyPin = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/verify-pin" },
  async ({ id, pin }: { id: string; pin: string }): Promise<GatePinVerifyResponse> => {
    const { companyID, userID } = getAuthData()!;
    return gateMovementService.verifyPin(id, companyID, userID, pin);
  },
);

export const gateMovementSaveSurvey = api(
  { expose: true, auth: true, method: "PUT", path: "/warehouse-gate/:id/survey" },
  async ({ id, survey }: { id: string; survey: GateSurveyInput }): Promise<GateMovementResponse> => {
    const { companyID, userID } = getAuthData()!;
    return { movement: await gateMovementService.saveSurvey(id, companyID, userID, survey) };
  },
);

export const gateFileList = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-gate/:id/files" },
  async ({ id }: { id: string }): Promise<{ files: GateFileItem[] }> => {
    return { files: await gateFileService.list(id, getAuthData()!.companyID) };
  },
);

interface GateFileUploadRequest {
  id: string;
  fileName: string;
  fileType: string;
  contentBase64: string;
  container?: string;
  tag?: string;
}

export const gateFileUpload = api(
  // base64 inflates bytes ~33%, so this fits a 25 MB file.
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/files", bodyLimit: 36 * 1024 * 1024 },
  async ({ id, ...input }: GateFileUploadRequest): Promise<{ file: GateFileItem }> => {
    const { companyID, userID } = getAuthData()!;
    return { file: await gateFileService.upload(id, companyID, userID, input) };
  },
);

interface GateFileContentResponse {
  fileName: string;
  fileType: string;
  contentBase64: string;
}

export const gateFileContent = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-gate/:id/files/:fileId/content" },
  async ({ id, fileId }: { id: string; fileId: string }): Promise<GateFileContentResponse> => {
    return gateFileService.content(id, fileId, getAuthData()!.companyID);
  },
);

export const gateFileDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/warehouse-gate/:id/files/:fileId" },
  async ({ id, fileId }: { id: string; fileId: string }): Promise<{ ok: boolean }> => {
    await gateFileService.remove(id, fileId, getAuthData()!.companyID);
    return { ok: true };
  },
);
