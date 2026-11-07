"use client";

import { useEffect, useRef, useState } from "react";
import { Button, DatePicker, Input, Select, type InputRef, type RefSelectProps } from "antd";
import dayjs from "dayjs";
import { AppModal } from "@/components/AppModal";
import type { interfaces } from "@/lib/api/client";
import { LABEL_TEXT } from "@/styles/ui";
import { claimChanges, claimFilled, type ClaimValues } from "./claimValues";

type Claim = interfaces.ClaimItem;
export type { ClaimValues };

export const CARGO_STATES = ["Damaged", "Incomplete", "Undamaged", "Lost"];

interface ClaimFormModalProps {
  kind: "cargo" | "cost";
  /** The claim being changed; none for a new one. */
  claim?: Claim;
  saving: boolean;
  onClose: () => void;
  /** Saves the values (for a claim being changed, only the fields changed); rejects when the server refuses them (the dialog then stays open). */
  onSave: (values: ClaimValues) => Promise<unknown>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={LABEL_TEXT}>{label}</span>
      {children}
    </label>
  );
}

/** A claim's fields in a dialog: "+" opens it empty, ⋯ > Edit with the claim's values. */
export function ClaimFormModal({ kind, claim, saving, onClose, onSave }: ClaimFormModalProps) {
  const [values, setValues] = useState<ClaimValues>(() =>
    kind === "cargo"
      ? { cargoState: claim?.cargoState ?? "", note: claim?.note ?? "", noticeDate: claim?.noticeDate ?? "" }
      : { supplier: claim?.supplier ?? "", invoiceNumber: claim?.invoiceNumber ?? "", reason: claim?.reason ?? "", amount: claim?.amount ?? "" },
  );
  const set = (patch: ClaimValues) => setValues((v) => ({ ...v, ...patch }));
  // The first field takes the cursor once the dialog is open (the dialog itself focuses its ×).
  const firstSelect = useRef<RefSelectProps | null>(null);
  const firstInput = useRef<InputRef | null>(null);
  useEffect(() => {
    const t = setTimeout(() => (firstSelect.current ?? firstInput.current)?.focus(), 80);
    return () => clearTimeout(t);
  }, []);
  const title = `${claim ? "Edit" : "New"} ${kind === "cargo" ? "claim on the shipment" : "claim on costs"}`;
  // A changed claim sends only what changed; a new one needs something filled in.
  const changed = claimChanges(claim, values);
  const filled = claimFilled(values);
  const save = () => {
    if (!claim && !filled) return;
    onSave(changed).catch(() => undefined);
  };

  return (
    // Holds what was typed: a click beside it leaves it open, and while it saves it stays.
    <AppModal
      open
      maskClosable={false}
      closable={!saving}
      onClose={onClose}
      title={title}
      size="medium"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="primary" loading={saving} disabled={!claim && !filled} onClick={save}>
            {claim ? "Save" : "Add claim"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 py-1">
        {kind === "cargo" ? (
          <>
            <Field label="Cargo state">
              <Select
                value={values.cargoState || undefined}
                placeholder="Select…"
                allowClear
                options={CARGO_STATES.map((v) => ({ value: v, label: v }))}
                onChange={(v?: string) => set({ cargoState: v ?? "" })}
                ref={firstSelect}
              />
            </Field>
            <Field label="Note">
              <Input.TextArea
                autoSize={{ minRows: 3, maxRows: 8 }}
                value={values.note}
                placeholder="What happened"
                onChange={(e) => set({ note: e.target.value })}
              />
            </Field>
            <Field label="Notice given">
              <DatePicker
                format="DD.MM.YYYY"
                className="w-full"
                value={values.noticeDate ? dayjs(values.noticeDate) : null}
                onChange={(day) => set({ noticeDate: day ? day.format("YYYY-MM-DD") : "" })}
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Supplier">
              <Input value={values.supplier} onChange={(e) => set({ supplier: e.target.value })} ref={firstInput} />
            </Field>
            <Field label="Invoice number">
              <Input value={values.invoiceNumber} onChange={(e) => set({ invoiceNumber: e.target.value })} />
            </Field>
            <Field label="Claim reason">
              <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} value={values.reason} onChange={(e) => set({ reason: e.target.value })} />
            </Field>
            <Field label="Disputed amount">
              <Input value={values.amount} placeholder="CZK 0.00" onChange={(e) => set({ amount: e.target.value })} />
            </Field>
          </>
        )}
      </div>
    </AppModal>
  );
}
