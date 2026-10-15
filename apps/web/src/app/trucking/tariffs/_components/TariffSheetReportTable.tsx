"use client";

import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Pill } from "@/components/Pill";
import type { ImportSheetReport } from "@/hooks/useTrucking";

const READ_CHIP: Record<ImportSheetReport["read"], { label: string; tone: "green" | "slate" | "amber" }> = {
  used: { label: "Used", tone: "green" },
  ignored: { label: "Ignored", tone: "slate" },
  missing: { label: "Missing", tone: "amber" },
};

interface TariffSheetReportTableProps {
  sheets: ImportSheetReport[];
}

// What the server read from each sheet of the uploaded file: used, ignored or missing, how many
// rows, and a note.
export const TariffSheetReportTable = ({ sheets }: TariffSheetReportTableProps) => {
  const columns: ColumnsType<ImportSheetReport> = [
    { key: "sheet", title: "Sheet", render: (_, s) => <span className="font-semibold">{s.sheet}</span> },
    {
      key: "read",
      title: "Read",
      render: (_, s) => <Pill tone={READ_CHIP[s.read].tone}>{READ_CHIP[s.read].label}</Pill>,
    },
    { key: "rows", title: "Rows", align: "right", render: (_, s) => <span className="tabular-nums">{s.rows}</span> },
    { key: "note", title: "Note", render: (_, s) => s.note || <span className="text-slate-400">—</span> },
  ];

  return (
    <Table<ImportSheetReport>
      size="small"
      rowKey="sheet"
      columns={columns}
      dataSource={sheets}
      pagination={false}
      scroll={{ x: "max-content" }}
      locale={{ emptyText: "No sheets were read." }}
    />
  );
};
