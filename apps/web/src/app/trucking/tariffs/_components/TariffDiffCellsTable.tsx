"use client";

import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { DiffCell, TariffSide } from "@/hooks/useTrucking";
import { diffChangeText, diffTone, type DiffTone } from "../../_lib/tariffUpload";
import { formatMoney } from "../../_lib/tariffs";

// A change is red when it costs us (a higher buy price, a lower sell or internal price) and green
// when it earns us; new cells indigo, removed ones grey. The text says it too.
export const diffToneClass = (tone: DiffTone, side: TariffSide): string => {
  if (tone === "added") return "text-indigo-700";
  if (tone === "removed" || tone === "same") return "text-slate-500";
  const costsUs = side === "BUY" ? tone === "up" : tone === "down";
  return costsUs ? "text-red-700" : "text-green-700";
};

interface TariffDiffCellsTableProps {
  cells: DiffCell[];
  currency: string;
  side: TariffSide;
  levelLabel: (code: string) => string;
}

// The prices that differ, one row per service level, zone and band: before, after and by how much,
// largest change first (the server's order).
export const TariffDiffCellsTable = ({ cells, currency, side, levelLabel }: TariffDiffCellsTableProps) => {
  const columns: ColumnsType<DiffCell> = [
    { key: "level", title: "Service level", render: (_, c) => levelLabel(c.serviceLevel) },
    { key: "zone", title: "Zone", render: (_, c) => <span className="font-semibold">{c.zoneCode}</span> },
    { key: "band", title: "Band", render: (_, c) => <span className="whitespace-nowrap">{c.bandLabel}</span> },
    {
      key: "before",
      title: "Before",
      align: "right",
      render: (_, c) => <span className="tabular-nums whitespace-nowrap">{formatMoney(c.before, currency)}</span>,
    },
    {
      key: "after",
      title: "After",
      align: "right",
      render: (_, c) => <span className="tabular-nums whitespace-nowrap">{formatMoney(c.after, currency)}</span>,
    },
    {
      key: "change",
      title: "Change",
      align: "right",
      render: (_, c) => <span className={`tabular-nums whitespace-nowrap font-semibold ${diffToneClass(diffTone(c), side)}`}>{diffChangeText(c)}</span>,
    },
  ];

  return (
    <Table<DiffCell>
      size="small"
      rowKey={(c) => `${c.serviceLevel}-${c.zoneCode}-${c.bandLabel}`}
      columns={columns}
      dataSource={cells}
      pagination={cells.length > 50 ? { defaultPageSize: 50, showSizeChanger: false } : false}
      scroll={{ x: "max-content" }}
      locale={{ emptyText: "No price differs." }}
    />
  );
};
