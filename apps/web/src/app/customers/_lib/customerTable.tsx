// Table conventions shared by every list of the customer section.

// What an empty cell or an unknown KPI shows.
export const EMPTY_CELL = <span className="text-slate-300">—</span>;

// The page size is fixed, so the size changer antd adds above 50 rows would be a dead control.
export const TABLE_PAGINATION = { pageSize: 15, hideOnSinglePage: true, size: "small", showSizeChanger: false } as const;
