"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, DatePicker, Input, Popconfirm, Select, Table, message } from "antd";
import { DeleteOutlined, SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { type HolidayItem, occurrences, overlaps } from "../_lib/holidays";
import { HolidayAlerts } from "./HolidayAlerts";

const dash = <span className="text-slate-300">—</span>;
const text = (v: string) => v || dash;
const date = (v: string) => (v ? <span className="tabular-nums">{formatDate(v)}</span> : dash);
const byText = (k: keyof HolidayItem) => (a: HolidayItem, b: HolidayItem) => String(a[k] ?? "").localeCompare(String(b[k] ?? ""));

type Kind = "all" | "national" | "regional";

export function WorldHolidaysTab({ items, loading }: { items: HolidayItem[]; loading: boolean }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [countries, setCountries] = useState<string[]>([]);
  const [kind, setKind] = useState<Kind>("all");
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => api.holidays.holidayDelete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["public-holidays"] }),
    onError: () => message.error("Could not delete the holiday"),
  });

  const countryOptions = useMemo(
    () =>
      [...new Set(items.map((h) => h.country || h.countryCode).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b))
        .map((c) => ({ value: c, label: c })),
    [items],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = range?.[0]?.format("YYYY-MM-DD");
    const to = range?.[1]?.format("YYYY-MM-DD");
    return items.filter((h) => {
      if (countries.length && !countries.includes(h.country || h.countryCode)) return false;
      if (kind === "national" && !h.nationalHoliday) return false;
      if (kind === "regional" && !h.regionalHoliday) return false;
      if (q && ![h.country, h.countryCode, h.nationalHoliday, h.regionalHoliday, h.regions].some((v) => v.toLowerCase().includes(q))) {
        return false;
      }
      if (from && to) {
        const national = h.nationalStart && overlaps({ start: h.nationalStart, end: h.nationalEnd || h.nationalStart }, from, to);
        const regional = h.regionalStart && overlaps({ start: h.regionalStart, end: h.regionalEnd || h.regionalStart }, from, to);
        if (!national && !regional) return false;
      }
      return true;
    });
  }, [items, search, countries, kind, range]);

  const filtering = !!(search.trim() || countries.length || kind !== "all" || range);

  const columns: ColumnsType<HolidayItem> = [
    { title: "Country", dataIndex: "country", width: 160, fixed: "left", sorter: byText("country"), render: (v: string) => <span className="font-semibold">{text(v)}</span> },
    { title: "Country code", dataIndex: "countryCode", width: 110, sorter: byText("countryCode"), render: (v: string) => (v ? <span className="font-mono">{v}</span> : dash) },
    { title: "National holiday", dataIndex: "nationalHoliday", width: 220, sorter: byText("nationalHoliday"), render: text },
    { title: "National start date", dataIndex: "nationalStart", width: 140, sorter: byText("nationalStart"), defaultSortOrder: "ascend", render: date },
    { title: "National end date", dataIndex: "nationalEnd", width: 140, sorter: byText("nationalEnd"), render: date },
    { title: "Regional holiday", dataIndex: "regionalHoliday", width: 220, sorter: byText("regionalHoliday"), render: text },
    { title: "Regional start date", dataIndex: "regionalStart", width: 140, sorter: byText("regionalStart"), render: date },
    { title: "Regional end date", dataIndex: "regionalEnd", width: 140, sorter: byText("regionalEnd"), render: date },
    { title: "Region(s) / subdivision(s)", dataIndex: "regions", width: 260, sorter: byText("regions"), render: text },
    {
      title: "",
      key: "actions",
      width: 56,
      fixed: "right",
      render: (_: unknown, h: HolidayItem) => (
        <Popconfirm title="Delete this holiday?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove.mutate(h.id)}>
          <Button type="text" size="small" icon={<DeleteOutlined />} aria-label="Delete holiday" className="text-slate-400 hover:!text-red-500" />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <HolidayAlerts items={occurrences(items)} loading={loading} />

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-100">
          <Input
            allowClear
            prefix={<SearchOutlined className="text-slate-400" />}
            placeholder="Search holiday, country, region…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[280px]"
          />
          <Select
            mode="multiple"
            allowClear
            showSearch
            placeholder="All countries"
            value={countries}
            onChange={setCountries}
            options={countryOptions}
            maxTagCount="responsive"
            className="min-w-[220px] max-w-[420px]"
          />
          <Select<Kind>
            value={kind}
            onChange={setKind}
            className="w-[170px]"
            options={[
              { value: "all", label: "National & regional" },
              { value: "national", label: "National only" },
              { value: "regional", label: "Regional only" },
            ]}
          />
          <DatePicker.RangePicker value={range} onChange={(v) => setRange(v)} format="DD.MM.YYYY" allowEmpty={[false, false]} />
          {filtering && (
            <Button
              type="link"
              onClick={() => {
                setSearch("");
                setCountries([]);
                setKind("all");
                setRange(null);
              }}
            >
              Clear filters
            </Button>
          )}
          <div className="flex-1" />
          <span className="text-[13px] text-slate-500">
            {filtering ? `${filtered.length} of ${items.length}` : items.length} holidays
          </span>
        </div>
        <Table<HolidayItem>
          size="small"
          rowKey="id"
          loading={loading}
          dataSource={filtered}
          columns={columns}
          scroll={{ x: 1600 }}
          pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: [25, 50, 100, 200] }}
          locale={{
            emptyText: (
              <span className="text-[13px] text-slate-400">
                {items.length ? "No holiday matches the filters." : "No holidays yet — add them in the Upload tab."}
              </span>
            ),
          }}
        />
      </div>
    </div>
  );
}
