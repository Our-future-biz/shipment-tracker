"use client";

import { useRef, useState } from "react";
import { Button, Empty, Spin } from "antd";
import { InboxOutlined, FileTextOutlined, DeleteOutlined, DownloadOutlined } from "@ant-design/icons";
import { useQuoteAttachments } from "@/hooks/useQuoteAttachments";
import { fileToBase64, quoteAttachmentContentUrl } from "@/lib/files";
import { useToast } from "@/lib/toast";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function QuoteDocumentsTab({ quoteNumber }: { quoteNumber: string }) {
  const { attachments, isLoading, upload, isUploading, remove } = useQuoteAttachments(quoteNumber);
  const toast = useToast();
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = async (files: File[]) => {
    for (const file of files) {
      try {
        const contentBase64 = await fileToBase64(file);
        await upload({ fileName: file.name, fileSize: file.size, fileType: file.type, contentBase64 });
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
  };

  return (
    <div className="p-1 space-y-4">
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-slate-300 bg-slate-50"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          uploadFiles(Array.from(e.dataTransfer.files));
        }}
        onClick={() => inputRef.current?.click()}
      >
        <InboxOutlined className="!text-2xl !text-indigo-400" />
        <p className="text-xs text-slate-500 mt-2 mb-0">
          Drop files here or <span className="text-indigo-500">browse</span>
          {isUploading && <span className="ml-2"><Spin size="small" /></span>}
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            uploadFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Spin /></div>
      ) : attachments.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No documents uploaded yet" />
      ) : (
        <div className="space-y-1">
          {attachments.map((att) => (
            <div key={att.id} className="flex items-center gap-3 px-3 py-2 rounded-md bg-slate-50 hover:bg-slate-100 transition-colors">
              <FileTextOutlined className="!text-slate-400" />
              <div className="flex-1 min-w-0">
                <a
                  href={quoteAttachmentContentUrl(quoteNumber, att.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-slate-700 hover:text-indigo-500 truncate block"
                >
                  {att.fileName}
                </a>
                <span className="text-[10px] text-slate-400">{formatSize(att.fileSize)}</span>
              </div>
              <a href={quoteAttachmentContentUrl(quoteNumber, att.id, true)} className="text-slate-400 hover:text-indigo-500" title="Download">
                <DownloadOutlined />
              </a>
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                className="!text-slate-400 hover:!text-red-500"
                onClick={() => remove(att.id).catch(() => toast.error("Delete failed"))}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
