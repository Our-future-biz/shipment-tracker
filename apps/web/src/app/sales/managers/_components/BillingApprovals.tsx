"use client";

import { Fragment, useState, type ReactNode } from "react";
import Link from "next/link";
import { Segmented } from "antd";
import { CheckOutlined, CloseOutlined } from "@ant-design/icons";
import { LINK_CLASS } from "@/components/linkClass";
import { Pill } from "@/components/Pill";
import { apiErrorMessage } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/date";
import { formatAmount } from "@/lib/money";
import { useToast } from "@/lib/toast";
import { useCreditNoteRequests } from "@/hooks/useCreditNoteRequests";
import { useInvoiceChangeRequests } from "@/hooks/useInvoiceChangeRequests";
import { useSupplierInvoiceNotices } from "@/hooks/useSupplierInvoiceNotices";
import { INVOICE_FIX_LABELS } from "@/app/invoicing/_lib/invoiceFixes";
import { BTN, BTN_DANGER, BTN_PRIMARY, CARD, CARD_BAR, CARD_TITLE, HINT, LABEL_TEXT, TD, TEXTAREA, TH } from "@/styles/ui";

// Sales → Managers → Billing approvals, two kinds of request on an issued invoice:
// - a change on its issue day (what is wrong, and why): approving cancels the invoice, kept on
//   record with no credit note, and its lines go back to be billed to be issued again corrected.
//   It can be answered on the issue day only; one still waiting at midnight (Prague) expires.
// - a partial credit note, line by line with a reason: approving issues the credit note at once.
// Either is rejected with a reason; the answer shows on the invoice and goes back to whoever asked.
// Supplier invoices are approved on Finance → Accounts Payable (Council Outlay 9, D10), where the invoice,
// its lines and its file are; this tab only counts what waits and links there, so it stays the one place to look.

const HEAD = `${TH} first:pl-4 last:pr-4`;
const CELL = `${TD} !align-top first:pl-4 last:pr-4`;
const money = (amount: string | null, currency: string) => formatAmount(Number(amount ?? 0), currency);
const invoiceHref = (shipmentId: string) => `/invoicing?shipment=${encodeURIComponent(shipmentId)}&tab=documents`;

type View = "waiting" | "answered";
type Decision = "approve" | "reject";
type Answering = { id: string; decision: Decision } | null;

export function BillingApprovals() {
  return (
    <div className="flex flex-col gap-4">
      <SupplierInvoiceApprovals />
      <InvoiceChangeApprovals />
      <CreditNoteApprovals />
    </div>
  );
}

/** The card's bar: title, what an answer does, and the Waiting / Answered toggle. */
function SectionBar({ title, hint, view, onView, waiting, isError }: { title: string; hint: ReactNode; view: View; onView: (v: View) => void; waiting: number; isError: boolean }) {
  return (
    <div className={`${CARD_BAR} flex-wrap justify-between`}>
      <div>
        <h3 className={CARD_TITLE}>{title}</h3>
        <div className={HINT}>{hint}</div>
      </div>
      <Segmented
        size="small"
        value={view}
        onChange={(v) => onView(v as View)}
        options={[
          { value: "waiting", label: `Waiting (${isError ? "–" : waiting})` },
          { value: "answered", label: "Answered (30 days)" },
        ]}
      />
    </div>
  );
}

function EmptyRow({ colSpan, isError, text }: { colSpan: number; isError: boolean; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className={`${TD} !py-8 text-center`}>
        <span className={isError ? "text-red-600" : "text-slate-400"}>{text}</span>
      </td>
    </tr>
  );
}

/** The invoice a request is on: the job (to its invoices), the invoice number and the customer. */
function InvoiceCell({ shipmentId, jobNumber, invoiceNumber, customerName, children }: { shipmentId: string; jobNumber: string; invoiceNumber: string; customerName: string; children?: ReactNode }) {
  return (
    <td className={CELL}>
      <Link href={invoiceHref(shipmentId)} className={`tabular-nums font-semibold ${LINK_CLASS}`}>
        {jobNumber || "Shipment"}
      </Link>
      <div className="text-[12px] text-slate-700 tabular-nums">{invoiceNumber || "—"}</div>
      <div className="text-[12px] text-slate-500 max-w-[200px] truncate" title={customerName}>
        {customerName || "—"}
      </div>
      {children}
    </td>
  );
}

function AskedCell({ name, at }: { name: string; at: string }) {
  return (
    <td className={`${CELL} whitespace-nowrap`}>
      {name || "—"}
      <div className="text-[11px] text-slate-400 tabular-nums">{formatDateTime(at)}</div>
    </td>
  );
}

// Stacked, so the column stays narrow and the buttons are never cut off.
function DecideButtons({ onStart }: { onStart: (decision: Decision) => void }) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <button type="button" onClick={() => onStart("approve")} className={BTN}>
        <CheckOutlined className="text-[14px]" />
        Approve
      </button>
      <button type="button" onClick={() => onStart("reject")} className={BTN}>
        <CloseOutlined className="text-[14px]" />
        Reject
      </button>
    </div>
  );
}

/** The inline answer under a request: a comment (a reason, to reject) and the button that says what it does. */
function AnswerRow({ colSpan, decision, comment, onComment, saving, approveLabel, onSave, onCancel }: {
  colSpan: number;
  decision: Decision;
  comment: string;
  onComment: (v: string) => void;
  saving: boolean;
  approveLabel: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  const reject = decision === "reject";
  return (
    <tr className="border-b border-slate-200 bg-slate-50">
      <td colSpan={colSpan} className="px-4 pb-4 pt-2">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block flex-1 min-w-[260px]">
            <span className={`block ${LABEL_TEXT} mb-1`}>{reject ? "Reason for rejection" : "Comment (optional)"}</span>
            <textarea
              autoFocus
              rows={2}
              value={comment}
              maxLength={1000}
              onChange={(e) => onComment(e.target.value)}
              aria-label={reject ? "Reason for rejection" : "Comment"}
              className={`${TEXTAREA} w-full resize-y`}
            />
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={saving || (reject && comment.trim().length < 3)} onClick={onSave} className={reject ? BTN_DANGER : BTN_PRIMARY}>
              {reject ? "Save rejection" : approveLabel}
            </button>
            <button type="button" onClick={onCancel} className={BTN}>
              Cancel
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

/** Which request is being answered, and its comment. */
function useAnswering() {
  const [answering, setAnswering] = useState<Answering>(null);
  const [comment, setComment] = useState("");
  const start = (id: string, decision: Decision) => {
    setAnswering({ id, decision });
    setComment("");
  };
  return { answering, comment, setComment, start, stop: () => setAnswering(null) };
}

/** Supplier invoices waiting for a manager: the count, and the way to Accounts Payable's To approve tab (D10). */
function SupplierInvoiceApprovals() {
  const { toApprove, isLoading, isError } = useSupplierInvoiceNotices();
  // Shown at 0 too, as the other sections show an empty list: a manager sees nothing waits, not a missing card.
  const count = isError ? "–" : isLoading ? "…" : toApprove;
  return (
    <section className={`${CARD} overflow-hidden`}>
      <div className={`${CARD_BAR} flex-wrap justify-between`}>
        <div>
          <h3 className={CARD_TITLE}>Supplier invoices to approve: {count}</h3>
          <div className={isError ? "text-[12px] text-red-600" : HINT}>
            {isError ? "Could not load the count." : "Approved or refused on Accounts Payable, where the invoice, its lines and its file are."}
          </div>
        </div>
        <Link href="/accounts-payable" className={`${BTN} !text-slate-700 hover:!text-slate-900`}>
          Open Accounts Payable
        </Link>
      </div>
    </section>
  );
}

const CHANGE_STATUS: Record<"approved" | "rejected" | "withdrawn" | "expired", { label: string; tone: "green" | "red" | "slate" }> = {
  // The approved outcome: the invoice is cancelled, to be issued again corrected.
  approved: { label: "Cancelled", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  withdrawn: { label: "Withdrawn", tone: "slate" },
  expired: { label: "Expired", tone: "slate" },
};

function InvoiceChangeApprovals() {
  const toast = useToast();
  const { requests, waiting, isLoading, isError, decide } = useInvoiceChangeRequests();
  const [view, setView] = useState<View>("waiting");
  const { answering, comment, setComment, start, stop } = useAnswering();

  const listed = requests.filter((r) => (view === "waiting" ? r.status === "pending" : r.status !== "pending"));
  const empty = isError ? "Could not load the requests." : isLoading ? "Loading…" : view === "waiting" ? "No invoice change waiting for a manager." : "No answers in the last 30 days.";

  const save = () => {
    if (!answering) return;
    decide
      .mutateAsync({ id: answering.id, decision: answering.decision, comment })
      .then(({ request }) => {
        toast.success(
          answering.decision === "approve"
            ? `Approved: ${request.invoiceNumber || "the invoice"} is cancelled; its lines are back to be billed, to be issued again corrected`
            : "Rejected: the invoice stays as it was",
        );
        stop();
      })
      // Refused (expired at midnight, the invoice changed since it was asked): the server says why.
      .catch((e) => toast.error(apiErrorMessage(e)));
  };

  return (
    <section className={`${CARD} overflow-hidden`}>
      <SectionBar
        title="Invoice changes (issue day)"
        hint="Approve to cancel the invoice (kept on record, no credit note): its lines go back to be billed and it is issued again corrected under the next number. A request can be answered only on the invoice's issue day; one still waiting at midnight expires."
        view={view}
        onView={setView}
        waiting={waiting}
        isError={isError}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[940px] border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={HEAD}>Invoice</th>
              <th className={HEAD}>What is wrong</th>
              <th className={HEAD}>Why</th>
              <th className={HEAD}>Asked</th>
              <th className={HEAD}>Answer</th>
            </tr>
          </thead>
          <tbody>
            {listed.length === 0 && <EmptyRow colSpan={5} isError={isError} text={empty} />}
            {listed.map((r) => {
              const open = r.status === "pending" && answering?.id === r.id ? answering : null;
              const answered = r.status === "pending" ? null : CHANGE_STATUS[r.status];
              return (
                <Fragment key={r.id}>
                  <tr>
                    <InvoiceCell shipmentId={r.shipmentId} jobNumber={r.jobNumber} invoiceNumber={r.invoiceNumber} customerName={r.customerName}>
                      <div className="text-[12px] font-semibold text-slate-900 tabular-nums whitespace-nowrap">{money(r.gross, r.currency)} gross</div>
                      {/* A waiting request's invoice is issued today by definition; an answered one shows its day. */}
                      {r.status !== "pending" && r.issueDate && <div className="text-[11px] text-slate-400 tabular-nums">issued {formatDate(r.issueDate)}</div>}
                    </InvoiceCell>
                    <td className={CELL}>
                      <div className="flex flex-wrap gap-1 max-w-[240px]">
                        {r.fixes.length === 0 ? "—" : r.fixes.map((f) => (
                          <Pill key={f} tone="slate">
                            {INVOICE_FIX_LABELS[f] ?? f}
                          </Pill>
                        ))}
                      </div>
                    </td>
                    <td className={`${CELL} min-w-[160px] max-w-[260px] whitespace-pre-wrap`}>{r.reason}</td>
                    <AskedCell name={r.requestedByName} at={r.requestedAt} />
                    <td className={CELL}>
                      {!answered ? (
                        <DecideButtons onStart={(decision) => start(r.id, decision)} />
                      ) : (
                        <div>
                          <Pill tone={answered.tone}>{answered.label}</Pill>
                          {r.status === "expired" ? (
                            <div className="text-[11px] text-slate-400 mt-1 tabular-nums">Not answered on the issue day{r.decidedAt ? ` · ${formatDateTime(r.decidedAt)}` : ""}</div>
                          ) : (
                            <div className="text-[11px] text-slate-400 mt-1 tabular-nums">
                              {r.decidedByName || "—"}
                              {r.decidedAt ? ` · ${formatDateTime(r.decidedAt)}` : ""}
                              {r.selfDecision ? (r.status === "approved" ? " · self-approval" : " · self-decision") : ""}
                            </div>
                          )}
                          {r.comment && <div className="text-[12px] text-slate-700 mt-1 max-w-[280px] whitespace-pre-wrap">{r.comment}</div>}
                        </div>
                      )}
                    </td>
                  </tr>
                  {open && (
                    <AnswerRow
                      colSpan={5}
                      decision={open.decision}
                      comment={comment}
                      onComment={setComment}
                      saving={decide.isPending}
                      approveLabel={`Approve and cancel ${r.invoiceNumber || "the invoice"} (it is issued again corrected)`}
                      onSave={save}
                      onCancel={stop}
                    />
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CreditNoteApprovals() {
  const toast = useToast();
  const { requests, waiting, isLoading, isError, decide } = useCreditNoteRequests();
  const [view, setView] = useState<View>("waiting");
  const { answering, comment, setComment, start, stop } = useAnswering();

  const listed = requests.filter((r) => (view === "waiting" ? r.status === "pending" : r.status !== "pending"));
  const empty = isError ? "Could not load the requests." : isLoading ? "Loading…" : view === "waiting" ? "No credit note waiting for a manager." : "No answers in the last 30 days.";

  const save = () => {
    if (!answering) return;
    decide
      .mutateAsync({ id: answering.id, decision: answering.decision, comment })
      .then(({ request }) => {
        toast.success(
          answering.decision === "approve"
            ? `Approved: ${request.creditNoteNumber ? `credit note ${request.creditNoteNumber}` : "the credit note"} issued on ${request.invoiceNumber}`
            : "Rejected: the invoice stays as it was",
        );
        stop();
      })
      // Refused (the invoice changed since it was asked, it is credited already): the server says why.
      .catch((e) => toast.error(apiErrorMessage(e)));
  };

  return (
    <section className={`${CARD} overflow-hidden`}>
      <SectionBar
        title="Partial credit notes"
        hint="Approve to issue the credit note on the lines asked, or reject with a reason. The answer shows on the shipment's invoices."
        view={view}
        onView={setView}
        waiting={waiting}
        isError={isError}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[940px] border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={HEAD}>Invoice</th>
              <th className={HEAD}>Lines to credit</th>
              <th className={HEAD}>Comes off</th>
              <th className={HEAD}>Why</th>
              <th className={HEAD}>Asked</th>
              <th className={HEAD}>Answer</th>
            </tr>
          </thead>
          <tbody>
            {listed.length === 0 && <EmptyRow colSpan={6} isError={isError} text={empty} />}
            {listed.map((r) => {
              const open = r.status === "pending" && answering?.id === r.id ? answering : null;
              return (
                <Fragment key={r.id}>
                  <tr>
                    <InvoiceCell shipmentId={r.shipmentId} jobNumber={r.jobNumber} invoiceNumber={r.invoiceNumber} customerName={r.customerName} />
                    <td className={CELL}>
                      <ul className="m-0 p-0 list-none flex flex-col gap-0.5 max-w-[260px]">
                        {r.lines.map((l) => (
                          <li key={l.lineId} className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0 text-slate-700 truncate" title={l.description}>
                              {l.description || "—"}
                            </span>
                            <span className="shrink-0 tabular-nums text-slate-900">
                              {money(l.amount, l.unitCurrency)}
                              {l.unitCurrency !== r.currency && l.net && <span className="text-slate-500"> ({money(l.net, r.currency)})</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className={`${CELL} whitespace-nowrap tabular-nums`}>
                      <div className="font-semibold text-red-600">{money(r.gross, r.currency)} gross</div>
                      <div className="text-[12px] text-slate-500">
                        {money(r.net, r.currency)} net · {money(r.vat, r.currency)} VAT
                      </div>
                      <div className="text-[12px] text-slate-500">of {money(r.invoiceGross, r.currency)} invoiced</div>
                    </td>
                    <td className={`${CELL} min-w-[160px] max-w-[220px] whitespace-pre-wrap`}>{r.reason}</td>
                    <AskedCell name={r.requestedByName} at={r.requestedAt} />
                    <td className={CELL}>
                      {r.status === "pending" ? (
                        <DecideButtons onStart={(decision) => start(r.id, decision)} />
                      ) : (
                        <div>
                          <Pill tone={r.status === "approved" ? "green" : r.status === "rejected" ? "red" : "slate"}>
                            {r.status === "approved" ? "Approved" : r.status === "rejected" ? "Rejected" : "Withdrawn"}
                          </Pill>
                          {r.status === "approved" && r.creditNoteNumber && <div className="text-[12px] font-semibold text-slate-900 mt-1 tabular-nums">{r.creditNoteNumber}</div>}
                          <div className="text-[11px] text-slate-400 mt-1 tabular-nums">
                            {r.decidedByName || "—"}
                            {r.decidedAt ? ` · ${formatDateTime(r.decidedAt)}` : ""}
                            {r.selfDecision ? " · self-approval" : ""}
                          </div>
                          {r.comment && <div className="text-[12px] text-slate-700 mt-1 max-w-[280px] whitespace-pre-wrap">{r.comment}</div>}
                        </div>
                      )}
                    </td>
                  </tr>
                  {open && (
                    <AnswerRow
                      colSpan={6}
                      decision={open.decision}
                      comment={comment}
                      onComment={setComment}
                      saving={decide.isPending}
                      approveLabel={`Approve and issue the credit note (${money(r.gross, r.currency)})`}
                      onSave={save}
                      onCancel={stop}
                    />
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
