"use client";

import { useState } from "react";
import { Checkbox, Button, Form, Radio } from "antd";
import type { SalesQuoteData } from "@/app/sales/_lib/types";
import type { SalesQuote } from "@/app/sales/_lib/salesQuote";
import { quoteProblem } from "@/app/sales/_lib/quoteProblem";
import { SECTIONS, pickSections, type SectionKey } from "@/app/sales/_lib/quoteSections";
import { QuotePicker } from "@/app/sales/_components/QuotePicker";
import { SalesDialog } from "@/app/sales/_components/SalesDialog";
import { useSalesQuotes } from "@/hooks/useSalesQuotes";
import { useToast } from "@/lib/toast";

interface DuplicateWizardModalProps {
  open: boolean;
  baseRef: string;
  data: SalesQuoteData;
  onClose: () => void;
  onDone: (newRef: string) => void;
}

export function DuplicateWizardModal({
  open,
  baseRef,
  data,
  onClose,
  onDone,
}: DuplicateWizardModalProps) {
  const { duplicateQuote } = useSalesQuotes();
  const toast = useToast();

  const [checked, setChecked] = useState<SectionKey[]>(
    SECTIONS.map((s) => s.key),
  );
  const [source, setSource] = useState<"current" | "other">("current");
  // The other quote picked to copy from, whole, as the picker found it.
  const [sourceQuote, setSourceQuote] = useState<SalesQuote | null>(null);
  const [creating, setCreating] = useState(false);

  const reset = () => {
    setChecked(SECTIONS.map((s) => s.key));
    setSource("current");
    setSourceQuote(null);
    setCreating(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleCreate = async () => {
    // The new variant always branches off the current quote's reference family;
    // another quote only changes where the copied content comes from.
    const sourceData: SalesQuoteData = source === "other" ? (sourceQuote?.data ?? {}) : data;
    setCreating(true);
    try {
      // Only the content is sent. The server starts the duplicate as a new Draft with a history
      // of its own, whatever status the copied quote has.
      const newRef = await duplicateQuote({ baseRef, data: pickSections(sourceData, checked) });
      toast.success("Quote duplicated");
      reset();
      onDone(newRef);
    } catch (err) {
      // The server says why: the quote is gone, the user is signed out, the document was refused.
      toast.error(`Quote not duplicated - ${quoteProblem(err).reason}`);
      setCreating(false);
    }
  };

  return (
    <SalesDialog
      open={open}
      onClose={handleClose}
      // The duplicate is being created and its page will open: closing would not stop that.
      busy={creating}
      title="Duplicate quote"
      footer={
        <>
          <Button onClick={handleClose} disabled={creating}>
            Cancel
          </Button>
          <Button
            type="primary"
            loading={creating}
            disabled={source === "other" && !sourceQuote}
            onClick={handleCreate}
          >
            Create duplicate
          </Button>
        </>
      }
    >
      <Form layout="vertical" disabled={creating}>
        <Form.Item label="Copy from">
          <Radio.Group value={source} onChange={(e) => setSource(e.target.value)}>
            <div className="flex flex-col gap-1">
              <Radio value="current">This quote ({baseRef})</Radio>
              <Radio value="other">Another quote</Radio>
            </div>
          </Radio.Group>
          {source === "other" && (
            <div className="mt-2">
              <QuotePicker value={sourceQuote} onChange={setSourceQuote} exclude={baseRef} />
            </div>
          )}
        </Form.Item>
        <Form.Item label="Sections to copy into the duplicate" className="!mb-0">
          <Checkbox.Group value={checked} onChange={(values) => setChecked(values as SectionKey[])}>
            <div className="flex flex-col gap-1">
              {SECTIONS.map((section) => (
                <Checkbox key={section.key} value={section.key}>
                  {section.label}
                </Checkbox>
              ))}
            </div>
          </Checkbox.Group>
        </Form.Item>
      </Form>
    </SalesDialog>
  );
}
