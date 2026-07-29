"use client";

import { useState, useMemo } from "react";
import { Modal, Select, Checkbox, Button } from "antd";
import type { SalesQuoteData } from "@/app/sales/_lib/types";
import { useSalesQuotes } from "@/hooks/useSalesQuotes";
import { useShipments } from "@/hooks/useShipments";

type SectionKey =
  | "customer"
  | "shipment"
  | "routing"
  | "cargo"
  | "pricing"
  | "terms";

interface Section {
  key: SectionKey;
  label: string;
}

const SECTIONS: Section[] = [
  { key: "customer", label: "Customer" },
  { key: "shipment", label: "Shipment details" },
  { key: "routing", label: "Routing" },
  { key: "cargo", label: "Cargo" },
  { key: "pricing", label: "Pricing" },
  { key: "terms", label: "Shipping terms" },
];

// Fields that belong to each section of a SalesQuoteData record.
const SECTION_FIELDS: Record<SectionKey, (keyof SalesQuoteData)[]> = {
  customer: [
    "customerName",
    "customerId",
    "customerContact",
    "customerEmail",
    "customerPhone",
    "customerLabel",
    "salesOwner",
  ],
  shipment: ["direction", "serviceType", "incoterm", "readyDate"],
  routing: ["origin", "destination", "pickup", "delivery"],
  cargo: ["commodity", "stackable", "dangerous", "packages", "weight", "cbm"],
  pricing: ["buyingLines", "sellingLines", "currency"],
  terms: ["shippingTerms", "shippingIncludes", "shippingExcludes"],
};

// Sections that can be sourced from a shipment (shipments carry no pricing/terms).
const SHIPMENT_SECTIONS: Section[] = SECTIONS.filter(
  (s) => s.key !== "pricing" && s.key !== "terms",
);

function serviceTypeFromFreightMode(mode: string): string | undefined {
  switch (mode.toUpperCase()) {
    case "AIR":
      return "Air";
    case "SEA":
      return "Sea FCL";
    case "ROAD":
      return "Road";
    case "RAIL":
      return "Rail";
    default:
      return undefined;
  }
}

// Pick only the fields of the checked sections from a source SalesQuoteData.
function pickSections(
  source: Partial<SalesQuoteData>,
  checked: SectionKey[],
): Partial<SalesQuoteData> {
  const patch: Partial<SalesQuoteData> = {};
  for (const section of checked) {
    for (const field of SECTION_FIELDS[section]) {
      const value = source[field];
      if (value === undefined) continue;
      // Assign field-by-field; each key maps to its own value type in SalesQuoteData.
      (patch as Record<string, unknown>)[field] = value;
    }
  }
  return patch;
}

export function CopyFromModal({
  open,
  mode,
  currentRef,
  onClose,
  onApply,
}: {
  open: boolean;
  mode: "quote" | "shipment";
  currentRef: string;
  onClose: () => void;
  onApply: (patch: Partial<SalesQuoteData>) => void;
}) {
  const { salesQuotes } = useSalesQuotes();
  const { shipments } = useShipments();

  const [sourceRef, setSourceRef] = useState<string | undefined>(undefined);
  const [checked, setChecked] = useState<SectionKey[]>(
    SECTIONS.map((s) => s.key),
  );

  const availableSections = mode === "quote" ? SECTIONS : SHIPMENT_SECTIONS;

  const quoteOptions = useMemo(
    () =>
      salesQuotes
        .filter((q) => q.quoteNumber !== currentRef)
        .map((q) => ({
          value: q.quoteNumber,
          label: `${q.quoteNumber} — ${q.data.customerName ?? ""}`,
        })),
    [salesQuotes, currentRef],
  );

  const shipmentOptions = useMemo(
    () =>
      shipments.map((s) => ({
        value: s.jobNumber,
        label: `${s.jobNumber} — ${s.customer}`,
      })),
    [shipments],
  );

  // The source data mapped into a Partial<SalesQuoteData>, or null when nothing picked.
  const sourceData = useMemo<Partial<SalesQuoteData> | null>(() => {
    if (!sourceRef) return null;
    if (mode === "quote") {
      const quote = salesQuotes.find((q) => q.quoteNumber === sourceRef);
      return quote ? quote.data : null;
    }
    const shipment = shipments.find((s) => s.jobNumber === sourceRef);
    if (!shipment) return null;
    return {
      customerName: shipment.customer,
      origin: shipment.pol,
      destination: shipment.pod,
      direction: shipment.tradeDirection === "IMPORT" ? "Import" : "Export",
      serviceType: serviceTypeFromFreightMode(shipment.freightMode),
    };
  }, [sourceRef, mode, salesQuotes, shipments]);

  const reset = () => {
    setSourceRef(undefined);
    setChecked(SECTIONS.map((s) => s.key));
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleCopy = () => {
    if (!sourceData) return;
    // Only apply checked sections that make sense for the current mode.
    const applicable = checked.filter((c) =>
      availableSections.some((s) => s.key === c),
    );
    const patch = pickSections(sourceData, applicable);
    onApply(patch);
    reset();
    onClose();
  };

  return (
    <Modal
      open={open}
      width={640}
      onCancel={handleClose}
      title={
        mode === "quote" ? "Copy from another quote" : "Copy from a shipment"
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={handleClose}>Cancel</Button>
          <Button type="primary" disabled={!sourceData} onClick={handleCopy}>
            Copy selected
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 py-2">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">
            {mode === "quote" ? "Source quote" : "Source shipment"}
          </span>
          <Select
            showSearch
            className="w-full"
            placeholder={
              mode === "quote" ? "Select a quote" : "Select a shipment"
            }
            value={sourceRef}
            onChange={(value: string) => setSourceRef(value)}
            options={mode === "quote" ? quoteOptions : shipmentOptions}
            optionFilterProp="label"
          />
          {mode === "shipment" && (
            <span className="text-xs text-slate-500">
              Pricing is not copied from shipments.
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-700">
            Sections to copy
          </span>
          <Checkbox.Group
            value={checked}
            onChange={(values) => setChecked(values as SectionKey[])}
            className="flex flex-col gap-1"
          >
            {availableSections.map((section) => (
              <Checkbox key={section.key} value={section.key}>
                {section.label}
              </Checkbox>
            ))}
          </Checkbox.Group>
        </div>
      </div>
    </Modal>
  );
}
