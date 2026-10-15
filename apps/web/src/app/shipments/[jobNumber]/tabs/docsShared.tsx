"use client";

import { CheckOutlined, CloseOutlined } from "@ant-design/icons";
import { formatFileSize } from "@/lib/files";

export { formatFileSize };

/**
 * Shared pieces of the Documents card, used by the Documents tab and by the Documents card in
 * Customs so both look the same. Colours are the panel palette tokens in styles/globals.css.
 */

/** docPlural z mockupu */
export function docPlural(n: number): string {
  return n === 1 ? "1 file" : `${n} files`;
}

/** .ext z mockupu - barevny stitek podle pripony */
export function ExtBadge({ fileName }: { fileName: string }) {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  const kind = ext === "pdf"
    ? "pdf"
    : ["xls", "xlsx", "csv"].includes(ext)
      ? "xls"
      : ["jpg", "jpeg", "png", "heic", "gif", "webp"].includes(ext)
        ? "img"
        : "other";
  const cls = {
    pdf: "text-danger border-danger bg-danger-soft",
    xls: "text-ok border-ok bg-ok-soft",
    img: "text-accent border-accent bg-accent-soft",
    other: "text-muted border-line-strong bg-surface",
  }[kind];
  return (
    <span className={`flex-none w-[30px] h-[36px] rounded-[5px] grid place-items-center text-[8.5px] font-extrabold tracking-[.02em] border ${cls}`}>
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
        <span className="block text-[14px] leading-8 font-semibold text-accent truncate" title={fileName}>
          {fileName}
        </span>
        <span className="block text-[12px] leading-4 text-muted font-medium tabular-nums">{formatFileSize(fileSize)}</span>
      </span>
    </div>
  );
}

/** .pill z mockupu - csPill(): Approved / Declined / Awaiting review */
export function CustomsPill({ status }: { status: string }) {
  const base =
    "inline-flex items-center gap-[5px] whitespace-nowrap text-[11.5px] font-extrabold tracking-[.04em] uppercase px-2 py-1 rounded-[6px] border";
  if (status === "approved")
    return (
      <span className={`${base} text-ok bg-ok-soft border-ok`}>
        <CheckOutlined className="text-[12px]" />
        Approved
      </span>
    );
  if (status === "declined")
    return (
      <span className={`${base} text-danger bg-danger-soft border-danger`}>
        <CloseOutlined className="text-[12px]" />
        Declined
      </span>
    );
  return (
    <span className={`${base} text-muted bg-surface border-line-strong`}>Awaiting review</span>
  );
}
