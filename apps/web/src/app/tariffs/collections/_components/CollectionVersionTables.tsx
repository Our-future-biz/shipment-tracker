"use client";

import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { SectionCard } from "@/components/SectionCard";
import type { CollectionTariffVersionDetail } from "@/hooks/useCollectionTariffs";
import type { interfaces } from "@/lib/api/client";
import { formatNumber, formatQty } from "@/lib/number";
import { volumeToText, weightToText } from "../../_lib/collectionTariffs";

type Row = interfaces.CollectionTableView["rows"][number];

function tableColumns(table: interfaces.CollectionTableView): ColumnsType<Row> {
  const hasVolume = table.rows.some((r) => r.volumeToCbm !== null);
  return [
    { key: "weight", title: "Weight", fixed: "left", width: 120, render: (_, r) => <span className="font-medium whitespace-nowrap">{weightToText(r.weightToKg)}</span> },
    ...(hasVolume
      ? [{ key: "volume", title: "or volume", width: 90, render: (_: unknown, r: Row) => (r.volumeToCbm === null ? EMPTY_CELL : <span className="whitespace-nowrap text-slate-500">{volumeToText(r.volumeToCbm)}</span>) }]
      : []),
    ...table.zones.map((label, i) => ({
      key: `z${i}`,
      title: label,
      align: "right" as const,
      render: (_: unknown, r: Row) => (r.prices[i] == null ? EMPTY_CELL : <span className="tabular-nums">{formatQty(r.prices[i]!)}</span>),
    })),
  ];
}

// The price tables as they were read - weight rows by zone columns, one per country of the
// customer's end - and how many postcodes, distances and areas came with them.
export const CollectionVersionTables = ({ version }: { version: CollectionTariffVersionDetail }) => {
  const { counts } = version;
  const read = [
    `${formatNumber(counts.rates)} price rows`,
    version.layout.zoneBy === "distance" && `${formatNumber(counts.regions)} postcodes`,
    version.layout.zoneBy === "distance" && `${formatNumber(counts.distances)} distances`,
    version.layout.zoneBy === "postcode" && `${formatNumber(counts.areas)} postcode areas`,
  ].filter(Boolean);

  return (
    <SectionCard title="Price tables" extra={<span className="text-xs text-slate-500">Prices in {version.currency}</span>}>
      <p className="mt-0 mb-4 text-[13px] text-slate-600">What was read: {read.join(", ")}.</p>
      {!version.tables.length && <p className="m-0 text-[13px] text-slate-500">No price table was read.</p>}
      <div className="flex flex-col gap-5">
        {version.tables.map((table, i) => (
          <div key={i} className="min-w-0">
            <div className="text-[12px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              {table.label} <span className="font-normal normal-case tracking-normal text-slate-400">· customer in {table.country}</span>
            </div>
            <Table<Row>
              size="small"
              rowKey="rowNo"
              columns={tableColumns(table)}
              dataSource={table.rows}
              pagination={false}
              scroll={{ x: "max-content" }}
              locale={{ emptyText: "No rows read" }}
            />
          </div>
        ))}
      </div>
    </SectionCard>
  );
};
