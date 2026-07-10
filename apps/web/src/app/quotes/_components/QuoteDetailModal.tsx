"use client";

import { useEffect, useState } from "react";
import { Modal, Tabs, Input, Select, Button, Tag, Tooltip } from "antd";
import { CopyOutlined, CheckOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import type { interfaces } from "@/lib/api/client";
import { useQuotes } from "@/hooks/useQuotes";
import { useShipments } from "@/hooks/useShipments";
import { useAuth } from "@/lib/auth/AuthContext";
import { useToast } from "@/lib/toast";
import { QUOTE_DROPDOWNS, QUOTE_TO_SHIPMENT_FIELD, quoteColType, quoteField } from "../_lib/quoteColumns";
import { QuoteCostSection } from "./QuoteCostSection";
import { QuoteDocumentsTab } from "./QuoteDocumentsTab";

const { TextArea } = Input;

const DETAIL_SECTIONS: { title: string; cols: string[] }[] = [
  { title: "Parties", cols: ["Shipper", "Consignee", "Agent", "Agent's PIC"] },
  { title: "Service", cols: ["Service", "Trade Direction", "Load Type", "Incoterm Origin", "Incoterm Destination"] },
  { title: "Route", cols: ["Cargo Origin", "Origin", "POL", "POD", "Destination"] },
  { title: "Cargo", cols: ["HS Code", "Cargo Description", "Volume", "Weight", "Number of pieces", "PCS"] },
  {
    title: "Containers",
    cols: ["CNTR count [1]", "CNTR length [1]", "CNTR count [2]", "CNTR length [2]", "CNTR count [3]", "CNTR length [3]", "CNTR count [4]", "CNTR length [4]"],
  },
];

const ALL_DETAIL_COLS = DETAIL_SECTIONS.flatMap((s) => s.cols);

function FieldControl({ label, value, onChange, onSave }: { label: string; value: string; onChange: (v: string) => void; onSave: (v: string) => void }) {
  const type = quoteColType(label);
  if (type === "dropdown") {
    return (
      <Select
        size="small"
        className="w-full"
        allowClear
        placeholder="—"
        value={value || undefined}
        onChange={(v) => onSave(v ?? "")}
        options={QUOTE_DROPDOWNS[label]!.map((o) => ({ value: o, label: o }))}
      />
    );
  }
  return (
    <Input
      size="small"
      type={type === "number" ? "number" : "text"}
      value={value}
      placeholder="—"
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => onSave(e.target.value)}
    />
  );
}

function DetailsTab({ quote }: { quote: interfaces.QuoteItem }) {
  const { updateQuote } = useQuotes();
  const toast = useToast();
  const [fields, setFields] = useState<Record<string, string>>(() =>
    Object.fromEntries(ALL_DETAIL_COLS.map((c) => [c, quoteField(quote.data, c)])),
  );

  useEffect(() => {
    setFields(Object.fromEntries(ALL_DETAIL_COLS.map((c) => [c, quoteField(quote.data, c)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote.id]);

  const setField = (label: string, value: string) => setFields((prev) => ({ ...prev, [label]: value }));

  const saveField = (label: string, value: string) => {
    const next = { ...fields, [label]: value };
    setFields(next);
    const base = quote.data && typeof quote.data === "object" ? (quote.data as Record<string, unknown>) : {};
    updateQuote({ quoteNumber: quote.quoteNumber, params: { data: { ...base, ...next } } }).catch(() => toast.error("Failed to save"));
  };

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-1">
      {DETAIL_SECTIONS.map((section) => (
        <div key={section.title} className="rounded-lg p-4 bg-slate-50">
          <h3 className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-3">{section.title}</h3>
          <div className="space-y-2">
            {section.cols.map((label) => (
              <div key={label} className="grid grid-cols-[110px_1fr] items-center gap-2">
                <span className="text-[11px] text-slate-500">{label}</span>
                <FieldControl label={label} value={fields[label] ?? ""} onChange={(v) => setField(label, v)} onSave={(v) => saveField(label, v)} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TermsTab({ quoteNumber, initial }: { quoteNumber: string; initial: string }) {
  const { updateQuote } = useQuotes();
  const toast = useToast();
  const [terms, setTerms] = useState(initial);
  useEffect(() => setTerms(initial), [quoteNumber, initial]);
  return (
    <div className="flex flex-col gap-3 p-1">
      <TextArea rows={14} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Enter terms and conditions for this quote..." className="text-xs" />
      <Button
        size="small"
        type="primary"
        className="self-start"
        onClick={() => updateQuote({ quoteNumber, params: { terms } }).then(() => toast.success("Terms saved")).catch(() => toast.error("Failed"))}
      >
        Save Terms
      </Button>
    </div>
  );
}

interface QuoteDetailModalProps {
  quoteNumber: string | null;
  onClose: () => void;
}

export function QuoteDetailModal({ quoteNumber, onClose }: QuoteDetailModalProps) {
  const { quotes } = useQuotes();
  const { shipments, createShipment, updateShipment } = useShipments();
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [booking, setBooking] = useState(false);
  const [copied, setCopied] = useState(false);

  const quote = quotes.find((q) => q.quoteNumber === quoteNumber);

  const handleBook = async () => {
    if (!quote) return;
    setBooking(true);
    try {
      let max = 0;
      for (const s of shipments) {
        const jn = s.jobNumber;
        if (jn?.startsWith("CZ") && !jn.startsWith("CZQ")) {
          const num = parseInt(jn.substring(2), 10);
          if (!isNaN(num) && num > max) max = num;
        }
      }
      const jobNumber = `CZ${String(max + 1).padStart(8, "0")}`;
      const now = new Date().toLocaleString("cs-CZ", { timeZone: "Europe/Prague" });
      const created = await createShipment({
        jobNumber,
        tradeDirection: quoteField(quote.data, "Trade Direction") || "Import",
        freightMode: "Sea Freight",
        department: "Operation Department",
        status: "Booking Confirmation Pending [IMP]",
        customsStatus: "Waiting For Commercial Paperwork",
        personInCharge: user?.email || "",
        createdBy: `${now} — ${user?.email || "System"} (from ${quote.quoteNumber})`,
      });
      const fields: Record<string, string> = {};
      for (const [label, apiField] of Object.entries(QUOTE_TO_SHIPMENT_FIELD)) {
        const val = quoteField(quote.data, label);
        if (val) fields[apiField] = val;
      }
      if (Object.keys(fields).length > 0) await updateShipment({ id: created.shipment.id, data: fields });
      toast.success(`Booked ${quote.quoteNumber} → ${jobNumber}`);
      onClose();
      router.push(`/shipments/${created.shipment.id}`);
    } catch {
      toast.error("Failed to book quote");
    } finally {
      setBooking(false);
    }
  };

  const copyNumber = () => {
    if (!quote) return;
    navigator.clipboard?.writeText(quote.quoteNumber).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const route = quote
    ? `${quoteField(quote.data, "POL") || "—"} → ${quoteField(quote.data, "POD") || "—"} → ${quoteField(quote.data, "Destination") || "—"}`
    : "";

  return (
    <Modal
      open={!!quoteNumber}
      onCancel={onClose}
      footer={null}
      width={1080}
      styles={{ body: { maxHeight: "78vh", overflowY: "auto" } }}
      title={
        quote && (
          <div className="flex items-center gap-3 pr-8">
            <span className="font-mono text-indigo-600 text-base">{quote.quoteNumber}</span>
            <Tooltip title="Copy quote number">
              <Button type="text" size="small" icon={copied ? <CheckOutlined /> : <CopyOutlined />} onClick={copyNumber} />
            </Tooltip>
            {quoteField(quote.data, "Service") && <Tag color="cyan">{quoteField(quote.data, "Service")}</Tag>}
            <span className="text-xs text-slate-400 font-normal">{route}</span>
            <Button size="small" type="primary" loading={booking} className="ml-auto" onClick={handleBook}>
              Book → Shipment
            </Button>
          </div>
        )
      }
    >
      {quote && (
        <Tabs
          size="small"
          destroyInactiveTabPane
          items={[
            { key: "details", label: "Details", children: <DetailsTab quote={quote} /> },
            { key: "costs", label: "Costs Breakdown", children: <QuoteCostSection quote={quote} /> },
            { key: "documents", label: "Documents", children: <QuoteDocumentsTab quoteNumber={quote.quoteNumber} /> },
            { key: "terms", label: "Terms", children: <TermsTab quoteNumber={quote.quoteNumber} initial={quote.terms ?? ""} /> },
          ]}
        />
      )}
    </Modal>
  );
}
