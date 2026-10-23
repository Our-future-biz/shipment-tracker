"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { InputNumber, Segmented } from "antd";
import { CheckOutlined, CloseOutlined } from "@ant-design/icons";
import { useWarehouseInquiries, type WarehouseInquiryItem } from "@/hooks/useWarehouseInquiries";
import { useToast } from "@/lib/toast";
import { formatDateTime } from "@/lib/date";
import { errorMessage, nf } from "../../gate-log/_lib/gate";

// Sales' questions about pieces of 12.5 t or more (the quote's "Inquire Warehouse"): a warehouse
// manager approves with the extra handling per piece, or rejects with a reason — the same two
// buttons and reason box as Customs' review of a document. The answer goes to the one who asked
// (their notifications) and into the quote's history; until it is approved the quote cannot be sent.

const BUTTON = "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-[12.5px] font-semibold text-slate-700 cursor-pointer transition-colors";

type Answering = { key: string; approve: boolean };

function AnswerPill({ i }: { i: WarehouseInquiryItem["inquiry"] }) {
  if (i.status === "approved")
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[12px] font-semibold text-emerald-700">Approved · EUR {nf(i.priceEurPerPiece ?? 0, 2)} per piece</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-[12px] font-semibold text-red-700">Rejected</span>;
}

export function QuoteInquiries() {
  const toast = useToast();
  const { inquiries, waiting, isLoading, isError, decide } = useWarehouseInquiries();
  const [view, setView] = useState<"waiting" | "answered">("waiting");
  const [answering, setAnswering] = useState<Answering | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [comment, setComment] = useState("");

  const listed = inquiries.filter((x) => (view === "waiting" ? x.inquiry.status === "pending" : x.inquiry.status !== "pending"));
  const keyOf = (x: WarehouseInquiryItem) => `${x.quoteNumber}:${x.inquiry.id}`;
  const start = (x: WarehouseInquiryItem, approve: boolean) => {
    setAnswering({ key: keyOf(x), approve });
    setPrice(null);
    setComment("");
  };
  const save = (x: WarehouseInquiryItem, approve: boolean) =>
    decide
      .mutateAsync({ quoteNumber: x.quoteNumber, inquiryId: x.inquiry.id, approve, priceEurPerPiece: approve ? price : null, comment })
      .then(() => {
        toast.success(`${x.quoteNumber} ${approve ? "approved" : "rejected"} — ${x.inquiry.requestedByName || "Sales"} is notified`);
        setAnswering(null);
      })
      .catch((e) => toast.error(errorMessage(e, "Could not save the answer")));

  const empty = isError ? "Could not load the inquiries." : isLoading ? "Loading…" : view === "waiting" ? "Nothing waiting for the warehouse." : "No answers in the last 30 days.";

  return (
    <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <div>
          <div className="text-[13px] font-bold uppercase tracking-wider text-slate-800">Quote inquiries · pieces of 12.5 t or more</div>
          <div className="text-[12px] text-slate-500">Sales asks before quoting: approve with the extra handling per piece, or reject with a reason. The answer goes to whoever asked.</div>
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
        <table className="w-full min-w-[920px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <th className="px-4 py-2 font-semibold">Quote</th>
              <th className="px-4 py-2 font-semibold">Service · route</th>
              <th className="px-4 py-2 font-semibold text-right">Pieces ≥ 12.5 t</th>
              <th className="px-4 py-2 font-semibold">Note from Sales</th>
              <th className="px-4 py-2 font-semibold">Asked</th>
              <th className="px-4 py-2 font-semibold">Answer</th>
            </tr>
          </thead>
          <tbody>
            {listed.length === 0 && (
              <tr>
                <td colSpan={6} className={`px-4 py-8 text-center ${isError ? "text-red-500" : "text-slate-400"}`}>
                  {empty}
                </td>
              </tr>
            )}
            {listed.map((x) => {
              const i = x.inquiry;
              const open = answering?.key === keyOf(x) ? answering : null;
              return (
                <Fragment key={keyOf(x)}>
                  <tr className="border-b border-slate-100 align-top">
                    <td className="px-4 py-3">
                      <Link href={`/sales/quote/${encodeURIComponent(x.quoteNumber)}`} className="font-mono font-bold text-indigo-600 hover:underline">
                        {x.quoteNumber}
                      </Link>
                      <div className="text-[12px] text-slate-600">{x.customerName || "—"}</div>
                      {x.ownerName && <div className="text-[11px] text-slate-400">Sales owner: {x.ownerName}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {x.serviceType || "—"}
                      <div className="text-[12px] text-slate-500">
                        {x.from || "—"} → {x.to || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className="font-semibold text-slate-800">{i.pieces}</span>
                      <div className="text-[11px] text-slate-400">{nf(i.grossWeightKg)} kg in all</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-[260px] whitespace-pre-wrap">{i.note || <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {i.requestedByName || "—"}
                      <div className="text-[11px] text-slate-400 tabular-nums">{formatDateTime(i.requestedAt)}</div>
                    </td>
                    <td className="px-4 py-3">
                      {i.status === "pending" ? (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => start(x, true)} className={`${BUTTON} hover:border-emerald-500 hover:text-emerald-700 hover:bg-emerald-50`}>
                            <CheckOutlined className="text-[14px]" />
                            Approve
                          </button>
                          <button type="button" onClick={() => start(x, false)} className={`${BUTTON} hover:border-red-500 hover:text-red-700 hover:bg-red-50`}>
                            <CloseOutlined className="text-[14px]" />
                            Reject
                          </button>
                        </div>
                      ) : (
                        <div>
                          <AnswerPill i={i} />
                          <div className="text-[11px] text-slate-400 mt-1 tabular-nums">
                            {i.decidedByName || "—"} · {formatDateTime(i.decidedAt)}
                            {i.answerSeenAt ? " · seen by Sales" : ""}
                          </div>
                          {i.comment && <div className="text-[12px] text-slate-600 mt-1 max-w-[280px] whitespace-pre-wrap">{i.comment}</div>}
                        </div>
                      )}
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <td colSpan={6} className="px-4 pb-4 pt-2">
                        {open.approve ? (
                          <div className="flex flex-wrap items-end gap-3">
                            <label className="block">
                              <span className="block text-[11px] font-extrabold tracking-[.07em] uppercase text-emerald-700 mb-1">Extra handling per piece (EUR)</span>
                              <InputNumber
                                autoFocus
                                min={0}
                                max={100000}
                                precision={2}
                                value={price}
                                onChange={(v) => setPrice(v)}
                                aria-label="Extra handling per piece in EUR"
                                className="!w-[180px]"
                                placeholder="e.g. 650"
                              />
                              {price !== null && <span className="ml-2 text-[12px] text-slate-500">= EUR {nf(price * i.pieces, 2)} for {i.pieces} piece{i.pieces === 1 ? "" : "s"}</span>}
                            </label>
                            <label className="block flex-1 min-w-[240px]">
                              <span className="block text-[11px] font-extrabold tracking-[.07em] uppercase text-slate-500 mb-1">Comment for Sales (optional)</span>
                              <textarea
                                rows={2}
                                value={comment}
                                maxLength={1000}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder="Conditions, crane booking, …"
                                className="w-full text-[13px] border border-slate-300 rounded-lg px-2.5 py-2 bg-white outline-none resize-y focus:border-emerald-500"
                              />
                            </label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={price === null || decide.isPending}
                                onClick={() => save(x, true)}
                                className="text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border border-emerald-600 bg-emerald-600 text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110"
                              >
                                Save approval
                              </button>
                              <button type="button" onClick={() => setAnswering(null)} className={BUTTON}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <label className="block text-[11px] font-extrabold tracking-[.07em] uppercase text-red-600 mb-1">
                              Reason for rejection
                              <span className="block text-[11px] font-medium tracking-normal normal-case text-slate-500 mt-0.5">Sent to {i.requestedByName || "whoever asked"} and kept in the quote&apos;s history</span>
                            </label>
                            <textarea
                              autoFocus
                              rows={2}
                              value={comment}
                              maxLength={1000}
                              onChange={(e) => setComment(e.target.value)}
                              placeholder="Why the warehouse cannot take these pieces…"
                              className="w-full max-w-[620px] text-[13px] border border-red-400 rounded-lg px-2.5 py-2 bg-white outline-none resize-y"
                            />
                            <div className="flex gap-2 mt-2">
                              <button
                                type="button"
                                disabled={comment.trim().length < 3 || decide.isPending}
                                onClick={() => save(x, false)}
                                className="text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border border-red-600 bg-red-600 text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110"
                              >
                                Save rejection
                              </button>
                              <button type="button" onClick={() => setAnswering(null)} className={BUTTON}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
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
