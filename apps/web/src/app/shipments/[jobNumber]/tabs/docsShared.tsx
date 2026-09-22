"use client";

import { CheckOutlined, CloseOutlined } from "@ant-design/icons";

/**
 * Sdilene prvky karty Documents - pouziva je zalozka Documents
 * i karta Documents v sekci Customs, aby vypadaly stejne.
 * Barvy odpovidaji promennym .docs2 z HTML mockupu:
 *   --ink #151B2B  --ink-2 #5A6478  --ink-3 #8B94A7  --label #4E5769
 *   --line #E4E7F0 --line-2 #D3D8E5 --surface-2 #FAFBFD
 *   --indigo #4457D6 --indigo-soft #E7EAFC --card-head #EDEFFC
 *   --value #C3392B --value-soft #FBE6E4
 *   --green #177245 --green-soft #E1F3E9
 */

/** fmtSize z mockupu */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
    pdf: "text-[#C3392B] border-[#C3392B] bg-[#FBE6E4]",
    xls: "text-[#177245] border-[#177245] bg-[#E1F3E9]",
    img: "text-[#4457D6] border-[#4457D6] bg-[#E7EAFC]",
    other: "text-[#8B94A7] border-[#D3D8E5] bg-[#FAFBFD]",
  }[kind];
  return (
    <span className={`flex-none w-[30px] h-[36px] rounded-[5px] grid place-items-center text-[8.5px] font-extrabold tracking-[.02em] border ${cls}`}>
      {ext.slice(0, 4).toUpperCase() || "FILE"}
    </span>
  );
}

/** .file z mockupu - ikona pripony + nazev + velikost */
export function FileCell({ fileName, fileSize }: { fileName: string; fileSize: number }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <ExtBadge fileName={fileName} />
      <span className="min-w-0">
        <span className="block font-semibold text-[#4457D6] truncate" title={fileName}>
          {fileName}
        </span>
        <span className="text-[12px] text-[#8B94A7] font-medium">{formatFileSize(fileSize)}</span>
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
      <span className={`${base} text-[#177245] bg-[#E1F3E9] border-[#177245]`}>
        <CheckOutlined className="text-[12px]" />
        Approved
      </span>
    );
  if (status === "declined")
    return (
      <span className={`${base} text-[#C3392B] bg-[#FBE6E4] border-[#C3392B]`}>
        <CloseOutlined className="text-[12px]" />
        Declined
      </span>
    );
  return (
    <span className={`${base} text-[#8B94A7] bg-[#FAFBFD] border-[#D3D8E5]`}>Awaiting review</span>
  );
}
