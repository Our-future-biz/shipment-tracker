"use client";

import type { PointerEvent as ReactPointerEvent, ThHTMLAttributes } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// A table header cell the user can drag to reorder columns (antd Table `components.header.cell`);
// the column's id comes from its onHeaderCell(). Cells without an id are plain headers.
// A column that also gets `onResizeWidth` has a handle on its right edge: dragged, it sets the
// column's width; double-clicked, `onResetWidth` gives the column its own width back.
type DraggableHeaderCellProps = ThHTMLAttributes<HTMLTableCellElement> & {
  id?: string;
  /** Told the width while the edge is dragged, and once more with `done` when it is let go. */
  onResizeWidth?: (width: number, done: boolean) => void;
  onResetWidth?: () => void;
};

export function DraggableHeaderCell({ id, style, className, onResizeWidth, onResetWidth, children, ...rest }: DraggableHeaderCellProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: id ?? "" });

  if (!id) return <th style={style} className={className} {...rest}>{children}</th>;

  return (
    <th
      ref={setNodeRef}
      // The drag offset changes every frame, so it stays inline.
      style={{ ...style, transform: CSS.Translate.toString(transform), transition }}
      className={`${className ?? ""} cursor-grab select-none ${isDragging ? "relative z-[2] !bg-indigo-50" : ""}`}
      {...rest}
      {...attributes}
      {...listeners}
    >
      {children}
      {onResizeWidth && <ResizeHandle onResize={onResizeWidth} onReset={onResetWidth} />}
    </th>
  );
}

// The right edge of a header cell, which drags the column's width. Its pointer-down stops there,
// so the header's own drag (moving the column) does not start.
function ResizeHandle({ onResize, onReset }: { onResize: (width: number, done: boolean) => void; onReset?: () => void }) {
  const start = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    // No text selected while dragging.
    e.preventDefault();
    const handle = e.currentTarget;
    const cell = handle.parentElement;
    if (!cell) return;
    const startX = e.clientX;
    const startWidth = cell.getBoundingClientRect().width;
    let width = startWidth;
    let frame = 0;
    handle.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      width = startWidth + ev.clientX - startX;
      // One table re-render per frame, however many pointer moves came in it.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => onResize(width, false));
    };
    const end = () => {
      cancelAnimationFrame(frame);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      // A plain click (or the first of a double-click) leaves the width as it is.
      if (width !== startWidth) onResize(width, true);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize column"
      title="Drag to resize · double-click for the default width"
      className="absolute inset-y-0 right-0 z-[1] w-2 cursor-col-resize touch-none after:absolute after:inset-y-0 after:right-0 after:w-0.5 hover:after:bg-indigo-400"
      onPointerDown={start}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onReset?.();
      }}
    />
  );
}
