"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { InputNumber, Segmented } from "antd";
import { CheckOutlined, CloseOutlined, MessageOutlined } from "@ant-design/icons";
import { useToast } from "@/lib/toast";
import { apiErrorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/date";
import { formatAmount } from "@/lib/money";
import { formatPercent } from "@/lib/number";
import { useMarginInquiries, type MarginInquiryRow } from "@/hooks/useMarginInquiries";
import type { SalesCockpitMode } from "@/hooks/useSalesManagersCockpit";
import { useWarehouseInquiries } from "@/hooks/useWarehouseInquiries";
import { officeTime } from "../../_lib/officeTime";
import { quoteChatHref, quoteHref } from "../../_lib/quoteHref";
import { floorText, marginText } from "../../_lib/roadQuote";
import { serviceTypeLabel } from "../../_lib/types";
import { COCKPIT_MODES, inCockpitMode } from "../_lib/cockpitModes";

// Sales → Managers → Quote inquiries (Council Outlay 6, step 3): reps ask a manager to approve a
// margin below the floor. A manager approves it, approves it down to a counter margin, rejects it,
// or asks back in the quote's chat. The answer goes to whoever asked and to the quote's owner, and
// into the quote's history. A manager may answer their own question or quote: it is allowed and
// shown (owner decision D9). The warehouse's heavy-piece questions are decided on Warehouse →
// Managers; here they are one line to chase.

const BUTTON = "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-[13px] font-semibold text-slate-700 cursor-pointer transition-colors";
const SAVE = "text-[13px] font-semibold px-3 py-1.5 rounded-lg border text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110";
const LABEL = "block text-[11px] font-extrabold tracking-[.07em] uppercase mb-1";

type Answering = { id: string; decision: "approve" | "counter" | "reject" };

const czk = (n: number) => formatAmount(Math.round(n), "CZK");

function AnswerPill({ row }: { row: MarginInquiryRow }) {
  const i = row.inquiry;
  if (i.status === "withdrawn") return <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[12px] font-semibold text-slate-600">Withdrawn</span>;
  if (i.status === "rejected") return <span className="inline-flex rounded-full bg-red-50 px-2.5 py-0.5 text-[12px] font-semibold text-red-700">Rejected</span>;
  return (
    <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-[12px] font-semibold text-emerald-700">
      {i.decision === "counter" ? "Approved down to " : "Approved · "}
      {marginText(i.approvedMarginCzk, i.approvedMarginPercent)}
    </span>
  );
}

/** The questions of one freight mode (the page's ?mode=), as the cockpit's Awaiting approval counts them. */
export function SalesQuoteInquiries({ mode }: { mode: SalesCockpitMode }) {
  const toast = useToast();
  const { inquiries: all, isLoading, isError, decide } = useMarginInquiries();
  const { waiting: warehouseWaiting } = useWarehouseInquiries();
  const [view, setView] = useState<"waiting" | "answered">("waiting");
  const [answering, setAnswering] = useState<Answering | null>(null);
  const [counter, setCounter] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  // The question this manager's own answer is on its way for: its row turning answered is no news.
  const ownAnswer = useRef<string | null>(null);

  const inquiries = all.filter((r) => inCockpitMode(r.serviceType, mode));
  const waiting = inquiries.filter((r) => r.inquiry.status === "pending").length;
  const listed = inquiries.filter((r) => (view === "waiting" ? r.inquiry.status === "pending" : r.inquiry.status !== "pending"));
  // Another manager answered (or the rep withdrew) the question being answered here: the form
  // closes, and says why, rather than send an answer the server would refuse.
  const answeredRow = answering ? all.find((r) => r.inquiry.id === answering.id) : undefined;
  const answeredElsewhere = !!answering && answering.id !== ownAnswer.current && !!answeredRow && answeredRow.inquiry.status !== "pending";
  useEffect(() => {
    if (!answeredElsewhere || !answeredRow) return;
    setAnswering(null);
    const i = answeredRow.inquiry;
    toast.info(i.status === "withdrawn" ? `${i.quoteNumber}: the question was withdrawn meanwhile` : `${i.quoteNumber}: ${i.decidedByName || "another manager"} answered it meanwhile`);
  }, [answeredElsewhere, answeredRow, toast]);
  const start = (r: MarginInquiryRow, decision: Answering["decision"]) => {
    setAnswering({ id: r.inquiry.id, decision });
    setCounter(decision === "counter" ? r.inquiry.snapshot.floorMinCzk : null);
    setComment("");
  };
  const save = (r: MarginInquiryRow) => {
    if (!answering) return;
    ownAnswer.current = r.inquiry.id;
    decide
      .mutateAsync({ quoteNumber: r.inquiry.quoteNumber, inquiryId: r.inquiry.id, decision: answering.decision, counterMarginCzk: answering.decision === "counter" ? counter : null, comment })
      .then(() => {
        const what = answering.decision === "reject" ? "rejected" : "approved";
        toast.success(`${r.inquiry.quoteNumber} ${what} — ${r.inquiry.requestedByName || "the rep"} is notified`);
        setAnswering(null);
      })
      .catch((e) => {
        // Refused - perhaps because somebody answered first: the list read again then closes the form.
        ownAnswer.current = null;
        toast.error(apiErrorMessage(e));
      });
  };

  const inMode = mode === "all" ? "" : ` for ${COCKPIT_MODES.find((m) => m.key === mode)?.label ?? mode}`;
  const empty = isError
    ? "Could not load the inquiries."
    : isLoading
      ? "Loading…"
      : view === "waiting"
        ? `No discount waiting for a manager${inMode}.`
        : `No answers in the last 30 days${inMode}.`;

  return (
    <div className="flex flex-col gap-3">
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
          <div>
            <div className="text-[13px] font-bold uppercase tracking-wider text-slate-800">Quote inquiries · margins below the floor</div>
            <div className="text-[12px] text-slate-500">Approve as asked, approve down to a counter margin, or reject with a reason. The answer goes to whoever asked and to the quote&apos;s owner.</div>
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
          <table className="w-full min-w-[1040px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="px-4 py-2 font-semibold">Quote</th>
                <th className="px-4 py-2 font-semibold">Margin vs floor</th>
                <th className="px-4 py-2 font-semibold">Why</th>
                <th className="px-4 py-2 font-semibold">Asked</th>
                <th className="px-4 py-2 font-semibold">Answer</th>
              </tr>
            </thead>
            <tbody>
              {listed.length === 0 && (
                <tr>
                  <td colSpan={5} className={`px-4 py-8 text-center ${isError ? "text-red-500" : "text-slate-400"}`}>
                    {empty}
                  </td>
                </tr>
              )}
              {listed.map((r) => {
                const i = r.inquiry;
                const s = i.snapshot;
                const now = r.margin;
                const changed = i.status === "pending" && now?.marginCzk != null && s.marginCzk !== null && now.marginCzk < s.marginCzk - 1;
                // Only a question still waiting is answered.
                const open = i.status === "pending" && answering?.id === i.id ? answering : null;
                return (
                  <Fragment key={i.id}>
                    <tr className="border-b border-slate-100 align-top">
                      <td className="px-4 py-3">
                        <Link href={quoteHref(i.quoteNumber)} className="tabular-nums font-bold text-indigo-600 hover:underline">
                          {i.quoteNumber}
                        </Link>
                        <div className="text-[12px] text-slate-600">{r.customer || "—"}</div>
                        <div className="text-[11px] text-slate-400">
                          {[serviceTypeLabel(r.serviceType), r.ownerName ? `Sales Owner: ${r.ownerName}` : "no Sales Owner"].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        <div className="text-slate-700">
                          Selling {czk(s.sellingCzk)} · buying {czk(s.buyingCzk)}
                        </div>
                        <div>
                          <span className="font-semibold text-red-600">{marginText(s.marginCzk, s.marginPercent)}</span>{" "}
                          <span className="text-slate-500">vs {floorText(s)}</span>
                        </div>
                        {changed && (
                          <div className="text-[12px] font-semibold text-red-600">
                            Changed since asked: now {marginText(now!.marginCzk, now!.marginPercent)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-[300px]">
                        <div className="font-semibold text-slate-700">{i.reason}</div>
                        {i.note && <div className="whitespace-pre-wrap">{i.note}</div>}
                        {(i.competitorPrice || i.volume) && (
                          <div className="text-[12px] text-slate-500">{[i.competitorPrice && `Competitor: ${i.competitorPrice}`, i.volume && `Volume: ${i.volume}`].filter(Boolean).join(" · ")}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {i.requestedByName || "—"}
                        <div className="text-[11px] text-slate-400 tabular-nums">{formatDateTime(i.requestedAt)}</div>
                        {i.status === "pending" && (
                          <div className={`text-[11px] tabular-nums ${i.escalated ? "font-semibold text-red-600" : "text-slate-400"}`}>
                            waiting {officeTime(i.waitedOfficeMinutes)}
                            {i.needsBy ? ` · needs it by ${formatDateTime(i.needsBy)}` : ""}
                          </div>
                        )}
                        <div className="text-[11px] text-slate-400">{i.notifyName ? `told: ${i.notifyName}` : "told: the admins"}</div>
                      </td>
                      <td className="px-4 py-3">
                        {i.status === "pending" ? (
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => start(r, "approve")} className={`${BUTTON} hover:border-emerald-500 hover:text-emerald-700 hover:bg-emerald-50`}>
                              <CheckOutlined className="text-[14px]" />
                              Approve
                            </button>
                            <button type="button" onClick={() => start(r, "counter")} className={`${BUTTON} hover:border-emerald-500 hover:text-emerald-700 hover:bg-emerald-50`}>
                              Approve at…
                            </button>
                            <button type="button" onClick={() => start(r, "reject")} className={`${BUTTON} hover:border-red-500 hover:text-red-700 hover:bg-red-50`}>
                              <CloseOutlined className="text-[14px]" />
                              Reject
                            </button>
                            <Link href={quoteChatHref(i.quoteNumber)} className={`${BUTTON} !text-slate-700 hover:border-indigo-400`}>
                              <MessageOutlined className="text-[14px]" />
                              Ask back
                            </Link>
                          </div>
                        ) : (
                          <div>
                            <AnswerPill row={r} />
                            <div className="text-[11px] text-slate-400 mt-1 tabular-nums">
                              {i.status === "withdrawn" ? "by whoever asked" : `${i.decidedByName || "—"} · ${formatDateTime(i.decidedAt)}`}
                              {i.selfDecision ? " · self-approval" : ""}
                              {i.answerSeenAt ? " · seen by Sales" : ""}
                            </div>
                            {i.comment && <div className="text-[12px] text-slate-600 mt-1 max-w-[280px] whitespace-pre-wrap">{i.comment}</div>}
                          </div>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <td colSpan={5} className="px-4 pb-4 pt-2">
                          <div className="flex flex-wrap items-end gap-3">
                            {open.decision === "counter" && (
                              <label className="block">
                                <span className={`${LABEL} text-emerald-700`}>Lowest margin you accept (CZK)</span>
                                <InputNumber autoFocus min={0} precision={0} value={counter} onChange={(v) => setCounter(v)} aria-label="Lowest margin you accept in CZK" className="!w-[180px]" />
                                {counter !== null && s.sellingCzk > 0 && <span className="ml-2 text-[12px] text-slate-500">= {formatPercent((counter / s.sellingCzk) * 100)} of the selling when asked</span>}
                              </label>
                            )}
                            <label className="block flex-1 min-w-[260px]">
                              <span className={`${LABEL} ${open.decision === "reject" ? "text-red-600" : "text-slate-500"}`}>
                                {open.decision === "reject" ? "Reason for rejection" : open.decision === "counter" ? "What the rep should aim for" : "Comment for the rep (optional)"}
                              </span>
                              <textarea
                                autoFocus={open.decision !== "counter"}
                                rows={2}
                                value={comment}
                                maxLength={1000}
                                onChange={(e) => setComment(e.target.value)}
                                className="w-full text-[13px] border border-slate-300 rounded-lg px-2.5 py-2 bg-white outline-none resize-y focus:border-indigo-500"
                              />
                              <span className="block text-[11px] text-slate-500 mt-0.5">Sent to {i.requestedByName || "whoever asked"} and the quote&apos;s owner, and kept in the quote&apos;s history</span>
                            </label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={decide.isPending || (open.decision !== "approve" && comment.trim().length < 3) || (open.decision === "counter" && counter === null)}
                                onClick={() => save(r)}
                                className={`${SAVE} ${open.decision === "reject" ? "border-red-600 bg-red-600" : "border-emerald-600 bg-emerald-600"}`}
                              >
                                {open.decision === "reject" ? "Save rejection" : "Save approval"}
                              </button>
                              <button type="button" onClick={() => setAnswering(null)} className={BUTTON}>
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
      {warehouseWaiting > 0 && (
        <div role="status" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600">
          <b>{warehouseWaiting}</b> heavy-piece question{warehouseWaiting === 1 ? "" : "s"} waiting for the warehouse (decided there) ·{" "}
          <Link href="/warehouse-concept/managers?tab=inquiries" className="font-semibold text-indigo-600 hover:underline">
            Open Warehouse → Managers
          </Link>
        </div>
      )}
    </div>
  );
}
