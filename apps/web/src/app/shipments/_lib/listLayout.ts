// How wide the Shipments list is drawn. Each column keeps the width it is given (columnConfig's, or the
// one the user dragged) instead of growing with its longest value, so the default columns from Internal
// Reference to ETA fit the first screen at 1440 px with the side menu open (mock test S21-058).

/**
 * A cell's padding, left and right together: 6 px a side, not antd's 8, as on Accounts Receivable - the 4 px a column
 * gives back let Internal Reference hold the longest reference whole (review of the S21-058 fix).
 */
export const CELL_PADDING = 12;
/**
 * The class that gives the list's cells their CELL_PADDING (the Shipments list's own; AppGrid lists keep antd's). Not
 * the pinned icon cells' (fixed right): `.list .ant-table-cell` with !important outranks a cell's own `!pl-0`, and each
 * 22 px icon would get 6 px a side, the chat button spilling into the warning cell (review of system-22).
 */
export const CELL_PADDING_CLASS = "[&_.ant-table-cell:not(.ant-table-cell-fix-right)]:!px-1.5";

/** The tick box column on the left. */
export const TICK_BOX_WIDTH = 44;

/** The Documents, Chat and warning icon columns pinned on the right. */
export const PINNED_ICON_WIDTHS = { docs: 30, chat: 24, alert: 28 } as const;

/**
 * The table's room at 1440 px: 1440 − 260 (side menu) − 2 × 32 (page sides) − 2 (card border), as
 * measured in the app (the table's visible area runs from x 293 to 1407).
 */
export const LIST_ROOM_AT_1440 = 1114;

/** What a list of column widths takes, with the tick box and the pinned icons. */
export function shipmentsTableWidth(columnWidths: number[]): number {
  const icons = PINNED_ICON_WIDTHS.docs + PINNED_ICON_WIDTHS.chat + PINNED_ICON_WIDTHS.alert;
  return TICK_BOX_WIDTH + icons + columnWidths.reduce((sum, w) => sum + w, 0);
}
