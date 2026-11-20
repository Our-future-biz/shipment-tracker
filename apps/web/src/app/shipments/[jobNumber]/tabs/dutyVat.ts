import type { interfaces } from "@/lib/api/client";

// Who pays the import duty and VAT, as the customer's approved Import Instructions say it. "Us,
// invoiced to you" means we pay customs and invoice the customer for it, so it has to be seen where
// customs and billing work: a line on the job's Customs tab (owner's answer R3, mock council of
// system-21). Read from the approved form, so nothing is copied onto the job and nothing is guessed
// when no form was approved.

/** The Customs tab's "Duty and VAT" line; null when no approved form says who pays them. */
export function dutyVatLine(state: Pick<interfaces.ImportInstructionState, "status" | "approvedAnswers"> | null | undefined): string | null {
  const answers = state?.status === "approved" ? state.approvedAnswers : null;
  // Asked only under a) free circulation; a form of another procedure keeps no answer (S3-7).
  if (!answers || answers.procedure !== "free_circulation") return null;
  if (answers.dutyPaidBy === "us") return "Paid by us - invoice them to the customer (Import Instructions)";
  if (answers.dutyPaidBy === "own_account") return "From the customer's own account (Import Instructions)";
  return null;
}
