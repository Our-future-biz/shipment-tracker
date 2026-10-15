"use client";

import { useState } from "react";
import { Modal, Select } from "antd";
import type { DocumentKind, DocumentUpload } from "@/hooks/useTruckingConsignments";
import { formatFileSize } from "@/lib/files";
import { TERMS } from "../../_lib/glossary";
import { POD_ACCEPT, readUpload, uploadProblem } from "../../_lib/uploads";
import { TruckingField } from "../../_components/TruckingField";

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  POD: `${TERMS.pod} (proof of delivery)`,
  CMR: TERMS.cmr,
  DELIVERY_NOTE: "Delivery note",
  OTHER: "Other",
};

interface DocumentUploadModalProps {
  defaultKind: DocumentKind;
  onClose: () => void;
  /** Rejects to keep the dialog open (the caller reports the error). */
  onUpload: (req: DocumentUpload) => Promise<unknown>;
}

// Adds a document to a consignment (up to 10 MB). A POD must be a photo or a PDF; uploading one
// does not stamp POD received by itself — the page offers it afterwards.
export const DocumentUploadModal = ({ defaultKind, onClose, onUpload }: DocumentUploadModalProps) => {
  const [kind, setKind] = useState<DocumentKind>(defaultKind);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const problem = file ? uploadProblem(file, { imagesAndPdfOnly: kind === "POD" }) : null;

  const handleOk = async () => {
    if (!file) return;
    setBusy(true);
    try {
      await onUpload({ kind, ...(await readUpload(file)) });
      onClose();
    } catch {
      // Reported by the caller.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title="Upload document" okText="Upload" okButtonProps={{ disabled: !file || !!problem }} confirmLoading={busy} onOk={handleOk} onCancel={onClose} destroyOnHidden>
      <div className="flex flex-col gap-3">
        <TruckingField label="Kind">
          <Select aria-label="Document kind" value={kind} options={(Object.keys(DOCUMENT_KIND_LABELS) as DocumentKind[]).map((k) => ({ value: k, label: DOCUMENT_KIND_LABELS[k] }))} onChange={setKind} />
        </TruckingField>
        <TruckingField label="File" hint={kind === "POD" ? "A photo or a PDF, up to 10 MB" : "Up to 10 MB"}>
          <input
            type="file"
            aria-label="File"
            accept={kind === "POD" ? POD_ACCEPT : undefined}
            className="text-[13px]"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </TruckingField>
        {file && (
          <div className={`text-[12px] ${problem ? "text-red-600" : "text-slate-500"}`}>
            {file.name} · {formatFileSize(file.size)}
            {problem ? ` — ${problem}` : ""}
          </div>
        )}
      </div>
    </Modal>
  );
};
