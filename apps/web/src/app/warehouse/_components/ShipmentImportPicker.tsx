"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Select, Table, Tag } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { TERMS } from "../_lib/glossary";

// One shipment offered for import, whichever list it came from.
type ImportRow = {
  id: string;
  jobNumber: string;
  customer: string;
  shipper: string;
  masterJob: string;
  etaWarehouse: string | null;
};

export type ImportMode = "shipments" | "masters";

const PAGE = 200;

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * Picks shipments to bring into the warehouse, each becoming its own position linked to the
 * shipment. "shipments": every shipment not in the warehouse yet, searchable. "masters": the
 * shipments of the chosen master jobs, all checked at first; ones already in the warehouse
 * are shown but locked.
 */
export function ShipmentImportPicker({
  mode,
  inWarehouse,
  selected,
  onChange,
}: {
  mode: ImportMode;
  /** Shipment ids that already have a warehouse position. */
  inWarehouse: Set<string>;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return mode === "shipments" ? (
    <ShipmentsList inWarehouse={inWarehouse} selected={selected} onChange={onChange} />
  ) : (
    <MasterJobsList inWarehouse={inWarehouse} selected={selected} onChange={onChange} />
  );
}

type ListProps = { inWarehouse: Set<string>; selected: string[]; onChange: (ids: string[]) => void };

const columns = (withMaster: boolean, inWarehouse: Set<string>) => [
  {
    title: TERMS.jobNo,
    dataIndex: "jobNumber",
    width: 210,
    render: (v: string, r: ImportRow) => (
      <span className="font-medium">
        {v || "—"}
        {inWarehouse.has(r.id) && <Tag className="ml-2">In warehouse</Tag>}
      </span>
    ),
  },
  // Parties often carry their full address; one line each keeps the list scannable.
  { title: "Customer", dataIndex: "customer", ellipsis: true },
  { title: "Shipper", dataIndex: "shipper", ellipsis: true },
  ...(withMaster ? [{ title: "Master Job", dataIndex: "masterJob", width: 140 }] : []),
  { title: "ETA Warehouse/HUB", dataIndex: "etaWarehouse", width: 150, render: (v: string | null) => formatDate(v) },
];

function ShipmentsList({ inWarehouse, selected, onChange }: ListProps) {
  const [query, setQuery] = useState("");
  const search = useDebounced(query.trim(), 300);

  const { data, isFetching, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ["warehouse-import-shipments", search],
    queryFn: ({ pageParam }) => api.shipments.shipmentList({ limit: PAGE, offset: pageParam, search: search || undefined }),
    initialPageParam: 0,
    getNextPageParam: (last) => {
      const next = last.pagination.offset + last.pagination.limit;
      return next < last.pagination.total ? next : undefined;
    },
  });

  const rows = useMemo<ImportRow[]>(
    () =>
      (data?.pages ?? [])
        .flatMap((p) => p.data)
        .filter((s) => !inWarehouse.has(s.id))
        .map((s) => ({
          id: s.id,
          jobNumber: s.jobNumber,
          customer: s.customer,
          shipper: s.shipper,
          masterJob: s.masterJobMczNumber ?? "",
          etaWarehouse: s.etaWarehouse,
        })),
    [data, inWarehouse],
  );

  return (
    <>
      <Input
        allowClear
        prefix={<SearchOutlined className="text-slate-400" />}
        placeholder="Search by job no., customer, shipper…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-3"
      />
      <Table<ImportRow>
        size="small"
        rowKey="id"
        dataSource={rows}
        columns={columns(true, inWarehouse)}
        loading={isFetching}
        pagination={false}
        scroll={{ y: 360 }}
        rowSelection={{ selectedRowKeys: selected, onChange: (keys) => onChange(keys as string[]), preserveSelectedRowKeys: true }}
        locale={{ emptyText: "No shipments to import" }}
      />
      {hasNextPage && (
        <div className="flex justify-center mt-2">
          <Button size="small" onClick={() => fetchNextPage()} loading={isFetching}>
            Load more
          </Button>
        </div>
      )}
    </>
  );
}

function MasterJobsList({ inWarehouse, selected, onChange }: ListProps) {
  const [masterIds, setMasterIds] = useState<string[]>([]);

  const { data: masters, isFetching: mastersLoading } = useQuery({
    queryKey: ["warehouse-import-masters"],
    queryFn: () => api.shipments.masterJobList(),
  });
  const details = useQueries({
    queries: masterIds.map((id) => ({
      queryKey: ["warehouse-import-master", id],
      queryFn: () => api.shipments.masterJobGet(id),
    })),
  });

  const rows = useMemo<ImportRow[]>(() => {
    const seen = new Set<string>();
    return details.flatMap((d) => {
      if (!d.data) return [];
      const { masterJob, shipments } = d.data;
      return shipments
        .filter((s) => !seen.has(s.id) && seen.add(s.id))
        .map((s) => ({
          id: s.id,
          jobNumber: s.jobNumber,
          customer: s.customer,
          shipper: s.shipper,
          masterJob: masterJob.mczNumber,
          etaWarehouse: masterJob.etaWarehouse,
        }));
    });
  }, [details]);

  // Shipments of a newly chosen master come in checked; the user unticks what stays out.
  // Each one is checked only the first time it appears, so an untick sticks.
  const offered = useRef(new Set<string>());
  useEffect(() => {
    const fresh = rows.filter((r) => !offered.current.has(r.id) && !inWarehouse.has(r.id)).map((r) => r.id);
    rows.forEach((r) => offered.current.add(r.id));
    if (fresh.length) onChange([...new Set([...selected, ...fresh])]);
  }, [rows, inWarehouse, selected, onChange]);

  // Dropping a master drops its shipments from the selection too.
  useEffect(() => {
    const shown = new Set(rows.map((r) => r.id));
    if (selected.some((id) => !shown.has(id)) && details.every((d) => !d.isFetching)) {
      onChange(selected.filter((id) => shown.has(id)));
    }
  }, [rows, details, selected, onChange]);

  const loading = details.some((d) => d.isFetching);

  return (
    <>
      <label className="block text-[11px] text-slate-500 mb-1">Master Jobs</label>
      <Select
        mode="multiple"
        allowClear
        className="w-full mb-3"
        placeholder="Choose one or more master jobs…"
        optionFilterProp="label"
        loading={mastersLoading}
        value={masterIds}
        onChange={(ids: string[]) => {
          // A master taken off and chosen again offers its shipments checked again.
          const kept = new Set(ids);
          details.forEach((d, i) => {
            if (!kept.has(masterIds[i]!)) d.data?.shipments.forEach((s) => offered.current.delete(s.id));
          });
          setMasterIds(ids);
        }}
        options={(masters?.data ?? []).map((m) => ({
          value: m.id,
          label: [m.mczNumber, m.shipper || m.consignee].filter(Boolean).join(" — ") + ` (${m.shipmentCount})`,
        }))}
      />
      <Table<ImportRow>
        size="small"
        rowKey="id"
        dataSource={rows}
        columns={columns(masterIds.length > 1, inWarehouse)}
        loading={loading}
        pagination={false}
        scroll={{ y: 360 }}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: (keys) => onChange(keys as string[]),
          getCheckboxProps: (r) => ({ disabled: inWarehouse.has(r.id) }),
        }}
        locale={{ emptyText: masterIds.length ? "These master jobs have no shipments" : "Choose master jobs to see their shipments" }}
      />
    </>
  );
}
