"use client";

import { Tag } from "antd";
import { SectionCard } from "@/components/SectionCard";
import { useCustomerNotes } from "@/hooks/useCustomerNotes";
import { formatDateTime } from "@/lib/date";
import { NOTE_TYPE_COLORS } from "../../_lib/constants";
import { daysSince, relativeDayLabel } from "../../_lib/customerDates";

interface CustomerLastInteractionCardProps {
  customerId: string;
  onSelectTab: (key: string) => void;
}

// Teaser of the newest entry of the Communication tab.
export function CustomerLastInteractionCard({ customerId, onSelectTab }: CustomerLastInteractionCardProps) {
  const { notes, isLoading, isError } = useCustomerNotes(customerId);
  // The API returns notes newest first.
  const lastNote = notes[0];
  const lastNoteDays = daysSince(lastNote?.createdAt);

  let emptyText = "No interactions logged yet.";
  if (isLoading) emptyText = "Loading…";
  if (isError) emptyText = "Could not load interactions.";

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
            {lastNoteDays !== null && <span title={formatDateTime(lastNote.createdAt)}>{relativeDayLabel(lastNoteDays)}</span>}
            {lastNote.author && <span>· {lastNote.author}</span>}
          </div>
          <p className="m-0 text-slate-700 line-clamp-3 [overflow-wrap:anywhere]">{lastNote.content}</p>
        </div>
      ) : (
        <p className="m-0 text-[13px] text-slate-400">{emptyText}</p>
      )}
    </SectionCard>
  );
}
