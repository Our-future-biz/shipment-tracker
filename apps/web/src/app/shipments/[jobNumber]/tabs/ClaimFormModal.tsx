"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, DatePicker, Input, Select, type InputRef, type RefSelectProps } from "antd";
import dayjs from "dayjs";
import { AppModal } from "@/components/AppModal";
import type { interfaces } from "@/lib/api/client";
import { CURRENCIES } from "@/lib/cargo";
import { businessDateTime } from "@/lib/date";
import { amountInBox } from "@/lib/money";
import { HINT, LABEL_TEXT, LINK } from "@/styles/ui";
import { CLAIM_STATUSES, claimChanges, claimFilled, costClaimSendable, type ClaimValues } from "./claimValues";
import { apInvoiceHref, type SupplierInvoiceOption } from "./supplierInvoiceLink";

type Claim = interfaces.ClaimItem;
export type { ClaimValues };

export const CARGO_STATES = ["Damaged", "Incomplete", "Undamaged", "Lost"];

interface ClaimFormModalProps {
  kind: "cargo" | "cost";
  /** The claim being changed; none for a new one. */
  claim?: Claim;
  /** The supplier invoices this shipment's buying lines are on: what a claim on costs can name (D15). */
  invoiceOptions?: SupplierInvoiceOption[];
  /**
   * What a new claim starts with (Council Outlay 9, D15: Accounts Payable raises one on the invoice it disputes, its
   * supplier, number and currency filled in). Left out, a new claim starts empty; a claim being changed ignores it.
   */
  initial?: ClaimValues;
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
export function ClaimFormModal({ kind, claim, invoiceOptions = [], initial, saving, onClose, onSave }: ClaimFormModalProps) {
  const [values, setValues] = useState<ClaimValues>(() => ({
    ...(kind === "cargo"
      ? { cargoState: claim?.cargoState ?? "", note: claim?.note ?? "", noticeDate: claim?.noticeDate ?? "" }
      : {
          supplier: claim?.supplier ?? "",
          invoiceNumber: claim?.invoiceNumber ?? "",
          reason: claim?.reason ?? "",
          // Council Outlay 9, D15: the invoice it disputes, the amount as a figure and where it stands.
          supplierInvoiceId: claim?.supplierInvoiceId ?? "",
          claimAmount: amountInBox(claim?.claimAmount),
          claimCurrency: claim?.claimCurrency ?? "",
          status: claim?.status ?? "open",
          // The disputed amount typed as text before figures were kept: shown (and editable) on a claim that has one.
          ...(claim?.amount ? { amount: claim.amount } : {}),
        }),
    ...(claim ? {} : initial),
  }));
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
  const changed = claimChanges(claim, kind === "cost" ? costClaimSendable(values) : values);
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
          <CostClaimFields claim={claim} values={values} set={set} invoiceOptions={invoiceOptions} firstInput={firstInput} />
        )}
      </div>
    </AppModal>
  );
}

const CURRENCY_OPTIONS = CURRENCIES.map(({ code, name }) => ({ value: code, label: code, title: name }));

interface CostClaimFieldsProps {
  claim?: Claim;
  values: ClaimValues;
  set: (patch: ClaimValues) => void;
  invoiceOptions: SupplierInvoiceOption[];
  firstInput: React.RefObject<InputRef | null>;
}

// A claim on costs (Council Outlay 9, D15): the supplier invoice it disputes, picked from the invoices this
// shipment's buying lines are on, the claimed amount as a figure with its currency, and where it stands. An
// open claim holds the invoice's payment on Accounts Payable; accepting, rejecting or withdrawing it closes it.
function CostClaimFields({ claim, values, set, invoiceOptions, firstInput }: CostClaimFieldsProps) {
  const linked = values.supplierInvoiceId ?? "";
  // The invoice it names may no longer be on one of the lines here (its number was cleared): it stays named.
  const options = [
    { value: "", label: "None" },
    ...invoiceOptions.map((o) => ({ value: o.value, label: o.label })),
    ...(linked && !invoiceOptions.some((o) => o.value === linked)
      ? [{ value: linked, label: `${[claim?.supplier, claim?.invoiceNumber].filter(Boolean).join(" · ") || "Supplier invoice"} (on no line here now)` }]
      : []),
  ];
  // Picking an invoice names its supplier and number on the claim, and its currency when none is set.
  const pickInvoice = (id: string) => {
    const picked = invoiceOptions.find((o) => o.value === id);
    set({
      supplierInvoiceId: id,
      ...(picked ? { supplier: picked.vendor, invoiceNumber: picked.invoiceNumber, ...(values.claimCurrency ? {} : { claimCurrency: picked.currency }) } : {}),
    });
  };
  const closed = claim && claim.status !== "open" && claim.status === values.status;

  return (
    <>
      <Field label="Supplier invoice">
        <Select
          value={linked}
          options={options}
          showSearch
          optionFilterProp="label"
          onChange={(v: string) => pickInvoice(v)}
          notFoundContent={<span className={HINT}>No buying line here has an invoice number yet</span>}
        />
        <span className={HINT}>
          {linked ? (
            <>
              While the claim is open, this invoice&apos;s payment is held on{" "}
              <Link href={apInvoiceHref(linked)} className={LINK} target="_blank">
                Accounts Payable
              </Link>
              .
            </>
          ) : (
            "An open claim on one of this shipment's supplier invoices holds its payment on Accounts Payable."
          )}
        </span>
      </Field>
      <Field label="Supplier">
        <Input value={values.supplier} onChange={(e) => set({ supplier: e.target.value })} ref={firstInput} />
      </Field>
      <Field label="Invoice number">
        <Input value={values.invoiceNumber} onChange={(e) => set({ invoiceNumber: e.target.value })} />
      </Field>
      <Field label="Claim reason">
        <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} value={values.reason} onChange={(e) => set({ reason: e.target.value })} />
      </Field>
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <Field label="Claimed amount">
            <Input value={values.claimAmount} inputMode="decimal" placeholder="0.00" onChange={(e) => set({ claimAmount: e.target.value })} />
          </Field>
        </div>
        <div className="w-[120px]">
          <Field label="Currency">
            <Select
              value={values.claimCurrency || undefined}
              placeholder="CUR"
              allowClear
              showSearch
              options={CURRENCY_OPTIONS}
              filterOption={(input, option) => {
                const q = input.toLowerCase().trim();
                return !q || String(option?.value ?? "").toLowerCase().includes(q) || String(option?.title ?? "").toLowerCase().includes(q);
              }}
              popupMatchSelectWidth={false}
              onChange={(v?: string) => set({ claimCurrency: v ?? "" })}
            />
          </Field>
        </div>
      </div>
      {values.amount !== undefined && (
        <Field label="Disputed amount (as typed before)">
          <Input value={values.amount} onChange={(e) => set({ amount: e.target.value })} />
        </Field>
      )}
      <Field label="Status">
        <Select
          value={values.status || "open"}
          options={CLAIM_STATUSES.map(({ value, label }) => ({ value, label }))}
          onChange={(v: string) => set({ status: v })}
        />
        {closed && claim.closedAt ? (
          <span className={HINT}>
            {[`Closed ${businessDateTime(claim.closedAt)}`, claim.closedBy && `by ${claim.closedBy}`].filter(Boolean).join(" ")}
          </span>
        ) : claim && claim.status !== values.status ? (
          <span className={HINT}>
            {values.status === "open"
              ? `Saving opens the claim again${linked ? ": it holds the invoice's payment again" : ""}.`
              : `Saving closes the claim${linked ? ": it no longer holds the invoice's payment" : ""}.`}
          </span>
        ) : null}
      </Field>
    </>
  );
}
