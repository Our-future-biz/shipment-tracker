"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { rowKey } from "@/app/shipments/_lib/rowKey";
import { Button, Input, Select, Tooltip, type InputRef } from "antd";
import { useMessages } from "@/lib/toast";
import { apiErrorMessage } from "@/lib/api";
import { ContainerOutlined, PlusOutlined, WarningOutlined } from "@ant-design/icons";
import { RowActionsMenu } from "@/app/shipments/_components/RowActionsMenu";
import { CHECK_DIGIT_HINT, CONTAINER_NUMBER_HINT, containerType, containerTypeOptions } from "@/lib/cargo";
import { containerCheckDigitOk, containerNumberInput, isValidContainerNumber, normalizeContainerNumber } from "@/lib/container";
import type { MasterJobContainerLine, MasterJobShipmentItem } from "@/hooks/useMasterJobs";
import { EMPTY_STATE, LABEL_TEXT } from "@/styles/ui";
import { CARD_BODY_PADDED, MasterJobCard } from "./MasterJobFields";
import { LOCKED_CONTROL, LOCKED_INPUT, LOCKED_ROW, OPEN_ROW_ATTR, lockOnEnter, useOpenRow } from "../_lib/rowLock";

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
const lineKey = (c: MasterJobContainerLine) => c.id ?? rowKey(c);
// A row nobody has typed into, as in Container Details.
const isBlankLine = (c: MasterJobContainerLine) =>
  !c.containerNumber.trim() && !c.sealNumber.trim() && !c.type.trim() && c.shipmentIds.length === 0;

// The containers on the master BL, each assigned to the houses whose cargo it
// carries. Edited as one list and saved together; a save copies every house's
// assigned containers onto that house.
export function MasterJobContainers({ id, fromShipments, containers, shipments, onSave }: MasterJobContainersProps) {
  const message = useMessages();
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

  // A new row nobody typed into is left out of the save and is no change. A saved row stays in
  // even when emptied (it then needs a number): only Delete takes a container off.
  const savedKeys = new Set(containers.map(lineKey));
  const untouched = (c: MasterJobContainerLine) => !savedKeys.has(lineKey(c)) && isBlankLine(c);
  const lines = draft.filter((c) => !untouched(c));
  const dirty = JSON.stringify(lines) !== JSON.stringify(containers);
  // The master job needs every container's number, each once (the server refuses the save
  // otherwise): what is wrong with a row's number, shown on it, keeps Save off.
  const numbers = lines.map((c) => normalizeContainerNumber(c.containerNumber));
  const listedTwice = (n: string) => numbers.indexOf(n) !== numbers.lastIndexOf(n);
  const numberProblem = (c: MasterJobContainerLine): string | undefined => {
    if (untouched(c)) return undefined;
    const n = normalizeContainerNumber(c.containerNumber);
    if (!n) return `Enter the container number: ${CONTAINER_NUMBER_HINT}`;
    if (!isValidContainerNumber(n)) return CONTAINER_NUMBER_HINT;
    if (listedTwice(n)) return "This container is already in the list";
    return undefined;
  };
  const canSave = dirty && lines.every((c) => !numberProblem(c));

  // A row with a valid number is locked: a double-click (or ⋯ > Edit) opens it, and a click
  // elsewhere, Tab out of it or Enter locks it again. A row still being typed stays open.
  const { openKey, open, close } = useOpenRow();
  const houseOptions = shipments.map((s) => ({ value: s.id, label: s.jobNumber }));
  const [typeQuery, setTypeQuery] = useState("");
  const typeOptions = useMemo(() => containerTypeOptions(typeQuery), [typeQuery]);

  // The number field that takes the cursor after the next render: a row just added, or opened by ⋯ > Edit.
  const numberInputs = useRef(new Map<string, InputRef>());
  const focusNumber = useRef<string | null>(null);
  useEffect(() => {
    const key = focusNumber.current;
    if (!key) return;
    focusNumber.current = null;
    numberInputs.current.get(key)?.focus({ cursor: "end" });
  });

  const handleChange = (index: number, patch: Partial<MasterJobContainerLine>) =>
    setDraft((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const addRow = () => {
    const line = emptyLine();
    focusNumber.current = lineKey(line);
    setDraft((rows) => [...rows, line]);
  };

  // Leaving a number that is unfinished, or already in the list, says why Save stays off.
  const warnNumber = (c: MasterJobContainerLine) => {
    const n = normalizeContainerNumber(c.containerNumber);
    if (!n) return;
    if (!isValidContainerNumber(n)) message.error(`Container number "${n}" is not valid — it must be 4 letters and 7 digits, e.g. MSKU1234567`);
    else if (listedTwice(n)) message.error(`Container ${n} is listed twice`);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(lines.map((c) => ({ ...c, containerNumber: c.containerNumber.trim() })));
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
      title={`Containers (${lines.length})`}
      actions={
        <>
          {dirty && (
            <Button size="small" onClick={() => setDraft(containers)} disabled={saving}>
              Discard
            </Button>
          )}
          <Button size="small" type="primary" onClick={handleSave} disabled={!canSave} loading={saving}>
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
            onClick={addRow}
            className="!absolute -top-1 right-[7px] z-10 !w-[22px] !h-[22px] !min-w-0 !p-0"
          />
        </Tooltip>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr>
                <th className={`${TH} w-[190px]`}>Container Number</th>
                <th className={`${TH} w-[160px] !text-center`}>Seal Number</th>
                <th className={`${TH} w-[150px] !text-center`}>Container Type</th>
                <th className={TH}>Assigned Shipments</th>
                {/* The actions column: the "+" above lies over it. */}
                <th className={`${TH} w-9`} />
              </tr>
            </thead>
            <tbody>
              {draft.map((c, i) => {
                const key = lineKey(c);
                const problem = numberProblem(c);
                const checkDigitOk = containerCheckDigitOk(c.containerNumber);
                const locked = openKey !== key && !!c.containerNumber.trim() && !problem;
                return (
                <tr
                  key={key}
                  {...(locked ? {} : { [OPEN_ROW_ATTR]: "" })}
                  // The field double-clicked takes the cursor.
                  onDoubleClick={locked ? (e) => open(key, e) : undefined}
                  // A row being typed in is the open one, so it stays open when its number turns valid.
                  onFocus={locked ? undefined : () => openKey !== key && open(key)}
                  onKeyDown={locked ? undefined : lockOnEnter(close)}
                  title={locked ? "Double-click to edit" : undefined}
                  className={`${i < draft.length - 1 ? "border-b border-slate-100" : ""} ${locked ? LOCKED_ROW : ""}`}
                >
                  <td className={TD}>
                    {locked ? (
                      // Text, where the open row's field puts it, with the check-digit warning after the number.
                      <span className="inline-flex h-7 items-center pl-2 text-slate-900">
                        {c.containerNumber}
                        {!checkDigitOk && (
                          <Tooltip title={CHECK_DIGIT_HINT}>
                            <WarningOutlined className="ml-1 text-amber-600" aria-label={CHECK_DIGIT_HINT} />
                          </Tooltip>
                        )}
                      </span>
                    ) : (
                      <Tooltip title={problem ?? (checkDigitOk ? "" : CHECK_DIGIT_HINT)} open={problem || !checkDigitOk ? undefined : false}>
                        <Input
                          ref={(el) => {
                            if (el) numberInputs.current.set(key, el);
                            else numberInputs.current.delete(key);
                          }}
                          size="small"
                          placeholder="MSKU1234567"
                          value={c.containerNumber}
                          // Red: unfinished, missing or listed twice, and Save stays off. Amber: the check digit does not fit.
                          status={problem ? "error" : checkDigitOk ? undefined : "warning"}
                          aria-label="Container number"
                          onChange={(e) => handleChange(i, { containerNumber: containerNumberInput(e.target.value) })}
                          onBlur={() => warnNumber(c)}
                        />
                      </Tooltip>
                    )}
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
                    {/* Container Details' grouped types, narrowed by typing; picked from the list only. */}
                    <Select
                      size="small"
                      className={`w-full [&_.ant-select-selection-item]:!text-center [&_.ant-select-selection-placeholder]:!text-center [&_.ant-select-selection-search-input]:!text-center ${locked ? LOCKED_CONTROL : ""}`}
                      open={locked ? false : undefined}
                      tabIndex={locked ? -1 : undefined}
                      showSearch
                      filterOption={false}
                      onSearch={setTypeQuery}
                      onFocus={() => setTypeQuery("")}
                      value={containerType(c.type) || undefined}
                      placeholder={locked ? undefined : "Select..."}
                      aria-label="Container type"
                      options={typeOptions}
                      popupMatchSelectWidth={180}
                      onChange={(type: string) => {
                        setTypeQuery("");
                        handleChange(i, { type });
                      }}
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
                      placeholder={locked ? undefined : shipments.length ? "Pick shipments" : "Link shipments first"}
                      aria-label="Assigned shipments"
                      options={houseOptions}
                      onChange={(shipmentIds) => handleChange(i, { shipmentIds })}
                    />
                  </td>
                  {/* The row's menu works on a locked row too, without opening it; Edit opens it. */}
                  <td className={`${TD} text-center`} onDoubleClick={(e) => e.stopPropagation()}>
                    <RowActionsMenu
                      label="Container actions"
                      onEdit={
                        locked
                          ? () => {
                              focusNumber.current = key;
                              open(key);
                            }
                          : undefined
                      }
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
