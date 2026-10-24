"use client";

import { useState, type ReactNode } from "react";
import { Button, Input, Popover, Tooltip } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import type { AddressField } from "@/app/sales/_lib/emailAddresses";

export interface AddressEntry {
  address: string;
  /** Who it is, shown before the address. */
  name?: string;
}

interface EmailAddressListButtonProps {
  label: string;
  icon: ReactNode;
  /** Above the list. */
  title: string;
  entries: AddressEntry[];
  /** Said when the list is empty. */
  empty: string;
  onAdd: (field: AddressField, address: string) => void;
  /** Takes an address off the list; without it the list can't be changed here. */
  onForget?: (address: string) => void;
}

// A list of addresses behind a button of the Email dialog, each one put to To, CC or BCC.
export function EmailAddressListButton({ label, icon, title, entries, empty, onAdd, onForget }: EmailAddressListButtonProps) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const shown = entries.filter((e) => e.address.toLowerCase().includes(q) || (e.name ?? "").toLowerCase().includes(q));

  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      title={title}
      onOpenChange={(open) => open && setSearch("")}
      content={
        <div className="w-[420px] max-w-[80vw]">
          <Input size="small" allowClear placeholder="Search" aria-label={`Search ${label}`} value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="mt-2 max-h-64 overflow-y-auto flex flex-col">
            {shown.length === 0 ? (
              <div className="py-3 text-center text-[13px] text-slate-500">{entries.length ? "No address matches" : empty}</div>
            ) : (
              shown.map((e) => (
                <div key={e.address} className="flex items-center gap-1 py-1 border-b border-slate-100 last:border-0">
                  <span className="flex-1 min-w-0 truncate text-[13px]" title={e.name ? `${e.name} <${e.address}>` : e.address}>
                    {e.name && <span className="text-slate-800">{e.name} </span>}
                    <span className={e.name ? "text-slate-500" : undefined}>{e.address}</span>
                  </span>
                  {(["to", "cc", "bcc"] as const).map((field) => (
                    <Button key={field} size="small" onClick={() => onAdd(field, e.address)}>
                      {field.toUpperCase()}
                    </Button>
                  ))}
                  {onForget && (
                    <Tooltip title="Take off the list">
                      <Button size="small" type="text" icon={<CloseOutlined />} aria-label={`Take ${e.address} off the list`} onClick={() => onForget(e.address)} />
                    </Tooltip>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      }
    >
      <Button size="small" icon={icon}>
        {label}
      </Button>
    </Popover>
  );
}
