"use client";

import { Upload, Button, message } from "antd";
import { InboxOutlined, FileOutlined, DeleteOutlined } from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ShipmentItem } from "@/hooks/useShipments";

interface AttachmentFile {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  createdAt: string;
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

  const attachments: AttachmentFile[] = (attachmentsQuery.data?.attachments ?? []) as AttachmentFile[];

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <Upload.Dragger
        name="file"
        multiple
        action={`/api/shipments/${shipment.id}/attachments`}
        onChange={(info) => {
          if (info.file.status === "done") {
            queryClient.invalidateQueries({ queryKey: ["shipment-attachments", shipment.id] });
            message.success(`${info.file.name} uploaded`);
          }
        }}
        showUploadList={false}
        className="mb-4"
      >
        <p><InboxOutlined className="text-[28px] text-indigo-500" /></p>
        <p className="text-sm mt-2">Drag files here or click to browse</p>
      </Upload.Dragger>

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
              <span className="text-[11px] text-slate-400">{new Date(file.createdAt).toLocaleDateString()}</span>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => deleteAttachment.mutate(file.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
