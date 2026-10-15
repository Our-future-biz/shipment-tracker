"use client";

import { Button, Input, Select, Table, Tooltip } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { interfaces } from "@/lib/api/client";
import { formatPsc, isValidPsc, LANE_KIND_LABELS, pscDigits, pscRangeProblem, type LaneDraft } from "../../_lib/hauliers";

type PscField = "originPostcodeFrom" | "originPostcodeTo" | "destPostcodeFrom" | "destPostcodeTo";

interface HaulierLanesTableProps {
  lanes: LaneDraft[];
  onChange: (lanes: LaneDraft[]) => void;
}

// Keys of lanes added here (saved lanes are keyed by their id).
let newLaneSeq = 0;
const newLaneKey = () => `new-${++newLaneSeq}`;

const KIND_OPTIONS = (Object.keys(LANE_KIND_LABELS) as interfaces.LaneServiceKind[]).map((k) => ({ value: k, label: LANE_KIND_LABELS[k] }));

// The routes a haulier likes to run, as postcode ranges from – to (PSČ shown as "110 00").
export const HaulierLanesTable = ({ lanes, onChange }: HaulierLanesTableProps) => {
  const patch = (key: string, p: Partial<LaneDraft>) => onChange(lanes.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const handleAdd = () =>
    onChange([...lanes, { key: newLaneKey(), originPostcodeFrom: "", originPostcodeTo: "", destPostcodeFrom: "", destPostcodeTo: "", serviceKind: "ANY", note: "" }]);
  const handleRemove = (key: string) => onChange(lanes.filter((l) => l.key !== key));

  const pscInput = (lane: LaneDraft, field: PscField, label: string, rangeBad: boolean) => (
    <Input
      aria-label={label}
      value={formatPsc(lane[field])}
      status={!isValidPsc(lane[field]) || rangeBad ? "error" : undefined}
      placeholder="110 00"
      inputMode="numeric"
      onChange={(e) => patch(lane.key, { [field]: pscDigits(e.target.value) })}
      className="w-[84px] tabular-nums"
    />
  );

  const range = (lane: LaneDraft, from: PscField, to: PscField, what: string, n: number) => {
    const problem = pscRangeProblem(lane[from], lane[to]);
    const rangeBad = problem !== null && isValidPsc(lane[from]) && isValidPsc(lane[to]);
    return (
      <Tooltip title={problem ? `${what}: ${problem}` : undefined}>
        <span className="inline-flex items-center gap-1">
          {pscInput(lane, from, `Lane ${n} ${what} from`, rangeBad)}
          <span className="text-slate-400">–</span>
          {pscInput(lane, to, `Lane ${n} ${what} to`, rangeBad)}
        </span>
      </Tooltip>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <Table<LaneDraft>
        size="small"
        pagination={false}
        rowKey="key"
        dataSource={lanes}
        scroll={{ x: true }}
        locale={{ emptyText: "No preferred lanes yet." }}
        columns={[
          { key: "origin", title: "Origin PSČ from – to", render: (_, l, i) => range(l, "originPostcodeFrom", "originPostcodeTo", "origin", i + 1) },
          { key: "dest", title: "Destination PSČ from – to", render: (_, l, i) => range(l, "destPostcodeFrom", "destPostcodeTo", "destination", i + 1) },
          {
            key: "kind",
            title: "Kind",
            render: (_, l, i) => (
              <Select aria-label={`Lane ${i + 1} kind`} value={l.serviceKind} options={KIND_OPTIONS} onChange={(serviceKind) => patch(l.key, { serviceKind })} className="w-[110px]" />
            ),
          },
          {
            key: "note",
            title: "Note",
            render: (_, l, i) => <Input aria-label={`Lane ${i + 1} note`} value={l.note} onChange={(e) => patch(l.key, { note: e.target.value })} className="min-w-[160px]" />,
          },
          {
            key: "remove",
            title: "",
            render: (_, l, i) => (
              <Tooltip title="Remove lane">
                <Button type="text" size="small" danger aria-label={`Remove lane ${i + 1}`} icon={<DeleteOutlined />} onClick={() => handleRemove(l.key)} />
              </Tooltip>
            ),
          },
        ]}
      />
      <div>
        <Button size="small" icon={<PlusOutlined />} onClick={handleAdd}>
          Add lane
        </Button>
      </div>
    </div>
  );
};
