import { Pill } from "@/components/Pill";
import type { AttentionFlag } from "../_lib/attention";

// What needs a look, as a row of small marks (Council Outlay 14, A7). Nothing when nothing does:
// `quiet` then says so in words where a blank would read as "not looked at".
export function AttentionChips({ flags, quiet }: { flags: AttentionFlag[]; quiet?: string }) {
  if (flags.length === 0) return quiet ? <span className="text-[12px] text-slate-400">{quiet}</span> : null;
  return (
    <span className="flex flex-wrap gap-1" role="status" aria-label={`Needs a look: ${flags.map((f) => f.text).join(", ")}`}>
      {flags.map((f) => (
        <Pill key={f.key} tone={f.tone}>
          {f.text}
        </Pill>
      ))}
    </span>
  );
}
