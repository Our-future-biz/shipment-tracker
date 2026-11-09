"use client";

import { useEffect, useState } from "react";
import { Input, Modal, Tooltip } from "antd";
import { useMessages } from "@/lib/toast";
import { DeleteOutlined } from "@ant-design/icons";
import { apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";
import { INPUT } from "@/styles/ui";
import { formatDateTime } from "@/lib/date";
import { normaliseAmount } from "@/lib/money";
import type { SellingAmountRequest } from "@/hooks/useSellingAmountRequests";

// The amount of a selling row a shipment sells on at cost (a master job's demurrage). The same as
// the cost or more is saved when the field is left. Less opens a window asking why, and goes to a
// manager on Sales → Managers → Quote inquiries: the row keeps its amount until a manager approves.

interface Props {
  amount: string;
  currency: string;
  /** What the shipment's share of the cost comes to; null while unknown. */
  cost: number | null;
  /** The row's newest request, if any. */
  request: SellingAmountRequest | undefined;
  /** Saves the number: resolves with whether it was written or asked. */
  onChange: (amount: string, reason?: string) => Promise<"saved" | "asked">;
  onWithdraw: (id: string) => Promise<unknown>;
  /** The row or its totals changed. */
  onDone: () => void;
}

const MIN_REASON = 3;

export function SoldAtCostAmount({ amount, currency, cost, request, onChange, onWithdraw, onDone }: Props) {
  const message = useMessages();
  const { user } = useAuth();
  const [text, setText] = useState(amount);
  const [asking, setAsking] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  // The row's amount changed (saved here, or a manager approved): the field shows it.
  useEffect(() => setText(amount), [amount]);

  const waiting = request?.status === "pending" ? request : undefined;
  // Only the one who asked takes it back (a manager rejects it instead, with a reason).
  const mine = !!waiting && !!user?.id && waiting.requestedById === user.id;
  // The row's share left the shipment: nothing to change until the master job's split is processed.
  const gone = cost === null;
  const rejected = request?.status === "rejected" ? request : undefined;

  const save = async (value: string, why?: string) => {
    setBusy(true);
    try {
      const outcome = await onChange(value, why);
      message.success(outcome === "asked" ? "Sent to a manager for approval" : "Selling amount saved");
      setAsking(null);
      setReason("");
      if (outcome === "asked") setText(amount);
      onDone();
    } catch (err) {
      message.error(apiErrorMessage(err));
      if (!why) setText(amount);
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    const value = normaliseAmount(text);
    if (value === null || value === "") {
      message.warning(`"${text}" is not a number`);
      setText(amount);
      return;
    }
    if (Number(value) === Number(amount)) {
      setText(amount);
      return;
    }
    if (cost !== null && Math.round(Number(value) * 100) < Math.round(cost * 100)) {
      // one request per row: a second would be refused
      if (waiting) {
        message.warning(mine ? "A request for this row already waits for a manager — take it back to ask again" : "A request for this row already waits for a manager");
        setText(amount);
        return;
      }
      setReason("");
      setAsking(value);
      return;
    }
    void save(value);
  };

  const cancel = () => {
    setAsking(null);
    setText(amount);
  };

  return (
    <div className="text-right">
      <input
        className={`${INPUT} w-full !h-[30px] text-right tabular-nums disabled:bg-slate-50 disabled:cursor-not-allowed`}
        value={text}
        inputMode="decimal"
        disabled={busy || gone}
        aria-label="Selling amount"
        title={
          gone
            ? "This row's share is no longer on the shipment: process the master job's split"
            : `The cost is ${cost.toFixed(2)} ${currency}: less than that needs a manager's approval`
        }
        onChange={(e) => setText(e.target.value)}
        onBlur={leave}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      {waiting && (
        <div className="mt-1 text-[11px] leading-snug text-amber-700">
          {waiting.kind === "remove" ? "Deleting it waits for a manager" : `${Number(waiting.requestedAmount).toFixed(2)} ${currency} waits for a manager`}
          {mine && (
            <button
              type="button"
              className="ml-1 underline bg-transparent border-none p-0 cursor-pointer text-amber-700"
              onClick={() =>
                void onWithdraw(waiting.id)
                  .then(onDone)
                  .catch((err) => message.error(apiErrorMessage(err)))
              }
            >
              Take back
            </button>
          )}
        </div>
      )}
      {rejected && (
        <div className="mt-1 text-[11px] leading-snug text-red-600" title={rejected.decidedAt ? formatDateTime(rejected.decidedAt) : undefined}>
          {rejected.kind === "remove" ? "Deleting it" : `${Number(rejected.requestedAmount).toFixed(2)} ${currency}`} rejected{rejected.decidedByName ? ` by ${rejected.decidedByName}` : ""}: {rejected.comment}
        </div>
      )}
      <Modal
        open={asking !== null}
        title="Selling below the cost"
        okText="Send for approval"
        cancelText="Cancel"
        confirmLoading={busy}
        okButtonProps={{ disabled: reason.trim().length < MIN_REASON }}
        onOk={() => asking !== null && void save(asking, reason.trim())}
        onCancel={cancel}
        destroyOnHidden
      >
        <p className="mt-0 mb-3 text-[13px] text-slate-700 text-left">
          {Number(asking ?? 0).toFixed(2)} {currency} is less than the cost of {cost?.toFixed(2)} {currency}. A manager approves it on Sales → Managers → Quote inquiries; until then the row stays at {amount}{" "}
          {currency}.
        </p>
        <label className="block text-left">
          <span className="block text-[12px] font-semibold text-slate-700 mb-1">Reason</span>
          <Input.TextArea autoFocus rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason for selling below the cost" />
        </label>
      </Modal>
    </div>
  );
}

interface RemoveProps {
  amount: string;
  currency: string;
  /** A request for this row waits for a manager: a second one is refused. */
  waiting: boolean;
  /** The row's share left the shipment: the server refuses until the master job's split is processed. */
  gone: boolean;
  className: string;
  onAsk: (reason: string) => Promise<unknown>;
}

/** Deleting a selling row a shipment sells on at cost: a window asks why, and a manager decides on Quote inquiries. */
export function SoldAtCostRemove({ amount, currency, waiting, gone, className, onAsk }: RemoveProps) {
  const message = useMessages();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      await onAsk(reason.trim());
      message.success("Sent to a manager for approval");
      setOpen(false);
    } catch (err) {
      message.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Tooltip
        title={
          gone
            ? "This row's share is no longer on the shipment: process the master job's split"
            : waiting
              ? "A request for this row is already waiting for a manager"
              : "Delete row - a manager approves it"
        }
      >
        <button
          type="button"
          disabled={waiting || gone}
          aria-label="Delete selling cost row"
          className={`${className} disabled:opacity-40 disabled:cursor-not-allowed`}
          onClick={() => {
            setReason("");
            setOpen(true);
          }}
        >
          <DeleteOutlined />
        </button>
      </Tooltip>
      <Modal
        open={open}
        title="Delete this selling row"
        okText="Send for approval"
        cancelText="Cancel"
        confirmLoading={busy}
        okButtonProps={{ disabled: reason.trim().length < MIN_REASON }}
        onOk={() => void send()}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        <p className="mt-0 mb-3 text-[13px] text-slate-700 text-left whitespace-normal">
          A manager approves it on Sales → Managers → Quote inquiries; until then the row stays at {Number(amount).toFixed(2)} {currency}.
        </p>
        <label className="block text-left">
          <span className="block text-[12px] font-semibold text-slate-700 mb-1">Reason</span>
          <Input.TextArea autoFocus rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason for deleting the row" />
        </label>
      </Modal>
    </>
  );
}
