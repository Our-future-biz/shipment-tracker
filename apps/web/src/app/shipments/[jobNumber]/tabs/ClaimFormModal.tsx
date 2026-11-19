"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, DatePicker, Input, Select, type InputRef, type RefSelectProps } from "antd";
import dayjs from "dayjs";
import { AppModal } from "@/components/AppModal";
import { CURRENCIES } from "@/lib/cargo";
import { businessDateTime } from "@/lib/date";
import { amountInBox } from "@/lib/money";
import { HINT, LABEL_TEXT, LINK } from "@/styles/ui";
import { UserPicker } from "@/components/UserPicker";
import { useUsers } from "@/hooks/useUsers";
import {
  CARGO_CLAIM_STATUSES,
  CLAIM_STATUSES,
  cargoClaimProblem,
  claimChanges,
  claimFilled,
  claimSendable,
  isOpenStatus,
  type Claim,
  type ClaimValues,
} from "./claimValues";
import { apInvoiceHref } from "@/lib/accountsPayable";
import type { SupplierInvoiceOption } from "./supplierInvoiceLink";

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
      ? {
          cargoState: claim?.cargoState ?? "",
          note: claim?.note ?? "",
          // Council Outlay 11, D20: where it stands, who looks after it, the amounts and the days the carrier and the insurer were told.
          status: claim?.status ?? "open",
          ownerUserId: claim?.ownerUserId ?? "",
          claimAmount: amountInBox(claim?.claimAmount),
          claimCurrency: claim?.claimCurrency ?? "",
          noticeDate: claim?.noticeDate ?? "",
          insurerNotifiedOn: claim?.insurerNotifiedOn ?? "",
          settledAmount: amountInBox(claim?.settledAmount),
          settledCurrency: claim?.settledCurrency ?? "",
        }
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
  const changed = claimChanges(claim, claimSendable(values));
  const filled = claimFilled(values);
  // A cargo claim's status asks for its day or its amount (the server refuses it without, in the same words).
  const problem = kind === "cargo" ? cargoClaimProblem(values) : null;
  const blocked = (!claim && !filled) || !!problem;
  const save = () => {
    if (blocked) return;
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
          <Button type="primary" loading={saving} disabled={blocked} onClick={save}>
            {claim ? "Save" : "Add claim"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 py-1">
        {kind === "cargo" ? (
          <CargoClaimFields claim={claim} values={values} set={set} problem={problem} firstSelect={firstSelect} />
        ) : (
          <CostClaimFields claim={claim} values={values} set={set} invoiceOptions={invoiceOptions} firstInput={firstInput} />
        )}
      </div>
    </AppModal>
  );
}

const CURRENCY_OPTIONS = CURRENCIES.map(({ code, name }) => ({ value: code, label: code, title: name }));

/** A figure and its currency side by side (the claimed amount; a cargo claim's settled amount). */
function AmountField({ label, amount, currency, onChange }: { label: string; amount?: string; currency?: string; onChange: (amount: string, currency: string) => void }) {
  return (
    <div className="flex gap-3">
      <div className="min-w-0 flex-1">
        <Field label={label}>
          <Input value={amount} inputMode="decimal" placeholder="0.00" onChange={(e) => onChange(e.target.value, currency ?? "")} />
        </Field>
      </div>
      <div className="w-[120px]">
        <Field label="Currency">
          <Select
            value={currency || undefined}
            placeholder="CUR"
            allowClear
            showSearch
            options={CURRENCY_OPTIONS}
            filterOption={(input, option) => {
              const q = input.toLowerCase().trim();
              return !q || String(option?.value ?? "").toLowerCase().includes(q) || String(option?.title ?? "").toLowerCase().includes(q);
            }}
            popupMatchSelectWidth={false}
            onChange={(v?: string) => onChange(amount ?? "", v ?? "")}
          />
        </Field>
      </div>
    </div>
  );
}

/** A day picked as DD.MM.YYYY and kept as YYYY-MM-DD ("" for none). */
function DayField({ label, value, onChange, hint }: { label: string; value?: string; onChange: (day: string) => void; hint?: string }) {
  return (
    <Field label={label}>
      <DatePicker format="DD.MM.YYYY" className="w-full" value={value ? dayjs(value) : null} onChange={(day) => onChange(day ? day.format("YYYY-MM-DD") : "")} />
      {hint && <span className={HINT}>{hint}</span>}
    </Field>
  );
}

/** Who closed the claim and when, while its status is left as it is; else what saving the new status does. */
function StatusNote({ kind, claim, status, holdsPayment = false }: { kind: "cargo" | "cost"; claim?: Claim; status: string; holdsPayment?: boolean }) {
  if (!claim) return null;
  if (claim.status === status) {
    return !claim.isOpen && claim.closedAt ? (
      <span className={HINT}>{[`Closed ${businessDateTime(claim.closedAt)}`, claim.closedBy && `by ${claim.closedBy}`].filter(Boolean).join(" ")}</span>
    ) : null;
  }
  const opens = isOpenStatus(kind, status);
  if (opens === claim.isOpen) return null;
  return (
    <span className={HINT}>
      {opens
        ? `Saving opens the claim again${holdsPayment ? ": it holds the invoice's payment again" : ""}.`
        : `Saving closes the claim${holdsPayment ? ": it no longer holds the invoice's payment" : ""}.`}
    </span>
  );
}

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
      <AmountField
        label="Claimed amount"
        amount={values.claimAmount}
        currency={values.claimCurrency}
        onChange={(claimAmount, claimCurrency) => set({ claimAmount, claimCurrency })}
      />
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
        <StatusNote kind="cost" claim={claim} status={values.status || "open"} holdsPayment={!!linked} />
      </Field>
    </>
  );
}

interface CargoClaimFieldsProps {
  claim?: Claim;
  values: ClaimValues;
  set: (patch: ClaimValues) => void;
  /** Why it can't be saved so (its status asks for a day or an amount); null when it can. */
  problem: string | null;
  firstSelect: React.RefObject<RefSelectProps | null>;
}

// A claim on the shipment - how the cargo arrived - and its life (Council Outlay 11, D20): where it stands, who
// looks after it, what is claimed, when the carrier and the insurer were told and what was settled. "Carrier
// notified" asks for the day the carrier was told, "With the insurer" the day the insurer was, "Settled" the
// amount and its currency; settled, rejected or withdrawn closes it.
function CargoClaimFields({ claim, values, set, problem, firstSelect }: CargoClaimFieldsProps) {
  const { users } = useUsers();
  const status = values.status || "open";
  // The owner is kept by id; the picker shows and picks e-mails. One no longer a user shows as their e-mail, marked.
  const ownerEmail = users.find((u) => u.id === values.ownerUserId)?.email ?? (values.ownerUserId && values.ownerUserId === claim?.ownerUserId ? claim.ownerName : "");
  const pickOwner = (email: string) => set({ ownerUserId: email ? (users.find((u) => u.email === email)?.id ?? "") : "" });

  return (
    <>
      <Field label="Status">
        <Select
          value={status}
          options={CARGO_CLAIM_STATUSES.map(({ value, label }) => ({ value, label }))}
          onChange={(v: string) => set({ status: v })}
          ref={firstSelect}
        />
        {problem ? <span className="text-[12px] text-red-600">{problem}</span> : <StatusNote kind="cargo" claim={claim} status={status} />}
      </Field>
      <Field label="Owner">
        <UserPicker
          value={ownerEmail}
          // A new claim is looked after by whoever adds it, unless someone else is picked.
          placeholder={claim ? "Nobody" : "You, unless you pick someone"}
          aria-label="Owner"
          onChange={pickOwner}
        />
      </Field>
      <Field label="Cargo state">
        <Select
          value={values.cargoState || undefined}
          placeholder="Select…"
          allowClear
          options={CARGO_STATES.map((v) => ({ value: v, label: v }))}
          onChange={(v?: string) => set({ cargoState: v ?? "" })}
        />
      </Field>
      <Field label="Note">
        <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} value={values.note} placeholder="What happened" onChange={(e) => set({ note: e.target.value })} />
      </Field>
      <AmountField
        label="Claimed amount"
        amount={values.claimAmount}
        currency={values.claimCurrency}
        onChange={(claimAmount, claimCurrency) => set({ claimAmount, claimCurrency })}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <DayField label="Carrier notified on" value={values.noticeDate} onChange={(noticeDate) => set({ noticeDate })} />
        <DayField label="Insurer notified on" value={values.insurerNotifiedOn} onChange={(insurerNotifiedOn) => set({ insurerNotifiedOn })} />
      </div>
      <AmountField
        label="Settled amount"
        amount={values.settledAmount}
        currency={values.settledCurrency}
        onChange={(settledAmount, settledCurrency) => set({ settledAmount, settledCurrency })}
      />
    </>
  );
}
