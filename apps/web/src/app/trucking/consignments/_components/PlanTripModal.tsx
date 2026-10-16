"use client";

import { useMemo, useState } from "react";
import { Alert, Button, Input, InputNumber, Modal, Radio, Select, Spin } from "antd";
import { StarFilled } from "@ant-design/icons";
import { apiErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { useHauliers, useRateQuery, useTruckingSettings, type RateRequest } from "@/hooks/useTrucking";
import type { ConsignmentDetail, TripCreateFtl } from "@/hooks/useTruckingConsignments";
import { CURRENCIES, formatPsc } from "../../_lib/hauliers";
import { TERMS } from "../../_lib/glossary";
import { formatMoney, versionLabel } from "../../_lib/tariffs";
import { HaulierIssueList } from "../../_components/HaulierIssueList";
import { TruckingField } from "../../_components/TruckingField";

/** The lane of a consignment as the rate engine prices it: FTL, its level, buy side only. */
export const planRateRequest = (c: ConsignmentDetail): RateRequest => ({
  fromPostcode: c.pickup.postcode,
  toPostcode: c.delivery.postcode,
  pickupDate: c.pickupDate,
  pickupTime: null,
  scope: "FTL",
  pieces: c.load.pieces,
  palletPlaces: c.load.palletPlaces,
  ldm: c.load.ldm,
  weightKg: c.load.weightKg,
  cbm: c.load.cbm,
  extras: {
    adr: c.load.adr,
    tailLift: c.load.tailLift,
    avizace: c.pickup.avizaceRequired || c.delivery.avizaceRequired,
    timeWindow: !!(c.pickup.windowFrom || c.pickup.windowTo || c.delivery.windowFrom || c.delivery.windowTo),
    b2c: c.load.b2c,
    nonStackable: c.load.nonStackable,
    waitingHours: 0,
    declaredValueCzk: null,
  },
  customerId: c.customerId,
  serviceLevels: c.serviceLevel ? [c.serviceLevel] : null,
  includeBuy: true,
  includeInternal: false,
});

const AGREED = "__agreed__";

interface PlanTripModalProps {
  c: ConsignmentDetail;
  onClose: () => void;
  /** Rejects to keep the dialog open (the caller reports the error). */
  onPlan: (req: Omit<TripCreateFtl, "consignmentId">) => Promise<unknown>;
}

// Plan trip: the hauliers the buy tariffs offer for this lane — preferred lane (★) first, then
// cheapest; blocked ones shown apart with why — or another haulier at an agreed price. The
// suggested haulier is the first; choosing another is logged on the trip.
export const PlanTripModal = ({ c, onClose, onPlan }: PlanTripModalProps) => {
  // The candidates are priced once per opening (the dialog mounts per opening).
  const [round] = useState(() => Date.now());
  const [request] = useState(() => planRateRequest(c));
  const { isRating, result, error } = useRateQuery(request, round);
  const { settings } = useTruckingSettings();
  const { hauliers } = useHauliers();
  const [choice, setChoice] = useState<string | null>(null);
  const [agreedHaulier, setAgreedHaulier] = useState<string | null>(null);
  const [agreedTotal, setAgreedTotal] = useState<number | null>(null);
  const [agreedCurrency, setAgreedCurrency] = useState<"CZK" | "EUR">("CZK");
  const [agreedReason, setAgreedReason] = useState("");
  const [vehicle, setVehicle] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const level = result?.results[0] ?? null;
  const candidates = useMemo(() => level?.buy ?? [], [level]);
  const excluded = level?.excluded ?? [];
  const picked = choice ?? (candidates[0]?.ownerCustomerId ?? (result ? AGREED : null));
  const agreed = picked === AGREED;
  const usable = hauliers.filter((h) => h.status !== "blocked");
  const vehicles = (settings?.vehicleTypes ?? []).filter((v) => v.active);

  const ready = agreed ? !!agreedHaulier && (agreedTotal ?? 0) > 0 && agreedReason.trim().length >= 3 : !!picked;

  const handleOk = async () => {
    setBusy(true);
    try {
      if (agreed) {
        await onPlan({ haulierCustomerId: agreedHaulier, vehicleTypeCode: vehicle, price: { source: "MANUAL", total: agreedTotal ?? 0, currency: agreedCurrency, reason: agreedReason.trim() } });
      } else {
        // The engine's first candidate is sent as null: the server takes its own suggestion.
        const first = candidates[0]?.ownerCustomerId ?? null;
        await onPlan({ haulierCustomerId: picked === first ? null : picked, vehicleTypeCode: vehicle, price: { source: "TARIFF" } });
      }
      onClose();
    } catch {
      // Reported by the caller.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={`Plan trip · ${c.ref}`} width={760} onCancel={onClose} maskClosable={false} footer={null} destroyOnHidden>
      <p className="mt-0 text-[13px] text-slate-600">
        {TERMS.ftl} {formatPsc(c.pickup.postcode)} {c.pickup.city} → {formatPsc(c.delivery.postcode)} {c.delivery.city}, pick-up {formatDate(c.pickupDate)}. One consignment on one trip; the
        haulier gets a {TERMS.transportOrder.toLowerCase()} next.
      </p>

      {isRating && (
        <div className="flex justify-center py-6">
          <Spin />
        </div>
      )}
      {error && <Alert className="mb-3" type="warning" showIcon message={`The buy tariffs could not be read: ${apiErrorMessage(error)}. A haulier can still be planned at an agreed price.`} />}

      {result && (
        <Radio.Group className="flex w-full flex-col gap-2" value={picked} onChange={(e) => setChoice(e.target.value)}>
          {candidates.map((b, i) => (
            <Radio key={b.ownerCustomerId ?? i} value={b.ownerCustomerId} className="!m-0 rounded-lg border border-slate-200 px-3 py-2">
              <span className="flex flex-wrap items-baseline gap-x-2">
                {b.preferred && <StarFilled className="text-amber-500" aria-label="Preferred lane" />}
                <span className="font-semibold text-slate-800">{b.ownerName ?? "Haulier"}</span>
                <span className="tabular-nums">{formatMoney(b.total, b.currency)}</span>
                {b.currency !== "CZK" && <span className="text-[12px] text-slate-500">({formatMoney(b.totalCzk, "CZK")})</span>}
                <span className="text-[12px] text-slate-500">
                  {b.tariffName} {versionLabel(b)}
                </span>
                {i === 0 && <span className="rounded bg-indigo-50 px-1.5 text-[11px] font-semibold text-indigo-600">Suggested</span>}
              </span>
            </Radio>
          ))}
          {!candidates.length && <div className="text-[13px] text-amber-700">No haulier has a buy tariff for this lane — plan it at an agreed price.</div>}
          <Radio value={AGREED} className="!m-0 rounded-lg border border-slate-200 px-3 py-2">
            <span className="font-semibold text-slate-800">Another haulier at an agreed price</span>
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

      {agreed && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TruckingField label={TERMS.haulier} hint="Blocked hauliers are not offered">
            <Select
              showSearch
              aria-label="Haulier"
              optionFilterProp="label"
              value={agreedHaulier ?? undefined}
              options={usable.map((h) => ({ value: h.customerId, label: `${h.companyName}${h.status === "warning" ? " (warning)" : ""}` }))}
              onChange={setAgreedHaulier}
            />
          </TruckingField>
          <div className="grid grid-cols-[1fr_96px] gap-2">
            <TruckingField label="Agreed price">
              <InputNumber aria-label="Agreed price" className="w-full" min={0} value={agreedTotal} onChange={setAgreedTotal} />
            </TruckingField>
            <TruckingField label="Currency">
              <Select aria-label="Currency" value={agreedCurrency} options={CURRENCIES.map((x) => ({ value: x, label: x }))} onChange={setAgreedCurrency} />
            </TruckingField>
          </div>
          <div className="sm:col-span-2">
            <TruckingField label="Why not the tariff">
              <Input aria-label="Why not the tariff" maxLength={300} value={agreedReason} onChange={(e) => setAgreedReason(e.target.value)} />
            </TruckingField>
          </div>
        </div>
      )}

      <div className="mt-3">
        <TruckingField label={TERMS.vehicleType}>
          <Select allowClear aria-label={TERMS.vehicleType} placeholder="Any" value={vehicle ?? undefined} options={vehicles.map((v) => ({ value: v.code, label: v.label }))} onChange={(v) => setVehicle(v ?? null)} />
        </TruckingField>
      </div>

      {!agreed && picked && candidates.length > 0 && picked !== candidates[0]?.ownerCustomerId && (
        <div className="mt-2 text-[12px] text-slate-500">Not the suggested haulier — the change is logged on the trip.</div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="primary" onClick={handleOk} loading={busy} disabled={!ready || isRating}>
          Plan trip
        </Button>
      </div>
    </Modal>
  );
};
