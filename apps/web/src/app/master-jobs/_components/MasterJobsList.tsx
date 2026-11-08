"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DatePicker, Tooltip } from "antd";
import { ClearOutlined, LoadingOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { AppGrid, type AppGridColumn } from "@/components/AppGrid";
import { TOOLBAR_BUTTON_CLASS } from "@/components/gridFilters";
import { COLUMN_MAP, DROPDOWN_OPTIONS, joinDateTime } from "@/lib/columnConfig";
import { formatDate } from "@/lib/date";
import { LOAD_TYPE_FILTER_OPTIONS, loadTypeLabel } from "@/lib/enums";
import type { MasterJobItem } from "@/hooks/useMasterJobs";
import { PillTabs } from "@/components/SectionCard";
import { Pill } from "@/components/Pill";
import { BTN_PRIMARY, EMPTY, LINK, REF } from "@/styles/ui";
import { kgFromTons } from "../_lib/mblWeight";

// An empty cell reads "—", as in every list of the app.
const orDash = (v: string | null | undefined) => (v ? v : <span className={EMPTY}>—</span>);

// The load types as the title row's pills (the same ?load= filter the list always had).
const LOAD_PILLS = [{ key: "", label: "All" }, ...LOAD_TYPE_FILTER_OPTIONS.map((v) => ({ key: v, label: v }))];

interface MasterJobsListProps {
  masterJobs: MasterJobItem[];
  isLoading: boolean;
  isError: boolean;
  creating: boolean;
  onCreate: () => void;
}

// The search, the load type and the ETD range live in the URL (?q=, ?load=, ?etd=from,to); the
// column filters (Trade Direction, Shipping line and the rest) are the grid's own, kept for the
// browser tab. Either way a list left for a master job comes back as it was. As on Shipments, the
// toolbar holds one quick filter (the ETD range); the others are under Filters.
type FilterKey = "q" | "load" | "etd";

const byText = (a: string, b: string) => a.localeCompare(b);
const byDate = (a: string | null, b: string | null) => (a ?? "").localeCompare(b ?? "");

/** The Shipments grid's title and width for a field; one only the master job has takes `ownTitle`. */
const asShipments = (key: string, ownTitle?: string) => {
  const col = COLUMN_MAP.get(key);
  return { title: col?.title ?? ownTitle ?? key, width: col?.width ?? 140 };
};

interface ColumnOptions {
  /** The title of a field the shipments do not have (as MBL Details names it). */
  title?: string;
  /** Not shown until picked under Columns. */
  hidden?: boolean;
  /** A reference people read out (BoL, booking, release): even figures and a slashed zero. */
  code?: boolean;
  /** A number: right-aligned figures. */
  number?: boolean;
  filterOptions?: string[];
}

function textColumn(key: string, get: (m: MasterJobItem) => string, o: ColumnOptions = {}): AppGridColumn<MasterJobItem> {
  return {
    key,
    ...asShipments(key, o.title),
    ...(o.hidden ? { defaultVisible: false } : {}),
    ...(o.number ? { align: "right" as const } : {}),
    ...(o.filterOptions ? { filterOptions: o.filterOptions } : {}),
    text: (m) => get(m),
    // A number sorts by its value ("250" before "1000"), text by its letters.
    sorter: o.number ? (a, b) => (parseFloat(get(a)) || 0) - (parseFloat(get(b)) || 0) : (a, b) => byText(get(a), get(b)),
    render: (_, m) => {
      const v = get(m);
      return v && (o.code || o.number) ? <span className={o.code ? REF : "tabular-nums"}>{v}</span> : orDash(v);
    },
  };
}

/** A date as the Shipments grid shows it (DD.MM.YYYY), with its time after it where the field has one. */
function dateColumn(
  key: string,
  get: (m: MasterJobItem) => string | null,
  o: { hidden?: boolean; time?: (m: MasterJobItem) => string } = {},
): AppGridColumn<MasterJobItem> {
  const shown = (m: MasterJobItem) => {
    const [date, time] = joinDateTime(get(m), o.time?.(m)).split(" ");
    return date ? [formatDate(date), time].filter(Boolean).join(" ") : "";
  };
  return {
    key,
    ...asShipments(key),
    ...(o.hidden ? { defaultVisible: false } : {}),
    text: shown,
    sorter: (a, b) => byDate(get(a), get(b)),
    render: (_, m) => <span className="tabular-nums whitespace-nowrap">{orDash(shown(m))}</span>,
  };
}

export function MasterJobsList({ masterJobs, isLoading, isError, creating, onCreate }: MasterJobsListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const get = (key: FilterKey) => searchParams.get(key) ?? "";
  const q = get("q").trim().toLowerCase();
  const load = get("load");
  const [etdFrom, etdTo] = get("etd").split(",");
  // The box keeps what is typed (spaces included); it follows the URL when that changes
  // from outside, e.g. "Clear filters" or back/forward.
  const urlQuery = get("q");
  // What is typed belongs to the URL value it was typed over; a new URL value replaces it.
  const [typed, setTyped] = useState({ over: urlQuery, text: urlQuery });
  const query = typed.over === urlQuery ? typed.text : urlQuery;
  const setQuery = (text: string) => setTyped({ over: urlQuery, text });

  const setFilter = (key: FilterKey, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `/master-jobs?${qs}` : "/master-jobs", { scroll: false });
  };

  const openHref = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("open", id);
    return `/master-jobs?${params.toString()}`;
  };

  const lines = useMemo(
    () => [...new Set(masterJobs.map((m) => m.shippingLine.trim()).filter(Boolean))].sort(byText),
    [masterJobs],
  );

  const rows = useMemo(
    () =>
      // The search itself is the grid's (it reads every column, the hidden ones too); the page
      // keeps its text in the URL.
      masterJobs.filter((m) => {
        if (load && loadTypeLabel(m.loadType, m.freightMode) !== load) return false;
        if (etdFrom && (!m.estimatedDeparture || m.estimatedDeparture < etdFrom)) return false;
        if (etdTo && (!m.estimatedDeparture || m.estimatedDeparture > etdTo)) return false;
        return true;
      }),
    [masterJobs, load, etdFrom, etdTo],
  );

  // The Shipments grid's columns (AppGrid): one line each, a plain-text value for search,
  // column filters and export, and "—" for an empty cell. A field the shipments have too takes its
  // title and width from the Shipments grid's own column (lib/columnConfig), so both lists name it
  // the same way.
  const columns: AppGridColumn<MasterJobItem>[] = [
    {
      key: "mczNumber",
      ...asShipments("masterJob"),
      // The MCZ stays frozen on the left while the rest scrolls.
      fixed: "left",
      text: (m) => m.mczNumber,
      sorter: (a, b) => byText(a.mczNumber, b.mczNumber),
      render: (_, m) => (
        // The row opens the same master job on click; without stopping the event here a
        // Ctrl/Cmd-click would open a new tab and also navigate this one.
        <Link href={openHref(m.id)} onClick={(e) => e.stopPropagation()} className={`${REF} font-semibold ${LINK}`}>
          {m.mczNumber}
        </Link>
      ),
    },
    textColumn("masterBolNumber", (m) => m.masterBolNumber, { code: true }),
    // By air a Full Load reads Single Shipment (and is filtered as one). A category, so a pill.
    {
      key: "loadType",
      ...asShipments("loadType"),
      text: (m) => loadTypeLabel(m.loadType, m.freightMode),
      filterOptions: LOAD_TYPE_FILTER_OPTIONS,
      render: (_, m) => (m.loadType ? <Pill tone="slate">{loadTypeLabel(m.loadType, m.freightMode)}</Pill> : orDash("")),
    },
    textColumn("tradeDirection", (m) => m.tradeDirection, { filterOptions: DROPDOWN_OPTIONS["Trade Direction"] }),
    // picked under Filters from the lines the master jobs have
    textColumn("shippingLine", (m) => m.shippingLine, { filterOptions: lines }),
    textColumn("vessel", (m) => m.vessel),
    textColumn("voyage", (m) => m.voyage),
    textColumn("pol", (m) => m.pol),
    textColumn("pod", (m) => m.pod),
    dateColumn("estimatedDeparture", (m) => m.estimatedDeparture),
    dateColumn("actualDeparture", (m) => m.actualDeparture),
    dateColumn("estimatedArrival", (m) => m.estimatedArrival),
    dateColumn("actualArrival", (m) => m.actualArrival),
    {
      key: "shipmentCount",
      title: "Shipments",
      width: 100,
      align: "right",
      text: (m) => String(m.shipmentCount),
      sorter: (a, b) => a.shipmentCount - b.shipmentCount,
      render: (_, m) => <span className="tabular-nums">{m.shipmentCount}</span>,
    },
    // Every other field of the master job, shown when picked under Columns (and searched always).
    textColumn("bookingNumber", (m) => m.bookingNumber, { hidden: true, code: true }),
    textColumn("shipper", (m) => m.shipper, { hidden: true }),
    textColumn("consignee", (m) => m.consignee, { hidden: true }),
    textColumn("freightMode", (m) => m.freightMode, { hidden: true, filterOptions: DROPDOWN_OPTIONS["Freight Mode"] }),
    textColumn("serviceName", (m) => m.serviceName, { hidden: true }),
    textColumn("incotermOrigin", (m) => m.incotermOrigin, { hidden: true }),
    textColumn("incotermDestination", (m) => m.incotermDestination, { hidden: true }),
    textColumn("destination", (m) => m.destination, { hidden: true }),
    textColumn("masterBolType", (m) => m.masterBolType, { hidden: true }),
    textColumn("equipment", (m) => m.equipment, { hidden: true, title: "Equipment" }),
    dateColumn("etaWarehouse", (m) => m.etaWarehouse, { hidden: true }),
    dateColumn("warehouseReceivedDate", (m) => m.warehouseReceivedDate, { hidden: true }),
    dateColumn("closingDate", (m) => m.closingDate, { hidden: true, time: (m) => m.closingTime }),
    dateColumn("vgmClosing", (m) => m.vgmClosing, { hidden: true, time: (m) => m.vgmClosingTime }),
    dateColumn("siClosing", (m) => m.siClosing, { hidden: true, time: (m) => m.siClosingTime }),
    dateColumn("amsDeadline", (m) => m.amsDeadline, { hidden: true, time: (m) => m.amsDeadlineTime }),
    dateColumn("isfDeadline", (m) => m.isfDeadline, { hidden: true, time: (m) => m.isfDeadlineTime }),
    textColumn("releaseReference", (m) => m.releaseReference, { hidden: true, code: true }),
    textColumn("releaseDepot", (m) => m.releaseDepot, { hidden: true }),
    textColumn("redeliveryReference", (m) => m.redeliveryReference, { hidden: true, code: true }),
    textColumn("redeliveryDepot", (m) => m.redeliveryDepot, { hidden: true }),
    textColumn("supplierPic", (m) => m.supplierPic, { hidden: true }),
    // The MBL's own cargo totals, as the shipments' columns name them.
    textColumn("pcs", (m) => m.pcs, { hidden: true, number: true }),
    textColumn("typeOfPackages", (m) => m.typeOfPackages, { hidden: true }),
    // In kg, as the Shipments grid shows it; the master job keeps tons.
    textColumn("totalWeightTons", (m) => kgFromTons(m.totalWeightTons), { hidden: true, number: true }),
    textColumn("totalVolumeCbm", (m) => m.totalVolumeCbm, { hidden: true, number: true }),
  ];

  const filtered = !!(q || load || etdFrom || etdTo);

  // With master jobs there, an empty list is a filtered one (the URL's or the grid's column filters).
  let emptyText = masterJobs.length > 0 ? "No master jobs match these filters." : "No master jobs yet - create the first one with New Master Job.";
  // A list that is still being read is not an empty one, and neither is one that could not be read.
  if (isLoading) emptyText = "Loading master jobs…";
  if (isError) emptyText = "Could not load master jobs.";

  return (
    // The app's list page, built on its grid (AppGrid), the same as the Shipments grid: the title
    // with the load-type pills, the toolbar card (New Master Job on the left, the search in the
    // middle, the filters, column filters, columns and export on the right), the table with row
    // selection, and the rows-per-page / pagination bar.
    <AppGrid<MasterJobItem>
      title="Master Jobs"
      headerExtra={
        <div role="group" aria-label="Filter by load type">
          <PillTabs tabs={LOAD_PILLS} active={load} onChange={(v) => setFilter("load", v)} />
        </div>
      }
      actions={
        <button type="button" onClick={onCreate} disabled={creating} className={BTN_PRIMARY}>
          {creating ? <LoadingOutlined /> : <PlusOutlined />}
          New Master Job
        </button>
      }
      searchPlaceholder="Search master jobs..."
      search={query}
      onSearchChange={(text) => {
        setQuery(text);
        setFilter("q", text);
      }}
      filters={
        <>
          <DatePicker.RangePicker
            className="w-56"
            placeholder={["ETD from", "ETD to"]}
            format="DD.MM.YYYY"
            aria-label="ETD"
            value={etdFrom || etdTo ? [etdFrom ? dayjs(etdFrom) : null, etdTo ? dayjs(etdTo) : null] : null}
            onChange={(range) =>
              setFilter(
                "etd",
                range && (range[0] || range[1])
                  ? `${range[0]?.format("YYYY-MM-DD") ?? ""},${range[1]?.format("YYYY-MM-DD") ?? ""}`
                  : "",
              )
            }
          />
          {/* A square button, as on Invoicing, so setting a filter keeps the bar on one row. */}
          {filtered && (
            <Tooltip title="Clear filters">
              <button
                type="button"
                aria-label="Clear filters"
                onClick={() => router.replace("/master-jobs", { scroll: false })}
                className={TOOLBAR_BUTTON_CLASS}
              >
                <ClearOutlined />
              </button>
            </Tooltip>
          )}
        </>
      }
      columns={columns}
      rows={rows}
      rowKey={(m) => m.id}
      loading={isLoading}
      onRowClick={(m) => router.push(openHref(m.id))}
      storageKey="master-jobs"
      exportFilePrefix="master-jobs"
      emptyText={emptyText}
      resetKey={searchParams.toString()}
      rememberFilters
    />
  );
}
