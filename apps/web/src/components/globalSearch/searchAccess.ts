import type { SearchKind } from "./searchTypes";

/** The kinds only a superadmin is searched for, as only they open those pages (the server refuses anyone else). */
const SUPERADMIN_KINDS: readonly SearchKind[] = ["warehouseConcept"];

/** Whether the main search asks for a kind for a user of this role: a kind they may not see is neither asked nor shown. */
export const searchKindAllowed = (kind: SearchKind, role: string | undefined): boolean => !SUPERADMIN_KINDS.includes(kind) || role === "superadmin";
