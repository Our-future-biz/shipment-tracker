// Supplier e-mail recipients on the Warehouse settings screen — the same rules the server applies
// (apps/api/services/warehouse/services/settingsRules.ts), so a bad address is shown while typing.

export const MAX_PER_LIST = 20;

const EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** A plain address (no name, no spaces, a dot in the domain). Compare lower-cased. */
export const isEmailAddress = (raw: string) => {
  const v = raw.trim().toLowerCase();
  return v.length <= 254 && EMAIL.test(v) && !v.includes("..") && !v.startsWith(".") && !v.split("@")[0]!.endsWith(".");
};

/** Splits pasted text ("a@x.cz; b@y.cz, c@z.cz" or one per line) into addresses. */
export const splitAddresses = (text: string) =>
  text
    .split(/[\s,;]+/)
    .map((a) => a.trim().replace(/^<|>$/g, ""))
    .filter(Boolean);

/** Trimmed, lower-cased, without repeats; plus the entries that are not addresses. */
export function normaliseList(list: string[]): { ok: string[]; bad: string[] } {
  const ok: string[] = [];
  const bad: string[] = [];
  for (const raw of list.flatMap(splitAddresses)) {
    const a = raw.toLowerCase();
    if (!isEmailAddress(a)) {
      if (!bad.includes(raw)) bad.push(raw);
    } else if (!ok.includes(a)) {
      ok.push(a);
    }
  }
  return { ok, bad };
}

/** Why the recipients of one type cannot be saved; null when they can. */
export function recipientsProblem(r: { enabled: boolean; to: string[]; cc: string[] }): string | null {
  const to = normaliseList(r.to);
  const cc = normaliseList(r.cc);
  const bad = [...to.bad, ...cc.bad];
  if (bad.length) return `Not an e-mail address: ${bad.join(", ")}`;
  if (to.ok.length > MAX_PER_LIST || cc.ok.length > MAX_PER_LIST) return `At most ${MAX_PER_LIST} addresses in To and in Cc`;
  if (r.enabled && !to.ok.length) return "Add at least one To address, or switch e-mail off";
  return null;
}
