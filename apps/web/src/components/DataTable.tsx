"use client";

import { useEffect, useMemo, useState } from "react";
import { Table, Select, Pagination } from "antd";
import type { TableProps } from "antd";

const PAGE_SIZE_OPTIONS = [50, 100, 150, 200];

type DataTableProps<T> = TableProps<T> & {
  // Change this whenever the result set changes (e.g. the search string) to
  // reset back to the first page.
  resetKey?: unknown;
};

// Shared table style used across the app: rounded card, compact rows, and a
// bottom bar with the rows-per-page selector on the left and pagination on the
// right — matching the shipments table.
export function DataTable<T extends object>({ dataSource, resetKey, ...tableProps }: DataTableProps<T>) {
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);

  const total = dataSource?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(currentPage, pageCount);
  const paged = useMemo(
    () => ((dataSource ?? []) as readonly T[]).slice((safePage - 1) * pageSize, safePage * pageSize) as T[],
    [dataSource, safePage, pageSize],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [resetKey, pageSize]);

  return (
    <div className="data-table bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <Table<T> {...tableProps} size="small" dataSource={paged} pagination={false} />
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100">
        <div className="flex items-center gap-2 text-[13px] text-slate-500">
          <span>Rows per page</span>
          <Select
            value={pageSize}
            onChange={setPageSize}
            options={PAGE_SIZE_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
            className="w-20"
            size="small"
          />
        </div>
        <Pagination
          size="small"
          current={safePage}
          pageSize={pageSize}
          total={total}
          showSizeChanger={false}
          onChange={setCurrentPage}
          showTotal={(t, range) => `${range[0]}-${range[1]} of ${t} entries`}
        />
      </div>
    </div>
  );
}
