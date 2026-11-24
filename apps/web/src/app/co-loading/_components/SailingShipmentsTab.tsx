"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Checkbox, Dropdown, Input, Modal, Space, Spin, Tooltip } from "antd";
import {
  CopyOutlined,
  DisconnectOutlined,
  DownOutlined,
  FileTextOutlined,
  SwapOutlined,
  EllipsisOutlined,
  PlusOutlined,
  SearchOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { apiErrorMessage } from "@/lib/api";
import { useDebounced } from "@/hooks/useDebounced";
import { useShipments, type ShipmentItem } from "@/hooks/useShipments";
import { useCoLoadingSailings, useSailingCandidates, useSailingRemoved, useSailingShipmentFacts, useSailingShipmentLinks, useSailingUtilization, type CoLoadingSailing } from "@/hooks/useCoLoadingServices";
import { linkedCount } from "@/app/shipments/_components/MasterJobDialog";
import { ConfirmModal } from "@/components/ConfirmModal";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { CountChip, SectionCard } from "@/components/SectionCard";
import { businessToday, formatDate, formatDateTime } from "@/lib/date";
import { placeCodeOf } from "@/lib/places";
import { useMessages } from "@/lib/toast";
import { ADD_BTN, EMPTY_STATE, HINT, LINK, MODAL_TITLE, REF, TD, TD_TOTAL, TH } from "@/styles/ui";
import { boxCargoOf, cutoffWarning, oddInBox, oddWarning, overfillWarning, removedReasonWords, tableCbm, tableKg, type BoxUtilization } from "../_lib/boxUtilization";
import { downloadCsv } from "@/lib/csv";
import { loadListCells, loadListFileName, loadListOf } from "../_lib/loadList";
import { downloadLoadListPdf } from "../_lib/loadListPdf";
import { linkNeedsReason, nextSailingAfter, SAILING_STAGE_LABEL, sailingTitle, stageHasLeft, stageOf, statusBeforeDeparture } from "../_lib/sailings";
import { CopyToShipmentsModal, copyResultWords } from "./CopyToShipmentsModal";
import { MoveShipmentModal } from "./MoveShipmentModal";

// The picker's head stays put while its rows scroll, as the master job's picker does.
const PICK_TH = `${TH} sticky top-0 z-10 bg-white`;

// A cell's text, cut short with the whole of it on hover, or a dash.
const cell = (v: string | null | undefined) => (v ? <span title={v}>{v}</span> : EMPTY_CELL);

/**
 * A sailing's Linked shipments tab: the shipments in its box, in a section card as the sailing's
 * other tabs have, with "+" to link more and "⋯ → Remove from sailing" on each. Only the service's
 * own shipments (its Service Name) that are on no sailing yet are offered: a shipment sits in one
 * box at a time.
 * Anyone links and removes; nothing while the service is closed.
 */
export function SailingShipmentsTab({
  sailing,
  serviceLabel,
  serviceName,
  serviceMode,
  closed,
}: {
  sailing: CoLoadingSailing;
  /** The service's own name ("Import from Shanghai"), for the load list's heading. */
  serviceLabel: string;
  serviceName: string;
  /** The service's mode of transport: a shipment of another kind is remarked on before it is linked. */
  serviceMode: string;
  closed: boolean;
}) {
  const { shipments: linked, isLoading, isError } = useShipments({ sailing: sailing.id });
  const { link, unlink, move, moveMany, unlinkMany } = useSailingShipmentLinks(sailing.id);
  // Several at once (Council Outlay 14, A9): ticked rows are moved or removed together, with one reason.
  const [ticked, setTicked] = useState<string[]>([]);
  const [bulk, setBulk] = useState<"move" | "roll" | "remove" | null>(null);
  // The biggest first, to find what to roll when a box is over; null: as the list comes.
  const [sortBy, setSortBy] = useState<"weightKg" | "volumeCbm" | null>(null);
  // The sailing cargo is rolled to: the next one of the service still to come.
  const { sailings: siblings } = useCoLoadingSailings(sailing.serviceId);
  const next = useMemo(() => nextSailingAfter(sailing, siblings, businessToday()), [sailing, siblings]);
  const [toMove, setToMove] = useState<ShipmentItem | null>(null);
  // The figures are the box's own (Box utilization): each shipment's cargo lines, else its typed
  // totals, in kg. While they are read, the same rule is applied to the shipment here (boxCargoOf).
  const { box } = useSailingUtilization(sailing.id);
  const partOf = new Map((box?.rows ?? []).map((row) => [row.shipmentId, row]));
  const figuresOf = (s: ShipmentItem) => partOf.get(s.id) ?? boxCargoOf(s);
  const shipments = sortBy ? [...linked].sort((a, b) => figuresOf(b)[sortBy] - figuresOf(a)[sortBy]) : linked;
  // On a sailing set to Departed or later: the shipments whose status still says they have not sailed.
  const behind = stageHasLeft(sailing) ? linked.filter((s) => statusBeforeDeparture(s.status)) : [];
  // A shipment taken off meanwhile leaves the list: its tick goes with it.
  useEffect(() => {
    setTicked((prev) => (prev.every((id) => linked.some((s) => s.id === id)) ? prev : prev.filter((id) => linked.some((s) => s.id === id))));
  }, [linked]);
  const allTicked = linked.length > 0 && ticked.length === linked.length;
  const sortHead = (key: "weightKg" | "volumeCbm", label: string) => (
    <button
      type="button"
      className={`cursor-pointer border-0 bg-transparent p-0 font-[inherit] uppercase tracking-[inherit] text-inherit ${sortBy === key ? "!text-indigo-600" : ""}`}
      aria-pressed={sortBy === key}
      title={sortBy === key ? "Back to the list's own order" : "The biggest first"}
      onClick={() => setSortBy(sortBy === key ? null : key)}
    >
      {label}
      {sortBy === key ? " ↓" : ""}
    </button>
  );
  const { removed } = useSailingRemoved(sailing.id);
  // The sailing's facts beside each shipment's own (Council Outlay 14, A3): what a copy would change, and a port that differs.
  const { facts, copy } = useSailingShipmentFacts(sailing.id);
  const factsOf = new Map(facts.map((f) => [f.shipmentId, f]));
  const toCopy = facts.filter((f) => !f.skipped && f.changes.length > 0).length;
  const [copying, setCopying] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  // The load list (A8) is made from what is on screen: the shipments' own fields and the box's figures.
  const makeList = async (kind: "pdf" | "csv") => {
    if (!box) return;
    const list = loadListOf(sailing, serviceLabel, linked, box.rows, businessToday(), formatDate);
    setListBusy(true);
    try {
      if (kind === "pdf") await downloadLoadListPdf(list);
      else downloadCsv(`${loadListFileName(list.title)}.csv`, loadListCells(list));
      message.success(`${list.title} downloaded`);
    } catch (err) {
      message.error(`The load list was not made - ${apiErrorMessage(err)}`);
    } finally {
      setListBusy(false);
    }
  };
  const message = useMessages();
  const [picking, setPicking] = useState(false);
  const [toRemove, setToRemove] = useState<ShipmentItem | null>(null);
  const name = sailingTitle(sailing);
  const closedHint =
    "The service is closed: nothing can be linked or removed until it is reopened.";

  return (
    <SectionCard
      title="Linked shipments"
      bodyClassName="p-0"
      extra={
        <>
          {shipments.length > 0 && <CountChip count={shipments.length} />}
          {/* What goes out of a sailing and onto its shipments. */}
          <Dropdown
            trigger={["click"]}
            placement="bottomRight"
            disabled={!box || shipments.length === 0}
            menu={{
              items: [
                { key: "pdf", label: "PDF" },
                { key: "csv", label: "Excel (CSV file)" },
              ],
              onClick: ({ key }) => void makeList(key === "pdf" ? "pdf" : "csv"),
            }}
          >
            <Button size="small" icon={<FileTextOutlined />} loading={listBusy}>
              Load list <DownOutlined className="text-[10px]" />
            </Button>
          </Dropdown>
          <Tooltip title={closed ? closedHint : "The sailing's vessel, voyage, departure and cut-off, written to its shipments after a preview"}>
            <Button size="small" icon={<CopyOutlined />} disabled={closed || shipments.length === 0} onClick={() => setCopying(true)}>
              Copy to shipments{toCopy > 0 ? ` (${toCopy})` : ""}
            </Button>
          </Tooltip>
          <Tooltip title={closed ? closedHint : "Link shipments"}>
            <Button
              size="small"
              type="primary"
              icon={<PlusOutlined className="text-[11px]" />}
              aria-label="Link shipments"
              disabled={closed}
              onClick={() => setPicking(true)}
              className={ADD_BTN}
            />
          </Tooltip>
        </>
      }
    >
      {/* The sailing has left and these still carry a status from before departure: listed to bring up to date (Council Outlay 14, C3). Nothing is changed for them. */}
      {behind.length > 0 && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-800" role="status">
          This sailing is {SAILING_STAGE_LABEL[stageOf(sailing)].toLowerCase()}, but {behind.length === 1 ? "1 shipment still has" : `${behind.length} shipments still have`} a status from before departure:{" "}
          {behind.map((s, i) => (
            <span key={s.id}>
              {i > 0 && ", "}
              <Link href={`/shipments/${s.id}`} className={`${LINK} font-semibold`}>
                {s.jobNumber}
              </Link>
            </span>
          ))}
          . Open each to set its status.
        </div>
      )}
      {/* What is ticked, and what can be done with it together. */}
      {ticked.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-indigo-100 bg-indigo-50/60 px-4 py-2" role="status">
          <span className="text-[13px] font-medium text-slate-800">{ticked.length === 1 ? "1 shipment ticked" : `${ticked.length} shipments ticked`}</span>
          <Tooltip title={closed ? closedHint : next ? "" : "This service has no other sailing still to come: create the next one on the service's page."}>
            <Button size="small" type="primary" disabled={closed || !next} onClick={() => setBulk("roll")}>
              {next ? `Roll to ${sailingTitle(next)}` : "Roll to next sailing"}
            </Button>
          </Tooltip>
          <Button size="small" disabled={closed} onClick={() => setBulk("move")}>
            Move to another sailing
          </Button>
          <Button size="small" danger disabled={closed} onClick={() => setBulk("remove")}>
            Remove from sailing
          </Button>
          <button type="button" className={`${LINK} cursor-pointer border-0 bg-transparent p-0 text-[12px]`} onClick={() => setTicked([])}>
            Untick all
          </button>
        </div>
      )}
      <div className="px-4 py-3 overflow-x-auto">
        <table className="w-full min-w-[980px] table-fixed border-collapse">
          <thead>
            <tr>
              <th className={`${TH} w-10`}>
                <Checkbox
                  aria-label="Tick all linked shipments"
                  checked={allTicked}
                  indeterminate={ticked.length > 0 && !allTicked}
                  disabled={closed || linked.length === 0}
                  onChange={(e) => setTicked(e.target.checked ? linked.map((s) => s.id) : [])}
                />
              </th>
              <th className={`${TH} w-[210px]`}>Internal Reference</th>
              <th className={TH}>Customer</th>
              <th className={TH}>Shipper</th>
              <th className={TH}>Consignee</th>
              <th className={`${TH} w-[150px]`}>Status</th>
              <th className={`${TH} w-[70px] text-right`}>Colli</th>
              <th className={`${TH} w-[110px] text-right`}>{sortHead("weightKg", "Weight (kg)")}</th>
              <th className={`${TH} w-[110px] text-right`}>{sortHead("volumeCbm", "Volume (cbm)")}</th>
              <th className={`${TH} w-12`}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shipments.map((s) => {
              const part = partOf.get(s.id);
              const { colli, weightKg, volumeCbm } = part ?? boxCargoOf(s);
              const isTicked = ticked.includes(s.id);
              // How the shipment differs from its sailing: a port (never copied), or what a copy would change.
              const fact = factsOf.get(s.id);
              const differs = fact
                ? [...fact.mismatches.map((m) => `${m.label}: ${m.shipment}, the sailing's is ${m.sailing}`), ...(fact.skipped ? [] : fact.changes.map((c) => `${c.label}: ${c.old || "empty"}, the sailing's is ${c.next}`))].join(" · ")
                : "";
              return (
              <tr key={s.id} className={`${part && !part.counted ? "text-slate-400" : ""} ${isTicked ? "bg-indigo-50/60" : ""}`}>
                <td className={TD}>
                  <Checkbox
                    aria-label={`Tick ${s.jobNumber}`}
                    checked={isTicked}
                    disabled={closed}
                    onChange={(e) => setTicked((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)))}
                  />
                </td>
                <td className={`${TD} truncate`}>
                  <Link href={`/shipments/${s.id}`} className={`${REF} ${LINK} font-semibold`}>
                    {s.jobNumber}
                  </Link>
                  {differs && (
                    <Tooltip title={differs}>
                      <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-700" role="note" aria-label={`Differs from the sailing: ${differs}`}>
                        differs
                      </span>
                    </Tooltip>
                  )}
                  {/* Linked after the sailing was closed for cargo: the reason given then (Council Outlay 14, C3). */}
                  {part?.lateReason && (
                    <Tooltip title={`Linked after the sailing was closed for cargo: ${part.lateReason}`}>
                      <span className="ml-1.5 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-semibold text-slate-600" role="note" aria-label={`Linked late: ${part.lateReason}`}>
                        late
                      </span>
                    </Tooltip>
                  )}
                </td>
                <td className={`${TD} truncate`}>{cell(s.customer)}</td>
                <td className={`${TD} truncate`}>{cell(s.shipper)}</td>
                <td className={`${TD} truncate`}>{cell(s.consignee)}</td>
                <td className={`${TD} truncate ${behind.some((b) => b.id === s.id) ? "font-medium text-amber-700" : ""}`}>{cell(s.status)}</td>
                {/* A figure that is missing is a dash, never a 0. */}
                <td className={`${TD} text-right tabular-nums`}>{colli > 0 ? colli.toLocaleString("en-US") : EMPTY_CELL}</td>
                <td className={`${TD} text-right tabular-nums`}>{weightKg > 0 ? tableKg(weightKg) : EMPTY_CELL}</td>
                <td className={`${TD} text-right tabular-nums`}>{volumeCbm > 0 ? tableCbm(volumeCbm) : EMPTY_CELL}</td>
                <td className={`${TD} text-center`}>
                  <Dropdown
                    trigger={["click"]}
                    placement="bottomRight"
                    menu={{
                      items: [
                        {
                          key: "move",
                          disabled: closed,
                          icon: <SwapOutlined />,
                          label: closed ? <span title={closedHint}>Move to another sailing</span> : "Move to another sailing",
                        },
                        {
                          key: "remove",
                          danger: !closed,
                          disabled: closed,
                          icon: <DisconnectOutlined />,
                          label: closed ? (
                            <span title={closedHint}>Remove from sailing</span>
                          ) : (
                            "Remove from sailing"
                          ),
                        },
                      ],
                      onClick: ({ key }) => (key === "move" ? setToMove(s) : setToRemove(s)),
                    }}
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={
                        <EllipsisOutlined className="text-[22px] [&_svg]:stroke-current [&_svg]:stroke-[40]" />
                      }
                      aria-label={`Actions for ${s.jobNumber}`}
                    />
                  </Dropdown>
                </td>
              </tr>
              );
            })}
          </tbody>
          {box && shipments.length > 0 && (
            <tfoot>
              <tr>
                <td className={TD_TOTAL} colSpan={6}>
                  Total{box.notCounted > 0 ? ` (${box.notCounted} cancelled, not counted)` : ""}
                </td>
                <td className={`${TD_TOTAL} text-right tabular-nums`}>{box.totals.colli.toLocaleString("en-US")}</td>
                <td className={`${TD_TOTAL} text-right tabular-nums`}>{tableKg(box.totals.weightKg)}</td>
                <td className={`${TD_TOTAL} text-right tabular-nums`}>{tableCbm(box.totals.volumeCbm)}</td>
                <td className={TD_TOTAL} />
              </tr>
            </tfoot>
          )}
        </table>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spin />
          </div>
        ) : isError ? (
          <div className={EMPTY_STATE}>Could not load the linked shipments.</div>
        ) : (
          shipments.length === 0 && <div className={EMPTY_STATE}>No shipments linked yet.</div>
        )}
      </div>

      {/* What was taken off this sailing: who did it, when and why. */}
      {removed.length > 0 && (
        <details className="border-t border-slate-100 px-4 py-3">
          <summary className="cursor-pointer text-[13px] font-medium text-slate-700">Taken off this sailing ({removed.length})</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr>
                  <th className={TH}>Shipment</th>
                  <th className={TH}>Customer</th>
                  <th className={TH}>Taken off</th>
                  <th className={TH}>By</th>
                  <th className={TH}>Why</th>
                </tr>
              </thead>
              <tbody>
                {removed.map((r) => (
                  <tr key={`${r.shipmentId}-${r.removedAt}`}>
                    <td className={`${TD} ${REF} font-semibold`}>{r.jobNumber || EMPTY_CELL}</td>
                    <td className={TD}>{cell(r.customer)}</td>
                    <td className={`${TD} whitespace-nowrap tabular-nums`}>{formatDateTime(r.removedAt)}</td>
                    <td className={TD}>{cell(r.removedByName)}</td>
                    <td className={TD}>{removedReasonWords(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <ConfirmModal
        open={!!toRemove}
        title={toRemove ? `Remove ${toRemove.jobNumber} from ${name}?` : ""}
        description="It can be linked again, to this sailing or another."
        confirmLabel="Remove"
        danger
        loading={unlink.isPending}
        onClose={() => setToRemove(null)}
        onConfirm={async () => {
          if (!toRemove) return;
          try {
            await unlink.mutateAsync(toRemove.id);
            message.success(`${toRemove.jobNumber} removed from ${name}`);
          } catch (err) {
            message.error(apiErrorMessage(err));
          } finally {
            setToRemove(null);
          }
        }}
      />
      <MoveShipmentModal
        open={!!toMove}
        onClose={() => setToMove(null)}
        sailing={sailing}
        shipment={toMove}
        moving={move.isPending}
        onMove={async (toSailingId, reason) => {
          if (!toMove) return;
          await move.mutateAsync({ shipmentId: toMove.id, toSailingId, reason });
          message.success(`${toMove.jobNumber} moved from ${name}`);
        }}
      />
      {/* The ticked ones together: rolled to the next sailing, moved to a picked one, or taken off - all or none. */}
      <MoveShipmentModal
        open={bulk === "move" || bulk === "roll"}
        onClose={() => setBulk(null)}
        sailing={sailing}
        shipment={null}
        several={ticked.length}
        initialTo={bulk === "roll" ? (next?.id ?? null) : null}
        moving={moveMany.isPending}
        onMove={async (toSailingId, reason) => {
          const { moved } = await moveMany.mutateAsync({ shipmentIds: ticked, toSailingId, reason });
          const to = siblings.find((x) => x.id === toSailingId);
          message.success(`${linkedCount(moved)} moved from ${name}${to ? ` to ${sailingTitle(to)}` : ""}`);
          setTicked([]);
        }}
      />
      <ConfirmModal
        open={bulk === "remove"}
        title={`Remove ${ticked.length === 1 ? "1 shipment" : `${ticked.length} shipments`} from ${name}?`}
        description="They can be linked again, to this sailing or another."
        confirmLabel="Remove"
        danger
        loading={unlinkMany.isPending}
        onClose={() => setBulk(null)}
        onConfirm={async () => {
          try {
            const { removed: gone } = await unlinkMany.mutateAsync(ticked);
            message.success(`${linkedCount(gone)} removed from ${name}`);
            setTicked([]);
          } catch (err) {
            message.error(apiErrorMessage(err));
          } finally {
            setBulk(null);
          }
        }}
      />
      <CopyToShipmentsModal
        open={copying}
        onClose={() => setCopying(false)}
        sailingName={name}
        facts={facts}
        copying={copy.isPending}
        onCopy={async (ids) => {
          const result = await copy.mutateAsync(ids);
          if (result.refused.length === 0) message.success(copyResultWords(result));
          return result;
        }}
      />
      <LinkSailingShipmentsModal
        open={picking}
        cutoff={cutoffWarning(sailing.cutoffDate, businessToday(), formatDate(sailing.cutoffDate))}
        sailingName={name}
        serviceName={serviceName}
        serviceMode={serviceMode}
        box={box}
        onClose={() => setPicking(false)}
        lateStage={linkNeedsReason(sailing) ? SAILING_STAGE_LABEL[stageOf(sailing)].toLowerCase() : null}
        onLink={async (ids, reason) => {
          await link.mutateAsync({ shipmentIds: ids, reason });
          message.success(`Linked ${linkedCount(ids.length)} to ${name}`);
        }}
      />
    </SectionCard>
  );
}

/**
 * Link shipments: the service's own shipments (its Service Name) on no sailing yet, searched on the
 * server, ticked and linked together. A tick stays through a new search.
 */
function LinkSailingShipmentsModal({
  open,
  sailingName,
  serviceName,
  serviceMode,
  box,
  cutoff,
  lateStage,
  onClose,
  onLink,
}: {
  open: boolean;
  /** The sailing is closed for cargo or at a later stage, in words ("closed for cargo"): linking then asks why. Null while it is open. */
  lateStage: string | null;
  /** The remark when the sailing's cut-off has passed; null otherwise. */
  cutoff: string | null;
  sailingName: string;
  serviceName: string;
  serviceMode: string;
  /** The box as it stands, to warn before a link would overfill it; null while it is read. */
  box: BoxUtilization | null;
  onClose: () => void;
  onLink: (shipmentIds: string[], reason?: string) => Promise<void>;
}) {
  const message = useMessages();
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  // What each ticked shipment would add to the box, kept by id: a tick stays through a new search.
  const [cargoOf, setCargoOf] = useState<Record<string, { weightKg: number; volumeCbm: number; odd: string | null }>>({});
  const [linking, setLinking] = useState(false);
  const search = useDebounced(query, 300);
  const results = useSailingCandidates(serviceName, search, open);
  const candidates = results.candidates;
  const toggle = (s: ShipmentItem) => {
    setSelected((prev) => (prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]));
    // What the box will count of it: its Dimensions lines first, then its typed totals.
    const { weightKg, volumeCbm } = boxCargoOf(s);
    setCargoOf((prev) => ({ ...prev, [s.id]: { weightKg, volumeCbm, odd: oddInBox(serviceMode, s) } }));
  };
  // A warning only: the overflow is the user's decision.
  const warning = box
    ? overfillWarning(box, {
        shipments: selected.length,
        weightKg: selected.reduce((total, id) => total + (cargoOf[id]?.weightKg ?? 0), 0),
        volumeCbm: selected.reduce((total, id) => total + (cargoOf[id]?.volumeCbm ?? 0), 0),
      })
    : null;
  // A shipment of another kind than the box is for (another mode, a container of its own) is not linked: the server refuses it (K3).
  const odd = oddWarning(selected.flatMap((id) => cargoOf[id]?.odd ?? []));

  const close = () => {
    setQuery("");
    setSelected([]);
    setCargoOf({});
    setReason("");
    onClose();
  };
  const handleLink = async () => {
    if (selected.length === 0 || linking) return;
    setLinking(true);
    try {
      await onLink(selected, lateStage ? reason.trim() : undefined);
      close();
    } catch (err) {
      message.error(`Linking the shipments failed: ${apiErrorMessage(err)}`);
    } finally {
      setLinking(false);
    }
  };

  return (
    <Modal
      open={open}
      title={<span className={MODAL_TITLE}>Link shipments to {sailingName}</span>}
      onCancel={close}
      width={820}
      destroyOnHidden
      footer={
        <div className="flex justify-between items-center gap-3">
          <span className={HINT}>{linkedCount(selected.length)} selected</span>
          <Space>
            <Button onClick={close}>Cancel</Button>
            <Button
              type="primary"
              disabled={selected.length === 0 || odd !== null || (lateStage !== null && !reason.trim())}
              loading={linking}
              onClick={handleLink}
            >
              {selected.length ? `Link ${selected.length}` : "Link"}
            </Button>
          </Space>
        </div>
      }
    >
      <div className="flex flex-col gap-3 pt-1">
        <p className={`m-0 ${HINT}`}>
          The {serviceName} shipments that are on no sailing yet. A shipment sits in one box at a
          time.
        </p>
        <Input
          autoFocus
          allowClear
          prefix={<SearchOutlined className="text-slate-400" />}
          placeholder="Search job number, customer, shipper, consignee, Port of Loading, Port of Discharge…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search shipments"
        />
        {/* Closed for cargo or later (Council Outlay 14, C3): the shipment still goes on, with the reason kept on its row. */}
        {lateStage && (
          <label className="flex flex-col gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <span className="text-[13px] font-medium text-amber-800">This sailing is {lateStage}. Say why these shipments still go on it.</span>
            <Input.TextArea aria-label="Why the shipments still go on this sailing" rows={2} maxLength={300} placeholder="e.g. Carrier accepted late cargo" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        )}
        {[cutoff, warning, odd].map(
          (text) =>
            text && (
              <p key={text} className="m-0 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800" role="status">
                <WarningOutlined className="mt-0.5" aria-hidden />
                <span>{text}</span>
              </p>
            ),
        )}
        <div className="max-h-[420px] overflow-auto scroll-pt-9 rounded-lg border border-slate-200">
          <table className="w-full min-w-[800px] table-fixed border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={`${PICK_TH} w-10 !pl-3`}>
                  <span className="sr-only">Selected</span>
                </th>
                <th className={`${PICK_TH} w-[172px]`}>Internal Reference</th>
                <th className={PICK_TH}>Customer</th>
                <th className={`${PICK_TH} w-[150px]`}>Route</th>
                <th className={`${PICK_TH} w-[96px]`}>ETD</th>
                <th className={`${PICK_TH} w-[100px] text-right`}>Weight (kg)</th>
                <th className={`${PICK_TH} w-[110px] !pr-3 text-right`}>Volume (cbm)</th>
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0">
              {candidates.map((s) => {
                const isChecked = selected.includes(s.id);
                // The ports by their codes ("CNSHA → DEHAM"), in full on hover.
                const route = [s.pol, s.pod]
                  .filter(Boolean)
                  .map((p) => placeCodeOf(p) ?? p)
                  .join(" → ");
                const party = s.customer || s.shipper || s.consignee;
                // As the box will count it: its Dimensions lines first, then its typed totals.
                const cargo = boxCargoOf(s);
                return (
                  <tr
                    key={s.id}
                    onClick={() => toggle(s)}
                    className={`cursor-pointer transition-colors ${isChecked ? "bg-indigo-50/70" : "hover:bg-slate-50"}`}
                  >
                    <td
                      className={`${TD} !pl-3`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!(e.target as Element).closest(".ant-checkbox-wrapper")) toggle(s);
                      }}
                    >
                      <Checkbox
                        checked={isChecked}
                        onChange={() => toggle(s)}
                        aria-label={`Link ${s.jobNumber}`}
                      />
                    </td>
                    <td className={`${TD} truncate`}>
                      <span className={`${REF} font-semibold text-slate-900`}>{s.jobNumber}</span>
                    </td>
                    <td
                      className={`${TD} truncate ${!s.customer && party ? "!text-slate-400" : ""}`}
                      title={[party, oddInBox(serviceMode, s)].filter(Boolean).join(" · ") || undefined}
                    >
                      {party || EMPTY_CELL}
                      {oddInBox(serviceMode, s) && <span className="ml-1.5 text-[11px] font-medium text-amber-700">{oddInBox(serviceMode, s)}</span>}
                    </td>
                    <td
                      className={`${TD} truncate tabular-nums`}
                      title={[s.pol, s.pod].filter(Boolean).join(" → ") || undefined}
                    >
                      {route || EMPTY_CELL}
                    </td>
                    <td className={`${TD} whitespace-nowrap tabular-nums`}>
                      {formatDate(s.estimatedDeparture) || EMPTY_CELL}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>{cargo.weightKg > 0 ? tableKg(cargo.weightKg) : EMPTY_CELL}</td>
                    <td className={`${TD} text-right tabular-nums !pr-3`}>{cargo.volumeCbm > 0 ? tableCbm(cargo.volumeCbm) : EMPTY_CELL}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {results.isLoading ? (
            <div className="flex justify-center py-8">
              <Spin />
            </div>
          ) : results.isError ? (
            <div className={EMPTY_STATE}>
              Could not search the shipments - {apiErrorMessage(results.error)}.{" "}
              <Button size="small" onClick={() => void results.refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            candidates.length === 0 && (
              <div className={EMPTY_STATE}>
                {search
                  ? "No shipments match the search."
                  : `No ${serviceName} shipments are left to link: each is on a sailing already.`}
              </div>
            )
          )}
        </div>
      </div>
    </Modal>
  );
}
