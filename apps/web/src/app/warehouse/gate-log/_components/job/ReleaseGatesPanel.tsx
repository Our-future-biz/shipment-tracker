"use client";

import { useState, type ReactNode } from "react";
import { Input, Modal } from "antd";
import { CheckCircleFilled, ClockCircleOutlined, CloseCircleFilled, UnlockOutlined } from "@ant-design/icons";
import type { GateMovement } from "@/hooks/useGateLog";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDateTime } from "@/lib/date";
import { Badge, type Tone } from "../../_lib/gate";
import { btnDanger, btnDefault, Section } from "./fields";

// Same roles the server allows for the supervisor override.
const SUPERVISOR_ROLES = ["superadmin", "admin", "manager"];
const isEmptyReturn = (g: string) => /empty return/i.test(g);

const GATE_ICON: Record<string, ReactNode> = {
  OK: <CheckCircleFilled className="text-emerald-500" />,
  Pending: <ClockCircleOutlined className="text-amber-500" />,
  Blocked: <CloseCircleFilled className="text-red-500" />,
};

// Release state in words, most decisive first: stamped, refused, overridden, armed, blocked.
export function releaseState(m: GateMovement): { tone: Tone; label: string; detail?: string } {
  if (m.impRelease) return { tone: "g", label: "Released", detail: `WH release stamped ${formatDateTime(m.impRelease)}` };
  if (m.status === "Refused") return { tone: "r", label: "Refused", detail: m.refusalLog || undefined };
  if (m.overridden) return { tone: "a", label: "Armed by supervisor override", detail: m.overrideLog || undefined };
  if (m.armed) return { tone: "g", label: "Armed — all release gates OK" };
  const waiting = m.releaseGates.filter((x) => x.s !== "OK" && !isEmptyReturn(x.g)).map((x) => x.g);
  return { tone: "r", label: "Blocked", detail: `Waiting for: ${waiting.join(", ") || "—"}` };
}

// Read-only release checklist: the release follows these gates and nothing here sets it by
// hand. The gate can Refuse (with a reason); a supervisor can override (with a reason).
export function ReleaseGatesPanel({
  m,
  refuse,
  override,
}: {
  m: GateMovement;
  refuse: (reason: string) => Promise<unknown>;
  override: (reason: string) => Promise<unknown>;
}) {
  const { user } = useAuth();
  const [dialog, setDialog] = useState<"refuse" | "override" | null>(null);
  const state = releaseState(m);
  const canRefuse = !m.impRelease && m.status !== "Refused";
  const supervisor = !!user && SUPERVISOR_ROLES.includes(user.role);
  const canOverride = supervisor && !m.impRelease && !m.armed;
  // Only the Customs line moves on its own (it follows the customs status); the other lines
  // cannot be ticked here yet, so a blocked release needs a supervisor override.
  const blocked = !m.impRelease && !m.armed && m.status !== "Refused";

  return (
    <Section title="Release gates" icon={<UnlockOutlined />}>
      <div className="flex flex-col gap-1">
        <Badge tone={state.tone} className="self-start !text-[11.5px]">
          {state.label}
        </Badge>
        {state.detail && <div className="text-[11px] text-slate-500 break-words">{state.detail}</div>}
        {blocked && !supervisor && (
          <div className="text-[11px] text-amber-700 break-words">
            Lines other than Customs cannot be ticked here yet — ask a supervisor to override.
          </div>
        )}
      </div>

      <ul className="list-none m-0 mt-3 p-0 border-t border-slate-100">
        {m.releaseGates.map((x) => (
          <li key={x.g} className="flex items-start gap-2.5 py-1.5 text-xs border-b border-slate-100 last:border-b-0">
            <span className="pt-[1px]" title={x.s} aria-label={x.s}>
              {GATE_ICON[x.s]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-slate-800">{x.g}</div>
              <div className="text-[11px] text-slate-500 break-words">
                {x.note && x.note !== "—" ? x.note : x.s}
                {isEmptyReturn(x.g) ? " · does not hold release" : ""}
                {/^customs$/i.test(x.g) ? " · follows the customs status" : ""}
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
        hint="The movement is refused and the release box disarmed. The reason is logged on the movement."
        okText="Refuse"
        danger
        onClose={() => setDialog(null)}
        onSubmit={refuse}
      />
      <ReasonModal
        open={dialog === "override"}
        title="Supervisor override"
        hint="Arms the release box regardless of the gates. Who, when, the gates at this moment and the reason are logged."
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
