"use client";

import { Fragment } from "react";
import { Dropdown, Tag, Tooltip } from "antd";
import { CheckCircleOutlined, DownOutlined, RightOutlined } from "@ant-design/icons";
import type { ConsignmentDetail, StampKind } from "@/hooks/useTruckingConsignments";
import { businessDateTime } from "@/lib/date";
import { btnDefault, btnPrimary } from "@/components/buttons";
import { STAMP_LABELS, nextStep, stampKindsFor, stampOf, type ActionState, type ConsignmentActions } from "../../_lib/consignments";

interface ConsignmentStepBarProps {
  c: ConsignmentDetail;
  actions: ConsignmentActions;
  /** Confirmed is recorded through the transport order (Record confirmation…), the others are stamped. */
  onStep: (kind: StampKind) => void;
  onVoid: (kind: StampKind) => void;
}

const stateOf = (actions: ConsignmentActions, kind: StampKind): ActionState => {
  if (kind === "confirmed") return actions.recordConfirmation;
  return actions[kind];
};

// The stamps of a consignment in order, as on the Warehouse gate: a green tag with the time and who
// once stamped (a manager can void it from its menu), else a button — primary for the next step,
// disabled with the reason for the others.
export const ConsignmentStepBar = ({ c, actions, onStep, onVoid }: ConsignmentStepBarProps) => {
  const next = nextStep(c);
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Stamps">
      {stampKindsFor(c.scope).map((kind, i) => {
        const stamp = stampOf(c.stamps, kind);
        const label = STAMP_LABELS[kind];
        let item;
        if (stamp) {
          const tag = (
            <Tag color="success" icon={<CheckCircleOutlined />} className={`m-0 !px-2 !py-1 !text-[12px] ${actions.voidStamp ? "cursor-pointer" : ""}`}>
              <span className="font-semibold">{label}</span> <span className="font-mono">{businessDateTime(stamp.at)}</span>
              {stamp.by ? ` · ${stamp.by}` : ""}
              {actions.voidStamp && <DownOutlined className="ml-1 text-[9px]" />}
            </Tag>
          );
          item = actions.voidStamp ? (
            <Dropdown trigger={["click"]} menu={{ items: [{ key: "void", danger: true, label: "Void this stamp…", onClick: () => onVoid(kind) }] }}>
              <span className="inline-flex">{tag}</span>
            </Dropdown>
          ) : (
            tag
          );
        } else {
          const state = stateOf(actions, kind);
          const primary = state.allowed && (next === kind || (kind === "confirmed" && next === "recordConfirmation"));
          item = (
            <Tooltip title={state.allowed ? undefined : state.reason}>
              <span className="inline-flex">
                <button type="button" className={primary ? btnPrimary : btnDefault} disabled={!state.allowed} aria-label={state.allowed ? undefined : `${label} — ${state.reason}`} onClick={() => onStep(kind)}>
                  {label}
                </button>
              </span>
            </Tooltip>
          );
        }
        return (
          <Fragment key={kind}>
            {i > 0 && <RightOutlined className="text-[10px] text-slate-300" aria-hidden />}
            {item}
          </Fragment>
        );
      })}
    </div>
  );
};
