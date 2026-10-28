"use client";

import { useState } from "react";
import { Alert, Radio, Select, Spin, Upload } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { AppModal } from "@/components/AppModal";
import { useCollectionTariffActions, type CollectionFreightMode, type CollectionTariffItem, type CollectionTariffVersionDetail } from "@/hooks/useCollectionTariffs";
import { apiErrorMessage } from "@/lib/api";
import { fileToBase64 } from "@/lib/files";
import { freightModesText } from "../../_lib/collectionTariffs";
import { TARIFF_FILE_ACCEPT, tariffFileProblem } from "../../_lib/railTariffs";
import { CollectionFreightFields } from "./CollectionFreightFields";

const NEW_TARIFF = "new";

interface CollectionUploadModalProps {
  open: boolean;
  onClose: () => void;
  supplierCustomerId: string;
  supplierName: string;
  tariffs: CollectionTariffItem[];
  /** The draft the file was read into. */
  onUploaded: (version: CollectionTariffVersionDetail) => void;
}

// Upload of a first / last mile haulier's tariff file: a new version of one of its tariffs (next
// year's prices) or a new tariff, for which the user first ticks what it collects and delivers. The
// AI reads where each part of the file is - hidden sheets too - and every figure is read into a
// draft, which the next page shows for checking; nothing prices with it yet.
export function CollectionUploadModal({ open, onClose, supplierCustomerId, supplierName, tariffs, onUploaded }: CollectionUploadModalProps) {
  const { upload, isUploading } = useCollectionTariffActions();
  const [target, setTarget] = useState<string>(tariffs[0]?.id ?? NEW_TARIFF);
  const [fileName, setFileName] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [freight, setFreight] = useState<CollectionFreightMode[]>([]);
  const isNew = target === NEW_TARIFF;
  // A new tariff cannot be saved without its freight, so the file waits for it.
  const notReady = isNew && !freight.length ? "Tick Sea LCL, Air or both" : null;

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const fileProblem = tariffFileProblem(file);
    setProblem(fileProblem);
    if (fileProblem) return;
    try {
      const version = await upload({
        supplierCustomerId,
        ...(isNew ? { freightModes: freight } : { tariffId: target }),
        fileName: file.name,
        fileBase64: await fileToBase64(file),
      });
      onUploaded(version);
    } catch (e) {
      setProblem(apiErrorMessage(e));
    }
  };

  const close = () => {
    if (isUploading) return;
    setProblem(null);
    setFileName(null);
    setFreight([]);
    onClose();
  };

  return (
    <AppModal open={open} onClose={close} title="Upload tariff" subtitle={supplierName} footer={null}>
      <div className="flex flex-col gap-4">
        {tariffs.length > 0 && (
          <div className="flex flex-col gap-2 text-[13px]">
            <Radio.Group value={isNew ? NEW_TARIFF : "version"} disabled={isUploading} onChange={(e) => setTarget(e.target.value === NEW_TARIFF ? NEW_TARIFF : tariffs[0]!.id)}>
              <div className="flex flex-col gap-1.5">
                <Radio value="version">A new version of an existing tariff (e.g. next year&apos;s prices)</Radio>
                <Radio value={NEW_TARIFF}>A new tariff (another price list of this haulier)</Radio>
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
                      <span className="shrink-0 text-[12px] text-slate-400">{freightModesText(t.freightModes)}</span>
                    </span>
                  ),
                }))}
              />
            )}
          </div>
        )}

        {isNew && (
          <div className="flex flex-col gap-2">
            <div className="text-[13px] text-slate-600">What does the new tariff collect and deliver?</div>
            <CollectionFreightFields value={freight} onChange={setFreight} disabled={isUploading} />
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
          <p className="ant-upload-text">Drop the haulier&apos;s tariff file here, or click to choose it</p>
          <p className="ant-upload-hint">
            {notReady
              ? `${notReady} above first.`
              : "Excel (.xlsx, .xlsm) or CSV, up to 10 MB, as the haulier sent it - hidden sheets are read too. It becomes a draft; nothing prices with it until a manager approves it."}
          </p>
        </Upload.Dragger>

        {isUploading && (
          <div className="flex items-center gap-3 text-[13px] text-slate-600">
            <Spin size="small" /> Reading {fileName}: the AI works out where the prices, postcodes and distances are, then every figure is read and checked. This can take up to a minute.
          </div>
        )}
        {problem && <Alert type="error" showIcon message={fileName ? `${fileName}: ${problem}` : problem} />}
      </div>
    </AppModal>
  );
}
