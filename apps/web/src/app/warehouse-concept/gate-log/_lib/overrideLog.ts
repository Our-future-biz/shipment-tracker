// The supervisor override log of a gate record, readable (user council W17, 20 Nov 2026: it was one
// long line with an ISO date). The server writes
//   "<when> · OVERRIDE by <who> · gates at moment of override: <line: state; …> · reason: <reason>"
// with <when> in Prague time - "DD.MM.YYYY HH:mm" now, "YYYY-MM-DD HH:mm" in older logs. Pure
// helpers (tested in overrideLog.test.ts).

export interface OverrideLogParts {
  /** DD.MM.YYYY HH:mm (Prague time, as written). */
  at: string;
  by: string;
  /** The release lines at that moment. */
  lines: { g: string; s: string }[];
  reason: string;
}

const LOG = /^(.+?) · OVERRIDE by (.*?) · gates at moment of override: (.*?) · reason: ([\s\S]*)$/;

/** The parts of an override log, or null for text in another form (then shown as it is). */
export function overrideLogParts(log: string | null | undefined): OverrideLogParts | null {
  const hit = (log ?? "").trim().match(LOG);
  if (!hit) return null;
  const [, when, by, gates, reason] = hit;
  const iso = when!.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})$/);
  const lines =
    gates === "none"
      ? []
      : gates!
          .split(";")
          .map((x) => x.trim())
          .filter(Boolean)
          .map((x) => {
            const i = x.lastIndexOf(":");
            return i < 0 ? { g: x, s: "" } : { g: x.slice(0, i).trim(), s: x.slice(i + 1).trim() };
          });
  return { at: iso ? `${iso[3]}.${iso[2]}.${iso[1]} ${iso[4]}` : when!, by: by === "—" ? "" : by!, lines, reason: reason!.trim() };
}

/** "Supervisor override 20.11.2026 09:27 · Lukas Slavik" (the short line beside the release state). */
export function overrideSummary(log: string | null | undefined): string {
  const p = overrideLogParts(log);
  if (!p) return log ?? "";
  return `Supervisor override ${p.at}${p.by ? ` · ${p.by}` : ""}`;
}
