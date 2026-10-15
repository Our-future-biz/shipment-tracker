import { apiErrorMessage, ErrCode, isAPIError } from "@/lib/api";

// Why the server refused to load, store or change a quote, sorted by what the user can do about it.
export interface QuoteProblem {
  kind: "conflict" | "signedOut" | "notFound" | "failed";
  /** Finishes a sentence such as "Not saved - …" or "QCZ… - …". */
  reason: string;
}

export function quoteProblem(err: unknown): QuoteProblem {
  if (isAPIError(err)) {
    // The request named the version of the document it was based on (expectedDataVersion) and the stored quote is already a newer one.
    if (err.code === ErrCode.Aborted) return { kind: "conflict", reason: "changed by someone else or in another tab" };
    if (err.code === ErrCode.Unauthenticated) return { kind: "signedOut", reason: "you are signed out" };
    if (err.code === ErrCode.NotFound) return { kind: "notFound", reason: "the quote no longer exists" };
  }
  // The API says what went wrong, or it could not be reached.
  return { kind: "failed", reason: apiErrorMessage(err) };
}
