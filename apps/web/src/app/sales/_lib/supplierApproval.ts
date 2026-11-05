import type { CostLine } from "./types";

// A new supplier a user who is no manager adds from a quote's Pricing waits for a manager's approval
// (Sales → Managers → Company approval). The server sends no quote linked to one that waits, or that a
// manager declined (quotes utils/supplierApproval.utils.ts); the quote page says so beforehand, in its words.

interface DirectoryCompany {
  companyName: string;
  approvalStatus: string;
}

interface DeclinedSupplier {
  companyName: string;
  comment: string;
}

/** Why the quote can't be sent for its suppliers; null when no buying line is linked to one that waits or was declined. */
export function supplierSendBlock(
  lines: Pick<CostLine, "supplier" | "supplierCustomerId">[],
  directory: (id: string) => DirectoryCompany | undefined,
  declined: ReadonlyMap<string, DeclinedSupplier>,
): string | null {
  for (const line of lines) {
    const id = line.supplierCustomerId;
    if (!id) continue;
    const company = directory(id);
    const name = company?.companyName || line.supplier?.trim() || "The supplier";
    if (company?.approvalStatus === "pending") {
      return `The new supplier ${name} waits for a manager's approval (Sales → Managers → Company approval) — the quote can be sent once it is approved`;
    }
    const no = !company ? declined.get(id) : undefined;
    if (no) return `A manager declined the supplier ${no.companyName || name}${no.comment ? ` (${no.comment})` : ""} — pick another supplier on its buying line`;
  }
  return null;
}
