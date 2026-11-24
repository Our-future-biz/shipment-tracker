"use client";

import { useEffect, useState } from "react";
import { Button, Input, InputNumber, Popconfirm, Select } from "antd";
import { AppModal } from "@/components/AppModal";
import { GeoSelect } from "@/components/GeoSelect";
import { useSailingDetails, useSailingRemove, type CoLoadingSailing } from "@/hooks/useCoLoadingServices";
import { apiErrorMessage } from "@/lib/api";
import { containerTypeOptions } from "@/lib/cargo";
import { useMessages } from "@/lib/toast";
import { HINT, LABEL_TEXT } from "@/styles/ui";
import { sailingEditOf, sailingFormError, sailingTitle, sailingWeek, voyageNeeded } from "../_lib/sailings";

// The container types grouped by size, as Create new sailing offers them.
const CONTAINER_TYPE_GROUPS = containerTypeOptions("");

interface Form {
  vessel: string;
  voyage: string;
  pol: string;
  pod: string;
  hub: string;
  containerType: string;
  containerCount: number | null;
  cutoffDate: string;
  departureDate: string;
}

const formOf = (s: CoLoadingSailing): Form => ({
  vessel: s.vessel,
  voyage: s.voyage,
  pol: s.pol,
  pod: s.pod,
  hub: s.hub,
  containerType: s.containerType,
  containerCount: s.containerCount,
  cutoffDate: s.cutoffDate ?? "",
  departureDate: s.departureDate ?? "",
});

// "Edit sailing": all of the sailing (Council Outlay 14, A2). A week becomes the vessel once it is
// named, a wrong port or container type is put right, and every change is kept in the sailing's
// record. The number of containers adds up in Box utilization; the departure date's ČNB rates value
// the box costs. Anyone changes these - but once a container has box costs, only managers and admins
// change the container type, the number of containers and the departure date; nothing while the
// service is closed. A manager or admin may remove a sailing made by mistake, while it holds nothing.
export function EditSailingModal({ open, onClose, sailing, isManager, onRemoved }: { open: boolean; onClose: () => void; sailing: CoLoadingSailing; isManager: boolean; onRemoved?: () => void }) {
  // Once a container has box costs, these three move the managers' figures: only they change them (Council Review 7, K13).
  const costed = sailing.costedContainers ?? [];
  const locked = costed.length > 0 && !isManager;
  const save = useSailingDetails(sailing.id);
  const remove = useSailingRemove(sailing.id);
  const message = useMessages();
  const [form, setForm] = useState<Form>(formOf(sailing));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  };
  useEffect(() => {
    if (!open) return;
    setForm(formOf(sailing));
    setError(null);
    // Only opening sets this off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const start = formOf(sailing);
  const same = (Object.keys(start) as (keyof Form)[]).every((k) => (typeof form[k] === "string" ? (form[k] as string).trim() : form[k]) === start[k]);
  const week = sailingWeek(form.vessel);
  const needsVoyage = voyageNeeded(form.vessel);
  const wrongOrder = !!form.cutoffDate && !!form.departureDate && form.cutoffDate > form.departureDate;
  const count = form.containerCount;
  // Costs of a container the sailing would no longer have are kept and not counted: said before saving.
  const dropped = count === null ? [] : costed.filter((n) => n > count);
  const typeChanged = form.containerType !== sailing.containerType;
  const busy = save.isPending || remove.isPending;

  const handleSave = async () => {
    if (count === null) return;
    const missing = sailingFormError(form);
    if (missing) return setError(missing);
    try {
      await save.mutateAsync(sailingEditOf(sailing, { ...form, containerCount: count, cutoffDate: form.cutoffDate || null, departureDate: form.departureDate || null }));
      message.success(`Sailing ${sailingTitle({ vessel: week ?? form.vessel.trim(), voyage: form.voyage.trim() })} saved`);
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  };
  const handleRemove = async () => {
    try {
      await remove.mutateAsync();
      message.success(`Sailing ${sailingTitle(sailing)} removed`);
      onClose();
      onRemoved?.();
    } catch (err) {
      // Said in the server's words: it holds shipments, or box costs.
      setError(apiErrorMessage(err));
    }
  };

  const field = (label: string, input: React.ReactNode, hint?: React.ReactNode, tone: "hint" | "amber" | "red" = "hint") => (
    <label className="flex flex-col gap-1.5">
      <span className={LABEL_TEXT}>{label}</span>
      {input}
      {hint && (
        <span className={tone === "red" ? "text-[12px] text-red-600" : tone === "amber" ? "text-[12px] text-amber-700" : HINT} role={tone === "red" ? "alert" : tone === "amber" ? "status" : undefined}>
          {hint}
        </span>
      )}
    </label>
  );

  return (
    <AppModal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={`Edit sailing ${sailingTitle(sailing)}`}
      subtitle="Its vessel, ports and containers, its cut-off and its departure date. Every change is kept."
      size="large"
      maskClosable={same}
      footer={
        <div className="flex items-center justify-between gap-2">
          {/* A sailing made by mistake: managers and admins, while it holds no shipment and no box cost. */}
          {isManager ? (
            <Popconfirm
              title="Remove this sailing?"
              description="Only a sailing with no shipments and no box costs can be removed."
              okText="Remove"
              okButtonProps={{ danger: true }}
              cancelText="Keep it"
              onConfirm={handleRemove}
            >
              <Button danger type="text" loading={remove.isPending} disabled={save.isPending}>
                Remove sailing
              </Button>
            </Popconfirm>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="primary" loading={save.isPending} disabled={count === null || same || wrongOrder || remove.isPending} onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 items-start">
          {field(
            "Vessel",
            <Input aria-label="Vessel" value={form.vessel} maxLength={100} placeholder="e.g. MSC Anna, or WEEK 44" onChange={(e) => set("vessel", e.target.value)} />,
            // A week is saved as WEEK 44 however it is typed; say so once it is read as one.
            week ? `Saved as ${week}: the vessel isn't known yet.` : "The vessel's name, or the week it sails while it isn't known.",
          )}
          {field(
            needsVoyage ? "Voyage" : "Voyage (optional with a week)",
            <Input aria-label="Voyage" value={form.voyage} maxLength={40} placeholder={needsVoyage ? "e.g. 445W" : "Not known yet"} onChange={(e) => set("voyage", e.target.value)} />,
          )}
          {field("Port of Loading", <GeoSelect kind="place" seaports allowClear value={form.pol} onChange={(v) => set("pol", v ?? "")} />)}
          {field("Port of Discharge", <GeoSelect kind="place" seaports allowClear value={form.pod} onChange={(v) => set("pod", v ?? "")} />)}
          {field("HUB", <GeoSelect kind="place" allowClear value={form.hub} onChange={(v) => set("hub", v ?? "")} />)}
          {field(
            "Container Type",
            <Select aria-label="Container type" showSearch value={form.containerType || undefined} placeholder="e.g. 40' HC" options={CONTAINER_TYPE_GROUPS} onChange={(v) => set("containerType", v)} disabled={locked} />,
            typeChanged ? "Another type holds another volume and weight: Box utilization and the break-even are worked out anew." : undefined,
            "amber",
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 items-start">
          {field(
            "Containers",
            <InputNumber aria-label="Number of containers" min={1} max={20} precision={0} value={count} onChange={(v) => set("containerCount", v)} disabled={locked} className="!w-full" />,
            dropped.length > 0 ? `Container ${dropped.join(", ")} has box costs: they are kept but no longer counted, so the profit rises.` : "From 1 to 20. Box utilization adds their capacity up.",
            dropped.length > 0 ? "amber" : "hint",
          )}
          {field(
            "Cut-off",
            <Input type="date" aria-label="Cut-off date" value={form.cutoffDate} onChange={(e) => set("cutoffDate", e.target.value)} allowClear />,
            "The day cargo must be in by. Leave it empty for none.",
          )}
          {field(
            "Departure date",
            <Input type="date" aria-label="Departure date" value={form.departureDate} onChange={(e) => set("departureDate", e.target.value)} disabled={locked} allowClear />,
            wrongOrder ? "The cut-off cannot be after the departure date." : "The day the sailing leaves. Its exchange rates value the box costs on Earnings.",
            wrongOrder ? "red" : "hint",
          )}
        </div>
        {locked && <p className={`${HINT} m-0`}>This sailing has box costs, so only managers and admins change its container type, its number of containers and its departure date.</p>}
        {error && (
          <p className="m-0 text-[13px] text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    </AppModal>
  );
}
