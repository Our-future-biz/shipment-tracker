"use client";

import { useEffect, useRef, useState } from "react";
import { Select } from "antd";
import type { RefSelectProps } from "antd/es/select";
import { useShipments, type ShipmentItem } from "@/hooks/useShipments";
import { useDebounced } from "@/hooks/useDebounced";

interface ShipmentPickerProps {
  value: string | null;
  /** The chosen shipment, kept in the options when the search does not list it. */
  selected?: ShipmentItem;
  onChange: (id: string | null) => void;
  allowClear?: boolean;
  autoFocus?: boolean;
  className?: string;
}

/** The shipment to invoice. It searches on the server, so any job can be found, not just the newest. */
/** "CZ00000017 — Chart Ferox, a.s.": the customer, else shipper → consignee, else the job alone. */
function pickerLabel(s: { jobNumber: string; customer?: string | null; shipper?: string | null; consignee?: string | null }): string {
  const parties = [s.shipper, s.consignee].filter(Boolean).join(" → ");
  const who = s.customer || parties;
  return who ? `${s.jobNumber} — ${who}` : s.jobNumber;
}

export function ShipmentPicker({ value, selected, onChange, allowClear, autoFocus, className }: ShipmentPickerProps) {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search.trim(), 300);
  const { shipments: found } = useShipments({ search: debounced });
  const list = selected && !found.some((s) => s.id === selected.id) ? [selected, ...found] : found;
  const ref = useRef<RefSelectProps>(null);

  // In a dialog the focus is taken by the dialog as it opens: put it in the picker once it is shown.
  useEffect(() => {
    if (!autoFocus) return;
    const t = window.setTimeout(() => ref.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [autoFocus]);

  return (
    <Select
      ref={ref}
      placeholder="Select a shipment..."
      value={value}
      onChange={(v?: string | null) => onChange(v ?? null)}
      allowClear={allowClear}
      showSearch
      filterOption={false}
      onSearch={setSearch}
      notFoundContent="No shipments found"
      options={list.map((s) => ({ value: s.id, label: pickerLabel(s) }))}
      aria-label="Shipment to invoice"
      className={className}
    />
  );
}
