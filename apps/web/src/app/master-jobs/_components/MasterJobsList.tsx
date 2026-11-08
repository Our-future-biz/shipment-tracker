"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DatePicker, Tooltip } from "antd";
import { ClearOutlined, LoadingOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { AppGrid, type AppGridColumn } from "@/components/AppGrid";
import { TOOLBAR_BUTTON_CLASS } from "@/components/gridFilters";
import { DROPDOWN_OPTIONS } from "@/lib/columnConfig";
import { formatDate } from "@/lib/date";
import { LOAD_TYPE_FILTER_OPTIONS, loadTypeLabel } from "@/lib/enums";
import type { MasterJobItem } from "@/hooks/useMasterJobs";
import { PillTabs } from "@/components/SectionCard";
import { Pill } from "@/components/Pill";
import { BTN_PRIMARY, EMPTY, LINK, REF } from "@/styles/ui";

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
      // The search itself is the grid's (it reads every column, the hidden Booking, Shipper and
      // Consignee too); the page keeps its text in the URL.
      masterJobs.filter((m) => {
        if (load && loadTypeLabel(m.loadType, m.freightMode) !== load) return false;
        if (etdFrom && (!m.estimatedDeparture || m.estimatedDeparture < etdFrom)) return false;
        if (etdTo && (!m.estimatedDeparture || m.estimatedDeparture > etdTo)) return false;
        return true;
      }),
    [masterJobs, load, etdFrom, etdTo],
  );

  // The Shipments grid's columns (AppGrid): one line each, a plain-text value for search,
  // column filters and export, and "—" for an empty cell.
  const dateText = (v: string | null) => formatDate(v ?? "");
  const columns: AppGridColumn<MasterJobItem>[] = [
    {
      key: "mczNumber",
      title: "Master Job",
      // The MCZ stays frozen on the left while the rest scrolls.
      fixed: "left",
      width: 140,
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
    {
      key: "masterBolNumber",
      title: "Master BoL Number",
      width: 160,
      text: (m) => m.masterBolNumber,
      sorter: (a, b) => byText(a.masterBolNumber, b.masterBolNumber),
      render: (_, m) => (m.masterBolNumber ? <span className={REF}>{m.masterBolNumber}</span> : orDash("")),
    },
    // By air a Full Load reads Single Shipment (and is filtered as one). A category, so a pill.
    {
      key: "loadType",
      title: "Load Type",
      width: 150,
      text: (m) => loadTypeLabel(m.loadType, m.freightMode),
      filterOptions: LOAD_TYPE_FILTER_OPTIONS,
      render: (_, m) => (m.loadType ? <Pill tone="slate">{loadTypeLabel(m.loadType, m.freightMode)}</Pill> : orDash("")),
    },
    {
      key: "tradeDirection",
      title: "Trade Direction",
      width: 130,
      text: (m) => m.tradeDirection,
      filterOptions: DROPDOWN_OPTIONS["Trade Direction"],
      render: (_, m) => orDash(m.tradeDirection),
    },
    {
      key: "shippingLine",
      title: "Shipping line / Coloader",
      width: 200,
      text: (m) => m.shippingLine,
      // picked under Filters from the lines the master jobs have
      filterOptions: lines,
      sorter: (a, b) => byText(a.shippingLine, b.shippingLine),
      render: (_, m) => orDash(m.shippingLine),
    },
    {
      key: "vessel",
      title: "Vessel / Voyage",
      width: 180,
      text: (m) => [m.vessel, m.voyage].filter(Boolean).join(" / "),
      render: (_, m) => orDash([m.vessel, m.voyage].filter(Boolean).join(" / ")),
    },
    { key: "pol", title: "POL", width: 160, text: (m) => m.pol, render: (_, m) => orDash(m.pol) },
    { key: "pod", title: "POD", width: 160, text: (m) => m.pod, render: (_, m) => orDash(m.pod) },
    {
      key: "estimatedDeparture",
      title: "ETD",
      width: 110,
      text: (m) => dateText(m.estimatedDeparture),
      sorter: (a, b) => byDate(a.estimatedDeparture, b.estimatedDeparture),
      render: (_, m) => <span className="tabular-nums">{orDash(dateText(m.estimatedDeparture))}</span>,
    },
    {
      key: "estimatedArrival",
      title: "ETA",
      width: 110,
      text: (m) => dateText(m.estimatedArrival),
      sorter: (a, b) => byDate(a.estimatedArrival, b.estimatedArrival),
      render: (_, m) => <span className="tabular-nums">{orDash(dateText(m.estimatedArrival))}</span>,
    },
    {
      key: "shipmentCount",
      title: "Shipments",
      width: 100,
      align: "right",
      text: (m) => String(m.shipmentCount),
      sorter: (a, b) => a.shipmentCount - b.shipmentCount,
      render: (_, m) => <span className="tabular-nums">{m.shipmentCount}</span>,
    },
    // Searched as before (booking, shipper, consignee), and shown when picked under Columns.
    { key: "bookingNumber", title: "Booking Number", width: 150, defaultVisible: false, text: (m) => m.bookingNumber, render: (_, m) => orDash(m.bookingNumber) },
    { key: "shipper", title: "Shipper", width: 200, defaultVisible: false, text: (m) => m.shipper, render: (_, m) => orDash(m.shipper) },
    { key: "consignee", title: "Consignee", width: 200, defaultVisible: false, text: (m) => m.consignee, render: (_, m) => orDash(m.consignee) },
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
