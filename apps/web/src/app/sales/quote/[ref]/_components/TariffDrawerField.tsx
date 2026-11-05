import type { ReactNode } from "react";
import { LABEL_TEXT } from "@/styles/ui";

const FIELD_CLASS = "flex flex-col gap-1 min-w-0";

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
        <span className={LABEL_TEXT}>{label}</span>
        {children}
      </div>
    );
  }
  return (
    <label className={FIELD_CLASS}>
      <span className={LABEL_TEXT}>{label}</span>
      {children}
    </label>
  );
};
