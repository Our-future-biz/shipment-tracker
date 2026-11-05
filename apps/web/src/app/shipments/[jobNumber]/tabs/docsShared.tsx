"use client";

import { CheckOutlined, CloseOutlined } from "@ant-design/icons";
import { formatFileSize } from "@/lib/files";
import { Pill } from "@/components/Pill";
import { HINT } from "@/styles/ui";

export { formatFileSize };

/**
 * Shared pieces of the Documents card, used by the Documents tab and by the Documents card in
 * Customs so both look the same, in the app's one look (styles/ui.ts).
 */

/** docPlural z mockupu */
export function docPlural(n: number): string {
  return n === 1 ? "1 file" : `${n} files`;
}

/**
 * The file's extension in a small coloured chip: a PDF red, a spreadsheet emerald, a document or
 * an image indigo, anything else slate. `className` sets its size to fit the row it stands in.
 */
export function ExtBadge({ fileName, className = "w-[30px] h-9" }: { fileName: string; className?: string }) {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  const kind = ext === "pdf"
    ? "pdf"
    : ["xls", "xlsx", "csv"].includes(ext)
      ? "xls"
      : ["doc", "docx", "jpg", "jpeg", "png", "heic", "gif", "webp"].includes(ext)
        ? "doc"
        : "other";
  const cls = {
    pdf: "bg-red-50 text-red-600 ring-red-200",
    xls: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    doc: "bg-indigo-50 text-indigo-600 ring-indigo-200",
    other: "bg-slate-50 text-slate-500 ring-slate-200",
  }[kind];
  return (
    <span aria-hidden className={`flex-none rounded-md grid place-items-center text-[10px] font-bold tracking-tight ring-1 ring-inset ${cls} ${className}`}>
      {ext.slice(0, 4).toUpperCase() || "FILE"}
    </span>
  );
}

/**
 * .file z mockupu - ikona pripony + nazev + velikost.
 * Dva radky s pevnou vyskou (32px + 16px), stejne jako ostatni bunky radku v Customs.
 */
export function FileCell({ fileName, fileSize }: { fileName: string; fileSize: number }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <ExtBadge fileName={fileName} />
      <span className="min-w-0">
        <span className="block text-[14px] leading-8 font-semibold text-indigo-600 truncate" title={fileName}>
          {fileName}
        </span>
        <span className={`block ${HINT} leading-4 tabular-nums`}>{formatFileSize(fileSize)}</span>
      </span>
    </div>
  );
}

/** Customs' verdict on a file, as a Pill: Approved / Declined / Awaiting review. */
export function CustomsPill({ status }: { status: string }) {
  if (status === "approved")
    return (
      <Pill tone="green">
        <CheckOutlined aria-hidden className="text-[10px]" />
        Approved
      </Pill>
    );
  if (status === "declined")
    return (
      <Pill tone="red">
        <CloseOutlined aria-hidden className="text-[10px]" />
        Declined
      </Pill>
    );
  return <Pill tone="slate">Awaiting review</Pill>;
}
