"use client";

import { Upload, Button, Tooltip, message, Select, Tag } from "antd";
import { InboxOutlined, FileOutlined, DeleteOutlined, EyeOutlined, DownloadOutlined, CheckCircleFilled, CloseCircleFilled, ExclamationCircleOutlined } from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fileToBase64, attachmentContentUrl } from "@/lib/files";
import type { ShipmentItem } from "@/hooks/useShipments";
import { formatDate } from "@/lib/date";
import {
  DOCUMENT_TYPES,
  REQUIRED_DOCUMENT_TYPES,
  OPTIONAL_DOCUMENT_TYPES,
  guessDocumentType,
} from "@/lib/documentTypes";

interface AttachmentFile {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  createdAt: string;
  documentType: string;
  customsStatus: string;
  customsNote: string;
  customsReviewedAt: string | null;
}

// One row of the required-documents checklist.
function ChecklistRow({ label, file, optional }: { label: string; file?: AttachmentFile; optional?: boolean }) {
  const have = !!file;
  return (
    <div
      className={[
        "flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs",
        have
          ? "border-emerald-200 bg-emerald-50/60"
          : optional
            ? "border-slate-200 bg-white"
            : "border-rose-200 bg-rose-50/60",
      ].join(" ")}
    >
      {have ? (
        <CheckCircleFilled className="text-emerald-500" />
      ) : optional ? (
        <span className="w-3.5 h-3.5 rounded-full border border-slate-300 inline-block" />
      ) : (
        <ExclamationCircleOutlined className="text-rose-500" />
      )}
      <span className={have ? "text-slate-700 font-medium" : optional ? "text-slate-500" : "text-rose-700 font-medium"}>
        {label}
      </span>
      {have ? (
        <span className="ml-auto text-[11px] text-slate-400 truncate max-w-[140px]" title={file!.fileName}>
          {file!.fileName}
        </span>
      ) : optional ? (
        <span className="ml-auto text-[11px] text-slate-300">optional</span>
      ) : (
        <span className="ml-auto text-[11px] font-semibold text-rose-600">Missing</span>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsTab({ shipment }: { shipment: ShipmentItem }) {
  const queryClient = useQueryClient();

  const attachmentsQuery = useQuery({
    queryKey: ["shipment-attachments", shipment.id],
    queryFn: () => api.shipments.attachmentList(shipment.id),
  });

  const deleteAttachment = useMutation({
    mutationFn: (attachmentId: string) => api.shipments.attachmentDelete(shipment.id, attachmentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipment-attachments", shipment.id] }),
  });

  const uploadAttachment = useMutation({
    mutationFn: async (file: File) => {
      const contentBase64 = await fileToBase64(file);
      return api.shipments.attachmentCreate(shipment.id, {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || "application/octet-stream",
        contentBase64,
      });
    },
    onSuccess: (_data, file) => {
      queryClient.invalidateQueries({ queryKey: ["shipment-attachments", shipment.id] });
      message.success(`${file.name} uploaded`);
    },
    onError: () => message.error("Upload failed"),
  });

  const attachments: AttachmentFile[] = (attachmentsQuery.data?.attachments ?? []) as AttachmentFile[];

  const contentUrl = (id: string, download = false) => attachmentContentUrl(shipment.id, id, download);

  // Assign a business document type. Kept separate from upload so a file can be
  // re-classified later without re-uploading it.
  const classify = useMutation({
    mutationFn: ({ id, documentType }: { id: string; documentType: string }) =>
      api.shipments.attachmentClassify(shipment.id, id, { documentType }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipment-attachments", shipment.id] }),
    onError: () => message.error("Could not save the document type"),
  });

  const byType = new Map<string, AttachmentFile>();
  for (const a of attachments) {
    if (a.documentType && !byType.has(a.documentType)) byType.set(a.documentType, a);
  }
  const missingCount = REQUIRED_DOCUMENT_TYPES.filter((t) => !byType.has(t)).length;
  const unclassified = attachments.filter((a) => !a.documentType);

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <Upload.Dragger
        name="file"
        multiple
        showUploadList={false}
        className="mb-4"
        customRequest={({ file, onSuccess, onError }) => {
          uploadAttachment.mutate(file as File, {
            onSuccess: () => onSuccess?.("ok"),
            onError: (err) => onError?.(err as Error),
          });
        }}
      >
        <p><InboxOutlined className="text-[28px] text-indigo-500" /></p>
        <p className="text-sm mt-2">Drag files here or click to browse</p>
      </Upload.Dragger>

      {/* Required-documents checklist */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Required documents</span>
          {missingCount === 0 ? (
            <span className="text-[11px] font-semibold text-emerald-600">All present</span>
          ) : (
            <span className="text-[11px] font-semibold text-rose-600">
              {missingCount} missing
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
          {REQUIRED_DOCUMENT_TYPES.map((t) => (
            <ChecklistRow key={t} label={t} file={byType.get(t)} />
          ))}
          {OPTIONAL_DOCUMENT_TYPES.map((t) => (
            <ChecklistRow key={t} label={t} file={byType.get(t)} optional />
          ))}
        </div>
      </div>

      {unclassified.length > 0 && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
          {unclassified.length === 1
            ? "1 file has no document type yet — pick one below so customs and the checklist can use it."
            : `${unclassified.length} files have no document type yet — pick one below so customs and the checklist can use them.`}
        </div>
      )}

      {attachments.length === 0 ? (
        <p className="text-center text-slate-400 text-sm py-8">No documents yet</p>
      ) : (
        <div className="flex flex-col gap-1">
          {attachments.map((file) => (
            <div key={file.id} className="flex items-center gap-3 p-2 px-3 border border-slate-100 rounded-md">
              <FileOutlined className="text-slate-400" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">{file.fileName}</div>
                <div className="text-[11px] text-slate-400">{formatFileSize(file.fileSize)} · {file.fileType}</div>
              </div>
              <Select
                size="small"
                value={file.documentType || undefined}
                placeholder={guessDocumentType(file.fileName) || "Document type"}
                options={DOCUMENT_TYPES.map((t) => ({ value: t, label: t }))}
                onChange={(v) => classify.mutate({ id: file.id, documentType: v })}
                className={file.documentType ? "w-[170px]" : "w-[170px] [&_.ant-select-selector]:border-amber-400"}
                status={file.documentType ? undefined : "warning"}
              />
              {file.customsStatus === "approved" && (
                <Tooltip title={`Approved by customs${file.customsReviewedAt ? ` · ${formatDate(file.customsReviewedAt)}` : ""}`}>
                  <Tag color="success" className="text-[11px] m-0">
                    <CheckCircleFilled /> Approved
                  </Tag>
                </Tooltip>
              )}
              {file.customsStatus === "declined" && (
                <Tooltip title={file.customsNote || "Declined by customs"}>
                  <Tag color="error" className="text-[11px] m-0">
                    <CloseCircleFilled /> Declined
                  </Tag>
                </Tooltip>
              )}
              <span className="text-[11px] text-slate-400">{formatDate(file.createdAt)}</span>
              <Tooltip title="View">
                <a href={contentUrl(file.id)} target="_blank" rel="noreferrer">
                  <Button type="text" size="small" icon={<EyeOutlined />} />
                </a>
              </Tooltip>
              <Tooltip title="Download">
                <a href={contentUrl(file.id, true)}>
                  <Button type="text" size="small" icon={<DownloadOutlined />} />
                </a>
              </Tooltip>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => deleteAttachment.mutate(file.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
