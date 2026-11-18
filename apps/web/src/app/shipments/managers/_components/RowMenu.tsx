"use client";

import { Button, Dropdown } from "antd";
import { EllipsisOutlined } from "@ant-design/icons";
import type { OpsCockpitRow } from "@/hooks/useShipmentsManagersCockpit";
import type { CutoffKey } from "@/lib/managerActions";
import { NUDGE_NEEDS_HANDLED_BY, canNudge, dismissableCutoffs, hasActions } from "../_lib/cockpitActions";

interface RowMenuProps {
  row: OpsCockpitRow;
  onHandOver: (row: OpsCockpitRow) => void;
  onNudge: (row: OpsCockpitRow) => void;
  /** Opens the missed cut-offs' dialog: with the cut-offs the row can dismiss, or with none for the dismissals that stand. */
  onDismissCutoff: (row: OpsCockpitRow, cutoffs: { key: CutoffKey; label: string }[]) => void;
}

// What a manager does about a row, behind "⋯" as a table row's actions are elsewhere in the app
// (shipments RowActionsMenu): hand the job over, nudge whoever handles it, and - only on a row that
// says a cut-off is missed or overdue - dismiss that cut-off. "Dismissed cut-offs…" is on every
// job's row: a dismissed cut-off leaves no tag behind, so the way to take a dismissal back cannot
// hang on one (the dialog, given no cut-off to dismiss, lists the dismissals that stand).
// A Master Job's row has no menu.
// The row around it opens the job on a click: nothing clicked in here may reach it. React hands a
// click in the menu (drawn elsewhere in the document) up through this span too, so one stop covers
// the button and the menu's items.
export function RowMenu({ row, onHandOver, onNudge, onDismissCutoff }: RowMenuProps) {
  if (!hasActions(row)) return null;
  const cutoffs = dismissableCutoffs(row.tags);
  const nudge = canNudge(row);
  return (
    <span className="inline-flex" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <Dropdown
        trigger={["click"]}
        placement="bottomRight"
        menu={{
          items: [
            // First: with nobody in Handled By it is the one thing to do.
            { key: "handOver", label: "Hand over…" },
            {
              key: "nudge",
              disabled: !nudge,
              label: nudge ? (
                "Nudge…"
              ) : (
                <span>
                  Nudge…
                  <span className="block text-[11px] leading-4">{NUDGE_NEEDS_HANDLED_BY}</span>
                </span>
              ),
            },
            ...(cutoffs.length > 0 ? [{ key: "dismiss", label: "Dismiss cut-off…" }] : []),
            { key: "dismissed", label: "Dismissed cut-offs…" },
          ],
          onClick: ({ key }) => {
            if (key === "handOver") onHandOver(row);
            if (key === "nudge" && nudge) onNudge(row);
            if (key === "dismiss") onDismissCutoff(row, cutoffs);
            // None to dismiss: the dialog shows what was dismissed, each to be taken back.
            if (key === "dismissed") onDismissCutoff(row, []);
          },
        }}
      >
        <Button type="text" size="small" icon={<EllipsisOutlined className="!text-[20px]" />} aria-label={`Actions for ${row.jobNumber || "this job"}`} />
      </Dropdown>
    </span>
  );
}
