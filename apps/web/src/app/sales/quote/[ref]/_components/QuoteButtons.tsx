import { DeleteOutlined } from "@ant-design/icons";
import type { PlainButtonProps } from "@/app/sales/_components/ToolbarButton";

// The 24px button for an action inside a section card: as high as the small inputs it stands
// among, so it fits the header strip of a block of lines.
export function MiniButton({ icon, children, ...button }: PlainButtonProps) {
  return (
    <button
      type="button"
      {...button}
      className="inline-flex items-center gap-1.5 shrink-0 h-6 px-2 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 whitespace-nowrap transition-colors cursor-pointer hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {icon}
      {children}
    </button>
  );
}

// Takes one line out of a block - a package, a cost line. `label` says which one, for those who
// do not see the row the bin stands in.
export function RemoveLineButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title="Remove"
      onClick={onClick}
      className="flex items-center justify-center w-6 h-6 mx-auto rounded-md text-red-600 cursor-pointer transition-colors hover:bg-red-50"
    >
      <DeleteOutlined />
    </button>
  );
}
