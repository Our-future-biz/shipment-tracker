// Who the chat's @ list offers. A bare @ offers the three colleagues used most in this very chat
// (a shipment's or a quote's): those who wrote in it and were tagged in it most, so a company with
// hundreds of accounts does not get them all listed. Typing after the @ searches every colleague,
// the ones used in this chat first. Colleagues not used here yet fill the list in their own order.

export interface MentionColleague {
  id: string;
  name: string;
}

/** How many colleagues a bare @ offers. */
export const MENTION_TOP = 3;
/** How many matches typing after the @ offers. */
export const MENTION_SEARCH_LIMIT = 6;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Each colleague's use in the chat: one for each message written, one for each @Name in a message. */
export function mentionUse(colleagues: readonly MentionColleague[], messages: readonly { authorId: string; message: string }[]): Map<string, number> {
  const use = new Map<string, number>();
  const add = (id: string) => use.set(id, (use.get(id) ?? 0) + 1);
  const known = new Set(colleagues.map((c) => c.id));
  const idsByName = new Map<string, string[]>();
  for (const c of colleagues) idsByName.set(c.name, [...(idsByName.get(c.name) ?? []), c.id]);
  // The longest name first, so "@Kimberly" is not read as "@Kim".
  const names = [...idsByName.keys()].filter(Boolean).sort((a, b) => b.length - a.length);
  const pattern = names.length ? new RegExp(`@(${names.map(escapeRegExp).join("|")})`, "g") : null;
  for (const m of messages) {
    if (known.has(m.authorId)) add(m.authorId);
    if (pattern) for (const hit of m.message.matchAll(pattern)) idsByName.get(hit[1]!)?.forEach(add);
  }
  return use;
}

/** The colleagues the @ list offers for what is typed after the @ (empty for a bare @). */
export function mentionOptions<C extends MentionColleague>(
  colleagues: readonly C[],
  messages: readonly { authorId: string; message: string }[],
  query: string,
): C[] {
  const use = mentionUse(colleagues, messages);
  const ranked = colleagues
    .map((c, i) => ({ c, i, n: use.get(c.id) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((r) => r.c);
  const q = query.toLowerCase();
  if (!q) return ranked.slice(0, MENTION_TOP);
  return ranked.filter((c) => c.name.toLowerCase().includes(q)).slice(0, MENTION_SEARCH_LIMIT);
}
