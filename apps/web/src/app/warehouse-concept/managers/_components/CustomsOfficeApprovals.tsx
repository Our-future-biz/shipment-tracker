"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Segmented } from "antd";
import { CheckOutlined, CloseOutlined } from "@ant-design/icons";
import { useCustomsOfficeApprovals, type CustomsOfficeRequestItem } from "@/hooks/useCustomsOfficeRequests";
import { useToast } from "@/lib/toast";
import { formatDateTime } from "@/lib/date";
import { errorMessage } from "../../gate-log/_lib/gate";
import { Pill } from "@/components/Pill";
import { BTN, BTN_DANGER, BTN_PRIMARY, CARD, CARD_BAR, CARD_TITLE, HINT, LABEL_TEXT, LINK, REF, TD, TH } from "@/styles/ui";

// What waits for a manager's approval: for now, requests to change a shipment's chosen Customs
// Office. Approving puts the new office on the shipment; rejecting needs a reason. The answer goes
// to whoever asked (their notifications) - the same two buttons and reason box as Quote inquiries.

const TEXTAREA =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[13px] text-slate-900 placeholder:text-slate-400 outline-none resize-y focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors";
const HEAD = `${TH} !px-4`;
const CELL = `${TD} !px-4 !py-3 !align-top`;

type Answering = { id: string; approve: boolean };

export function CustomsOfficeApprovals() {
  const toast = useToast();
  const { requests, waiting, isLoading, isError, decide } = useCustomsOfficeApprovals();
  const [view, setView] = useState<"waiting" | "answered">("waiting");
  const [answering, setAnswering] = useState<Answering | null>(null);
  const [comment, setComment] = useState("");

  const listed = requests.filter((r) => (view === "waiting" ? r.status === "pending" : r.status !== "pending"));
  const start = (r: CustomsOfficeRequestItem, approve: boolean) => {
    setAnswering({ id: r.id, approve });
    setComment("");
  };
  const save = (r: CustomsOfficeRequestItem, approve: boolean) =>
    decide
      .mutateAsync({ id: r.id, shipmentId: r.shipmentId, approve, comment })
      .then(() => {
        toast.success(`${r.jobNumber} ${approve ? "approved" : "rejected"} — ${r.requestedByName || "whoever asked"} is notified`);
        setAnswering(null);
      })
      .catch((e) => toast.error(errorMessage(e, "Could not save the answer")));

  const empty = isError ? "Could not load the approvals." : isLoading ? "Loading…" : view === "waiting" ? "Nothing waiting for approval." : "No answers in the last 30 days.";

  return (
    <section className={`${CARD} overflow-hidden`}>
      <div className={`${CARD_BAR} flex-wrap justify-between`}>
        <div>
          <div className={CARD_TITLE}>Approvals · change of Customs Office</div>
          <div className={HINT}>Once chosen, a Customs Office is changed only with approval: approving puts the new office on the shipment, rejecting needs a reason. The answer goes to whoever asked.</div>
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
              <th className={HEAD}>Shipment</th>
              <th className={HEAD}>Customs Office</th>
              <th className={HEAD}>Reason</th>
              <th className={HEAD}>Asked</th>
              <th className={HEAD}>Answer</th>
            </tr>
          </thead>
          <tbody>
            {listed.length === 0 && (
              <tr>
                <td colSpan={5} className={`px-4 py-8 text-center ${isError ? "text-red-600" : "text-slate-400"}`}>
                  {empty}
                </td>
              </tr>
            )}
            {listed.map((r) => {
              const open = answering?.id === r.id ? answering : null;
              return (
                <Fragment key={r.id}>
                  <tr>
                    <td className={CELL}>
                      <Link href={`/shipments/${r.shipmentId}?tab=customs`} className={`${REF} font-bold ${LINK}`}>
                        {r.jobNumber || "—"}
                      </Link>
                      <div className={HINT}>{r.customer || "—"}</div>
                    </td>
                    <td className={`${CELL} max-w-[340px]`}>
                      <div className={HINT}>From: {r.fromOffice}</div>
                      <div className="font-semibold text-slate-900">To: {r.toOffice}</div>
                    </td>
                    <td className={`${CELL} max-w-[260px] whitespace-pre-wrap`}>{r.reason}</td>
                    <td className={`${CELL} whitespace-nowrap`}>
                      {r.requestedByName || "—"}
                      <div className={`${HINT} tabular-nums`}>{formatDateTime(r.requestedAt)}</div>
                    </td>
                    <td className={CELL}>
                      {r.status === "pending" ? (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => start(r, true)} className={BTN}>
                            <CheckOutlined className="text-[14px]" />
                            Approve
                          </button>
                          <button type="button" onClick={() => start(r, false)} className={BTN}>
                            <CloseOutlined className="text-[14px]" />
                            Reject
                          </button>
                        </div>
                      ) : (
                        <div>
                          <Pill tone={r.status === "approved" ? "green" : "red"}>{r.status === "approved" ? "Approved" : "Rejected"}</Pill>
                          <div className={`${HINT} mt-1 tabular-nums`}>
                            {r.decidedByName || "—"} · {formatDateTime(r.decidedAt)}
                            {r.answerSeenAt ? " · seen" : ""}
                          </div>
                          {r.comment && <div className="text-[12px] text-slate-700 mt-1 max-w-[280px] whitespace-pre-wrap">{r.comment}</div>}
                        </div>
                      )}
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <td colSpan={5} className="px-4 pb-4 pt-2">
                        <label className={`block ${LABEL_TEXT} mb-1`}>
                          {open.approve ? "Comment (optional)" : "Reason for rejection"}
                          <span className={`block ${HINT} font-normal tracking-normal normal-case mt-0.5`}>Sent to {r.requestedByName || "whoever asked"}</span>
                        </label>
                        <textarea
                          autoFocus
                          rows={2}
                          value={comment}
                          maxLength={1000}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder={open.approve ? "Anything they should know…" : "Why the Customs Office stays as it is…"}
                          className={`${TEXTAREA} max-w-[620px]`}
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            type="button"
                            disabled={decide.isPending || (!open.approve && comment.trim().length < 3)}
                            onClick={() => save(r, open.approve)}
                            className={open.approve ? BTN_PRIMARY : BTN_DANGER}
                          >
                            {open.approve ? "Save approval" : "Save rejection"}
                          </button>
                          <button type="button" onClick={() => setAnswering(null)} className={BTN}>
                            Cancel
                          </button>
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
