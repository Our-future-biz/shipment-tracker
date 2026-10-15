"use client";

import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { DiffCell } from "@/hooks/useTrucking";
import { diffChangeText, diffTone, type DiffTone } from "../../_lib/tariffUpload";
import { formatMoney } from "../../_lib/tariffs";

// A rise is red, a fall green, new and removed cells neutral; the text says it too.
export const DIFF_TONE_CLASS: Record<DiffTone, string> = {
  up: "text-red-700",
  down: "text-green-700",
  added: "text-indigo-700",
  removed: "text-slate-500",
  same: "text-slate-500",
};

interface TariffDiffCellsTableProps {
  cells: DiffCell[];
  currency: string;
  levelLabel: (code: string) => string;
}

// The prices that differ, one row per service level, zone and band: before, after and by how much,
// largest change first (the server's order).
export const TariffDiffCellsTable = ({ cells, currency, levelLabel }: TariffDiffCellsTableProps) => {
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
      render: (_, c) => <span className={`tabular-nums whitespace-nowrap font-semibold ${DIFF_TONE_CLASS[diffTone(c)]}`}>{diffChangeText(c)}</span>,
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
