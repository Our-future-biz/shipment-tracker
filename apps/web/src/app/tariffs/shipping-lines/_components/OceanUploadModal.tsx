"use client";

import { useState } from "react";
import { Alert, Radio, Select, Spin, Upload } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { AppModal } from "@/components/AppModal";
import { useOceanTariffActions, type OceanTariffItem, type OceanTariffVersionDetail } from "@/hooks/useOceanTariffs";
import { apiErrorMessage } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { fileToBase64 } from "@/lib/files";
import { TARIFF_FILE_ACCEPT, directionsText, tariffFileProblem } from "../../_lib/railTariffs";
import { OceanDirectionFields } from "./OceanDirectionFields";

const NEW_TARIFF = "new";

interface OceanUploadModalProps {
  open: boolean;
  onClose: () => void;
  supplierCustomerId: string;
  supplierName: string;
  tariffs: OceanTariffItem[];
  /** The draft the file was read into. */
  onUploaded: (version: OceanTariffVersionDetail) => void;
}

// Upload of a shipping line's rate document: a new version of one of its tariffs (next month's
// rates) or a new tariff, for which the user first ticks import, export or both. The AI reads where
// the rate tables and surcharges are, the code reads every rate and matches the ports to the
// UN/LOCODE list, and the draft is shown for checking; nothing prices with it yet.
export function OceanUploadModal({ open, onClose, supplierCustomerId, supplierName, tariffs, onUploaded }: OceanUploadModalProps) {
  const { upload, isUploading } = useOceanTariffActions();
  const [target, setTarget] = useState<string>(tariffs[0]?.id ?? NEW_TARIFF);
  const [fileName, setFileName] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [directions, setDirections] = useState<interfaces.RailDirection[]>([]);
  const isNew = target === NEW_TARIFF;
  // A new tariff cannot be saved without its directions, so the file waits for them.
  const notReady = isNew && !directions.length ? "Tick import, export or both" : null;

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const fileProblem = tariffFileProblem(file);
    setProblem(fileProblem);
    if (fileProblem) return;
    try {
      const version = await upload({
        supplierCustomerId,
        ...(isNew ? { directions } : { tariffId: target }),
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
    setDirections([]);
    onClose();
  };

  return (
    <AppModal open={open} onClose={close} title="Upload tariff" subtitle={supplierName} footer={null}>
      <div className="flex flex-col gap-4">
        {tariffs.length > 0 && (
          <div className="flex flex-col gap-2 text-[13px]">
            <Radio.Group value={isNew ? NEW_TARIFF : "version"} disabled={isUploading} onChange={(e) => setTarget(e.target.value === NEW_TARIFF ? NEW_TARIFF : tariffs[0]!.id)}>
              <div className="flex flex-col gap-1.5">
                <Radio value="version">A new version of an existing tariff (e.g. next month&apos;s rates)</Radio>
                <Radio value={NEW_TARIFF}>A new tariff (another rate document of this shipping line)</Radio>
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
                      <span className="shrink-0 text-[12px] text-slate-400">{directionsText(t.directions)}</span>
                    </span>
                  ),
                }))}
              />
            )}
          </div>
        )}

        {isNew && (
          <div className="flex flex-col gap-2">
            <div className="text-[13px] text-slate-600">Is the new tariff for import, export or both?</div>
            <OceanDirectionFields value={directions} onChange={setDirections} disabled={isUploading} />
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
          <p className="ant-upload-text">Drop the shipping line&apos;s rate document here, or click to choose it</p>
          <p className="ant-upload-hint">
            {notReady
              ? `${notReady} above first.`
              : "Excel (.xlsx, .xlsm) or CSV, up to 10 MB, as the shipping line sent it. The AI reads the rate tables and surcharges, and the ports are matched to the UN/LOCODE list. It becomes a draft; nothing prices with it until a manager approves it."}
          </p>
        </Upload.Dragger>

        {isUploading && (
          <div className="flex items-center gap-3 text-[13px] text-slate-600">
            <Spin size="small" /> Reading {fileName}: the AI works out where the rate tables and surcharges are, then every rate is read and every port matched. This can take up to two minutes.
          </div>
        )}
        {problem && <Alert type="error" showIcon message={fileName ? `${fileName}: ${problem}` : problem} />}
      </div>
    </AppModal>
  );
}
