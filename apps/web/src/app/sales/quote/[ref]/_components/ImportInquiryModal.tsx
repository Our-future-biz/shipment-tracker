"use client";

import { useState } from "react";
import { Modal, Input, Button, Upload } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import type { SalesQuoteData } from "@/app/sales/_lib/types";
import { parseInquiry } from "@/app/sales/_lib/parseInquiry";

interface ImportInquiryModalProps {
  open: boolean;
  onClose: () => void;
  onApply: (patch: Partial<SalesQuoteData>) => void;
}

const FIELD_LABELS: Partial<Record<keyof SalesQuoteData, string>> = {
  reference: "Reference",
  method: "Method",
  customerId: "Customer ID",
  customerName: "Customer",
  customerEmail: "Email",
  customerPhone: "Phone",
  customerContact: "Contact",
  customerLabel: "Customer label",
  salesOwner: "Sales owner",
  direction: "Direction",
  serviceType: "Service type",
  incoterm: "Incoterm",
  readyDate: "Ready date",
  origin: "Origin",
  destination: "Destination",
  pickup: "Pickup",
  delivery: "Delivery",
  commodity: "Commodity",
  stackable: "Stackable",
  dangerous: "Dangerous",
  packages: "Packages",
  weight: "Weight",
  cbm: "CBM",
  buyingLines: "Buying lines",
  sellingLines: "Selling lines",
  currency: "Currency",
  shippingTerms: "Shipping terms",
  shippingIncludes: "Shipping includes",
  shippingExcludes: "Shipping excludes",
  quoteStatus: "Quote status",
  substatus: "Substatus",
  lostReason: "Lost reason",
  lostComment: "Lost comment",
  validityDays: "Validity days",
  winProbability: "Win probability",
  sentAt: "Sent at",
  timeline: "Timeline",
};

function labelFor(key: keyof SalesQuoteData): string {
  return FIELD_LABELS[key] ?? key;
}

function displayValue(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return `${value.length} item(s)`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function ImportInquiryModal({ open, onClose, onApply }: ImportInquiryModalProps) {
  const [text, setText] = useState<string>("");
  const [parsed, setParsed] = useState<Partial<SalesQuoteData> | null>(null);

  const reset = () => {
    setText("");
    setParsed(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleParse = () => {
    setParsed(parseInquiry(text));
  };

  const handleApply = () => {
    if (!parsed) return;
    onApply(parsed);
    reset();
    onClose();
  };

  const parsedEntries = parsed
    ? (Object.entries(parsed) as [keyof SalesQuoteData, unknown][])
    : [];

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      width={640}
      title="Import inquiry data"
      footer={[
        <Button key="cancel" onClick={handleClose}>
          Cancel
        </Button>,
        <Button
          key="apply"
          type="primary"
          disabled={!parsed}
          onClick={handleApply}
        >
          Apply to quote
        </Button>,
      ]}
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-gray-500">
          Paste an inquiry email or upload a .txt file
        </p>

        <Input.TextArea
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste the inquiry text here…"
        />

        <div className="flex items-center gap-2">
          <Upload
            accept=".txt,text/plain"
            showUploadList={false}
            beforeUpload={(file) => {
              const reader = new FileReader();
              reader.onload = () => {
                const content = reader.result;
                if (typeof content === "string") setText(content);
              };
              reader.readAsText(file);
              return false;
            }}
          >
            <Button icon={<UploadOutlined />}>Upload .txt</Button>
          </Upload>

          <Button type="primary" onClick={handleParse} disabled={text.trim().length === 0}>
            Parse
          </Button>
        </div>

        {parsed && (
          <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-3">
            <p className="mb-2 text-sm font-medium text-gray-700">
              Extracted fields
            </p>
            {parsedEntries.length === 0 ? (
              <p className="text-sm text-gray-500">
                No fields could be extracted from the text.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {parsedEntries.map(([key, value]) => (
                  <div key={key} className="flex gap-2 text-sm">
                    <span className="min-w-32 font-medium text-gray-600">
                      {labelFor(key)}:
                    </span>
                    <span className="text-gray-900">{displayValue(value)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
