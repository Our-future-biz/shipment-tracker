"use client";

import { Fragment, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input, Tooltip, message } from "antd";
import {
  SafetyCertificateOutlined,
  FileTextOutlined,
  SearchOutlined,
  CheckOutlined,
  CloseOutlined,
  EyeOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/api";
import { type ShipmentItem } from "@/hooks/useShipments";
import { DetailCard, makeStyleFor, type CommitFn } from "../ShipmentDetailContent";
import { formatDateTime } from "@/lib/date";
import { attachmentContentUrl } from "@/lib/files";
import { FileCell, CustomsPill, docPlural } from "./docsShared";

// Field layout mirrors CUSTOMS_L / CUSTOMS_R from the approved mockup. Read-only
// fields are derived elsewhere (containers, cargo lines) and must not be edited here.
const CUSTOMS_LEFT = [
  { key: "customsStatus", label: "Customs Status" },
  { key: "jobNumber", label: "Internal Reference", ro: true },
  { key: "typeOfPackages", label: "Type Of Packages", ro: true },
  { key: "pcs", label: "Colli", ro: true },
  { key: "cargoDescription", label: "Cargo Description", ro: true },
  { key: "hsCode", label: "HS Code", ro: true },
  { key: "totalWeightTons", label: "Total Weight In Tons", ro: true },
];

const CUSTOMS_RIGHT = [
  { key: "customsProcedure", label: "Customs Procedure" },
  { key: "mrn", label: "MRN Number" },
  { key: "totalVolumeCbm", label: "Total Volume In CBM", ro: true },
  { key: "containerNumber", label: "Container Number", ro: true },
  { key: "sealNumber", label: "Seal Number", ro: true },
  { key: "containerTypeSummary", label: "Container Type", ro: true },
  { key: "commercialInvoice", label: "Commercial Invoice number(s)" },
  { key: "commercialInvoiceValue", label: "Commercial Invoice(s) Value", ro: true },
];

// Columns of the documents table. The layout is fixed, so a long file name or reviewer
// name is cut short instead of pushing the other columns around; File takes the width
// that is left.
const DOC_COLUMNS: { label: string; width?: number }[] = [
  { label: "File" },
  { label: "Document type", width: 190 },
  { label: "Uploaded by", width: 170 },
  { label: "Customs review", width: 250 },
  { label: "", width: 84 },
];

// Every cell of a document row is laid out on the same two lines (32px + 16px, see also
// FileCell), so names, the status and its buttons share one line across the columns and
// sizes, dates and the reviewer share the other.
const DOC_CELL = "py-[13px] border-b border-[#E4E7F0]";
const DOC_BUTTON =
  "inline-flex items-center h-8 gap-[7px] text-[12.5px] font-semibold px-[10px] rounded-[7px] border border-[#D3D8E5] bg-white text-[#151B2B] cursor-pointer transition-colors";

export function CustomsTab({
  shipment,
  onCommit,
}: {
  shipment: ShipmentItem;
  onCommit: CommitFn;
}) {
  const [search, setSearch] = useState("");
  const styleFor = useMemo(() => makeStyleFor(shipment), [shipment]);

  const attachmentsQuery = useQuery({
    queryKey: ["shipment-attachments", shipment.id],
    queryFn: () => api.shipments.attachmentList(shipment.id),
  });

  const queryClient = useQueryClient();
  const [declining, setDeclining] = useState<string | null>(null);
  const [note, setNote] = useState("");

  // Customs can only approve or decline — the document type itself is set in the
  // Documents tab, so operations stays the owner of classification.
  const review = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason?: string }) =>
      api.shipments.attachmentReview(shipment.id, id, { status, note: reason ?? "" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipment-attachments", shipment.id] });
      setDeclining(null);
      setNote("");
    },
    onError: () => message.error("Could not save the review"),
  });

  // Memoised so the `?? []` fallback does not hand the memos below a new array
  // (and therefore a new dependency) on every render.
  const documents = useMemo(
    () => attachmentsQuery.data?.attachments ?? [],
    [attachmentsQuery.data?.attachments],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((d) => (d.fileName ?? "").toLowerCase().includes(q));
  }, [documents, search]);

  return (
    <div className="flex flex-col gap-3">
      <DetailCard
        icon={<SafetyCertificateOutlined />}
        title="Customs"
        columns={[CUSTOMS_LEFT, CUSTOMS_RIGHT]}
        shipment={shipment}
        onCommit={onCommit}
        styleFor={styleFor}
      />

      {/*
        customsDocsCardHtml() z mockupu: .docs2.cx > .card
        Barvy dle promennych .docs2 (--line #E4E7F0, --card-head #EDEFFC, atd.)
      */}
      <div className="bg-white border border-[#E4E7F0] rounded-[11px] overflow-hidden shadow-[0_1px_2px_rgba(21,27,43,.05)]">
        {/* .card-head */}
        <div className="flex items-center gap-[11px] flex-wrap bg-[#EDEFFC] px-[18px] py-[13px]">
          {/* .ci - ikona v ramecku */}
          <span className="w-[22px] h-[22px] rounded-[6px] grid place-items-center text-[#4457D6] border-[1.5px] border-[#4457D6] flex-none text-[12px]">
            <FileTextOutlined />
          </span>
          {/* h2 */}
          <h2 className="m-0 text-[14.5px] font-extrabold tracking-[.06em] uppercase text-[#151B2B] leading-[1.2]">
            Documents
          </h2>
          {/* .right */}
          <div className="ml-auto flex items-center gap-[10px] flex-wrap">
            {/* .count-note */}
            <span className="text-[13px] text-[#5A6478] font-semibold whitespace-nowrap">
              {docPlural(documents.length)}
              {documents.length > 0 &&
                ` · ${documents.filter((d) => d.customsStatus === "approved").length} approved · ${documents.filter((d) => d.customsStatus === "declined").length} declined`}
            </span>
            {/* .search */}
            <Input
              placeholder="Search by file name"
              prefix={<SearchOutlined className="!text-[#8B94A7] text-[15px]" />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
              className="flex-none !w-[210px] [&.ant-input-affix-wrapper]:!border-[#D3D8E5] [&.ant-input-affix-wrapper]:!rounded-lg [&.ant-input-affix-wrapper]:!py-[7px] [&.ant-input-affix-wrapper]:!px-[11px] [&_input]:!text-[13px]"
            />
          </div>
        </div>

        {/* .tablewrap */}
        <div className="overflow-x-auto">
          {/* min-w = the fixed columns (694px) + 220px left for File */}
          <table className="w-full table-fixed border-collapse min-w-[914px] [&_tbody_tr:last-child_td]:border-b-0">
            <colgroup>
              {DOC_COLUMNS.map((c, i) => (
                <col key={i} style={{ width: c.width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {DOC_COLUMNS.map((c, i) => (
                  <th
                    key={i}
                    className="text-left text-[11px] font-extrabold tracking-[.07em] uppercase text-[#4E5769] px-[18px] py-[12px] border-b border-[#E4E7F0] bg-white whitespace-nowrap"
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <Fragment key={d.id}>
                  <tr className="group transition-colors hover:bg-[#FAFBFD]">
                    {/* File */}
                    <td className={`px-[18px] align-top ${DOC_CELL}`}>
                      <FileCell fileName={d.fileName} fileSize={d.fileSize} />
                    </td>

                    {/* Document type - .type-static, v Customs jen ke cteni */}
                    <td className={`px-[18px] align-top ${DOC_CELL}`}>
                      {d.documentType ? (
                        <span className="block truncate text-[13.5px] leading-8 font-semibold text-[#5A6478]" title={d.documentType}>
                          {d.documentType}
                        </span>
                      ) : (
                        <Tooltip title="Set the type in the Documents tab">
                          <span className="text-[13.5px] leading-8 font-semibold text-[#8B94A7]">—</span>
                        </Tooltip>
                      )}
                    </td>

                    {/* Uploaded by - .val */}
                    <td className={`px-[18px] align-top ${DOC_CELL}`}>
                      <span className="block text-[13.5px] font-semibold text-[#C3392B]">
                        <span className="block truncate leading-8" title={d.uploadedByName || "Unknown"}>
                          {d.uploadedByName || "Unknown"}
                        </span>
                        <small className="block text-[12px] leading-4 font-medium text-[#8B94A7] whitespace-nowrap tabular-nums">
                          {d.createdAt ? formatDateTime(d.createdAt) : ""}
                        </small>
                      </span>
                    </td>

                    {/* Customs review - .rev. Two slots: the status (pill or Approve) and the
                        action next to it (Change or Decline), so both start at the same
                        place in every row whatever the name under the pill. */}
                    <td className={`px-[18px] align-top ${DOC_CELL}`}>
                      <div className="grid grid-cols-[108px_minmax(0,1fr)] items-center justify-items-start gap-x-2">
                        {d.customsStatus === "approved" || d.customsStatus === "declined" ? (
                          /* jiz posouzeno: stitek + tlacitko Change, pod nimi kdo/kdy */
                          <>
                            <span className="flex h-8 items-center">
                              <CustomsPill status={d.customsStatus} />
                            </span>
                            <button
                              onClick={() => review.mutate({ id: d.id, status: "" })}
                              className={`${DOC_BUTTON} hover:bg-[#F6F7FB] hover:border-[#8B94A7]`}
                            >
                              Change
                            </button>
                            {d.customsReviewedAt && (
                              <small
                                className="col-span-2 flex w-full min-w-0 text-[11px] leading-4 text-[#8B94A7] whitespace-nowrap tabular-nums"
                                title={`${d.customsReviewedByName || "Customs"} · ${formatDateTime(d.customsReviewedAt)}`}
                              >
                                <span className="truncate">{d.customsReviewedByName || "Customs"}</span>
                                <span className="flex-none">&nbsp;· {formatDateTime(d.customsReviewedAt)}</span>
                              </small>
                            )}
                          </>
                        ) : (
                          /* jeste neposouzeno: Approve / Decline */
                          <>
                            <button
                              onClick={() => review.mutate({ id: d.id, status: "approved" })}
                              className={`${DOC_BUTTON} justify-center w-full hover:border-[#177245] hover:text-[#177245] hover:bg-[#E1F3E9]`}
                            >
                              <CheckOutlined className="text-[15px]" />
                              Approve
                            </button>
                            <button
                              onClick={(e) => {
                                // Decline takes the place of Change once the review is reset, so the
                                // second click of a double-click on Change would land here.
                                if (e.detail > 1) return;
                                setDeclining(d.id);
                                setNote("");
                              }}
                              className={`${DOC_BUTTON} hover:border-[#C3392B] hover:text-[#C3392B] hover:bg-[#FBE6E4]`}
                            >
                              <CloseOutlined className="text-[15px]" />
                              Decline
                            </button>
                          </>
                        )}
                      </div>
                    </td>

                    {/* .acts - nahled a stazeni */}
                    <td className={`pl-0 pr-[18px] align-middle ${DOC_CELL}`}>
                      <div className="flex gap-[2px] justify-end opacity-60 group-hover:opacity-100 transition-opacity">
                        <Tooltip title="Preview">
                          <a
                            href={attachmentContentUrl(shipment.id, d.id)}
                            target="_blank"
                            rel="noreferrer"
                            className="w-[30px] h-[30px] rounded-[7px] grid place-items-center !text-[#5A6478] hover:!bg-[#E7EAFC] hover:!text-[#4457D6]"
                          >
                            <EyeOutlined className="text-[16px]" />
                          </a>
                        </Tooltip>
                        <Tooltip title="Download">
                          <a
                            href={attachmentContentUrl(shipment.id, d.id, true)}
                            className="w-[30px] h-[30px] rounded-[7px] grid place-items-center !text-[#5A6478] hover:!bg-[#E7EAFC] hover:!text-[#4457D6]"
                          >
                            <DownloadOutlined className="text-[16px]" />
                          </a>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>

                  {/* tr.cs-note - duvod zamitnuti v rozbalenem radku pod dokumentem */}
                  {(declining === d.id || (d.customsStatus === "declined" && d.customsNote)) && (
                    <tr className="cs-note">
                      <td colSpan={5} className="px-[18px] pb-[14px] pt-0 border-b border-[#E4E7F0] bg-[#FAFBFD]">
                        <label className="block text-[11px] font-extrabold tracking-[.07em] uppercase text-[#C3392B] mb-[5px]">
                          Reason for decline
                          <span className="block text-[11px] font-medium tracking-normal normal-case text-[#8B94A7] mt-[2px]">
                            Visible to the operations team in the Documents tab
                          </span>
                        </label>
                        {declining === d.id ? (
                          <>
                            <textarea
                              autoFocus
                              rows={2}
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                              placeholder="What is wrong with the document…"
                              className="w-full max-w-[620px] text-[13px] text-[#151B2B] border border-[#C3392B] rounded-lg px-[10px] py-2 bg-white outline-none resize-y"
                            />
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={() => review.mutate({ id: d.id, status: "declined", reason: note })}
                                className="text-[12.5px] font-semibold px-[10px] py-[5px] rounded-[7px] border border-[#C3392B] bg-[#C3392B] text-white cursor-pointer hover:brightness-110 transition-all"
                              >
                                Save decline
                              </button>
                              <button
                                onClick={() => {
                                  setDeclining(null);
                                  setNote("");
                                }}
                                className="text-[12.5px] font-semibold px-[10px] py-[5px] rounded-[7px] border border-[#D3D8E5] bg-white text-[#151B2B] cursor-pointer hover:bg-[#F6F7FB] transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="text-[13px] text-[#151B2B] max-w-[620px]">“{d.customsNote}”</div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>

          {/* .empty */}
          {filtered.length === 0 && (
            <div className="px-[18px] py-9 text-center text-[#8B94A7] text-[13.5px]">
              {documents.length === 0
                ? "No documents yet — files added in the Documents tab show up here for clearance."
                : `No file matches “${search}”.`}
            </div>
          )}
        </div>

        {/* .cs-foot */}
        <div className="px-[18px] py-[11px] border-t border-[#E4E7F0] bg-[#FAFBFD] text-[12.5px] text-[#8B94A7] font-medium">
          Document types are set in the Documents tab — customs can only approve or decline.
        </div>
      </div>
    </div>
  );
}
