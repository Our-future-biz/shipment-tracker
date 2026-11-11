import { apiErrorMessage, isNotFound } from "@/lib/api";

// What a warehouse page says when the record it opens is not there. "Not found" only when the
// server said so (or nothing failed); any other failure (no connection, a server error) says the
// read failed and to reload, never that the record is gone. Pure (tested in loadFailure.test.ts).

/** `notFound` ("Movement not found."), or why the `what` ("movement") could not be read. */
export function missingRecordText(error: unknown, what: string, notFound: string): string {
  if (!error || isNotFound(error)) return notFound;
  return `Could not load the ${what}: ${apiErrorMessage(error)} — reload the page.`;
}
