"use client";

import { useState, type ReactNode } from "react";
import { Checkbox, Input, Modal } from "antd";
import { CheckCircleFilled, ClockCircleOutlined, CloseCircleFilled, UnlockOutlined } from "@ant-design/icons";
import type { GateMovement } from "@/hooks/useGateLog";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDateTime } from "@/lib/date";
import { TERMS } from "@/app/warehouse-concept/_lib/glossary";
import { Badge, isManager, type Tone } from "../../_lib/gate";
import { PICKUP_PIN_GATE, waitingGates } from "../../_lib/steps";
import { btnDanger, btnDefault, Section } from "./fields";
import { EXCEPTION_GATE } from "./ExceptionsPanel";
import { customsDue, movementCustomsClock } from "@/app/warehouse-concept/_lib/customsClock";
import { HINT } from "@/styles/ui";
import { PaymentNotCheckedNote, ReleasePaymentWarning, useReleaseCheckState } from "@/components/finance/ReleasePaymentWarning";
import { overrideLogParts, overrideSummary } from "../../_lib/overrideLog";

const isEmptyReturn = (g: string) => /empty return/i.test(g);
const isCharges = (g: string) => /^charges$/i.test(g);
const isCustomsLine = (g: string) => /^customs$/i.test(g);

// A supervisor override never clears Customs (owner's answer Q18 (b), 20 Nov 2026; the server's
// services/overrideCustoms): the Customs line is there and not OK.
export const customsHeld = (m: Pick<GateMovement, "releaseGates">) => m.releaseGates.some((x) => isCustomsLine(x.g) && x.s !== "OK");

const GATE_ICON: Record<string, ReactNode> = {
  OK: <CheckCircleFilled className="text-emerald-500" />,
  Pending: <ClockCircleOutlined className="text-amber-500" />,
  Blocked: <CloseCircleFilled className="text-red-500" />,
};

// Release gates in words, most decisive first: released (only after the WH release stamp),
// refused, cleared by override, clear, blocked.
export function releaseState(m: GateMovement): { tone: Tone; label: string; detail?: string } {
  if (m.impRelease) return { tone: "g", label: TERMS.released, detail: `${TERMS.whRelease} stamped ${formatDateTime(m.impRelease)}` };
  if (m.status === "Refused") return { tone: "r", label: "Refused", detail: m.refusalLog || undefined };
  // An open damage / short / over exception holds the cargo unless a supervisor overrode.
  if (m.openExceptions > 0 && !m.overridden) {
    return { tone: "r", label: "On hold", detail: `${m.openExceptions} open damage / short / over exception${m.openExceptions === 1 ? "" : "s"} — resolve to release` };
  }
  if (m.overridden && customsHeld(m)) {
    return { tone: "r", label: "Held by Customs", detail: "The supervisor override cleared the other lines; it never clears Customs — released once customs clears it" };
  }
  if (m.overridden) return { tone: "a", label: `${TERMS.clear} (supervisor override)`, detail: overrideSummary(m.overrideLog) || undefined };
  if (m.armed) return { tone: "g", label: TERMS.clear, detail: "All release gates OK" };
  return { tone: "r", label: TERMS.blocked, detail: `Waiting for: ${waitingGates(m).join(", ") || "—"}` };
}

// Release checklist: the release follows these gates. Any user ticks a line OK (or back to
// Pending) once it is met, each change logged; Customs follows the customs status and the
// Pick-up PIN line is set by the PIN check at the gate. The gate
// can Refuse (with a reason); a supervisor can override (with a reason).
export function ReleaseGatesPanel({
  m,
  refuse,
  override,
  setReleaseGate,
}: {
  m: GateMovement;
  refuse: (reason: string) => Promise<unknown>;
  override: (reason: string) => Promise<unknown>;
  setReleaseGate: (gate: string, ok: boolean) => Promise<unknown>;
}) {
  const { user } = useAuth();
  const [dialog, setDialog] = useState<"refuse" | "override" | null>(null);
  const [busyGate, setBusyGate] = useState<string | null>(null);
  const state = releaseState(m);
  const canRefuse = !m.impRelease && m.status !== "Refused";
  const supervisor = isManager(user);
  // Once an override is in force there is nothing more for one to clear (Customs it never clears).
  const canOverride = supervisor && !m.impRelease && !m.armed && !m.overridden;
  const isCustoms = isCustomsLine;
  const overrideParts = m.overridden ? overrideLogParts(m.overrideLog) : null;
  const isPickupPin = (g: string) => g === PICKUP_PIN_GATE;
  const isException = (g: string) => g === EXCEPTION_GATE;
  // Goods under customs control: days in temporary storage and the 90-day deadline, on the
  // Customs line (display only — the stored gate keeps its own note).
  const customs = movementCustomsClock(m);
  // The payment warning beside the Charges line (Council Outlay 10, D20): the job's invoice is unpaid and the
  // customer is on prepayment or has overdue invoices. Display only - the gate keeps its own state, set by the server,
  // and the server stops the WH release of a job on prepayment that is not paid (a manager releases with a reason).
  const payment = useReleaseCheckState(m.shipmentId, !m.impRelease && m.releaseGates.some((x) => isCharges(x.g)));
  const toggle = (gate: string, ok: boolean) => {
    setBusyGate(gate);
    setReleaseGate(gate, ok).finally(() => setBusyGate(null));
  };

  return (
    <Section title={TERMS.releaseGates} icon={<UnlockOutlined />}>
      <div className="flex flex-col gap-1">
        <Badge tone={state.tone} className="self-start">
          {state.label}
        </Badge>
        {state.detail && !(overrideParts && state.detail === overrideSummary(m.overrideLog)) && <div className={`${HINT} break-words`}>{state.detail}</div>}
        {m.overridden && <OverrideLog log={m.overrideLog} />}
      </div>

      <ul className="list-none m-0 mt-3 p-0 border-t border-slate-100">
        {m.releaseGates.map((x) => (
          <li key={x.g} className="flex items-start gap-2.5 py-1.5 text-[13px] border-b border-slate-100 last:border-b-0">
            {/* Ticked by hand once met; Customs follows the customs status, the Pick-up PIN line the
                PIN check, and nothing moves after release. */}
            {!isCustoms(x.g) && !isPickupPin(x.g) && !isException(x.g) && !m.impRelease ? (
              <Checkbox
                className="pt-[1px]"
                checked={x.s === "OK"}
                disabled={busyGate !== null}
                aria-label={`${x.g}: ${x.s === "OK" ? "OK — untick to set back to Pending" : "tick when met"}`}
                onChange={(e) => toggle(x.g, e.target.checked)}
              />
            ) : (
              <span className="pt-[1px]" title={x.s} aria-label={x.s}>
                {GATE_ICON[x.s]}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-slate-900">{x.g}</div>
              <div className={`${HINT} break-words`}>
                {x.note && x.note !== "—" ? x.note : x.s}
                {isEmptyReturn(x.g) ? " · does not hold release" : ""}
                {isCustoms(x.g) ? " · follows the customs status" : ""}
                {isPickupPin(x.g) ? " · set by the PIN check at the gate" : ""}
                {isException(x.g) ? (x.s === "OK" ? " · follows the exceptions" : " · resolve the exception to clear") : ""}
              </div>
              {isCustoms(x.g) && customs.state !== "none" && (
                <div
                  className={`text-[12px] break-words ${customs.state === "overdue" ? "text-red-600 font-semibold" : customsDue(customs) ? "text-amber-600 font-semibold" : "text-slate-500"}`}
                  title="Customs deadline: goods in temporary storage must get a customs procedure within 90 days of the receipt (UCC art. 149). The WH release discharges the bonded register entry."
                >
                  Customs deadline: {customs.note}
                </div>
              )}
              {isCharges(x.g) && payment.state === "warn" && payment.check && <ReleasePaymentWarning className="mt-1.5" check={payment.check} />}
              {isCharges(x.g) && payment.state === "unknown" && <PaymentNotCheckedNote />}
            </div>
          </li>
        ))}
        {m.releaseGates.length === 0 && <li className={`py-2 ${HINT}`}>No release gates on this movement.</li>}
      </ul>

      {(canRefuse || canOverride) && (
        <div className="flex flex-wrap gap-2 mt-3">
          {canRefuse && (
            <button type="button" className={btnDanger} onClick={() => setDialog("refuse")}>
              Refuse
            </button>
          )}
          {canOverride && (
            <button type="button" className={btnDefault} onClick={() => setDialog("override")}>
              Supervisor override
            </button>
          )}
        </div>
      )}

      <ReasonModal
        open={dialog === "refuse"}
        title="Refuse at the gate"
        hint="The movement is refused and its release gates blocked. The reason is logged on the movement."
        okText="Refuse"
        danger
        onClose={() => setDialog(null)}
        onSubmit={refuse}
      />
      <ReasonModal
        open={dialog === "override"}
        title="Supervisor override"
        hint="Clears the other release lines whatever they say — B/L, the pick-up PIN, an open exception, the Charges line and the rest. Never Customs: a position not cleared by customs stays held until it is (transit cargo, T1 / T2L, passes Customs once its MRN is recorded). The prepayment stop at the WH release still asks a manager for a reason. Who, when, the lines at this moment and the reason are logged."
        okText="Override"
        onClose={() => setDialog(null)}
        onSubmit={override}
      >
        {customsHeld(m) && (
          <p className="mt-0 text-[13px] text-amber-700">Customs is not cleared on this position: after the override it stays held until customs clears it.</p>
        )}
      </ReasonModal>
    </Section>
  );
}

// The override log in short lines: when and who, the reason, and the lines at that moment. A log
// in another form is shown as it is.
function OverrideLog({ log }: { log: string }) {
  const p = overrideLogParts(log);
  if (!p) return log ? <div className={`${HINT} break-words`}>{log}</div> : null;
  return (
    <div className={`${HINT} break-words flex flex-col gap-0.5`}>
      <span>{overrideSummary(log)}</span>
      {p.reason && <span>Reason: {p.reason}</span>}
      {p.lines.length > 0 && <span>Lines at that moment: {p.lines.map((x) => `${x.g} ${x.s}`.trim()).join(" · ")}</span>}
    </div>
  );
}

export function ReasonModal({
  open,
  title,
  hint,
  okText,
  danger,
  onClose,
  onSubmit,
  children,
}: {
  open: boolean;
  title: string;
  hint: string;
  okText: string;
  danger?: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<unknown>;
  /** Extra lines under the hint (e.g. a warning). */
  children?: ReactNode;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const close = () => {
    setReason("");
    onClose();
  };
  return (
    <Modal
      open={open}
      title={title}
      okText={okText}
      okButtonProps={{ danger, disabled: !reason.trim() }}
      confirmLoading={busy}
      onCancel={close}
      onOk={async () => {
        setBusy(true);
        try {
          await onSubmit(reason.trim());
          close();
        } catch {
          // The caller reports the error; keep the dialog open with the reason typed.
        } finally {
          setBusy(false);
        }
      }}
      destroyOnHidden
    >
      <p className={`${HINT} mt-0`}>{hint}</p>
      {children}
      <Input.TextArea autoFocus autoSize={{ minRows: 3, maxRows: 6 }} placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}
