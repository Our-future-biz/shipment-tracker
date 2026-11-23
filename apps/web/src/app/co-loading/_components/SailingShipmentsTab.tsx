"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Checkbox, Dropdown, Input, Modal, Space, Spin, Tooltip } from "antd";
import {
  DisconnectOutlined,
  EllipsisOutlined,
  InboxOutlined,
  PlusOutlined,
  SearchOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { api, apiErrorMessage } from "@/lib/api";
import { useDebounced } from "@/hooks/useDebounced";
import { useShipments, type ShipmentItem } from "@/hooks/useShipments";
import { useSailingRemoved, useSailingShipmentLinks, useSailingUtilization, type CoLoadingSailing } from "@/hooks/useCoLoadingServices";
import { linkedCount } from "@/app/shipments/_components/MasterJobDialog";
import { ConfirmModal } from "@/components/ConfirmModal";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { formatDate, formatDateTime } from "@/lib/date";
import { placeCodeOf } from "@/lib/places";
import { useMessages } from "@/lib/toast";
import { CARD, EMPTY_STATE, HINT, LINK, MODAL_TITLE, REF, TD, TD_TOTAL, TH } from "@/styles/ui";
import { oddInBox, oddWarning, overfillWarning, removedReasonWords, tableCbm, tableKg, type BoxUtilization } from "../_lib/boxUtilization";
import { sailingTitle } from "../_lib/sailings";

// The picker's head stays put while its rows scroll, as the master job's picker does.
const PICK_TH = `${TH} sticky top-0 z-10 bg-white`;

/** A figure typed on a shipment (free text, a comma for the decimal point): 0 when there is none. */
const typedNumber = (v: string | number | null | undefined): number => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

// A cell's text, cut short with the whole of it on hover, or a dash.
const cell = (v: string | null | undefined) => (v ? <span title={v}>{v}</span> : EMPTY_CELL);

/**
 * A sailing's Linked shipments tab: the shipments in its box, in the master job's Linked shipments
 * look, with "+" to link more and "⋯ → Remove from sailing" on each. Only the service's own shipments
 * (its Service Name) that are on no sailing yet are offered: a shipment sits in one box at a time.
 * Anyone links and removes; nothing while the service is closed.
 */
export function SailingShipmentsTab({
  sailing,
  serviceName,
  serviceMode,
  closed,
}: {
  sailing: CoLoadingSailing;
  serviceName: string;
  /** The service's mode of transport: a shipment of another kind is remarked on before it is linked. */
  serviceMode: string;
  closed: boolean;
}) {
  const { shipments, isLoading, isError } = useShipments({ sailing: sailing.id });
  const { link, unlink } = useSailingShipmentLinks(sailing.id);
  // The figures are the box's own (Box utilization): each shipment's cargo lines, else its typed
  // totals, in kg. While they are read, the shipment's typed totals stand in.
  const { box } = useSailingUtilization(sailing.id);
  const partOf = new Map((box?.rows ?? []).map((row) => [row.shipmentId, row]));
  const { removed } = useSailingRemoved(sailing.id);
  const message = useMessages();
  const [picking, setPicking] = useState(false);
  const [toRemove, setToRemove] = useState<ShipmentItem | null>(null);
  const name = sailingTitle(sailing);
  const closedHint =
    "The service is closed: nothing can be linked or removed until it is reopened.";

  return (
    <section className={CARD} aria-label="Linked shipments">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 bg-indigo-50/60 rounded-t-xl">
        <h2 className="m-0 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-slate-900">
          <InboxOutlined className="text-indigo-600" />
          Linked shipments ({shipments.length})
        </h2>
        <Tooltip title={closed ? closedHint : "Link shipments"}>
          <Button
            size="small"
            type="primary"
            icon={<PlusOutlined className="text-[11px]" />}
            aria-label="Link shipments"
            disabled={closed}
            onClick={() => setPicking(true)}
            className="!w-[22px] !h-[22px] !min-w-0 !p-0"
          />
        </Tooltip>
      </div>
      <div className="px-5 py-3 overflow-x-auto">
        <table className="w-full min-w-[940px] table-fixed border-collapse">
          <thead>
            <tr>
              <th className={`${TH} w-[160px]`}>Internal Reference</th>
              <th className={TH}>Customer</th>
              <th className={TH}>Shipper</th>
              <th className={TH}>Consignee</th>
              <th className={`${TH} w-[150px]`}>Status</th>
              <th className={`${TH} w-[70px] text-right`}>Colli</th>
              <th className={`${TH} w-[100px] text-right`}>Weight (kg)</th>
              <th className={`${TH} w-[100px] text-right`}>Volume (cbm)</th>
              <th className={`${TH} w-12`}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shipments.map((s) => {
              const part = partOf.get(s.id);
              const colli = part ? part.colli : typedNumber(s.pcs);
              const weightKg = part ? part.weightKg : typedNumber(s.totalWeightTons) * 1000;
              const volumeCbm = part ? part.volumeCbm : typedNumber(s.totalVolumeCbm);
              return (
              <tr key={s.id} className={part && !part.counted ? "text-slate-400" : ""}>
                <td className={`${TD} truncate`}>
                  <Link href={`/shipments/${s.id}`} className={`${REF} ${LINK} font-semibold`}>
                    {s.jobNumber}
                  </Link>
                </td>
                <td className={`${TD} truncate`}>{cell(s.customer)}</td>
                <td className={`${TD} truncate`}>{cell(s.shipper)}</td>
                <td className={`${TD} truncate`}>{cell(s.consignee)}</td>
                <td className={`${TD} truncate`}>{cell(s.status)}</td>
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
                      onClick: () => setToRemove(s),
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
                <td className={TD_TOTAL} colSpan={5}>
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
        <details className="border-t border-slate-100 px-5 py-3">
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
                    <td className={TD}>{removedReasonWords(r.reason)}</td>
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
      <LinkSailingShipmentsModal
        open={picking}
        sailingName={name}
        serviceName={serviceName}
        serviceMode={serviceMode}
        box={box}
        onClose={() => setPicking(false)}
        onLink={async (ids) => {
          await link.mutateAsync(ids);
          message.success(`Linked ${linkedCount(ids.length)} to ${name}`);
        }}
      />
    </section>
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
  onClose,
  onLink,
}: {
  open: boolean;
  sailingName: string;
  serviceName: string;
  serviceMode: string;
  /** The box as it stands, to warn before a link would overfill it; null while it is read. */
  box: BoxUtilization | null;
  onClose: () => void;
  onLink: (shipmentIds: string[]) => Promise<void>;
}) {
  const message = useMessages();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  // What each ticked shipment would add to the box, kept by id: a tick stays through a new search.
  const [cargoOf, setCargoOf] = useState<Record<string, { weightKg: number; volumeCbm: number; odd: string | null }>>({});
  const [linking, setLinking] = useState(false);
  const search = useDebounced(query, 300);
  const results = useQuery({
    queryKey: ["shipments", "sailing-picker", serviceName, search],
    queryFn: () =>
      api.shipments.shipmentList({
        search: search.trim() || undefined,
        serviceName,
        sailing: "none",
        limit: 100,
      }),
    enabled: open && !!serviceName,
  });
  const candidates = results.data?.data ?? [];
  const toggle = (s: ShipmentItem) => {
    setSelected((prev) => (prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]));
    setCargoOf((prev) => ({ ...prev, [s.id]: { weightKg: typedNumber(s.totalWeightTons) * 1000, volumeCbm: typedNumber(s.totalVolumeCbm), odd: oddInBox(serviceMode, s) } }));
  };
  // A warning only: the overflow is the user's decision.
  const warning = box
    ? overfillWarning(box, {
        shipments: selected.length,
        weightKg: selected.reduce((total, id) => total + (cargoOf[id]?.weightKg ?? 0), 0),
        volumeCbm: selected.reduce((total, id) => total + (cargoOf[id]?.volumeCbm ?? 0), 0),
      })
    : null;
  // A shipment of another kind than the box is for (another mode, a container of its own) is remarked on, not refused.
  const odd = oddWarning(selected.flatMap((id) => cargoOf[id]?.odd ?? []));

  const close = () => {
    setQuery("");
    setSelected([]);
    setCargoOf({});
    onClose();
  };
  const handleLink = async () => {
    if (selected.length === 0 || linking) return;
    setLinking(true);
    try {
      await onLink(selected);
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
              disabled={selected.length === 0}
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
        {[warning, odd].map(
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
                    <td className={`${TD} text-right tabular-nums`}>{typedNumber(s.totalWeightTons) > 0 ? tableKg(typedNumber(s.totalWeightTons) * 1000) : EMPTY_CELL}</td>
                    <td className={`${TD} text-right tabular-nums !pr-3`}>{typedNumber(s.totalVolumeCbm) > 0 ? tableCbm(typedNumber(s.totalVolumeCbm)) : EMPTY_CELL}</td>
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
