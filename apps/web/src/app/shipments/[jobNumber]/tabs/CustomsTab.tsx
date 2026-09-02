"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input, Empty, Tag, Button, Tooltip, message } from "antd";
import { SafetyCertificateOutlined, FileTextOutlined, SearchOutlined, CheckOutlined, CloseOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";
import { getFieldValue, type ShipmentItem } from "@/hooks/useShipments";
import { DetailCard, makeStyleFor, type CommitFn } from "../ShipmentDetailContent";
import { formatDateTime } from "@/lib/date";

// Field layout mirrors CUSTOMS_L / CUSTOMS_R from the approved mockup. Read-only
// fields are derived elsewhere (containers, cargo lines) and must not be edited here.
const CUSTOMS_LEFT = [
  { key: "customsStatus", label: "Customs Status" },
  { key: "jobNumber", label: "Internal Reference", ro: true },
  { key: "typeOfPackages", label: "Type Of Packages", ro: true },
  { key: "pcs", label: "Colli", ro: true },
  { key: "cargoDescription", label: "Cargo Description", ro: true },
  { key: "hsCode", label: "HS Code", ro: true },
  { key: "totalWeightTons", label: "Total Weight In Tons", ro: true },
];

const CUSTOMS_RIGHT = [
  { key: "customsProcedure", label: "Customs Procedure" },
  { key: "mrn", label: "MRN Number" },
  { key: "totalVolumeCbm", label: "Total Volume In CBM", ro: true },
  { key: "containerNumber", label: "Container Number", ro: true },
  { key: "sealNumber", label: "Seal Number", ro: true },
  { key: "containerTypeSummary", label: "Container Type", ro: true },
  { key: "commercialInvoice", label: "Commercial Invoice number(s)" },
  { key: "commercialInvoiceValue", label: "Commercial Invoice(s) Valued", ro: true },
];

export function CustomsTab({
  shipment,
  onCommit,
}: {
  shipment: ShipmentItem;
  onCommit: CommitFn;
}) {
  const [search, setSearch] = useState("");
  const styleFor = useMemo(() => makeStyleFor(shipment), [shipment]);

  const attachmentsQuery = useQuery({
    queryKey: ["shipment-attachments", shipment.id],
    queryFn: () => api.shipments.attachmentList(shipment.id),
  });

  const queryClient = useQueryClient();
  const [declining, setDeclining] = useState<string | null>(null);
  const [note, setNote] = useState("");

  // Customs can only approve or decline — the document type itself is set in the
  // Documents tab, so operations stays the owner of classification.
  const review = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason?: string }) =>
      api.shipments.attachmentReview(shipment.id, id, { status, note: reason ?? "" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipment-attachments", shipment.id] });
      setDeclining(null);
      setNote("");
    },
    onError: () => message.error("Could not save the review"),
  });

  const documents = attachmentsQuery.data?.attachments ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((d) => (d.fileName ?? "").toLowerCase().includes(q));
  }, [documents, search]);

  return (
    <div className="flex flex-col gap-3">
      <DetailCard
        icon={<SafetyCertificateOutlined />}
        title="Customs"
        columns={[CUSTOMS_LEFT, CUSTOMS_RIGHT]}
        shipment={shipment}
        onCommit={onCommit}
        styleFor={styleFor}
      />

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-indigo-500"><FileTextOutlined /></span>
            <span className="text-[13px] font-semibold text-slate-800">Documents</span>
            <span className="text-xs text-slate-400">
              {documents.length === 0
                ? "no documents"
                : `${documents.length} document${documents.length === 1 ? "" : "s"}`}
              {documents.length > 0 && (
                <>
                  {" · "}
                  <span className="text-emerald-600">
                    {documents.filter((d) => d.customsStatus === "approved").length} approved
                  </span>
                  {" · "}
                  <span className="text-rose-600">
                    {documents.filter((d) => d.customsStatus === "declined").length} declined
                  </span>
                </>
              )}
            </span>
          </div>
          <Input
            placeholder="Search by file name"
            prefix={<SearchOutlined className="text-slate-400" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            size="small"
            className="w-56"
          />
        </div>

        {filtered.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              documents.length === 0
                ? "No documents yet — files added in the Documents tab show up here for clearance."
                : `No file matches “${search}”.`
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3 font-semibold min-w-[240px]">File</th>
                  <th className="py-2 pr-3 font-semibold w-[150px]">Document type</th>
                  <th className="py-2 pr-3 font-semibold w-[150px]">Uploaded</th>
                  <th className="py-2 font-semibold w-[230px]">Customs review</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className="border-b border-slate-100 last:border-b-0">
                    <td className="py-2 pr-3 text-slate-800 font-medium">{d.fileName}</td>
                    <td className="py-2 pr-3">
                      {d.documentType ? (
                        <Tag className="text-[11px]">{d.documentType}</Tag>
                      ) : (
                        <Tooltip title="Set the type in the Documents tab">
                          <span className="text-[11px] text-amber-600">not classified</span>
                        </Tooltip>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-slate-500">
                      {d.createdAt ? formatDateTime(d.createdAt) : "—"}
                    </td>
                    <td className="py-2">
                      {d.customsStatus === "approved" || d.customsStatus === "declined" ? (
                        <div className="flex items-center gap-2">
                          <Tag color={d.customsStatus === "approved" ? "success" : "error"} className="text-[11px] m-0">
                            {d.customsStatus === "approved" ? "Approved" : "Declined"}
                          </Tag>
                          {d.customsStatus === "declined" && d.customsNote && (
                            <Tooltip title={d.customsNote}>
                              <span className="text-[11px] text-slate-400 truncate max-w-[90px]">{d.customsNote}</span>
                            </Tooltip>
                          )}
                          <Button
                            size="small"
                            type="link"
                            className="text-[11px] px-0"
                            onClick={() => review.mutate({ id: d.id, status: "" })}
                          >
                            Change
                          </Button>
                        </div>
                      ) : declining === d.id ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            size="small"
                            autoFocus
                            placeholder="Reason for decline"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            onPressEnter={() => review.mutate({ id: d.id, status: "declined", reason: note })}
                            className="w-[130px]"
                          />
                          <Button size="small" danger onClick={() => review.mutate({ id: d.id, status: "declined", reason: note })}>
                            Save
                          </Button>
                          <Button size="small" type="text" onClick={() => { setDeclining(null); setNote(""); }}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="small"
                            icon={<CheckOutlined />}
                            className="text-[11px] text-emerald-600 border-emerald-300"
                            onClick={() => review.mutate({ id: d.id, status: "approved" })}
                          >
                            Approve
                          </Button>
                          <Button
                            size="small"
                            danger
                            icon={<CloseOutlined />}
                            className="text-[11px]"
                            onClick={() => { setDeclining(d.id); setNote(""); }}
                          >
                            Decline
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-400">
          Documents are uploaded in the Documents tab; this list is the customs view of them.
        </div>
      </div>
    </div>
  );
}
