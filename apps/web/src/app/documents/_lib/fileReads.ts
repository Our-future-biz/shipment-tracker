import { formatFileSize } from "@/lib/files";

// Reading a file is a paid AI call, one request per file: a file too large for the request is
// refused before it is sent, and when one of several files fails, the reads of the others are kept.

// A file read on its own travels base64-encoded (a third larger) in one request, which the server
// takes up to 50 MB (extraction controllers' bodyLimit), the file name and the rest included.
export const READ_FILE_MAX_BYTES = 37 * 1024 * 1024;

/** Why a file can't be read in a request of its own, or null when it can. */
export function readFileProblem(file: { name: string; size: number }): string | null {
  if (file.size <= READ_FILE_MAX_BYTES) return null;
  return `${file.name} is ${formatFileSize(file.size)}; a file of at most ${formatFileSize(READ_FILE_MAX_BYTES)} can be read. Split it, or save it smaller.`;
}

/** What reading the files came to: the reads by file uid, and the files that failed with their error. */
export interface FileReads<F, R> {
  reads: Map<string, R>;
  failed: { file: F; error: unknown }[];
}

/**
 * Reads each file in turn, keeping every read that worked whichever failed. A file `earlier` has a
 * read of (by its uid) is not read again, so a retry reads only the files that failed.
 */
export async function readEachFile<F extends { uid: string }, R>(
  files: readonly F[],
  read: (file: F) => Promise<R>,
  earlier: ReadonlyMap<string, R> = new Map(),
): Promise<FileReads<F, R>> {
  const reads = new Map<string, R>();
  const failed: { file: F; error: unknown }[] = [];
  for (const file of files) {
    const known = earlier.get(file.uid);
    if (known !== undefined) {
      reads.set(file.uid, known);
      continue;
    }
    try {
      reads.set(file.uid, await read(file));
    } catch (error) {
      failed.push({ file, error });
    }
  }
  return { reads, failed };
}
