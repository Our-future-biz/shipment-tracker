"use client";

import { Button, Tooltip } from "antd";
import { DownloadOutlined, EyeOutlined, FileExcelOutlined, FileImageOutlined, FileOutlined, FilePdfOutlined, FileWordOutlined } from "@ant-design/icons";
import { formatFileSize } from "@/lib/files";

export interface NoticeAttachmentRow {
  key: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  // The browser can show this file itself; other types can only be downloaded.
  previewable?: boolean;
}

interface NoticeAttachmentListProps {
  files: NoticeAttachmentRow[];
  onOpen: (key: string) => void;
  onPreview: (key: string) => void;
  // Files being fetched right now, so their buttons show progress.
  downloadingKeys?: string[];
  previewingKey?: string | null;
}

const extension = (fileName: string) => (fileName.includes(".") ? (fileName.split(".").pop() ?? "").toLowerCase() : "");

// An icon in the colour people know the file type by.
export function fileIcon(fileName: string, fileType: string) {
  const ext = extension(fileName);
  if (fileType === "application/pdf" || ext === "pdf") return <FilePdfOutlined className="!text-red-500" />;
  if (fileType.startsWith("image/")) return <FileImageOutlined className="!text-sky-500" />;
  if (["xls", "xlsx", "csv"].includes(ext)) return <FileExcelOutlined className="!text-emerald-600" />;
  if (["doc", "docx"].includes(ext)) return <FileWordOutlined className="!text-blue-600" />;
  return <FileOutlined className="!text-slate-400" />;
}

// The documents of a notice being read: preview and download.
export function NoticeAttachmentList({ files, onOpen, onPreview, downloadingKeys, previewingKey }: NoticeAttachmentListProps) {
  if (files.length === 0) return null;

  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
      {files.map((f) => (
        <li key={f.key} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <span className="shrink-0 text-[28px] leading-none">{fileIcon(f.fileName, f.fileType)}</span>
          <span className="min-w-0 flex-1">
            <button
              type="button"
              title={f.fileName}
              onClick={() => onOpen(f.key)}
              className="block max-w-full truncate p-0 border-none bg-transparent text-left text-[13px] font-semibold text-slate-800 hover:text-indigo-600 hover:underline cursor-pointer"
            >
              {f.fileName}
            </button>
            <span className="block text-[11px] text-slate-500">{[formatFileSize(f.fileSize), extension(f.fileName).toUpperCase()].filter(Boolean).join(" · ")}</span>
          </span>
          <span className="shrink-0 flex items-center gap-1.5">
            {/* Kept on every row so the buttons line up; disabled where the browser cannot show the file. */}
            <Tooltip title={f.previewable ? "Preview" : "No preview for this file type"}>
              <Button
                size="small"
                icon={<EyeOutlined />}
                aria-label={`Preview ${f.fileName}`}
                disabled={!f.previewable}
                loading={previewingKey === f.key}
                onClick={() => onPreview(f.key)}
              />
            </Tooltip>
            <Tooltip title="Download">
              <Button
                size="small"
                icon={<DownloadOutlined />}
                aria-label={`Download ${f.fileName}`}
                loading={downloadingKeys?.includes(f.key)}
                onClick={() => onOpen(f.key)}
              />
            </Tooltip>
          </span>
        </li>
      ))}
    </ul>
  );
}
