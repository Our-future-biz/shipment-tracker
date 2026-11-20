import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { ImportInstructionAnswers } from "../interfaces/importInstructions";
import { importInstructionsService } from "../services/importInstructions.service";

interface ImportInstructionsDutyRequest {
  shipmentId: string;
}

interface ImportInstructionsDutyResponse {
  /** "us": we pay the duty and VAT and invoice the customer for it; "own_account"; "" when no approved form says. */
  dutyPaidBy: ImportInstructionAnswers["dutyPaidBy"];
}

/**
 * Internal API of the invoicing service: who pays the job's import duty and VAT, as its approved Import
 * Instructions say. The Customs tab shows it; the Issue dialog warns when we pay it and the invoice has
 * no duty or VAT line (mock council R3). Only the caller's company's shipments are read.
 */
export const _internalImportInstructionsDuty = api(
  { expose: false, auth: true, method: "GET", path: "/internal/shipments/:shipmentId/import-instructions-duty" },
  async ({ shipmentId }: ImportInstructionsDutyRequest): Promise<ImportInstructionsDutyResponse> => ({
    dutyPaidBy: await importInstructionsService.dutyPaidBy(shipmentId, getAuthData()!.companyID),
  }),
);
