"use client";

import { useState } from "react";
import { Alert, Button, Modal, Radio } from "antd";
import { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { fetchTripManifest, type ManifestLanguage } from "@/hooks/useTruckingConsignments";
import { TERMS } from "../_lib/glossary";
import { savePdf } from "../_lib/pdfFile";
import { LANGUAGE_OPTIONS } from "../_lib/transportOrder";
import { TruckingField } from "./TruckingField";

interface ManifestModalProps {
  tripId: string;
  tripRef: string;
  onClose: () => void;
}

// Manifest PDF of a trip (nakládací list): every consignment in stop order against the truck's
// capacity, in Czech, English or both. Made on click; nothing changes.
export const ManifestModal = ({ tripId, tripRef, onClose }: ManifestModalProps) => {
  const toast = useToast();
  const [language, setLanguage] = useState<ManifestLanguage>("both");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const handleDownload = async () => {
    setBusy(true);
    setRefusal(null);
    try {
      savePdf(await fetchTripManifest(tripId, language), `${tripRef}-manifest.pdf`);
      toast.success(`${TERMS.manifest} of ${tripRef} downloaded`);
      onClose();
    } catch (e) {
      setRefusal(`Not made — ${apiErrorMessage(e)}.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={`${TERMS.manifest} · ${tripRef}`} width={480} onCancel={busy ? undefined : onClose} footer={null} destroyOnHidden>
      <div className="flex flex-col gap-3">
        <TruckingField label="Language">
          <Radio.Group aria-label="Language" value={language} options={LANGUAGE_OPTIONS} onChange={(e) => setLanguage(e.target.value)} />
        </TruckingField>
        {refusal && <Alert type="error" showIcon message={refusal} />}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="primary" onClick={handleDownload} loading={busy}>
            Download PDF
          </Button>
        </div>
      </div>
    </Modal>
  );
};
