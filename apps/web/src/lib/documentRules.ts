// Who may approve a document for customs (Council Outlay 11, D19): a regular user does not approve a
// document they uploaded themselves - a colleague or a manager does. A manager, an admin and a superadmin may.
// Declining one's own upload stays allowed. The server enforces the same (its lib/documentRules
// ownUploadApprovalRefusal, by the uploader's id); this only keeps the button from being offered.

const MANAGER_ROLES = ["superadmin", "admin", "manager"];

/** What the server answers, shown as the hint where the approve button would be. */
export const OWN_UPLOAD_REFUSAL = "You uploaded this document: a colleague or a manager approves it";

const sameEmail = (a: string | null | undefined, b: string | null | undefined) => {
  const [x, y] = [(a ?? "").trim().toLowerCase(), (b ?? "").trim().toLowerCase()];
  return !!x && x === y;
};

/**
 * Why the signed-in user is not offered "approve" on this document, or null when they are. A
 * document shows its uploader by e-mail (`uploadedByName`; "Unknown" when it can't be told - then
 * the button is offered and the server decides).
 */
export function ownUploadApprovalRefusal(
  document: { uploadedByName?: string | null },
  user: { email?: string | null; role?: string | null } | null | undefined,
): string | null {
  if (!user || MANAGER_ROLES.includes(user.role ?? "")) return null;
  return sameEmail(document.uploadedByName, user.email) ? OWN_UPLOAD_REFUSAL : null;
}
