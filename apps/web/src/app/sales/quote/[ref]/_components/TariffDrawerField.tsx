import type { ReactNode } from "react";
import { Segmented } from "antd";
import type { interfaces } from "@/lib/api/client";
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

const IMPORT = { value: "import" as const, label: "Import" };
const EXPORT = { value: "export" as const, label: "Export" };

// The direction worked with stands out in the app's indigo, white on it, though the switch is
// read-only (antd would grey a disabled one's choice out like the other).
const CHOSEN_DIRECTION =
  "[&_.ant-segmented-item-selected]:!bg-indigo-600 [&_.ant-segmented-item-selected]:!text-white [&_.ant-segmented-thumb]:!bg-indigo-600";

/**
 * The quote's Trade Direction in a "Tariffs available" drawer: a tariff prices only the directions
 * it is for, so it is shown here and changed in Shipment details, not here.
 */
export const TariffDirectionField = ({ direction, exportFirst = false }: { direction: interfaces.RailDirection | undefined; exportFirst?: boolean }) => (
  <TariffDrawerField label="Trade Direction" group>
    <Segmented<interfaces.RailDirection>
      size="middle"
      aria-label="Direction"
      className={CHOSEN_DIRECTION}
      value={direction}
      options={exportFirst ? [EXPORT, IMPORT] : [IMPORT, EXPORT]}
      disabled
    />
  </TariffDrawerField>
);
