"use client";

// Row count shown next to a card title.
export function CustomerCountChip({ count }: { count: number }) {
  return (
    <span className="rounded-full bg-white border border-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-600 tabular-nums">
      {count}
    </span>
  );
}
