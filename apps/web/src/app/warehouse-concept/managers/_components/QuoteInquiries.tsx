"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { InputNumber, Segmented } from "antd";
import { CheckOutlined, CloseOutlined } from "@ant-design/icons";
import { useWarehouseInquiries, type WarehouseInquiryItem } from "@/hooks/useWarehouseInquiries";
import { useToast } from "@/lib/toast";
import { formatDateTime } from "@/lib/date";
import { errorMessage, nf } from "../../gate-log/_lib/gate";
import { Pill } from "@/components/Pill";
import { BTN, BTN_DANGER, BTN_PRIMARY, CARD, CARD_BAR, CARD_TITLE, EMPTY, EMPTY_STATE, HINT, LABEL_TEXT, LINK, REF, TD, TEXTAREA, TH } from "@/styles/ui";

// Sales' questions about pieces of 12.5 t or more (the quote's "Inquire Warehouse"): a warehouse
// manager approves with the extra handling per piece, or rejects with a reason — the same two
// buttons and reason box as Customs' review of a document. The answer goes to the one who asked
// (their notifications) and into the quote's history; until it is approved the quote cannot be sent.

// A text box of the answer: the app's text box (TEXTAREA), as wide as the row, as tall as its rows.
const ANSWER_BOX = `${TEXTAREA} w-full resize-y`;
// The table's cells, with the card's 16px inset.
const HEAD = `${TH} !px-4`;
const CELL = `${TD} !px-4 !py-3 !align-top`;

type Answering = { key: string; approve: boolean };

function AnswerPill({ i }: { i: WarehouseInquiryItem["inquiry"] }) {
  if (i.status === "approved")
    return <Pill tone="green">Approved · EUR {nf(i.priceEurPerPiece ?? 0, 2)} per piece</Pill>;
  return <Pill tone="red">Rejected</Pill>;
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
    <section className={`${CARD} overflow-hidden`}>
      <div className={`${CARD_BAR} flex-wrap justify-between`}>
        <div>
          <div className={CARD_TITLE}>Quote inquiries · pieces of 12.5 t or more</div>
          <div className={HINT}>Sales asks before quoting: approve with the extra handling per piece, or reject with a reason. The answer goes to whoever asked.</div>
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
            <tr>
              <th className={HEAD}>Quote</th>
              <th className={HEAD}>Service · route</th>
              <th className={`${HEAD} !text-right`}>Pieces ≥ 12.5 t</th>
              <th className={HEAD}>Note from Sales</th>
              <th className={HEAD}>Asked</th>
              <th className={HEAD}>Answer</th>
            </tr>
          </thead>
          <tbody>
            {listed.length === 0 && (
              <tr>
                <td colSpan={6} className={`${EMPTY_STATE} px-4 ${isError ? "!text-red-600" : ""}`}>
                  {empty}
                </td>
              </tr>
            )}
            {listed.map((x) => {
              const i = x.inquiry;
              const open = answering?.key === keyOf(x) ? answering : null;
              return (
                <Fragment key={keyOf(x)}>
                  <tr>
                    <td className={CELL}>
                      <Link href={`/sales/quote/${encodeURIComponent(x.quoteNumber)}`} className={`${REF} font-bold ${LINK}`}>
                        {x.quoteNumber}
                      </Link>
                      <div className={HINT}>{x.customerName || "—"}</div>
                      {x.ownerName && <div className={HINT}>Quoted by {x.ownerName}</div>}
                    </td>
                    <td className={CELL}>
                      {x.serviceType || "—"}
                      <div className={HINT}>
                        {x.from || "—"} → {x.to || "—"}
                      </div>
                    </td>
                    <td className={`${CELL} !text-right tabular-nums`}>
                      <span className="font-semibold text-slate-900">{i.pieces}</span>
                      <div className={HINT}>{nf(i.grossWeightKg)} kg in all</div>
                    </td>
                    <td className={`${CELL} max-w-[260px] whitespace-pre-wrap`}>{i.note || <span className={EMPTY}>—</span>}</td>
                    <td className={`${CELL} whitespace-nowrap`}>
                      {i.requestedByName || "—"}
                      <div className={`${HINT} tabular-nums`}>{formatDateTime(i.requestedAt)}</div>
                    </td>
                    <td className={CELL}>
                      {i.status === "pending" ? (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => start(x, true)} className={BTN}>
                            <CheckOutlined className="text-[14px]" />
                            Approve
                          </button>
                          <button type="button" onClick={() => start(x, false)} className={BTN}>
                            <CloseOutlined className="text-[14px]" />
                            Reject
                          </button>
                        </div>
                      ) : (
                        <div>
                          <AnswerPill i={i} />
                          <div className={`${HINT} mt-1 tabular-nums`}>
                            {i.decidedByName || "—"} · {formatDateTime(i.decidedAt)}
                            {i.answerSeenAt ? " · seen by Sales" : ""}
                          </div>
                          {i.comment && <div className="text-[12px] text-slate-700 mt-1 max-w-[280px] whitespace-pre-wrap">{i.comment}</div>}
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
                              <span className={`block ${LABEL_TEXT} mb-1`}>Extra handling per piece (EUR)</span>
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
                              {price !== null && <span className={`ml-2 ${HINT}`}>= EUR {nf(price * i.pieces, 2)} for {i.pieces} piece{i.pieces === 1 ? "" : "s"}</span>}
                            </label>
                            <label className="block flex-1 min-w-[240px]">
                              <span className={`block ${LABEL_TEXT} mb-1`}>Comment for Sales (optional)</span>
                              <textarea
                                rows={2}
                                value={comment}
                                maxLength={1000}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder="Conditions, crane booking, …"
                                className={ANSWER_BOX}
                              />
                            </label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={price === null || decide.isPending}
                                onClick={() => save(x, true)}
                                className={BTN_PRIMARY}
                              >
                                Save approval
                              </button>
                              <button type="button" onClick={() => setAnswering(null)} className={BTN}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <label className={`block ${LABEL_TEXT} mb-1`}>
                              Reason for rejection
                              <span className={`block ${HINT} font-normal tracking-normal normal-case mt-0.5`}>Sent to {i.requestedByName || "whoever asked"} and kept in the quote&apos;s history</span>
                            </label>
                            <textarea
                              autoFocus
                              rows={2}
                              value={comment}
                              maxLength={1000}
                              onChange={(e) => setComment(e.target.value)}
                              placeholder="Why the warehouse cannot take these pieces…"
                              className={`${ANSWER_BOX} max-w-[620px]`}
                            />
                            <div className="flex gap-2 mt-2">
                              <button
                                type="button"
                                disabled={comment.trim().length < 3 || decide.isPending}
                                onClick={() => save(x, false)}
                                className={BTN_DANGER}
                              >
                                Save rejection
                              </button>
                              <button type="button" onClick={() => setAnswering(null)} className={BTN}>
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
