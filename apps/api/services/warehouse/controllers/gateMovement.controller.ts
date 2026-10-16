import { api, Query } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../../../lib/rbac";
import { gateMovementService, type StampKind } from "../services/gateMovement.service";
import { gateFileService } from "../services/gateFile.service";
import { gateAdminService } from "../services/gateAdmin.service";
import { gateExceptionService } from "../services/gateException.service";
import { reweighService } from "../services/reweigh.service";
import type { GateExceptionInput, GateFileItem, GateMovementInput, GateMovementItem, GateReweighInput, GateSurveyInput } from "../interfaces/gate.interfaces";
import { requireModule } from "../../../lib/modules";

interface GateMovementResponse {
  movement: GateMovementItem;
}

interface GateMovementListRequest {
  /** true: archived records only (newest archive first). */
  archived?: Query<boolean>;
}

// The Gate Log (reads only; the shipments' customs status comes in through gateMovementFollow).
export const gateMovementList = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-gate" },
  async ({ archived }: GateMovementListRequest): Promise<{ movements: GateMovementItem[] }> => {
    await requireModule("warehouse_concept");
    return { movements: await gateMovementService.list(getAuthData()!.companyID, { archived: !!archived }) };
  },
);

interface GateMovementGetRequest {
  id: string;
}

// One record, live or archived (reads only).
export const gateMovementGet = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-gate/:id" },
  async ({ id }: GateMovementGetRequest): Promise<GateMovementResponse> => {
    await requireModule("warehouse_concept");
    return { movement: await gateMovementService.get(id, getAuthData()!.companyID) };
  },
);

interface GateMovementFollowRequest {
  /** One record ("Refresh" on the job); without it, a limited number of records not read lately. */
  id?: string;
  /** With `id`: read it now, even if it was read in the last half minute. */
  force?: boolean;
}

// Linked records read their shipment's customs status (and move their stock / bonded entry with
// it). The Gate Log calls this when it opens and the job's "Refresh" with `force`.
export const gateMovementFollow = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/follow" },
  async ({ id, force }: GateMovementFollowRequest): Promise<{ changed: number }> => {
    await requireModule("warehouse_concept");
    return { changed: await gateMovementService.followShipments(getAuthData()!.companyID, { id, force: !!force }) };
  },
);

interface GateMovementCreateRequest extends GateMovementInput {
  /** Truck at the fence with no pre-advice: creates an unlinked row. */
  walkIn?: boolean;
}

export const gateMovementCreate = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate" },
  async (req: GateMovementCreateRequest): Promise<GateMovementResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID } = getAuthData()!;
    return { movement: await gateMovementService.create(companyID, userID, req) };
  },
);

interface GateMovementUpdateRequest extends GateMovementInput {
  id: string;
  /** Required (managers only) to change the link or direction of a position linked to a shipment. */
  linkChangeReason?: string & MaxLen<500>;
}

export const gateMovementUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/warehouse-gate/:id" },
  async ({ id, linkChangeReason, ...data }: GateMovementUpdateRequest): Promise<GateMovementResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID, role } = getAuthData()!;
    return { movement: await gateMovementService.update(id, companyID, userID, data, role, linkChangeReason) };
  },
);

// Any user may delete a record without gate stamps (it is archived, logged). A stamped
// record is archived by a manager with a reason (gateMovementArchive).
export const gateMovementDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/warehouse-gate/:id" },
  async ({ id }: { id: string }): Promise<{ ok: boolean }> => {
    await requireModule("warehouse_concept");
    const { companyID, userID } = getAuthData()!;
    await gateMovementService.remove(id, companyID, userID);
    return { ok: true };
  },
);

interface GateStampRequest {
  id: string;
  kind: StampKind;
  /**
   * Floor mode (offline queue): when the stamp was made on the phone (ISO with a time zone).
   * Accepted up to 2 minutes ahead and 12 hours back, never before the step it follows; never
   * for the WH release (it needs a connection). The stamp and its log carry this time.
   */
  recordedAt?: string;
  /** Floor mode: id of this request (UUID). A stamp already there is then an answer, not an error. */
  clientRequestId?: string;
}

interface GateStampResponse {
  movement: GateMovementItem;
  /**
   * stamped · already_stamped (this request came before) · stamped_by_someone_else (the step was
   * stamped by another request first; only with a clientRequestId — without one that is a 400).
   */
  outcome: "stamped" | "already_stamped" | "stamped_by_someone_else";
  /** Text for a toast, e.g. "Gate-in was already stamped 10:05 by Jana"; "" when nothing to say. */
  notice: string;
}

export const gateMovementStamp = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/stamp" },
  async ({ id, kind, recordedAt, clientRequestId }: GateStampRequest): Promise<GateStampResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID, role } = getAuthData()!;
    return gateMovementService.stampWithOutcome(id, companyID, userID, kind, role, { recordedAt, clientRequestId });
  },
);

// Manager: archives a record (stamped or not) with a reason; it can be restored.
export const gateMovementArchive = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/archive" },
  async ({ id, reason }: { id: string; reason: string }): Promise<GateMovementResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID, role } = requireRole("superadmin", "admin", "manager");
    return { movement: await gateAdminService.archive(id, companyID, userID, role, reason) };
  },
);

// Manager: brings an archived record back (and its position, when it was removed with it).
export const gateMovementRestore = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/restore" },
  async ({ id, reason }: { id: string; reason: string }): Promise<GateMovementResponse> => {
    await requireModule("warehouse_concept");
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
    await requireModule("warehouse_concept");
    const { companyID, userID, role } = requireRole("superadmin", "admin", "manager");
    return gateAdminService.voidStamp(id, companyID, userID, role, kind, reason);
  },
);

// "Retry now" for a shipment update the record still owes; any user, logged.
export const gateMovementShipmentUpdateRetry = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/shipment-update/retry" },
  async ({ id }: { id: string }): Promise<GateMovementResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID } = getAuthData()!;
    return { movement: await gateAdminService.retryShipmentUpdate(id, companyID, userID) };
  },
);

// A failed shipment update that was set in Shipments by hand is dismissed; any user, logged.
export const gateMovementShipmentUpdateDismiss = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/shipment-update/dismiss" },
  async ({ id }: { id: string }): Promise<GateMovementResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID } = getAuthData()!;
    return { movement: await gateAdminService.dismissShipmentUpdate(id, companyID, userID) };
  },
);

export const gateMovementRefuse = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/refuse" },
  async ({ id, reason }: { id: string; reason: string }): Promise<GateMovementResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID } = getAuthData()!;
    return { movement: await gateMovementService.refuse(id, companyID, userID, reason) };
  },
);

// Asks ops to clear the release gates; logged on the movement, changes no gate itself.
export const gateMovementRequestRelease = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/request-release" },
  async ({ id }: { id: string }): Promise<GateMovementResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID } = getAuthData()!;
    return { movement: await gateMovementService.requestRelease(id, companyID, userID) };
  },
);

// Asks customs / ops for the MRN; logged on the movement.
export const gateMovementRequestMrn = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/request-mrn" },
  async ({ id }: { id: string }): Promise<GateMovementResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID } = getAuthData()!;
    return { movement: await gateMovementService.requestMrn(id, companyID, userID) };
  },
);

// Ticks one release-gate line OK (or back to Pending); any user, logged on the movement.
export const gateMovementReleaseGate = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/release-gate" },
  async ({ id, gate, ok }: { id: string; gate: string; ok: boolean }): Promise<GateMovementResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID } = getAuthData()!;
    return { movement: await gateMovementService.setReleaseGate(id, companyID, userID, gate, ok) };
  },
);

// Overriding the release box is a supervisor permission, not a button everyone has.
export const gateMovementOverride = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/override" },
  async ({ id, reason }: { id: string; reason: string }): Promise<GateMovementResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID } = requireRole("superadmin", "admin", "manager");
    return { movement: await gateMovementService.override(id, companyID, userID, reason) };
  },
);

// Logs a label print (or reprint) with the number of labels on the movement.
export const gateMovementLabelPrinted = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/label-printed" },
  async ({ id, copies }: { id: string; copies: number }): Promise<GateMovementResponse> => {
    await requireModule("warehouse_concept");
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
    await requireModule("warehouse_concept");
    const { companyID, userID } = getAuthData()!;
    return gateMovementService.verifyPin(id, companyID, userID, pin);
  },
);

interface GateSurveySaveRequest {
  id: string;
  survey: GateSurveyInput;
  /** Floor mode (offline queue): when it was saved on the phone (ISO); within the last 12 hours. */
  recordedAt?: string;
  /** Floor mode: id of this request (UUID); the same id sent again changes nothing. */
  clientRequestId?: string;
}

interface GateSurveySaveResponse {
  movement: GateMovementItem;
  /** saved · already_saved (this request came before) · newer_exists (a later survey of that container and pass is kept) */
  outcome: "saved" | "already_saved" | "newer_exists";
  notice: string;
}

export const gateMovementSaveSurvey = api(
  { expose: true, auth: true, method: "PUT", path: "/warehouse-gate/:id/survey" },
  async ({ id, survey, recordedAt, clientRequestId }: GateSurveySaveRequest): Promise<GateSurveySaveResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID } = getAuthData()!;
    return gateMovementService.saveSurveyWithOutcome(id, companyID, userID, survey, { recordedAt, clientRequestId });
  },
);

export const gateFileList = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-gate/:id/files" },
  async ({ id }: { id: string }): Promise<{ files: GateFileItem[] }> => {
    await requireModule("warehouse_concept");
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
  /** Floor mode: id of this upload (UUID); the same id sent again returns the file already stored. */
  clientRequestId?: string;
}

export const gateFileUpload = api(
  // base64 inflates bytes ~33%, so this fits a 25 MB file.
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/files", bodyLimit: 36 * 1024 * 1024 },
  async ({ id, ...input }: GateFileUploadRequest): Promise<{ file: GateFileItem }> => {
    await requireModule("warehouse_concept");
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
    await requireModule("warehouse_concept");
    return gateFileService.content(id, fileId, getAuthData()!.companyID);
  },
);

export const gateFileDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/warehouse-gate/:id/files/:fileId" },
  async ({ id, fileId }: { id: string; fileId: string }): Promise<{ ok: boolean }> => {
    await requireModule("warehouse_concept");
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
    await requireModule("warehouse_concept");
    const { companyID, userID } = getAuthData()!;
    return { movement: await gateMovementService.useRemeasured(id, companyID, userID, sectionVersion) };
  },
);

// Records a damage / short / over exception on the movement (from a survey or by hand). While it
// is open the cargo is ON HOLD: the "No open exceptions" release-gate line is Blocked.
interface GateExceptionCreateResponse {
  movement: GateMovementItem;
  /** recorded · already_recorded (the same clientRequestId came before; nothing was added) */
  outcome: "recorded" | "already_recorded";
  notice: string;
}

export const gateExceptionCreate = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/exceptions" },
  async ({ id, exception }: { id: string; exception: GateExceptionInput }): Promise<GateExceptionCreateResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID } = getAuthData()!;
    return gateExceptionService.createWithOutcome(id, companyID, userID, exception);
  },
);

// Resolves an open exception with a note (any user, logged). The last one resolved clears the hold.
export const gateExceptionResolve = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/exceptions/:exceptionId/resolve" },
  async ({ id, exceptionId, note }: { id: string; exceptionId: string; note: string }): Promise<GateMovementResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID } = getAuthData()!;
    return { movement: await gateExceptionService.resolve(id, exceptionId, companyID, userID, note) };
  },
);

interface GateReweighResponse {
  movement: GateMovementItem;
  /** recorded · already_recorded (the same clientRequestId came before; nothing was added) */
  outcome: "recorded" | "already_recorded";
  /** Text for a toast (recorded offline, a newer weighing counts, a variance); "" when nothing to say. */
  notice: string;
}

// Re-weighs the cargo (LCL cargo is re-weighed before its receipt / tally tick; any user, logged).
// A correction is a new weighing: the history stays and the latest counts. Compared with the
// declared gross weight (more than 5 % off is a variance); turns the checklist's VGM icon green.
export const gateMovementReweigh = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/reweigh" },
  async ({ id, reweigh }: { id: string; reweigh: GateReweighInput }): Promise<GateReweighResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID } = getAuthData()!;
    return reweighService.record(id, companyID, userID, reweigh);
  },
);
