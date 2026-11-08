"use client";

import { useState, useMemo, useEffect } from "react";
import { Modal, Button, Input, Checkbox, Radio, Space, Spin } from "antd";
import { LockOutlined, SearchOutlined } from "@ant-design/icons";
import { useShipments, type ShipmentItem } from "@/hooks/useShipments";
import { useMasterJobs } from "@/hooks/useMasterJobs";
import { nextMczNumber } from "@/lib/mcz";
import { Badge } from "@/components/Badge";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { PillTabs } from "@/components/SectionCard";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDate } from "@/lib/date";
import { placeCodeOf } from "@/lib/places";
import { canChangeShipmentDetails } from "@/lib/shipmentEditRule";
import { EMPTY_STATE, HINT, LABEL_TEXT, MODAL_TITLE, REF, TD } from "@/styles/ui";

/* The app's table look (Container Details, Linked shipments): column titles over a slate-200 rule
   that stays put while the rows scroll, rows split by thin slate-100 lines (none under the last row:
   the frame closes it). z-10 keeps the head over antd's checkbox inputs (z-index 1), so a row
   scrolled under it can't be ticked through it. */
const TH = `sticky top-0 z-10 bg-white px-2 py-2 text-left align-bottom whitespace-nowrap ${LABEL_TEXT} border-b border-slate-200`;

/** What a shipment the user may not link says (the server refuses it: lib/shipmentEditRule). */
export const LINK_REFUSED_HINT = "Only its Person in Charge, Holiday Cover or a manager can link it to a master job";

/**
 * Links each shipment by a request of its own, so one the server refuses does not stop the others.
 * Says how many were linked and how many not, with the first refusal.
 */
export async function linkEach(ids: string[], link: (id: string) => Promise<unknown>): Promise<{ linked: number; failed: number; error: unknown }> {
  const results = await Promise.allSettled(ids.map((id) => link(id)));
  const refused = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  return { linked: results.length - refused.length, failed: refused.length, error: refused[0]?.reason };
}

/**
 * The shipments the dialog lists. Those chosen in the grid, when it was opened with them, and nobody
 * else: searching is for picking more. Otherwise every shipment that is one (a CZQ number is a
 * quote's), narrowed by the search.
 */
export function shipmentsOffered<T extends Pick<ShipmentItem, "id" | "jobNumber" | "shipper" | "consignee"> & { customer?: string | null }>(
  shipments: T[],
  search: string,
  onlyIds?: readonly string[],
): T[] {
  const list = shipments.filter((s) => s.jobNumber && !s.jobNumber.startsWith("CZQ"));
  if (onlyIds) return list.filter((s) => onlyIds.includes(s.id));
  if (!search) return list;
  const q = search.toLowerCase();
  return list.filter((s) => [s.jobNumber, s.customer ?? "", s.shipper, s.consignee].some((text) => text.toLowerCase().includes(q)));
}

/**
 * The shipments a link goes to: those ticked that the user may link. Opened with the grid's
 * choice, only those listed - a quote's number, or a shipment ticked in the grid and filtered
 * away since, is not linked unseen.
 */
export function chosenIds(selected: Iterable<string>, lockedIds: ReadonlySet<string>, listed?: readonly { id: string }[]): string[] {
  const shown = listed && new Set(listed.map((s) => s.id));
  return Array.from(selected).filter((id) => !lockedIds.has(id) && (!shown || shown.has(id)));
}

/** "1 shipment", "3 shipments". */
export const linkedCount = (n: number) => `${n} shipment${n === 1 ? "" : "s"}`;

interface MasterJobDialogProps {
  open: boolean;
  onClose: () => void;
  /** The shipments to pick from; without them the dialog loads the newest itself while open. */
  shipments?: ShipmentItem[];
  onLink: (shipmentIds: string[], mczNumber: string) => void | Promise<void>;
  initialSelectedIds?: string[];
  /** Only the shipments of initialSelectedIds are listed: chosen in the grid, none can be added here. */
  limitToSelected?: boolean;
}

export const MasterJobDialog = ({ open, onClose, shipments: given, onLink, initialSelectedIds, limitToSelected = false }: MasterJobDialogProps) => {
  // A page with no list of its own (a shipment's page) has the newest loaded here, only while open.
  const own = useShipments({ enabled: open && !given });
  const shipments = given ?? own.shipments;
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelectedIds ?? []));

  useEffect(() => {
    if (open) setSelected(new Set(initialSelectedIds ?? []));
  }, [open, initialSelectedIds]);
  const [search, setSearch] = useState("");
  const [selectedExistingMCZ, setSelectedExistingMCZ] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  // A shipment whose details the user may not change cannot be linked by them either: shown, not picked.
  const { user } = useAuth();
  const lockedIds = useMemo(() => new Set(shipments.filter((s) => !canChangeShipmentDetails(user, s)).map((s) => s.id)), [shipments, user]);
  const onlyIds = limitToSelected ? initialSelectedIds : undefined;

  // Every master job on the server counts: one created on the Master Jobs page has
  // no shipments yet, so the loaded shipments alone would hand out its number again.
  const { masterJobs } = useMasterJobs();
  const masterJobMczs = useMemo(() => masterJobs.map((m) => m.mczNumber), [masterJobs]);

  const nextMCZ = useMemo(() => nextMczNumber(shipments, masterJobMczs), [shipments, masterJobMczs]);

  const activeMCZ = mode === "existing" && selectedExistingMCZ ? selectedExistingMCZ : nextMCZ;

  // Existing MCZ numbers with their shipment counts
  const existingMCZs = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of shipments) {
      const mn = s.masterJobMczNumber;
      if (mn && mn.startsWith("MCZ")) map.set(mn, (map.get(mn) || 0) + 1);
    }
    // The server knows the full count, including shipments older than the loaded ones.
    for (const m of masterJobs) map.set(m.mczNumber, m.shipmentCount);
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [shipments, masterJobs]);

  const filteredShipments = useMemo(() => shipmentsOffered(shipments, search, onlyIds), [shipments, search, onlyIds]);
  // What is listed is what goes, when the grid chose them.
  const chosen = chosenIds(selected, lockedIds, onlyIds ? filteredShipments : undefined);

  const toggleShipment = (id: string) => {
    if (lockedIds.has(id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (chosen.length === 0 || isLinking) return;
    setIsLinking(true);
    try {
      await onLink(chosen, activeMCZ);
    } finally {
      setIsLinking(false);
    }
  };

  const handleClose = () => {
    setSelected(new Set());
    setSearch("");
    setMode("new");
    setSelectedExistingMCZ("");
    onClose();
  };

  // The newest shipments, loaded here for a page with no list of its own: still on their way.
  const loading = !given && own.isLoading;

  return (
    <Modal
      title={<span className={MODAL_TITLE}>Master Job</span>}
      open={open}
      onCancel={handleClose}
      width={820}
      destroyOnHidden
      footer={
        <div className="flex justify-between items-center gap-3">
          <span className={HINT}>{linkedCount(chosen.length)} selected</span>
          <Space>
            <Button onClick={handleClose}>Cancel</Button>
            <Button
              type="primary"
              disabled={chosen.length === 0 || isLinking || (mode === "existing" && !selectedExistingMCZ)}
              loading={isLinking}
              onClick={handleConfirm}
            >
              {mode === "new" ? `Create ${activeMCZ}` : `Link to ${activeMCZ}`}
            </Button>
          </Space>
        </div>
      }
    >
      <div className="flex flex-col gap-3 pt-1">
        {/* Create a new master job, or link to one there is: the app's sub-tabs (only once there are some). */}
        {existingMCZs.length > 0 ? (
          <PillTabs
            tabs={[
              { key: "new", label: `Create new · ${nextMCZ}` },
              { key: "existing", label: "Link to existing" },
            ]}
            active={mode}
            onChange={setMode}
          />
        ) : (
          <p className={`m-0 ${HINT}`}>
            New master job: <strong className={`${REF} font-semibold text-slate-900`}>{nextMCZ}</strong>
          </p>
        )}

        {mode === "existing" && existingMCZs.length > 0 && (
          // The master jobs to link to, one row each, as the shipments below.
          <div className="max-h-[156px] overflow-y-auto rounded-lg border border-slate-200">
            <Radio.Group value={selectedExistingMCZ} onChange={(e) => setSelectedExistingMCZ(e.target.value)} className="!flex flex-col w-full">
              {existingMCZs.map(([mcz, count], i) => {
                const on = selectedExistingMCZ === mcz;
                return (
                  <Radio
                    key={mcz}
                    value={mcz}
                    className={`!m-0 !flex items-center w-full px-3 py-2 transition-colors ${i < existingMCZs.length - 1 ? "border-b border-slate-100" : ""} ${
                      on ? "bg-indigo-50/70" : "hover:bg-slate-50"
                    }`}
                  >
                    <span className={`${REF} text-[13px] font-semibold text-slate-900`}>{mcz}</span>
                    <span className={`${HINT} ml-2`}>{linkedCount(count)}</span>
                  </Radio>
                );
              })}
            </Radio.Group>
          </div>
        )}

        {/* Search, to pick more: not when the shipments were chosen in the grid. */}
        {!limitToSelected && (
          <Input
            prefix={<SearchOutlined className="text-slate-400" />}
            placeholder="Search job number, customer, shipper, consignee…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            aria-label="Search shipments"
          />
        )}

        {/* The shipments to link, in the app's table look; a click anywhere on a row ticks it.
            scroll-pt-9: a box reached from the keyboard stops below the sticky head, focus ring and all. */}
        <div className="max-h-[360px] overflow-auto scroll-pt-9 rounded-lg border border-slate-200">
          {/* Fixed columns, so the table fits the dialog: a long customer is cut short (in full on hover).
              Internal Reference fits the longest reference, CZPROJECT00000023. */}
          <table className="w-full min-w-[720px] table-fixed border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={`${TH} w-10 !pl-3`}>
                  <span className="sr-only">Selected</span>
                </th>
                <th className={`${TH} w-[172px]`}>Internal Reference</th>
                <th className={TH}>Customer</th>
                <th className={`${TH} w-[150px]`}>Route</th>
                <th className={`${TH} w-[96px]`}>ETD</th>
                <th className={`${TH} w-[124px] !pr-3`}>Master Job</th>
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0">
              {filteredShipments.map((s) => {
                const locked = lockedIds.has(s.id);
                const isChecked = !locked && selected.has(s.id);
                // The ports by their codes ("CNSGH → DEHAM"), in full on hover.
                const route = [s.pol, s.pod].filter(Boolean).map((p) => placeCodeOf(p) ?? p).join(" → ");
                const routeInFull = [s.pol, s.pod].filter(Boolean).join(" → ");
                const etd = formatDate(s.estimatedDeparture);
                // A shipment with no customer yet is named by its shipper, else its consignee, muted (the colour
                // is the cell's own, so a cut-off name's "…" is muted too); the hover says which it is.
                const party = s.customer || s.shipper || s.consignee;
                const partyTitle = s.customer || (s.shipper ? `Shipper: ${s.shipper}` : s.consignee ? `Consignee: ${s.consignee}` : undefined);
                // On a locked row the hover gives what a cell cuts short or names in a customer's place, then
                // why the row is locked, so the reason shows wherever you point.
                const lockedTitle = (own?: string) => [own, LINK_REFUSED_HINT].filter(Boolean).join("\n");
                return (
                  <tr
                    key={s.id}
                    onClick={() => toggleShipment(s.id)}
                    title={locked ? LINK_REFUSED_HINT : undefined}
                    aria-disabled={locked || undefined}
                    className={`transition-colors ${locked ? "cursor-not-allowed text-slate-400" : isChecked ? "cursor-pointer bg-indigo-50/70" : "cursor-pointer hover:bg-slate-50"}`}
                  >
                    {/* The box ticks it by itself (and from the keyboard), so its clicks don't also reach the row;
                        a click beside it in the cell ticks it as the rest of the row does. */}
                    <td
                      className={`${TD} !pl-3`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!(e.target as Element).closest(".ant-checkbox-wrapper")) toggleShipment(s.id);
                      }}
                    >
                      {/* A shipment the user may not link has a lock where its box would be, a 16px block centred
                          as the box is; the row says why. */}
                      {locked ? (
                        <span className="flex h-4 w-4 items-center justify-center text-[13px] text-slate-400">
                          <LockOutlined aria-label="Not yours to link" />
                        </span>
                      ) : (
                        <Checkbox checked={isChecked} onChange={() => toggleShipment(s.id)} aria-label={`Link ${s.jobNumber}`} />
                      )}
                    </td>
                    {/* A locked row's hover always ends with why it is locked. */}
                    <td className={`${TD} truncate`} title={locked ? undefined : s.jobNumber}>
                      <span className={`${REF} font-semibold ${locked ? "text-slate-400" : "text-slate-900"}`}>{s.jobNumber}</span>
                    </td>
                    <td className={`${TD} truncate ${locked || (!s.customer && party) ? "!text-slate-400" : ""}`} title={locked ? lockedTitle(partyTitle) : partyTitle}>
                      {party || EMPTY_CELL}
                    </td>
                    <td className={`${TD} truncate tabular-nums ${locked ? "!text-slate-400" : ""}`} title={locked ? lockedTitle(routeInFull) : routeInFull || undefined}>
                      {route || EMPTY_CELL}
                    </td>
                    <td className={`${TD} whitespace-nowrap tabular-nums ${locked ? "!text-slate-400" : ""}`}>{etd || EMPTY_CELL}</td>
                    <td className={`${TD} whitespace-nowrap !pr-3`}>
                      {s.masterJobMczNumber ? (
                        <Badge
                          tone={locked ? "" : "a"}
                          className={`${REF} ${locked ? "!text-slate-400" : ""}`}
                          title={locked || s.masterJobMczNumber === activeMCZ ? undefined : `Linking takes it off ${s.masterJobMczNumber}`}
                        >
                          {s.masterJobMczNumber}
                        </Badge>
                      ) : (
                        EMPTY_CELL
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {loading ? (
            <div className="flex justify-center py-8">
              <Spin />
            </div>
          ) : (
            filteredShipments.length === 0 && <div className={EMPTY_STATE}>{search ? "No shipments match the search." : "No shipments found."}</div>
          )}
        </div>
      </div>
    </Modal>
  );
};
