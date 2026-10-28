"use client";

import { useState } from "react";
import { Alert, Radio, Select, Spin, Upload } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { AppModal } from "@/components/AppModal";
import { useRailTariffActions, type RailTariffItem, type RailTariffVersionDetail } from "@/hooks/useRailTariffs";
import { apiErrorMessage } from "@/lib/api";
import { fileToBase64 } from "@/lib/files";
import { TARIFF_FILE_ACCEPT, portsAndDirectionsProblem, tariffFileProblem, tariffForText } from "../../_lib/railTariffs";
import { NO_PORTS_AND_DIRECTIONS, RailTariffPortsFields, type PortsAndDirections } from "./RailTariffPortsFields";

const NEW_TARIFF = "new";

interface RailUploadModalProps {
  open: boolean;
  onClose: () => void;
  supplierCustomerId: string;
  supplierName: string;
  tariffs: RailTariffItem[];
  /** The draft the file was read into. */
  onUploaded: (version: RailTariffVersionDetail) => void;
}

// Upload of a rail operator's tariff file: a new version of one of its tariffs (next year's
// prices) or a new tariff (another price list), for which the user first ticks the ports and
// import / export. The AI reads the file's layout and the rows are read into a draft, which the
// next page shows for checking; nothing prices with it yet.
export function RailUploadModal({ open, onClose, supplierCustomerId, supplierName, tariffs, onUploaded }: RailUploadModalProps) {
  const { upload, isUploading } = useRailTariffActions();
  const [target, setTarget] = useState<string>(tariffs[0]?.id ?? NEW_TARIFF);
  const [fileName, setFileName] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [forNew, setForNew] = useState<PortsAndDirections>(NO_PORTS_AND_DIRECTIONS);
  const isNew = target === NEW_TARIFF;
  // A new tariff cannot be saved without its ports and directions, so the file waits for them.
  const notReady = isNew ? portsAndDirectionsProblem(forNew) : null;

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const fileProblem = tariffFileProblem(file);
    setProblem(fileProblem);
    if (fileProblem) return;
    try {
      const version = await upload({
        supplierCustomerId,
        ...(isNew ? forNew : { tariffId: target }),
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
    setForNew(NO_PORTS_AND_DIRECTIONS);
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
                <Radio value={NEW_TARIFF}>A new tariff (another price list of this operator)</Radio>
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
                      <span className="shrink-0 text-[12px] text-slate-400">{tariffForText(t)}</span>
                    </span>
                  ),
                }))}
              />
            )}
          </div>
        )}

        {isNew && (
          <div className="flex flex-col gap-2">
            <div className="text-[13px] text-slate-600">What is the new tariff for? Tick every port its prices run from or to.</div>
            <RailTariffPortsFields value={forNew} onChange={setForNew} disabled={isUploading} />
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
          <p className="ant-upload-text">Drop the operator&apos;s tariff file here, or click to choose it</p>
          <p className="ant-upload-hint">
            {notReady
              ? `${notReady} above first.`
              : "Excel (.xlsx) or CSV, up to 10 MB, as the operator sent it. It becomes a draft; nothing prices with it until a manager approves it."}
          </p>
        </Upload.Dragger>

        {isUploading && (
          <div className="flex items-center gap-3 text-[13px] text-slate-600">
            <Spin size="small" /> Reading {fileName}: the AI works out the layout, then every row is read and checked. This can take up to a minute.
          </div>
        )}
        {problem && <Alert type="error" showIcon message={fileName ? `${fileName}: ${problem}` : problem} />}
      </div>
    </AppModal>
  );
}
