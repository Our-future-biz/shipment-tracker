"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Segmented } from "antd";
import { CheckOutlined, CloseOutlined } from "@ant-design/icons";
import { LINK_CLASS } from "@/components/linkClass";
import { Pill } from "@/components/Pill";
import { apiErrorMessage } from "@/lib/api";
import { chargeLabel } from "@/lib/chargeCodes";
import { formatDateTime } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { useSellingAmountRequests } from "@/hooks/useSellingAmountRequests";
import { BTN, BTN_DANGER, BTN_PRIMARY, CARD, CARD_BAR, CARD_TITLE, HINT, LABEL_TEXT, TD, TEXTAREA, TH } from "@/styles/ui";

// Sales → Managers → Quote inquiries: a shipment asks to sell a cost it sells on at cost (a master
// job's demurrage) for less than it costs. A manager approves it, which changes the selling row, or
// rejects it with a reason; the answer shows on the shipment's row.

const HEAD = `${TH} first:pl-4 last:pr-4`;
const CELL = `${TD} !align-top first:pl-4 last:pr-4`;
const money = (amount: string | null, currency: string) => `${Number(amount ?? 0).toFixed(2)} ${currency}`;

export function SellingAmountRequests() {
  const toast = useToast();
  const { requests, waiting, isLoading, isError, decide } = useSellingAmountRequests();
  const [view, setView] = useState<"waiting" | "answered">("waiting");
  const [answering, setAnswering] = useState<{ id: string; decision: "approve" | "reject" } | null>(null);
  const [comment, setComment] = useState("");

  const listed = requests.filter((r) => (view === "waiting" ? r.status === "pending" : r.status !== "pending"));
  const empty = isError ? "Could not load the requests." : isLoading ? "Loading…" : view === "waiting" ? "No selling amount waiting for a manager." : "No answers in the last 30 days.";

  const start = (id: string, decision: "approve" | "reject") => {
    setAnswering({ id, decision });
    setComment("");
  };
  const save = () => {
    if (!answering) return;
    decide
      .mutateAsync({ id: answering.id, decision: answering.decision, comment })
      .then(() => {
        toast.success(answering.decision === "approve" ? "Approved: the shipment's selling is changed" : "Rejected: the shipment's selling stays as it was");
        setAnswering(null);
      })
      .catch((e) => toast.error(apiErrorMessage(e)));
  };

  return (
    <section className={`${CARD} overflow-hidden`}>
      <div className={`${CARD_BAR} flex-wrap justify-between`}>
        <div>
          <h3 className={CARD_TITLE}>Quote inquiries · selling below the cost</h3>
          <div className={HINT}>Approve to change the shipment&apos;s selling to the amount asked or delete the row, or reject with a reason. The answer shows on the shipment&apos;s Costs Breakdown.</div>
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
              <th className={HEAD}>Shipment</th>
              <th className={HEAD}>Cost vs asked</th>
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
              const open = r.status === "pending" && answering?.id === r.id ? answering : null;
              const below = Number(r.costAmount) - Number(r.requestedAmount);
              return (
                <Fragment key={r.id}>
                  <tr>
                    <td className={CELL}>
                      <Link href={`/shipments/${r.shipmentId}?tab=costs`} className={`tabular-nums font-semibold ${LINK_CLASS}`}>
                        {r.jobNumber || "Shipment"}
                      </Link>
                      <div className="text-[12px] text-slate-700">{r.category ? chargeLabel(r.category) : "—"}</div>
                    </td>
                    <td className={`${CELL} tabular-nums`}>
                      <div className="text-slate-700">Cost {money(r.costAmount, r.currency)}</div>
                      {r.kind === "remove" ? (
                        <div>
                          <span className="font-semibold text-red-600">Asked to delete it</span> <span className="text-slate-500">(sells at {money(r.currentAmount, r.currency)})</span>
                        </div>
                      ) : (
                        <div>
                          <span className="font-semibold text-red-600">Asked {money(r.requestedAmount, r.currency)}</span>{" "}
                          <span className="text-slate-500">({money(String(below), r.currency)} below)</span>
                        </div>
                      )}
                    </td>
                    <td className={`${CELL} max-w-[300px] whitespace-pre-wrap`}>{r.reason}</td>
                    <td className={`${CELL} whitespace-nowrap`}>
                      {r.requestedByName || "—"}
                      <div className="text-[11px] text-slate-400 tabular-nums">{formatDateTime(r.requestedAt)}</div>
                    </td>
                    <td className={CELL}>
                      {r.status === "pending" ? (
                        <div className="flex flex-wrap gap-2">
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
                          <Pill tone={r.status === "approved" ? "green" : "red"}>{r.status === "approved" ? "Approved" : "Rejected"}</Pill>
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
                      <td colSpan={5} className="px-4 pb-4 pt-2">
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
  );
}
