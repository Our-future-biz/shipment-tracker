"use client";

import { useState } from "react";
import { Alert, Button, Input, Select } from "antd";
import { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useTruckingSettings } from "@/hooks/useTrucking";
import { useTrip, type TripDetail, type TripUpdate } from "@/hooks/useTruckingConsignments";
import { TERMS } from "../../_lib/glossary";
import { TRIP_CONFLICT_TEXT, followRecord, isVersionConflict, type HeldDraft } from "../../_lib/saveConflict";
import { TruckingField } from "../../_components/TruckingField";
import { limitCzechPhone } from "@/lib/phone";

type VehicleDraft = Omit<TripUpdate, "version">;

const draftOf = (t: TripDetail): VehicleDraft => ({
  vehicleTypeCode: t.vehicleTypeCode,
  tractorPlate: t.tractorPlate,
  trailerPlate: t.trailerPlate,
  driverName: t.driverName,
  driverPhone: t.driverPhone,
});
const heldOf = (t: TripDetail): HeldDraft<VehicleDraft> => ({ draft: draftOf(t), version: t.version });
const same = (a: VehicleDraft, b: VehicleDraft) => JSON.stringify(a) === JSON.stringify(b);
/** A plate as the server keeps it: upper case, no spaces. */
const plate = (v: string) => v.toUpperCase().replace(/\s/g, "");

interface TripVehicleFormProps {
  trip: TripDetail;
  readOnly: boolean;
}

// The truck and driver the haulier sends. The tractor plate goes to the job (Shipments) once set.
// A save carries the version the draft was started from: typed over a newer trip, it is refused.
export const TripVehicleForm = ({ trip, readOnly }: TripVehicleFormProps) => {
  const toast = useToast();
  const { settings } = useTruckingSettings();
  const { save, isSaving, reload } = useTrip(trip.id);
  const [held, setHeld] = useState<HeldDraft<VehicleDraft>>(() => heldOf(trip));
  const [conflict, setConflict] = useState(false);
  // A newer trip replaces the draft only while nothing is typed here (followRecord).
  const [seen, setSeen] = useState(trip);
  if (trip !== seen) {
    setSeen(trip);
    setHeld(followRecord(held, heldOf(seen), heldOf(trip)));
  }
  const draft = held.draft;
  const dirty = !same(draft, draftOf(trip));
  const set = <K extends keyof VehicleDraft>(key: K, value: VehicleDraft[K]) => setHeld((h) => ({ ...h, draft: { ...h.draft, [key]: value } }));
  const vehicles = (settings?.vehicleTypes ?? []).filter((v) => v.active || v.code === draft.vehicleTypeCode);

  const handleSave = async () => {
    try {
      const res = await save({ ...draft, version: held.version });
      setHeld(heldOf(res.trip));
      setConflict(false);
      toast.success("Vehicle and driver saved");
    } catch (e) {
      if (isVersionConflict(e)) setConflict(true);
      else toast.error(`Could not save: ${apiErrorMessage(e)}`);
    }
  };
  const handleReload = async () => {
    const res = await reload();
    if (!res.data) return;
    setHeld(heldOf(res.data.trip));
    setConflict(false);
  };
  const handleDiscard = () => {
    setHeld(heldOf(trip));
    setConflict(false);
  };

  return (
    <div className="flex flex-col gap-3">
      {conflict && (
        <Alert
          type="error"
          showIcon
          message={TRIP_CONFLICT_TEXT}
          action={
            <Button size="small" onClick={handleReload}>
              Reload
            </Button>
          }
        />
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <TruckingField label={TERMS.vehicleType}>
          <Select
            allowClear
            aria-label={TERMS.vehicleType}
            disabled={readOnly}
            value={draft.vehicleTypeCode ?? undefined}
            options={vehicles.map((v) => ({ value: v.code, label: v.label }))}
            onChange={(v) => set("vehicleTypeCode", v ?? null)}
          />
        </TruckingField>
        <TruckingField label="Tractor plate">
          <Input aria-label="Tractor plate" disabled={readOnly} className="tabular-nums" value={draft.tractorPlate} onChange={(e) => set("tractorPlate", plate(e.target.value))} />
        </TruckingField>
        <TruckingField label="Trailer plate">
          <Input aria-label="Trailer plate" disabled={readOnly} className="tabular-nums" value={draft.trailerPlate} onChange={(e) => set("trailerPlate", plate(e.target.value))} />
        </TruckingField>
        <TruckingField label="Driver">
          <Input aria-label="Driver" disabled={readOnly} value={draft.driverName} onChange={(e) => set("driverName", e.target.value)} />
        </TruckingField>
        <TruckingField label="Driver phone">
          <Input aria-label="Driver phone" disabled={readOnly} inputMode="tel" value={draft.driverPhone} onChange={(e) => set("driverPhone", limitCzechPhone(e.target.value))} />
        </TruckingField>
      </div>
      {!readOnly && (
        <div className="flex justify-end gap-2">
          {dirty && <Button onClick={handleDiscard}>Discard</Button>}
          <Button type="primary" disabled={!dirty} loading={isSaving} onClick={handleSave}>
            Save vehicle
          </Button>
        </div>
      )}
    </div>
  );
};
