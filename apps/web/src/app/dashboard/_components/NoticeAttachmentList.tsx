"use client";

import { Button } from "antd";
import { PaperClipOutlined, DeleteOutlined } from "@ant-design/icons";
import { formatFileSize } from "@/lib/files";

export interface NoticeAttachmentRow {
  key: string;
  fileName: string;
  fileSize: number;
}

interface NoticeAttachmentListProps {
  files: NoticeAttachmentRow[];
  // Clicking a file name; omitted for files that are not uploaded yet.
  onOpen?: (key: string) => void;
  onRemove?: (key: string) => void;
}

export function NoticeAttachmentList({ files, onOpen, onRemove }: NoticeAttachmentListProps) {
  if (files.length === 0) return null;

  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-1">
      {files.map((f) => (
        <li key={f.key} className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[13px]">
          <PaperClipOutlined className="text-slate-400" />
          {onOpen ? (
            <button
              type="button"
              onClick={() => onOpen(f.key)}
              className="min-w-0 truncate p-0 border-none bg-transparent text-left text-indigo-600 hover:underline cursor-pointer"
            >
              {f.fileName}
            </button>
          ) : (
            <span className="min-w-0 truncate text-slate-700">{f.fileName}</span>
          )}
          <span className="ml-auto shrink-0 text-xs text-slate-400">{formatFileSize(f.fileSize)}</span>
          {onRemove && (
            <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={`Remove ${f.fileName}`} onClick={() => onRemove(f.key)} />
          )}
        </li>
      ))}
    </ul>
  );
}
