"use client";

import { Spin } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { SectionCard, CountChip } from "@/components/SectionCard";
import { PreviewButton } from "@/components/PreviewButton";
import { useFilePreview } from "@/hooks/useFilePreview";
import { fetchConsignmentCmr, fetchTruckingDocument, type ConsignmentDetail, type TruckingDocument } from "@/hooks/useTruckingConsignments";
import { businessDateTime } from "@/lib/date";
import { btnDefault } from "@/components/buttons";
import { Badge } from "@/components/Badge";
import { LINK, TD, TH } from "@/styles/ui";
import { TERMS } from "../../_lib/glossary";
import { truckingFileSource } from "../../_lib/fileSource";
import { TariffDownloadButton } from "../../tariffs/_components/TariffDownloadButton";
import { DOCUMENT_KIND_LABELS } from "./DocumentUploadModal";

interface ConsignmentDocumentsTabProps {
  c: ConsignmentDetail;
  documents: readonly TruckingDocument[];
  isLoading: boolean;
  onUpload: () => void;
}

// Documents of a consignment: the CMR made from its data, and what users and the haulier uploaded
// (POD, CMR, delivery notes). A POD the haulier sent through the link is marked "Haulier". An
// uploaded file opens in the app's preview from its name or the eye.
export const ConsignmentDocumentsTab = ({ c, documents, isLoading, onUpload }: ConsignmentDocumentsTabProps) => {
  const preview = useFilePreview();
  const show = (d: TruckingDocument) => void preview.open(truckingFileSource(d.fileName, () => fetchTruckingDocument(d.id)));

  return (
    <div className="flex flex-col gap-4">
      {preview.modal}
      <SectionCard
        title="Documents"
        extra={
          <>
            <CountChip count={documents.length} />
            <TariffDownloadButton size="small" load={() => fetchConsignmentCmr(c.id)} ariaLabel={`Download the ${TERMS.cmr} of ${c.ref}`}>
              {TERMS.cmr} PDF
            </TariffDownloadButton>
            <button type="button" className={btnDefault} onClick={onUpload}>
              <UploadOutlined /> Upload…
            </button>
          </>
        }
        bodyClassName="p-0"
      >
        {isLoading ? (
          <div className="flex justify-center p-6">
            <Spin />
          </div>
        ) : documents.length === 0 ? (
          <p className="m-0 p-4 text-[13px] text-slate-500">No documents yet. The haulier uploads the {TERMS.pod} through the link in the transport order, or upload it here.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${TH} !px-4`}>Kind</th>
                <th className={`${TH} !px-4`}>File</th>
                <th className={`${TH} !px-4`}>Uploaded</th>
                <th className={`${TH} !px-4`}>By</th>
                <th className={`${TH} !px-4`} />
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0">
              {documents.map((d) => (
                <tr key={d.id}>
                  <td className={`${TD} !px-4 font-semibold !text-slate-900`}>{DOCUMENT_KIND_LABELS[d.kind]}</td>
                  <td className={`${TD} !px-4 break-all`}>
                    <button type="button" className={`${LINK} bg-transparent border-0 p-0 cursor-pointer text-left`} onClick={() => show(d)}>
                      {d.fileName}
                    </button>
                  </td>
                  <td className={`${TD} !px-4 whitespace-nowrap tabular-nums`}>{businessDateTime(d.uploadedAt)}</td>
                  <td className={`${TD} !px-4`}>
                    {d.source === "HAULIER" ? <Badge tone="i">Haulier</Badge> : null} {d.uploadedBy}
                  </td>
                  <td className={`${TD} !px-4 text-right`}>
                    <span className="inline-flex items-center gap-1">
                      <PreviewButton fileName={d.fileName} onClick={() => show(d)} />
                      <TariffDownloadButton size="small" type="text" load={() => fetchTruckingDocument(d.id)} ariaLabel={`Download ${d.fileName}`}>
                        Download
                      </TariffDownloadButton>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
};
