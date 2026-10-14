"use client";

import { useState, type ReactNode } from "react";
import { Checkbox, Input, Modal } from "antd";
import { CheckCircleFilled, ClockCircleOutlined, CloseCircleFilled, UnlockOutlined } from "@ant-design/icons";
import type { GateMovement } from "@/hooks/useGateLog";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDateTime } from "@/lib/date";
import { TERMS } from "@/app/warehouse/_lib/glossary";
import { Badge, type Tone } from "../../_lib/gate";
import { PICKUP_PIN_GATE, waitingGates } from "../../_lib/steps";
import { btnDanger, btnDefault, Section } from "./fields";

// Same roles the server allows for the supervisor override.
const SUPERVISOR_ROLES = ["superadmin", "admin", "manager"];
const isEmptyReturn = (g: string) => /empty return/i.test(g);

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
  if (m.overridden) return { tone: "a", label: `${TERMS.clear} (supervisor override)`, detail: m.overrideLog || undefined };
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
  const supervisor = !!user && SUPERVISOR_ROLES.includes(user.role);
  const canOverride = supervisor && !m.impRelease && !m.armed;
  const isCustoms = (g: string) => /^customs$/i.test(g);
  const isPickupPin = (g: string) => g === PICKUP_PIN_GATE;
  const toggle = (gate: string, ok: boolean) => {
    setBusyGate(gate);
    setReleaseGate(gate, ok).finally(() => setBusyGate(null));
  };

  return (
    <Section title={TERMS.releaseGates} icon={<UnlockOutlined />}>
      <div className="flex flex-col gap-1">
        <Badge tone={state.tone} className="self-start !text-[11.5px]">
          {state.label}
        </Badge>
        {state.detail && <div className="text-[11px] text-slate-500 break-words">{state.detail}</div>}
      </div>

      <ul className="list-none m-0 mt-3 p-0 border-t border-slate-100">
        {m.releaseGates.map((x) => (
          <li key={x.g} className="flex items-start gap-2.5 py-1.5 text-xs border-b border-slate-100 last:border-b-0">
            {/* Ticked by hand once met; Customs follows the customs status, the Pick-up PIN line the
                PIN check, and nothing moves after release. */}
            {!isCustoms(x.g) && !isPickupPin(x.g) && !m.impRelease ? (
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
              <div className="font-semibold text-slate-800">{x.g}</div>
              <div className="text-[11px] text-slate-500 break-words">
                {x.note && x.note !== "—" ? x.note : x.s}
                {isEmptyReturn(x.g) ? " · does not hold release" : ""}
                {isCustoms(x.g) ? " · follows the customs status" : ""}
                {isPickupPin(x.g) ? " · set by the PIN check at the gate" : ""}
              </div>
            </div>
          </li>
        ))}
        {m.releaseGates.length === 0 && <li className="py-2 text-xs text-slate-400">No release gates on this movement.</li>}
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
        hint="Clears the release gates whatever the lines say. Who, when, the lines at this moment and the reason are logged."
        okText="Override"
        onClose={() => setDialog(null)}
        onSubmit={override}
      />
    </Section>
  );
}

function ReasonModal({
  open,
  title,
  hint,
  okText,
  danger,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  hint: string;
  okText: string;
  danger?: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<unknown>;
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
      <p className="text-xs text-slate-500 mt-0">{hint}</p>
      <Input.TextArea autoFocus autoSize={{ minRows: 3, maxRows: 6 }} placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}
