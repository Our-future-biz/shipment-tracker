"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { Alert, Button, Input, Modal } from "antd";
import { useQueries } from "@tanstack/react-query";
import { api, apiErrorMessage } from "@/lib/api";
import { useReleaseCheck, receivableKeys, type ReleaseCheck } from "@/hooks/useReceivables";
import { useReleaseRequest } from "@/hooks/useReleaseRequests";
import { OPERATIONS_APPROVALS_HREF } from "@/lib/operationsApprovals";
import { useToast } from "@/lib/toast";
import { arInvoiceHref } from "@/lib/accountsReceivable";
import {
  answeredSince,
  askedBefore,
  canAskForRelease,
  combinedReleaseState,
  MIN_OVERRIDE_REASON,
  overrideReasonOk,
  PASS_CHECKING,
  PASS_NOT_READ,
  PAYMENT_NOT_CHECKED,
  RELEASE_WHAT_LABEL,
  releaseCheckState,
  releasePassUsable,
  releaseReason,
  releaseRequestState,
  uninvoicedReleaseLine,
  unpaidInvoiceDetail,
  type ReleaseCheckState,
  type ReleaseWhat,
} from "@/lib/paymentWarnings";
import { useAuth } from "@/lib/auth/AuthContext";
import { canWithdrawOwnRequest } from "@/lib/releaseRequestQueue";
import { WithdrawReleaseRequest } from "./WithdrawReleaseRequest";
import { HINT, LABEL_TEXT, LINK, MODAL_TITLE } from "@/styles/ui";

// The payment warning at a release (Council Outlay 10, D20): the House B/L release, Warehouse Released and the
// Warehouse Concept's "Charges" gate. A warning the person reads and can go past ("Release anyway").
// A check that fails or is slow never holds a release up: it is then released without the warning, with a small note.
// The prepayment stop (step 7) is the server's: it refuses the House B/L release and Warehouse Released of a job on
// prepayment that is not paid (or whose payment could not be checked). The screens show its sentence as it is, and a
// manager may send the release again with a reason. Nothing is stopped here.
// A user the stop refused asks a manager from the same place ("Ask a manager to release", Council Outlay 11, D16):
// the request waits on Shipments → Managers → Approvals. An approval releases nothing: for 7 days it lets the job
// be released once, the usual way, by whoever makes the release - so a dialog that would say "stopped" says the
// release goes through on the approval instead (useReleasePass, hooks/useReleaseRequests). Where the request stands
// is shown on the job. A manager keeps their own way - the reason field - and only reads the request's state.

/** How long a release waits for the first answer of the check before it goes ahead without it. */
const CHECK_WAIT_MS = 3000;

/** Turns true once `active` has lasted `ms` without being turned off. */
function useTimedOut(active: boolean, ms = CHECK_WAIT_MS): boolean {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    setTimedOut(false);
    if (!active) return;
    const t = setTimeout(() => setTimedOut(true), ms);
    return () => clearTimeout(t);
  }, [active, ms]);
  return timedOut;
}

/**
 * When `active` last turned on (Date.now()), null while it is off. It is set after the render in which `active` turns
 * on, so that render, too, finds no fresh answer: an answer kept from an earlier opening never counts as one.
 */
function useActiveSince(active: boolean): number | null {
  const [since, setSince] = useState<number | null>(null);
  useEffect(() => {
    setSince(active ? Date.now() : null);
  }, [active]);
  return active ? since : null;
}

/**
 * The release check of one job, read while `active` (a release dialog is open, or a release line is shown). Only an
 * answer read since it became active counts: one kept from an earlier opening is still "checking" (D20).
 */
export function useReleaseCheckState(shipmentId: string | null | undefined, active: boolean): { check: ReleaseCheck | undefined; state: ReleaseCheckState } {
  const q = useReleaseCheck(shipmentId, active);
  const since = useActiveSince(active && !!shipmentId);
  const fresh = !!q.data && answeredSince(q.dataUpdatedAt, since);
  const timedOut = useTimedOut(active && !!shipmentId && !fresh);
  // Not read (no job, or nothing is being released): nothing to say.
  if (!shipmentId || !active) return { check: undefined, state: "clear" };
  return { check: fresh ? q.data : undefined, state: releaseCheckState({ data: q.data, fresh, isError: q.isError, failureCount: q.failureCount, timedOut }) };
}

/** The release checks of several jobs released at once (Vyskladnit on Stock), in the order of `shipmentIds`. */
export function useReleaseChecksState(shipmentIds: readonly string[], active: boolean) {
  const results = useQueries({
    queries: shipmentIds.map((id) => ({
      queryKey: receivableKeys.releaseCheck(id),
      queryFn: () => api.invoicing.receivableReleaseCheck(id),
      enabled: active,
      staleTime: 0,
    })),
  });
  // As for one job: only answers read since the dialog opened count.
  const since = useActiveSince(active);
  const fresh = results.map((r) => !!r.data && answeredSince(r.dataUpdatedAt, since));
  const waiting = active && fresh.some((f) => !f);
  const timedOut = useTimedOut(waiting);
  const items = shipmentIds.map((id, i) => {
    const r = results[i];
    const isFresh = fresh[i] ?? false;
    const state: ReleaseCheckState = active ? releaseCheckState({ data: r?.data, fresh: isFresh, isError: !!r?.isError, failureCount: r?.failureCount ?? 0, timedOut }) : "clear";
    return { shipmentId: id, check: active && isFresh ? r?.data : undefined, state };
  });
  return { items, state: combinedReleaseState(items.map((x) => x.state)) };
}

/**
 * The unpaid invoices of the job, each leading to it on Finance → Accounts Receivable, and why it warns; for a customer
 * on prepayment also what is not invoiced yet (the stop before any invoice, mock test council n6).
 */
export function ReleasePaymentWarning({ check, label, className }: { check: ReleaseCheck; label?: ReactNode; className?: string }) {
  const uninvoiced = uninvoicedReleaseLine(check);
  return (
    <Alert
      className={className}
      type="warning"
      showIcon
      message={
        <>
          {label && <span className="font-semibold">{label}: </span>}
          {releaseReason(check)}
        </>
      }
      description={
        check.unpaid.length > 0 || uninvoiced ? (
          <ul className="m-0 pl-0 list-none text-[13px]">
            {check.unpaid.map((i) => (
              <li key={i.invoiceId}>
                Invoice{" "}
                <Link href={arInvoiceHref(i.invoiceId)} className={LINK} target="_blank">
                  {i.number}
                </Link>{" "}
                is unpaid ({unpaidInvoiceDetail(i)}).
              </li>
            ))}
            {uninvoiced && <li>{uninvoiced}</li>}
          </ul>
        ) : undefined
      }
    />
  );
}

/** The small note when the payment could not be checked: the release goes ahead without the warning. */
export function PaymentNotCheckedNote({ className = "" }: { className?: string }) {
  return <div className={`${HINT} ${className}`}>{PAYMENT_NOT_CHECKED}</div>;
}

/**
 * What a release dialog shows of the check: "Checking payment…", the warning, or the small note. Nothing when the
 * job is clear.
 */
export function ReleaseCheckBody({ check, state, label }: { check: ReleaseCheck | undefined; state: ReleaseCheckState; label?: ReactNode }) {
  if (state === "checking") return <div className={HINT}>Checking payment…</div>;
  if (state === "unknown") return <PaymentNotCheckedNote />;
  if (state === "warn" && check) return <ReleasePaymentWarning check={check} label={label} />;
  return null;
}

/** Roles that may release a job stopped for prepayment, with a reason: the server's (canDecideQuoteInquiry). */
export const RELEASE_OVERRIDE_ROLES = ["superadmin", "admin", "manager"] as const;

/** Whether the signed-in user is a manager who may release a stopped job with a reason. */
export const useCanOverrideReleaseStop = (): boolean => {
  const { user } = useAuth();
  return !!user && (RELEASE_OVERRIDE_ROLES as readonly string[]).includes(user.role);
};

/** The server's refusal of a stopped release, as it said it: the release did not happen. */
export function ReleaseStopAlert({ message, label, className }: { message: string; label?: ReactNode; className?: string }) {
  return (
    <Alert
      className={className}
      type="error"
      showIcon
      message={
        <>
          {label && <span className="font-semibold">{label}: </span>}
          Not released
        </>
      }
      description={<span className="text-[13px]">{message}</span>}
    />
  );
}

/** A manager's reason to release a stopped job (at least 3 characters): recorded with the release. */
export function OverrideReasonField({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={`block mb-1 ${LABEL_TEXT}`}>
        Release with a reason
      </label>
      <Input.TextArea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoSize={{ minRows: 2, maxRows: 4 }}
        maxLength={500}
        placeholder="Why it is released before it is paid"
      />
      <div className={`${HINT} mt-1`}>At least {MIN_OVERRIDE_REASON} characters. Recorded with the release, with your name.</div>
    </div>
  );
}

const REQUEST_TONE = { amber: "text-amber-700", green: "text-emerald-700", red: "text-red-700", slate: "text-slate-500" } as const;

/**
 * "Ask a manager to release", and where the job's request for this release stands. For a user the prepayment stop
 * refused (`offer`): the button opens a small dialog for the reason; once asked, the line says
 * "Asked 18.11. 14:02 — waiting for a manager". Approved, it says "Approved by …: <why> — release it now (valid
 * until 25.11.)" and there is no button: the release is made the usual way and goes through. After that
 * "Released on …'s approval, by …"; an approval nobody used in time "ran out unused", and a rejection
 * "Rejected by …: <why>" - both can be asked again. A manager gets no button - they release with a reason
 * themselves - only the line, and while a request waits the way to the Approvals tab. Nothing is drawn while
 * there is neither (a request the app closed because the job was released another way is not shown).
 * Where the release was just stopped (`offer`), nothing is offered before the job's requests were read since this
 * place opened - "Checking for an approval…" - so the button never shows for a moment beside an approval that
 * stands; and when they could not be read, that is said, not passed over.
 */
export function AskManagerToRelease({
  shipmentId,
  what,
  offer = false,
  released = false,
  label,
  releaseHref,
  className = "",
}: {
  shipmentId: string | null | undefined;
  what: ReleaseWhat;
  /** The stop refused this release (or the check says it will): the button is offered to a user. */
  offer?: boolean;
  /** The thing is released: nothing left to ask for, and only an approval still explains it. */
  released?: boolean;
  /** Names the job where several are shown together - or the release, where a job shows both. */
  label?: ReactNode;
  /** Where the release itself is made, when it is not made here: linked beside an approval that can be used. */
  releaseHref?: string;
  className?: string;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const manager = useCanOverrideReleaseStop();
  const { latestOf, ask, read } = useReleaseRequest(shipmentId, !!shipmentId);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const reasonId = useId();

  // Not read since this place opened: where a stop is being answered (`offer`) nothing is said from an older read.
  const checking = offer && read === "checking";
  const notRead = offer && read === "failed";
  const latest = checking || notRead ? null : latestOf(what);
  const state = releaseRequestState(latest, { released, viewerId: user?.id });
  // Not read: a user may ask all the same - the server refuses a second request and says why.
  const canAsk = offer && !checking && !manager && !released && !!shipmentId && canAskForRelease(latest);
  if (checking) {
    return (
      <div className={`${HINT} ${className}`} aria-live="polite">
        {label && <span className="font-semibold">{label}: </span>}
        {PASS_CHECKING}
      </div>
    );
  }
  if (!state && !canAsk && !notRead) return null;

  const start = () => {
    setReason("");
    setError("");
    setOpen(true);
  };
  const send = () => {
    if (!overrideReasonOk(reason) || ask.isPending) return;
    setError("");
    ask
      .mutateAsync({ what, reason: reason.trim() })
      .then(() => {
        toast.success("Asked — waiting for a manager");
        setOpen(false);
      })
      // The server's refusal as it is: not held for payment, a request already waits, not this user's job.
      .catch((e) => setError(apiErrorMessage(e)));
  };

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      {notRead && (
        <span className="text-[12px] font-medium text-amber-700">
          {label && <span className="font-semibold">{label}: </span>}
          {PASS_NOT_READ}.
        </span>
      )}
      {state && (
        <span className={`text-[12px] font-medium [overflow-wrap:anywhere] ${REQUEST_TONE[state.tone]}`}>
          {label && <span className="font-semibold">{label}: </span>}
          {state.text}
          {releaseHref && releasePassUsable(latest) && (
            <>
              {" · "}
              <Link href={releaseHref} className={LINK}>
                Release it from Stock
              </Link>
            </>
          )}
          {manager && latest?.status === "pending" && (
            <>
              {" · "}
              <Link href={OPERATIONS_APPROVALS_HREF} className={LINK}>
                Answer it in Approvals
              </Link>
            </>
          )}
        </span>
      )}
      {/* Whoever asked takes their request back while it still waits (council K20). */}
      {latest && canWithdrawOwnRequest(latest, user?.id) && <WithdrawReleaseRequest request={latest} kind="request" />}
      {canAsk && (
        <Button size="small" onClick={start}>
          {label && !state && !notRead ? <>Ask a manager to release {label}</> : state && askedBefore(latest) ? "Ask a manager again" : "Ask a manager to release"}
        </Button>
      )}
      <Modal
        open={open}
        title="Ask a manager to release"
        width={460}
        onCancel={() => !ask.isPending && setOpen(false)}
        destroyOnHidden
        okText="Ask"
        okButtonProps={{ disabled: !overrideReasonOk(reason) }}
        confirmLoading={ask.isPending}
        onOk={send}
      >
        <div className="flex flex-col gap-2">
          <div className="text-[13px] text-slate-700">
            {RELEASE_WHAT_LABEL[what]}
            {label ? <> of {label}</> : null}: a manager decides on Shipments → Managers, and you get the answer under the bell. Approved, you release it yourself, the usual way,
            within 7 days.
          </div>
          <label htmlFor={reasonId} className={`block ${LABEL_TEXT}`}>
            Reason
          </label>
          <Input.TextArea
            id={reasonId}
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={ask.isPending}
            autoSize={{ minRows: 2, maxRows: 4 }}
            maxLength={500}
            placeholder="Why it should be released before it is paid"
          />
          <div className={HINT}>At least {MIN_OVERRIDE_REASON} characters. The manager reads it; it is kept in the job&apos;s history.</div>
          <div aria-live="polite">{error && <div className="text-[13px] text-red-600">Not asked: {error}</div>}</div>
        </div>
      </Modal>
    </div>
  );
}

interface WarningConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description: string;
  confirmLabel: string;
  /** The label once a warning is shown: "Release anyway". */
  warnedLabel: string;
  /** A warning is shown: the button says `warnedLabel`. */
  warned: boolean;
  /** The check is still on its way (for a short while only): the button waits for it. */
  checking?: boolean;
  danger?: boolean;
  loading?: boolean;
  /** The button waits for something the person still has to give (a manager's reason). */
  confirmDisabled?: boolean;
  width?: number;
  /** The warning (or the note) under the description. */
  children?: ReactNode;
}

/** The app's confirmation (as ConfirmModal) with room for a payment or credit warning the person can go past. */
export function WarningConfirm({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  warnedLabel,
  warned,
  checking = false,
  danger = false,
  loading = false,
  confirmDisabled = false,
  width = 520,
  children,
}: WarningConfirmProps) {
  return (
    // The dialog is named by its title: the Modal's own title, which it links to the dialog (aria-labelledby), kept
    // for screen readers only, as the title is shown in the body beside the icon.
    <Modal open={open} onCancel={onClose} footer={null} width={width} closable={false} destroyOnHidden title={title} classNames={{ header: "sr-only" }}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0 ${danger ? "bg-red-100" : "bg-indigo-100"}`} aria-hidden>
          {danger ? "⚠️" : "ℹ️"}
        </div>
        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          {/* Read once, as the dialog's name. */}
          <div className={`${MODAL_TITLE} mb-1`} aria-hidden>
            {title}
          </div>
          <div className="text-[13px] text-slate-700 leading-relaxed">{description}</div>
          {children && <div className="mt-3">{children}</div>}
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="primary" danger={danger} onClick={onConfirm} loading={loading || checking} disabled={confirmDisabled}>
          {warned ? warnedLabel : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
