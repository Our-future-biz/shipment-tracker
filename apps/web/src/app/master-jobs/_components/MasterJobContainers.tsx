"use client";

import { useEffect, useState } from "react";
import { App, Button, Input, Select } from "antd";
import { ContainerOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { CONTAINER_TYPES } from "@/lib/cargo";
import type { MasterJobContainerLine, MasterJobShipmentItem } from "@/hooks/useMasterJobs";
import { MasterJobCard } from "./MasterJobFields";

interface MasterJobContainersProps {
  /** Anchor for the summary tile that jumps here. */
  id?: string;
  /** Full Load: the list is read live from the linked shipments' own containers. */
  fromShipments?: boolean;
  containers: MasterJobContainerLine[];
  shipments: MasterJobShipmentItem[];
  onSave: (containers: MasterJobContainerLine[]) => Promise<unknown>;
}

const emptyLine = (): MasterJobContainerLine => ({ containerNumber: "", sealNumber: "", type: "", shipmentIds: [] });

const TH = "px-2 py-2 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wide";

// The containers on the master BL, each assigned to the houses whose cargo it
// carries. Edited as one list and saved together; a save copies every house's
// assigned containers onto that house.
export function MasterJobContainers({ id, fromShipments, containers, shipments, onSave }: MasterJobContainersProps) {
  const { message } = App.useApp();
  const [draft, setDraft] = useState<MasterJobContainerLine[]>(containers);
  const [saving, setSaving] = useState(false);

  // A fresh server copy (after any save) replaces the draft.
  useEffect(() => setDraft(containers), [containers]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(containers);
  const houseOptions = shipments.map((s) => ({ value: s.id, label: s.jobNumber }));

  const handleChange = (index: number, patch: Partial<MasterJobContainerLine>) =>
    setDraft((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft.map((c) => ({ ...c, containerNumber: c.containerNumber.trim() })));
      message.success("Containers saved and copied to the shipments");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Saving the containers failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <MasterJobCard
      id={id}
      icon={<ContainerOutlined />}
      title={`Containers (${containers.length})`}
      actions={
        <>
          {dirty && (
            <Button size="small" onClick={() => setDraft(containers)} disabled={saving}>
              Discard
            </Button>
          )}
          <Button size="small" type="primary" onClick={handleSave} disabled={!dirty} loading={saving}>
            Save containers
          </Button>
        </>
      }
    >
      {fromShipments && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-indigo-50 text-[12px] text-indigo-700">
          Full Load: these are the containers of the linked shipments. Changes saved here are written back to them.
        </div>
      )}
      {draft.length === 0 ? (
        <div className="py-4 text-center text-xs text-slate-400">
          {fromShipments ? "The linked shipments have no containers yet." : "No containers on this master job yet."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-slate-200">
              <tr>
                <th className={`${TH} w-[170px]`}>Container Number</th>
                <th className={`${TH} w-[150px]`}>Seal Number</th>
                <th className={`${TH} w-[140px]`}>Type</th>
                <th className={TH}>Assigned shipments</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {draft.map((c, i) => (
                <tr key={c.id ?? `new-${i}`} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-2 py-1.5">
                    <Input
                      size="small"
                      placeholder="MSKU1234567"
                      value={c.containerNumber}
                      aria-label="Container number"
                      onChange={(e) => handleChange(i, { containerNumber: e.target.value.toUpperCase() })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      size="small"
                      value={c.sealNumber}
                      aria-label="Seal number"
                      onChange={(e) => handleChange(i, { sealNumber: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Select
                      size="small"
                      className="w-full"
                      value={c.type || undefined}
                      placeholder="Type"
                      aria-label="Container type"
                      options={CONTAINER_TYPES.map((t) => ({ value: t, label: t }))}
                      onChange={(type) => handleChange(i, { type })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Select
                      size="small"
                      mode="multiple"
                      className="w-full"
                      value={c.shipmentIds}
                      placeholder={shipments.length ? "Pick shipments" : "Link shipments first"}
                      aria-label="Assigned shipments"
                      options={houseOptions}
                      onChange={(shipmentIds) => handleChange(i, { shipmentIds })}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Button
                      size="small"
                      type="text"
                      icon={<DeleteOutlined />}
                      aria-label="Remove container"
                      onClick={() => setDraft((rows) => rows.filter((_, j) => j !== i))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Button
        size="small"
        type="dashed"
        icon={<PlusOutlined />}
        className="mt-3"
        onClick={() => setDraft((rows) => [...rows, emptyLine()])}
      >
        Add container
      </Button>
    </MasterJobCard>
  );
}
