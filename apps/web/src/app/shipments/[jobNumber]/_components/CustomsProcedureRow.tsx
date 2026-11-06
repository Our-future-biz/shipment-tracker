"use client";

import { Select } from "antd";
import { CUSTOMS_OFFICES, namesCustomsOffice } from "@/lib/customsOffices";
import { foldIncludes } from "@/lib/fold";
import { LABEL_TEXT } from "@/styles/ui";
import { EditableCell } from "./EditableCell";
import { LABEL, LABEL_W, ROW } from "./detailStyles";

const OFFICE_OPTIONS = CUSTOMS_OFFICES.map((office) => ({ value: office, label: office }));

interface CustomsProcedureRowProps {
  label: string;
  value?: string | null;
  customsOffice?: string | null;
  onCommit: (fieldKey: string, value: string) => void;
  displayStyle?: React.CSSProperties;
  labelW?: string;
}

// Customs Procedure, and beside it when that is T1 the Customs Office, picked from the list by its
// code or name. Empty, the box is marked as still to do; with no room beside, it goes under.
export function CustomsProcedureRow({ label, value, customsOffice, onCommit, displayStyle, labelW = LABEL_W }: CustomsProcedureRowProps) {
  const t1 = namesCustomsOffice(value);
  return (
    <div className={`${ROW} ${t1 ? "flex-wrap" : ""}`}>
      <span className={LABEL.replace(LABEL_W, labelW)}>{label}</span>
      <EditableCell
        className={t1 ? "w-[80px] shrink-0" : "flex-1 min-w-0"}
        fieldKey="customsProcedure"
        value={value}
        onCommit={onCommit}
        placeholder="—"
        displayClassName="text-slate-900"
        emptyClassName="text-slate-400"
        displayStyle={displayStyle}
      />
      {t1 && (
        <div className="flex items-center gap-3 flex-1 min-w-[280px]" title={customsOffice || undefined}>
          <span className={`${LABEL_TEXT} shrink-0`}>Customs Office</span>
          <Select
            size="small"
            showSearch
            allowClear
            aria-label="Customs Office"
            className="flex-1 min-w-0"
            popupMatchSelectWidth={520}
            placeholder="Select customs office"
            status={customsOffice ? undefined : "warning"}
            value={customsOffice || undefined}
            options={OFFICE_OPTIONS}
            filterOption={(input, option) => foldIncludes(option?.label ?? "", input)}
            onChange={(office) => onCommit("customsOffice", office ?? "")}
          />
        </div>
      )}
    </div>
  );
}
