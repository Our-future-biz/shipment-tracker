// Who may do what to a shipment's documents (owner decision, 6 Nov 2026): anyone can add one, but only
// a manager, an admin or a superadmin can delete one or take back customs' approval of one. A
// regular user who needs an approved document changed asks for it (documentChangeRequest).

const MANAGER_ROLES = ["superadmin", "admin", "manager"];

export const canManageDocuments = (role: string): boolean => MANAGER_ROLES.includes(role);

/** What a regular user is told when they try to change an approved document (its review or its type). */
export const APPROVED_DOCUMENT_REFUSAL = "This document is approved: to change it, send a request for a manager's approval";

/**
 * Why this user may not give this review, or null when they may. An approved document stays
 * approved for a regular user: changing it takes a manager's approval, or anyone could undo one.
 */
export function documentReviewRefusal(current: string, next: string, role: string): string | null {
  if (canManageDocuments(role) || current !== "approved" || next === "approved") return null;
  return APPROVED_DOCUMENT_REFUSAL;
}
