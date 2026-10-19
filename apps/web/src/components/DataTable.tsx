"use client";

import { useEffect, useMemo, useState } from "react";
import { Table, Select, Pagination } from "antd";
import type { TableProps } from "antd";
import type { SorterResult } from "antd/es/table/interface";

// A column's own compare function, as antd's `sorter` may carry it.
type Compare<T> = (a: T, b: T) => number;
function compareOf<T>(sorter: unknown): Compare<T> | null {
  if (typeof sorter === "function") return sorter as Compare<T>;
  if (sorter && typeof sorter === "object" && typeof (sorter as { compare?: unknown }).compare === "function") return (sorter as { compare: Compare<T> }).compare;
  return null;
}

// The page size a table starts with, and the ones it offers.
export const DEFAULT_PAGE_SIZE = 50;
export const PAGE_SIZE_OPTIONS = [DEFAULT_PAGE_SIZE, 100, 150, 200];

// A list the server pages: `dataSource` is the one page it returned, `total` the number of rows
// the list holds in all - undefined while the server has not said, and then no count is shown -
// and the page and its size are kept by whoever asks for the pages. `onChange` is told which page
// of which size to show next.
interface ServerPaging {
  total: number | undefined;
  page: number;
  pageSize: number;
  onChange: (page: number, pageSize: number) => void;
}

type DataTableProps<T> = TableProps<T> & {
  // Change this whenever the result set changes (e.g. the search string) to
  // reset back to the first page.
  resetKey?: unknown;
  // Without it the table pages the rows it is given by itself. No `dataSource` then means that
  // the rows are not known - still on their way, or their request failed - and no count is shown.
  server?: ServerPaging;
};

interface DataTableFooterProps {
  page: number;
  pageSize: number;
  // How many rows the list holds in all.
  total: number;
  // False when nobody counted the rows: no "1-50 of N entries" is shown then.
  counted?: boolean;
  // Told which page of which size to show next. Another size starts again from the first page.
  onChange: (page: number, pageSize: number) => void;
  // The bar's spacing and border, which differ with what it stands in.
  className: string;
}

// The bar under a table: the rows-per-page selector on the left and the pages on the right.
// DataTable ends with it; a table that stands inside a card of its own puts it under itself.
export function DataTableFooter({ page, pageSize, total, counted = true, onChange, className }: DataTableFooterProps) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <div className="flex items-center gap-2 text-[13px] text-slate-500">
        <span>Rows per page</span>
        <Select
          value={pageSize}
          onChange={(size) => onChange(1, size)}
          options={PAGE_SIZE_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
          className="w-20"
          size="small"
        />
      </div>
      <Pagination
        size="small"
        current={page}
        pageSize={pageSize}
        total={total}
        showSizeChanger={false}
        onChange={(nextPage) => onChange(nextPage, pageSize)}
        // A count nobody counted is not shown: "0 of 0" under a list that failed to load would state one.
        showTotal={(t, range) => (counted ? `${range[0]}-${range[1]} of ${t} entries` : "")}
      />
    </div>
  );
}

// Shared table style used across the app: rounded card, compact rows, and a
// bottom bar with the rows-per-page selector on the left and pagination on the
// right — matching the shipments table.
export function DataTable<T extends object>({ dataSource, resetKey, server, onChange, ...tableProps }: DataTableProps<T>) {
  const [ownPageSize, setOwnPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [ownPage, setOwnPage] = useState(1);
  // The column sort the user chose, applied here to ALL the rows before they are cut into pages:
  // antd alone would sort only the page it is shown.
  const [sort, setSort] = useState<{ compare: Compare<T>; descending: boolean } | null>(null);

  const serverPaged = server !== undefined;
  const pageSize = server?.pageSize ?? ownPageSize;
  const total = server?.total ?? dataSource?.length ?? 0;
  // Whether anybody counted the rows: the server said how many there are, or the rows are all here.
  const counted = server ? server.total !== undefined : dataSource !== undefined;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(server?.page ?? ownPage, pageCount);
  const paged = useMemo(() => {
    const rows = (dataSource ?? []) as readonly T[];
    // The server's page is shown as it came.
    if (serverPaged) return rows as T[];
    const ordered = sort ? [...rows].sort((a, b) => (sort.descending ? -1 : 1) * sort.compare(a, b)) : rows;
    return ordered.slice((safePage - 1) * pageSize, safePage * pageSize) as T[];
  }, [dataSource, serverPaged, safePage, pageSize, sort]);

  const handleChange: TableProps<T>["onChange"] = (pagination, filters, sorter, extra) => {
    if (!serverPaged) {
      const chosen = (Array.isArray(sorter) ? sorter[0] : sorter) as SorterResult<T> | undefined;
      const compare = chosen?.order ? compareOf<T>(chosen.column?.sorter) : null;
      setSort(compare ? { compare, descending: chosen?.order === "descend" } : null);
      // A new order starts again from the first page.
      setOwnPage(1);
    }
    onChange?.(pagination, filters, sorter, extra);
  };

  useEffect(() => {
    setOwnPage(1);
  }, [resetKey, ownPageSize]);

  return (
    <div className="data-table bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <Table<T> {...tableProps} onChange={handleChange} size="small" dataSource={paged} pagination={false} />
      <DataTableFooter
        className="px-4 py-3 border-t border-slate-100"
        page={safePage}
        pageSize={pageSize}
        total={total}
        counted={counted}
        onChange={
          server
            ? server.onChange
            : (nextPage, nextPageSize) => {
                setOwnPage(nextPage);
                setOwnPageSize(nextPageSize);
              }
        }
      />
    </div>
  );
}
