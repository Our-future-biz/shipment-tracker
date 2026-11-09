import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { ImportInstructionAnswers, ImportInstructionState, ImportInstructionWaiting, PublicImportInstructionForm } from "../interfaces/importInstructions";
import { importInstructionsService } from "../services/importInstructions.service";

// ─── The desk: Shipments → Warehouse, and the bell ───

export const importInstructionsWaiting = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/import-instructions/waiting" },
  async (): Promise<{ waiting: ImportInstructionWaiting[] }> => ({ waiting: await importInstructionsService.waitingFor(getAuthData()!) }),
);

export const importInstructionsGet = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/:shipmentId/import-instructions" },
  async ({ shipmentId }: { shipmentId: string }): Promise<{ state: ImportInstructionState | null; askable: boolean; canAsk: boolean }> => importInstructionsService.get(shipmentId, getAuthData()!),
);

// A new link. The answer is the only time the URL is known.
export const importInstructionsCreateLink = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/import-instructions" },
  async ({ shipmentId }: { shipmentId: string }): Promise<{ url: string }> => importInstructionsService.createLink(shipmentId, getAuthData()!),
);

export const importInstructionsCancelLink = api(
  { expose: true, auth: true, method: "DELETE", path: "/shipments/:shipmentId/import-instructions" },
  async ({ shipmentId }: { shipmentId: string }): Promise<void> => {
    await importInstructionsService.cancelLink(shipmentId, getAuthData()!);
  },
);

interface ImportInstructionsApproveRequest {
  shipmentId: string;
  /** As edited in the preview. */
  answers: ImportInstructionAnswers;
}

export const importInstructionsApprove = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/import-instructions/approve" },
  async ({ shipmentId, answers }: ImportInstructionsApproveRequest): Promise<void> => {
    await importInstructionsService.approve(shipmentId, getAuthData()!, answers);
  },
);

interface ImportInstructionsRejectRequest {
  shipmentId: string;
  reason: string;
}

export const importInstructionsReject = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/import-instructions/reject" },
  async ({ shipmentId, reason }: ImportInstructionsRejectRequest): Promise<void> => {
    await importInstructionsService.reject(shipmentId, getAuthData()!, reason);
  },
);

// ─── The customer's page, without a login: the link's token is the only key ───

export const publicImportInstructionsForm = api(
  { expose: true, auth: false, method: "GET", path: "/public/import-instructions/:token", sensitive: true },
  async ({ token }: { token: string }): Promise<{ form: PublicImportInstructionForm }> => ({ form: await importInstructionsService.publicForm(token) }),
);

interface PublicImportInstructionsSubmitRequest {
  token: string;
  /** Must be true: the form's tick box. */
  confirmed: boolean;
  answers: ImportInstructionAnswers;
}

export const publicImportInstructionsSubmit = api(
  { expose: true, auth: false, method: "POST", path: "/public/import-instructions/:token", sensitive: true },
  async ({ token, confirmed, answers }: PublicImportInstructionsSubmitRequest): Promise<void> => {
    await importInstructionsService.submit(token, { confirmed, answers });
  },
);
