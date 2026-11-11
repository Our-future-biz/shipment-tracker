// How an active version of a tariff gives way to a draft approved over its dates: approving never
// leaves a day without prices that had some. Pure, so the rule is unit-tested.

/** A version's validity: YYYY-MM-DD days, an end of null for none. */
export interface Validity {
  validFrom: string | null;
  validTo: string | null;
}

export type GiveWay =
  /** It started earlier: it now ends the day before the draft starts. */
  | { kind: "end"; validTo: string }
  /** It runs on after the draft ends: it now starts the day after. */
  | { kind: "start"; validFrom: string }
  /** The draft covers all of it. */
  | { kind: "supersede" }
  /** It started earlier and runs on after the draft ends: the draft would split it in two. */
  | { kind: "refuse" };

const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** What an active version (`other`, overlapping it) does when the draft from `from` to `to` (no end when null) is approved. */
export function giveWay(other: Validity, from: string, to: string | null): GiveWay {
  const startsEarlier = other.validFrom !== null && other.validFrom < from;
  const runsOnAfter = to !== null && (other.validTo === null || other.validTo > to);
  if (startsEarlier && runsOnAfter) return { kind: "refuse" };
  if (startsEarlier) return { kind: "end", validTo: shift(from, -1) };
  if (runsOnAfter) return { kind: "start", validFrom: shift(to, 1) };
  return { kind: "supersede" };
}
