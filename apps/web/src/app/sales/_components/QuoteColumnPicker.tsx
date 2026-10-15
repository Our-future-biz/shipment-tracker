"use client";

import { Button, Checkbox, Popover, Tooltip } from "antd";
import { DownOutlined, SettingOutlined, UpOutlined } from "@ant-design/icons";
import { toolbarButtonClass } from "./ToolbarButton";
import { DEFAULT_QUOTE_COLUMNS, QUOTE_COLUMNS } from "./quoteListColumns";

interface QuoteColumnPickerProps {
  // The columns the list shows, in their order.
  visible: string[];
  onChange: (keys: string[]) => void;
  // Whether the company's stored columns are known. Until they are ("ready") `visible` is only
  // the set every list starts with, and nothing here changes it: stored from that, it would
  // replace the set the whole company has.
  status: "loading" | "ready" | "error";
  onRetry: () => void;
}

// The Columns button of the Quotes toolbar and its panel: which columns the list shows, and in
// which order. A column that is shown has two arrows that move it one place earlier or later in
// the table; the table's headings can be dragged to the same effect. The set is stored for the
// whole company, so the panel also leads back to the columns every list starts with.
export function QuoteColumnPicker({ visible, onChange, status, onRetry }: QuoteColumnPickerProps) {
  const locked = status !== "ready";

  const toggle = (key: string) => onChange(visible.includes(key) ? visible.filter((k) => k !== key) : [...visible, key]);

  const move = (key: string, by: -1 | 1) => {
    const from = visible.indexOf(key);
    const to = from + by;
    if (from < 0 || to < 0 || to >= visible.length) return;
    const next = [...visible];
    next.splice(to, 0, ...next.splice(from, 1));
    onChange(next);
  };

  const panel = (
    <div className="w-64">
      <div className="pb-2.5 mb-2.5 border-b border-slate-100 text-[13px] font-semibold text-slate-800">Columns</div>
      {status === "loading" && <div className="mb-2 text-xs text-slate-500">Loading the company&apos;s columns…</div>}
      {status === "error" && (
        <div role="alert" className="mb-2 text-xs text-red-600">
          The company&apos;s columns could not be loaded, so they cannot be changed.{" "}
          <Button size="small" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
      <div className="max-h-80 overflow-y-auto pr-1 flex flex-col gap-0.5">
        {QUOTE_COLUMNS.map((column) => {
          const shown = visible.includes(column.key);
          return (
            <div key={column.key} className="flex items-center justify-between gap-2 min-h-8">
              <Checkbox checked={shown} disabled={locked} onChange={() => toggle(column.key)}>
                <span className="text-xs text-slate-700">{column.title}</span>
              </Checkbox>
              {shown && (
                <span className="flex shrink-0">
                  <Button
                    type="text"
                    size="small"
                    disabled={locked}
                    icon={<UpOutlined className="text-[10px]" />}
                    aria-label={`Move ${column.title} earlier`}
                    title="Move earlier"
                    onClick={() => move(column.key, -1)}
                  />
                  <Button
                    type="text"
                    size="small"
                    disabled={locked}
                    icon={<DownOutlined className="text-[10px]" />}
                    aria-label={`Move ${column.title} later`}
                    title="Move later"
                    onClick={() => move(column.key, 1)}
                  />
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-100">
        <button
          type="button"
          disabled={locked}
          onClick={() => onChange(DEFAULT_QUOTE_COLUMNS)}
          className="text-[11px] text-indigo-500 hover:underline bg-transparent border-none p-0 cursor-pointer disabled:text-slate-400 disabled:no-underline disabled:cursor-not-allowed"
        >
          Reset to default
        </button>
        <span className="ml-auto text-[11px] text-slate-400">{visible.length} shown</span>
      </div>
    </div>
  );

  return (
    <Popover content={panel} trigger="click" placement="bottomRight">
      <Tooltip title="Columns">
        <button type="button" aria-label="Columns" className={toolbarButtonClass("secondary", "square")}>
          <SettingOutlined />
        </button>
      </Tooltip>
    </Popover>
  );
}
