"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Alert, Drawer, Spin, Tooltip } from "antd";
import { FilePdfOutlined } from "@ant-design/icons";
import { ChipList } from "@/components/finance/ChipList";
import { Fact, Section } from "@/components/finance/DrawerParts";
import { Pill } from "@/components/Pill";
import { useFilePreview } from "@/hooks/useFilePreview";
import { invoicePdfSource } from "@/hooks/useInvoiceDocs";
import { useReceivable, useReceivableActions, useReceivableMail, useReceivableNotices, useReceivableSeen, type ReceivableDetail } from "@/hooks/useReceivables";
import { markChips, REMINDER_LEVEL_LABEL, statusLabel, statusTitle, statusTone } from "@/lib/accountsReceivable";
import { amountsText } from "@/lib/amounts";
import { apiErrorMessage, isNotFound, type interfaces } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/date";
import { EMPTY, HINT, LINK, MODAL_TITLE, REF, TD, TH } from "@/styles/ui";
import { ConfirmLine, ReceivableActions, TakeBackPayment, type Actions } from "./ReceivableActions";
import { StatementMenu } from "./StatementMenu";
import {
  amountText,
  bankStatementHref,
  customerHref,
  EMAIL_OFF_TEXT,
  EVENT_LABELS,
  eventDetail,
  eventLabel,
  historyEntries,
  invoicingHref,
  isWriteOffKind,
  issuerName,
  leftToPaySum,
  LINE_KIND_LABEL,
  lineState,
  mailLine,
  NO_REMINDER_CONTACT,
  NOTE_LABELS,
  REMINDERS_CANNOT_GO_OUT,
  remindersBlocked,
  shipmentHref,
  showsPromise,
  takenBackText,
  waitingTotal,
  type ReceivableMail,
  type ReceivableRow,
} from "../_lib/receivables";

// One customer invoice on a row click (or ?invoice=<id> from the customer's page, the job and the bell): its facts,
// what is left to pay and how, its lines, credit notes, payments, chasing, the customer's terms and limit, the history,
// and what may be done to it. A credit note is never issued here: Invoicing issues it (the page). Step 7: write-offs
// and bank charges with their reason and who confirmed them, one bank payment's reference, the customer's statement,
// and the e-mails the app sent about the invoice in its history.

const none = <span className={EMPTY}>—</span>;
const HEAD = `${TH} first:pl-3 last:pr-3`;
const CELL = `${TD} first:pl-3 last:pr-3`;
const NUM = "!text-right tabular-nums whitespace-nowrap";

/** The stored, official PDF of an invoice or credit note, in the app's preview (as Invoicing opens it). */
function PdfLink({ id, number, preview }: { id: string; number: string; preview: ReturnType<typeof useFilePreview> }) {
  return (
    <button type="button" onClick={() => void preview.open(invoicePdfSource({ id, number }))} className={`inline-flex items-center gap-1.5 bg-transparent border-0 p-0 cursor-pointer font-medium ${LINK}`}>
      <FilePdfOutlined />
      {number}.pdf
    </button>
  );
}

/** Who issued a credit note (D25): the person's name, the e-mail on hover (the app has no page of a user to link to). */
function IssuedBy({ note }: { note: Pick<interfaces.ReceivableCreditNoteItem, "issuedBy" | "issuedByName"> }) {
  const name = issuerName(note);
  if (!name) return <span className="text-slate-400">who issued it is not known</span>;
  return note.issuedBy && note.issuedBy !== name ? (
    <Tooltip title={note.issuedBy}>
      <span className="text-slate-700 underline decoration-dotted decoration-slate-400 underline-offset-2 cursor-help">{name}</span>
    </Tooltip>
  ) : (
    <span className="text-slate-700">{name}</span>
  );
}

function Facts({ detail, preview }: { detail: ReceivableDetail; preview: ReturnType<typeof useFilePreview> }) {
  const r = detail.row;
  const waiting = waitingTotal(detail.payments);
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
      <Fact label="Customer">
        {r.customerId ? (
          <Link href={customerHref(r.customerId)} className={`font-medium ${LINK}`}>
            {r.customer || "The customer"}
          </Link>
        ) : (
          <span className="font-medium text-slate-900">{r.customer || "—"}</span>
        )}
      </Fact>
      <Fact label="Invoice number">
        <span className={`${REF} font-semibold text-slate-900`}>{r.number || "—"}</span>
      </Fact>
      <Fact label="Job">
        {r.shipmentId ? (
          <Link href={shipmentHref(r.shipmentId)} className={`${REF} font-medium ${LINK}`}>
            {r.jobNumber || "The job"}
          </Link>
        ) : (
          none
        )}
      </Fact>
      <Fact label="Issued · Tax date (DUZP)">
        <span className="tabular-nums">
          {formatDate(r.issueDate)} · {r.duzp ? formatDate(r.duzp) : "—"}
        </span>
      </Fact>
      <Fact label="Due">
        {r.status === "cancelled" ? (
          <span className="text-slate-500">Cancelled: not owed</span>
        ) : (
          <>
            <span className="tabular-nums">{formatDate(r.dueDate)}</span>
            {r.daysOverdue > 0 && <span className="text-red-600 font-medium"> · {r.daysOverdue} {r.daysOverdue === 1 ? "day" : "days"} overdue</span>}
          </>
        )}
        {/* Shown beside the due day, so a wrong reading of the terms is visible (the Rules, "The due day"). */}
        <div className={HINT}>Terms: {r.paymentTerms || "none on the invoice"}</div>
      </Fact>
      <Fact label="Total">
        <span className="tabular-nums">
          {amountText(r.net, r.currency)} + {amountText(r.vat, r.currency)} VAT = <span className="font-semibold text-slate-900">{amountText(r.gross, r.currency)}</span>
        </span>
        <div className={HINT}>
          {detail.lines.length} {detail.lines.length === 1 ? "line" : "lines"} · {amountText(r.grossCzk, "CZK")} as the invoice states it in CZK
        </div>
      </Fact>
      <Fact label="Left to pay">
        <span className={`tabular-nums font-semibold ${r.leftToPay < 0 ? "text-amber-700" : r.leftToPay > 0 ? "text-slate-900" : "text-slate-500"}`}>
          {r.leftToPay < 0 ? `${amountText(-r.leftToPay, r.currency)} to refund` : amountText(r.leftToPay, r.currency)}
        </span>
        <div className={`${HINT} tabular-nums`}>
          = {leftToPaySum(r)}
          {r.status === "cancelled" ? " (cancelled: the invoice itself is not owed)" : ""}
        </div>
        {waiting > 0 && <div className="text-[12px] text-amber-700 tabular-nums">{amountText(waiting, r.currency)} to close waits for a second manager: not counted yet</div>}
      </Fact>
      <Fact label="Document">
        <PdfLink id={r.id} number={r.number} preview={preview} />
        <div className={HINT}>{r.issuedBy ? `issued by ${r.issuedBy}` : "who issued it is not known"}</div>
      </Fact>
      {showsPromise(r) && (
        <Fact label="Promised to pay by">
          <span className={`tabular-nums ${r.marks.includes("promise_broken") ? "text-red-600 font-medium" : ""}`}>{formatDate(r.promisedOn)}</span>
          {r.marks.includes("promise_broken") && <span className="text-red-600"> · passed</span>}
        </Fact>
      )}
      <Fact label="People">
        <div>Person in Charge: {r.personInCharge || "—"}</div>
        {r.holidayCover && <div>Holiday Cover: {r.holidayCover}</div>}
        <div>Sales Owner: {r.salesOwner || "—"}</div>
      </Fact>
    </div>
  );
}

function Lines({ lines, currency }: { lines: interfaces.ReceivableLineItem[]; currency: string }) {
  if (!lines.length) return <div className={HINT}>No lines.</div>;
  return (
    <div className="rounded-lg border border-slate-200 overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-[13px]">
        <thead>
          <tr>
            <th className={HEAD}>Description</th>
            <th className={`${HEAD} !text-right`}>Qty</th>
            <th className={`${HEAD} !text-right`}>Unit price</th>
            <th className={`${HEAD} !text-right`}>Net</th>
            <th className={`${HEAD} !text-right`}>VAT</th>
            <th className={`${HEAD} !text-right`}>With VAT</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, at) => (
            <tr key={at}>
              <td className={`${CELL} max-w-[260px]`}>
                <span className="block truncate" title={l.description}>
                  {l.description || none}
                </span>
              </td>
              <td className={`${CELL} ${NUM}`}>{l.qty}</td>
              <td className={`${CELL} ${NUM}`}>{amountText(l.unitPrice, l.currency)}</td>
              <td className={`${CELL} ${NUM}`}>{amountText(l.net, currency)}</td>
              <td className={`${CELL} ${NUM}`}>
                {amountText(l.vat, currency)}
                <div className="text-[11px] text-slate-500">{l.vatRate}%</div>
              </td>
              <td className={`${CELL} ${NUM} font-semibold text-slate-900`}>{amountText(l.gross, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreditNotes({ notes, currency, preview }: { notes: interfaces.ReceivableCreditNoteItem[]; currency: string; preview: ReturnType<typeof useFilePreview> }) {
  if (!notes.length) return <div className={HINT}>No credit note on this invoice.</div>;
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-2">
      {notes.map((c) => (
        <li key={c.id} className="rounded-lg border border-slate-200 px-3 py-2 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`${REF} font-semibold text-slate-900`}>{c.number}</span>
            <span className="tabular-nums text-slate-500">{formatDate(c.issueDate)}</span>
            <span className="tabular-nums font-semibold text-slate-900">{amountText(c.gross, currency)}</span>
            {c.full && <Pill tone="slate">The whole invoice</Pill>}
            <span className="ml-auto">
              <PdfLink id={c.id} number={c.number} preview={preview} />
            </span>
          </div>
          <div className="text-[12px] text-slate-500">
            issued by <IssuedBy note={c} />
          </div>
          {c.reason && <div className="mt-1 whitespace-pre-wrap text-slate-700">“{c.reason}”</div>}
        </li>
      ))}
    </ul>
  );
}

function Payments({ detail, actions }: { detail: ReceivableDetail; actions: Actions }) {
  const r = detail.row;
  if (!detail.payments.length) return <div className={HINT}>No payment noted.</div>;
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-2">
      {detail.payments.map((p) => {
        const closing = isWriteOffKind(p.kind);
        const day = p.paidOn ? formatDate(p.paidOn) : "";
        const what = `${LINE_KIND_LABEL[p.kind]} of ${amountText(p.amount, r.currency)}${day ? (closing ? ` written on ${day}` : ` paid on ${day}`) : ""}`;
        const state = lineState(p);
        return (
          <li key={p.id} className={`rounded-lg border px-3 py-2 text-[13px] ${p.takenBack ? "bg-slate-50 border-slate-200" : p.waiting ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`tabular-nums font-semibold ${p.takenBack ? "text-slate-400 line-through" : "text-slate-900"}`}>{amountText(p.amount, r.currency)}</span>
              <span className="tabular-nums text-slate-700">{p.paidOn ? formatDate(p.paidOn) : "Paid before Accounts Receivable, day not known"}</span>
              {p.kind === "carried_over" && (
                <Tooltip title="The invoice was marked Paid on the customer's page before this page kept payments">
                  <Pill tone="slate">Carried over</Pill>
                </Tooltip>
              )}
              {closing && (
                <Tooltip title={p.kind === "write_off" ? "Closes what is left that the customer will not pay: not money paid" : "What the bank kept of the customer's payment: not money paid"}>
                  <Pill tone="slate">{LINE_KIND_LABEL[p.kind]}</Pill>
                </Tooltip>
              )}
              {p.waiting && !p.takenBack && (
                <Tooltip title="It counts only once another manager confirms it">
                  <Pill tone="amber">Waiting for a second manager</Pill>
                </Tooltip>
              )}
              {p.confirmed?.self && !p.takenBack && (
                <Tooltip title="Confirmed by the manager who wrote it, as the company has no other manager">
                  <Pill tone="amber">self-confirmed</Pill>
                </Tooltip>
              )}
              {p.takenBack && <Pill tone="amber">Taken back</Pill>}
              {detail.canAct && !p.takenBack && (
                <span className="ml-auto flex items-center gap-3">
                  {p.waiting && p.canConfirm && <ConfirmLine detail={detail} actions={actions} line={p} label={what} />}
                  <TakeBackPayment detail={detail} actions={actions} line={p} label={what} />
                </span>
              )}
            </div>
            <div className="text-[12px] text-slate-500 tabular-nums">
              {closing ? "written" : "noted"} {formatDateTime(p.at)}
              {p.by ? ` · ${p.by}` : ""}
              {p.bankRef && <span> · bank reference <span className={REF}>{p.bankRef}</span></span>}
            </div>
            {p.reason && <div className="mt-1 whitespace-pre-wrap text-slate-700">“{p.reason}”</div>}
            {p.note && <div className="mt-1 whitespace-pre-wrap text-slate-700">{p.note}</div>}
            {state && !p.waiting && (
              <div className="mt-1 text-[12px] text-slate-600 tabular-nums">
                {state}
                {p.confirmed ? ` · ${formatDateTime(p.confirmed.at)}` : ""}
              </div>
            )}
            {p.waiting && !p.takenBack && !p.canConfirm && detail.canAct && (
              <div className="mt-1 text-[12px] text-amber-700">Another manager confirms it: you wrote it.</div>
            )}
            {p.takenBack && (
              <div className="mt-1 text-[12px] text-slate-600">
                Taken back {formatDateTime(p.takenBack.at)}
                {p.takenBack.by ? ` · ${p.takenBack.by}` : ""}
                {/* P8: noted by mistake, or reversed on a day (it counted as paid until then at month-end). */}
                {!isWriteOffKind(p.kind) && ` · ${takenBackText(p.takenBack)}`}
                {p.takenBack.reason && <span className="whitespace-pre-wrap"> · “{p.takenBack.reason}”</span>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Chasing({ notes }: { notes: interfaces.ReceivableNoteItem[] }) {
  if (!notes.length) return <div className={HINT}>No note, promise, dispute or reminder yet.</div>;
  return (
    <ol className="m-0 p-0 list-none flex flex-col gap-2">
      {notes.map((n) => (
        <li key={n.id} className="rounded-lg border border-slate-200 px-3 py-2 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">
              {n.kind === "reminder" && n.reminderLevel ? REMINDER_LEVEL_LABEL[Math.min(n.reminderLevel, 3) as 1 | 2 | 3] : NOTE_LABELS[n.kind]}
            </span>
            {n.kind === "promise" && n.promisedOn && <span className="tabular-nums">to pay by {formatDate(n.promisedOn)}</span>}
            {n.kind === "reminder" && n.recipient && <span>recorded as sent to {n.recipient}</span>}
          </div>
          {n.text && <div className="mt-1 whitespace-pre-wrap text-slate-700">{n.kind === "dispute" || n.kind === "dispute_closed" ? `“${n.text}”` : n.text}</div>}
          <div className="text-[12px] text-slate-500 tabular-nums">
            {formatDateTime(n.at)}
            {n.by ? ` · ${n.by}` : ""}
          </div>
        </li>
      ))}
    </ol>
  );
}

function CustomerFacts({ detail, autoRemindersSince }: { detail: ReceivableDetail; autoRemindersSince: string | null }) {
  const f = detail.customerFacts;
  if (!f) return <div className={HINT}>The customer&apos;s terms and limit could not be read just now.</div>;
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
      <Fact label="Payment terms">{f.paymentTerms || none}</Fact>
      <Fact label="Credit limit">{f.creditLimit > 0 ? amountText(f.creditLimit, f.creditCurrency) : "None set"}</Fact>
      <Fact label="Unpaid in all">
        <span className="tabular-nums">{amountsText(f.unpaid)}</span>
        <div className={HINT}>Per currency, never converted</div>
      </Fact>
      <Fact label="Overdue invoices">
        <span className={f.overdueCount > 0 ? "text-red-600 font-medium" : ""}>{f.overdueCount}</span>
      </Fact>
      <Fact label="Sales Owner">{f.salesOwner || none}</Fact>
      <Fact label="Reminders go to">
        {f.reminderTo ? (
          <>
            {f.reminderTo.name || f.reminderTo.email}
            <div className={HINT}>
              {f.reminderTo.email}
              {f.reminderTo.role ? ` · ${f.reminderTo.role}` : ""}
            </div>
          </>
        ) : (
          <>
            <span className="text-slate-500">{NO_REMINDER_CONTACT}</span>
            {/* The daily run skips such a customer with only a line in the server's log (user council A7). */}
            {remindersBlocked(detail.row, f.reminderTo, autoRemindersSince) && <div className="text-[12px] font-medium text-red-600 mt-0.5">{REMINDERS_CANNOT_GO_OUT}</div>}
          </>
        )}
      </Fact>
    </div>
  );
}

function History({ row, creditNotes, events }: { row: ReceivableRow; creditNotes: interfaces.ReceivableCreditNoteItem[]; events: interfaces.ReceivableEventItem[] }) {
  // The issue itself is the invoice's own record, not an event of its receivable, and each credit note's issue is its
  // own record too, on its day, with who issued it (D25): all with the events, in one time order (A13).
  return (
    <ol className="m-0 p-0 list-none flex flex-col gap-2 border-l-2 border-slate-200 pl-3">
      {historyEntries(row.issueDate, creditNotes, events).map((h) => {
        if (h.kind === "issued") {
          return (
            <li key="issued" className="text-[13px]">
              <span className="font-semibold text-slate-900">{EVENT_LABELS.issued}</span>
              <div className="text-[12px] text-slate-500 tabular-nums">
                {formatDate(row.issueDate)}
                {row.issuedBy ? ` · ${row.issuedBy}` : ""}
              </div>
            </li>
          );
        }
        if (h.kind === "credit_note") {
          const c = h.note;
          return (
            <li key={c.id} className="text-[13px]">
              <span className="font-semibold text-slate-900">
                Credit note <span className={REF}>{c.number}</span>
              </span>
              <span className="text-slate-700">
                {" "}
                issued by <IssuedBy note={c} />
              </span>
              {c.reason && <span className="whitespace-pre-wrap text-slate-700"> — “{c.reason}”</span>}
              <div className="text-[12px] text-slate-500 tabular-nums">
                {formatDate(c.issueDate)} · {amountText(c.gross, row.currency)}
              </div>
            </li>
          );
        }
        const e = h.event;
        const detail = eventDetail(e, row.currency);
        return (
          <li key={e.id} className="text-[13px]">
            <span className="font-semibold text-slate-900">{eventLabel(e)}</span>
            {detail && <span className="text-slate-700"> · {detail}</span>}
            <div className="text-[12px] text-slate-500 tabular-nums">
              {formatDateTime(e.at)}
              {e.by ? ` · ${e.by}` : ""}
            </div>
            {e.reason && <div className="whitespace-pre-wrap text-slate-700">“{e.reason}”</div>}
          </li>
        );
      })}
    </ol>
  );
}

/** The e-mails the app sent (or tried to send) about this invoice: its reminders, newest first (step 7). */
function Mails({ invoiceId }: { invoiceId: string }) {
  const query = useReceivableMail({ invoiceId });
  const mails: ReceivableMail[] = query.data?.mails ?? [];
  if (query.isLoading) return null;
  if (query.isError) return <div className={HINT}>Could not read the e-mails the app sent: {apiErrorMessage(query.error)}</div>;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[12px] font-semibold text-slate-700">E-mails from the app</div>
      {!mails.length ? (
        <div className={HINT}>{query.data?.emailOn === false ? `${EMAIL_OFF_TEXT}: none was sent about this invoice.` : "None sent about this invoice."}</div>
      ) : (
        <ol className="m-0 p-0 list-none flex flex-col gap-1.5">
          {mails.map((m) => {
            const line = mailLine(m);
            return (
              <li key={m.id} className="text-[13px]">
                <span className={`font-semibold ${line.failed ? "text-red-700" : "text-slate-900"}`}>{line.title}</span>
                {line.failed && (
                  <span className="ml-1.5">
                    <Pill tone="red">Failed</Pill>
                  </span>
                )}
                {line.detail && <span className="text-slate-700"> · {line.detail}</span>}
                <div className="text-[12px] text-slate-500 tabular-nums">{formatDateTime(m.at)}</div>
              </li>
            );
          })}
        </ol>
      )}
      {query.data?.emailOn === false && mails.length > 0 && <div className={HINT}>{EMAIL_OFF_TEXT} now.</div>}
    </div>
  );
}

/** `autoRemindersSince`: the list's own (null while the automatic reminders are off): whether to warn that they skip the customer. */
export function ReceivableDrawer({ id, onClose, autoRemindersSince = null }: { id: string | null; onClose: () => void; autoRemindersSince?: string | null }) {
  const query = useReceivable(id);
  const actions = useReceivableActions();
  const preview = useFilePreview();
  const detail = query.data;
  const row = detail?.row;

  // Opened is seen: the bell stops telling of this invoice (D18). Once per invoice, not on every refetch.
  const notices = useReceivableNotices();
  const { mutate: markSeen } = useReceivableSeen();
  const told = useRef<string | null>(null);
  useEffect(() => {
    if (!id || !row || told.current === id) return;
    const keys = (notices.data?.notices ?? []).filter((n) => n.invoiceId === id).map((n) => n.key);
    if (!notices.data) return;
    told.current = id;
    if (keys.length) markSeen(keys);
  }, [id, row, notices.data, markSeen]);

  const chips = row ? markChips(row) : [];
  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      width={780}
      destroyOnHidden
      title={
        row ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className={MODAL_TITLE}>
              <span className={REF}>{row.number}</span> · {row.customer || "Customer invoice"}
            </span>
            <Tooltip title={statusTitle(row.status)}>
              <Pill tone={statusTone(row.status)}>{statusLabel(row.status)}</Pill>
            </Tooltip>
          </div>
        ) : (
          "Customer invoice"
        )
      }
    >
      {query.isLoading && (
        <div className="py-10 flex justify-center">
          <Spin />
        </div>
      )}
      {query.isError && !detail && (
        <Alert type="error" showIcon message={isNotFound(query.error) ? "This customer invoice is not there." : `Could not load the invoice: ${apiErrorMessage(query.error)}`} />
      )}
      {detail && row && (
        <div className="flex flex-col gap-6">
          {chips.length > 0 && <ChipList chips={chips} empty={false} />}
          <Facts detail={detail} preview={preview} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            {row.shipmentId && (
              <Link href={shipmentHref(row.shipmentId)} className={LINK}>
                Open the job
              </Link>
            )}
            {row.customerId && (
              <Link href={customerHref(row.customerId)} className={LINK}>
                Open the customer
              </Link>
            )}
            {/* A credit note is issued in Invoicing, never here. */}
            {row.shipmentId && (
              <Link href={invoicingHref(row.shipmentId)} className={LINK}>
                Open in Invoicing
              </Link>
            )}
          </div>
          {/* A payment read from a bank statement may be this invoice's (mock test council X5): said before anyone chases it. */}
          {detail.paymentWaiting && (
            <Alert
              type="info"
              showIcon
              message={detail.paymentWaiting.text}
              description={
                detail.canAct ? (
                  <Link href={bankStatementHref(detail.paymentWaiting.statementId)} className={LINK}>
                    Open the bank statement
                  </Link>
                ) : undefined
              }
            />
          )}
          <Section title="Actions">
            <ReceivableActions key={row.id} detail={detail} actions={actions} />
          </Section>
          <Section title={`Lines (${detail.lines.length})`}>
            <Lines lines={detail.lines} currency={row.currency} />
          </Section>
          <Section title={`Credit notes (${detail.creditNotes.length})`}>
            <CreditNotes notes={detail.creditNotes} currency={row.currency} preview={preview} />
          </Section>
          <Section title="Payments">
            <Payments detail={detail} actions={actions} />
          </Section>
          <Section title="Chasing">
            <Chasing notes={detail.notes} />
          </Section>
          <Section
            title="Customer"
            extra={row.customerId ? <StatementMenu customerId={row.customerId} customer={row.customer} currency={row.currency} canSend={detail.canAct} small /> : undefined}
          >
            <CustomerFacts detail={detail} autoRemindersSince={autoRemindersSince} />
          </Section>
          <Section title="History">
            <History row={row} creditNotes={detail.creditNotes} events={detail.events} />
            <Mails invoiceId={row.id} />
          </Section>
        </div>
      )}
      {preview.modal}
    </Drawer>
  );
}
