"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Button, Input, InputNumber, Spin } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { SectionCard } from "@/components/SectionCard";
import { apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDateTime } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { useTruckingSettings, type TruckingSettings } from "@/hooks/useTrucking";
import { useUnsavedGuard } from "@/app/warehouse/_lib/useUnsavedGuard";
import { TERMS } from "../../_lib/glossary";
import { isTruckingManager } from "../../_lib/roles";
import { CONFLICT_TEXT, isVersionConflict } from "../../_lib/saveConflict";
import { settingsProblems, TEXT_PLACEHOLDERS, type SettingsDraft } from "../../_lib/settings";
import { FuelIndexSection } from "./FuelIndexSection";
import { ServiceLevelsTable } from "./ServiceLevelsTable";
import { TruckingField } from "../../_components/TruckingField";
import { VehicleTypesTable } from "./VehicleTypesTable";

// Trucking settings: service levels with their cut-offs, vehicle types, chargeable-weight factors,
// the margin floor and the transport-order e-mail. Everyone can see them; only a manager changes them.

const draftOf = (s: TruckingSettings): SettingsDraft => ({
  serviceLevels: structuredClone(s.serviceLevels),
  vehicleTypes: structuredClone(s.vehicleTypes),
  factors: { ...s.factors },
  marginFloor: { ...s.marginFloor },
  transportOrder: { ...s.transportOrder },
});
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export const TruckingSettingsView = () => {
  const toast = useToast();
  const { user } = useAuth();
  const { settings, isLoading, isError, reload, save, isSaving } = useTruckingSettings();
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [conflict, setConflict] = useState(false);

  // Settings as read (set while rendering, not in an effect): newer stored settings replace the
  // draft only while nothing is edited here.
  const [seen, setSeen] = useState<TruckingSettings | null>(null);
  if (settings && settings !== seen) {
    setSeen(settings);
    if (!draft || !seen || same(draft, draftOf(seen))) setDraft(draftOf(settings));
  }

  const dirty = !!draft && !!settings && !same(draft, draftOf(settings));
  useUnsavedGuard(dirty, "trucking-settings");
  const problems = useMemo(() => (draft ? settingsProblems(draft) : []), [draft]);
  const savedCodes = useMemo(() => new Set(settings?.vehicleTypes.map((v) => v.code) ?? []), [settings]);

  if (isLoading) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }
  if (isError || !settings || !draft) {
    return (
      <div className="p-10 text-center text-slate-500">
        The Trucking settings could not be read — reload the page.{" "}
        <Link href="/trucking" className="text-indigo-500">
          Back to Trucking
        </Link>
      </div>
    );
  }

  const canEdit = isTruckingManager(user);
  const set = <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  const handleSave = async () => {
    try {
      const res = await save({ ...draft, version: settings.version });
      setDraft(draftOf(res.settings));
      setConflict(false);
      toast.success("Trucking settings saved");
    } catch (e) {
      if (isVersionConflict(e)) setConflict(true);
      else toast.error(`Could not save the settings: ${apiErrorMessage(e)}`);
    }
  };
  // Loads the version someone else saved; the edits made here are dropped, to be made again on top of it.
  const handleReload = async () => {
    const res = await reload();
    if (!res.data) return;
    setDraft(draftOf(res.data.settings));
    setConflict(false);
  };
  const handleDiscard = () => setDraft(draftOf(settings));

  return (
    <div className="bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-start gap-2">
          <Link href="/trucking" aria-label="Back to Trucking" className="mt-1 text-slate-400 hover:text-indigo-500 p-1">
            <ArrowLeftOutlined />
          </Link>
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold text-slate-800 m-0">Trucking settings</h1>
            <div className="text-xs text-slate-500 mt-1">
              {TERMS.serviceLevel}s, vehicle types, {TERMS.chargeableWeight.toLowerCase()}, margin floor, the {TERMS.transportOrder.toLowerCase()} e-mail and the {TERMS.fuelIndex.toLowerCase()}.
              {settings.updatedAt
                ? ` Last changed${settings.updatedBy ? ` by ${settings.updatedBy}` : ""} on ${formatDateTime(settings.updatedAt)}.`
                : " Nothing saved yet — the defaults are shown."}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto p-4 sm:p-6 flex flex-col gap-4">
        {!canEdit && <Alert type="info" showIcon message="Only a manager can change these settings. You can see them." />}
        {conflict && (
          <Alert
            type="error"
            showIcon
            message={CONFLICT_TEXT}
            action={
              <Button size="small" onClick={handleReload}>
                Reload
              </Button>
            }
          />
        )}

        <SectionCard title={`${TERMS.serviceLevel}s`} bodyClassName="p-0">
          <ServiceLevelsTable
            levels={draft.serviceLevels}
            disabled={!canEdit}
            onChange={(code, p) => set("serviceLevels", draft.serviceLevels.map((l) => (l.code === code ? { ...l, ...p } : l)))}
          />
        </SectionCard>

        <SectionCard title="Vehicle types">
          <VehicleTypesTable types={draft.vehicleTypes} savedCodes={savedCodes} disabled={!canEdit} onChange={(v) => set("vehicleTypes", v)} />
        </SectionCard>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SectionCard title={`${TERMS.chargeableWeight} factors`}>
            <div className="grid grid-cols-3 gap-3">
              <TruckingField label="kg per LDM">
                <InputNumber aria-label="kg per LDM" min={1} value={draft.factors.kgPerLdm} disabled={!canEdit} onChange={(v) => set("factors", { ...draft.factors, kgPerLdm: v ?? 0 })} className="w-full" />
              </TruckingField>
              <TruckingField label="kg per m³">
                <InputNumber aria-label="kg per cubic metre" min={1} value={draft.factors.kgPerCbm} disabled={!canEdit} onChange={(v) => set("factors", { ...draft.factors, kgPerCbm: v ?? 0 })} className="w-full" />
              </TruckingField>
              <TruckingField label="kg per pallet place">
                <InputNumber
                  aria-label="kg per pallet place"
                  min={1}
                  value={draft.factors.kgPerPalletPlace}
                  disabled={!canEdit}
                  onChange={(v) => set("factors", { ...draft.factors, kgPerPalletPlace: v ?? 0 })}
                  className="w-full"
                />
              </TruckingField>
            </div>
            <p className="mt-3 mb-0 text-[11px] text-slate-400">A consignment is priced at the higher of its real weight and what its LDM, volume or pallet places count for.</p>
          </SectionCard>

          <SectionCard title="Margin floor">
            <div className="grid grid-cols-2 gap-3">
              <TruckingField label="Margin at least (%)">
                <InputNumber aria-label="Margin floor percent" min={0} max={100} value={draft.marginFloor.percent} disabled={!canEdit} onChange={(v) => set("marginFloor", { ...draft.marginFloor, percent: v ?? 0 })} className="w-full" />
              </TruckingField>
              <TruckingField label="and at least (CZK)">
                <InputNumber
                  aria-label="Minimum margin in CZK"
                  min={0}
                  step={50}
                  value={draft.marginFloor.minAmountCzk}
                  disabled={!canEdit}
                  onChange={(v) => set("marginFloor", { ...draft.marginFloor, minAmountCzk: v ?? 0 })}
                  className="w-full"
                />
              </TruckingField>
            </div>
            <p className="mt-3 mb-0 text-[11px] text-slate-400">A price below both is flagged before it goes to the customer.</p>
          </SectionCard>
        </div>

        <SectionCard title={`${TERMS.transportOrder} e-mail`}>
          <div className="flex flex-col gap-3">
            <TruckingField label="Subject">
              <Input
                aria-label="Transport-order e-mail subject"
                value={draft.transportOrder.emailSubject}
                disabled={!canEdit}
                onChange={(e) => set("transportOrder", { ...draft.transportOrder, emailSubject: e.target.value })}
              />
            </TruckingField>
            <TruckingField label="Body" hint={`Placeholders filled in when the order is sent: ${TEXT_PLACEHOLDERS.join(", ")} — order reference, haulier name, trip date.`}>
              <Input.TextArea
                aria-label="Transport-order e-mail body"
                autoSize={{ minRows: 5, maxRows: 14 }}
                value={draft.transportOrder.emailBody}
                disabled={!canEdit}
                onChange={(e) => set("transportOrder", { ...draft.transportOrder, emailBody: e.target.value })}
              />
            </TruckingField>
          </div>
        </SectionCard>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="primary" onClick={handleSave} loading={isSaving} disabled={!dirty || problems.length > 0}>
              Save changes
            </Button>
            <Button onClick={handleDiscard} disabled={!dirty || isSaving}>
              Discard
            </Button>
            {dirty && !problems.length && <span className="text-xs text-amber-700">unsaved changes</span>}
            {problems.length > 0 && <span className="text-xs text-red-600">{problems.join(" · ")}</span>}
          </div>
        )}

        {/* Saved month by month with its own button, apart from the settings above. */}
        <FuelIndexSection canEdit={canEdit} />
      </div>
    </div>
  );
};
