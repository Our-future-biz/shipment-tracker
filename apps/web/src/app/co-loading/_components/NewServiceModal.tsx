"use client";

import { useState } from "react";
import { Button, Input, Modal, Select, Space } from "antd";
import { GeoSelect } from "@/components/GeoSelect";
import { apiErrorMessage } from "@/lib/api";
import { DROPDOWN_OPTIONS, SERVICE_NAME_HINTS } from "@/lib/columnConfig";
import type { CoLoadingService, CoLoadingServiceNew } from "@/hooks/useCoLoadingServices";
import { HINT, LABEL_TEXT, MODAL_TITLE } from "@/styles/ui";
import { DIRECTION_OPTIONS, FREQUENCY_OPTIONS, MODE_OPTIONS } from "../_lib/services";

const EMPTY: CoLoadingServiceNew = {
  name: "",
  serviceName: "",
  frequency: "",
  direction: "import",
  mode: "sea_lcl",
  origin: "",
  destination: "",
  note: "",
};

// New Service: a lane customer service will consolidate on. Its Service Name is picked from the shipments'
// Service Name list (ISHA, Domestic), so the shipments that are its own can come into it from the
// Shipments module later; here the service is only made.
const SERVICE_NAME_OPTIONS = DROPDOWN_OPTIONS["Service Name"]!.map((value) => ({
  value,
  label: value,
}));
export function NewServiceModal({
  open,
  onClose,
  onCreate,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: CoLoadingServiceNew) => Promise<CoLoadingService>;
  saving: boolean;
}) {
  const [form, setForm] = useState<CoLoadingServiceNew>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  // A change answers what the form last said was wrong, so that line goes until the next try.
  const set = <K extends keyof CoLoadingServiceNew>(key: K, value: CoLoadingServiceNew[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  };

  const close = () => {
    setForm(EMPTY);
    setError(null);
    onClose();
  };
  const save = async () => {
    if (!form.name.trim()) return setError("Give the service a name.");
    if (!form.serviceName) return setError("Pick the Service Name.");
    if (!form.frequency) return setError("Pick the frequency.");
    try {
      await onCreate(form);
      close();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  };

  const field = (label: string, input: React.ReactNode, hint?: string) => (
    <label className="flex flex-col gap-1.5">
      <span className={LABEL_TEXT}>{label}</span>
      {input}
      {hint && <span className={HINT}>{hint}</span>}
    </label>
  );

  return (
    <Modal
      open={open}
      title={<span className={MODAL_TITLE}>New Service</span>}
      onCancel={close}
      width={560}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={close}>Cancel</Button>
          <Button type="primary" loading={saving} onClick={save}>
            Create service
          </Button>
        </Space>
      }
    >
      <div className="flex flex-col gap-4 pt-2">
        {field(
          "Name",
          <Input
            autoFocus
            value={form.name}
            maxLength={80}
            placeholder="e.g. Import from Ningbo"
            onChange={(e) => set("name", e.target.value)}
            onPressEnter={save}
          />,
        )}
        {/* Service Name and how often the service runs, side by side as Direction and Mode are. */}
        <div className="grid grid-cols-2 gap-4 items-start">
          {field(
            "Service Name",
            <Select
              value={form.serviceName || undefined}
              placeholder="Pick a Service Name"
              options={SERVICE_NAME_OPTIONS}
              // Each says what it stands for, as where a shipment's Service Name is picked.
              optionRender={(o) => {
                const hint = SERVICE_NAME_HINTS[String(o.value)];
                return hint ? (
                  <span className="flex flex-col leading-tight py-0.5">
                    <span>{o.label}</span>
                    <span className="text-[11px] text-slate-500 whitespace-normal">{hint}</span>
                  </span>
                ) : (
                  o.label
                );
              }}
              onChange={(v) => set("serviceName", v)}
            />,
            SERVICE_NAME_HINTS[form.serviceName],
          )}
          {field(
            "Frequency",
            <Select
              value={form.frequency || undefined}
              placeholder="How often it runs"
              options={[...FREQUENCY_OPTIONS]}
              onChange={(v) => set("frequency", v)}
            />,
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {field(
            "Direction",
            <Select
              value={form.direction}
              options={[...DIRECTION_OPTIONS]}
              onChange={(v) => set("direction", v)}
            />,
          )}
          {field(
            "Mode",
            <Select
              value={form.mode}
              options={[...MODE_OPTIONS]}
              onChange={(v) => set("mode", v)}
            />,
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {field(
            "Origin",
            <GeoSelect
              kind="place"
              seaports
              allowClear
              value={form.origin}
              onChange={(v) => set("origin", v)}
            />,
          )}
          {field(
            "Destination",
            <GeoSelect
              kind="place"
              seaports
              allowClear
              value={form.destination}
              onChange={(v) => set("destination", v)}
            />,
          )}
        </div>
        {field(
          "Note",
          <Input.TextArea
            value={form.note}
            maxLength={1000}
            autoSize={{ minRows: 2, maxRows: 5 }}
            onChange={(e) => set("note", e.target.value)}
          />,
          "Shown on the service's tile.",
        )}
        {error && (
          <div role="alert" className="text-[13px] text-red-600">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
