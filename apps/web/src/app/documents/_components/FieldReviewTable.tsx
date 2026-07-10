"use client";

import { Table, Checkbox, Input, Tag } from "antd";
import type { ExtractedField } from "../_lib/extraction";

interface FieldReviewTableProps {
  fields: ExtractedField[];
  onToggle: (index: number) => void;
  editable?: boolean;
  onEdit?: (index: number, value: string) => void;
  showExisting?: boolean;
  accent?: "teal" | "amber";
}

export function FieldReviewTable({
  fields,
  onToggle,
  editable = false,
  onEdit,
  showExisting = true,
  accent = "teal",
}: FieldReviewTableProps) {
  const valueClass = accent === "amber" ? "text-amber-600" : "text-teal-600";
  const rows = fields.map((f, index) => ({ ...f, index, key: `${f.column}-${index}` }));

  type Row = (typeof rows)[number];

  const columns = [
    {
      title: "",
      width: 44,
      render: (_: unknown, row: Row) => (
        <Checkbox checked={row.approved} onChange={() => onToggle(row.index)} />
      ),
    },
    {
      title: "Field",
      dataIndex: "column",
      width: 220,
      render: (v: string) => <span className="font-medium text-slate-700">{v}</span>,
    },
    {
      title: "Extracted Value",
      dataIndex: "extractedValue",
      render: (v: string, row: Row) =>
        editable ? (
          <Input
            size="small"
            variant="borderless"
            value={v}
            className={`font-mono ${valueClass}`}
            onChange={(e) => onEdit?.(row.index, e.target.value)}
          />
        ) : (
          <span className={`font-mono ${valueClass}`}>{v}</span>
        ),
    },
    ...(showExisting
      ? [
          {
            title: "Existing Value",
            dataIndex: "existingValue",
            render: (v: string) =>
              v ? (
                <span className="font-mono text-slate-500">{v}</span>
              ) : (
                <span className="italic text-slate-300">empty</span>
              ),
          },
          {
            title: "Status",
            width: 110,
            render: (_: unknown, row: Row) =>
              row.hasConflict ? (
                <Tag color="orange">Conflict</Tag>
              ) : (
                <Tag color="green">New</Tag>
              ),
          },
        ]
      : []),
  ];

  return (
    <Table
      size="small"
      pagination={false}
      dataSource={rows}
      columns={columns}
      onRow={(row) => ({
        onClick: () => {
          if (!editable) onToggle(row.index);
        },
        className: editable ? "" : "cursor-pointer",
      })}
    />
  );
}
