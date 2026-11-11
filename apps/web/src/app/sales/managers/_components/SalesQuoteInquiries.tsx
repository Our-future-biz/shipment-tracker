"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { InputNumber, Segmented } from "antd";
import { CheckOutlined, CloseOutlined, MessageOutlined } from "@ant-design/icons";
import { useToast } from "@/lib/toast";
import { LINK_CLASS } from "@/components/linkClass";
import { Pill } from "@/components/Pill";
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
import { SellingAmountRequests } from "./SellingAmountRequests";
import { BTN, BTN_DANGER, BTN_PRIMARY, CARD, CARD_BAR, CARD_TITLE, HINT, LABEL_TEXT, TD, TEXTAREA, TH } from "@/styles/ui";

// Sales → Managers → Quote inquiries (Council Outlay 6, step 3): reps ask a manager to approve a
// margin below the floor. A manager approves it, approves it down to a counter margin, rejects it,
// or asks back in the quote's chat. The answer goes to whoever asked and to the quote's owner, and
// into the quote's history. A manager may answer their own question or quote: it is allowed and
// shown (owner decision D9). The warehouse's heavy-piece questions are decided on Warehouse →
// Managers; here they are one line to chase.

const LABEL = `block ${LABEL_TEXT} mb-1`;
// A cell of the list, its first and last a card's padding in from the frame.
const HEAD = `${TH} first:pl-4 last:pr-4`;
const CELL = `${TD} !align-top first:pl-4 last:pr-4`;

type Answering = { id: string; decision: "approve" | "counter" | "reject" };

const czk = (n: number) => formatAmount(Math.round(n), "CZK");

function AnswerPill({ row }: { row: MarginInquiryRow }) {
  const i = row.inquiry;
  if (i.status === "withdrawn") return <Pill tone="slate">Withdrawn</Pill>;
  if (i.status === "rejected") return <Pill tone="red">Rejected</Pill>;
  return (
    <Pill tone="green">
      {i.decision === "counter" ? "Approved down to " : "Approved · "}
      {marginText(i.approvedMarginCzk, i.approvedMarginPercent)}
    </Pill>
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
      <section className={`${CARD} overflow-hidden`}>
        <div className={`${CARD_BAR} flex-wrap justify-between`}>
          <div>
            <h3 className={CARD_TITLE}>Quote inquiries · margins below the floor</h3>
            <div className={HINT}>Approve as asked, approve down to a counter margin, or reject with a reason. The answer goes to whoever asked and to the quote&apos;s owner.</div>
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
              <tr>
                <th className={HEAD}>Quote</th>
                <th className={HEAD}>Margin vs floor</th>
                <th className={HEAD}>Why</th>
                <th className={HEAD}>Asked</th>
                <th className={HEAD}>Answer</th>
              </tr>
            </thead>
            <tbody>
              {listed.length === 0 && (
                <tr>
                  <td colSpan={5} className={`${TD} !py-8 text-center`}>
                    <span className={isError ? "text-red-600" : "text-slate-400"}>{empty}</span>
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
                    <tr>
                      <td className={CELL}>
                        <Link href={quoteHref(i.quoteNumber)} className={`tabular-nums font-semibold ${LINK_CLASS}`}>
                          {i.quoteNumber}
                        </Link>
                        <div className="text-[12px] text-slate-700">{r.customer || "—"}</div>
                        <div className="text-[11px] text-slate-400">
                          {[serviceTypeLabel(r.serviceType), r.ownerName ? `Quoted by ${r.ownerName}` : "quoted by nobody"].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td className={`${CELL} tabular-nums`}>
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
                      <td className={`${CELL} max-w-[300px]`}>
                        <div className="font-semibold text-slate-900">{i.reason}</div>
                        {i.note && <div className="whitespace-pre-wrap">{i.note}</div>}
                        {(i.competitorPrice || i.volume) && (
                          <div className="text-[12px] text-slate-500">{[i.competitorPrice && `Competitor: ${i.competitorPrice}`, i.volume && `Volume: ${i.volume}`].filter(Boolean).join(" · ")}</div>
                        )}
                      </td>
                      <td className={`${CELL} whitespace-nowrap`}>
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
                      <td className={CELL}>
                        {i.status === "pending" ? (
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => start(r, "approve")} className={BTN}>
                              <CheckOutlined className="text-[14px]" />
                              Approve
                            </button>
                            <button type="button" onClick={() => start(r, "counter")} className={BTN}>
                              Approve at…
                            </button>
                            <button type="button" onClick={() => start(r, "reject")} className={BTN}>
                              <CloseOutlined className="text-[14px]" />
                              Reject
                            </button>
                            <Link href={quoteChatHref(i.quoteNumber)} className={`${BTN} !text-slate-700 hover:!text-slate-900`}>
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
                            {i.comment && <div className="text-[12px] text-slate-700 mt-1 max-w-[280px] whitespace-pre-wrap">{i.comment}</div>}
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
                                <span className={LABEL}>Lowest margin you accept (CZK)</span>
                                <InputNumber autoFocus min={0} precision={0} value={counter} onChange={(v) => setCounter(v)} aria-label="Lowest margin you accept in CZK" className="!w-[180px]" />
                                {counter !== null && s.sellingCzk > 0 && <span className="ml-2 text-[12px] text-slate-500">= {formatPercent((counter / s.sellingCzk) * 100)} of the selling when asked</span>}
                              </label>
                            )}
                            <label className="block flex-1 min-w-[260px]">
                              <span className={LABEL}>
                                {open.decision === "reject" ? "Reason for rejection" : open.decision === "counter" ? "What the rep should aim for" : "Comment for the rep (optional)"}
                              </span>
                              <textarea
                                autoFocus={open.decision !== "counter"}
                                rows={2}
                                value={comment}
                                maxLength={1000}
                                onChange={(e) => setComment(e.target.value)}
                                className={`${TEXTAREA} w-full resize-y`}
                              />
                              <span className={`block ${HINT} mt-0.5`}>Sent to {i.requestedByName || "whoever asked"} and the quote&apos;s owner, and kept in the quote&apos;s history</span>
                            </label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={decide.isPending || (open.decision !== "approve" && comment.trim().length < 3) || (open.decision === "counter" && counter === null)}
                                onClick={() => save(r)}
                                className={open.decision === "reject" ? BTN_DANGER : BTN_PRIMARY}
                              >
                                {open.decision === "reject" ? "Save rejection" : "Save approval"}
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
      <SellingAmountRequests />
      {warehouseWaiting > 0 && (
        <div role="status" className={`${CARD} px-4 py-2 text-xs text-slate-700`}>
          <b>{warehouseWaiting}</b> heavy-piece question{warehouseWaiting === 1 ? "" : "s"} waiting for the warehouse (decided there) ·{" "}
          <Link href="/warehouse-concept/managers?tab=inquiries" className={`font-semibold ${LINK_CLASS}`}>
            Open Warehouse → Managers
          </Link>
        </div>
      )}
    </div>
  );
}
