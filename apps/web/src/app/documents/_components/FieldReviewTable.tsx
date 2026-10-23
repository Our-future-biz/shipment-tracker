"use client";

import { Table, Checkbox, Input, Tag } from "antd";
import type { ExtractedField } from "../_lib/extraction";
import { GeoFlag, GeoSelect } from "@/components/GeoSelect";
import { LABEL_GEO_FIELDS } from "@/lib/places";

interface FieldReviewTableProps {
  fields: ExtractedField[];
  onToggle: (index: number) => void;
  editable?: boolean;
  onEdit?: (index: number, value: string) => void;
  /** Picks one of the values the files read together gave (ExtractedField.choices). */
  onPick?: (index: number, value: string) => void;
  showExisting?: boolean;
  accent?: "teal" | "amber";
}

export function FieldReviewTable({
  fields,
  onToggle,
  editable = false,
  onEdit,
  onPick,
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
      render: (v: string, row: Row) => {
        // Places and countries the AI could not match to the database are flagged; when the
        // value can be edited, it is picked from the database.
        const geoKind = LABEL_GEO_FIELDS[row.column];
        const value = geoKind ? (
          editable ? (
            <span className="flex items-center">
              <GeoSelect kind={geoKind} size="small" className="w-full max-w-[320px]" value={v} onChange={(next) => onEdit?.(row.index, next)} />
              <GeoFlag kind={geoKind} value={v} />
            </span>
          ) : (
            <span className={`font-mono ${valueClass}`}>
              {v}
              <GeoFlag kind={geoKind} value={v} />
            </span>
          )
        ) : editable ? (
          <Input
            size="small"
            variant="borderless"
            value={v}
            className={`font-mono ${valueClass}`}
            onChange={(e) => onEdit?.(row.index, e.target.value)}
          />
        ) : (
          <span className={`font-mono ${valueClass}`}>{v}</span>
        );
        if (!row.choices || !onPick) return value;
        // The files read together disagree: each value with the files it came from, to pick one.
        return (
          <div>
            {value}
            <div className="mt-1 flex flex-wrap gap-1">
              {row.choices.map((c) => (
                <Tag.CheckableTag
                  key={c.value}
                  checked={c.value === v}
                  onChange={() => onPick(row.index, c.value)}
                  className="!text-[11px] !border !border-slate-200"
                >
                  {c.value} <span className="opacity-60">· {c.sources.join(", ")}</span>
                </Tag.CheckableTag>
              ))}
            </div>
          </div>
        );
      },
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
              ) : row.choices ? (
                <Tag color="gold">Files differ</Tag>
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
