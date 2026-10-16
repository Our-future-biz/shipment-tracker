interface MenuLabelProps {
  label: string;
  /** Why the item cannot be chosen now; "" when it can. */
  reason: string;
}

// A dropdown menu item that is disabled says why under its name: one rule in Trucking, a control
// that cannot be used is shown disabled with its reason, never hidden or left unexplained.
export const MenuLabel = ({ label, reason }: MenuLabelProps) =>
  reason ? (
    <span className="flex flex-col">
      <span>{label}</span>
      <span className="max-w-[280px] whitespace-normal text-[11px] leading-snug text-slate-400">{reason}</span>
    </span>
  ) : (
    <>{label}</>
  );
