"use client";

interface RecordTabsProps {
  tabs: readonly { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
  // What the strip switches between, for screen readers: "Customer sections".
  label: string;
  className?: string;
}

// The underlined tab strip of a record or settings page. Keep the active tab in the URL (?tab=)
// so it survives a reload and can be linked to. At the bottom edge of a white header band the
// band's border is the line the tabs sit on; anywhere else give the strip one of its own
// (className="border-b border-slate-200").
export function RecordTabs({ tabs, active, onChange, label, className = "" }: RecordTabsProps) {
  return (
    <nav aria-label={label} className={`flex gap-0 overflow-x-auto ${className}`}>
      {tabs.map((tab) => {
        const selected = active === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            aria-current={selected ? "page" : undefined}
            onClick={() => onChange(tab.key)}
            className={`px-4 py-2.5 text-sm whitespace-nowrap cursor-pointer bg-transparent border-0 border-b-2 transition-all duration-150 ${
              selected
                ? "font-semibold text-indigo-500 border-indigo-500"
                : "font-normal text-slate-400 border-transparent hover:text-slate-600"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
