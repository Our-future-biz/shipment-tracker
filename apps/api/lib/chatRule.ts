// Who may do what to a line in a chat, for every chat of the app. The writer can pull a message back
// for 2 minutes. After that it stays: they can only cross it out, and only an admin or a superadmin
// can still delete it. The screens follow the same rule (ChatPanel), but this is what decides.

/** How long the writer can pull a message back after sending it. */
export const CHAT_PULL_BACK_MS = 2 * 60 * 1000;

export const canDeleteAnyChatMessage = (role: string): boolean => role === "superadmin" || role === "admin";

interface ChatLine {
  authorId: string;
  createdAt: Date;
}

/** Why this user may not delete this message, or null when they may. */
export function chatDeleteRefusal(line: ChatLine, userId: string, role: string, now: Date = new Date()): string | null {
  if (canDeleteAnyChatMessage(role)) return null;
  if (line.authorId !== userId) return "Only the person who wrote a message can pull it back";
  if (now.getTime() - line.createdAt.getTime() > CHAT_PULL_BACK_MS) {
    return "A message can only be pulled back within 2 minutes of sending it. You can cross it out, or ask an admin to delete it";
  }
  return null;
}

/** Why this user may not cross out this message, or null when they may. */
export const chatStrikeRefusal = (line: ChatLine, userId: string): string | null =>
  line.authorId === userId ? null : "Only the person who wrote a message can cross it out";
