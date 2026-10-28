"use client";

import { useMemo, useState } from "react";
import { Input, Select, Table, type TableColumnsType } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { CountChip, SectionCard } from "@/components/SectionCard";
import { useDebounced } from "@/hooks/useDebounced";
import { useRailRates, type RailRate, type RailTariffVersionDetail } from "@/hooks/useRailTariffs";
import { apiErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { formatNumber, formatQty } from "@/lib/number";
import { bandText } from "../../_lib/railTariffs";

const PAGE_SIZE = 50;
const SEARCH_DELAY_MS = 300;

const dash = <span className="text-slate-400">—</span>;
const textOr = (value: string) => value || dash;

interface RailVersionRatesProps {
  version: Pick<RailTariffVersionDetail, "id" | "currency" | "layout" | "bandCodes" | "rowCount">;
}

// A version's rows as the code read them: one per inland place, a price per band. Paged on the
// server; searched by place, postcode, region or note, and filtered by the terminal they run via.
export const RailVersionRates = ({ version }: RailVersionRatesProps) => {
  const [search, setSearch] = useState("");
  const [via, setVia] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search.trim(), SEARCH_DELAY_MS);
  const filter = useMemo(() => ({ search: debouncedSearch, via, offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE }), [debouncedSearch, via, page]);
  const { page: result, isLoading, isFetching, error } = useRailRates(version.id, filter);
  const rates = result?.rates ?? [];
  const hasDates = rates.some((r) => r.validFrom || r.validTo);

  const columns = useMemo<TableColumnsType<RailRate>>(() => {
    const bands: TableColumnsType<RailRate> = version.layout.bands.map((band, i) => {
      const code = version.bandCodes[i] ?? "";
      return {
        key: `band-${band.column}`,
        title: (
          <div className="leading-tight text-right">
            <div>{band.label}</div>
            <div className="text-[11px] font-normal text-slate-400 whitespace-nowrap">{bandText(band)}</div>
          </div>
        ),
        align: "right",
        render: (_, r) => (r.prices[code] != null ? <span className="tabular-nums">{formatQty(r.prices[code]!)}</span> : dash),
      };
    });
    return [
      { key: "row", title: "Row", width: 64, render: (_, r) => <span className="text-slate-400 tabular-nums">{r.rowNo}</span> },
      { key: "country", title: "Country", render: (_, r) => r.country },
      {
        key: "postcode",
        title: "Postcode",
        render: (_, r) => {
          const range = r.postcodeFrom && r.postcodeTo ? (r.postcodeFrom === r.postcodeTo ? r.postcodeFrom : `${r.postcodeFrom}–${r.postcodeTo}`) : null;
          return (
            <span className="whitespace-nowrap tabular-nums">
              {textOr(r.postcode)}
              {range && range !== r.postcode && <span className="ml-1.5 text-xs text-slate-400">{range}</span>}
            </span>
          );
        },
      },
      { key: "place", title: "Place", render: (_, r) => <span className="font-medium text-slate-800">{r.place}</span> },
      { key: "region", title: "Region", render: (_, r) => textOr(r.region) },
      { key: "via", title: "Via", render: (_, r) => textOr(r.via) },
      { key: "depot", title: "Empty depot", render: (_, r) => textOr(r.emptyDepot) },
      ...bands,
      { key: "note", title: "Note", render: (_, r) => (r.note ? <span className="text-xs text-slate-600">{r.note}</span> : dash) },
      ...(hasDates
        ? ([
            { key: "from", title: "Valid from", render: (_, r) => (r.validFrom ? formatDate(r.validFrom) : dash) },
            { key: "to", title: "Valid to", render: (_, r) => (r.validTo ? formatDate(r.validTo) : dash) },
          ] satisfies TableColumnsType<RailRate>)
        : []),
    ];
  }, [version.layout.bands, version.bandCodes, hasDates]);

  return (
    <SectionCard
      title={`Prices (${version.currency})`}
      extra={<CountChip count={result && (debouncedSearch || via) ? `${formatNumber(result.total)} of ${formatNumber(version.rowCount)}` : formatNumber(version.rowCount)} />}
      bodyClassName="p-0"
    >
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
        <Input
          allowClear
          prefix={<SearchOutlined className="text-slate-400" />}
          placeholder="Search place, postcode, region, note…"
          aria-label="Search prices"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="!w-72"
        />
        <Select
          allowClear
          placeholder="Every terminal"
          aria-label="Via terminal"
          value={via || undefined}
          options={(result?.vias ?? []).map((v) => ({ value: v, label: `via ${v}` }))}
          onChange={(v: string | undefined) => {
            setVia(v ?? "");
            setPage(1);
          }}
          className="w-44"
        />
        {error && <span className="text-xs text-red-600">Could not load the prices: {apiErrorMessage(error)}</span>}
      </div>
      <Table<RailRate>
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={rates}
        loading={isLoading || isFetching}
        scroll={{ x: "max-content" }}
        locale={{ emptyText: debouncedSearch || via ? "No rows match." : "No rows were read." }}
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
