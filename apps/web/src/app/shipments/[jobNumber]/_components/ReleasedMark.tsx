"use client";

import { CalendarOutlined, CheckCircleFilled, ClockCircleOutlined, MailOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";
import { HoverCard } from "@/components/HoverCard";
import { splitPersonStamp } from "@/app/shipments/_lib/personFields";

/** The mark's own look: a value-sized green box, framed as the row's other boxes (LOCKED_BOX). */
const MARK =
  "inline-flex items-center gap-1.5 h-6 px-2 rounded-md border border-emerald-200 bg-emerald-50 text-[13px] font-semibold text-emerald-800 whitespace-nowrap cursor-default";

// A released House BoL: a green Released mark, with who released it and when in a hover card,
// as a contact's. `stamp` is the server's "<who> — <date and time>".
export function ReleasedMark({ stamp }: { stamp: string }) {
  const { person, when } = splitPersonStamp(stamp);
  // "8. 11. 2026 10:29:57": the date, then the time after the last space (when there is one).
  const cut = when.lastIndexOf(" ");
  const hasTime = cut > 0 && when.slice(cut + 1).includes(":");
  const date = hasTime ? when.slice(0, cut) : when;
  const time = hasTime ? when.slice(cut + 1) : "";
  return (
    <HoverCard
      delay={0.3}
      content={
        // Who and when only: the row's label already says what was released.
        <div className="w-[220px] flex flex-col gap-1.5 text-xs">
          <Line icon={<MailOutlined />} value={person} />
          <Line icon={<CalendarOutlined />} value={date} />
          <Line icon={<ClockCircleOutlined />} value={time} />
        </div>
      }
    >
      <span className={MARK}>
        <CheckCircleFilled className="text-emerald-600 text-[14px]" aria-hidden />
        Released
      </span>
    </HoverCard>
  );
}

function Line({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-slate-400 text-[12px] shrink-0">{icon}</span>
      <span className="truncate text-slate-900">{value || "—"}</span>
    </div>
  );
}
