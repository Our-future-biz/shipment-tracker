"use client";

import { useMemo, useState } from "react";
import { Button, DatePicker, Input, Popconfirm, Segmented, Select } from "antd";
import { Table } from "@/components/Table";
import { useToast } from "@/lib/toast";
import { apiErrorMessage } from "@/lib/api";
import { DeleteOutlined, SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { usePublicHolidays } from "@/hooks/usePublicHolidays";
import { useMyCountries } from "@/hooks/useMyCountries";
import { CARD, ICON_BTN_GHOST } from "@/styles/ui";
import { type HolidayItem, listedCountries, occurrences, ofMyCountries, overlaps, rowCountry } from "../_lib/holidays";
import { HolidayAlerts } from "./HolidayAlerts";
import { dash, dateCell, textCell } from "./holidayCells";

const byText = (k: keyof HolidayItem) => (a: HolidayItem, b: HolidayItem) => String(a[k] ?? "").localeCompare(String(b[k] ?? ""));

type Kind = "all" | "national" | "regional";

interface WorldHolidaysTabProps {
  items: HolidayItem[];
  loading: boolean;
  /** Whether the user may delete holidays (managers; the server refuses anyone else). */
  canManage: boolean;
}

export function WorldHolidaysTab({ items: allItems, loading, canManage }: WorldHolidaysTabProps) {
  const toast = useToast();
  const { deleteHoliday } = usePublicHolidays();
  // The countries the user cares about (kept on their account; the year calendar shows the same).
  // Picked, the cards and the table show only theirs, until "All countries" is chosen for a look.
  const { myCountries, saveMyCountries } = useMyCountries();
  const [showAll, setShowAll] = useState(false);
  const allCountries = useMemo(() => listedCountries(allItems), [allItems]);
  const items = useMemo(() => (showAll ? allItems : ofMyCountries(allItems, myCountries)), [allItems, myCountries, showAll]);
  const pickMyCountries = (next: string[]) => {
    setShowAll(false);
    saveMyCountries(next).catch((err) => toast.error(`Could not save your countries: ${apiErrorMessage(err)}`));
  };
  const [search, setSearch] = useState("");
  const [countries, setCountries] = useState<string[]>([]);
  const [kind, setKind] = useState<Kind>("all");
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  const handleDelete = (id: string) => deleteHoliday(id).catch((err) => toast.error(`Could not delete the holiday: ${apiErrorMessage(err)}`));

  const countryOptions = useMemo(() => listedCountries(items).map((c) => ({ value: c, label: c })), [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = range?.[0]?.format("YYYY-MM-DD");
    const to = range?.[1]?.format("YYYY-MM-DD");
    return items.filter((h) => {
      if (countries.length && !countries.includes(rowCountry(h))) return false;
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
    { title: "Country", dataIndex: "country", width: 160, fixed: "left", sorter: byText("country"), render: (v: string) => <span className="font-semibold">{textCell(v)}</span> },
    { title: "Country code", dataIndex: "countryCode", width: 110, sorter: byText("countryCode"), render: (v: string) => (v ? <span className="tabular-nums">{v}</span> : dash) },
    { title: "National holiday", dataIndex: "nationalHoliday", width: 220, sorter: byText("nationalHoliday"), render: textCell },
    { title: "National start date", dataIndex: "nationalStart", width: 140, sorter: byText("nationalStart"), defaultSortOrder: "ascend", render: dateCell },
    { title: "National end date", dataIndex: "nationalEnd", width: 140, sorter: byText("nationalEnd"), render: dateCell },
    { title: "Regional holiday", dataIndex: "regionalHoliday", width: 220, sorter: byText("regionalHoliday"), render: textCell },
    { title: "Regional start date", dataIndex: "regionalStart", width: 140, sorter: byText("regionalStart"), render: dateCell },
    { title: "Regional end date", dataIndex: "regionalEnd", width: 140, sorter: byText("regionalEnd"), render: dateCell },
    { title: "Region(s) / subdivision(s)", dataIndex: "regions", width: 260, sorter: byText("regions"), render: textCell },
    // Deleting is for managers only, as the upload is.
    ...(canManage
      ? [
          {
            title: "",
            key: "actions",
            width: 56,
            fixed: "right" as const,
            render: (_: unknown, h: HolidayItem) => (
              <Popconfirm title="Delete this holiday?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => handleDelete(h.id)}>
                <button type="button" aria-label="Delete holiday" className={ICON_BTN_GHOST}>
                  <DeleteOutlined />
                </button>
              </Popconfirm>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className={`${CARD} flex flex-wrap items-center gap-3 px-4 py-3`}>
        <span className="text-[13px] font-semibold text-slate-900">My countries</span>
        <Select
          mode="multiple"
          allowClear
          showSearch
          placeholder="All countries — pick the ones you care about"
          value={myCountries}
          onChange={pickMyCountries}
          options={allCountries.map((c) => ({ value: c, label: c }))}
          maxTagCount="responsive"
          className="min-w-[280px] max-w-[560px] flex-1"
          aria-label="My countries"
        />
        {myCountries.length > 0 && (
          <Segmented<"mine" | "all">
            value={showAll ? "all" : "mine"}
            onChange={(v) => setShowAll(v === "all")}
            options={[
              { value: "mine", label: `My countries (${myCountries.length})` },
              { value: "all", label: "All countries" },
            ]}
          />
        )}
        <span className="text-[12px] text-slate-500 basis-full">
          Only these countries&apos; holidays show on this page and in the year calendar (which always shows the Czech ones), on every browser you sign in with. None picked shows all countries.
        </span>
      </div>

      <HolidayAlerts items={occurrences(items)} loading={loading} />

      <div className={`${CARD} overflow-clip`}>
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
            {items.length !== allItems.length && <span className="text-slate-400"> (of {allItems.length} in all countries)</span>}
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
                {items.length
                  ? "No holiday matches the filters."
                  : allItems.length
                    ? "None of your countries has a holiday in the list."
                    : "No holidays yet — add them in the Upload tab."}
              </span>
            ),
          }}
        />
      </div>
    </div>
  );
}
