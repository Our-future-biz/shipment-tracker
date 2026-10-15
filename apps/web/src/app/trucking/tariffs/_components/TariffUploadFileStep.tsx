"use client";

import { Alert, Spin, Upload } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { fetchTariffTemplate, type TariffDetail, type TariffVersionSummary } from "@/hooks/useTrucking";
import { TERMS } from "../../_lib/glossary";
import { TARIFF_FILE_ACCEPT } from "../../_lib/tariffUpload";
import { versionLabel } from "../../_lib/tariffs";
import { TariffDownloadButton } from "./TariffDownloadButton";

interface TariffUploadFileStepProps {
  tariff: Pick<TariffDetail, "id" | "activeVersion">;
  uploading: boolean;
  /** The file being read, or the last one read. */
  fileName: string | null;
  /** Why the last file was refused, by the browser check or the server. */
  problem: string | null;
  /** The draft an earlier upload in this wizard made, if any. */
  draft: TariffVersionSummary | null;
  onFile: (file: File) => void;
}

// Step 1 of the upload: what the template holds, and the drop zone for the filled-in .xlsx.
export const TariffUploadFileStep = ({ tariff, uploading, fileName, problem, draft, onFile }: TariffUploadFileStepProps) => (
  <div className="flex flex-col gap-4">
    <div className="text-[13px] leading-relaxed text-slate-600">
      <p className="mt-0 mb-2">
        Fill in the <b>{TERMS.template.toLowerCase()}</b> and upload it here. Its sheets: <b>Read me</b> (instructions), <b>Meta</b> (validity, chargeable-weight
        factors, rounding, notes), <b>Zones</b> (zone code, label, PSČ from – to, remote), one sheet per service level (<b>D1</b> … <b>D4</b>, <b>EXP_…</b>:
        bands down, zones across, a last <b>MIN</b> row with the {TERMS.minimumCharge.toLowerCase()}) and <b>Surcharges</b>. A service level without a sheet is
        not offered by this version.
      </p>
      <p className="m-0">
        Start from the current version so only the changes need typing; prices are compared with it before activation.
      </p>
    </div>
    <div>
      <TariffDownloadButton load={() => fetchTariffTemplate(tariff.id)}>{tariff.activeVersion ? "Download current version" : "Download template"}</TariffDownloadButton>
    </div>

    <Upload.Dragger
      accept={TARIFF_FILE_ACCEPT}
      multiple={false}
      showUploadList={false}
      disabled={uploading}
      beforeUpload={(file) => {
        onFile(file);
        return false;
      }}
    >
      <p className="ant-upload-drag-icon">
        <InboxOutlined />
      </p>
      <p className="ant-upload-text">Drop the filled-in template here, or click to choose it</p>
      <p className="ant-upload-hint">One Excel file (.xlsx), up to 5 MB. It becomes a new {TERMS.draftVersion.toLowerCase()}; nothing prices with it until it is activated.</p>
    </Upload.Dragger>

    {uploading && (
      <div className="flex items-center gap-3 text-[13px] text-slate-600">
        <Spin size="small" /> Reading {fileName}…
      </div>
    )}
    {problem && <Alert type="error" showIcon message={fileName ? `${fileName}: ${problem}` : problem} />}
    {draft && !uploading && (
      <Alert
        type="info"
        showIcon
        message={`Draft ${versionLabel(draft)} was made from ${draft.sourceFileName ?? "the earlier file"}. Uploading another file makes another draft; ${versionLabel(draft)} stays until it is discarded.`}
      />
    )}
  </div>
);
