"use client";

import { useState } from "react";
import { rowKey } from "@/app/shipments/_lib/rowKey";
import { App, Button, Input, Select } from "antd";
import { apiErrorMessage } from "@/lib/api";
import { ContainerOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { CONTAINER_TYPES, containerType } from "@/lib/cargo";
import { containerNumberInput, isValidContainerNumber } from "@/lib/container";
import type { MasterJobContainerLine, MasterJobShipmentItem } from "@/hooks/useMasterJobs";
import { HINT, TD, TH } from "@/styles/ui";
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

// The containers on the master BL, each assigned to the houses whose cargo it
// carries. Edited as one list and saved together; a save copies every house's
// assigned containers onto that house.
export function MasterJobContainers({ id, fromShipments, containers, shipments, onSave }: MasterJobContainersProps) {
  const { message } = App.useApp();
  // The draft belongs to the server copy it was edited from: a fresh copy (after any save)
  // replaces it.
  const [edit, setEdit] = useState({ base: containers, rows: containers });
  const draft = edit.base === containers ? edit.rows : containers;
  const setDraft = (next: MasterJobContainerLine[] | ((rows: MasterJobContainerLine[]) => MasterJobContainerLine[])) =>
    setEdit((e) => {
      const rows = e.base === containers ? e.rows : containers;
      return { base: containers, rows: typeof next === "function" ? next(rows) : next };
    });
  const [saving, setSaving] = useState(false);

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
      message.error(`Saving the containers failed: ${apiErrorMessage(err)}`);
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
          <Button size="small" type="primary" onClick={handleSave} disabled={!dirty || !draft.every((c) => isValidContainerNumber(c.containerNumber))} loading={saving}>
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
        <div className={`py-4 text-center ${HINT}`}>
          {fromShipments ? "The linked shipments have no containers yet." : "No containers on this master job yet."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className={`${TH} w-[170px]`}>Container Number</th>
                <th className={`${TH} w-[150px]`}>Seal Number</th>
                <th className={`${TH} w-[140px]`}>Type</th>
                <th className={TH}>Assigned shipments</th>
                <th className={`${TH} w-10`} />
              </tr>
            </thead>
            <tbody>
              {draft.map((c, i) => (
                <tr key={c.id ?? rowKey(c)}>
                  <td className={TD}>
                    <Input
                      size="small"
                      placeholder="MSKU1234567"
                      value={c.containerNumber}
                      // Incomplete (not 4 letters + 7 digits) shows red and blocks Save.
                      status={isValidContainerNumber(c.containerNumber) ? undefined : "error"}
                      aria-label="Container number"
                      onChange={(e) => handleChange(i, { containerNumber: containerNumberInput(e.target.value) })}
                    />
                  </td>
                  <td className={TD}>
                    <Input
                      size="small"
                      value={c.sealNumber}
                      aria-label="Seal number"
                      onChange={(e) => handleChange(i, { sealNumber: e.target.value })}
                    />
                  </td>
                  <td className={TD}>
                    <Select
                      size="small"
                      className="w-full"
                      value={containerType(c.type) || undefined}
                      placeholder="Type"
                      aria-label="Container type"
                      options={CONTAINER_TYPES.map((t) => ({ value: t, label: t }))}
                      onChange={(type) => handleChange(i, { type })}
                    />
                  </td>
                  <td className={TD}>
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
                  <td className={`${TD} text-right`}>
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
        icon={<PlusOutlined />}
        className="mt-3"
        onClick={() => setDraft((rows) => [...rows, emptyLine()])}
      >
        Add container
      </Button>
    </MasterJobCard>
  );
}
