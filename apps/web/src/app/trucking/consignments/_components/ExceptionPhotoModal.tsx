"use client";

import { useState } from "react";
import { Modal } from "antd";
import type { ExceptionPhoto } from "@/hooks/useTruckingControl";
import { formatFileSize } from "@/lib/files";
import { POD_ACCEPT, readUpload, uploadProblem } from "../../_lib/uploads";
import { TruckingField } from "../../_components/TruckingField";

interface ExceptionPhotoModalProps {
  onClose: () => void;
  /** Rejects to keep the dialog open (the caller reports the error). */
  onUpload: (req: ExceptionPhoto) => Promise<unknown>;
}

// Adds a photo (or a PDF) to an exception, up to 10 MB; on a phone the camera is offered.
export const ExceptionPhotoModal = ({ onClose, onUpload }: ExceptionPhotoModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const problem = file ? uploadProblem(file, { imagesAndPdfOnly: true }) : null;

  const handleOk = async () => {
    if (!file) return;
    setBusy(true);
    try {
      await onUpload(await readUpload(file));
      onClose();
    } catch {
      // Reported by the caller.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title="Add photo" okText="Upload" okButtonProps={{ disabled: !file || !!problem }} confirmLoading={busy} onOk={handleOk} onCancel={onClose} destroyOnHidden>
      <TruckingField label="Photo or PDF" hint="Up to 10 MB">
        <input type="file" aria-label="Photo or PDF" accept={POD_ACCEPT} className="text-[13px]" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </TruckingField>
      {file && (
        <div className={`mt-2 text-[12px] ${problem ? "text-red-600" : "text-slate-500"}`}>
          {file.name} · {formatFileSize(file.size)}
          {problem ? ` — ${problem}` : ""}
        </div>
      )}
    </Modal>
  );
};
