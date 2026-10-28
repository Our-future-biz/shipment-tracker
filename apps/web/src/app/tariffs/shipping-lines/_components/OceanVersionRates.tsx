"use client";

import { useMemo, useState } from "react";
import { Input, Select, Table, type TableColumnsType } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { CountChip, SectionCard } from "@/components/SectionCard";
import { useDebounced } from "@/hooks/useDebounced";
import { useOceanRates, type OceanRateView, type OceanTariffVersionDetail } from "@/hooks/useOceanTariffs";
import { apiErrorMessage } from "@/lib/api";
import { formatNumber, formatQty } from "@/lib/number";
import { equipmentLabel, equipmentOf } from "../../_lib/oceanTariffs";

const PAGE_SIZE = 100;
const SEARCH_DELAY_MS = 300;

const Port = ({ name, code }: { name: string; code: string | null }) => (
  <span className="whitespace-nowrap">
    <span className="font-medium text-slate-800">{name}</span>
    {code ? <span className="ml-1.5 text-xs text-slate-400 tabular-nums">{code}</span> : <span className="ml-1.5 text-xs text-amber-600">not matched</span>}
  </span>
);

interface OceanVersionRatesProps {
  version: Pick<OceanTariffVersionDetail, "id" | "layout" | "rowCount">;
}

// A version's rates as the code read them: one per port of loading → port of discharge, a price per
// container. Paged on the server; searched by port, transshipment port or port code, and filtered
// by the rate table they come from.
export const OceanVersionRates = ({ version }: OceanVersionRatesProps) => {
  const [search, setSearch] = useState("");
  const [table, setTable] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search.trim(), SEARCH_DELAY_MS);
  const filter = useMemo(() => ({ search: debouncedSearch, table, offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE }), [debouncedSearch, table, page]);
  const { page: result, isLoading, isFetching, error } = useOceanRates(version.id, filter);
  const rates = result?.rates ?? [];
  const tables = version.layout.tables;
  const filtered = !!debouncedSearch || table !== null;

  const columns = useMemo<TableColumnsType<OceanRateView>>(() => {
    const prices: TableColumnsType<OceanRateView> = equipmentOf(tables).map((e) => ({
      key: `price-${e}`,
      title: equipmentLabel(e),
      align: "right",
      render: (_, r) => (r.prices[e] != null ? <span className="tabular-nums">{formatQty(r.prices[e]!)}</span> : EMPTY_CELL),
    }));
    return [
      { key: "row", title: "Row", width: 64, render: (_, r) => <span className="text-slate-400 tabular-nums">{r.rowNo}</span> },
      ...(tables.length > 1
        ? ([{ key: "table", title: "Table", render: (_, r) => <span className="text-xs text-slate-600">{tables[r.table]?.label ?? "—"}</span> }] satisfies TableColumnsType<OceanRateView>)
        : []),
      { key: "pol", title: "POL", render: (_, r) => <Port name={r.polName} code={r.polCode} /> },
      { key: "pod", title: "POD", render: (_, r) => <Port name={r.podName} code={r.podCode} /> },
      { key: "via", title: "Via", render: (_, r) => r.via || EMPTY_CELL },
      ...prices,
      { key: "currency", title: "Currency", render: (_, r) => r.currency },
      { key: "note", title: "Note", render: (_, r) => (r.note ? <span className="text-xs text-slate-600">{r.note}</span> : EMPTY_CELL) },
    ];
  }, [tables]);

  return (
    <SectionCard
      title="Rates"
      extra={<CountChip count={result && filtered ? `${formatNumber(result.total)} of ${formatNumber(version.rowCount)}` : formatNumber(version.rowCount)} />}
      bodyClassName="p-0"
    >
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
        <Input
          allowClear
          prefix={<SearchOutlined className="text-slate-400" />}
          placeholder="Search port, via, port code…"
          aria-label="Search rates"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="!w-72"
        />
        {tables.length > 1 && (
          <Select
            allowClear
            placeholder="Every table"
            aria-label="Rate table"
            value={table ?? undefined}
            options={tables.map((t, i) => ({ value: i, label: t.label }))}
            popupMatchSelectWidth={false}
            onChange={(v: number | undefined) => {
              setTable(v ?? null);
              setPage(1);
            }}
            className="w-56"
          />
        )}
        {error && <span className="text-xs text-red-600">Could not load the rates: {apiErrorMessage(error)}</span>}
      </div>
      <Table<OceanRateView>
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={rates}
        loading={isLoading || isFetching}
        scroll={{ x: "max-content" }}
        locale={{ emptyText: filtered ? "No rates match." : "No rates were read." }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: result?.total ?? 0,
          showSizeChanger: false,
          showTotal: (total, [from, to]) => `${from}–${to} of ${formatNumber(total)}`,
          onChange: setPage,
        }}
      />
    </SectionCard>
  );
};
