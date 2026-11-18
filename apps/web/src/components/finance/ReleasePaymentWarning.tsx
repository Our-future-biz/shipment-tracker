"use client";

import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { Alert, Button, Input, Modal } from "antd";
import { useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useReleaseCheck, receivableKeys, type ReleaseCheck } from "@/hooks/useReceivables";
import { arInvoiceHref } from "@/lib/accountsReceivable";
import {
  answeredSince,
  combinedReleaseState,
  MIN_OVERRIDE_REASON,
  PAYMENT_NOT_CHECKED,
  releaseCheckState,
  releaseReason,
  unpaidInvoiceDetail,
  type ReleaseCheckState,
} from "@/lib/paymentWarnings";
import { useAuth } from "@/lib/auth/AuthContext";
import { HINT, LABEL_TEXT, LINK, MODAL_TITLE } from "@/styles/ui";

// The payment warning at a release (Council Outlay 10, D20): the House B/L release, Warehouse Released and the
// Warehouse Concept's "Charges" gate. A warning the person reads and can go past ("Release anyway").
// A check that fails or is slow never holds a release up: it is then released without the warning, with a small note.
// The prepayment stop (step 7) is the server's: it refuses the House B/L release and Warehouse Released of a job on
// prepayment that is not paid (or whose payment could not be checked). The screens show its sentence as it is, and a
// manager may send the release again with a reason. Nothing is stopped here.

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

/** The unpaid invoices of the job, each leading to it on Finance → Accounts Receivable, and why it warns. */
export function ReleasePaymentWarning({ check, label, className }: { check: ReleaseCheck; label?: ReactNode; className?: string }) {
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
        check.unpaid.length > 0 ? (
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

/** Hidden on the screen, read by a screen reader (inline, so the Modal's own header styles cannot undo it). */
const SCREEN_READER_ONLY: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

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
    <Modal open={open} onCancel={onClose} footer={null} width={width} closable={false} destroyOnHidden title={title} styles={{ header: SCREEN_READER_ONLY }}>
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
