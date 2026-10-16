"use client";

import { Spin } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { SectionCard, CountChip } from "@/components/SectionCard";
import { fetchConsignmentCmr, fetchTruckingDocument, type ConsignmentDetail, type TruckingDocument } from "@/hooks/useTruckingConsignments";
import { businessDateTime } from "@/lib/date";
import { btnDefault } from "@/components/buttons";
import { Badge } from "@/components/Badge";
import { TERMS } from "../../_lib/glossary";
import { TariffDownloadButton } from "../../tariffs/_components/TariffDownloadButton";
import { DOCUMENT_KIND_LABELS } from "./DocumentUploadModal";

interface ConsignmentDocumentsTabProps {
  c: ConsignmentDetail;
  documents: readonly TruckingDocument[];
  isLoading: boolean;
  onUpload: () => void;
}

// Documents of a consignment: the CMR made from its data, and what users and the haulier uploaded
// (POD, CMR, delivery notes). A POD the haulier sent through the link is marked "Haulier".
export const ConsignmentDocumentsTab = ({ c, documents, isLoading, onUpload }: ConsignmentDocumentsTabProps) => (
  <div className="flex flex-col gap-4">
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
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2 font-semibold">Kind</th>
              <th className="px-4 py-2 font-semibold">File</th>
              <th className="px-4 py-2 font-semibold">Uploaded</th>
              <th className="px-4 py-2 font-semibold">By</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.id} className="border-b border-slate-100 last:border-b-0">
                <td className="px-4 py-2 font-semibold text-slate-800">{DOCUMENT_KIND_LABELS[d.kind]}</td>
                <td className="px-4 py-2 break-all text-slate-700">{d.fileName}</td>
                <td className="px-4 py-2 whitespace-nowrap font-mono text-slate-500">{businessDateTime(d.uploadedAt)}</td>
                <td className="px-4 py-2">
                  {d.source === "HAULIER" ? <Badge tone="b">Haulier</Badge> : null} <span className="text-slate-600">{d.uploadedBy}</span>
                </td>
                <td className="px-4 py-2 text-right">
                  <TariffDownloadButton size="small" type="text" load={() => fetchTruckingDocument(d.id)} ariaLabel={`Download ${d.fileName}`}>
                    Download
                  </TariffDownloadButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionCard>
  </div>
);
