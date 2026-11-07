"use client";

import { Table, Checkbox, Input, Tag } from "antd";
import { Pill } from "@/components/Pill";
import { EMPTY } from "@/styles/ui";
import { parseContainerNumbers, SEAL_LABEL, sealContainers, sealNote, type ExtractedField } from "../_lib/extraction";
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
  /** The colour of the values read: the app's indigo, or amber (the master job's shipments). */
  accent?: "indigo" | "amber";
  /** The containers already on the shipment: a seal read without a container number goes on them. */
  containersOnFile?: string[];
}

export function FieldReviewTable({
  fields,
  onToggle,
  editable = false,
  onEdit,
  onPick,
  showExisting = true,
  accent = "indigo",
  containersOnFile = [],
}: FieldReviewTableProps) {
  const valueClass = accent === "amber" ? "text-amber-600" : "text-indigo-600";
  const rows = fields.map((f, index) => ({ ...f, index, key: `${f.column}-${index}` }));
  const containerRow = fields.find((f) => f.column === "Container Number");
  const sealTargets = sealContainers(containerRow?.extractedValue, containersOnFile);
  // A seal goes on a container: one that is neither on file nor ticked to be added leaves it nowhere.
  const sealStranded = !!containerRow && !containerRow.approved && parseContainerNumbers(containerRow.extractedValue).some((n) => !containersOnFile.includes(n));

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
            <span className={`tabular-nums ${valueClass}`}>
              {v}
              <GeoFlag kind={geoKind} value={v} />
            </span>
          )
        ) : editable ? (
          <Input
            size="small"
            variant="borderless"
            value={v}
            className={`tabular-nums ${valueClass}`}
            onChange={(e) => onEdit?.(row.index, e.target.value)}
          />
        ) : (
          <span className={`tabular-nums ${valueClass}`}>{v}</span>
        );
        // Which container each seal goes on, or why it can't be filed yet.
        const note =
          row.column !== SEAL_LABEL || !v.trim()
            ? null
            : row.approved && sealStranded
              ? { text: "Tick Container Number too: the seal goes on its container", warn: true }
              : sealNote(sealTargets, v);
        const noted = note ? (
          <div>
            {value}
            <div className={`mt-0.5 text-[11px] leading-snug ${note.warn ? "text-amber-600" : "text-slate-500"}`}>{note.text}</div>
          </div>
        ) : (
          value
        );
        if (!row.choices || !onPick) return noted;
        // The files read together disagree: each value with the files it came from, to pick one.
        return (
          <div>
            {noted}
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
                <span className="tabular-nums text-slate-500">{v}</span>
              ) : (
                <span className={`italic ${EMPTY}`}>empty</span>
              ),
          },
          {
            title: "Status",
            width: 110,
            render: (_: unknown, row: Row) =>
              row.hasConflict ? (
                <Pill tone="amber">Conflict</Pill>
              ) : row.choices ? (
                <Pill tone="amber">Files differ</Pill>
              ) : (
                <Pill tone="green">New</Pill>
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
