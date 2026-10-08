"use client";

import { Tag } from "antd";
import dayjs from "dayjs";
import { SectionCard } from "@/components/SectionCard";
import { useCustomerNotes } from "@/hooks/useCustomerNotes";
import { formatDateTime } from "@/lib/date";
import { NOTE_TYPE_COLORS } from "../../_lib/constants";

// "Today" / "Yesterday" / "N days ago", counted in calendar days so a note from late last night is not "Today".
function daysAgoLabel(iso: string): string {
  const days = dayjs().startOf("day").diff(dayjs(iso).startOf("day"), "day");
  if (Number.isNaN(days)) return "";
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

interface CustomerLastInteractionCardProps {
  customerId: string;
  onSelectTab: (key: string) => void;
}

// Teaser of the newest entry of the Communication tab.
export function CustomerLastInteractionCard({ customerId, onSelectTab }: CustomerLastInteractionCardProps) {
  const { notes, isLoading } = useCustomerNotes(customerId);
  // The API returns notes newest first.
  const lastNote = notes[0];

  return (
    <SectionCard
      title="Last interaction"
      extra={
        <button
          type="button"
          onClick={() => onSelectTab("communication")}
          className="bg-transparent border-0 p-0 text-xs font-semibold text-indigo-600 whitespace-nowrap cursor-pointer hover:underline"
        >
          Open communication
        </button>
      }
    >
      {lastNote ? (
        <div className="text-[13px]">
          <div className="flex items-center gap-2 flex-wrap mb-1.5 text-xs text-slate-500">
            <Tag color={NOTE_TYPE_COLORS[lastNote.type] ?? "default"} className="!m-0">
              {lastNote.type}
            </Tag>
            <span title={formatDateTime(lastNote.createdAt)}>{daysAgoLabel(lastNote.createdAt)}</span>
            {lastNote.author && <span>· {lastNote.author}</span>}
          </div>
          <p className="m-0 text-slate-700 line-clamp-3 [overflow-wrap:anywhere]">{lastNote.content}</p>
        </div>
      ) : (
        <p className="m-0 text-[13px] text-slate-400">{isLoading ? "Loading…" : "No interactions logged yet."}</p>
      )}
    </SectionCard>
  );
}
