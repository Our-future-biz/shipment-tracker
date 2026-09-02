"use client";

import { useMemo, useRef, useState } from "react";
import { Select, Tooltip, message } from "antd";
import {
  InboxOutlined,
  DeleteOutlined,
  EyeOutlined,
  DownloadOutlined,
  CheckOutlined,
  CloseOutlined,
  SearchOutlined,
  FileTextOutlined,
  UploadOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fileToBase64, attachmentContentUrl } from "@/lib/files";
import { formatFileSize, ExtBadge, CustomsPill } from "./docsShared";
import type { ShipmentItem } from "@/hooks/useShipments";
import { formatDate } from "@/lib/date";
import {
  DOCUMENT_TYPES,
  REQUIRED_DOCUMENT_TYPES,
  OPTIONAL_DOCUMENT_TYPES,
  guessDocumentType,
} from "@/lib/documentTypes";

interface AttachmentFile {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  createdAt: string;
  documentType: string;
  customsStatus: string;
  customsNote: string;
  customsReviewedAt: string | null;
}



/** Card shell reproducing .docs2 .card + .card-head from the mockup. */
function Card({
  icon,
  title,
  right,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-[#E4E7F0] rounded-[11px] shadow-[0_1px_2px_rgba(21,27,43,.05)] overflow-hidden">
      <div className="flex items-center gap-[11px] flex-wrap bg-[#EDEFFC] px-[18px] py-[13px]">
        <span className="w-[22px] h-[22px] rounded-[6px] grid place-items-center text-[#4457D6] border-[1.5px] border-[#4457D6] flex-none text-[12px]">
          {icon}
        </span>
        <h2 className="m-0 text-[14.5px] font-extrabold tracking-[.06em] uppercase text-[#151B2B] leading-tight">
          {title}
        </h2>
        {right && <div className="ml-auto flex items-center gap-[10px] flex-wrap">{right}</div>}
      </div>
      {children}
    </div>
  );
}

/**
 * One row of the required/optional checklist (.req / .req.done / .req.todo).
 * A missing required row is a button: clicking it opens the file picker with
 * that type pre-selected, exactly like docPreset in the mockup.
 */
function ReqRow({
  label,
  file,
  optional,
  onPick,
}: {
  label: string;
  file?: AttachmentFile;
  optional?: boolean;
  onPick?: (type: string) => void;
}) {
  const done = !!file;
  const clickable = !done && !optional && !!onPick;
  const Tag = clickable ? "button" : "div";
  return (
    <Tag
      {...(clickable ? { type: "button" as const, onClick: () => onPick!(label) } : {})}
      className={[
        "flex items-center gap-[11px] w-full px-[18px] py-[9px] text-left text-[#5A6478] border-0 bg-transparent transition-colors",
        clickable ? "cursor-pointer hover:bg-[#E7EAFC]" : "cursor-default",
      ].join(" ")}
    >
      <span
        className={[
          "w-[19px] h-[19px] rounded-[5px] flex-none grid place-items-center border-[1.5px] text-[10px]",
          done
            ? "bg-[#4457D6] border-[#4457D6] text-white"
            : optional
              ? "bg-white border-[#D3D8E5] text-transparent"
              : "bg-white border-[#C3392B] border-dashed text-transparent",
        ].join(" ")}
      >
        <CheckOutlined />
      </span>
      <span className={`text-[13.5px] font-semibold flex-1 min-w-0 ${done ? "text-[#5A6478]" : "text-[#151B2B]"}`}>
        {label}
      </span>
      {done ? (
        <Tooltip title={file!.fileName}>
          <span className="text-[11.5px] text-[#8B94A7] font-medium flex-none max-w-[120px] truncate">
            {file!.fileName}
          </span>
        </Tooltip>
      ) : optional ? null : (
        <span className="text-[10.5px] font-extrabold tracking-[.05em] uppercase text-[#C3392B] bg-[#FBE6E4] px-[7px] py-[3px] rounded-[5px] flex-none">
          Missing
        </span>
      )}
    </Tag>
  );
}


/** A file waiting to be classified before it is uploaded (docPending in the mockup). */
interface PendingFile {
  file: File;
  name: string;
  size: number;
  type: string;
  /** true when the type came from the file name rather than the user */
  guessed: boolean;
}

export function DocumentsTab({ shipment }: { shipment: ShipmentItem }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  // Files are classified BEFORE they are uploaded — nothing reaches the list
  // without a document type, so the checklist can never go stale.
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Type pre-selected by clicking a "Missing" row in the checklist.
  const presetRef = useRef<string | null>(null);

  const addFiles = (list: FileList | File[] | null) => {
    if (!list || list.length === 0) return;
    const preset = presetRef.current;
    const next = Array.from(list).map((f) => {
      const guess = preset || guessDocumentType(f.name);
      return { file: f, name: f.name, size: f.size, type: guess, guessed: !preset && !!guess };
    });
    presetRef.current = null;
    setPending((p) => [...p, ...next]);
  };

  const openPicker = (preset?: string) => {
    presetRef.current = preset ?? null;
    fileInputRef.current?.click();
  };

  const attachmentsQuery = useQuery({
    queryKey: ["shipment-attachments", shipment.id],
    queryFn: () => api.shipments.attachmentList(shipment.id),
  });

  const deleteAttachment = useMutation({
    mutationFn: (attachmentId: string) => api.shipments.attachmentDelete(shipment.id, attachmentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipment-attachments", shipment.id] }),
  });

  // Uploads the whole classified queue in one go ("Add to list" in the mockup).
  const savePending = async () => {
    if (pending.length === 0 || pending.some((p) => !p.type)) return;
    setSaving(true);
    const failed: string[] = [];
    for (const p of pending) {
      try {
        const contentBase64 = await fileToBase64(p.file);
        await api.shipments.attachmentCreate(shipment.id, {
          fileName: p.name,
          fileSize: p.size,
          fileType: p.file.type || "application/octet-stream",
          contentBase64,
          documentType: p.type,
        });
      } catch (err) {
        // Surface the real reason (size limit, network, server) instead of a
        // generic failure — a silent no-op is impossible to diagnose.
        console.error("Attachment upload failed", p.name, err);
        failed.push(`${p.name}: ${err instanceof Error ? err.message : "unknown error"}`);
      }
    }
    await queryClient.invalidateQueries({ queryKey: ["shipment-attachments", shipment.id] });
    setSaving(false);

    if (failed.length === 0) {
      message.success(pending.length === 1 ? "Document added" : `${pending.length} documents added`);
      setPending([]);
      return;
    }
    // Keep the failed ones in the queue so the user can retry without re-picking.
    message.error({ content: failed[0], duration: 8 });
    const failedNames = new Set(failed.map((f) => f.split(":")[0]));
    setPending((list) => list.filter((p) => failedNames.has(p.name)));
  };

  // Assign a business document type. Separate from upload so a file can be
  // re-classified later without re-uploading it.
  const classify = useMutation({
    mutationFn: ({ id, documentType }: { id: string; documentType: string }) =>
      api.shipments.attachmentClassify(shipment.id, id, { documentType }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipment-attachments", shipment.id] }),
    onError: () => message.error("Could not save the document type"),
  });

  const attachments: AttachmentFile[] = (attachmentsQuery.data?.attachments ?? []) as AttachmentFile[];
  const contentUrl = (id: string, download = false) => attachmentContentUrl(shipment.id, id, download);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? attachments.filter((a) => a.fileName.toLowerCase().includes(q)) : attachments;
  }, [attachments, search]);

  const byType = useMemo(() => {
    const m = new Map<string, AttachmentFile>();
    for (const a of attachments) if (a.documentType && !m.has(a.documentType)) m.set(a.documentType, a);
    return m;
  }, [attachments]);

  const have = REQUIRED_DOCUMENT_TYPES.filter((t) => byType.has(t)).length;
  const left = REQUIRED_DOCUMENT_TYPES.length - have;

  return (
    <div className="grid gap-5 items-start max-w-[1500px] xl:grid-cols-[minmax(0,1fr)_340px]">
      {/* Left column: upload + document list */}
      <div className="grid gap-5 min-w-0">
        <Card icon={<UploadOutlined />} title="Add documents">
          <div className="p-[18px]">
            {/* Hidden input so a "Missing" checklist row can open the picker with a preset type. */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {/*
              Plain drop zone rather than Upload.Dragger's own upload pipeline:
              files are queued for classification first, and both the drop and the
              Browse button hand over real File objects (antd's beforeUpload passes
              a wrapped RcFile, which does not survive the queue reliably).
            */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                addFiles(e.dataTransfer.files);
              }}
              onClick={() => openPicker()}
              className={[
                "border-[1.5px] border-dashed rounded-[9px] p-5 cursor-pointer transition-colors",
                dragOver ? "border-[#4457D6] bg-[#E7EAFC]" : "border-[#D3D8E5] bg-[#FAFBFD]",
              ].join(" ")}
            >
              <div className="flex items-center gap-4 flex-wrap px-2 py-1">
                <span className="w-10 h-10 rounded-[9px] bg-[#E7EAFC] text-[#4457D6] grid place-items-center flex-none text-[19px]">
                  <InboxOutlined />
                </span>
                <span className="flex-1 min-w-[190px] text-left">
                  <b className="block text-[14.5px] font-bold text-[#151B2B]">Drag files here</b>
                  <span className="text-[12.5px] text-[#8B94A7]">
                    PDF, XLSX, DOCX, JPG · max 25 MB per file
                  </span>
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openPicker();
                  }}
                  className="text-[13.5px] font-semibold px-[15px] py-2 rounded-lg bg-[#4457D6] text-white border-0 cursor-pointer hover:brightness-110"
                >
                  Browse files
                </button>
              </div>
            </div>

            {pending.length > 0 && (
              <div className="mt-4 border border-[#4457D6] rounded-[9px] overflow-hidden">
                <div className="px-4 py-2.5 bg-[#E7EAFC] border-b border-[#E4E7F0] text-[12.5px] font-extrabold tracking-[.06em] uppercase text-[#4457D6]">
                  {pending.length} {pending.length === 1 ? "file" : "files"} to classify
                </div>
                <div>
                  {pending.map((p, i) => (
                    <div
                      key={`${p.name}-${i}`}
                      className="flex items-center gap-[13px] px-4 py-[11px] flex-wrap border-b border-[#E4E7F0] last:border-b-0"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-[190px]">
                        <ExtBadge fileName={p.name} />
                        <span className="min-w-0">
                          <span className="font-semibold text-[#151B2B] truncate block">{p.name}</span>
                          <span className="text-[12px] text-[#8B94A7] font-medium">{formatFileSize(p.size)}</span>
                        </span>
                      </div>
                      {p.guessed && p.type && (
                        <span className="text-[10.5px] font-bold tracking-[.05em] uppercase text-[#177245] bg-[#E1F3E9] px-[7px] py-[3px] rounded-[5px]">
                          guessed from name
                        </span>
                      )}
                      <Select
                        size="small"
                        value={p.type || undefined}
                        placeholder="Select type"
                        options={DOCUMENT_TYPES.map((t) => ({ value: t, label: t }))}
                        onChange={(v) =>
                          setPending((list) =>
                            list.map((x, xi) => (xi === i ? { ...x, type: v, guessed: false } : x)),
                          )
                        }
                        className="min-w-[200px]"
                        status={p.type ? undefined : "warning"}
                      />
                      <Tooltip title="Remove">
                        <button
                          type="button"
                          onClick={() => setPending((list) => list.filter((_, xi) => xi !== i))}
                          className="w-[30px] h-[30px] rounded-[7px] grid place-items-center text-[#5A6478] hover:bg-[#FBE6E4] hover:text-[#C3392B] border-0 bg-transparent cursor-pointer"
                        >
                          <CloseOutlined />
                        </button>
                      </Tooltip>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2.5 flex-wrap px-4 py-3 bg-[#FAFBFD] border-t border-[#E4E7F0]">
                  <span className="text-[12.5px] text-[#95620B] font-semibold mr-auto">
                    {pending.filter((p) => !p.type).length === 0
                      ? ""
                      : pending.filter((p) => !p.type).length === 1
                        ? "1 file still needs a type"
                        : `${pending.filter((p) => !p.type).length} files still need a type`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPending([])}
                    className="text-[13.5px] font-semibold px-[15px] py-2 rounded-lg border border-[#D3D8E5] bg-white text-[#151B2B] cursor-pointer hover:bg-[#F6F7FB]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={saving || pending.some((p) => !p.type)}
                    onClick={savePending}
                    className="text-[13.5px] font-semibold px-[15px] py-2 rounded-lg bg-[#4457D6] text-white border-0 cursor-pointer hover:brightness-110 disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:brightness-100"
                  >
                    {saving ? "Adding…" : "Add to list"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card
          icon={<FileTextOutlined />}
          title="Documents"
          right={
            <>
              <span className="text-[13px] text-[#5A6478] font-semibold">
                {attachments.length} {attachments.length === 1 ? "file" : "files"}
              </span>
              <span className="flex items-center gap-2 border border-[#D3D8E5] bg-white rounded-lg px-[11px] py-[7px] text-[13px] min-w-[210px]">
                <SearchOutlined className="text-[#8B94A7]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by file name"
                  className="border-0 bg-transparent outline-none w-full text-[#151B2B]"
                />
              </span>
            </>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[760px]">
              <thead>
                <tr>
                  {[
                    ["File", "min-w-[260px]"],
                    ["Document type", "w-[200px]"],
                    ["Uploaded by", "w-[160px]"],
                    ["Customs", "w-[190px]"],
                    ["", "w-[110px]"],
                  ].map(([label, w]) => (
                    <th
                      key={label || "acts"}
                      className={`text-left text-[11px] font-extrabold tracking-[.07em] uppercase text-[#4E5769] px-[18px] py-3 border-b border-[#E4E7F0] bg-white ${w}`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((file) => (
                  <tr key={file.id} className="hover:bg-[#FAFBFD] transition-colors group">
                    <td className="px-[18px] py-[13px] border-b border-[#E4E7F0] align-middle">
                      <div className="flex items-center gap-3 min-w-0">
                        <ExtBadge fileName={file.fileName} />
                        <span className="min-w-0">
                          <a
                            href={contentUrl(file.id)}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-[#4457D6] truncate block"
                          >
                            {file.fileName}
                          </a>
                          <span className="text-[12px] text-[#8B94A7] font-medium">
                            {formatFileSize(file.fileSize)}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="px-[18px] py-[13px] border-b border-[#E4E7F0] align-middle">
                      <Select
                        size="small"
                        value={file.documentType || undefined}
                        placeholder="Select type"
                        options={DOCUMENT_TYPES.map((t) => ({ value: t, label: t }))}
                        onChange={(v) => classify.mutate({ id: file.id, documentType: v })}
                        className="w-full max-w-[190px]"
                        status={file.documentType ? undefined : "warning"}
                      />
                    </td>
                    <td className="px-[18px] py-[13px] border-b border-[#E4E7F0] align-middle">
                      <span className="text-[13.5px] font-semibold text-[#C3392B] whitespace-nowrap">
                        You
                        <small className="block text-[12px] font-medium text-[#8B94A7]">
                          {formatDate(file.createdAt)}
                        </small>
                      </span>
                    </td>
                    <td className="px-[18px] py-[13px] border-b border-[#E4E7F0] align-middle">
                      <div className="flex flex-col gap-[3px] items-start">
                        <CustomsPill status={file.customsStatus} />
                        {file.customsStatus === "declined" && file.customsNote && (
                          <span className="text-[12px] text-[#5A6478] max-w-[210px]">
                            “{file.customsNote}”
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-[18px] py-[13px] border-b border-[#E4E7F0] align-middle">
                      <div className="flex gap-[2px] justify-end opacity-60 group-hover:opacity-100 transition-opacity">
                        <Tooltip title="Preview">
                          <a
                            href={contentUrl(file.id)}
                            target="_blank"
                            rel="noreferrer"
                            className="w-[30px] h-[30px] rounded-[7px] grid place-items-center text-[#5A6478] hover:bg-[#E7EAFC] hover:text-[#4457D6]"
                          >
                            <EyeOutlined />
                          </a>
                        </Tooltip>
                        <Tooltip title="Download">
                          <a
                            href={contentUrl(file.id, true)}
                            className="w-[30px] h-[30px] rounded-[7px] grid place-items-center text-[#5A6478] hover:bg-[#E7EAFC] hover:text-[#4457D6]"
                          >
                            <DownloadOutlined />
                          </a>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <button
                            onClick={() => deleteAttachment.mutate(file.id)}
                            className="w-[30px] h-[30px] rounded-[7px] grid place-items-center text-[#5A6478] hover:bg-[#FBE6E4] hover:text-[#C3392B] border-0 bg-transparent cursor-pointer"
                          >
                            <DeleteOutlined />
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="px-[18px] py-9 text-center text-[#8B94A7] text-[13.5px]">
                {attachments.length === 0
                  ? "No documents yet. Drag a file into the area above."
                  : `No file matches “${search}”.`}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Right column: required-documents checklist */}
      <Card
        icon={<UnorderedListOutlined />}
        title="Required documents"
        right={
          <span className="text-[13.5px] font-extrabold text-[#5A6478] tabular-nums">
            {have} / {REQUIRED_DOCUMENT_TYPES.length}
          </span>
        }
      >
        <div className="pt-1.5 pb-2">
          {REQUIRED_DOCUMENT_TYPES.map((t) => (
            <ReqRow key={t} label={t} file={byType.get(t)} onPick={openPicker} />
          ))}
          <div className="px-[18px] pt-[9px] pb-1 text-[11px] font-extrabold tracking-[.07em] uppercase text-[#4E5769]">
            Optional
          </div>
          {OPTIONAL_DOCUMENT_TYPES.map((t) => (
            <ReqRow key={t} label={t} file={byType.get(t)} optional />
          ))}
        </div>
        <div
          className={`px-[18px] py-[11px] border-t border-[#E4E7F0] bg-[#FAFBFD] text-[12.5px] font-semibold ${
            left ? "text-[#5A6478]" : "text-[#177245]"
          }`}
        >
          {left
            ? left === 1
              ? "1 required document is missing"
              : `${left} required documents are missing`
            : "All required documents are in place"}
        </div>
      </Card>
    </div>
  );
}
