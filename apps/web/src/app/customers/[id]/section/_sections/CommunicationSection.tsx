"use client";

import { Spin, Tag } from "antd";
import { useMemo, useState } from "react";
import { useCustomerNotes, type NoteItem } from "@/hooks/useCustomerNotes";
import { KpiCard, SectionCard } from "./shared";

const NOTE_TYPES = ["Note", "Email", "Call", "Follow-up", "Visit"] as const;
type FilterValue = "all" | (typeof NOTE_TYPES)[number];

const FILTERS: { key: FilterValue; label: string }[] = [
  { key: "all", label: "All" },
  { key: "Note", label: "Note" },
  { key: "Email", label: "Email" },
  { key: "Call", label: "Call" },
  { key: "Follow-up", label: "Follow-up" },
  { key: "Visit", label: "Visit" },
];

const TYPE_COLORS: Record<string, string> = {
  Email: "blue",
  Call: "green",
  "Follow-up": "gold",
  Visit: "purple",
};

export function CommunicationSection({ customerId }: { customerId: string }) {
  const { notes, isLoading } = useCustomerNotes(customerId);
  const [filter, setFilter] = useState<FilterValue>("all");

  const rows = notes as NoteItem[];

  const counts = useMemo(() => {
    const byType = new Map<string, number>();
    for (const type of NOTE_TYPES) byType.set(type, 0);
    for (const note of rows) {
      byType.set(note.type, (byType.get(note.type) ?? 0) + 1);
    }
    return { total: rows.length, byType };
  }, [rows]);

  const filtered = useMemo(() => (filter === "all" ? rows : rows.filter((n) => n.type === filter)), [rows, filter]);

  const countFor = (key: FilterValue) => (key === "all" ? counts.total : counts.byType.get(key) ?? 0);

  return (
    <div>
      <div className="grid grid-cols-5 gap-3 mb-4">
        <KpiCard label="Total" value={counts.total} />
        <KpiCard label="Note" value={counts.byType.get("Note") ?? 0} />
        <KpiCard label="Email" value={counts.byType.get("Email") ?? 0} />
        <KpiCard label="Call" value={counts.byType.get("Call") ?? 0} />
        <KpiCard label="Follow-up" value={counts.byType.get("Follow-up") ?? 0} />
      </div>

      <SectionCard title="Activity feed">
        <div className="flex flex-wrap gap-2 mb-4">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`text-xs font-medium rounded-full px-3 py-1 transition-colors ${
                filter === f.key ? "bg-indigo-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f.label} ({countFor(f.key)})
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spin />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-slate-400 py-8 text-center">No activity</div>
        ) : (
          <div className="space-y-3">
            {filtered.map((note) => (
              <div key={note.id} className="border border-slate-100 rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <Tag color={TYPE_COLORS[note.type] ?? "default"}>{note.type}</Tag>
                  <span className="text-xs text-slate-500">{note.author || "—"}</span>
                  <span className="text-xs text-slate-400 ml-auto">{new Date(note.createdAt).toLocaleString("en-GB")}</span>
                </div>
                <div className="text-sm text-slate-700 mt-1.5 whitespace-pre-wrap">{note.content}</div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
