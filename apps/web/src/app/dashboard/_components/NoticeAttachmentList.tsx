"use client";

import { Button, Tooltip } from "antd";
import { PaperClipOutlined, DeleteOutlined, DownloadOutlined, EyeOutlined } from "@ant-design/icons";
import { formatFileSize } from "@/lib/files";

export interface NoticeAttachmentRow {
  key: string;
  fileName: string;
  fileSize: number;
  // The browser can show this file itself; other types can only be downloaded.
  previewable?: boolean;
}

interface NoticeAttachmentListProps {
  files: NoticeAttachmentRow[];
  // Download (the file name and the download button); omitted for files that are not uploaded yet.
  onOpen?: (key: string) => void;
  // The eye button; omitted where a preview is not offered at all.
  onPreview?: (key: string) => void;
  onRemove?: (key: string) => void;
  // Files being fetched right now, so their buttons show progress.
  downloadingKeys?: string[];
  previewingKey?: string | null;
}

export function NoticeAttachmentList({ files, onOpen, onPreview, onRemove, downloadingKeys, previewingKey }: NoticeAttachmentListProps) {
  if (files.length === 0) return null;

  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-1">
      {files.map((f) => (
        <li key={f.key} className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[13px]">
          <PaperClipOutlined className="shrink-0 text-slate-400" />
          {onOpen ? (
            <button
              type="button"
              title={f.fileName}
              onClick={() => onOpen(f.key)}
              className="min-w-0 truncate p-0 border-none bg-transparent text-left text-indigo-600 hover:underline cursor-pointer"
            >
              {f.fileName}
            </button>
          ) : (
            <span title={f.fileName} className="min-w-0 truncate text-slate-700">
              {f.fileName}
            </span>
          )}
          <span className="ml-auto shrink-0 text-xs text-slate-400">{formatFileSize(f.fileSize)}</span>
          {(onPreview || onOpen || onRemove) && (
            <span className="shrink-0 flex items-center">
              {/* Kept on every row so the buttons line up; disabled where the browser cannot show the file. */}
              {onPreview && (
                <Tooltip title={f.previewable ? "Preview" : "No preview for this file type"}>
                  <Button
                    type="text"
                    size="small"
                    icon={<EyeOutlined />}
                    aria-label={`Preview ${f.fileName}`}
                    disabled={!f.previewable}
                    loading={previewingKey === f.key}
                    onClick={() => onPreview(f.key)}
                  />
                </Tooltip>
              )}
              {onOpen && (
                <Tooltip title="Download">
                  <Button
                    type="text"
                    size="small"
                    icon={<DownloadOutlined />}
                    aria-label={`Download ${f.fileName}`}
                    loading={downloadingKeys?.includes(f.key)}
                    onClick={() => onOpen(f.key)}
                  />
                </Tooltip>
              )}
              {onRemove && (
                <Tooltip title="Remove">
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={`Remove ${f.fileName}`} onClick={() => onRemove(f.key)} />
                </Tooltip>
              )}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
