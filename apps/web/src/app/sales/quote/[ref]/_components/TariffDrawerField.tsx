import type { ReactNode } from "react";

const FIELD_CLASS = "flex flex-col gap-1 text-[12px] font-semibold text-slate-600 min-w-0";

interface TariffDrawerFieldProps {
  label: string;
  /**
   * The control is a group of its own options (a Segmented, whose options are labels already): the
   * title stands above it without a <label>, which would nest labels and pick the first option
   * when the title is clicked. The control then carries its own aria-label.
   */
  group?: boolean;
  children: ReactNode;
}

// A field of the route in a "Tariffs available" drawer: its title above the control.
export const TariffDrawerField = ({ label, group, children }: TariffDrawerFieldProps) => {
  if (group) {
    return (
      <div className={FIELD_CLASS}>
        <span>{label}</span>
        {children}
      </div>
    );
  }
  return (
    <label className={FIELD_CLASS}>
      {label}
      {children}
    </label>
  );
};
