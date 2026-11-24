"use client";

import { Dropdown } from "antd";
import { CheckOutlined, DownOutlined } from "@ant-design/icons";
import { Pill } from "@/components/Pill";
import { useSailingStage } from "@/hooks/useCoLoadingServices";
import { apiErrorMessage } from "@/lib/api";
import { useMessages } from "@/lib/toast";
import { BTN } from "@/styles/ui";
import { SAILING_STAGE_LABEL, SAILING_STAGE_TONE, SAILING_STAGES, stageOf, type SailingStage } from "../_lib/sailings";

const HINTS: Record<SailingStage, string> = {
  open: "Cargo is still taken",
  closed: "Linking a shipment asks for a reason",
  departed: "The sailing has left",
  arrived: "At the port of discharge",
  devanned: "The box is unpacked",
};

/** A sailing's stage as a pill, for lists: nothing for an open one, which is the usual. */
export function SailingStagePill({ sailing }: { sailing: { stage?: string | null } }) {
  const stage = stageOf(sailing);
  return stage === "open" ? null : <Pill tone={SAILING_STAGE_TONE[stage]}>{SAILING_STAGE_LABEL[stage]}</Pill>;
}

// A sailing's stage in its header, set by hand (Council Outlay 14, C3): Open, Closed for cargo,
// Departed, Arrived, Devanned. Any of them may be picked, so a stage set by mistake is set back;
// every change is kept in the sailing's record. Anyone sets it; read-only while the service is closed.
export function SailingStageControl({ sailing, readOnly }: { sailing: { id: string; stage?: string | null }; readOnly: boolean }) {
  const stage = stageOf(sailing);
  const set = useSailingStage(sailing.id);
  const message = useMessages();
  const pill = <Pill tone={SAILING_STAGE_TONE[stage]}>{SAILING_STAGE_LABEL[stage]}</Pill>;
  if (readOnly) return pill;

  const pick = async (next: SailingStage) => {
    if (next === stage) return;
    try {
      await set.mutateAsync(next);
      message.success(`Stage set to ${SAILING_STAGE_LABEL[next]}`);
    } catch (err) {
      message.error(apiErrorMessage(err));
    }
  };

  return (
    <Dropdown
      trigger={["click"]}
      placement="bottomRight"
      menu={{
        items: SAILING_STAGES.map((s) => ({
          key: s,
          icon: s === stage ? <CheckOutlined /> : <span className="inline-block w-[14px]" />,
          label: (
            <span>
              {SAILING_STAGE_LABEL[s]} <span className="text-[12px] text-slate-500">· {HINTS[s]}</span>
            </span>
          ),
        })),
        onClick: ({ key }) => void pick(key as SailingStage),
      }}
    >
      <button type="button" className={BTN} aria-label={`Stage: ${SAILING_STAGE_LABEL[stage]}. Change stage`} disabled={set.isPending}>
        <span className="text-slate-500">Stage</span>
        {pill}
        <DownOutlined className="text-[10px]" />
      </button>
    </Dropdown>
  );
}
