"use client";

import { useState } from "react";
import { Modal, Radio, Select, Checkbox, Button, Tag } from "antd";
import { useQuotes } from "@/hooks/useQuotes";
import { useToast } from "@/lib/toast";
import { COPYABLE_FIELDS, nextQuoteNumber, quoteField } from "../_lib/quoteColumns";

interface NewQuoteModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (quoteNumber: string) => void;
}

export function NewQuoteModal({ open, onClose, onCreated }: NewQuoteModalProps) {
  const { quotes, createQuote, updateQuote, isCreating } = useQuotes();
  const toast = useToast();
  const [mode, setMode] = useState<"blank" | "copy">("blank");
  const [sourceQuote, setSourceQuote] = useState<string>("");
  const [fields, setFields] = useState<string[]>(COPYABLE_FIELDS);

  const quoteNumber = nextQuoteNumber(quotes.map((q) => q.quoteNumber));

  const reset = () => {
    setMode("blank");
    setSourceQuote("");
    setFields(COPYABLE_FIELDS);
  };

  const handleCreate = async () => {
    try {
      await createQuote({ quoteNumber });
      if (mode === "copy" && sourceQuote) {
        const source = quotes.find((q) => q.quoteNumber === sourceQuote);
        if (source) {
          const data: Record<string, string> = {};
          for (const label of fields) {
            const val = quoteField(source.data, label);
            if (val) data[label] = val;
          }
          if (Object.keys(data).length > 0) await updateQuote({ quoteNumber, params: { data } });
        }
      }
      toast.success(`Quote ${quoteNumber} created`);
      reset();
      onCreated(quoteNumber);
    } catch {
      toast.error("Failed to create quote");
    }
  };

  return (
    <Modal
      open={open}
      onCancel={() => { reset(); onClose(); }}
      title="New Quote"
      width={520}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button type="primary" loading={isCreating} disabled={mode === "copy" && !sourceQuote} onClick={handleCreate}>
            Create
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">New number:</span>
          <Tag color="cyan" className="font-mono">{quoteNumber}</Tag>
        </div>

        <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
          <Radio value="blank">Blank quote</Radio>
          <Radio value="copy">Copy from existing</Radio>
        </Radio.Group>

        {mode === "copy" && (
          <div className="space-y-3">
            <Select
              showSearch
              className="w-full"
              placeholder="Select source quote…"
              value={sourceQuote || undefined}
              onChange={setSourceQuote}
              filterOption={(input, option) => (option?.value ?? "").toLowerCase().includes(input.toLowerCase())}
              options={quotes.map((q) => ({ value: q.quoteNumber, label: `${q.quoteNumber} — ${quoteField(q.data, "Shipper") || quoteField(q.data, "Consignee") || ""}` }))}
            />
            <div>
              <div className="text-xs text-slate-500 mb-1.5">Fields to copy:</div>
              <Checkbox.Group value={fields} onChange={(v) => setFields(v as string[])} className="grid grid-cols-2 gap-y-1">
                {COPYABLE_FIELDS.map((f) => (
                  <Checkbox key={f} value={f} className="!text-xs">{f}</Checkbox>
                ))}
              </Checkbox.Group>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
