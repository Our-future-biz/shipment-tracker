"use client";

import { useRef, useState } from "react";
import { Input, Button, Form, Upload } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { InfoRow } from "@/components/InfoRow";
import { SalesDialog } from "@/app/sales/_components/SalesDialog";
import type { SalesQuoteData } from "@/app/sales/_lib/types";
import { parseInquiry, type InquiryData } from "@/app/sales/_lib/parseInquiry";
import { api } from "@/lib/api";
import { GeoFlag } from "@/components/GeoSelect";

interface ImportInquiryModalProps {
  open: boolean;
  onClose: () => void;
  onApply: (patch: Partial<SalesQuoteData>) => void;
}

// Every field the parser can find in an inquiry, by the name the list of extracted fields
// gives it.
const FIELD_LABELS: Record<keyof InquiryData, string> = {
  customerName: "Customer",
  customerEmail: "Email",
  customerPhone: "Phone",
  customerContact: "Contact",
  direction: "Direction",
  serviceType: "Freight Mode",
  incoterm: "Incoterm",
  readyDate: "Ready date",
  origin: "Origin",
  destination: "Destination",
  commodity: "Commodity",
  weight: "Weight",
  cbm: "CBM",
};

export function ImportInquiryModal({ open, onClose, onApply }: ImportInquiryModalProps) {
  const [text, setText] = useState<string>("");
  const [parsed, setParsed] = useState<InquiryData | null>(null);
  const [parsing, setParsing] = useState(false);
  // Counts the texts the dialog has held. A place lookup that answers after the text changed or
  // the dialog closed belongs to a text no longer on screen, and its result is dropped.
  const textVersion = useRef(0);

  const reset = () => {
    textVersion.current += 1;
    setText("");
    setParsed(null);
    setParsing(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Another text, typed or uploaded: what was extracted belongs to the text before it and is
  // given up, so only fields of the text on screen can be applied.
  const changeText = (next: string) => {
    textVersion.current += 1;
    setText(next);
    setParsed(null);
    setParsing(false);
  };

  // Origin and destination are matched to the location database; what matches nothing stays
  // as written and is flagged.
  const handleParse = async () => {
    const version = textVersion.current;
    const result = parseInquiry(text);
    const keys = (["origin", "destination"] as const).filter((k) => result[k]);
    if (keys.length > 0) {
      setParsing(true);
      try {
        const { values } = await api.extraction.resolvePlaces({
          items: keys.map((k) => ({
            text: result[k]!,
            kind: "place",
            role: k === "origin" ? "origin: port or place the cargo leaves from" : "destination: port or place the cargo goes to",
          })),
        });
        keys.forEach((k, i) => {
          if (values[i]) result[k] = values[i]!;
        });
      } catch {
        // Unmatched values are kept and flagged.
      }
      if (version !== textVersion.current) return;
      setParsing(false);
    }
    setParsed(result);
  };

  const handleApply = () => {
    if (!parsed) return;
    onApply(parsed);
    reset();
    onClose();
  };

  const parsedEntries = parsed
    ? (Object.entries(parsed) as [keyof InquiryData, string | number][])
    : [];

  return (
    <SalesDialog
      open={open}
      onClose={handleClose}
      title="Import inquiry data"
      subtitle="Paste an inquiry email or upload a .txt file"
      footer={
        <>
          <Button onClick={handleClose}>Cancel</Button>
          {/* Nothing to apply until the text was parsed and gave at least one field. */}
          <Button type="primary" disabled={parsedEntries.length === 0} onClick={handleApply}>
            Apply to quote
          </Button>
        </>
      }
    >
      <Form layout="vertical">
        <Form.Item label="Inquiry text" className={parsed ? undefined : "!mb-0"}>
          <Input.TextArea
            rows={8}
            value={text}
            onChange={(e) => changeText(e.target.value)}
            placeholder="Paste the inquiry text here…"
          />
          <div className="mt-2 flex items-center gap-2">
            <Upload
              accept=".txt,text/plain"
              showUploadList={false}
              beforeUpload={(file) => {
                const reader = new FileReader();
                reader.onload = () => {
                  const content = reader.result;
                  if (typeof content === "string") changeText(content);
                };
                reader.readAsText(file);
                return false;
              }}
            >
              <Button size="small" icon={<UploadOutlined />}>
                Upload .txt
              </Button>
            </Upload>

            <Button size="small" type="primary" onClick={handleParse} loading={parsing} disabled={text.trim().length === 0}>
              Parse
            </Button>
          </div>
        </Form.Item>

        {parsed && (
          <Form.Item label="Extracted fields" className="!mb-0">
            {parsedEntries.length === 0 ? (
              <div className="text-[13px] text-slate-500">No fields could be extracted from the text.</div>
            ) : (
              // A long inquiry fills many fields: the list scrolls so that the buttons stay in reach.
              <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 px-3">
                {parsedEntries.map(([key, value]) => (
                  <InfoRow key={key} label={FIELD_LABELS[key]}>
                    {String(value)}
                    {(key === "origin" || key === "destination") && <GeoFlag kind="place" value={String(value ?? "")} />}
                  </InfoRow>
                ))}
              </div>
            )}
          </Form.Item>
        )}
      </Form>
    </SalesDialog>
  );
}
