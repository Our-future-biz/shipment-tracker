// What every managers' cockpit does the same way (Sales → Managers, Warehouse Concept → Managers,
// Shipments → Managers; Council Outlay 11, D28): a row carries its signals as tags, sits in URGENT
// when any of them is urgent and in ATTENTION otherwise, and a card lists its rows the most
// pressing first. Each cockpit keeps its own signals, rows and tie-break. Pure: no database, no
// Encore; tested in tests/cockpit.test.ts.

/** What a row shows of one signal. */
export interface CockpitTag {
  text: string;
  urgent: boolean;
}

export interface CockpitSignal extends CockpitTag {
  /** Lower comes first. */
  rank: number;
}

export const urgentSignal = (rank: number, text: string): CockpitSignal => ({ rank, text, urgent: true });
export const attentionSignal = (rank: number, text: string): CockpitSignal => ({ rank, text, urgent: false });

export interface RankedRow<R> {
  row: R;
  /** Any of its signals is urgent: it belongs to the URGENT card. */
  urgent: boolean;
  /** The lowest rank among the signals that put it in its card. */
  rank: number;
}

/** A row with its signals as tags (urgent first, then by rank); null when it has none. */
export function rankRow<R extends { tags: CockpitTag[] }>(row: Omit<R, "tags">, signals: CockpitSignal[]): RankedRow<R> | null {
  if (!signals.length) return null;
  const isUrgent = signals.some((s) => s.urgent);
  const ordered = [...signals].sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.rank - b.rank);
  // An attention signal never lifts a row within URGENT: only the signals of its own card rank it.
  const lead = ordered.filter((s) => s.urgent === isUrgent);
  const tags: CockpitTag[] = ordered.map(({ text, urgent }) => ({ text, urgent }));
  return { row: { ...row, tags } as R, urgent: isUrgent, rank: Math.min(...lead.map((s) => s.rank)) };
}

/** One card: sorted by rank then `tieBreak`, cut at `limit`; `total` counts all. */
export function cockpitCard<R>(rows: RankedRow<R>[], limit: number, tieBreak: (a: R, b: R) => number): { total: number; rows: R[] } {
  const sorted = [...rows].sort((a, b) => a.rank - b.rank || tieBreak(a.row, b.row));
  return { total: sorted.length, rows: sorted.slice(0, limit).map((r) => r.row) };
}
