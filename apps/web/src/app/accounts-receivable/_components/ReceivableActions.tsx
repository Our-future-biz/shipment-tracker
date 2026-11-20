"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import dayjs from "dayjs";
import { Alert, DatePicker, Input, Segmented, Tooltip } from "antd";
import { BankOutlined, CalendarOutlined, CheckCircleOutlined, DollarOutlined, EditOutlined, ExclamationCircleOutlined, MailOutlined, MinusCircleOutlined, SendOutlined } from "@ant-design/icons";
import type { useReceivableActions, ReceivableDetail } from "@/hooks/useReceivables";
import { REMINDER_LEVEL_LABEL } from "@/lib/accountsReceivable";
import { apiErrorMessage, type interfaces } from "@/lib/api";
import { addDays, formatDate } from "@/lib/date";
import { MAILTO_LINK_TARGET, mailtoLink } from "@/lib/mailto";
import { parseMoney, round2 } from "@/lib/money";
import { useToast } from "@/lib/toast";
import { BTN, BTN_DANGER, BTN_PRIMARY, HINT, LABEL_TEXT, LINK, TEXTAREA } from "@/styles/ui";
import {
  actionsFor,
  amountText,
  blockedReasons,
  earliestPaidOn,
  emailOk,
  fullAmountText,
  lineWord,
  MAX_NOTE,
  MAX_REASON,
  MIN_REASON,
  nextReminderLevel,
  onPrepayment,
  paymentIdempotencyKey,
  paymentProblem,
  reasonOk,
  takeBackFormProblem,
  type TakeBackKind,
  NO_REMINDER_CONTACT,
  reminderLevels,
  promiseProblem,
  PROMISE_MAX_DAYS,
  reminderMailOf,
  type ReminderDraft,
  waitingTotal,
  writeOffStart,
  writeOffProblem,
  writeOffRoom,
  type ActionState,
  type ReceivableLine,
  type ReceivableRow,
  type WriteOffKind,
} from "../_lib/receivables";

// What can be done to a customer invoice, in its drawer. A payment is noted by a manager with its day and amount (D11,
// D12); a note, a promise to pay, a dispute and its end and a reminder by anyone, the final notice by a manager (D16,
// D17). A reminder is a record that the user sent one from their own mail program: the app sends nothing. The server
// checks everything again and says why when it refuses; every answer is the invoice as it is now, and a refusal reads
// it again (useReceivableActions), so a version changed meanwhile shows what changed. Step 7 (D13): a manager closes
// what is left as a write-off or a bank charge, with a reason, on today; it counts only once a second manager
// confirms it (the payments list, or Billing approvals), and either can be taken back with a reason.

type Form = "payment" | "writeOff" | "bankCharge" | "note" | "promise" | "dispute" | "closeDispute" | "reminder" | null;

export function ActionButton({ state, icon, label, onClick, active, disabled, reasonId }: {
  state: ActionState;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  /** The id of the visible text that says why it is disabled (BlockedReasons) */
  reasonId?: string;
}) {
  if (!state.shown) return null;
  const button = (
    <button
      type="button"
      disabled={!!state.blocked || disabled}
      onClick={onClick}
      aria-pressed={active}
      aria-describedby={state.blocked && reasonId ? reasonId : undefined}
      className={`${BTN} ${active ? "!border-indigo-500 !bg-indigo-50 !text-indigo-700" : ""}`}
    >
      {icon}
      {label}
    </button>
  );
  // A disabled button says why on hover too; the span takes the hover, as a disabled button fires no events. The
  // reason is also written out beside the buttons (BlockedReasons), for a keyboard or a touch screen.
  return state.blocked ? (
    <Tooltip title={state.blocked}>
      <span className="inline-flex">{button}</span>
    </Tooltip>
  ) : (
    button
  );
}

/**
 * A field's problem, said where it is and linked to the field (its id in the field's aria-describedby): a polite live
 * region, there even while empty, so a screen reader hears a problem as it appears.
 */
export function FieldProblem({ id, text, tone = "warning", className = "" }: { id: string; text: string; tone?: "warning" | "error"; className?: string }) {
  return (
    <span id={id} aria-live="polite" className={`${text ? "block" : "sr-only"} text-[12px] ${tone === "error" ? "text-red-600" : "text-amber-700"} ${className}`}>
      {text}
    </span>
  );
}

/** The disabled actions' reasons as text beside the buttons, each once with the buttons it holds back. */
function BlockedReasons({ reasons, idOf }: { reasons: { text: string; labels: string[] }[]; idOf: (text: string) => string }) {
  if (!reasons.length) return null;
  return (
    <ul className="mt-2 flex flex-col gap-0.5 text-[12px] text-slate-600">
      {reasons.map((r) => (
        <li key={r.text} id={idOf(r.text)}>
          <span className="font-medium">{r.labels.map((l) => l.replace(/…$/, "")).join(", ")}:</span> {r.text}
        </li>
      ))}
    </ul>
  );
}

export function FormBox({ children }: { children: ReactNode }) {
  return <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 flex flex-col gap-3">{children}</div>;
}

function SaveCancel({ saveLabel, disabled, danger, onSave, onCancel }: { saveLabel: string; disabled: boolean; danger?: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={disabled} onClick={onSave} className={danger ? BTN_DANGER : BTN_PRIMARY}>
        {saveLabel}
      </button>
      <button type="button" onClick={onCancel} className={BTN}>
        Cancel
      </button>
    </div>
  );
}

/** A text the form needs: a note, or a reason of at least MIN_REASON characters. `autoFocus`: the form's first field. */
function TextField({ label, value, onChange, maxLength, reason, optional, autoFocus, describedBy }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** The server's limit for this text (MAX_NOTE or MAX_REASON): a longer one would be refused */
  maxLength: number;
  reason?: boolean;
  optional?: boolean;
  autoFocus?: boolean;
  /** The id of the form's own problem when it is about this field */
  describedBy?: string;
}) {
  const problemId = useId();
  const short = !!reason && value.length > 0 && !reasonOk(value);
  const describedByIds = [reason ? problemId : "", describedBy ?? ""].filter(Boolean).join(" ") || undefined;
  return (
    <label className="block">
      <span className={`block ${LABEL_TEXT} mb-1`}>
        {label}
        {optional && <span className="font-normal normal-case text-slate-500"> (optional)</span>}
      </span>
      <textarea
        rows={2}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        aria-invalid={short || undefined}
        aria-describedby={describedByIds}
        autoFocus={autoFocus}
        className={`${TEXTAREA} w-full resize-y`}
      />
      {reason && <FieldProblem id={problemId} text={short ? `At least ${MIN_REASON} characters` : ""} />}
    </label>
  );
}

export function ReasonForm({ label, explain, saveLabel, maxLength, danger, saving, onSave, onCancel }: {
  label: string;
  explain: ReactNode;
  saveLabel: string;
  /** The server's limit for the reason (MAX_NOTE or MAX_REASON) */
  maxLength: number;
  danger?: boolean;
  saving: boolean;
  onSave: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <FormBox>
      <div className={HINT}>{explain}</div>
      <TextField label={label} value={reason} onChange={setReason} maxLength={maxLength} reason autoFocus />
      <SaveCancel saveLabel={saveLabel} danger={danger} disabled={saving || !reasonOk(reason)} onSave={() => onSave(reason.trim())} onCancel={onCancel} />
    </FormBox>
  );
}

function PaymentForm({ row, today, saving, onSave, onCancel }: {
  row: ReceivableRow;
  today: string;
  saving: boolean;
  onSave: (input: { paidOn: string; amount: number; bankRef: string; note: string; idempotencyKey: string }) => void;
  onCancel: () => void;
}) {
  const [paidOn, setPaidOn] = useState(today < row.issueDate ? row.issueDate : today);
  const [amount, setAmount] = useState(fullAmountText(row.leftToPay));
  // The bank's reference, as the dialog for several invoices takes it (user council A11).
  const [bankRef, setBankRef] = useState("");
  const [note, setNote] = useState("");
  // One key per day and amount while the form is open: a double click or a retry after a lost answer notes one
  // payment, never two, and a payment changed after a lost answer is a new one, never a replay of the first.
  const keys = useRef(new Map<string, string>());
  const prepayment = onPrepayment(row);
  const issuedAgainFrom = row.issuedAgainFrom ?? null;
  const problem = paymentProblem({ day: paidOn, amountText: amount, today, issueDate: row.issueDate, leftToPay: row.leftToPay, currency: row.currency, prepayment, issuedAgainFrom });
  const firstDay = earliestPaidOn({ issueDate: row.issueDate, prepayment, issuedAgainFrom });
  const value = parseMoney(amount);
  // The problem is the day's or the amount's: linked to that field, said in one live region below them.
  const problemId = useId();
  const dayProblem = !!problem && (!paidOn || problem.startsWith("The day"));
  const amountProblem = !!problem && !dayProblem;
  return (
    <FormBox>
      <div className={HINT}>
        Notes what the customer paid, as the bank statement or the accounting system shows it. If you read the bank statement, confirm the payment there instead.
        It starts with the whole of what is left to pay; a part payment leaves the rest unpaid.
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col">
          <span className={`${LABEL_TEXT} mb-1`}>Paid on</span>
          <DatePicker
            allowClear={false}
            format="D.M.YYYY"
            value={paidOn ? dayjs(paidOn) : null}
            onChange={(d) => setPaidOn(d ? d.format("YYYY-MM-DD") : "")}
            // Not after today, nor before the invoice was issued - unless it is on prepayment, paid before it is
            // issued: the server refuses the rest. As bounds, not disabledDate, so the month and year panels stay
            // open for the days in between.
            minDate={firstDay ? dayjs(firstDay) : undefined}
            maxDate={dayjs(today)}
            className="w-[160px]"
            aria-label="Paid on"
            aria-invalid={dayProblem || undefined}
            aria-describedby={dayProblem ? problemId : undefined}
            status={dayProblem ? "warning" : undefined}
          />
        </label>
        <label className="flex flex-col">
          <span className={`${LABEL_TEXT} mb-1`}>Amount ({row.currency})</span>
          {/* The focus goes to the amount, not the day: a focused date field opens its calendar over the form. */}
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="!w-[160px] text-right tabular-nums"
            aria-label="Amount paid"
            aria-invalid={amountProblem || undefined}
            aria-describedby={amountProblem ? problemId : undefined}
            status={amountProblem ? "warning" : undefined}
            autoFocus
          />
          <span className="text-[12px] text-slate-500 mt-1">Left to pay {amountText(row.leftToPay, row.currency)}</span>
        </label>
        <label className="flex flex-col flex-1 min-w-[200px]">
          <span className={`${LABEL_TEXT} mb-1`}>
            Bank reference <span className="font-normal normal-case text-slate-500">(optional)</span>
          </span>
          <Input value={bankRef} onChange={(e) => setBankRef(e.target.value)} maxLength={140} aria-label="Bank reference" placeholder="As on the bank statement" />
        </label>
      </div>
      <TextField label="Note" value={note} onChange={setNote} maxLength={MAX_REASON} optional />
      <FieldProblem id={problemId} text={problem} />
      <SaveCancel
        saveLabel={value !== null && !problem ? `Note ${amountText(round2(value), row.currency)} paid on ${formatDate(paidOn)}` : "Note the payment"}
        disabled={saving || !!problem || value === null}
        onSave={() => {
          if (value === null) return;
          const paid = round2(value);
          onSave({ paidOn, amount: paid, bankRef: bankRef.trim(), note: note.trim(), idempotencyKey: paymentIdempotencyKey(keys.current, paidOn, paid) });
        }}
        onCancel={onCancel}
      />
    </FormBox>
  );
}

const WRITE_OFF_EXPLAIN: Record<WriteOffKind, string> = {
  write_off:
    "Closes what is left that the customer will not pay (a short payment, a small rest), with the reason. It counts only once another manager confirms it; until then the invoice stays as it is.",
  bank_charge:
    "Closes what the bank kept of the customer's payment as a bank charge, with the reason. It counts only once another manager confirms it; until then the invoice stays as it is.",
};

function WriteOffForm({ kind, row, waiting, today, saving, onSave, onCancel }: {
  kind: WriteOffKind;
  row: ReceivableRow;
  /** Write-offs and bank charges on it already waiting for a second manager */
  waiting: number;
  today: string;
  saving: boolean;
  onSave: (input: { amount: number; reason: string }) => void;
  onCancel: () => void;
}) {
  const word = kind === "write_off" ? "write-off" : "bank charge";
  const [amount, setAmount] = useState(writeOffStart(kind, row.leftToPay, waiting));
  const [reason, setReason] = useState("");
  const problem = writeOffProblem({ kind, amountText: amount, reason, leftToPay: row.leftToPay, waiting, currency: row.currency });
  const value = parseMoney(amount);
  const shown = problem && (amount.trim() || reason.trim()) ? problem : "";
  // The reason's problem is the reason field's; every other one is the amount's.
  const problemId = useId();
  const reasonProblem = !!shown && shown.startsWith("Say why");
  const amountProblem = !!shown && !reasonProblem;
  return (
    <FormBox>
      <div className={HINT}>{WRITE_OFF_EXPLAIN[kind]}</div>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col">
          <span className={`${LABEL_TEXT} mb-1`}>Amount ({row.currency})</span>
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="!w-[160px] text-right tabular-nums"
            aria-label={`Amount of the ${word}`}
            aria-invalid={amountProblem || undefined}
            aria-describedby={amountProblem ? problemId : undefined}
            status={amountProblem ? "warning" : undefined}
            autoFocus
          />
          <span className="text-[12px] text-slate-500 mt-1">
            Left to pay {amountText(row.leftToPay, row.currency)}
            {waiting > 0 && ` · ${amountText(waiting, row.currency)} waits already · at most ${amountText(writeOffRoom(row.leftToPay, waiting), row.currency)}`}
          </span>
        </label>
        <div className="flex flex-col">
          <span className={`${LABEL_TEXT} mb-1`}>Day</span>
          {/* Its day is the day it is written (the server writes today). */}
          <span className="h-8 inline-flex items-center tabular-nums text-[13px] text-slate-700">{formatDate(today)} (today)</span>
        </div>
      </div>
      <TextField label={`Why the ${word} closes what is left`} value={reason} onChange={setReason} maxLength={MAX_REASON} reason describedBy={reasonProblem ? problemId : undefined} />
      <FieldProblem id={problemId} text={shown} />
      <SaveCancel
        saveLabel={value !== null && !problem ? `Write a ${word} of ${amountText(round2(value), row.currency)}` : `Write the ${word}`}
        disabled={saving || !!problem || value === null}
        onSave={() => {
          if (value === null) return;
          onSave({ amount: round2(value), reason: reason.trim() });
        }}
        onCancel={onCancel}
      />
    </FormBox>
  );
}

function PromiseForm({ today, canAct, saving, onSave, onCancel }: { today: string; canAct: boolean; saving: boolean; onSave: (input: { promisedOn: string; text: string }) => void; onCancel: () => void }) {
  const [promisedOn, setPromisedOn] = useState("");
  const [text, setText] = useState("");
  const problem = promiseProblem(promisedOn, today, canAct);
  const problemId = useId();
  return (
    <FormBox>
      <div className={HINT}>
        The due day stays as invoiced: the promised day stands beside it, and the row says when it has passed.
        {!canAct && ` At most ${PROMISE_MAX_DAYS} days ahead: a manager notes a later one.`}
      </div>
      <label className="flex flex-col">
        <span className={`${LABEL_TEXT} mb-1`}>Promised to pay by</span>
        <DatePicker
          format="D.M.YYYY"
          value={promisedOn ? dayjs(promisedOn) : null}
          onChange={(d) => setPromisedOn(d ? d.format("YYYY-MM-DD") : "")}
          minDate={dayjs(today)}
          maxDate={canAct ? undefined : dayjs(addDays(today, PROMISE_MAX_DAYS))}
          className="w-[160px]"
          aria-label="Promised to pay by"
        />
      </label>
      {promisedOn && problem && <FieldProblem id={problemId} text={problem} />}
      <TextField label="What was said" value={text} onChange={setText} maxLength={MAX_NOTE} optional />
      <SaveCancel saveLabel={promisedOn && !problem ? `Note the promise to pay by ${formatDate(promisedOn)}` : "Note the promise"} disabled={saving || !!problem} onSave={() => onSave({ promisedOn, text: text.trim() })} onCancel={onCancel} />
    </FormBox>
  );
}

function NoteForm({ saving, onSave, onCancel }: { saving: boolean; onSave: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  return (
    <FormBox>
      <TextField label="Note" value={text} onChange={setText} maxLength={MAX_NOTE} autoFocus />
      <SaveCancel saveLabel="Add the note" disabled={saving || !text.trim()} onSave={() => onSave(text.trim())} onCancel={onCancel} />
    </FormBox>
  );
}

function ReminderForm({ row, canAct, reminderTo, drafts, paymentWaiting, saving, onSave, onCancel }: {
  row: ReceivableRow;
  canAct: boolean;
  reminderTo: interfaces.ReceivableCustomerFacts["reminderTo"];
  /** The server's text of each level (the customer's language, the account, the variable symbol) */
  drafts: readonly ReminderDraft[] | undefined;
  /** A payment that may be for it waits on a bank statement: said before anyone reminds the customer */
  paymentWaiting: interfaces.ReceivablePaymentWaiting | null | undefined;
  saving: boolean;
  onSave: (input: { level: 1 | 2 | 3; recipient: string; text: string }) => void;
  onCancel: () => void;
}) {
  const levels = reminderLevels(canAct);
  const [level, setLevel] = useState<1 | 2 | 3>(nextReminderLevel(row.reminderLevel, canAct));
  const [recipient, setRecipient] = useState(reminderTo?.email ?? "");
  const [text, setText] = useState("");
  const mail = reminderMailOf(drafts, row, level);
  const href = mailtoLink({ to: recipient, subject: mail.subject, message: mail.message });
  const recipientOk = emailOk(recipient);
  const recipientBad = !!recipient.trim() && !recipientOk;
  const recipientProblemId = useId();
  // The Level is a group of choices named by its caption, not a <label>: a click on a label would choose an option.
  const levelId = useId();
  const levelRef = useRef<HTMLDivElement>(null);
  // The form's first field takes the focus when the form opens: the chosen level, so the arrow keys change it.
  useEffect(() => {
    levelRef.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
  }, []);
  return (
    <FormBox>
      <div className={HINT}>
        Write and send the reminder from your own mail program, then record it here: the app sends nothing.
        {!canAct && " The final notice (reminder 3) is sent by a manager."}
      </div>
      {paymentWaiting && <Alert type="warning" showIcon message={`${paymentWaiting.text}. The customer may have paid: check it before you send a reminder.`} />}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <span id={levelId} className={`${LABEL_TEXT} mb-1`}>
            Level
          </span>
          <Segmented
            ref={levelRef}
            // Its radiogroup is named "Level", in place of the control's own "segmented control".
            aria-labelledby={levelId}
            aria-label={undefined}
            value={level}
            onChange={(v) => setLevel(v as 1 | 2 | 3)}
            options={levels.map((l) => ({ value: l, label: REMINDER_LEVEL_LABEL[l] }))}
          />
        </div>
        <label className="flex flex-col min-w-[260px] flex-1">
          <span className={`${LABEL_TEXT} mb-1`}>Sent to</span>
          <Input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            type="email"
            aria-label="Sent to"
            placeholder="E-mail address"
            aria-invalid={recipientBad || undefined}
            aria-describedby={recipientProblemId}
          />
          {reminderTo ? (
            <span className="text-[12px] text-slate-500 mt-1">
              {reminderTo.name || reminderTo.email}
              {reminderTo.role ? ` · ${reminderTo.role}` : ""}
            </span>
          ) : (
            <span className="text-[12px] text-slate-500 mt-1">{NO_REMINDER_CONTACT}: type the address</span>
          )}
          <FieldProblem id={recipientProblemId} text={recipientBad ? "Give an e-mail address" : ""} />
        </label>
      </div>
      {/* Opens the user's mail program with the subject and text filled in; it records nothing and sends nothing. */}
      <a href={recipientOk ? href : mailtoLink({ subject: mail.subject, message: mail.message })} {...MAILTO_LINK_TARGET} className={`inline-flex items-center gap-1.5 self-start ${LINK}`}>
        <MailOutlined />
        Open in your mail program
      </a>
      <TextField label="Note" value={text} onChange={setText} maxLength={MAX_NOTE} optional />
      <SaveCancel
        saveLabel={`Record that ${REMINDER_LEVEL_LABEL[level].toLowerCase()} was sent`}
        disabled={saving || !recipientOk || !levels.includes(level)}
        onSave={() => onSave({ level, recipient: recipient.trim(), text: text.trim() })}
        onCancel={onCancel}
      />
    </FormBox>
  );
}

/** The drawer's writes, from one useReceivableActions, so every button waits while any of them is on its way. */
export type Actions = ReturnType<typeof useReceivableActions>;

export function ReceivableActions({ detail, actions }: { detail: ReceivableDetail; actions: Actions }) {
  const toast = useToast();
  const { row, canAct, today } = detail;
  const waiting = waitingTotal(detail.payments);
  const can = actionsFor(row, canAct, detail.sendAgain, waiting);
  const [form, setForm] = useState<Form>(null);
  const toggle = (f: Exclude<Form, null>) => setForm((now) => (now === f ? null : f));
  const saving = actions.pending;
  const reasonBase = useId();

  // One write at a time: every button waits while any of them is on its way. A refusal says why, in the server's words.
  const run = (p: Promise<unknown>, done: string) =>
    p
      .then(() => {
        toast.success(done);
        setForm(null);
      })
      .catch((e) => toast.error(apiErrorMessage(e)));

  const number = row.number || "the invoice";
  const target = { row };
  const buttons: { form: Exclude<Form, null>; state: ActionState; icon: ReactNode; label: string }[] = [
    { form: "payment", state: can.notePayment, icon: <DollarOutlined />, label: "Note a payment…" },
    { form: "writeOff", state: can.writeOff, icon: <MinusCircleOutlined />, label: "Write off…" },
    { form: "bankCharge", state: can.bankCharge, icon: <BankOutlined />, label: "Bank charge…" },
    { form: "reminder", state: can.reminder, icon: <MailOutlined />, label: "Send a reminder…" },
    { form: "promise", state: can.promise, icon: <CalendarOutlined />, label: "Promise to pay…" },
    { form: "dispute", state: can.dispute, icon: <ExclamationCircleOutlined />, label: "Disputed…" },
    { form: "closeDispute", state: can.closeDispute, icon: <CheckCircleOutlined />, label: "Close the dispute…" },
    { form: "note", state: can.note, icon: <EditOutlined />, label: "Add a note…" },
  ];
  const reasons = blockedReasons(buttons);
  const reasonId = (text: string) => `${reasonBase}-${reasons.findIndex((r) => r.text === text)}`;
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {buttons.map((b) => (
          <ActionButton
            key={b.form}
            state={b.state}
            icon={b.icon}
            label={b.label}
            active={form === b.form}
            disabled={saving}
            onClick={() => toggle(b.form)}
            reasonId={b.state.blocked ? reasonId(b.state.blocked) : undefined}
          />
        ))}
        {can.sendAgain.shown && (
          <Tooltip title="The invoice did not reach the customer's Finance tab: send it there again">
            <button type="button" disabled={saving} onClick={() => void run(actions.sendAgain.mutateAsync(target), `${number} is sent to the customer's list again`)} className={BTN}>
              <SendOutlined />
              Send again
            </button>
          </Tooltip>
        )}
      </div>
      <BlockedReasons reasons={reasons} idOf={reasonId} />
      {!canAct && (row.status === "unpaid" || row.status === "part_paid") && <div className={`mt-2 ${HINT}`}>A manager notes payments, write-offs and bank charges, and takes them back.</div>}

      {form === "payment" && (
        <PaymentForm
          row={row}
          today={today}
          saving={saving}
          onSave={(p) => void run(actions.notePayment.mutateAsync({ ...target, ...p, bankRef: p.bankRef || undefined, note: p.note || undefined }), `Payment of ${amountText(p.amount, row.currency)} noted on ${number}`)}
          onCancel={() => setForm(null)}
        />
      )}
      {(form === "writeOff" || form === "bankCharge") && (
        <WriteOffForm
          key={form}
          kind={form === "writeOff" ? "write_off" : "bank_charge"}
          row={row}
          waiting={waiting}
          today={today}
          saving={saving}
          onSave={(w) => {
            const kind: WriteOffKind = form === "writeOff" ? "write_off" : "bank_charge";
            const word = kind === "write_off" ? "Write-off" : "Bank charge";
            void run(actions.writeOff.mutateAsync({ ...target, kind, amount: w.amount, reason: w.reason }), `${word} of ${amountText(w.amount, row.currency)} written on ${number}: it waits for a second manager`);
          }}
          onCancel={() => setForm(null)}
        />
      )}
      {form === "reminder" && (
        <ReminderForm
          row={row}
          canAct={canAct}
          reminderTo={detail.customerFacts?.reminderTo ?? null}
          drafts={detail.reminderDrafts}
          paymentWaiting={detail.paymentWaiting}
          saving={saving}
          onSave={(r) =>
            void run(
              actions.addNote.mutateAsync({ ...target, note: { kind: "reminder", text: r.text, reminderLevel: r.level, recipient: r.recipient } }),
              `Recorded: ${REMINDER_LEVEL_LABEL[r.level].toLowerCase()} sent to ${r.recipient}`,
            )
          }
          onCancel={() => setForm(null)}
        />
      )}
      {form === "promise" && (
        <PromiseForm
          canAct={canAct}
          today={today}
          saving={saving}
          onSave={(p) => void run(actions.addNote.mutateAsync({ ...target, note: { kind: "promise", text: p.text, promisedOn: p.promisedOn } }), `Promise to pay by ${formatDate(p.promisedOn)} noted`)}
          onCancel={() => setForm(null)}
        />
      )}
      {form === "dispute" && (
        <ReasonForm
          label="What the customer disputes"
          explain="It stays owed and overdue, and no reminder goes out while it is disputed. The amount changes only through a credit note, issued in Invoicing."
          saveLabel={`Mark ${number} disputed`}
          maxLength={MAX_NOTE}
          saving={saving}
          onSave={(reason) => void run(actions.addNote.mutateAsync({ ...target, note: { kind: "dispute", text: reason } }), `${number} is marked disputed`)}
          onCancel={() => setForm(null)}
        />
      )}
      {form === "closeDispute" && (
        <ReasonForm
          label="How the dispute ended"
          explain="Reminders can be sent again once it is closed."
          saveLabel="Close the dispute"
          maxLength={MAX_NOTE}
          saving={saving}
          onSave={(reason) => void run(actions.addNote.mutateAsync({ ...target, note: { kind: "dispute_closed", text: reason } }), "Dispute closed")}
          onCancel={() => setForm(null)}
        />
      )}
      {form === "note" && (
        <NoteForm saving={saving} onSave={(text) => void run(actions.addNote.mutateAsync({ ...target, note: { kind: "note", text } }), "Note added")} onCancel={() => setForm(null)} />
      )}
    </div>
  );
}

/**
 * Take back one line (managers, a reason required): a payment noted by mistake, or reversed on a day - a bank return or
 * a refund (mock test council P8: either way it is owed again, but a reversed payment counted as paid until that day at
 * month-end) - or a write-off or bank charge, confirmed or still waiting, always a mistake. Kept in the history with the
 * reason. Sent with how it was taken back through the drawer's one set of writes (actions.takeBackPayment), so every
 * other form waits while it is on its way, and settled as they are.
 */
export function TakeBackPayment({
  detail,
  actions,
  line,
  label,
}: {
  detail: ReceivableDetail;
  actions: Actions;
  line: Pick<ReceivableLine, "id" | "kind" | "waiting" | "paidOn">;
  label: string;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<TakeBackKind>("mistake");
  const [reversedOn, setReversedOn] = useState("");
  const [reason, setReason] = useState("");
  const number = detail.row.number || "the invoice";
  const word = lineWord(line.kind);
  const Word = word.charAt(0).toUpperCase() + word.slice(1);
  const money = line.kind !== "write_off" && line.kind !== "bank_charge";
  const how: TakeBackKind = money ? kind : "mistake";
  const problem = takeBackFormProblem({ reason, kind: how, reversedOn, paidOn: line.paidOn, today: detail.today });
  const problemId = useId();
  const explain = !money
    ? line.waiting
      ? `${label} will not wait for a second manager any more: it never counts on ${number}. It stays in the history with the reason.`
      : `${label} no longer closes part of ${number}: that much is owed again. It stays in the history with the reason.`
    : how === "reversed"
      ? `For a payment that came and went back (a bank return, a refund): ${number} is owed again; at month-end ${label} still counts as paid up to the day before it went back. It stays in the history with the reason.`
      : `For a payment noted by mistake: ${label} no longer counts as paid on ${number}, on any day - month-end too. It stays in the history with the reason.`;
  const busy = actions.pending;
  const close = () => {
    setOpen(false);
    setKind("mistake");
    setReversedOn("");
    setReason("");
  };
  const save = () => {
    if (problem || busy) return;
    void actions.takeBackPayment
      .mutateAsync({ row: detail.row, paymentId: line.id, reason: reason.trim(), kind: how, ...(how === "reversed" ? { reversedOn } : {}) })
      .then(() => {
        toast.success(how === "reversed" ? `${Word} on ${number} taken back: reversed on ${formatDate(reversedOn)}` : `${Word} taken back on ${number}`);
        close();
      })
      .catch((e) => toast.error(apiErrorMessage(e)));
  };
  return (
    <div>
      <button type="button" disabled={busy} onClick={() => (open ? close() : setOpen(true))} className={`text-[12px] ${LINK}`} aria-pressed={open}>
        Take back…
      </button>
      {open && (
        <FormBox>
          {money && (
            <Segmented<TakeBackKind>
              value={kind}
              onChange={setKind}
              options={[
                { value: "mistake", label: "Noted by mistake" },
                { value: "reversed", label: "Reversed (bank return, refund)" },
              ]}
              aria-label="How it is taken back"
            />
          )}
          <div className={HINT}>{explain}</div>
          {how === "reversed" && (
            <label className="flex flex-col">
              <span className={`${LABEL_TEXT} mb-1`}>Reversed on</span>
              <DatePicker
                format="D.M.YYYY"
                value={reversedOn ? dayjs(reversedOn) : null}
                onChange={(d) => setReversedOn(d ? d.format("YYYY-MM-DD") : "")}
                minDate={line.paidOn ? dayjs(line.paidOn) : undefined}
                maxDate={dayjs(detail.today)}
                className="w-[160px]"
                aria-label="Reversed on"
                aria-describedby={problemId}
              />
            </label>
          )}
          <TextField label={`Why the ${word} is taken back`} value={reason} onChange={setReason} maxLength={MAX_REASON} reason autoFocus />
          <FieldProblem id={problemId} text={reason.trim() ? problem : ""} />
          <SaveCancel saveLabel={`Take back the ${word}`} danger disabled={busy || !!problem} onSave={save} onCancel={close} />
        </FormBox>
      )}
    </div>
  );
}

/** Confirm a write-off or bank charge waiting for a second manager (D13): the server says who may (canConfirm). */
export function ConfirmLine({ detail, actions, line, label }: { detail: ReceivableDetail; actions: Actions; line: Pick<ReceivableLine, "id" | "kind">; label: string }) {
  const toast = useToast();
  const number = detail.row.number || "the invoice";
  const word = lineWord(line.kind);
  return (
    <Tooltip title={`It then counts: ${label} closes that much of ${number}`}>
      <button
        type="button"
        disabled={actions.pending}
        onClick={() =>
          void actions.confirmWriteOff
            .mutateAsync({ row: detail.row, lineId: line.id })
            .then((d) => {
              const mine = d?.payments.find((p) => p.id === line.id);
              toast.success(`The ${word} on ${number} is confirmed${mine?.confirmed?.self ? " (self-confirmed: no other manager)" : ""}`);
            })
            .catch((e) => toast.error(apiErrorMessage(e)))
        }
        className={`${BTN} !h-7 !px-2.5 !text-[12px]`}
      >
        <CheckCircleOutlined />
        Confirm
      </button>
    </Tooltip>
  );
}
