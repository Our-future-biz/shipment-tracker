"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Alert, Button, Dropdown, Form, Input, Select, Tooltip } from "antd";
import { CheckOutlined, DownOutlined, LockOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { KpiTile } from "@/components/KpiTile";
import type { interfaces } from "@/lib/api/client";
import { formatDate } from "@/lib/date";
import type { QuoteStatus, SettableQuoteStatus } from "../../../_lib/types";
import {
  QUOTE_STATUS_MAP,
  SETTABLE_QUOTE_STATUSES,
  OPEN_QUOTE_STATUSES,
  LOST_REASONS,
  VALIDITY_OPTIONS,
  winProbClass,
} from "../../../_lib/types";
import { asData, businessToday, statusLines, validUntilAfter } from "../../../_lib/salesQuote";
import { DEFAULT_VALIDITY_DAYS, asksValidity, type StatusChange } from "../../../_lib/statusChange";
import { SalesDialog } from "../../../_components/SalesDialog";
import { toolbarButtonClass } from "../../../_components/ToolbarButton";
import { OwnerTile } from "./OwnerTile";

interface Props {
  // The quote as the server returned it. Its status, what it may be set to, its validity, its
  // owner and its last contact are the server's - nothing here works them out again.
  quote: interfaces.SalesQuoteItem;
  // Why the quote may not be sent or marked Ready to send now (its margin waits for a manager's
  // approval); null when nothing stops it. The server refuses those moves with the same words.
  sendBlocked: string | null;
  // Asks the server for the change. Resolves with why it was refused - a sentence that finishes
  // "QCZ… - …" - or with null once the quote is changed.
  onChange: (change: StatusChange) => Promise<string | null>;
  // Where a quote is opened: the revision a Replaced quote names is a link.
  hrefOf: (quoteNumber: string) => string;
  // Asks the server to record that the customer was contacted, with the note if one was left.
  // Resolves like onChange.
  // The owner is being changed: its control waits for the server's answer.
  changingOwner: boolean;
  // Asks the server for another owner, or for none.
  onChangeOwner: (ownerUserId: string | null) => void;
  // The quote is closed: it keeps its owner (the server refuses another), so the tile only shows them.
  ownerLocked: boolean;
  // The quote's price tile, shown first in the row of tiles.
  price: ReactNode;
}

// The date and the probability, drawn as large as the price tile beside them is tall.
const FIGURE_CLASS = "text-2xl font-bold leading-tight tabular-nums";

// The main forward flow shown as a chain of steps.
const FLOW: readonly QuoteStatus[] = ["draft", "ready_to_send", "quoted", "feedback", "revised", "won"];

const anyOf = new Intl.ListFormat("en", { type: "disjunction" });

// What stands under the validity date of a quote that is still in play: how long the date holds,
// counted by the company's calendar day as the server judges expiry. The date of a quote that
// was won or lost is a fact about it, not a deadline, and gets no note.
function validityNote(validUntil: string | null, today: string): string {
  if (validUntil === null) return "Set under Shipping terms";
  const days = dayjs(validUntil).diff(dayjs(today), "day");
  if (days < 0) return "Passed";
  if (days === 0) return "Last day";
  return days === 1 ? "1 day left" : `${days} days left`;
}

// The band under the quote's header: where the quote stands in its lifecycle and the way to move
// it on, and under that the four facts the server keeps beside the document - validity, win
// probability, owner and last contact. Each of them is changed at once by its own request, not
// with the form below.
// The moves the margin floor stops until a manager approves the margin.
const SENDING_STATUSES: readonly string[] = ["ready_to_send", "quoted"];

export function LifecycleBar({ quote, sendBlocked, onChange, hrefOf, changingOwner, onChangeOwner, ownerLocked, price }: Props) {
  const data = asData(quote.data);
  // The status that counts: Expired for a Quoted or Feedback quote whose validity has passed.
  const current = quote.effectiveStatus;
  const def = QUOTE_STATUS_MAP[current];
  const expired = current === "expired";
  const currentIndex = FLOW.indexOf(current);
  // The statuses the history shows the quote in: the one each status line names, and the one it
  // says the quote left.
  const history = statusLines(data);
  const visited = new Set(history.flatMap((entry) => [entry.status, entry.from]));
  // The revision that took a Replaced quote's place: the server names it on the quote.
  const revision = current === "replaced" ? (data.replacedBy ?? null) : null;
  // Whether the quote has a step of the chain behind it. Only steps it really took are ticked: a
  // quote that went from Quoted straight to Won never was in Feedback or Revised, and one that
  // was sent again after a revision still has both behind it.
  const isDone = (key: string, i: number) => {
    // Won is where the chain ends: a quote that got there has that step behind it as well. No
    // other quote has - a Won in the history of a quote that is not Won was taken back when its
    // shipment was removed, and a tick at the end of the chain would still say "won".
    if (key === "won") return current === "won";
    if (key === current) return false;
    // A quote from before the history was kept has no status line to go by: every step left of
    // where it stands counts.
    if (!history.length) return i < currentIndex;
    // Every quote starts as a Draft, and old quotes got no line for it.
    return key === "draft" || visited.has(key);
  };
  // A quote that expired by its date is still stored as Quoted or Feedback, with that status's
  // probability; what is shown goes with the status that is shown.
  const winProb = (current === quote.status ? data.winProbability : undefined) ?? def?.winProbability ?? 0;
  // What the server lets the quote be set to now, in its order. Revised is not among them here: a
  // revision is a new quote, made only when the user clicks Revise in the quote's toolbar.
  const targets = quote.allowedTransitions.flatMap((key) => (key === "revised" ? [] : (SETTABLE_QUOTE_STATUSES.find((status) => status === key) ?? [])));
  const revisable = quote.allowedTransitions.includes("revised");
  const targetLabels = targets.map((key) => QUOTE_STATUS_MAP[key]?.label ?? key);
  // Expired because its validity date has passed - and so back in play once that date is moved.
  // A quote the old bulk menu stored as Expired is not.
  const expiredByDate = expired && quote.status !== "expired";
  // The quote is with the customer: a contact with them can be recorded, and is due after three days.

  // Sending keeps a validity that still holds. Days are asked for exactly when the server would
  // use them: the quote has no validity date, or the one it has is past - by the same calendar
  // day the server goes by.
  const today = businessToday();
  const askValidityDays = asksValidity(quote.validUntil, today);

  const [target, setTarget] = useState<SettableQuoteStatus | null>(null);
  const [validityDays, setValidityDays] = useState<number>(DEFAULT_VALIDITY_DAYS);
  const [lostCategory, setLostCategory] = useState<string>(Object.keys(LOST_REASONS)[0] ?? "Pricing");
  const [lostReason, setLostReason] = useState<string>("");
  const [comment, setComment] = useState<string>("");
  // The request is on its way: the dialog waits for the server's answer.
  const [applying, setApplying] = useState(false);
  // Why the server refused the change asked for in the open dialog.
  const [refusal, setRefusal] = useState<string | null>(null);
  // The "Followed up" dialog is open.

  const openTransition = (next: SettableQuoteStatus) => {
    setTarget(next);
    setComment("");
    setRefusal(null);
    // A quote sent with days before is offered the same number again.
    if (next === "quoted") setValidityDays(VALIDITY_OPTIONS.find((d) => d === data.validityDays) ?? DEFAULT_VALIDITY_DAYS);
    if (next === "lost") {
      const firstCat = Object.keys(LOST_REASONS)[0] ?? "Pricing";
      setLostCategory(firstCat);
      setLostReason(LOST_REASONS[firstCat]?.[0] ?? "");
    }
  };

  // The dialog closes once the server has made the change; a refusal is shown in it, with the
  // choices still there.
  const applyTransition = async () => {
    if (!target) return;
    setApplying(true);
    setRefusal(null);
    const refused = await onChange({
      status: target,
      comment,
      validityDays: target === "quoted" && askValidityDays ? validityDays : undefined,
      lostReason: target === "lost" ? `${lostCategory}: ${lostReason}` : undefined,
    });
    setApplying(false);
    if (refused) setRefusal(refused);
    else setTarget(null);
  };

  // The status the quote already has is not offered: there is nothing to say anew about it.
  // A move the margin floor stops is still offered - the server has the last word - with the reason beside it.
  const nextItems = targets.flatMap((key, i) => {
    if (key === current) return [];
    const blocked = sendBlocked && SENDING_STATUSES.includes(key);
    const label = blocked ? (
      <Tooltip title={sendBlocked} placement="left">
        <span>{targetLabels[i]} <span className="text-[11px] text-red-600">· margin needs approval</span></span>
      </Tooltip>
    ) : (
      targetLabels[i]
    );
    return [{ key, label, onClick: () => openTransition(key) }];
  });

  return (
    <div className="bg-white border-b border-slate-200 px-6 py-3.5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {current === "lost" || current === "replaced" || expired ? (
          // A quote that left the chain: one line says where it is and, for Expired, the ways out.
          <div className="flex-[1_1_560px] min-w-0 flex items-center gap-2 text-[13px]">
            <span className={`w-2 h-2 rounded-full shrink-0 ${def?.tone.dot ?? ""}`} />
            <span className={`shrink-0 font-medium ${def?.tone.text ?? ""}`}>
              {def?.label}
            </span>
            {current === "replaced" ? (
              <span className="text-slate-500">
                — kept as it was sent.{" "}
                {revision ? (
                  <>
                    Replaced by its revision{" "}
                    <Link href={hrefOf(revision)} className="font-medium text-indigo-600 hover:underline">
                      {revision}
                    </Link>
                    .
                  </>
                ) : (
                  "Replaced by its revision."
                )}
              </span>
            ) : expired ? (
              // The ways out of Expired, as the server allows them.
              <span className="text-slate-500">
                — {expiredByDate && `its validity ended on ${formatDate(quote.validUntil)}. `}
                Change its status to {anyOf.format(targetLabels)}
                {revisable && ", or revise it with Revise above - a later Valid until is set on the revision"}.
              </span>
            ) : (
              <span className="text-slate-500">— quote is closed</span>
            )}
          </div>
        ) : (
          <ol aria-label="Quote lifecycle" className="flex-[1_1_560px] min-w-0 flex items-center m-0 p-0 list-none overflow-x-auto">
            {FLOW.map((key, i) => {
              const isCurrent = key === current;
              const done = isDone(key, i);
              const last = i === FLOW.length - 1;
              const circle = done
                ? "bg-indigo-500 text-white"
                : isCurrent
                  ? "bg-white border-2 border-indigo-500 text-indigo-500"
                  : "bg-white border-2 border-slate-200 text-slate-400";
              const label = isCurrent ? "font-semibold text-slate-800" : done ? "font-medium text-slate-600" : "text-slate-500";
              return (
                <li key={key} aria-current={isCurrent ? "step" : undefined} className={`flex items-center min-w-0 ${last ? "shrink-0" : "flex-auto"}`}>
                  <span className={`shrink-0 flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold ${circle}`}>
                    {done ? <CheckOutlined /> : i + 1}
                  </span>
                  <span className={`ml-2 text-xs whitespace-nowrap ${label}`}>{QUOTE_STATUS_MAP[key]?.label}</span>
                  {!last && <span aria-hidden className={`flex-1 min-w-3 h-0.5 mx-3 ${done ? "bg-indigo-500" : "bg-slate-200"}`} />}
                </li>
              );
            })}
          </ol>
        )}

        <Dropdown menu={{ items: nextItems }} disabled={nextItems.length === 0} trigger={["click"]}>
          <button type="button" disabled={nextItems.length === 0} className={toolbarButtonClass()}>
            Change status <DownOutlined className="text-[10px]" />
          </button>
        </Dropdown>
      </div>

      {/* The price first, then the three facts about the quote. */}
      <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,0.5fr)_minmax(0,0.5fr)_minmax(0,1fr)] gap-3">
        {price}
        {/* Red only on a quote that is Expired: the date of a quote that was won, lost or is
            being reworked is a fact about it, not an alarm. */}
        <KpiTile
          label="Valid until"
          size="text"
          centered
          tone={expired ? "red" : undefined}
          value={quote.validUntil ? <span className={FIGURE_CLASS}>{formatDate(quote.validUntil)}</span> : EMPTY_CELL}
          hint={expired ? "Expired" : OPEN_QUOTE_STATUSES.includes(current) ? validityNote(quote.validUntil, today) : undefined}
          hintTone={expired ? "red" : undefined}
        />
        <KpiTile
          label="Win probability"
          size="text"
          centered
          value={<span className={FIGURE_CLASS}>{winProb}%</span>}
          hint={
            <div className="h-4 flex items-center">
              <div
                role="progressbar"
                aria-label="Win probability"
                aria-valuenow={winProb}
                aria-valuemin={0}
                aria-valuemax={100}
                className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"
              >
                <div className={`h-full rounded-full transition-all ${winProbClass(winProb)}`} style={{ width: `${winProb}%` }} />
              </div>
            </div>
          }
        />
        <OwnerTile quote={quote} changing={changingOwner} locked={ownerLocked} onChange={onChangeOwner} />
      </div>

      {/* The dialog of a status change, in the frame of every Sales dialog. While the request is on
          its way it can only be waited for; a refusal is shown in it, with the choices still there. */}
      <SalesDialog
        open={!!target}
        onClose={() => setTarget(null)}
        busy={applying}
        title={target ? `Move to ${QUOTE_STATUS_MAP[target]?.label ?? target}` : ""}
        footer={
          <>
            <Button disabled={applying} onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button type="primary" loading={applying} onClick={applyTransition}>
              Change status
            </Button>
          </>
        }
      >
        {!refusal && sendBlocked && target && SENDING_STATUSES.includes(target) && (
          <div className="mb-4">
            <Alert type="warning" showIcon message={sendBlocked} />
          </div>
        )}
        {refusal && (
          <div className="mb-4">
            <Alert type="error" showIcon message={`${quote.quoteNumber} - ${refusal}`} />
          </div>
        )}
        <Form layout="vertical" disabled={applying}>
          {/* The quote has one validity date. Days are asked for only while it has none that
              still holds, and what they come to is shown, so this dialog and Shipping terms never
              say different things. */}
          {target === "quoted" &&
            (askValidityDays ? (
              <Form.Item label="Validity (days)" extra={`Valid until ${formatDate(validUntilAfter(today, validityDays))}`}>
                {quote.validUntil && <div className="text-xs text-red-600 mb-1">The previous validity {formatDate(quote.validUntil)} has passed.</div>}
                <Select
                  aria-label="Validity (days)"
                  value={validityDays}
                  onChange={setValidityDays}
                  options={VALIDITY_OPTIONS.map((d) => ({ value: d, label: `${d} days` }))}
                />
              </Form.Item>
            ) : (
              // A validity that still holds is not this dialog's to change: shown locked, not as a field.
              <Form.Item label="Validity" extra="To change it, set Valid until under Shipping terms before you confirm.">
                <div className="flex items-center gap-2 h-9 px-3 rounded-lg bg-slate-100 text-[13px] text-slate-600">
                  <span className="min-w-0 flex-1 truncate">Valid until {formatDate(quote.validUntil)}</span>
                  <LockOutlined className="!text-slate-400" title="Set under Shipping terms" />
                </div>
              </Form.Item>
            ))}
          {target === "lost" && (
            <>
              <Form.Item label="Reason category">
                <Select
                  aria-label="Reason category"
                  value={lostCategory}
                  onChange={(c) => {
                    setLostCategory(c);
                    setLostReason(LOST_REASONS[c]?.[0] ?? "");
                  }}
                  options={Object.keys(LOST_REASONS).map((c) => ({ value: c, label: c }))}
                />
              </Form.Item>
              <Form.Item label="Reason">
                <Select
                  aria-label="Reason"
                  value={lostReason}
                  onChange={setLostReason}
                  options={(LOST_REASONS[lostCategory] ?? []).map((r) => ({ value: r, label: r }))}
                />
              </Form.Item>
            </>
          )}
          <Form.Item label="Comment (optional)" className="!mb-0">
            <Input.TextArea aria-label="Comment (optional)" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
          </Form.Item>
        </Form>
      </SalesDialog>
    </div>
  );
}
