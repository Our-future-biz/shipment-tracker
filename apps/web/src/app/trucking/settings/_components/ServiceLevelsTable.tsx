"use client";

import dayjs from "dayjs";
import { Switch, Table, TimePicker } from "antd";
import type { interfaces } from "@/lib/api/client";
import { workingDaysText } from "../../_lib/settings";

interface ServiceLevelsTableProps {
  levels: interfaces.ServiceLevelSetting[];
  disabled: boolean;
  onChange: (code: interfaces.ServiceLevelCode, patch: Partial<interfaces.ServiceLevelSetting>) => void;
}

const timeValue = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return dayjs().hour(h ?? 0).minute(m ?? 0).second(0);
};

// The eight service levels: their working days follow from the code; the cut-off and whether the
// level is offered are set here.
export const ServiceLevelsTable = ({ levels, disabled, onChange }: ServiceLevelsTableProps) => (
  <Table<interfaces.ServiceLevelSetting>
    size="small"
    pagination={false}
    rowKey="code"
    dataSource={levels}
    columns={[
      { key: "label", title: "Service level", render: (_, l) => <span className="font-semibold text-slate-800">{l.label}</span> },
      { key: "days", title: "Due", render: (_, l) => <span className="text-slate-600">{workingDaysText(l.code, l.workingDays)}</span> },
      {
        key: "cutoff",
        title: "Order cut-off (Prague)",
        render: (_, l) => (
          <TimePicker
            format="HH:mm"
            minuteStep={5}
            allowClear={false}
            needConfirm={false}
            aria-label={`${l.label} cut-off`}
            value={timeValue(l.cutoff)}
            disabled={disabled}
            onChange={(t) => t && onChange(l.code, { cutoff: t.format("HH:mm") })}
            className="w-[110px]"
          />
        ),
      },
      {
        key: "active",
        title: "Offered",
        render: (_, l) => (
          <Switch size="small" checked={l.active} disabled={disabled} aria-label={`${l.label} offered`} onChange={(active) => onChange(l.code, { active })} />
        ),
      },
    ]}
  />
);
