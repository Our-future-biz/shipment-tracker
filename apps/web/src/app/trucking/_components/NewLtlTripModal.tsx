"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Modal, Radio, Select, Spin } from "antd";
import { StarFilled, WarningOutlined } from "@ant-design/icons";
import { apiErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { useHauliers, useRate, useTruckingSettings } from "@/hooks/useTrucking";
import type { LtlTripKind, PlanningLeg, TripCreateLtl } from "@/hooks/useTruckingConsignments";
import { TERMS } from "../_lib/glossary";
import { TRIP_KIND_LABEL, addLegsWarnings, emptyPriceForm, ltlTripRateRequest, priceInput, priceProblems, vehicleCapacity, type PriceForm } from "../_lib/planning";
import { formatMoney, formatQty, versionLabel } from "../_lib/tariffs";
import { HaulierIssueList } from "./HaulierIssueList";
import { TruckingField } from "./TruckingField";
import { TruckingPriceFields } from "./TruckingPriceFields";

const OTHER = "__other__";

interface NewLtlTripModalProps {
  kind: LtlTripKind;
  date: string;
  legs: PlanningLeg[];
  hubPostcode: string;
  onClose: () => void;
  /** Rejects to keep the dialog open (the caller reports the error). */
  onCreate: (req: TripCreateLtl) => Promise<unknown>;
}

// New trip from the ticked legs: the hauliers the buy tariffs offer for it — preferred lane (★)
// first, then cheapest; blocked ones apart with why — or another haulier (its tariff or an agreed
// price), the vehicle type, and what the trip would bring up (shown, never blocking).
export const NewLtlTripModal = ({ kind, date, legs, hubPostcode, onClose, onCreate }: NewLtlTripModalProps) => {
  const { rate, isRating, result, error } = useRate();
  const { settings } = useTruckingSettings();
  const { hauliers } = useHauliers();
  const [choice, setChoice] = useState<string | null>(null);
  const [otherHaulier, setOtherHaulier] = useState<string | null>(null);
  const [otherPrice, setOtherPrice] = useState<PriceForm>(emptyPriceForm);
  const [vehicle, setVehicle] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The candidates are priced once, when the dialog opens.
  useEffect(() => {
    rate(ltlTripRateRequest(kind, legs, hubPostcode, date)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const level = result?.results[0] ?? null;
  const candidates = useMemo(() => level?.buy ?? [], [level]);
  const excluded = level?.excluded ?? [];
  const picked = choice ?? candidates[0]?.ownerCustomerId ?? (result || error ? OTHER : null);
  const other = picked === OTHER;
  const haulierId = other ? otherHaulier : picked;
  const usable = hauliers.filter((h) => h.status !== "blocked");
  const vehicles = (settings?.vehicleTypes ?? []).filter((v) => v.active);
  const vehicleType = vehicles.find((v) => v.code === vehicle) ?? null;
  const haulier = hauliers.find((h) => h.customerId === haulierId) ?? null;
  const warnings = addLegsWarnings({ ldm: 0, kg: 0, palletPlaces: 0 }, legs, {
    capacity: vehicleCapacity(vehicles, vehicle),
    vehicleTailLift: vehicleType ? vehicleType.tailLift : null,
    haulierAdr: haulier ? haulier.adrCapable : null,
    tripDate: date,
  });
  const problems = [...(haulierId ? [] : [`Pick the ${TERMS.haulier.toLowerCase()}`]), ...(vehicle ? [] : [`Pick the ${TERMS.vehicleType.toLowerCase()}`]), ...(other ? priceProblems(otherPrice) : [])];

  const handleCreate = async () => {
    if (!haulierId || !vehicle) return;
    setBusy(true);
    try {
      await onCreate({ kind, date, haulierCustomerId: haulierId, vehicleTypeCode: vehicle, legIds: legs.map((l) => l.legId), price: other ? priceInput(otherPrice) : { source: "TARIFF" } });
      onClose();
    } catch {
      // Reported by the caller.
    } finally {
      setBusy(false);
    }
  };

  const total = (pick: (l: PlanningLeg) => number) => formatQty(legs.reduce((s, l) => s + pick(l), 0));

  return (
    <Modal open title={`New ${TRIP_KIND_LABEL[kind].toLowerCase()} · ${formatDate(date)}`} width={760} onCancel={busy ? undefined : onClose} maskClosable={false} footer={null} destroyOnHidden>
      <p className="mt-0 text-[13px] text-slate-600">
        {legs.length} {legs.length === 1 ? TERMS.leg.toLowerCase() : `${TERMS.leg.toLowerCase()}s`}: {legs.map((l) => l.consignmentRef).join(", ")} — {total((l) => l.palletPlaces)} pallet places, {total((l) => l.ldm)} {TERMS.ldm},{" "}
        {total((l) => l.weightKg)} kg. The trip&apos;s price is shared over its legs by the haulier&apos;s {TERMS.costSplit.toLowerCase()}.
      </p>

      {isRating && (
        <div className="flex justify-center py-6">
          <Spin />
        </div>
      )}
      {error && <Alert className="mb-3" type="warning" showIcon message={`The buy tariffs could not be read: ${apiErrorMessage(error)}. Another haulier can still be chosen.`} />}

      {(result || error) && (
        <Radio.Group className="flex w-full flex-col gap-2" value={picked} onChange={(e) => setChoice(e.target.value)}>
          {candidates.map((b, i) => (
            <Radio key={b.ownerCustomerId ?? i} value={b.ownerCustomerId} className="!m-0 rounded-lg border border-slate-200 px-3 py-2">
              <span className="flex flex-wrap items-baseline gap-x-2">
                {b.preferred && <StarFilled className="text-amber-500" aria-label="Preferred lane" />}
                <span className="font-semibold text-slate-800">{b.ownerName ?? TERMS.haulier}</span>
                <span className="tabular-nums">{formatMoney(b.total, b.currency)}</span>
                <span className="text-[12px] text-slate-500">
                  {b.tariffName} {versionLabel(b)}
                </span>
                {i === 0 && <span className="rounded bg-indigo-50 px-1.5 text-[11px] font-semibold text-indigo-600">Suggested</span>}
              </span>
            </Radio>
          ))}
          {result && !candidates.length && <div className="text-[13px] text-amber-700">No haulier has a buy tariff for this run — choose one below.</div>}
          <Radio value={OTHER} className="!m-0 rounded-lg border border-slate-200 px-3 py-2">
            <span className="font-semibold text-slate-800">Another haulier</span>
          </Radio>
        </Radio.Group>
      )}

      {excluded.length > 0 && (
        <div className="mt-3 rounded-lg border border-red-100 bg-red-50/50 px-3 py-2">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-red-700">Not offered — blocked</div>
          {excluded.map((x) => (
            <div key={x.customerId} className="py-1">
              <div className="text-[13px] font-semibold text-slate-700">{x.name}</div>
              <HaulierIssueList issues={x.issues} limit={2} />
            </div>
          ))}
        </div>
      )}

      {other && (
        <div className="mt-3 flex flex-col gap-3">
          <TruckingField label={TERMS.haulier} hint="Blocked hauliers are not offered">
            <Select
              showSearch
              aria-label="Haulier"
              optionFilterProp="label"
              value={otherHaulier ?? undefined}
              options={usable.map((h) => ({ value: h.customerId, label: `${h.companyName}${h.status === "warning" ? " (warning)" : ""}` }))}
              onChange={setOtherHaulier}
            />
          </TruckingField>
          <TruckingPriceFields value={otherPrice} onChange={setOtherPrice} />
        </div>
      )}

      <div className="mt-3">
        <TruckingField label={TERMS.vehicleType} hint="Its capacity is what the fill is measured against">
          <Select
            aria-label={TERMS.vehicleType}
            value={vehicle ?? undefined}
            options={vehicles.map((v) => ({ value: v.code, label: `${v.label} · ${formatQty(v.capacityLdm)} ${TERMS.ldm} · ${formatQty(v.capacityKg)} kg${v.tailLift ? ` · ${TERMS.tailLift.toLowerCase()}` : ""}` }))}
            onChange={setVehicle}
          />
        </TruckingField>
      </div>

      {warnings.length > 0 && (
        <ul className="mb-0 mt-3 list-none rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-800" aria-label="Warnings">
          {warnings.map((w) => (
            <li key={w} className="flex gap-1.5">
              <WarningOutlined className="mt-[3px]" aria-hidden />
              {w}
            </li>
          ))}
          <li className="mt-1 text-[11px] text-amber-700">Warnings do not stop the trip.</li>
        </ul>
      )}

      {problems.length > 0 && (result || error) && (
        <div className="mt-3 text-[12px] text-amber-700">
          <span className="font-semibold">Still needed: </span>
          {problems.join(" · ")}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="primary" onClick={handleCreate} loading={busy} disabled={problems.length > 0 || isRating}>
          Create trip
        </Button>
      </div>
    </Modal>
  );
};
