"use client";

export interface ContainerTab {
  key: string;
  label: string;
  // The container's type ("40' HC"), shown after its number.
  type?: string | null;
  // A container's number is set in mono type; the "No container" tab is not.
  isContainer: boolean;
  // Whether the container's lines add up to what it declares; null shows no dot (nothing to
  // check yet, or no container).
  matched: boolean | null;
}

interface ContainerTabsProps {
  tabs: ContainerTab[];
  activeKey: string;
  onChange: (key: string) => void;
  // The strip's side padding, which differs between a card and a dialog.
  className?: string;
}

// A shipment's containers as tabs over their cargo lines (Cargo Details, the grid's Dimensions
// dialog). The open container stands out: tinted tab, indigo number and a thick indigo bar
// along its bottom edge; the others stay quiet until hovered. A dot says whether the
// container's lines add up to what it declares: green yes, red no.
export function ContainerTabs({ tabs, activeKey, onChange, className = "" }: ContainerTabsProps) {
  return (
    <div role="tablist" aria-label="Containers" className={`flex items-end gap-1 pt-2 bg-white border-b border-slate-200 overflow-x-auto ${className}`}>
      {tabs.map((t) => {
        const on = t.key === activeKey;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.key)}
            className={[
              "relative flex items-center gap-2 px-4 py-2.5 rounded-t-lg border-0 text-[13px] whitespace-nowrap cursor-pointer transition-colors",
              "outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-inset",
              on ? "bg-indigo-50 text-indigo-700" : "bg-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800",
            ].join(" ")}
          >
            {on && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] rounded-t bg-indigo-500" />}
            {t.matched !== null && (
              <span
                role="img"
                className={`w-2 h-2 rounded-full ${t.matched ? "bg-emerald-500" : "bg-red-500"}`}
                title={t.matched ? "Matched" : "Mismatch"}
                aria-label={t.matched ? "Matched" : "Mismatch"}
              />
            )}
            <span className={`${t.isContainer ? "font-mono tracking-wide" : ""} ${on ? "font-bold" : "font-semibold"}`}>{t.label}</span>
            {t.type && <span className={`text-xs ${on ? "text-indigo-500" : "text-slate-400"}`}>{t.type}</span>}
          </button>
        );
      })}
    </div>
  );
}
