"use client";

import { Button, Upload } from "antd";
import { CloseOutlined, DeleteOutlined, EyeOutlined, DownloadOutlined, FileOutlined, FilePdfOutlined, FileExcelOutlined, FileWordOutlined, InboxOutlined } from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fileToBase64, attachmentContentUrl } from "@/lib/files";

interface AttachmentsPanelProps {
  shipmentId: string;
  jobNumber: string;
  context?: string;
  onClose: () => void;
}

export const AttachmentsPanel = ({ shipmentId, jobNumber, context, onClose }: AttachmentsPanelProps) => {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["attachments", shipmentId],
    queryFn: () => api.shipments.attachmentList(shipmentId),
  });

  const deleteAttachment = useMutation({
    mutationFn: (attachmentId: string) => api.shipments.attachmentDelete(shipmentId, attachmentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["attachments", shipmentId] }),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["attachments", shipmentId] }),
  });

  const files = (data?.attachments ?? []) as Array<{ id: string; fileName: string; fileSize: number; fileType: string; createdAt: string }>;

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (type: string, name: string) => {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    if (type === "application/pdf" || ext === "pdf") return <FilePdfOutlined style={{ color: "#ef4444" }} />;
    if (ext === "xls" || ext === "xlsx") return <FileExcelOutlined style={{ color: "#22c55e" }} />;
    if (ext === "doc" || ext === "docx") return <FileWordOutlined style={{ color: "#3b82f6" }} />;
    return <FileOutlined style={{ color: "#94a3b8" }} />;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", borderLeft: "1px solid #e5e7eb", background: "#fff", width: 300 }}>
      {/* Header */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #e5e7eb" }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Attachments</span>
          <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 6 }}>{jobNumber}</span>
          {files.length > 0 && <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 4 }}>({files.length})</span>}
        </div>
        <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8" }}>
          <CloseOutlined style={{ fontSize: 12 }} />
        </button>
      </div>

      {/* Context */}
      {context && (
        <div style={{ padding: "6px 14px", fontSize: 11, color: "#6b7280", borderBottom: "1px solid #f1f5f9" }}>
          {context}
        </div>
      )}

      {/* Drop zone */}
      <div style={{ margin: "12px 14px" }}>
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
          <p style={{ margin: 0 }}>
            <InboxOutlined style={{ fontSize: 20, color: "#0d9488" }} />
          </p>
          <p style={{ fontSize: 11, color: "#6b7280", marginTop: 4, marginBottom: 0 }}>
            {uploadAttachment.isPending ? "Uploading…" : "Drop files or click"}
          </p>
        </Upload.Dragger>
      </div>

      {/* File list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 14px" }}>
        {files.length === 0 && (
          <p style={{ textAlign: "center", color: "#94a3b8", fontSize: 12, padding: 24 }}>No attachments yet</p>
        )}
        {files.map((file) => (
          <div key={file.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #f8fafc" }}>
            {getFileIcon(file.fileType, file.fileName)}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.fileName}</div>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>{formatSize(file.fileSize)}</div>
            </div>
            <a href={attachmentContentUrl(shipmentId, file.id)} target="_blank" rel="noreferrer" title="View">
              <Button type="text" size="small" icon={<EyeOutlined style={{ fontSize: 10 }} />} />
            </a>
            <a href={attachmentContentUrl(shipmentId, file.id, true)} title="Download">
              <Button type="text" size="small" icon={<DownloadOutlined style={{ fontSize: 10 }} />} />
            </a>
            <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 10 }} />} onClick={() => deleteAttachment.mutate(file.id)} />
          </div>
        ))}
      </div>
    </div>
  );
};
