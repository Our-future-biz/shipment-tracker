"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Segmented } from "antd";
import { CheckOutlined, CloseOutlined } from "@ant-design/icons";
import { LINK_CLASS } from "@/components/linkClass";
import { Pill } from "@/components/Pill";
import { apiErrorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/date";
import { formatAmount } from "@/lib/money";
import { useToast } from "@/lib/toast";
import { useCreditNoteRequests } from "@/hooks/useCreditNoteRequests";
import { BTN, BTN_DANGER, BTN_PRIMARY, CARD, CARD_BAR, CARD_TITLE, HINT, LABEL_TEXT, TD, TEXTAREA, TH } from "@/styles/ui";

// Sales → Managers → Billing approvals: a request to credit an invoice in part, line by line with
// a reason. A manager approves it, which issues the credit note at once, or rejects it with a
// reason; the answer shows on the invoice and goes back to whoever asked.

const HEAD = `${TH} first:pl-4 last:pr-4`;
const CELL = `${TD} !align-top first:pl-4 last:pr-4`;
const money = (amount: string | null, currency: string) => formatAmount(Number(amount ?? 0), currency);

export function BillingApprovals() {
  const toast = useToast();
  const { requests, waiting, isLoading, isError, decide } = useCreditNoteRequests();
  const [view, setView] = useState<"waiting" | "answered">("waiting");
  const [answering, setAnswering] = useState<{ id: string; decision: "approve" | "reject" } | null>(null);
  const [comment, setComment] = useState("");

  const listed = requests.filter((r) => (view === "waiting" ? r.status === "pending" : r.status !== "pending"));
  const empty = isError ? "Could not load the requests." : isLoading ? "Loading…" : view === "waiting" ? "No credit note waiting for a manager." : "No answers in the last 30 days.";

  const start = (id: string, decision: "approve" | "reject") => {
    setAnswering({ id, decision });
    setComment("");
  };
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
        setAnswering(null);
      })
      // Refused (the invoice changed since it was asked, it is credited already): the server says why.
      .catch((e) => toast.error(apiErrorMessage(e)));
  };

  return (
    <section className={`${CARD} overflow-hidden`}>
      <div className={`${CARD_BAR} flex-wrap justify-between`}>
        <div>
          <h3 className={CARD_TITLE}>Billing approvals · partial credit notes</h3>
          <div className={HINT}>Approve to issue the credit note on the lines asked, or reject with a reason. The answer shows on the shipment&apos;s invoices.</div>
        </div>
        <Segmented
          size="small"
          value={view}
          onChange={(v) => setView(v as typeof view)}
          options={[
            { value: "waiting", label: `Waiting (${isError ? "–" : waiting})` },
            { value: "answered", label: "Answered (30 days)" },
          ]}
        />
      </div>
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
            {listed.length === 0 && (
              <tr>
                <td colSpan={6} className={`${TD} !py-8 text-center`}>
                  <span className={isError ? "text-red-600" : "text-slate-400"}>{empty}</span>
                </td>
              </tr>
            )}
            {listed.map((r) => {
              const open = r.status === "pending" && answering?.id === r.id ? answering : null;
              return (
                <Fragment key={r.id}>
                  <tr>
                    <td className={CELL}>
                      <Link href={`/invoicing?shipment=${encodeURIComponent(r.shipmentId)}&tab=documents`} className={`tabular-nums font-semibold ${LINK_CLASS}`}>
                        {r.jobNumber || "Shipment"}
                      </Link>
                      <div className="text-[12px] text-slate-700 tabular-nums">{r.invoiceNumber || "—"}</div>
                      <div className="text-[12px] text-slate-500 max-w-[200px] truncate" title={r.customerName}>
                        {r.customerName || "—"}
                      </div>
                    </td>
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
                    <td className={`${CELL} whitespace-nowrap`}>
                      {r.requestedByName || "—"}
                      <div className="text-[11px] text-slate-400 tabular-nums">{formatDateTime(r.requestedAt)}</div>
                    </td>
                    <td className={CELL}>
                      {r.status === "pending" ? (
                        // stacked, so the column stays narrow and the buttons are never cut off
                        <div className="flex flex-col items-start gap-1.5">
                          <button type="button" onClick={() => start(r.id, "approve")} className={BTN}>
                            <CheckOutlined className="text-[14px]" />
                            Approve
                          </button>
                          <button type="button" onClick={() => start(r.id, "reject")} className={BTN}>
                            <CloseOutlined className="text-[14px]" />
                            Reject
                          </button>
                        </div>
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
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <td colSpan={6} className="px-4 pb-4 pt-2">
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="block flex-1 min-w-[260px]">
                            <span className={`block ${LABEL_TEXT} mb-1`}>{open.decision === "reject" ? "Reason for rejection" : "Comment (optional)"}</span>
                            <textarea
                              autoFocus
                              rows={2}
                              value={comment}
                              maxLength={1000}
                              onChange={(e) => setComment(e.target.value)}
                              aria-label={open.decision === "reject" ? "Reason for rejection" : "Comment"}
                              className={`${TEXTAREA} w-full resize-y`}
                            />
                          </label>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={decide.isPending || (open.decision === "reject" && comment.trim().length < 3)}
                              onClick={save}
                              className={open.decision === "reject" ? BTN_DANGER : BTN_PRIMARY}
                            >
                              {open.decision === "reject" ? "Save rejection" : `Approve and issue the credit note (${money(r.gross, r.currency)})`}
                            </button>
                            <button type="button" onClick={() => setAnswering(null)} className={BTN}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
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
