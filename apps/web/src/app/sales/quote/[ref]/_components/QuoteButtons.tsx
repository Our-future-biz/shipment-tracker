import { DeleteOutlined } from "@ant-design/icons";
import type { PlainButtonProps } from "@/app/sales/_components/ToolbarButton";
import { BTN, BTN_SM, ICON_BTN_GHOST } from "@/styles/ui";

// The 24px button for an action inside a section card: as high as the small inputs it stands
// among, so it fits the header strip of a block of lines.
export function MiniButton({ icon, children, ...button }: PlainButtonProps) {
  return (
    <button
      type="button"
      {...button}
      className={`${BTN} ${BTN_SM}`}
    >
      {icon}
      {children}
    </button>
  );
}

interface RemoveLineButtonProps {
  label: string;
  onClick: () => void;
}

// Takes one line out of a block - a package, a cost line. `label` says which one, for those who
// do not see the row the bin stands in.
export function RemoveLineButton({ label, onClick }: RemoveLineButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title="Remove"
      onClick={onClick}
      className={`${ICON_BTN_GHOST} mx-auto hover:!bg-red-50 hover:!text-red-600`}
    >
      <DeleteOutlined />
    </button>
  );
}
