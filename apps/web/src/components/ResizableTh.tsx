"use client";

import type { CSSProperties, ThHTMLAttributes } from "react";
import type { ColumnSizing } from "@/hooks/useColumnWidths";
import { ResizeHandle } from "./DraggableHeaderCell";

type ResizableThProps = ThHTMLAttributes<HTMLTableCellElement> & {
  /** The table's widths (useColumnWidths). */
  sizing: ColumnSizing;
  /** The column's key for its width. */
  k: string;
};

/**
 * A plain table's header cell whose right edge drags its column's width, as on the Shipments grid
 * (double-click: back to the column's own width). A column the user sized is held at that width;
 * the table's cells should clip what no longer fits.
 */
export function ResizableTh({ sizing, k, className, style, children, ...rest }: ResizableThProps) {
  const width = sizing.widthOf(k);
  const held: CSSProperties | undefined = width === undefined ? undefined : { width, minWidth: width, maxWidth: width };
  const { onResizeWidth, onResetWidth } = sizing.resizeProps(k);
  return (
    <th {...rest} className={`relative ${className ?? ""}`} style={{ ...style, ...held }}>
      {children}
      <ResizeHandle onResize={onResizeWidth} onReset={onResetWidth} />
    </th>
  );
}
