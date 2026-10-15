"use client";

interface CountToggleButtonProps {
  // What is counted, e.g. "Urgents in next 24hrs"; shown in capitals.
  label: string;
  // How many rows the filter finds, over the whole list whatever it is searched or filtered by.
  // Undefined while nobody has counted them: a dash is shown then, never a zero.
  count: number | undefined;
  // The list is narrowed to those rows.
  active: boolean;
  onToggle: () => void;
  title?: string;
}

// A count that is also a filter, at the left of a list's toolbar: it says how many rows need
// attention and a click narrows the list to them; another click shows all rows again. The count
// turns red when there is something to do, the whole button while the filter is on.
export function CountToggleButton({ label, count, active, onToggle, title }: CountToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      title={title}
      className={`flex items-center gap-2 shrink-0 h-9 pl-3 pr-1.5 rounded-lg border text-[13px] font-bold uppercase tracking-wide cursor-pointer transition-colors ${
        active ? "border-red-600 bg-red-50 text-red-700" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
      <span
        className={`inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full text-[13px] font-bold tracking-normal tabular-nums ${
          count ? "bg-red-600 text-white" : "bg-slate-100 text-slate-500"
        }`}
      >
        {count ?? "—"}
      </span>
    </button>
  );
}
