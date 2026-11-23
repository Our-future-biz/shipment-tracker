"use client";

import { useEffect, useState } from "react";
import { Button, Input, Select } from "antd";
import { AppModal } from "@/components/AppModal";
import { DecimalInput } from "@/components/DecimalInput";
import { useSailingBoxCosts } from "@/hooks/useCoLoadingServices";
import { apiErrorMessage } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { useMessages } from "@/lib/toast";
import { HINT, LABEL_TEXT } from "@/styles/ui";
import { BOX_COST_CURRENCIES, BOX_COST_LABEL, type BoxCostKind } from "../_lib/earnings";

interface Line {
  kind: BoxCostKind;
  amount: number | null;
  currency: string;
  note: string;
}
const lineOf = (l: interfaces.BoxCostLine): Line => ({ kind: l.kind, amount: l.amount, currency: l.currency, note: l.note });
const same = (a: Line[], b: Line[]) => a.every((l, i) => l.amount === b[i]!.amount && l.currency === b[i]!.currency && l.note.trim() === b[i]!.note);

interface BoxCostsModalProps {
  open: boolean;
  onClose: () => void;
  sailingId: string;
  /** The container whose costs are set, with what is stored for it. */
  container: interfaces.BoxCostContainer;
  /** "40' HC", for the title; and whether the sailing has more than one container. */
  containerType: string;
  several: boolean;
}

// "Set costs": one container's Origin Costs, Ocean Freight and Destination Costs (Council Outlay 13).
// Each is an estimate in its own currency, with a note; an empty amount means "not set", 0 means
// "known to cost nothing". Managers and admins set them, also on a closed service, and every change
// is kept in the record of changes.
export function BoxCostsModal({ open, onClose, sailingId, container, containerType, several }: BoxCostsModalProps) {
  const save = useSailingBoxCosts(sailingId);
  const message = useMessages();
  const stored = container.lines.map(lineOf);
  const [lines, setLines] = useState<Line[]>(stored);
  // The costs as they were when the dialog opened: a refresh behind it must not move them.
  const [opened, setOpened] = useState<Line[]>(stored);
  useEffect(() => {
    if (!open) return;
    setLines(container.lines.map(lineOf));
    setOpened(container.lines.map(lineOf));
    // Only opening sets this off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, container.containerNo]);
  const set = (kind: BoxCostKind, more: Partial<Line>) => setLines((all) => all.map((l) => (l.kind === kind ? { ...l, ...more } : l)));
  const name = several ? `container ${container.containerNo}` : "the container";

  const handleSave = async () => {
    try {
      // With what the dialog showed when it opened: a save over costs somebody changed meanwhile is refused.
      await save.mutateAsync({ containerNo: container.containerNo, lines: lines.map((l) => ({ ...l, note: l.note.trim() })), expected: opened });
      message.success(`Costs of ${name} saved`);
      onClose();
    } catch (err) {
      message.error(apiErrorMessage(err));
    }
  };

  return (
    <AppModal
      open={open}
      onClose={save.isPending ? () => undefined : onClose}
      title={several ? `Costs of container ${container.containerNo}` : "Costs of the container"}
      subtitle={`The estimated costs of ${several ? "this" : "the"} ${containerType}. They are shared over the sailing's shipments by W/M.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="primary" loading={save.isPending} disabled={same(lines, opened)} onClick={handleSave}>
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {lines.map((line) => (
          <fieldset key={line.kind} className="m-0 grid grid-cols-[minmax(0,1fr)_96px] gap-x-2 gap-y-1.5 border-0 p-0 sm:grid-cols-[150px_96px_minmax(0,1fr)]">
            <legend className={`${LABEL_TEXT} mb-1.5 p-0`}>{BOX_COST_LABEL[line.kind]}</legend>
            {/* The app's own number field: it reads an amount typed the Czech way ("2100,50") as 2,100.50, not 210,050. */}
            <DecimalInput
              aria-label={`${BOX_COST_LABEL[line.kind]}: amount`}
              min={0}
              max={99999999.99}
              precision={2}
              controls={false}
              placeholder="Not set"
              value={line.amount}
              onChange={(amount) => set(line.kind, { amount })}
              className="!w-full"
            />
            <Select
              aria-label={`${BOX_COST_LABEL[line.kind]}: currency`}
              value={line.currency}
              onChange={(currency) => set(line.kind, { currency })}
              options={[...new Set([...BOX_COST_CURRENCIES, line.currency])].map((c) => ({ value: c, label: c }))}
            />
            <Input
              aria-label={`${BOX_COST_LABEL[line.kind]}: note`}
              className="max-sm:col-span-full"
              maxLength={200}
              placeholder="Note, e.g. the supplier"
              value={line.note}
              onChange={(e) => set(line.kind, { note: e.target.value })}
            />
          </fieldset>
        ))}
        <p className={`${HINT} m-0`}>
          Leave an amount empty while it is not known: the tab then says it is not set. Type 0 for a cost that is nothing. Every change is kept, with who made it. The trunk haul to
          the hub belongs under Origin Costs, not on the shipments.
        </p>
      </div>
    </AppModal>
  );
}
