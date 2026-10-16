"use client";

import { useMemo, useState } from "react";
import { Alert, Button, Input, InputNumber, Modal, Radio, Select } from "antd";
import { apiErrorMessage } from "@/lib/api";
import { useHauliers, type TariffCreate, type TariffSide } from "@/hooks/useTrucking";
import { TERMS } from "../_lib/glossary";
import { CURRENCIES } from "../_lib/hauliers";
import { INTERNAL_OWNER, SCOPE_LABELS, TARIFF_SIDES, ZONE_BY_LABELS, discountLabel, type TariffScope } from "../_lib/tariffs";
import { TruckingCustomerSelect } from "./TruckingCustomerSelect";
import { TruckingField } from "./TruckingField";

interface CreateDraft {
  side: TariffSide;
  scope: TariffScope;
  /** SELL only: the Standard list (no owner) or one customer's tariff. */
  standard: boolean;
  ownerCustomerId: string | null;
  ownerName: string | null;
  discount: boolean;
  discountPercent: number | null;
  currency: TariffCreate["currency"];
  zoneBy: TariffCreate["zoneBy"];
  name: string;
}

const draftFor = (side: TariffSide): CreateDraft => ({
  side,
  scope: "LTL",
  standard: true,
  ownerCustomerId: null,
  ownerName: null,
  discount: false,
  discountPercent: null,
  currency: "CZK",
  zoneBy: "DESTINATION",
  name: "",
});

/** A customer's own sell tariff to start from (the Customer Database's Trucking tab): an own matrix or a discount on Standard. */
export interface TariffCreatePreset {
  ownerCustomerId: string;
  ownerName: string;
  discount: boolean;
}

const presetDraft = (p: TariffCreatePreset): CreateDraft => ({
  ...draftFor("SELL"),
  standard: false,
  ownerCustomerId: p.ownerCustomerId,
  ownerName: p.ownerName,
  discount: p.discount,
});

const SCOPE_OPTIONS = (Object.keys(SCOPE_LABELS) as TariffScope[]).map((k) => ({ value: k, label: SCOPE_LABELS[k] }));
const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c, label: c }));

/** The name offered when none is typed: "ACME s.r.o. — LTL buy", "Standard — LTL sell". */
const suggestedName = (d: CreateDraft) => {
  const side = TARIFF_SIDES.find((s) => s.key === d.side)!.label.toLowerCase();
  const owner = d.side === "INTERNAL" ? INTERNAL_OWNER : d.side === "SELL" && d.standard ? "Standard" : (d.ownerName ?? "");
  return owner ? `${owner} — ${SCOPE_LABELS[d.scope]} ${side}` : "";
};

/** Why the tariff cannot be created yet. */
const createProblems = (d: CreateDraft): string[] => {
  const out: string[] = [];
  if (d.side === "BUY" && !d.ownerCustomerId) out.push(`Choose the ${TERMS.haulier.toLowerCase()}`);
  if (d.side === "SELL" && !d.standard && !d.ownerCustomerId) out.push("Choose the customer");
  if (d.discount && (d.discountPercent == null || d.discountPercent <= -100 || d.discountPercent >= 100)) out.push("Discount must be between −100 % and 100 %");
  if (!(d.name.trim() || suggestedName(d))) out.push("Name the tariff");
  return out;
};

interface TariffCreateModalProps {
  open: boolean;
  /** The side the Tariffs tab shows; the new tariff starts on it (render with `key={side}`). */
  side: TariffSide;
  onClose: () => void;
  create: (req: TariffCreate) => Promise<{ tariff: { id: string } }>;
  isCreating: boolean;
  onCreated: (tariffId: string) => void;
  /** Starts on a customer's own sell tariff instead of `side` (render with a `key` per preset). */
  preset?: TariffCreatePreset;
}

// New tariff (manager): its side, scope and owner — a haulier for a buy tariff, a customer or the
// Standard list for a sell tariff, nobody for the internal one — and how it prices. Its prices
// come later, as versions.
export const TariffCreateModal = ({ open, side, onClose, create, isCreating, onCreated, preset }: TariffCreateModalProps) => {
  const initialDraft = () => (preset ? presetDraft(preset) : draftFor(side));
  const [draft, setDraft] = useState<CreateDraft>(initialDraft);
  const [refusal, setRefusal] = useState<string | null>(null);
  const { hauliers } = useHauliers();
  const problems = createProblems(draft);
  const set = <K extends keyof CreateDraft>(key: K, value: CreateDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const haulierOptions = useMemo(
    () => hauliers.map((h) => ({ value: h.customerId, label: h.status === "blocked" ? `${h.companyName} (blocked)` : h.companyName, name: h.companyName })),
    [hauliers],
  );
  const isCustomerTariff = draft.side === "SELL" && !draft.standard;

  const handleSideChange = (next: TariffSide) => setDraft((d) => ({ ...draftFor(next), scope: d.scope, currency: d.currency }));

  const handleCreate = async () => {
    setRefusal(null);
    const discount = isCustomerTariff && draft.discount;
    try {
      const res = await create({
        side: draft.side,
        scope: draft.scope,
        mode: discount ? "DISCOUNT" : "MATRIX",
        name: draft.name.trim() || suggestedName(draft),
        ownerCustomerId: draft.side === "INTERNAL" || (draft.side === "SELL" && draft.standard) ? null : draft.ownerCustomerId,
        currency: draft.currency,
        zoneBy: draft.zoneBy,
        discountPercent: discount ? draft.discountPercent : null,
      });
      onCreated(res.tariff.id);
    } catch (e) {
      setRefusal(`The tariff was not created — ${apiErrorMessage(e)}.`);
    }
  };

  return (
    <Modal
      open={open}
      title="New tariff"
      onCancel={isCreating ? undefined : onClose}
      footer={null}
      width={560}
      destroyOnHidden
      afterClose={() => {
        setDraft(initialDraft());
        setRefusal(null);
      }}
    >
      <div className="flex flex-col gap-3">
        <TruckingField label="Side">
          <Radio.Group
            aria-label="Side"
            optionType="button"
            value={draft.side}
            options={TARIFF_SIDES.map((s) => ({ value: s.key, label: s.label, title: s.hint }))}
            onChange={(e) => handleSideChange(e.target.value)}
          />
        </TruckingField>

        <div className="grid grid-cols-2 gap-3">
          <TruckingField label="Scope">
            <Select aria-label="Scope" value={draft.scope} options={SCOPE_OPTIONS} onChange={(v) => set("scope", v)} />
          </TruckingField>
          <TruckingField label="Currency">
            <Select aria-label="Currency" value={draft.currency} options={CURRENCY_OPTIONS} onChange={(v) => set("currency", v)} />
          </TruckingField>
        </div>

        {draft.side === "BUY" && (
          <TruckingField label={TERMS.haulier}>
            <Select
              showSearch
              aria-label="Haulier"
              placeholder="Choose the haulier"
              value={draft.ownerCustomerId ?? undefined}
              options={haulierOptions}
              optionFilterProp="label"
              onChange={(id: string, option) => setDraft((d) => ({ ...d, ownerCustomerId: id, ownerName: (option as { name?: string }).name ?? null }))}
            />
          </TruckingField>
        )}

        {draft.side === "SELL" && (
          <>
            <TruckingField label="For">
              <Radio.Group
                aria-label="Sell tariff for"
                value={draft.standard ? "standard" : "customer"}
                options={[
                  { value: "standard", label: "Standard list (every customer without their own)" },
                  { value: "customer", label: "One customer" },
                ]}
                onChange={(e) => setDraft((d) => ({ ...d, standard: e.target.value === "standard", ownerCustomerId: null, ownerName: null, discount: false }))}
              />
            </TruckingField>
            {isCustomerTariff && (
              <>
                <TruckingField label="Customer">
                  <TruckingCustomerSelect
                    ariaLabel="Customer"
                    value={draft.ownerCustomerId}
                    valueName={draft.ownerName}
                    onChange={(id, name) => setDraft((d) => ({ ...d, ownerCustomerId: id, ownerName: name }))}
                  />
                </TruckingField>
                <TruckingField label="Prices">
                  <Radio.Group
                    aria-label="How the customer's prices are set"
                    value={draft.discount ? "discount" : "matrix"}
                    options={[
                      { value: "matrix", label: "Own price matrix" },
                      { value: "discount", label: "Discount on the Standard list" },
                    ]}
                    onChange={(e) => set("discount", e.target.value === "discount")}
                  />
                </TruckingField>
                {draft.discount && (
                  <TruckingField
                    label="Discount (%)"
                    hint={draft.discountPercent != null ? `Prices read ${discountLabel(draft.discountPercent)}. A negative discount is an uplift.` : "A negative discount is an uplift."}
                  >
                    <InputNumber aria-label="Discount percent" min={-99.9} max={99.9} step={0.5} value={draft.discountPercent} onChange={(v) => set("discountPercent", v ?? null)} className="w-full" />
                  </TruckingField>
                )}
              </>
            )}
          </>
        )}

        <TruckingField label={`${TERMS.zone} taken from`} hint="Pick-up postcode suits pick-up runs; delivery postcode suits everything else.">
          <Radio.Group
            aria-label="Zone taken from"
            value={draft.zoneBy}
            options={(Object.keys(ZONE_BY_LABELS) as TariffCreate["zoneBy"][]).map((k) => ({ value: k, label: ZONE_BY_LABELS[k] }))}
            onChange={(e) => set("zoneBy", e.target.value)}
          />
        </TruckingField>

        <TruckingField label="Name">
          <Input aria-label="Tariff name" value={draft.name} placeholder={suggestedName(draft) || "Name of the tariff"} maxLength={120} onChange={(e) => set("name", e.target.value)} />
        </TruckingField>

        {refusal && <Alert type="error" showIcon message={refusal} />}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 mt-5">
        {problems.length > 0 && <span className="mr-auto text-xs text-slate-500">{problems.join(" · ")}</span>}
        <Button onClick={onClose} disabled={isCreating}>
          Cancel
        </Button>
        <Button type="primary" onClick={handleCreate} loading={isCreating} disabled={problems.length > 0}>
          Create tariff
        </Button>
      </div>
    </Modal>
  );
};
