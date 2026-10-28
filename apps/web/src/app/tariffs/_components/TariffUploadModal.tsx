"use client";

import { useState, type ReactNode } from "react";
import { Alert, Radio, Select, Spin, Upload } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { AppModal } from "@/components/AppModal";
import { apiErrorMessage } from "@/lib/api";
import { fileToBase64 } from "@/lib/files";
import { TARIFF_FILE_ACCEPT, tariffFileProblem } from "../_lib/railTariffs";
import type { TariffUploadSlot } from "./TariffSupplierView";

const NEW_TARIFF = "new";

/** A tariff a file can be a new version of, with what it is for in words. */
interface UploadTarget {
  id: string;
  name: string;
  forText: string;
}

/** The file as it is sent. */
interface UploadFile {
  fileName: string;
  fileBase64: string;
}

interface TariffUploadModalProps extends TariffUploadSlot {
  supplierName: string;
  tariffs: UploadTarget[];
  /** Asks the server to read the file: as a new version of `tariffId`, or as a new tariff when it is null */
  upload: (tariffId: string | null, file: UploadFile) => Promise<{ id: string }>;
  isUploading: boolean;
  /** What a new tariff is for, ticked before its file: the question, its fields and what is still missing */
  newTariff: { question: string; fields: ReactNode; problem: string | null };
  texts: {
    /** "next year's prices" */
    nextVersion: string;
    /** "another price list of this operator" */
    another: string;
    /** "the operator's tariff file" */
    file: string;
    /** Under the drop zone: the files taken */
    hint: string;
    /** While the file is read: "the AI works out the layout, … This can take up to a minute." */
    reading: string;
  };
}

// Upload of a supplier's tariff file: a new version of one of its tariffs or a new tariff, for
// which the user first ticks what it is for. The AI reads the file's layout and the rows are read
// into a draft, which the next page shows for checking; nothing prices with it yet.
export function TariffUploadModal({ open, onClose, onUploaded, supplierName, tariffs, upload, isUploading, newTariff, texts }: TariffUploadModalProps) {
  const [target, setTarget] = useState<string>(tariffs[0]?.id ?? NEW_TARIFF);
  const [fileName, setFileName] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const isNew = target === NEW_TARIFF;
  // A new tariff cannot be saved without what it is for, so the file waits for it.
  const notReady = isNew ? newTariff.problem : null;

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const fileProblem = tariffFileProblem(file);
    setProblem(fileProblem);
    if (fileProblem) return;
    try {
      const version = await upload(isNew ? null : target, { fileName: file.name, fileBase64: await fileToBase64(file) });
      onUploaded(version.id);
    } catch (e) {
      setProblem(apiErrorMessage(e));
    }
  };

  // The dialog is opened afresh each time (its owner keys it), so closing has nothing to reset.
  const handleClose = () => {
    if (!isUploading) onClose();
  };

  return (
    <AppModal open={open} onClose={handleClose} title="Upload tariff" subtitle={supplierName} footer={null}>
      <div className="flex flex-col gap-4">
        {tariffs.length > 0 && (
          <div className="flex flex-col gap-2 text-[13px]">
            <Radio.Group value={isNew ? NEW_TARIFF : "version"} disabled={isUploading} onChange={(e) => setTarget(e.target.value === NEW_TARIFF ? NEW_TARIFF : tariffs[0]!.id)}>
              <div className="flex flex-col gap-1.5">
                <Radio value="version">A new version of an existing tariff (e.g. {texts.nextVersion})</Radio>
                <Radio value={NEW_TARIFF}>A new tariff ({texts.another})</Radio>
              </div>
            </Radio.Group>
            {!isNew && (
              <Select
                aria-label="Tariff"
                value={target}
                disabled={isUploading}
                onChange={setTarget}
                options={tariffs.map((t) => ({
                  value: t.id,
                  label: (
                    <span className="flex items-baseline gap-2 min-w-0">
                      <span className="truncate">{t.name}</span>
                      <span className="shrink-0 text-[12px] text-slate-400">{t.forText}</span>
                    </span>
                  ),
                }))}
              />
            )}
          </div>
        )}

        {isNew && (
          <div className="flex flex-col gap-2">
            <div className="text-[13px] text-slate-600">{newTariff.question}</div>
            {newTariff.fields}
          </div>
        )}

        <Upload.Dragger
          accept={TARIFF_FILE_ACCEPT}
          multiple={false}
          showUploadList={false}
          disabled={isUploading || !!notReady}
          beforeUpload={(file) => {
            void handleFile(file);
            return false;
          }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">Drop {texts.file} here, or click to choose it</p>
          <p className="ant-upload-hint">{notReady ? `${notReady} above first.` : texts.hint}</p>
        </Upload.Dragger>

        {isUploading && (
          <div className="flex items-center gap-3 text-[13px] text-slate-600">
            <Spin size="small" /> Reading {fileName}: {texts.reading}
          </div>
        )}
        {problem && <Alert type="error" showIcon message={fileName ? `${fileName}: ${problem}` : problem} />}
      </div>
    </AppModal>
  );
}
