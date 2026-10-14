"use client";

import type { ThHTMLAttributes } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// A table header cell the user can drag to reorder columns (antd Table `components.header.cell`);
// the column's id comes from its onHeaderCell(). Cells without an id are plain headers.
type DraggableHeaderCellProps = ThHTMLAttributes<HTMLTableCellElement> & { id?: string };

export function DraggableHeaderCell({ id, style, className, ...rest }: DraggableHeaderCellProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: id ?? "" });

  if (!id) return <th style={style} className={className} {...rest} />;

  return (
    <th
      ref={setNodeRef}
      // The drag offset changes every frame, so it stays inline.
      style={{ ...style, transform: CSS.Translate.toString(transform), transition }}
      className={`${className ?? ""} cursor-grab select-none ${isDragging ? "relative z-[2] !bg-indigo-50" : ""}`}
      {...rest}
      {...attributes}
      {...listeners}
    />
  );
}
