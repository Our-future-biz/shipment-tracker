"use client";

import { Button, Upload } from "antd";
import { CloseOutlined, DeleteOutlined, EyeOutlined, DownloadOutlined, FileOutlined, FilePdfOutlined, FileExcelOutlined, FileWordOutlined, InboxOutlined } from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { api, apiFileUrl } from "@/lib/api";
import { fileToBase64, formatFileSize } from "@/lib/files";
import { useShipmentAttachments } from "@/hooks/useShipmentAttachments";

interface AttachmentsPanelProps {
  shipmentId: string;
  jobNumber: string;
  context?: string;
  onClose: () => void;
}

const fileIcon = (type: string, name: string) => {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (type === "application/pdf" || ext === "pdf") return <FilePdfOutlined className="text-red-500" />;
  if (ext === "xls" || ext === "xlsx") return <FileExcelOutlined className="text-green-500" />;
  if (ext === "doc" || ext === "docx") return <FileWordOutlined className="text-blue-500" />;
  return <FileOutlined className="text-slate-400" />;
};

export const AttachmentsPanel = ({ shipmentId, jobNumber, context, onClose }: AttachmentsPanelProps) => {
  const { attachments: files, refresh } = useShipmentAttachments(shipmentId);

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
    <div className="flex flex-col h-full w-[300px] border-l border-gray-200 bg-white">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3.5 py-2.5 border-b border-gray-200">
        <div>
          <span className="text-xs font-semibold text-gray-700">Attachments</span>
          <span className="text-[11px] text-slate-400 ml-1.5">{jobNumber}</span>
          {files.length > 0 && <span className="text-[10px] text-slate-400 ml-1">({files.length})</span>}
        </div>
        <Button type="text" size="small" onClick={onClose} aria-label="Close" icon={<CloseOutlined className="text-xs text-slate-400" />} />
      </div>

      {/* Context */}
      {context && <div className="px-3.5 py-1.5 text-[11px] text-gray-500 border-b border-slate-100">{context}</div>}

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
            <InboxOutlined className="text-xl text-teal-600" />
          </p>
          <p className="text-[11px] text-gray-500 mt-1 mb-0">{uploadAttachment.isPending ? "Uploading…" : "Drop files or click"}</p>
        </Upload.Dragger>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto px-3.5">
        {files.length === 0 && <p className="text-center text-slate-400 text-xs p-6">No attachments yet</p>}
        {files.map((file) => (
          <div key={file.id} className="flex items-center gap-2 py-1.5 border-b border-slate-50">
            {fileIcon(file.fileType, file.fileName)}
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium truncate">{file.fileName}</div>
              <div className="text-[10px] text-slate-400">{formatFileSize(file.fileSize)}</div>
            </div>
            <a href={apiFileUrl(file.contentUrl)} target="_blank" rel="noreferrer" title="View">
              <Button type="text" size="small" icon={<EyeOutlined className="text-[10px]" />} />
            </a>
            <a href={apiFileUrl(file.contentUrl, true)} title="Download">
              <Button type="text" size="small" icon={<DownloadOutlined className="text-[10px]" />} />
            </a>
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined className="text-[10px]" />}
              onClick={() => deleteAttachment.mutate(file.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
