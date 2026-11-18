"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Segmented } from "antd";
import { CheckOutlined, CloseOutlined } from "@ant-design/icons";
import { useToast } from "@/lib/toast";
import { formatDateTime } from "@/lib/date";
import { errorMessage } from "@/app/warehouse-concept/gate-log/_lib/gate";
import { Pill } from "@/components/Pill";
import { BTN, BTN_DANGER, BTN_PRIMARY, CARD, CARD_BAR, CARD_TITLE, EMPTY_STATE, HINT, LABEL_TEXT, LINK, REF, TD, TEXTAREA, TH } from "@/styles/ui";

// One kind of request waiting for a manager's approval (a change of Customs Office, of an approved
// document): what is asked for is the caller's, the rest is the same - approve, or reject with a
// reason, the same two buttons and reason box as Quote inquiries. The answer goes to whoever asked.
// A kind whose approval needs a reason too (a release before payment) asks for one with its own question
// (`approveNeedsReason`), and may say under an answer what became of it (`answeredNote`); a request the app
// closed itself ("closed") is listed among the answered ones, marked so. A request the signed-in manager may not
// answer (`cannotDecide`: their own, where four eyes are asked for) shows why in place of the two buttons.

// The app's text box, as wide as the row and drawn taller by hand.
const ANSWER_BOX = `${TEXTAREA} w-full resize-y`;
const HEAD = `${TH} !px-4`;
const CELL = `${TD} !px-4 !py-3 !align-top`;

interface ApprovalRequest {
  id: string;
  shipmentId: string;
  jobNumber: string;
  customer: string;
  reason: string;
  /** closed: the app closed it - what it asked for was done another way. Only kinds that have it send it. */
  status: "pending" | "approved" | "rejected" | "closed";
  requestedByName: string;
  requestedAt: string;
  decidedByName: string;
  decidedAt: string | null;
  comment: string;
  answerSeenAt: string | null;
}

interface ApprovalsCardProps<T extends ApprovalRequest> {
  title: string;
  hint: string;
  whatHeader: string;
  /** What is asked for. */
  what: (request: T) => React.ReactNode;
  /** Where the shipment's name leads. */
  shipmentHref: (request: T) => string;
  /** An approval needs a reason as a rejection does (at least 3 characters). Without it the comment is optional. */
  approveNeedsReason?: boolean;
  /** What the reason box asks when approving, with `approveNeedsReason`. */
  approveReasonLabel?: string;
  /** Under an answer: what became of it (an approval used or run out, a request closed). Nothing when left out or null. */
  answeredNote?: (request: T) => React.ReactNode;
  /** Why the signed-in manager is not offered an answer to this waiting request, or null when they are. Left out: always offered. */
  cannotDecide?: (request: T) => string | null;
  /** The longest reason the box takes (the server's limit for this kind). Left out: 1000. */
  maxLength?: number;
  approvals: {
    requests: T[];
    waiting: number;
    isLoading: boolean;
    isError: boolean;
    decide: {
      isPending: boolean;
      mutateAsync: (answer: { id: string; shipmentId: string; approve: boolean; comment: string }) => Promise<unknown>;
    };
  };
}

const STATUS_PILL = {
  approved: { tone: "green", label: "Approved" },
  rejected: { tone: "red", label: "Rejected" },
  closed: { tone: "slate", label: "Closed" },
} as const;

export function ApprovalsCard<T extends ApprovalRequest>({
  title,
  hint,
  whatHeader,
  what,
  shipmentHref,
  approveNeedsReason = false,
  approveReasonLabel = "Reason for approval",
  answeredNote,
  cannotDecide,
  maxLength = 1000,
  approvals,
}: ApprovalsCardProps<T>) {
  const toast = useToast();
  const { requests, waiting, isLoading, isError, decide } = approvals;
  const [view, setView] = useState<"waiting" | "answered">("waiting");
  const [answering, setAnswering] = useState<{ id: string; approve: boolean } | null>(null);
  const [comment, setComment] = useState("");

  const listed = requests.filter((r) => (view === "waiting" ? r.status === "pending" : r.status !== "pending"));
  const start = (r: T, approve: boolean) => {
    setAnswering({ id: r.id, approve });
    setComment("");
  };
  const save = (r: T, approve: boolean) =>
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
          <div className={CARD_TITLE}>{title}</div>
          <div className={HINT}>{hint}</div>
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
              <th className={HEAD}>{whatHeader}</th>
              <th className={HEAD}>Reason</th>
              <th className={HEAD}>Asked</th>
              <th className={HEAD}>Answer</th>
            </tr>
          </thead>
          <tbody>
            {listed.length === 0 && (
              <tr>
                <td colSpan={5} className={`${EMPTY_STATE} px-4 ${isError ? "!text-red-600" : ""}`}>
                  {empty}
                </td>
              </tr>
            )}
            {listed.map((r) => {
              const open = answering?.id === r.id ? answering : null;
              // A rejection always says why; an approval only where the kind asks for it.
              const needsReason = !!open && (!open.approve || approveNeedsReason);
              const pill = r.status === "pending" ? null : STATUS_PILL[r.status];
              const note = r.status !== "pending" && answeredNote ? answeredNote(r) : null;
              const refused = r.status === "pending" && cannotDecide ? cannotDecide(r) : null;
              return (
                <Fragment key={r.id}>
                  <tr>
                    <td className={CELL}>
                      <Link href={shipmentHref(r)} className={`${REF} font-bold ${LINK}`}>
                        {r.jobNumber || "—"}
                      </Link>
                      <div className={HINT}>{r.customer || "—"}</div>
                    </td>
                    <td className={`${CELL} max-w-[340px]`}>{what(r)}</td>
                    <td className={`${CELL} max-w-[260px] whitespace-pre-wrap`}>{r.reason}</td>
                    <td className={`${CELL} whitespace-nowrap`}>
                      {r.requestedByName || "—"}
                      <div className={`${HINT} tabular-nums`}>{formatDateTime(r.requestedAt)}</div>
                    </td>
                    <td className={CELL}>
                      {refused ? (
                        <div className={`${HINT} max-w-[280px]`}>{refused}</div>
                      ) : r.status === "pending" ? (
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
                          {pill && <Pill tone={pill.tone}>{pill.label}</Pill>}
                          {/* A request the app closed while it waited was answered by nobody: no name, no time. */}
                          {(r.decidedByName || r.decidedAt) && (
                            <div className={`${HINT} mt-1 tabular-nums`}>
                              {r.decidedByName || "—"} · {formatDateTime(r.decidedAt)}
                              {r.answerSeenAt ? " · seen" : ""}
                            </div>
                          )}
                          {r.comment && r.status !== "closed" && <div className="text-[12px] text-slate-700 mt-1 max-w-[280px] whitespace-pre-wrap">{r.comment}</div>}
                          {note && <div className={`${HINT} mt-1 max-w-[280px] tabular-nums`}>{note}</div>}
                        </div>
                      )}
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <td colSpan={5} className="px-4 pb-4 pt-2">
                        <label className={`block ${LABEL_TEXT} mb-1`}>
                          {!open.approve ? "Reason for rejection" : approveNeedsReason ? approveReasonLabel : "Comment (optional)"}
                          <span className={`block ${HINT} font-normal tracking-normal normal-case mt-0.5`}>Sent to {r.requestedByName || "whoever asked"}</span>
                        </label>
                        <textarea
                          autoFocus
                          rows={2}
                          value={comment}
                          maxLength={maxLength}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder={!open.approve ? "Why it stays as it is…" : approveNeedsReason ? "Why it is approved…" : "Anything they should know…"}
                          className={`${ANSWER_BOX} max-w-[620px]`}
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            type="button"
                            disabled={decide.isPending || (needsReason && comment.trim().length < 3)}
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
