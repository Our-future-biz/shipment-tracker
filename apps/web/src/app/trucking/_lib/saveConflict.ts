import { ErrCode, isAPIError } from "@/lib/api/client";

// A save on top of a version someone else saved meanwhile is refused with 409 (aborted). The
// contract also names failed_precondition, so that code counts too when the server says so in words.

export const CONFLICT_TEXT = "Settings were changed by someone else. Reload and try again.";
export const HAULIER_CONFLICT_TEXT = "This haulier was changed by someone else. Reload and try again.";

export function isVersionConflict(err: unknown): boolean {
  if (!isAPIError(err)) return false;
  if (err.code === ErrCode.Aborted || err.status === 409) return true;
  return err.code === ErrCode.FailedPrecondition && /changed by someone else/i.test(err.message);
}
