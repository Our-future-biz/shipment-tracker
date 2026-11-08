"use client";

import { useState } from "react";
import { rowKey } from "@/app/shipments/_lib/rowKey";
import { App, Button, Input, Select, Tooltip } from "antd";
import { apiErrorMessage } from "@/lib/api";
import { ContainerOutlined, PlusOutlined } from "@ant-design/icons";
import { RowActionsMenu } from "@/app/shipments/_components/RowActionsMenu";
import { CONTAINER_TYPES, containerType } from "@/lib/cargo";
import { containerNumberInput, isValidContainerNumber } from "@/lib/container";
import type { MasterJobContainerLine, MasterJobShipmentItem } from "@/hooks/useMasterJobs";
import { EMPTY_STATE, LABEL_TEXT } from "@/styles/ui";
import { CARD_BODY_PADDED, MasterJobCard } from "./MasterJobFields";
import { LOCKED_CONTROL, LOCKED_INPUT, OPEN_ROW_ATTR, lockOnEnter, useOpenRow } from "../_lib/rowLock";

interface MasterJobContainersProps {
  /** Anchor for the summary tile that jumps here. */
  id?: string;
  /** Full Load: the list is read live from the linked shipments' own containers. */
  fromShipments?: boolean;
  containers: MasterJobContainerLine[];
  shipments: MasterJobShipmentItem[];
  onSave: (containers: MasterJobContainerLine[]) => Promise<unknown>;
}

// The Container Details table look: column titles over a slate-200 rule, rows split by thin
// slate-100 lines (none under the last row), centred short codes.
const TH = `px-2 pb-2 text-left align-bottom whitespace-nowrap ${LABEL_TEXT} border-b border-slate-200`;
const TD = "px-2 py-1.5 align-middle text-[13px] text-slate-700";

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
  // A row with a valid number is locked: a double-click opens it, a click elsewhere locks it again. A
  // row still being typed (no valid number yet) stays open.
  const { openKey, open, close } = useOpenRow();
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
      // a table, as Container Details has it: the card's full padding
      bodyClassName={CARD_BODY_PADDED}
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
      <div className="relative">
        {/* Add container: the small "+" laid over the header row's right end, above the rows' "⋯". */}
        <Tooltip title="Add container">
          <Button
            size="small"
            type="primary"
            icon={<PlusOutlined className="text-[11px]" />}
            aria-label="Add container"
            onClick={() => setDraft((rows) => [...rows, emptyLine()])}
            className="!absolute -top-1 right-[7px] z-10 !w-[22px] !h-[22px] !min-w-0 !p-0"
          />
        </Tooltip>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr>
                <th className={`${TH} w-[190px]`}>Container Number</th>
                <th className={`${TH} w-[160px] !text-center`}>Seal Number</th>
                <th className={`${TH} w-[150px] !text-center`}>Type</th>
                <th className={TH}>Assigned shipments</th>
                {/* The actions column: the "+" above lies over it. */}
                <th className={`${TH} w-9`} />
              </tr>
            </thead>
            <tbody>
              {draft.map((c, i) => {
                const key = c.id ?? rowKey(c);
                // An empty number counts as valid (it can be left out), so a row needs one to lock.
                const locked = openKey !== key && !!c.containerNumber.trim() && isValidContainerNumber(c.containerNumber);
                return (
                <tr
                  key={key}
                  {...(locked ? {} : { [OPEN_ROW_ATTR]: "" })}
                  onDoubleClick={locked ? () => open(key) : undefined}
                  // A row being typed in is the open one, so it stays open when its number turns valid.
                  onFocus={locked ? undefined : () => openKey !== key && open(key)}
                  onKeyDown={locked ? undefined : lockOnEnter(close)}
                  title={locked ? "Double-click to edit" : undefined}
                  className={`${i < draft.length - 1 ? "border-b border-slate-100" : ""} ${locked ? "cursor-pointer hover:bg-slate-50/60" : ""}`}
                >
                  <td className={TD}>
                    <Input
                      size="small"
                      placeholder="MSKU1234567"
                      readOnly={locked}
                      className={locked ? LOCKED_INPUT : undefined}
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
                      readOnly={locked}
                      className={`text-center ${locked ? LOCKED_INPUT : ""}`}
                      value={c.sealNumber}
                      aria-label="Seal number"
                      onChange={(e) => handleChange(i, { sealNumber: e.target.value })}
                    />
                  </td>
                  <td className={TD}>
                    <Select
                      size="small"
                      className={`w-full [&_.ant-select-selection-item]:!text-center [&_.ant-select-selection-placeholder]:!text-center ${locked ? LOCKED_CONTROL : ""}`}
                      open={locked ? false : undefined}
                      tabIndex={locked ? -1 : undefined}
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
                      className={`w-full ${locked ? LOCKED_CONTROL : ""}`}
                      open={locked ? false : undefined}
                      tabIndex={locked ? -1 : undefined}
                      value={c.shipmentIds}
                      placeholder={shipments.length ? "Pick shipments" : "Link shipments first"}
                      aria-label="Assigned shipments"
                      options={houseOptions}
                      onChange={(shipmentIds) => handleChange(i, { shipmentIds })}
                    />
                  </td>
                  {/* The row's menu works on a locked row too, without opening it; Edit opens it. */}
                  <td className={`${TD} text-center`} onDoubleClick={(e) => e.stopPropagation()}>
                    <RowActionsMenu
                      label="Container actions"
                      onEdit={locked ? () => open(key) : undefined}
                      onDelete={() => setDraft((rows) => rows.filter((_, j) => j !== i))}
                    />
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {draft.length === 0 && (
            <div className={EMPTY_STATE}>
              {fromShipments ? "The linked shipments have no containers yet." : "No containers on this master job yet."}
            </div>
          )}
        </div>
      </div>
    </MasterJobCard>
  );
}
