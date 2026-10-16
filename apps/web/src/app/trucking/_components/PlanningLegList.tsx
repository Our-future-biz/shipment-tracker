"use client";

import { Checkbox, Dropdown, Tooltip } from "antd";
import { DownOutlined, HolderOutlined } from "@ant-design/icons";
import type { PlanningLeg, PlanningTrip } from "@/hooks/useTruckingConsignments";
import { formatDate } from "@/lib/date";
import { Badge } from "@/components/Badge";
import { btnInline } from "@/components/buttons";
import { TERMS } from "../_lib/glossary";
import { DEADLINE_BADGE, type ZoneGroup } from "../_lib/planning";
import { formatQty } from "../_lib/tariffs";
import { place } from "../_lib/format";

interface PlanningLegListProps {
  groups: ZoneGroup[];
  selected: string[];
  onSelect: (selected: string[]) => void;
  /** Open trips a leg can go on from the keyboard menu, each with what it would bring up. */
  targets: { trip: PlanningTrip; warnings: (leg: PlanningLeg) => string[] }[];
  onAdd: (leg: PlanningLeg, trip: PlanningTrip) => void;
  onDragStart: (legId: string) => void;
  onDragEnd: () => void;
  busy: boolean;
}


// The open legs of the day, by zone, the most urgent first. A leg is dragged onto a trip card, or
// put on one with "Add to trip…" (the keyboard way); ticked legs make a new trip.
export const PlanningLegList = ({ groups, selected, onSelect, targets, onAdd, onDragStart, onDragEnd, busy }: PlanningLegListProps) => {
  const toggle = (id: string, on: boolean) => onSelect(on ? [...selected, id] : selected.filter((x) => x !== id));
  const toggleZone = (g: ZoneGroup, on: boolean) => {
    const ids = g.legs.map((l) => l.legId);
    onSelect(on ? [...new Set([...selected, ...ids])] : selected.filter((x) => !ids.includes(x)));
  };

  if (!groups.length) return <div className="p-4 text-xs text-slate-400">No open {TERMS.leg.toLowerCase()}s for this day.</div>;

  return (
    <div className="flex flex-col">
      {groups.map((g) => {
        const all = g.legs.every((l) => selected.includes(l.legId));
        const some = !all && g.legs.some((l) => selected.includes(l.legId));
        return (
          <section key={g.zone} aria-label={`${TERMS.zone} ${g.zone}`} className="border-t border-slate-100 first:border-t-0">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5">
              <Checkbox checked={all} indeterminate={some} onChange={(e) => toggleZone(g, e.target.checked)} aria-label={`Select every leg of ${g.zone}`} />
              <span className="text-[12px] font-bold text-slate-700">{g.zone}</span>
              <Badge tone={DEADLINE_BADGE[g.deadline].tone}>{DEADLINE_BADGE[g.deadline].label}</Badge>
              <span className="ml-auto text-[11px] tabular-nums text-slate-500">
                {g.legs.length} · {formatQty(g.palletPlaces)} PP · {formatQty(g.ldm)} {TERMS.ldm} · {formatQty(g.weightKg)} kg
              </span>
            </div>
            <ul className="m-0 list-none p-0">
              {g.legs.map((leg) => {
                const badge = DEADLINE_BADGE[leg.deadline];
                return (
                  <li
                    key={leg.legId}
                    draggable={!busy}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", leg.legId);
                      onDragStart(leg.legId);
                    }}
                    onDragEnd={onDragEnd}
                    className="flex items-start gap-2 border-t border-slate-100 px-3 py-1.5 text-xs"
                  >
                    <HolderOutlined className="mt-1 cursor-grab text-slate-300" aria-hidden />
                    <Checkbox checked={selected.includes(leg.legId)} onChange={(e) => toggle(leg.legId, e.target.checked)} aria-label={`Select ${leg.consignmentRef}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono font-semibold text-slate-800">{leg.consignmentRef}</span>
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                        {leg.adr && <Badge tone="a">{TERMS.adr}</Badge>}
                        {leg.tailLift && <Badge tone="i">{TERMS.tailLift}</Badge>}
                      </div>
                      <div className="truncate text-slate-600">{leg.customerName}</div>
                      <div className="text-[11px] text-slate-500">
                        {place(leg.fromPostcode, leg.fromCity)} → {place(leg.toPostcode, leg.toCity)}
                      </div>
                      <div className="text-[11px] tabular-nums text-slate-500">
                        {formatQty(leg.palletPlaces)} PP · {formatQty(leg.ldm)} {TERMS.ldm} · {formatQty(leg.weightKg)} kg
                        {leg.promisedDate ? ` · promised ${formatDate(leg.promisedDate)}` : ""}
                      </div>
                    </div>
                    <Dropdown
                      trigger={["click"]}
                      disabled={busy || !targets.length}
                      menu={{
                        items: targets.map(({ trip, warnings }) => {
                          const w = warnings(leg);
                          return {
                            key: trip.id,
                            label: (
                              <span className="flex flex-col">
                                <span>
                                  {trip.ref} · {trip.haulierName}
                                </span>
                                {w.length > 0 && <span className="text-[11px] text-amber-700">{w.join(" · ")}</span>}
                              </span>
                            ),
                            onClick: () => onAdd(leg, trip),
                          };
                        }),
                      }}
                    >
                      <Tooltip title={targets.length ? undefined : "No open trip of this day — make one with New trip"}>
                        <button type="button" className={`${btnInline} shrink-0`} aria-label={`Add ${leg.consignmentRef} to a trip`}>
                          Add to trip… <DownOutlined className="text-[9px]" />
                        </button>
                      </Tooltip>
                    </Dropdown>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
};
