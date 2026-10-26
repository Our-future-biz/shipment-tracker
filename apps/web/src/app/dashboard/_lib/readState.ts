import type { Announcement } from "@/hooks/useNoticeboard";

/**
 * Where the reader stands with a notice: their own (nothing to confirm), unread (to confirm), read
 * (confirmed), or other: not addressed to them. An admin sees every board, but only a notice's
 * audience confirms it (API announcement.service list), so such a notice is neither read nor unread.
 */
export type ReadState = "unread" | "read" | "other" | "yours";

export function readState(n: Pick<Announcement, "authorId" | "unread" | "readAt">, userId: string | undefined): ReadState {
  if (userId && n.authorId === userId) return "yours";
  if (n.unread) return "unread";
  return n.readAt ? "read" : "other";
}

/** The Read column's order: unread first, then read, then the notices not addressed to the reader, then their own. */
export const READ_STATE_RANK: Record<ReadState, number> = { unread: 0, read: 1, other: 2, yours: 3 };
