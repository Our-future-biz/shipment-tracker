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
 * Why the signed-in user is not offered "approve" on this document, or null when they are. Their own
 * upload is told by the uploader's user id (`uploadedById`), as the server tells it: `uploadedByName`
 * is the uploader's name now, which is no identity and never equals an e-mail (mock test S19-175).
 * An uploader nobody knows (null) gets the button, and the server decides. Only an older answer
 * without the id falls back to the e-mail the name then was.
 */
export function ownUploadApprovalRefusal(
  document: { uploadedById?: string | null; uploadedByName?: string | null },
  user: { id?: string | null; email?: string | null; role?: string | null } | null | undefined,
): string | null {
  if (!user || MANAGER_ROLES.includes(user.role ?? "")) return null;
  const own =
    document.uploadedById !== undefined
      ? !!document.uploadedById && !!user.id && document.uploadedById === user.id
      : sameEmail(document.uploadedByName, user.email);
  return own ? OWN_UPLOAD_REFUSAL : null;
}
