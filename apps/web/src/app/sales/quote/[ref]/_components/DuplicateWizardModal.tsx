"use client";

import { useState } from "react";
import { Modal, Checkbox, Button } from "antd";
import type { SalesQuoteData } from "@/app/sales/_lib/types";
import { useSalesQuotes } from "@/hooks/useSalesQuotes";
import { useToast } from "@/lib/toast";

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
  shipment: ["direction", "serviceType", "incoterm", "readyDate", "transit"],
  routing: ["origin", "destination", "pickup", "delivery"],
  cargo: ["commodity", "stackable", "dangerous", "packages", "weight", "cbm"],
  pricing: ["buyingLines", "sellingLines", "currency"],
  terms: ["shippingTerms", "shippingIncludes", "shippingExcludes"],
};

// Pick only the fields of the checked sections from the source data.
function pickSections(
  source: SalesQuoteData,
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

export function DuplicateWizardModal({
  open,
  baseRef,
  data,
  onClose,
  onDone,
}: {
  open: boolean;
  baseRef: string;
  data: SalesQuoteData;
  onClose: () => void;
  onDone: (newRef: string) => void;
}) {
  const { duplicateQuote } = useSalesQuotes();
  const toast = useToast();

  const [checked, setChecked] = useState<SectionKey[]>(
    SECTIONS.map((s) => s.key),
  );
  const [creating, setCreating] = useState(false);

  const reset = () => {
    setChecked(SECTIONS.map((s) => s.key));
    setCreating(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const copiedData: SalesQuoteData = {
        ...pickSections(data, checked),
        // Always reset lifecycle fields on the duplicate.
        quoteStatus: "draft",
        winProbability: 10,
        timeline: [],
        sentAt: undefined,
        substatus: undefined,
        lostReason: undefined,
        lostComment: undefined,
      };
      const newRef = await duplicateQuote({ baseRef, data: copiedData });
      toast.success("Quote duplicated");
      reset();
      onDone(newRef);
    } catch {
      toast.error("Failed to duplicate quote");
      setCreating(false);
    }
  };

  return (
    <Modal
      open={open}
      width={560}
      title="Duplicate quote"
      onCancel={handleClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={handleClose} disabled={creating}>
            Cancel
          </Button>
          <Button type="primary" loading={creating} onClick={handleCreate}>
            Create duplicate
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-2 py-2">
        <span className="text-sm font-medium text-slate-700">
          Sections to copy into the duplicate
        </span>
        <Checkbox.Group
          value={checked}
          onChange={(values) => setChecked(values as SectionKey[])}
          className="flex flex-col gap-1"
        >
          {SECTIONS.map((section) => (
            <Checkbox key={section.key} value={section.key}>
              {section.label}
            </Checkbox>
          ))}
        </Checkbox.Group>
      </div>
    </Modal>
  );
}
