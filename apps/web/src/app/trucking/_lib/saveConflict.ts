import { ErrCode, isAPIError } from "@/lib/api/client";

// A save on top of a version someone else saved meanwhile is refused with 409 (aborted). The
// contract also names failed_precondition, so that code counts too when the server says so in words.

export const CONFLICT_TEXT = "Settings were changed by someone else. Reload and try again.";
export const HAULIER_CONFLICT_TEXT = "This haulier was changed by someone else. Reload and try again.";
export const TRIP_CONFLICT_TEXT = "This trip was changed by someone else. Reload and try again.";

export function isVersionConflict(err: unknown): boolean {
  if (!isAPIError(err)) return false;
  if (err.code === ErrCode.Aborted || err.status === 409) return true;
  return err.code === ErrCode.FailedPrecondition && /changed by someone else/i.test(err.message);
}

/** A form's draft and the version of the record it was started from: its save sends that version. */
export interface HeldDraft<D> {
  draft: D;
  version: number;
}

const sameDraft = <D>(a: D, b: D) => JSON.stringify(a) === JSON.stringify(b);

/**
 * What a form holds once a newer record (`next`) is read after `before`. Nothing typed: the newer
 * record replaces the draft. Typed, and the newer record changed none of the fields the form saves
 * (a stamp, a block): the draft moves onto the new version. Typed while those fields changed: the
 * draft keeps the version it was started from, so its save comes back as a conflict instead of
 * writing the old values over the newer ones.
 */
export function followRecord<D>(held: HeldDraft<D>, before: HeldDraft<D>, next: HeldDraft<D>): HeldDraft<D> {
  if (sameDraft(held.draft, before.draft)) return next;
  if (held.version === before.version && sameDraft(next.draft, before.draft)) return { draft: held.draft, version: next.version };
  return held;
}
