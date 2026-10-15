"use client";

import { useMemo, useState } from "react";
import { Alert, Button, Modal, Select } from "antd";
import { apiErrorMessage } from "@/lib/api";
import { useCustomerSites } from "@/hooks/useCustomerSites";
import { useHauliers } from "@/hooks/useTrucking";
import type { ConsignmentDetail, Leg, LegPartnerRequest } from "@/hooks/useTruckingConsignments";
import { formatPsc } from "../../_lib/hauliers";
import { TERMS } from "../../_lib/glossary";
import { depotSites, emptyPriceForm, priceInput, priceProblems, type PriceForm } from "../../_lib/planning";
import { formatMoney } from "../../_lib/tariffs";
import { TruckingField } from "../../_components/TruckingField";
import { TruckingPriceFields } from "../../_components/TruckingPriceFields";

const AT_HUB = "__hub__";

interface PartnerLegModalProps {
  c: ConsignmentDetail;
  leg: Leg;
  onClose: () => void;
  /** Rejects to keep the dialog open. */
  onSave: (req: LegPartnerRequest) => Promise<unknown>;
}

// The partner delivery of an LTL consignment: which partner haulier delivers it, from which of its
// depots (its Customer Database delivery sites, or it collects at our warehouse — then no line haul)
// and the price — the partner's buy tariff (scope LTL) per consignment, or agreed with a reason.
export const PartnerLegModal = ({ c, leg, onClose, onSave }: PartnerLegModalProps) => {
  const { hauliers } = useHauliers();
  const [haulierId, setHaulierId] = useState<string | null>(leg.haulierCustomerId ?? c.partnerHaulierCustomerId);
  const [depot, setDepot] = useState<string | null>(null);
  const [price, setPrice] = useState<PriceForm>(() =>
    leg.buy?.source === "MANUAL" ? { source: "MANUAL", total: leg.buy.total, currency: leg.buy.currency, reason: leg.buy.overrideReason ?? "" } : emptyPriceForm(),
  );
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const { sites, isLoading: sitesLoading } = useCustomerSites(haulierId ?? "");
  const depots = useMemo(() => depotSites(sites), [sites]);
  const partners = hauliers.filter((h) => h.status !== "blocked" || h.customerId === haulierId);
  const problems = [...(haulierId ? [] : ["Pick the partner haulier"]), ...(depot ? [] : ["Pick the depot"]), ...priceProblems(price)];

  const handleSave = async () => {
    if (!haulierId || !depot) return;
    setBusy(true);
    setRefusal(null);
    try {
      await onSave({ haulierCustomerId: haulierId, depotSiteId: depot === AT_HUB ? null : depot, price: priceInput(price) });
      onClose();
    } catch (e) {
      setRefusal(`Not saved — ${apiErrorMessage(e)}.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={`Partner delivery · ${c.ref}`} width={640} onCancel={busy ? undefined : onClose} maskClosable={false} footer={null} destroyOnHidden>
      <div className="flex flex-col gap-3">
        <p className="m-0 text-[13px] text-slate-600">
          {TERMS.partnerNetwork}: the partner delivers to {c.delivery.name}, {formatPsc(c.delivery.postcode)} {c.delivery.city}. From a depot other than our warehouse a {TERMS.lineHaul.toLowerCase()} takes the
          goods there first.
        </p>
        {leg.buy && (
          <div className="text-[12px] text-slate-500">
            Now: {formatMoney(leg.buy.total, leg.buy.currency)} ({leg.buy.source === "MANUAL" ? "agreed" : leg.buy.tariffName})
          </div>
        )}
        <TruckingField label="Partner haulier" hint="Blocked hauliers are not offered">
          <Select
            showSearch
            aria-label="Partner haulier"
            optionFilterProp="label"
            value={haulierId ?? undefined}
            options={partners.map((h) => ({ value: h.customerId, label: `${h.companyName}${h.status === "warning" ? " (warning)" : ""}` }))}
            onChange={(id) => {
              setHaulierId(id);
              setDepot(null);
            }}
          />
        </TruckingField>
        <TruckingField label="Depot" hint="The partner's delivery sites in the Customer Database">
          <Select
            aria-label="Depot"
            loading={sitesLoading}
            disabled={!haulierId}
            value={depot ?? undefined}
            placeholder={haulierId && !sitesLoading && !depots.length ? "No delivery site — add one in the Customer Database" : undefined}
            options={[
              { value: AT_HUB, label: "Collects at our warehouse (no line haul)" },
              ...depots.map((s) => ({ value: s.id, label: `${s.label} · ${s.country === "CZ" ? formatPsc(s.postcode) : s.postcode} ${s.city}` })),
            ]}
            onChange={setDepot}
          />
        </TruckingField>
        <TruckingField label="Price">
          <TruckingPriceFields value={price} onChange={setPrice} tariffLabel={`From the partner's ${TERMS.buyTariff.toLowerCase()} (${TERMS.ltl})`} />
        </TruckingField>
        {problems.length > 0 && (
          <div className="text-[12px] text-amber-700">
            <span className="font-semibold">Still needed: </span>
            {problems.join(" · ")}
          </div>
        )}
        {refusal && <Alert type="error" showIcon message={refusal} />}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="primary" onClick={handleSave} loading={busy} disabled={problems.length > 0}>
            Save partner delivery
          </Button>
        </div>
      </div>
    </Modal>
  );
};
