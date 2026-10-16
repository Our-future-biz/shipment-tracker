import { Badge, type Tone } from "../gate-log/_lib/gate";
import { customsChipText, customsHint, type CustomsClock, type CustomsClockState, type CustomsRegime } from "./customsClock";

// The "Customs deadline" chip: days under customs control and the 90-day temporary-storage
// deadline, shown on Positions, Stock on Hand, Ageing and the Bonded Register. Red overdue, amber
// with 10 days left or fewer, blue while running, grey when stopped; nothing when not under control.

/** The counter as the server sends it on stock lines / bonded entries, or as customsClock.ts makes it. */
export type CustomsClockLike = Omit<CustomsClock, "state" | "regime"> & { state: string; regime: string };

const TONE: Record<CustomsClockState, Tone> = { none: "", not_started: "", ok: "b", warning: "a", overdue: "r", stopped: "" };

const asClock = (c: CustomsClockLike): CustomsClock => ({ ...c, state: c.state as CustomsClockState, regime: c.regime as CustomsRegime });

export function CustomsDeadlineChip({ clock, empty = "—" }: { clock: CustomsClockLike | null | undefined; empty?: string }) {
  if (!clock || clock.state === "none") return <span className="text-slate-300">{empty}</span>;
  const c = asClock(clock);
  return (
    <Badge tone={TONE[c.state] ?? ""} title={customsHint(c)}>
      {customsChipText(c)}
    </Badge>
  );
}

export const customsTitle = (clock: CustomsClockLike) => customsHint(asClock(clock));
