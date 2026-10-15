"use client";

import { useState } from "react";
import { Alert, Button, Checkbox, Modal } from "antd";
import { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { fetchConsignmentLabels } from "@/hooks/useTruckingConsignments";
import { savePdf } from "../_lib/pdfFile";

interface LabelsModalProps {
  consignmentIds: string[];
  /** "TCZ2026000001" or "3 consignments" — what the labels are of. */
  what: string;
  onClose: () => void;
}

// Labels PDF (100 × 150 mm, one per page): Code128 of the consignment ref, sender and consignee, the
// PSČ big, zone, service level and the ADR mark — one per consignment, or one per piece ("n / N").
export const LabelsModal = ({ consignmentIds, what, onClose }: LabelsModalProps) => {
  const toast = useToast();
  const [perPiece, setPerPiece] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const handleDownload = async () => {
    setBusy(true);
    setRefusal(null);
    try {
      savePdf(await fetchConsignmentLabels({ consignmentIds, perPiece }), "labels.pdf");
      toast.success(`Labels of ${what} downloaded`);
      onClose();
    } catch (e) {
      setRefusal(`Not made — ${apiErrorMessage(e)}.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={`Labels · ${what}`} width={480} onCancel={busy ? undefined : onClose} footer={null} destroyOnHidden>
      <div className="flex flex-col gap-3">
        <p className="m-0 text-[13px] text-slate-600">100 × 150 mm, one label per page, with the consignment&apos;s barcode, the consignee&apos;s PSČ in large print, zone, service level and ADR.</p>
        <Checkbox checked={perPiece} onChange={(e) => setPerPiece(e.target.checked)}>
          One label per piece (&quot;1 / 4&quot;, &quot;2 / 4&quot;…)
        </Checkbox>
        {refusal && <Alert type="error" showIcon message={refusal} />}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="primary" onClick={handleDownload} loading={busy} disabled={!consignmentIds.length}>
            Download PDF
          </Button>
        </div>
      </div>
    </Modal>
  );
};
