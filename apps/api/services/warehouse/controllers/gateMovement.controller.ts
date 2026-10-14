import { api, Query } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../../../lib/rbac";
import { gateMovementService, type StampKind } from "../services/gateMovement.service";
import { gateFileService } from "../services/gateFile.service";
import { gateAdminService } from "../services/gateAdmin.service";
import { gateExceptionService } from "../services/gateException.service";
import type { GateExceptionInput, GateFileItem, GateMovementInput, GateMovementItem, GateSurveyInput } from "../interfaces/gate.interfaces";

interface GateMovementResponse {
  movement: GateMovementItem;
}

interface GateMovementListRequest {
  /** true: archived records only (newest archive first). */
  archived?: Query<boolean>;
}

// The Gate Log. Linked records whose customs status was not read lately follow their
// shipment first (a limited number per call, never waiting long for Shipments).
export const gateMovementList = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-gate" },
  async ({ archived }: GateMovementListRequest): Promise<{ movements: GateMovementItem[] }> => {
    return { movements: await gateMovementService.list(getAuthData()!.companyID, { archived: !!archived, follow: true }) };
  },
);

interface GateMovementGetRequest {
  id: string;
  /** true ("Refresh"): read the linked shipment's customs status now, not only after 30 s. */
  refresh?: Query<boolean>;
}

// One record, live or archived; a linked one follows its shipment's customs status.
export const gateMovementGet = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-gate/:id" },
  async ({ id, refresh }: GateMovementGetRequest): Promise<GateMovementResponse> => {
    return { movement: await gateMovementService.get(id, getAuthData()!.companyID, { follow: true, force: !!refresh }) };
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
    const { companyID, userID, role } = getAuthData()!;
    return { movement: await gateMovementService.update(id, companyID, userID, data, role) };
  },
);

// Any user may delete a record without gate stamps (it is archived, logged). A stamped
// record is archived by a manager with a reason (gateMovementArchive).
export const gateMovementDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/warehouse-gate/:id" },
  async ({ id }: { id: string }): Promise<{ ok: boolean }> => {
    const { companyID, userID } = getAuthData()!;
    await gateMovementService.remove(id, companyID, userID);
    return { ok: true };
  },
);

export const gateMovementStamp = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/stamp" },
  async ({ id, kind }: { id: string; kind: StampKind }): Promise<GateMovementResponse> => {
    const { companyID, userID, role } = getAuthData()!;
    return { movement: await gateMovementService.stamp(id, companyID, userID, kind, role) };
  },
);

// Manager: archives a record (stamped or not) with a reason; it can be restored.
export const gateMovementArchive = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/archive" },
  async ({ id, reason }: { id: string; reason: string }): Promise<GateMovementResponse> => {
    const { companyID, userID, role } = requireRole("superadmin", "admin", "manager");
    return { movement: await gateAdminService.archive(id, companyID, userID, role, reason) };
  },
);

// Manager: brings an archived record back (and its position, when it was removed with it).
export const gateMovementRestore = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/restore" },
  async ({ id, reason }: { id: string; reason: string }): Promise<GateMovementResponse> => {
    const { companyID, userID, role } = requireRole("superadmin", "admin", "manager");
    return { movement: await gateAdminService.restore(id, companyID, userID, role, reason) };
  },
);

interface GateVoidStampResponse {
  movement: GateMovementItem;
  /** Set when the shipment was already updated from the voided stamp (it is not changed back). */
  notice: string;
}

// Manager: voids a wrong stamp with a reason (logged). The shipment is not changed back.
export const gateMovementVoidStamp = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/void-stamp" },
  async ({ id, kind, reason }: { id: string; kind: StampKind; reason: string }): Promise<GateVoidStampResponse> => {
    const { companyID, userID, role } = requireRole("superadmin", "admin", "manager");
    return gateAdminService.voidStamp(id, companyID, userID, role, kind, reason);
  },
);

// "Retry now" for a shipment update the record still owes; any user, logged.
export const gateMovementShipmentUpdateRetry = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/shipment-update/retry" },
  async ({ id }: { id: string }): Promise<GateMovementResponse> => {
    const { companyID, userID } = getAuthData()!;
    return { movement: await gateAdminService.retryShipmentUpdate(id, companyID, userID) };
  },
);

// A failed shipment update that was set in Shipments by hand is dismissed; any user, logged.
export const gateMovementShipmentUpdateDismiss = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/shipment-update/dismiss" },
  async ({ id }: { id: string }): Promise<GateMovementResponse> => {
    const { companyID, userID } = getAuthData()!;
    return { movement: await gateAdminService.dismissShipmentUpdate(id, companyID, userID) };
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

// Ticks one release-gate line OK (or back to Pending); any user, logged on the movement.
export const gateMovementReleaseGate = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/release-gate" },
  async ({ id, gate, ok }: { id: string; gate: string; ok: boolean }): Promise<GateMovementResponse> => {
    const { companyID, userID } = getAuthData()!;
    return { movement: await gateMovementService.setReleaseGate(id, companyID, userID, gate, ok) };
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

// Logs a label print (or reprint) with the number of labels on the movement.
export const gateMovementLabelPrinted = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/label-printed" },
  async ({ id, copies }: { id: string; copies: number }): Promise<GateMovementResponse> => {
    const { companyID, userID } = getAuthData()!;
    return { movement: await gateMovementService.labelPrinted(id, companyID, userID, copies) };
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

// "Use remeasured figures for the warehouse": the gate figures (pieces, kg, cbm) become the
// totals of the position's remeasured lines. Only the warehouse's figures — the shipment's cargo
// is never changed. Refused when the lines changed since `sectionVersion`, or after the release.
export const gateMovementUseRemeasured = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/use-remeasured" },
  async ({ id, sectionVersion }: { id: string; sectionVersion: number }): Promise<GateMovementResponse> => {
    const { companyID, userID } = getAuthData()!;
    return { movement: await gateMovementService.useRemeasured(id, companyID, userID, sectionVersion) };
  },
);

// Records a damage / short / over exception on the movement (from a survey or by hand). While it
// is open the cargo is ON HOLD: the "No open exceptions" release-gate line is Blocked.
export const gateExceptionCreate = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/exceptions" },
  async ({ id, exception }: { id: string; exception: GateExceptionInput }): Promise<GateMovementResponse> => {
    const { companyID, userID } = getAuthData()!;
    return { movement: await gateExceptionService.create(id, companyID, userID, exception) };
  },
);

// Resolves an open exception with a note (any user, logged). The last one resolved clears the hold.
export const gateExceptionResolve = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/exceptions/:exceptionId/resolve" },
  async ({ id, exceptionId, note }: { id: string; exceptionId: string; note: string }): Promise<GateMovementResponse> => {
    const { companyID, userID } = getAuthData()!;
    return { movement: await gateExceptionService.resolve(id, exceptionId, companyID, userID, note) };
  },
);
