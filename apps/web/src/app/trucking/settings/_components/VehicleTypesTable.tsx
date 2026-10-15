"use client";

import { Button, Input, InputNumber, Switch, Table, Tooltip } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { interfaces } from "@/lib/api/client";
import { MAX_LDM, vehicleTypeProblems } from "../../_lib/settings";

type VehicleType = interfaces.VehicleTypeSetting;

interface VehicleTypesTableProps {
  types: VehicleType[];
  /** Codes already saved: they are the key hauliers point to, so they are not changed. */
  savedCodes: ReadonlySet<string>;
  disabled: boolean;
  onChange: (types: VehicleType[]) => void;
}

const NEW_TYPE: VehicleType = { code: "", label: "", capacityLdm: 13.6, capacityKg: 24000, palletPlaces: 33, tailLift: false, active: true };

// The vehicle types hauliers can offer and trips are planned with. A saved type is switched off
// rather than renamed: its code stays.
export const VehicleTypesTable = ({ types, savedCodes, disabled, onChange }: VehicleTypesTableProps) => {
  const patch = (index: number, p: Partial<VehicleType>) => onChange(types.map((t, i) => (i === index ? { ...t, ...p } : t)));
  const handleAdd = () => onChange([...types, { ...NEW_TYPE }]);
  const handleRemove = (index: number) => onChange(types.filter((_, i) => i !== index));

  return (
    <div className="flex flex-col gap-2">
      <Table<VehicleType>
        size="small"
        pagination={false}
        // Index keys: every cell is controlled, so a removed row cannot leave its values behind.
        rowKey={(_, i) => String(i)}
        dataSource={types}
        scroll={{ x: true }}
        columns={[
          {
            key: "code",
            title: "Code",
            render: (_, t, i) => {
              const problems = vehicleTypeProblems(t).filter((p) => p.startsWith("code"));
              return (
                <Tooltip title={savedCodes.has(t.code) ? "Saved codes stay; switch the type off instead" : problems[0]}>
                  <Input
                    aria-label={`Vehicle type ${i + 1} code`}
                    value={t.code}
                    status={problems.length ? "error" : undefined}
                    disabled={disabled || savedCodes.has(t.code)}
                    placeholder="e.g. tautliner_136"
                    onChange={(e) => patch(i, { code: e.target.value.trim().toLowerCase() })}
                    className="w-[150px] font-mono"
                  />
                </Tooltip>
              );
            },
          },
          {
            key: "label",
            title: "Label",
            render: (_, t, i) => (
              <Input aria-label={`Vehicle type ${i + 1} label`} value={t.label} status={t.label.trim() ? undefined : "error"} disabled={disabled} onChange={(e) => patch(i, { label: e.target.value })} className="w-[180px]" />
            ),
          },
          {
            key: "ldm",
            title: "LDM",
            render: (_, t, i) => (
              <InputNumber aria-label={`Vehicle type ${i + 1} LDM`} value={t.capacityLdm} min={0.1} max={MAX_LDM} step={0.1} disabled={disabled} onChange={(v) => patch(i, { capacityLdm: v ?? 0 })} className="w-[80px]" />
            ),
          },
          {
            key: "kg",
            title: "kg",
            render: (_, t, i) => (
              <InputNumber aria-label={`Vehicle type ${i + 1} kg`} value={t.capacityKg} min={1} step={100} disabled={disabled} onChange={(v) => patch(i, { capacityKg: v ?? 0 })} className="w-[100px]" />
            ),
          },
          {
            key: "pp",
            title: "Pallet places",
            render: (_, t, i) => (
              <InputNumber aria-label={`Vehicle type ${i + 1} pallet places`} value={t.palletPlaces} min={0} precision={0} disabled={disabled} onChange={(v) => patch(i, { palletPlaces: v ?? 0 })} className="w-[80px]" />
            ),
          },
          {
            key: "lift",
            title: "Tail-lift",
            render: (_, t, i) => <Switch size="small" checked={t.tailLift} disabled={disabled} aria-label={`Vehicle type ${i + 1} tail-lift`} onChange={(tailLift) => patch(i, { tailLift })} />,
          },
          {
            key: "active",
            title: "Active",
            render: (_, t, i) => <Switch size="small" checked={t.active} disabled={disabled} aria-label={`Vehicle type ${i + 1} active`} onChange={(active) => patch(i, { active })} />,
          },
          {
            key: "remove",
            title: "",
            render: (_, t, i) =>
              disabled ? null : (
                <Tooltip title={savedCodes.has(t.code) ? "Remove — hauliers that offer it keep the code until edited; switching it off is usually enough" : "Remove"}>
                  <Button type="text" size="small" danger aria-label={`Remove vehicle type ${i + 1}`} icon={<DeleteOutlined />} onClick={() => handleRemove(i)} />
                </Tooltip>
              ),
          },
        ]}
      />
      {!disabled && (
        <div>
          <Button size="small" icon={<PlusOutlined />} onClick={handleAdd}>
            Add vehicle type
          </Button>
        </div>
      )}
    </div>
  );
};
