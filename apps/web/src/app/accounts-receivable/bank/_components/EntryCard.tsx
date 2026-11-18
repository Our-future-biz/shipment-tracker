"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { Input, Select, Tooltip } from "antd";
import { CheckOutlined, CloseOutlined, PlusOutlined } from "@ant-design/icons";
import { Pill } from "@/components/Pill";
import { useBankEntryActions, type BankEntryCandidate, type BankStatementEntry } from "@/hooks/useReceivableTools";
import { arInvoiceHref } from "@/lib/accountsReceivable";
import { apiErrorMessage } from "@/lib/api";
import { businessDateTime, formatDate } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { BTN, BTN_PRIMARY, CARD, EMPTY, HINT, ICON_BTN_DANGER, LABEL_TEXT, LINK, REF, TD, TEXTAREA, TH } from "@/styles/ui";
import { amountText } from "../../_lib/receivables";
import { FieldProblem } from "../../_components/ReceivableActions";
import {
  addAllocation,
  checkAllocations,
  entryStatusLabel,
  entryStatusTone,
  ignoreProblem,
  isOpenEntry,
  MIN_REASON,
  prefillAllocations,
  withFreshFacts,
  type AllocationRow,
  type InvoiceChoice,
} from "../_lib/bank";

// One entry of a bank statement: what the bank says about it, and what was decided. Money in still to decide shows
// the invoices it may pay; a manager puts it on them (the best one is filled in, never confirmed by itself) and
// confirms, or sets it aside with a reason. Money out is greyed: it is never a customer's payment.

const choiceOf = (c: BankEntryCandidate): InvoiceChoice => ({ invoiceId: c.invoiceId, number: c.number, customer: c.customer, currency: c.currency, leftToPay: c.leftToPay, version: c.version });

const invoiceLink = (invoiceId: string, number: string) => (
  <Link href={arInvoiceHref(invoiceId)} className={`${REF} ${LINK} whitespace-nowrap`}>
    {number || "Invoice"}
  </Link>
);

function Facts({ entry }: { entry: BankStatementEntry }) {
  const symbols = [
    entry.variableSymbol && `VS ${entry.variableSymbol}`,
    entry.constantSymbol && `KS ${entry.constantSymbol}`,
    entry.specificSymbol && `SS ${entry.specificSymbol}`,
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-2">
      <div className="min-w-[150px]">
        <div className={`text-[16px] font-bold tabular-nums ${entry.credit ? "text-slate-900" : "text-slate-500"}`}>
          {entry.credit ? "" : "−"}
          {amountText(entry.amount, entry.currency)}
        </div>
        <div className="text-[12px] text-slate-500 tabular-nums">
          Booked {formatDate(entry.bookingDate) || "—"}
          {entry.valueDate && entry.valueDate !== entry.bookingDate ? ` · value ${formatDate(entry.valueDate)}` : ""}
        </div>
      </div>
      <div className="min-w-[180px] max-w-[280px]">
        <div className={LABEL_TEXT}>{entry.credit ? "Payer" : "Paid to"}</div>
        <div className="text-[13px] text-slate-700 truncate" title={entry.counterpartyName}>
          {entry.counterpartyName || <span className={EMPTY}>—</span>}
        </div>
        {entry.counterpartyAccount && <div className={`text-[12px] text-slate-500 ${REF} truncate`}>{entry.counterpartyAccount}</div>}
      </div>
      <div className="min-w-[200px] flex-1">
        <div className={LABEL_TEXT}>Message</div>
        <div className="text-[13px] text-slate-700 break-words">{entry.message || <span className={EMPTY}>—</span>}</div>
        {(symbols.length > 0 || entry.endToEndId) && (
          <div className={`text-[12px] text-slate-500 ${REF}`}>
            {symbols.join(" · ")}
            {entry.endToEndId ? `${symbols.length ? " · " : ""}End-to-end ${entry.endToEndId}` : ""}
          </div>
        )}
      </div>
      <div className="ml-auto">
        <Pill tone={entryStatusTone(entry)}>{entryStatusLabel(entry)}</Pill>
      </div>
    </div>
  );
}

/** What was decided: who and when, and the payments it became (linked to their invoices). */
function Decision({ entry }: { entry: BankStatementEntry }) {
  const when = entry.decidedAt ? businessDateTime(entry.decidedAt) : "";
  if (entry.status === "confirmed") {
    return (
      <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-[13px] text-slate-700 flex flex-col gap-1">
        <div>
          Confirmed as paid by {entry.decidedBy || "a manager"}
          {when && ` on ${when}`}
        </div>
        {entry.allocations.map((a) => (
          <div key={a.paymentId} className="flex flex-wrap gap-2 items-center">
            {invoiceLink(a.invoiceId, a.number)}
            <span className={`tabular-nums ${a.takenBack ? "line-through text-slate-400" : ""}`}>{amountText(a.amount, entry.currency)}</span>
            {a.takenBack && <span className="text-slate-500">taken back on the invoice</span>}
          </div>
        ))}
        {entry.unallocated > 0 && (
          <div className="text-amber-700">{amountText(entry.unallocated, entry.currency)} of the payment is on no invoice (an overpayment, or money for something else).</div>
        )}
      </div>
    );
  }
  if (entry.status === "ignored") {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-700">
        Set aside by {entry.decidedBy || "a manager"}
        {when && ` on ${when}`}
        {entry.decisionReason && `: “${entry.decisionReason}”`}
      </div>
    );
  }
  return null;
}

function CandidatesTable({ entry, chosen, onAdd }: { entry: BankStatementEntry; chosen?: ReadonlySet<string>; onAdd?: (c: BankEntryCandidate) => void }) {
  if (!entry.candidates.length) {
    return <div className={HINT}>No owed invoice in {entry.currency} names this payment&apos;s variable symbol or carries its invoice number in the message.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {onAdd && <th className={TH} aria-label="Choose" />}
            <th className={TH}>Invoice</th>
            <th className={TH}>Customer</th>
            <th className={TH}>Job</th>
            <th className={TH}>Due</th>
            <th className={`${TH} !text-right`}>Left to pay</th>
            <th className={TH}>Why proposed</th>
            <th className={`${TH} !text-right`}>Score</th>
          </tr>
        </thead>
        <tbody>
          {entry.candidates.map((c) => {
            const taken = !!chosen?.has(c.invoiceId);
            return (
              <tr key={c.invoiceId}>
                {onAdd && (
                  <td className={`${TD} w-[1%]`}>
                    <button type="button" disabled={taken} onClick={() => onAdd(c)} className={`${BTN} !h-7 !px-2 !text-[12px]`}>
                      {taken ? <CheckOutlined /> : <PlusOutlined />}
                      {taken ? "Chosen" : "Choose"}
                    </button>
                  </td>
                )}
                <td className={TD}>{invoiceLink(c.invoiceId, c.number)}</td>
                <td className={TD}>
                  <span className="block max-w-[220px] truncate" title={c.customer}>
                    {c.customer || "—"}
                  </span>
                </td>
                <td className={`${TD} ${REF}`}>{c.jobNumber || "—"}</td>
                <td className={`${TD} tabular-nums whitespace-nowrap`}>{formatDate(c.dueDate) || "—"}</td>
                <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>{amountText(c.leftToPay, c.currency)}</td>
                <td className={TD}>
                  <div className="flex flex-wrap gap-1">
                    {c.reasons.map((r) => (
                      <Pill key={r} tone="slate">
                        {r}
                      </Pill>
                    ))}
                  </div>
                </td>
                <td className={`${TD} text-right tabular-nums`}>{c.score}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The manager's decision on an open entry: the invoices it pays and their amounts, or set aside with a reason. */
function DecideForm({ statementId, entry, owed, owedLoading }: { statementId: string; entry: BankStatementEntry; owed: readonly InvoiceChoice[]; owedLoading: boolean }) {
  const actions = useBankEntryActions();
  const toast = useToast();
  // The best candidate filled in with min(payment, its left to pay): a proposal the manager confirms or changes, never confirmed by itself.
  const [rows, setRows] = useState<AllocationRow[]>(() => prefillAllocations(entry, entry.candidates.map(choiceOf)));
  const [aside, setAside] = useState(false);
  const [reason, setReason] = useState("");

  // Each chosen invoice as it is now: the candidates read with the statement, else the owed invoices.
  const fresh = useMemo(() => {
    const m = new Map<string, InvoiceChoice>();
    for (const o of owed) m.set(o.invoiceId, o);
    for (const c of entry.candidates) m.set(c.invoiceId, choiceOf(c));
    return m;
  }, [owed, entry.candidates]);
  const current = withFreshFacts(rows, fresh);
  const check = checkAllocations(entry, current);
  const chosen = new Set(rows.map((r) => r.invoiceId));
  const others = owed.filter((o) => o.currency === entry.currency && !chosen.has(o.invoiceId));
  const paidOn = entry.bookingDate ?? entry.valueDate;
  // The form's problems, linked to their fields and the buttons they hold back, in polite live regions.
  const ids = useId();
  const problemId = `${ids}-problem`;
  const reasonProblemId = `${ids}-reason`;
  const reasonShort = reason.length > 0 && !!ignoreProblem(reason);
  // Why Confirm is disabled, as text beside it: the entry's missing day, else the allocation's problem.
  const confirmProblem = !paidOn ? "This entry has no booking day: note its payment on the invoice by hand." : check.problem;

  const add = (choice: InvoiceChoice) => setRows((now) => addAllocation(now, entry, choice));
  const setAmount = (invoiceId: string, amountText: string) => setRows((now) => now.map((r) => (r.invoiceId === invoiceId ? { ...r, amountText } : r)));
  const remove = (invoiceId: string) => setRows((now) => now.filter((r) => r.invoiceId !== invoiceId));

  const confirm = () => {
    if (check.problem || !paidOn) return;
    const n = check.items.length;
    actions.confirm
      .mutateAsync({ statementId, entry, items: check.items })
      .then(() => toast.success(`Noted ${amountText(check.total, entry.currency)} paid on ${n} ${n === 1 ? "invoice" : "invoices"}`))
      .catch((e) => toast.error(apiErrorMessage(e)));
  };
  const setEntryAside = () => {
    if (ignoreProblem(reason)) return;
    actions.ignore
      .mutateAsync({ statementId, entry, reason: reason.trim() })
      .then(() => toast.success("Entry set aside"))
      .catch((e) => toast.error(apiErrorMessage(e)));
  };

  return (
    <div className="flex flex-col gap-3">
      <CandidatesTable entry={entry} chosen={chosen} onAdd={(c) => add(choiceOf(c))} />

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className={LABEL_TEXT}>This payment pays</span>
          <Select<string>
            showSearch
            value={null}
            placeholder={owedLoading ? "Loading the invoices owed…" : `Another invoice in ${entry.currency}…`}
            aria-label="Another invoice"
            loading={owedLoading}
            optionFilterProp="label"
            popupMatchSelectWidth={420}
            className="!w-80"
            options={others.map((o) => ({ value: o.invoiceId, label: `${o.number} · ${o.customer} · ${amountText(o.leftToPay, o.currency)} left` }))}
            onChange={(id) => {
              const o = others.find((x) => x.invoiceId === id);
              if (o) add(o);
            }}
            notFoundContent={owedLoading ? "Loading…" : `No other invoice owed in ${entry.currency}`}
          />
        </div>
        {current.length > 0 && (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>Invoice</th>
                <th className={TH}>Customer</th>
                <th className={`${TH} !text-right`}>Left to pay</th>
                <th className={`${TH} !text-right`}>Amount paid</th>
                <th className={TH} aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {current.map((r) => (
                <tr key={r.invoiceId}>
                  <td className={TD}>{invoiceLink(r.invoiceId, r.number)}</td>
                  <td className={TD}>
                    <span className="block max-w-[260px] truncate" title={r.customer}>
                      {r.customer || "—"}
                    </span>
                  </td>
                  <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>{amountText(r.leftToPay, r.currency)}</td>
                  <td className={`${TD} text-right`}>
                    <Input
                      value={r.amountText}
                      onChange={(e) => setAmount(r.invoiceId, e.target.value)}
                      inputMode="decimal"
                      aria-label={`Amount paid on ${r.number}`}
                      aria-describedby={confirmProblem ? problemId : undefined}
                      suffix={<span className="text-slate-400">{r.currency}</span>}
                      className="!w-40 text-right tabular-nums"
                    />
                  </td>
                  <td className={`${TD} w-[1%]`}>
                    <Tooltip title="Take this invoice out">
                      <button type="button" aria-label={`Take ${r.number} out`} onClick={() => remove(r.invoiceId)} className={ICON_BTN_DANGER}>
                        <CloseOutlined />
                      </button>
                    </Tooltip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="text-[13px] text-slate-700 tabular-nums">
          Together <strong>{amountText(check.total, entry.currency)}</strong> of the payment&apos;s {amountText(entry.amount, entry.currency)}
          {check.rest > 0 && current.length > 0 && <span className="text-amber-700"> · {amountText(check.rest, entry.currency)} on no invoice (an overpayment, or money for something else)</span>}
        </div>
        <FieldProblem id={problemId} tone="error" text={confirmProblem} className="!text-[13px]" />
        {paidOn && <div className={HINT}>Noted as paid on {formatDate(paidOn)}, the day the bank booked it, with the bank&apos;s reference of this entry.</div>}

        {aside ? (
          <div className="flex flex-col gap-2">
            <label className="block">
              <span className={`block ${LABEL_TEXT} mb-1`}>Why is it set aside?</span>
              <textarea
                rows={2}
                maxLength={1000}
                value={reason}
                autoFocus
                onChange={(e) => setReason(e.target.value)}
                aria-label="Why is it set aside?"
                aria-invalid={reasonShort || undefined}
                aria-describedby={reasonProblemId}
                placeholder="Not a customer's payment, noted by hand already, a refund to us…"
                className={`${TEXTAREA} w-full resize-y`}
              />
              <FieldProblem id={reasonProblemId} text={reasonShort ? `At least ${MIN_REASON} characters` : ""} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={actions.pending || !!ignoreProblem(reason)} onClick={setEntryAside} aria-describedby={reasonProblemId} className={BTN_PRIMARY}>
                Set aside
              </button>
              <button type="button" onClick={() => setAside(false)} className={BTN}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={actions.pending || !!check.problem || !paidOn} onClick={confirm} aria-describedby={confirmProblem ? problemId : undefined} className={BTN_PRIMARY}>
              <CheckOutlined />
              {actions.confirm.isPending
                ? "Confirming…"
                : `Confirm as paid${check.items.length ? ` (${amountText(check.total, entry.currency)} on ${check.items.length} ${check.items.length === 1 ? "invoice" : "invoices"})` : ""}`}
            </button>
            <button type="button" disabled={actions.pending} onClick={() => setAside(true)} className={BTN}>
              Set aside…
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function EntryCard({
  statementId,
  entry,
  canAct,
  owed,
  owedLoading,
  onOpenStatement,
}: {
  statementId: string;
  entry: BankStatementEntry;
  canAct: boolean;
  owed: readonly InvoiceChoice[];
  owedLoading: boolean;
  onOpenStatement: (id: string) => void;
}) {
  const out = !entry.credit || entry.status === "not_incoming";
  const open = isOpenEntry(entry);
  const elsewhere = entry.firstReadIn;
  return (
    <div className={`${CARD} px-4 py-3 flex flex-col gap-3 ${out ? "!bg-slate-50 opacity-70" : ""}`}>
      <Facts entry={entry} />
      {elsewhere && (
        <div className={HINT}>
          Also in{" "}
          <button type="button" onClick={() => onOpenStatement(elsewhere.statementId)} className={`bg-transparent border-0 p-0 cursor-pointer ${LINK}`}>
            {elsewhere.fileName || "another statement"}
          </button>
          , read first: {open ? "decide it there." : "it was decided there."}
        </div>
      )}
      <Decision entry={entry} />
      {entry.reopened && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-[13px] text-slate-700 flex flex-col gap-1">
          <div>
            Open again: a payment noted from this entry was taken back on its invoice, so {amountText(entry.unallocated, entry.currency)} is free to
            confirm again or set aside.
          </div>
          {entry.allocations.map((a) => (
            <div key={a.paymentId} className="flex flex-wrap gap-2 items-center">
              {invoiceLink(a.invoiceId, a.number)}
              <span className={`tabular-nums ${a.takenBack ? "line-through text-slate-400" : ""}`}>{amountText(a.amount, entry.currency)}</span>
              {a.takenBack && <span className="text-slate-500">taken back on the invoice</span>}
            </div>
          ))}
        </div>
      )}
      {open && !elsewhere && canAct && <DecideForm key={entry.version} statementId={statementId} entry={entry} owed={owed} owedLoading={owedLoading} />}
      {open && (elsewhere || !canAct) && <CandidatesTable entry={entry} />}
    </div>
  );
}
