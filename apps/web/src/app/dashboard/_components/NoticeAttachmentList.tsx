"use client";

import { Button, Tooltip } from "antd";
import { DownloadOutlined, FileExcelOutlined, FileImageOutlined, FileOutlined, FilePdfOutlined, FileWordOutlined } from "@ant-design/icons";
import { PreviewButton } from "@/components/PreviewButton";
import { formatFileSize } from "@/lib/files";
import { HINT, LINK } from "@/styles/ui";

export interface NoticeAttachmentRow {
  key: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

interface NoticeAttachmentListProps {
  files: NoticeAttachmentRow[];
  // The file name and the eye show the file in the app's preview; Download saves it.
  onPreview: (key: string) => void;
  onDownload: (key: string) => void;
  // Files being downloaded right now, so their buttons show progress.
  downloadingKeys?: string[];
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
export function NoticeAttachmentList({ files, onPreview, onDownload, downloadingKeys }: NoticeAttachmentListProps) {
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
              onClick={() => onPreview(f.key)}
              className={`block max-w-full truncate bg-transparent border-0 p-0 cursor-pointer text-left text-[13px] font-semibold ${LINK}`}
            >
              {f.fileName}
            </button>
            <span className={`block ${HINT}`}>{[formatFileSize(f.fileSize), extension(f.fileName).toUpperCase()].filter(Boolean).join(" · ")}</span>
          </span>
          <span className="shrink-0 flex items-center gap-1.5">
            <PreviewButton fileName={f.fileName} onClick={() => onPreview(f.key)} />
            <Tooltip title="Download">
              {/* Frameless like the eye beside it, its spinner kept while the file comes. */}
              <Button
                type="text"
                size="small"
                icon={<DownloadOutlined />}
                aria-label={`Download ${f.fileName}`}
                loading={downloadingKeys?.includes(f.key)}
                onClick={() => onDownload(f.key)}
                className="text-[14px] !text-slate-500 hover:!text-slate-900"
              />
            </Tooltip>
          </span>
        </li>
      ))}
    </ul>
  );
}
