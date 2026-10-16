"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, Tooltip } from "antd";
import { PlusOutlined, TagsOutlined } from "@ant-design/icons";
import { AppGrid, type AppGridColumn } from "@/components/AppGrid";
import { Badge } from "@/components/Badge";
import { useTruckingSettings } from "@/hooks/useTrucking";
import { useConsignments, type ConsignmentListItem, type ConsignmentStatus } from "@/hooks/useTruckingConsignments";
import { formatDate } from "@/lib/date";
import {
  CONSIGNMENT_CHIPS,
  CONSIGNMENT_STATUS_CHIP,
  CONSIGNMENT_TILES,
  attentionSummary,
  buyLabel,
  buySource,
  consignmentHref,
  consignmentViewOf,
  marginBlocks,
  marginState,
  marginText,
  tripHref,
} from "../_lib/consignments";
import { formatMoney, formatQty } from "../_lib/tariffs";
import { ConsignmentCreateModal } from "./ConsignmentCreateModal";
import { ConsignmentQuickChips } from "./ConsignmentQuickChips";
import { ConsignmentTiles, type ConsignmentTileId } from "./ConsignmentTiles";
import { LabelsModal } from "./LabelsModal";
import { TruckingStatusChip } from "./TruckingStatusChip";
import { byNumber, byText, dash, place, pragueDate } from "../_lib/format";

const STATUSES = Object.keys(CONSIGNMENT_STATUS_CHIP) as ConsignmentStatus[];
const stop = (e: React.MouseEvent) => e.stopPropagation();

const buildColumns = (levelLabel: (code: string | null) => string): AppGridColumn<ConsignmentListItem>[] => [
  {
    key: "ref",
    title: "Consignment",
    text: (c) => c.ref,
    sorter: (a, b) => byText(a.ref, b.ref),
    render: (_, c) => (
      <Link href={consignmentHref(c.id)} onClick={stop} className="font-mono font-semibold text-indigo-600 hover:underline">
        {c.ref}
      </Link>
    ),
  },
  {
    key: "status",
    title: "Status",
    text: (c) => CONSIGNMENT_STATUS_CHIP[c.status].label,
    filterOptions: STATUSES.map((s) => CONSIGNMENT_STATUS_CHIP[s].label),
    sorter: (a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status),
    render: (_, c) => <TruckingStatusChip chip={CONSIGNMENT_STATUS_CHIP[c.status]} />,
  },
  {
    key: "attention",
    title: "Needs attention",
    text: (c) => c.needsAttention.join("; "),
    render: (_, c) => {
      const summary = attentionSummary(c.needsAttention);
      if (!summary) return dash;
      return (
        <Tooltip title={summary.more ? c.needsAttention.join(" · ") : undefined}>
          <span className="text-[12.5px] text-red-700">
            {summary.first}
            {summary.more > 0 && <span className="ml-1 font-semibold">+{summary.more}</span>}
          </span>
        </Tooltip>
      );
    },
  },
  {
    key: "job",
    title: "Job no.",
    text: (c) => c.jobNumber,
    sorter: (a, b) => byText(a.jobNumber, b.jobNumber),
    render: (_, c) => (
      <Link href={`/shipments/${c.shipmentId}?tab=trucking`} onClick={stop} className="font-mono text-indigo-600 hover:underline">
        {c.jobNumber}
      </Link>
    ),
  },
  { key: "customer", title: "Customer", text: (c) => c.customerName, sorter: (a, b) => byText(a.customerName, b.customerName) },
  {
    key: "internal",
    title: "Billing",
    text: (c) => (c.internal ? "Internal" : "Customer"),
    filterOptions: ["Customer", "Internal"],
    render: (_, c) => (c.internal ? <Badge tone="i">Internal</Badge> : <span className="text-slate-500">Customer</span>),
  },
  {
    key: "avizace",
    title: "Avizace",
    text: (c) => (c.avizaceNeeded ? (c.avizaceDone ? "Recorded" : "Needed") : ""),
    filterOptions: ["Needed", "Recorded"],
    render: (_, c) => (c.avizaceNeeded ? <Badge tone={c.avizaceDone ? "g" : "a"}>{c.avizaceDone ? "Recorded" : "Needed"}</Badge> : dash),
  },
  {
    key: "exceptions",
    title: "Open exceptions",
    text: (c) => (c.openExceptions ? String(c.openExceptions) : ""),
    sorter: (a, b) => a.openExceptions - b.openExceptions,
    render: (_, c) => (c.openExceptions ? <span className="font-semibold text-red-600">{c.openExceptions}</span> : dash),
  },
  { key: "level", title: "Service level", text: (c) => levelLabel(c.serviceLevel) },
  { key: "pickupDate", title: "Pick-up", text: (c) => formatDate(c.pickupDate), sorter: (a, b) => byText(a.pickupDate, b.pickupDate) },
  { key: "from", title: "From", text: (c) => place(c.pickupPostcode, c.pickupCity), sorter: (a, b) => byText(a.pickupPostcode, b.pickupPostcode) },
  { key: "to", title: "To", text: (c) => place(c.deliveryPostcode, c.deliveryCity), sorter: (a, b) => byText(a.deliveryPostcode, b.deliveryPostcode) },
  {
    key: "promised",
    title: "Promised",
    text: (c) => formatDate(c.promisedDate),
    sorter: (a, b) => byText(a.promisedDate ?? "9999", b.promisedDate ?? "9999"),
    render: (_, c) => formatDate(c.promisedDate) || dash,
  },
  { key: "pallets", title: "Pallet places", text: (c) => formatQty(c.palletPlaces), sorter: (a, b) => a.palletPlaces - b.palletPlaces },
  { key: "ldm", title: "LDM", text: (c) => formatQty(c.ldm), sorter: (a, b) => a.ldm - b.ldm, defaultVisible: false },
  { key: "weight", title: "Weight kg", text: (c) => formatQty(c.weightKg), sorter: (a, b) => a.weightKg - b.weightKg },
  { key: "adr", title: "ADR", text: (c) => (c.adr ? "Yes" : "No"), filterOptions: ["Yes", "No"], render: (_, c) => (c.adr ? <span className="font-semibold text-amber-700">ADR</span> : dash) },
  {
    key: "trip",
    title: "Trip",
    text: (c) => c.tripRef ?? "",
    render: (_, c) =>
      c.tripId && c.tripRef ? (
        <Link href={tripHref(c.tripId)} onClick={stop} className="font-mono text-indigo-600 hover:underline">
          {c.tripRef}
        </Link>
      ) : (
        dash
      ),
  },
  { key: "haulier", title: "Haulier", text: (c) => c.haulierName ?? "", render: (_, c) => c.haulierName || dash },
  { key: "sell", title: "Sell CZK", text: (c) => formatMoney(c.sellCzk, "CZK"), sorter: (a, b) => byNumber(a.sellCzk, b.sellCzk) },
  {
    key: "buy",
    title: "Buy CZK",
    text: (c) => formatMoney(c.buyCzk, "CZK"),
    sorter: (a, b) => byNumber(a.buyCzk, b.buyCzk),
    render: (_, c) =>
      c.buyCzk == null ? (
        dash
      ) : (
        <Tooltip title={buyLabel(c)}>
          <span>
            {formatMoney(c.buyCzk, "CZK")} <span className={`text-[11px] ${c.buyReal ? "text-emerald-700" : "text-slate-400"}`}>{buySource(c)}</span>
          </span>
        </Tooltip>
      ),
  },
  {
    key: "margin",
    title: "Margin",
    text: (c) => [marginText(c), marginState(c)?.label ?? ""].filter(Boolean).join(" · "),
    sorter: (a, b) => byNumber(a.marginCzk, b.marginCzk),
    render: (_, c) => {
      const state = marginState(c);
      return (
        <Tooltip title={[state?.hint ?? "", c.marginCzk != null && buySource(c) ? `With the ${buySource(c)} buy` : ""].filter(Boolean).join(" · ") || undefined}>
          <span className="inline-flex items-center gap-1.5">
            <span className={marginBlocks(c) ? "font-semibold text-red-600" : c.belowFloor ? "text-amber-700" : undefined}>{marginText(c)}</span>
            {state && <Badge tone={state.tone}>{state.label}</Badge>}
          </span>
        </Tooltip>
      );
    },
  },
  {
    key: "pod",
    title: "POD",
    text: (c) => pragueDate(c.podReceivedAt),
    render: (_, c) => (c.podReceivedAt ? <span className="text-emerald-700">{pragueDate(c.podReceivedAt)}</span> : dash),
  },
  { key: "created", title: "Created", text: (c) => pragueDate(c.createdAt), sorter: (a, b) => byText(a.createdAt, b.createdAt), defaultVisible: false },
];

// The consignments we carry, from order to POD: tiles and chips filter on the server (?status=,
// ?view=), the grid searches and filters what came back; a row opens the consignment page.
export const TruckingConsignmentsTab = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { settings } = useTruckingSettings();
  const [createOpen, setCreateOpen] = useState(false);
  const [labelsFor, setLabelsFor] = useState<ConsignmentListItem[] | null>(null);

  const view = consignmentViewOf(searchParams.get("view"));
  const status = STATUSES.find((s) => s === searchParams.get("status")) ?? null;
  // ?job= (a job's shipment id): the consignments of one job, as Shipments and the Costs tab link here.
  const job = searchParams.get("job");
  const { consignments, counts, isLoading, isError } = useConsignments({ view: view ?? undefined, status: status ?? undefined, shipmentId: job ?? undefined });
  const activeTile: ConsignmentTileId | null = CONSIGNMENT_TILES.find((t) => t.view === view)?.id ?? null;
  const chipView = CONSIGNMENT_CHIPS.find((c) => c.id === view)?.id ?? null;
  const jobNumber = job ? (consignments[0]?.jobNumber ?? null) : null;

  const setFilter = (next: { view?: string | null; status?: string | null; job?: string | null }) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  const handleTile = (id: ConsignmentTileId | null) => {
    const tile = CONSIGNMENT_TILES.find((t) => t.id === id);
    setFilter({ view: tile?.view ?? null, status: null });
  };

  const columns = useMemo(() => {
    const labels = new Map(settings?.serviceLevels.map((l) => [l.code as string, l.label]) ?? []);
    return buildColumns((code) => (code ? (labels.get(code) ?? code) : "—"));
  }, [settings]);

  let emptyText = "No consignments yet. Create one from a job, a quote or as a new domestic order.";
  if (isError) emptyText = "The consignments could not be loaded.";
  else if (view || status || job) emptyText = "No consignments match this filter.";

  return (
    <>
      <AppGrid<ConsignmentListItem>
        subHeader={
          <>
            <ConsignmentTiles active={activeTile} counts={counts} onSelect={handleTile} />
            <ConsignmentQuickChips active={chipView} counts={counts} onSelect={(id) => setFilter({ view: id, status: null })} />
            {job && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-slate-600">
                <span>
                  Only the consignments of job <span className="font-mono font-semibold text-slate-800">{jobNumber ?? "…"}</span>
                </span>
                <button type="button" className="font-semibold text-indigo-600 hover:underline" onClick={() => setFilter({ job: null })}>
                  Show all consignments
                </button>
              </div>
            )}
          </>
        }
        searchPlaceholder="Search consignment, job, customer, city, haulier…"
        columns={columns}
        rows={consignments}
        rowKey={(c) => c.id}
        loading={isLoading}
        onRowClick={(c) => router.push(consignmentHref(c.id))}
        storageKey="trucking:consignments:v1"
        exportFilePrefix="consignments"
        emptyText={emptyText}
        resetKey={`${view ?? ""}|${status ?? ""}|${job ?? ""}`}
        bulkActions={(selected) => (
          <Button size="small" icon={<TagsOutlined />} onClick={() => setLabelsFor(selected)}>
            Labels PDF…
          </Button>
        )}
        actions={
          <Tooltip title="Book a consignment from a job, from a quote, or as a new domestic order (its job is created)">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 shrink-0 rounded-lg bg-indigo-600 px-3 h-8 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              <PlusOutlined />
              Create new
            </button>
          </Tooltip>
        }
      />
      {labelsFor && (
        <LabelsModal
          consignmentIds={labelsFor.map((c) => c.id)}
          what={labelsFor.length === 1 ? labelsFor[0]!.ref : `${labelsFor.length} consignments`}
          onClose={() => setLabelsFor(null)}
        />
      )}
      {createOpen && <ConsignmentCreateModal onClose={() => setCreateOpen(false)} onCreated={(id) => router.push(consignmentHref(id))} />}
    </>
  );
};
