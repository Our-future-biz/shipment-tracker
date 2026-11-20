"use client";

import { useState, type ReactNode } from "react";
import dayjs from "dayjs";
import { DatePicker, Input, Segmented, Tooltip } from "antd";
import { CheckOutlined, CloseOutlined, DollarOutlined, EditOutlined, LinkOutlined, RollbackOutlined } from "@ant-design/icons";
import { CurrencyPicker } from "@/components/CurrencyPicker";
import { SupplierPicker, type SupplierValue } from "@/components/SupplierPicker";
import { apiErrorMessage } from "@/lib/api";
import { businessToday, formatDate } from "@/lib/date";
import { normalizeMoneyInput } from "@/lib/money";
import { useToast } from "@/lib/toast";
import { useSupplierInvoiceActions, type SupplierInvoiceDetails } from "@/hooks/useSupplierInvoices";
import { useAuth } from "@/lib/auth/AuthContext";
import { useUsers } from "@/hooks/useUsers";
import { isDetailsManager } from "@/lib/shipmentEditRule";
import { BTN, BTN_DANGER, BTN_PRIMARY, HINT, LABEL_TEXT, TEXTAREA } from "@/styles/ui";
import { actionsFor, MIN_REASON, paidDayProblem, reasonOk, type ActionState, type PayableInvoice, type Viewer } from "../_lib/payables";

// What can be done to a supplier invoice, in its drawer. Approve, refuse, take back, paid and the supplier link
// are for managers (D5, D8, D11, D13); the details are anyone's while it waits for approval. Each sends the
// version the user saw. The server checks everything again and says why when it refuses.

type Form = "refuse" | "takeBackApproval" | "markPaid" | "takeBackPayment" | "link" | "details" | null;

function ActionButton({ state, icon, label, onClick, active, danger }: { state: ActionState; icon: ReactNode; label: string; onClick: () => void; active?: boolean; danger?: boolean }) {
  if (!state.shown) return null;
  const button = (
    <button
      type="button"
      disabled={!!state.blocked}
      onClick={onClick}
      aria-pressed={active}
      className={`${BTN} ${active ? "!border-indigo-500 !bg-indigo-50 !text-indigo-700" : ""} ${danger && !active ? "hover:!text-red-700" : ""}`}
    >
      {icon}
      {label}
    </button>
  );
  // A disabled button says why on hover; the span takes the hover, as a disabled button fires no events.
  return state.blocked ? (
    <Tooltip title={state.blocked}>
      <span className="inline-flex">{button}</span>
    </Tooltip>
  ) : (
    button
  );
}

function FormBox({ children }: { children: ReactNode }) {
  return <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 flex flex-col gap-3">{children}</div>;
}

function ReasonForm({ label, explain, saveLabel, danger, saving, onSave, onCancel }: {
  label: string;
  explain: ReactNode;
  saveLabel: string;
  danger?: boolean;
  saving: boolean;
  onSave: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <FormBox>
      <div className={HINT}>{explain}</div>
      <label className="block">
        <span className={`block ${LABEL_TEXT} mb-1`}>{label}</span>
        <textarea autoFocus rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} aria-label={label} className={`${TEXTAREA} w-full resize-y`} />
        {reason.length > 0 && !reasonOk(reason) && <span className="text-[12px] text-amber-700">At least {MIN_REASON} characters</span>}
      </label>
      <div className="flex gap-2">
        <button type="button" disabled={saving || !reasonOk(reason)} onClick={() => onSave(reason.trim())} className={danger ? BTN_DANGER : BTN_PRIMARY}>
          {saveLabel}
        </button>
        <button type="button" onClick={onCancel} className={BTN}>
          Cancel
        </button>
      </div>
    </FormBox>
  );
}

function PaidForm({ invoice, saving, onSave, onCancel }: { invoice: PayableInvoice; saving: boolean; onSave: (day: string) => void; onCancel: () => void }) {
  const today = businessToday();
  const [day, setDay] = useState(today);
  const problem = paidDayProblem(day, today, invoice);
  return (
    <FormBox>
      <div className={HINT}>
        Notes the day the accounting system paid it, for the whole invoice. Nothing is sent to the bank: the app mirrors what was paid. Its lines on the jobs are
        marked paid with it.
      </div>
      <label className="flex flex-col">
        <span className={`${LABEL_TEXT} mb-1`}>Paid on</span>
        <DatePicker
          allowClear={false}
          format="D.M.YYYY"
          value={day ? dayjs(day) : null}
          onChange={(d) => setDay(d ? d.format("YYYY-MM-DD") : "")}
          // Not after today, nor before it was received: the server refuses both. As bounds, not disabledDate,
          // so the month and year panels stay open for the days in between.
          minDate={invoice.paidNotBefore ? dayjs(invoice.paidNotBefore) : undefined}
          maxDate={dayjs(today)}
          className="w-[160px]"
          aria-label="Paid on"
        />
        {problem && <span className="text-[12px] text-amber-700 mt-1">{problem}</span>}
      </label>
      <div className="flex gap-2">
        <button type="button" disabled={saving || !!problem} onClick={() => onSave(day)} className={BTN_PRIMARY}>
          Mark paid on {formatDate(day)}
        </button>
        <button type="button" onClick={onCancel} className={BTN}>
          Cancel
        </button>
      </div>
    </FormBox>
  );
}

function LinkForm({ invoice, saving, onSave, onCancel }: { invoice: PayableInvoice; saving: boolean; onSave: (supplierCustomerId: string) => void; onCancel: () => void }) {
  // Starts from the name as written on the lines, so the matches come at once.
  const [value, setValue] = useState<SupplierValue>({ name: invoice.vendor || invoice.supplier, supplierCustomerId: null });
  return (
    <FormBox>
      <div className={HINT}>
        Pick the supplier from the Customer Database: its payment terms, VAT checks and the duplicate check then apply. The invoice&apos;s lines on the jobs are linked
        with it.
      </div>
      <div className="max-w-[360px]">
        <SupplierPicker value={value} onChange={setValue} size="middle" ariaLabel="Supplier from the Customer Database" placeholder="Search the suppliers" />
        {value.name.trim() && !value.supplierCustomerId && <div className="mt-1 text-[12px] text-amber-700">Pick a company from the list: a typed name is not linked</div>}
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={saving || !value.supplierCustomerId} onClick={() => value.supplierCustomerId && onSave(value.supplierCustomerId)} className={BTN_PRIMARY}>
          Link {value.supplierCustomerId ? value.name : "the supplier"}
        </button>
        <button type="button" onClick={onCancel} className={BTN}>
          Cancel
        </button>
      </div>
    </FormBox>
  );
}

const moneyText = (v: string | null) => v ?? "";

function DetailsForm({ invoice, saving, onSave, onCancel }: { invoice: PayableInvoice; saving: boolean; onSave: (details: SupplierInvoiceDetails) => void; onCancel: () => void }) {
  const [issueDate, setIssueDate] = useState(invoice.issueDate ?? "");
  // The invoice's own due date; a due day from the supplier's terms is not one, so it starts empty then.
  const [dueDate, setDueDate] = useState(invoice.dueSource === "invoice" ? (invoice.due ?? "") : "");
  const [totalNet, setTotalNet] = useState(moneyText(invoice.totalNet));
  const [vatAmount, setVatAmount] = useState(moneyText(invoice.vatAmount));
  const [totalGross, setTotalGross] = useState(moneyText(invoice.totalGross));
  const [currency, setCurrency] = useState(invoice.currency);
  const [kind, setKind] = useState(invoice.kind);

  // Only what changed is sent; an emptied field clears it.
  const changes: SupplierInvoiceDetails = {};
  if (issueDate !== (invoice.issueDate ?? "")) changes.issueDate = issueDate;
  if (dueDate !== (invoice.dueSource === "invoice" ? (invoice.due ?? "") : "")) changes.dueDate = dueDate;
  if (normalizeMoneyInput(totalNet) !== moneyText(invoice.totalNet)) changes.totalNet = normalizeMoneyInput(totalNet);
  if (normalizeMoneyInput(vatAmount) !== moneyText(invoice.vatAmount)) changes.vatAmount = normalizeMoneyInput(vatAmount);
  if (normalizeMoneyInput(totalGross) !== moneyText(invoice.totalGross)) changes.totalGross = normalizeMoneyInput(totalGross);
  if (currency !== invoice.currency) changes.currency = currency;
  if (kind !== invoice.kind) changes.kind = kind;
  const changed = Object.keys(changes).length > 0;

  const dateField = (label: string, value: string, set: (v: string) => void) => (
    <label className="flex flex-col">
      <span className={`${LABEL_TEXT} mb-1`}>{label}</span>
      <DatePicker format="D.M.YYYY" value={value ? dayjs(value) : null} onChange={(d) => set(d ? d.format("YYYY-MM-DD") : "")} className="w-[150px]" aria-label={label} />
    </label>
  );
  const moneyField = (label: string, value: string, set: (v: string) => void) => (
    <label className="flex flex-col">
      <span className={`${LABEL_TEXT} mb-1`}>{label}</span>
      <Input value={value} onChange={(e) => set(e.target.value)} inputMode="decimal" className="!w-[140px] text-right tabular-nums" aria-label={label} />
    </label>
  );

  return (
    <FormBox>
      <div className={HINT}>
        The invoice&apos;s own details as on the document. The amounts of its lines stay in each job&apos;s Costs Breakdown.
        {invoice.status === "approved" && " It is approved: a manager changes it now."}
      </div>
      <div className="flex flex-wrap gap-3">
        {dateField("Issue date", issueDate, setIssueDate)}
        {dateField("Due date", dueDate, setDueDate)}
        <label className="flex flex-col">
          <span className={`${LABEL_TEXT} mb-1`}>Kind</span>
          <Segmented
            value={kind}
            onChange={(v) => setKind(v as PayableInvoice["kind"])}
            options={[
              { value: "invoice", label: "Invoice" },
              { value: "credit_note", label: "Credit note" },
            ]}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        {moneyField("Total without VAT", totalNet, setTotalNet)}
        {moneyField("VAT", vatAmount, setVatAmount)}
        {moneyField("Total with VAT", totalGross, setTotalGross)}
        <label className="flex flex-col w-[120px]">
          <span className={`${LABEL_TEXT} mb-1`}>Currency</span>
          <CurrencyPicker value={currency} onChange={setCurrency} ariaLabel="Currency" />
        </label>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={saving || !changed} onClick={() => onSave(changes)} className={BTN_PRIMARY}>
          Save details
        </button>
        <button type="button" onClick={onCancel} className={BTN}>
          Cancel
        </button>
      </div>
    </FormBox>
  );
}

export function PayableActions({ invoice, canDecide }: { invoice: PayableInvoice; canDecide: boolean }) {
  const toast = useToast();
  const actions = useSupplierInvoiceActions();
  // Who is looking, and whether another manager could approve what they entered (four eyes, D8).
  const { user } = useAuth();
  const { users, loaded } = useUsers();
  const viewer: Viewer | null =
    user && loaded ? { email: user.email, anotherManager: users.some((u) => isDetailsManager(u.role) && u.id !== user.id) } : null;
  const can = actionsFor(invoice, canDecide, viewer);
  const [form, setForm] = useState<Form>(null);
  const toggle = (f: Exclude<Form, null>) => setForm((now) => (now === f ? null : f));

  // One decision at a time: every save button waits while any of them is on its way (each sends the version the
  // user saw, so a second would only be refused as changed meanwhile).
  // Every answer comes back as the invoice now is; a refusal says why (changed meanwhile, a VAT check, four eyes).
  const run = (p: Promise<unknown>, done: string) =>
    p
      .then(() => {
        toast.success(done);
        setForm(null);
      })
      .catch((e) => toast.error(apiErrorMessage(e)));

  const anything = Object.values(can).some((a) => a.shown);
  if (!anything) {
    return (
      <div className={HINT}>
        {invoice.status === "refused"
          ? "Refused: it stays as it was. The corrected invoice is booked as a new one."
          : invoice.paidOn
            ? "Paid: it stays as it was paid."
            : "Only a manager approves, refuses and marks supplier invoices paid."}
      </div>
    );
  }

  const number = invoice.invoiceNumber || "the invoice";
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {can.approve.shown && (
          <ActionButtonPrimary
            state={can.approve}
            saving={actions.pending}
            onClick={() => void run(actions.approve.mutateAsync({ invoice }), `Approved: ${number} is to be paid`)}
          />
        )}
        <ActionButton state={can.refuse} icon={<CloseOutlined />} label="Refuse…" danger active={form === "refuse"} onClick={() => toggle("refuse")} />
        <ActionButton state={can.markPaid} icon={<DollarOutlined />} label="Mark paid…" active={form === "markPaid"} onClick={() => toggle("markPaid")} />
        <ActionButton state={can.takeBackApproval} icon={<RollbackOutlined />} label="Take back approval…" active={form === "takeBackApproval"} onClick={() => toggle("takeBackApproval")} />
        <ActionButton state={can.takeBackPayment} icon={<RollbackOutlined />} label="Take back payment…" active={form === "takeBackPayment"} onClick={() => toggle("takeBackPayment")} />
        <ActionButton state={can.linkSupplier} icon={<LinkOutlined />} label={invoice.supplierCustomerId ? "Change supplier…" : "Link supplier…"} active={form === "link"} onClick={() => toggle("link")} />
        <ActionButton state={can.editDetails} icon={<EditOutlined />} label="Edit details…" active={form === "details"} onClick={() => toggle("details")} />
      </div>
      {/* Said in words too, not only on hover: why the one-click Approve is off. */}
      {can.approve.shown && can.approve.blocked && <div className="mt-2 text-[12px] text-amber-700">{can.approve.blocked}</div>}
      {can.markPaid.shown && can.markPaid.blocked && <div className="mt-2 text-[12px] text-amber-700">{can.markPaid.blocked}</div>}

      {form === "refuse" && (
        <ReasonForm
          label="Why it is refused"
          explain="Refusing takes its lines off the jobs: an estimated line goes back to its estimate, any other line goes, and they are kept on the invoice for the record. Its number is free again for the corrected invoice. The supplier is told the reason."
          saveLabel={`Refuse ${number}`}
          danger
          saving={actions.pending}
          onSave={(reason) => void run(actions.refuse.mutateAsync({ invoice, reason }), `Refused: ${number} left the jobs`)}
          onCancel={() => setForm(null)}
        />
      )}
      {form === "takeBackApproval" && (
        <ReasonForm
          label="Why the approval is taken back"
          explain="It waits for a manager's approval again."
          saveLabel="Take back the approval"
          saving={actions.pending}
          onSave={(reason) => void run(actions.takeBackApproval.mutateAsync({ invoice, reason }), `${number} waits for approval again`)}
          onCancel={() => setForm(null)}
        />
      )}
      {form === "takeBackPayment" && (
        <ReasonForm
          label="Why the payment is taken back"
          explain={`For a payment noted by mistake: ${number} and its lines are unpaid again.`}
          saveLabel="Take back the payment"
          saving={actions.pending}
          onSave={(reason) => void run(actions.takeBackPayment.mutateAsync({ invoice, reason }), `${number} is unpaid again`)}
          onCancel={() => setForm(null)}
        />
      )}
      {form === "markPaid" && (
        <PaidForm
          invoice={invoice}
          saving={actions.pending}
          onSave={(paidOn) => void run(actions.markPaid.mutateAsync({ invoice, paidOn }), `${number} marked paid on ${formatDate(paidOn)}`)}
          onCancel={() => setForm(null)}
        />
      )}
      {form === "link" && (
        <LinkForm
          invoice={invoice}
          saving={actions.pending}
          onSave={(supplierCustomerId) => void run(actions.linkSupplier.mutateAsync({ invoice, supplierCustomerId }), "Supplier linked")}
          onCancel={() => setForm(null)}
        />
      )}
      {form === "details" && (
        <DetailsForm
          invoice={invoice}
          saving={actions.pending}
          onSave={(details) => void run(actions.setDetails.mutateAsync({ invoice, details }), "Details saved")}
          onCancel={() => setForm(null)}
        />
      )}
    </div>
  );
}

/** Approve needs no form: one click, disabled with the reason when it can't be done (not linked, a VAT check). */
function ActionButtonPrimary({ state, saving, onClick }: { state: ActionState; saving: boolean; onClick: () => void }) {
  const button = (
    <button type="button" disabled={!!state.blocked || saving} onClick={onClick} className={BTN_PRIMARY}>
      <CheckOutlined />
      Approve
    </button>
  );
  return state.blocked ? (
    <Tooltip title={state.blocked}>
      <span className="inline-flex">{button}</span>
    </Tooltip>
  ) : (
    button
  );
}
