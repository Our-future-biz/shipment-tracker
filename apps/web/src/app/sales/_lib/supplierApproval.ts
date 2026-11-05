import type { CostLine } from "./types";

// A quote's suppliers come from the Customer Database only, and a new supplier a user who is no manager
// adds from a quote's Pricing waits for a manager's approval (Sales → Managers → Company approval). The
// server sends no quote with a buying line linked to one that waits or that a manager declined, nor with
// a supplier only typed (quotes utils/supplierApproval.utils.ts); the quote page says so beforehand, in
// its words.

type ApprovalStatus = "" | "pending" | "declined";

interface DirectoryCompany {
  companyName: string;
  approvalStatus: string;
}

/** A new supplier as the Company approval list has it: waiting, or answered in the last 30 days. */
export interface ApprovalAnswer {
  companyName: string;
  status: ApprovalStatus;
  comment: string;
}

type SupplierLine = Partial<Pick<CostLine, "type" | "description" | "supplier" | "supplierCustomerId" | "tariffRef">>;

/**
 * Where a linked supplier stands. The Company approval list is read every minute and the Customer
 * Database list less often, so the list's answer wins: once a manager approved a supplier the quote can
 * go, and once declined it says so, even before the Customer Database list is read again.
 */
export function supplierApprovalOf(
  id: string,
  directory: (id: string) => DirectoryCompany | undefined,
  approvals: ReadonlyMap<string, ApprovalAnswer>,
): { companyName: string; status: string; comment: string } | undefined {
  const answer = approvals.get(id);
  if (answer) return answer;
  const company = directory(id);
  return company ? { companyName: company.companyName, status: company.approvalStatus, comment: "" } : undefined;
}

/**
 * The buying lines whose supplier is only typed: a name and no Customer Database company behind it. A
 * line priced from a tariff keeps the tariff's supplier, and is not one of them.
 */
export function typedSupplierLines(lines: readonly SupplierLine[]): { charge: string; supplier: string }[] {
  return lines.flatMap((l) => {
    const supplier = l.supplier?.trim() ?? "";
    if (!supplier || l.supplierCustomerId || l.tariffRef?.trim()) return [];
    return [{ charge: l.type?.trim() || l.description?.trim() || "a charge", supplier }];
  });
}

/** Why the quote can't go out for suppliers only typed, naming their lines (the server's words); null when none is. */
export function typedSupplierMessage(lines: readonly { charge: string; supplier: string }[]): string | null {
  if (!lines.length) return null;
  const named = lines.map((l) => `${l.charge} (${l.supplier})`).join(", ");
  return lines.length === 1
    ? `The supplier of the buying line ${named} is only typed — pick it from the Customer Database on Pricing (or add it there)`
    : `The suppliers of the buying lines ${named} are only typed — pick each from the Customer Database on Pricing (or add it there)`;
}

/**
 * Why the quote can't be sent for its suppliers: a buying line linked to one that waits or was declined,
 * or a supplier only typed. Null when none.
 */
export function supplierSendBlock(
  lines: readonly SupplierLine[],
  directory: (id: string) => DirectoryCompany | undefined,
  approvals: ReadonlyMap<string, ApprovalAnswer>,
): string | null {
  for (const line of lines) {
    const id = line.supplierCustomerId;
    if (!id) continue;
    const state = supplierApprovalOf(id, directory, approvals);
    const name = state?.companyName || line.supplier?.trim() || "The supplier";
    if (state?.status === "pending") {
      return `The new supplier ${name} waits for a manager's approval (Sales → Managers → Company approval) — the quote can be sent once it is approved`;
    }
    if (state?.status === "declined") {
      return `A manager declined the supplier ${name}${state.comment ? ` (${state.comment})` : ""} — pick another supplier on its buying line`;
    }
  }
  return typedSupplierMessage(typedSupplierLines(lines));
}

/**
 * Whether the Company approval list read again says something new: a supplier added, answered, taken
 * back or gone from the list. The Customer Database lists (the pickers, a quote's lines) are then read
 * again too. Nothing on the first read: there is nothing to compare with.
 */
export function approvalStatusChanged(
  before: readonly { customerId: string; status: string }[] | undefined,
  after: readonly { customerId: string; status: string }[],
): boolean {
  if (!before) return false;
  const was = new Map(before.map((a) => [a.customerId, a.status]));
  return before.length !== after.length || after.some((a) => was.get(a.customerId) !== a.status);
}
