"use client";

import { useState } from "react";
import { Button, Input, InputNumber, Modal, Select, Space } from "antd";
import { GeoSelect } from "@/components/GeoSelect";
import { apiErrorMessage } from "@/lib/api";
import { containerTypeOptions } from "@/lib/cargo";
import type { CoLoadingSailing, CoLoadingSailingNew } from "@/hooks/useCoLoadingServices";
import { HINT, LABEL_TEXT, MODAL_TITLE } from "@/styles/ui";
import { sailingFormError, sailingWeek, voyageNeeded } from "../_lib/sailings";

const EMPTY: CoLoadingSailingNew = {
  vessel: "",
  voyage: "",
  pol: "",
  pod: "",
  hub: "",
  containerType: "",
  containerCount: 1,
  cutoffDate: null,
  departureDate: null,
};

// The container types grouped by size, as Container Details offers them.
const CONTAINER_TYPE_GROUPS = containerTypeOptions("");

// "Create new sailing" on a Co-Loading Concept service's page: the vessel its cargo goes on. For an
// import whose vessel is not known yet, the Vessel is the week it sails (WEEK 44) and the Voyage may
// be left out. Every other field is needed, but the cut-off and the departure date: a sailing has one
// container unless more are given, and the three can be changed later with Edit sailing.
export function CreateSailingModal({
  open,
  onClose,
  onCreate,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: CoLoadingSailingNew) => Promise<CoLoadingSailing>;
  saving: boolean;
}) {
  const [form, setForm] = useState<CoLoadingSailingNew>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  // A change answers what the form last said was wrong, so that line goes until the next try.
  const set = <K extends keyof CoLoadingSailingNew>(key: K, value: CoLoadingSailingNew[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  };
  const week = sailingWeek(form.vessel);
  const needsVoyage = voyageNeeded(form.vessel);

  const close = () => {
    setForm(EMPTY);
    setError(null);
    onClose();
  };
  const save = async () => {
    const missing = sailingFormError(form);
    if (missing) return setError(missing);
    try {
      await onCreate(form);
      close();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  };

  const field = (label: string, input: React.ReactNode, hint?: React.ReactNode) => (
    <label className="flex flex-col gap-1.5">
      <span className={LABEL_TEXT}>{label}</span>
      {input}
      {hint && <span className={HINT}>{hint}</span>}
    </label>
  );

  return (
    <Modal
      open={open}
      title={<span className={MODAL_TITLE}>Create new sailing</span>}
      onCancel={close}
      width={560}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={close}>Cancel</Button>
          <Button type="primary" loading={saving} onClick={save}>
            Create sailing
          </Button>
        </Space>
      }
    >
      <div className="flex flex-col gap-4 pt-2">
        <div className="grid grid-cols-2 gap-4 items-start">
          {field(
            "Vessel",
            <Input
              autoFocus
              value={form.vessel}
              maxLength={100}
              placeholder="e.g. MSC Anna, or WEEK 44"
              onChange={(e) => set("vessel", e.target.value)}
            />,
            // A week is saved as WEEK 44 however it is typed; say so once it is read as one.
            week
              ? `Saved as ${week}: the vessel isn't known yet.`
              : "The vessel's name, or the week it sails while it isn't known.",
          )}
          {field(
            needsVoyage ? "Voyage" : "Voyage (optional with a week)",
            <Input
              value={form.voyage}
              maxLength={40}
              placeholder={needsVoyage ? "e.g. 445W" : "Not known yet"}
              onChange={(e) => set("voyage", e.target.value)}
            />,
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {field(
            "Port of Loading",
            <GeoSelect
              kind="place"
              seaports
              allowClear
              value={form.pol}
              onChange={(v) => set("pol", v ?? "")}
            />,
          )}
          {field(
            "Port of Discharge",
            <GeoSelect
              kind="place"
              seaports
              allowClear
              value={form.pod}
              onChange={(v) => set("pod", v ?? "")}
            />,
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {field(
            "HUB",
            <GeoSelect
              kind="place"
              allowClear
              value={form.hub}
              onChange={(v) => set("hub", v ?? "")}
            />,
          )}
          {field(
            "Container Type",
            <Select
              showSearch
              value={form.containerType || undefined}
              placeholder="e.g. 40' HC"
              options={CONTAINER_TYPE_GROUPS}
              onChange={(v) => set("containerType", v)}
            />,
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 items-start">
          {field(
            "Containers",
            <InputNumber
              aria-label="Number of containers"
              min={1}
              max={20}
              precision={0}
              value={form.containerCount}
              onChange={(v) => set("containerCount", v ?? 1)}
              className="!w-full"
            />,
            "How many of that type, 1 to 20. Box utilization adds their capacity up.",
          )}
          {field(
            "Cut-off (optional)",
            <Input type="date" aria-label="Cut-off date" value={form.cutoffDate ?? ""} onChange={(e) => set("cutoffDate", e.target.value || null)} allowClear />,
            "The day cargo must be in by.",
          )}
          {field(
            "Departure date (optional)",
            <Input type="date" aria-label="Departure date" value={form.departureDate ?? ""} onChange={(e) => set("departureDate", e.target.value || null)} allowClear />,
            "The day the sailing leaves. Its exchange rates value the box costs.",
          )}
        </div>
        {error && (
          <div role="alert" className="text-[13px] text-red-600">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
