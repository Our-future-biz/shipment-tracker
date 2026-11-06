"use client";

import { useCanManageDocuments } from "@/lib/auth/AuthContext";
import { Button, Upload } from "antd";
import { CloseOutlined, DeleteOutlined, EyeOutlined, DownloadOutlined, FileOutlined, FilePdfOutlined, FileExcelOutlined, FileWordOutlined, InboxOutlined } from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { api, apiFileUrl } from "@/lib/api";
import { fileToBase64, formatFileSize } from "@/lib/files";
import { useShipmentAttachments } from "@/hooks/useShipmentAttachments";
import { HINT, MODAL_TITLE, REF } from "@/styles/ui";

interface AttachmentsPanelProps {
  shipmentId: string;
  jobNumber: string;
  context?: string;
  onClose: () => void;
}

const fileIcon = (type: string, name: string) => {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (type === "application/pdf" || ext === "pdf") return <FilePdfOutlined className="text-red-500" />;
  if (ext === "xls" || ext === "xlsx") return <FileExcelOutlined className="text-emerald-600" />;
  if (ext === "doc" || ext === "docx") return <FileWordOutlined className="text-indigo-600" />;
  return <FileOutlined className="text-slate-400" />;
};

export const AttachmentsPanel = ({ shipmentId, jobNumber, context, onClose }: AttachmentsPanelProps) => {
  const { attachments: files, refresh } = useShipmentAttachments(shipmentId);
  // Anyone can add a document; only a manager, an admin or a superadmin can delete one.
  const canManageDocuments = useCanManageDocuments();

  const deleteAttachment = useMutation({
    mutationFn: (attachmentId: string) => api.shipments.attachmentDelete(shipmentId, attachmentId),
    onSuccess: refresh,
  });

  const uploadAttachment = useMutation({
    mutationFn: async (file: File) => {
      const contentBase64 = await fileToBase64(file);
      await api.shipments.attachmentCreate(shipmentId, {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || "application/octet-stream",
        contentBase64,
      });
    },
    onSuccess: refresh,
  });

  return (
    <div className="flex flex-col h-full w-[300px] border-l border-slate-200 bg-white">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3.5 py-2.5 border-b border-slate-200">
        <div>
          <span className={MODAL_TITLE}>Attachments</span>
          <span className={`${HINT} ${REF} ml-1.5`}>{jobNumber}</span>
          {files.length > 0 && <span className={`${HINT} ml-1`}>({files.length})</span>}
        </div>
        <Button type="text" size="small" onClick={onClose} aria-label="Close" icon={<CloseOutlined className="text-xs" />} />
      </div>

      {/* Context */}
      {context && <div className={`${HINT} px-3.5 py-1.5 border-b border-slate-100`}>{context}</div>}

      {/* Drop zone */}
      <div className="mx-3.5 my-3">
        <Upload.Dragger
          name="file"
          multiple
          showUploadList={false}
          customRequest={({ file, onSuccess, onError }) => {
            uploadAttachment.mutate(file as File, {
              onSuccess: () => onSuccess?.("ok"),
              onError: (err) => onError?.(err as Error),
            });
          }}
        >
          <p className="m-0">
            <InboxOutlined className="text-xl text-indigo-600" />
          </p>
          <p className={`${HINT} mt-1 mb-0`}>{uploadAttachment.isPending ? "Uploading…" : "Drop files or click"}</p>
        </Upload.Dragger>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto px-3.5">
        {files.length === 0 && <p className={`${HINT} text-center p-6`}>No attachments yet</p>}
        {files.map((file) => (
          <div key={file.id} className="flex items-center gap-2 py-1.5 border-b border-slate-100">
            {fileIcon(file.fileType, file.fileName)}
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-slate-900 truncate">{file.fileName}</div>
              <div className={`${HINT} tabular-nums`}>{formatFileSize(file.fileSize)}</div>
            </div>
            <a href={apiFileUrl(file.contentUrl)} target="_blank" rel="noreferrer" title="View">
              <Button type="text" size="small" icon={<EyeOutlined className="text-[10px]" />} />
            </a>
            <a href={apiFileUrl(file.contentUrl, true)} title="Download">
              <Button type="text" size="small" icon={<DownloadOutlined className="text-[10px]" />} />
            </a>
            {canManageDocuments && (
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined className="text-[10px]" />}
                onClick={() => deleteAttachment.mutate(file.id)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
