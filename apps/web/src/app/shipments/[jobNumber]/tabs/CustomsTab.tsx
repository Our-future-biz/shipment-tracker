"use client";

import { useDocumentChangeRequests } from "@/hooks/useDocumentChangeRequests";
import { useAuth, useCanManageDocuments } from "@/lib/auth/AuthContext";
import { canChangeShipmentDetails } from "@/lib/shipmentEditRule";
import { ChangeAfterApprovalModal, ChangeRequestNote } from "./ChangeAfterApprovalModal";
import { Fragment, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { DatePicker, Input, Modal, Select, TimePicker, Tooltip } from "antd";
import { useToast } from "@/lib/toast";
import dayjs, { type Dayjs } from "dayjs";
import {
  SafetyCertificateOutlined,
  FileTextOutlined,
  SearchOutlined,
  CheckOutlined,
  CloseOutlined,
  EyeOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import { api, apiFileUrl } from "@/lib/api";
import { useFilePreview } from "@/hooks/useFilePreview";
import { useShipmentMutations, type ShipmentItem } from "@/hooks/useShipments";
import { DetailCard, RoRow, makeStyleFor, type CommitFn } from "../ShipmentDetailContent";
import { fmtNum, isDangerousShipment, shipmentWeightKg } from "@/lib/cargo";
import { formatDateTime } from "@/lib/date";
import { useShipmentAttachments } from "@/hooks/useShipmentAttachments";
import type { interfaces } from "@/lib/api/client";
import { FileCell, CustomsPill, docPlural } from "./docsShared";
import { CustomerLinkField } from "../_components/CustomerLinkField";
import { EditableCell } from "../_components/EditableCell";
import { customsTabGroups, documentGroupOf, isReviewedDocumentType } from "@/lib/documentTypes";
import { LABEL, ROW } from "../_components/detailStyles";
import { CountChip } from "@/components/SectionCard";
import { BTN, BTN_DANGER, CARD, CARD_BAR, CARD_ICON, CARD_TITLE, EMPTY, HINT, ICON_BTN_GHOST, LABEL_TEXT, LINK, TH } from "@/styles/ui";

// Statuses the server derives from the paperwork; while one of them shows, the field is locked.
const PAPERWORK_STATUSES = ["Waiting For Commercial Paperwork", "Paperwork Verification Pending"];
// Once the paperwork is verified, the only values the server accepts.
const MANUAL_STATUSES = ["Paperwork Verified", "Under Customs Clearance", "Customs Cleared/Released"];


// Field layout mirrors CUSTOMS_L / CUSTOMS_R from the approved mockup. Read-only
// fields are derived elsewhere (containers, cargo lines) and must not be edited here.
// The total weight is shown in kg (a row put before Total Volume In CBM, see weightKg), not in tons.
const CUSTOMS_LEFT = [
  { key: "jobNumber", label: "Internal Reference", ro: true },
  { key: "pcs", label: "Colli", ro: true },
  { key: "typeOfPackages", label: "Type Of Packages", ro: true },
  { key: "totalVolumeCbm", label: "Total Volume In CBM", ro: true },
  { key: "cargoDescription", label: "Cargo Description", ro: true },
  { key: "hsCode", label: "HS Code", ro: true },
  // The goods' country of origin, which customs declares: the shipment's own field, edited here as
  // in the Cargo & Commercial card (a country picker), by whoever may change it there.
  { key: "cargoOrigin", label: "Cargo Origin" },
];

// Left out of the card in the Customs section: Container Number is a link there instead
// (ContainerNumberRow), and the seal is listed with its container in the Containers card.
const CUSTOMS_OVERVIEW_HIDDEN = ["containerNumber", "sealNumber"];

/** Id of the Containers card on the Customs section's page; Container Number links to it. */
export const CUSTOMS_CONTAINERS_ID = "customs-containers";

// In the Customs section the container number is a link down to the Containers card, where
// each container is listed with its seal, type, packages, weight and volume.
function ContainerNumberRow({ value }: { value: string }) {
  return (
    <div className={ROW}>
      <span className={LABEL}>Container Number</span>
      <div className="flex-1 min-w-0">
        {value ? (
          <a
            href={`#${CUSTOMS_CONTAINERS_ID}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(CUSTOMS_CONTAINERS_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className={`${LINK} font-medium`}
          >
            {value}
          </a>
        ) : (
          <span className={EMPTY}>—</span>
        )}
      </div>
    </div>
  );
}

// Customs Priority is rendered as the first row of this column (see CustomsPriorityRow).
const CUSTOMS_RIGHT = [
  { key: "customsStatus", label: "Customs Status" },
  { key: "customsProcedure", label: "Customs Procedure" },
  { key: "mrn", label: "MRN Number" },
  { key: "containerNumber", label: "Container Number", ro: true },
  { key: "sealNumber", label: "Seal Number", ro: true },
  { key: "containerTypeSummary", label: "Container Type", ro: true },
  { key: "commercialInvoice", label: "Invoice Number(s)" },
  { key: "commercialInvoiceValue", label: "Invoice Value", ro: true },
];

// Columns of the documents table. The layout is fixed, so a long file name or reviewer
// name is cut short instead of pushing the other columns around; File takes the width
// that is left.
const REVIEW_COLUMN = "Customs review";
const DOC_COLUMNS: { label: string; widthClass?: string }[] = [
  { label: "File" },
  { label: "Document type", widthClass: "w-[190px]" },
  { label: "Uploaded by", widthClass: "w-[170px]" },
  { label: REVIEW_COLUMN, widthClass: "w-[300px]" },
  { label: "", widthClass: "w-[84px]" },
];

// Every cell of a document row is laid out on the same two lines (32px + 16px, see also
// FileCell), so names, the status and its buttons share one line across the columns and
// sizes, dates and the reviewer share the other.
const DOC_CELL = "py-[13px] border-b border-slate-100";
/** A row's Preview / Download: an icon button; "!" beats antd's own <a> colour. */
const DOC_ICON_LINK = `${ICON_BTN_GHOST} !text-slate-500 hover:!text-slate-900`;
/** The label over a reason for decline: small bold caps (LABEL_TEXT), in red. */
const DECLINE_LABEL = LABEL_TEXT.replace("text-slate-900", "text-red-600");

// The shipment's total weight in kg: from the cargo lines, else the typed tons × 1000 - to 0.01 kg,
// as the Cargo Details total shows it.
function weightKg(shipment: ShipmentItem): string {
  const kg = shipmentWeightKg(shipment);
  return kg == null ? "" : fmtNum(kg);
}

const PRIORITY_DOT: Record<string, string> = { Standard: "bg-emerald-500", Urgent: "bg-red-500" };

const priorityLabel = (value: string) => (
  <span className="inline-flex items-center gap-2 font-medium text-slate-900">
    <span className={`w-2.5 h-2.5 rounded-full flex-none ${PRIORITY_DOT[value] ?? "bg-slate-300"}`} />
    {value}
  </span>
);

// Customs Status while it follows the paperwork: the same conditional colours as the editable
// field (and as the Shipments list), only without the double-click.
// Customs Status once the paperwork is verified: editable, offering only the steps from there on.
function ManualStatusRow({ value, style, onCommit }: { value: string; style?: React.CSSProperties; onCommit: CommitFn }) {
  return (
    <div className={ROW}>
      <span className={LABEL}>Customs Status</span>
      <EditableCell
        className="flex-1 min-w-0"
        fieldKey="customsStatus"
        value={value}
        options={MANUAL_STATUSES}
        onCommit={onCommit}
        displayClassName="text-slate-900"
        displayStyle={style}
      />
    </div>
  );
}

function LockedStatusRow({ value, style }: { value: string; style?: React.CSSProperties }) {
  return (
    <div className={ROW}>
      <span className={LABEL}>Customs Status</span>
      <span className="flex-1 min-w-0" title="Follows the invoice and the packing list">
        <span className="text-slate-900" style={style}>
          {value}
        </span>
      </span>
    </div>
  );
}

const DEADLINE_FORMAT = "YYYY-MM-DD HH:mm";

type CustomsPriority = interfaces.CustomsPriority;
const PRIORITIES: CustomsPriority[] = ["Standard", "Urgent"];

// Customs Priority shows its coloured dot all the time, so an urgent shipment stands out;
// like the other fields it is changed after a double-click. Switching to Urgent asks for the
// deadline first and only takes effect once it is confirmed. Sits at the top of the right column.
function CustomsPriorityRow({
  value,
  deadline,
  onChange,
}: {
  value: CustomsPriority | "";
  deadline: string;
  onChange: (priority: CustomsPriority, deadline: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  // Deadline being picked in the dialog; null while the dialog is closed.
  const [asking, setAsking] = useState<{ date: Dayjs | null; time: Dayjs | null } | null>(null);
  const complete = !!asking?.date && !!asking.time;
  const current = value || "Standard";
  return (
    <div className={ROW}>
      <span className={LABEL}>Customs Priority</span>
      {editing ? (
        <Select<CustomsPriority>
          size="small"
          autoFocus
          defaultOpen
          aria-label="Customs Priority"
          defaultValue={current}
          onSelect={(next) => {
            setEditing(false);
            if (next === "Urgent") {
              const known = deadline ? dayjs(deadline) : null;
              setAsking({ date: known, time: known });
            }
            else if (next !== current) onChange(next, "");
          }}
          onBlur={() => setEditing(false)}
          options={PRIORITIES.map((o) => ({ value: o, label: priorityLabel(o) }))}
          className="flex-1 min-w-[140px]"
        />
      ) : (
        <div
          className="flex-1 min-w-0 cursor-pointer rounded px-1 -mx-1 hover:bg-slate-100"
          title="Double-click to edit"
          onDoubleClick={() => setEditing(true)}
        >
          {priorityLabel(current)}
          {current === "Urgent" && deadline && (
            <span className="font-medium text-slate-900"> — {formatDateTime(deadline)}</span>
          )}
        </div>
      )}

      <Modal
        open={!!asking}
        title="Urgent — customs deadline"
        okText="Confirm"
        cancelText="Cancel"
        width={380}
        // Near the top of the window, so the calendar and the time list have room to open
        // below their fields instead of flipping up over the dialog.
        className="!top-[72px]"
        destroyOnHidden
        okButtonProps={{ disabled: !complete }}
        onOk={() => {
          if (!asking?.date || !asking.time) return;
          const at = asking.date.hour(asking.time.hour()).minute(asking.time.minute());
          onChange("Urgent", at.format(DEADLINE_FORMAT));
          setAsking(null);
        }}
        onCancel={() => setAsking(null)}
      >
        <p className="mt-0 mb-2 text-[13px] text-slate-700">By when does customs have to clear this shipment?</p>
        <div className="flex gap-2">
          <DatePicker
            format="DD.MM.YYYY"
            placeholder="Date"
            aria-label="Customs deadline date"
            value={asking?.date ?? null}
            onChange={(date) => setAsking((a) => (a ? { ...a, date } : a))}
            placement="bottomLeft"
            className="flex-1"
          />
          <TimePicker
            format="HH:mm"
            placeholder="Time"
            aria-label="Customs deadline time"
            value={asking?.time ?? null}
            onChange={(time) => setAsking((a) => (a ? { ...a, time } : a))}
            needConfirm
            placement="bottomLeft"
            className="w-[120px]"
          />
        </div>
      </Modal>
    </div>
  );
}

export function CustomsTab({
  shipment,
  onCommit,
  canReview = false,
  section,
}: {
  shipment: ShipmentItem;
  onCommit: CommitFn;
  /**
   * True in the Customs section, where documents are approved, declined and changed. Without
   * it the documents show the review without the buttons. The shipment's own Customs tab
   * shows only the Customs card (section "details"), with no documents.
   */
  canReview?: boolean;
  /** Shows only that part (the Customs section has them on separate tabs); left out, both. */
  section?: "details" | "documents";
}) {
  const toast = useToast();
  const filePreview = useFilePreview();
  const [search, setSearch] = useState("");
  const { updateShipment } = useShipmentMutations();
  // Invoice Value is the total of the cargo lines per currency whenever they
  // carry values; the shipment's own field is only the fallback.
  const cardShipment = useMemo(
    () => (shipment.civByCurrency ? { ...shipment, commercialInvoiceValue: shipment.civByCurrency } : shipment),
    [shipment],
  );
  const styleFor = useMemo(() => makeStyleFor(cardShipment), [cardShipment]);

  // The server sets the status from the paperwork: waiting until the invoice and the packing
  // list are uploaded, pending until they are approved, then verified. Only from there on is
  // it changed by hand.
  const paperworkIn = !PAPERWORK_STATUSES.includes(shipment.customsStatus);
  // The status is drawn by its own row: LockedStatusRow while it follows the paperwork (same
  // colours, no editing), ManualStatusRow with only the allowed steps after that.
  // In the shipment's own Customs tab Invoice Value closes the left column, so
  // both columns have the same number of rows. The Customs section's card is already even
  // (Principal Party on the left, two container rows fewer on the right), so it keeps the value on the right.
  const civOnLeft = !canReview;
  // Cargo Origin is a detail of the shipment, changed only by those the shipment edit rule lets
  // (lib/shipmentEditRule); the customs fields of the card stay open to the department.
  const { user } = useAuth();
  const detailsEditable = canChangeShipmentDetails(user, shipment);
  const leftFields = civOnLeft ? [...CUSTOMS_LEFT, ...CUSTOMS_RIGHT.filter((f) => f.key === "commercialInvoiceValue")] : CUSTOMS_LEFT;
  // Cargo Origin reads as text for whoever the edit rule doesn't let change the shipment's details.
  const leftColumn = detailsEditable ? leftFields : leftFields.map((f) => (f.key === "cargoOrigin" ? { ...f, ro: true } : f));
  const rightColumn = (canReview ? CUSTOMS_RIGHT.filter((f) => !CUSTOMS_OVERVIEW_HIDDEN.includes(f.key)) : CUSTOMS_RIGHT).filter(
    (f) => f.key !== "customsStatus" && !(civOnLeft && f.key === "commercialInvoiceValue"),
  );

  const { attachments, refresh: refreshDocuments } = useShipmentAttachments(shipment.id);

  const [declining, setDeclining] = useState<string | null>(null);
  // A regular user changes an approved document by a request for a manager's approval, with the new file.
  const canManageDocuments = useCanManageDocuments();
  const changeRequests = useDocumentChangeRequests(shipment.id, !!canReview && section !== "details");
  const [changing, setChanging] = useState<{ id: string; fileName: string; documentType: string } | null>(null);
  const [note, setNote] = useState("");

  // Customs can only approve or decline — the document type itself is set in the
  // Documents tab, so operations stays the owner of classification.
  const review = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: interfaces.AttachmentCustomsStatus; reason?: string }) =>
      api.shipments.attachmentReview(shipment.id, id, { status, note: reason ?? "" }),
    onSuccess: () => {
      // Approving or declining the paperwork moves the shipment's customs status too.
      refreshDocuments();
      setDeclining(null);
      setNote("");
    },
    onError: () => toast.error("Could not save the review"),
  });

  // Memoised so the `?? []` fallback does not hand the memo below a new array
  // (and therefore a new dependency) on every render.
  const matching = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return attachments;
    return attachments.filter((d) => (d.fileName ?? "").toLowerCase().includes(q));
  }, [attachments, search]);

  return (
    <div className="flex flex-col gap-3">
      {filePreview.modal}
      {section !== "documents" && (
      <DetailCard
        icon={<SafetyCertificateOutlined />}
        // The Customs section calls its card Customs Overview; in the shipment it is the Customs tab's card.
        title={canReview ? "Customs Overview" : "Customs"}
        columns={[leftColumn, rightColumn]}
        renderAfter={
          canReview
            ? {
                jobNumber: (
                  <>
                    {/* The party customs clears for: picked from the customer database, like the
                        parties in the shipment; saved together with its link. */}
                    <CustomerLinkField
                      label="Principal Party"
                      name={shipment.principalParty}
                      customerId={shipment.principalPartyId}
                      onChange={(principalParty, principalPartyId) =>
                        updateShipment({ id: shipment.id, data: { principalParty, principalPartyId } }).catch(() =>
                          toast.error("Could not save the principal party"),
                        )
                      }
                    />
                  </>
                ),
              }
            : undefined
        }
        shipment={cardShipment}
        onCommit={onCommit}
        styleFor={styleFor}
        renderBefore={{
          customsProcedure: (
            <>
            {paperworkIn ? (
              <ManualStatusRow value={shipment.customsStatus} style={styleFor("customsStatus", shipment.customsStatus)} onCommit={onCommit} />
            ) : (
              <LockedStatusRow value={shipment.customsStatus} style={styleFor("customsStatus", shipment.customsStatus)} />
            )}
            <CustomsPriorityRow
              value={shipment.customsPriority}
              deadline={shipment.customsDeadline}
              // Priority and deadline are saved together, so there is never an Urgent without one.
              onChange={(customsPriority, customsDeadline) =>
                updateShipment({ id: shipment.id, data: { customsPriority, customsDeadline } }).catch(() =>
                  toast.error("Could not save the priority"),
                )
              }
            />
            </>
          ),
          // The same total weight as everywhere else (stored and worked out in tons), shown in kg.
          totalVolumeCbm: <RoRow label="Total Weight In KG" value={weightKg(cardShipment)} />,
          // In the Customs section the container number is a link, in the place of the plain field.
          ...(canReview ? { containerTypeSummary: <ContainerNumberRow value={shipment.containerNumber} /> } : {}),
        }}
      />
      )}

      {/*
        customsDocsCardHtml() z mockupu: .docs2.cx > .card - in the app's card (CARD, CARD_BAR,
        CARD_TITLE), as every card of the shipment.
      */}
      {changing && (
        <ChangeAfterApprovalModal
          document={changing}
          saving={changeRequests.ask.isPending}
          onSend={(attachmentId, file, reason) => changeRequests.ask.mutateAsync({ attachmentId, file, reason })}
          onClose={() => setChanging(null)}
        />
      )}
      {section !== "details" && customsTabGroups(isDangerousShipment(shipment), attachments.map((a) => a.documentType)).map((group, index) => {
        const inGroup = (d: { documentType: string }) => documentGroupOf(d.documentType) === group;
        const documents = attachments.filter(inGroup);
        const filtered = matching.filter(inGroup);
        // The commercial and the customs documents are approved or declined; shipping ones are not.
        const reviewed = group.types.some(isReviewedDocumentType);
        // A table that is not reviewed has no Customs review column at all.
        const columns = reviewed ? DOC_COLUMNS : DOC_COLUMNS.filter((c) => c.label !== REVIEW_COLUMN);
        return (
          <div key={group.title} className={`${CARD} overflow-hidden`}>
            {/* .card-head */}
            <div className={`${CARD_BAR} flex-wrap`}>
              {/* .ci - ikona */}
              <span aria-hidden className={`${CARD_ICON} shrink-0`}>
                <FileTextOutlined />
              </span>
              {/* h2 */}
              <h2 className={`${CARD_TITLE} min-w-0`}>
                {group.title}
              </h2>
              {/* .right */}
              <div className="ml-auto flex items-center gap-2 flex-wrap">
                {/* .count-note */}
                <CountChip
                  count={`${docPlural(documents.length)}${
                    reviewed && documents.length > 0
                      ? ` · ${documents.filter((d) => d.customsStatus === "approved").length} approved · ${documents.filter((d) => d.customsStatus === "declined").length} declined`
                      : ""
                  }`}
                />
                {/* .search - one search for all three lists, kept in the first card */}
                {index === 0 && (
                <Input
                  placeholder="Search by file name"
                  prefix={<SearchOutlined className="!text-slate-400" />}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  allowClear
                  className="flex-none !w-[210px]"
                />
                )}
              </div>
            </div>

            {/* .tablewrap */}
            <div className="overflow-x-auto">
              {/* min-w = the fixed columns (694px) + 220px left for File */}
              <table className="w-full table-fixed border-collapse min-w-[914px] [&_tbody_tr:last-child_td]:border-b-0">
                <colgroup>
                  {columns.map((c, i) => (
                    <col key={i} className={c.widthClass} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {columns.map((c, i) => (
                      <th key={i} className={`${TH} !px-4`}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => (
                    <Fragment key={d.id}>
                      <tr className="group transition-colors hover:bg-slate-50">
                        {/* File */}
                        <td className={`px-4 align-top ${DOC_CELL}`}>
                          <FileCell fileName={d.fileName} fileSize={d.fileSize} />
                        </td>

                        {/* Document type - .type-static, v Customs jen ke cteni */}
                        <td className={`px-4 align-top ${DOC_CELL}`}>
                          {d.documentType ? (
                            <span className="block truncate text-[13px] leading-8 text-slate-700" title={d.documentType}>
                              {d.documentType}
                            </span>
                          ) : (
                            <Tooltip title="Set the type in the Documents tab">
                              <span className={`text-[13px] leading-8 ${EMPTY}`}>—</span>
                            </Tooltip>
                          )}
                        </td>

                        {/* Uploaded by - .val */}
                        <td className={`px-4 align-top ${DOC_CELL}`}>
                          <span className="block text-[13px] text-slate-700">
                            <span className="block truncate leading-8" title={d.uploadedByName || "Unknown"}>
                              {d.uploadedByName || "Unknown"}
                            </span>
                            <small className={`block ${HINT} leading-4 whitespace-nowrap tabular-nums`}>
                              {d.createdAt ? formatDateTime(d.createdAt) : ""}
                            </small>
                          </span>
                        </td>

                        {/* Customs review - .rev. Two slots: the status (pill or Approve) and the
                            action next to it (Change or Decline), so both start at the same
                            place in every row whatever the name under the pill. */}
                        {reviewed && (
                        <td className={`px-4 align-top ${DOC_CELL}`}>
                          <div className="grid grid-cols-[108px_minmax(0,1fr)] items-center justify-items-start gap-x-2">
                            {d.customsStatus === "approved" || d.customsStatus === "declined" ? (
                              /* jiz posouzeno: stitek + tlacitko Change, pod nimi kdo/kdy */
                              <>
                                <span className="flex h-8 items-center">
                                  <CustomsPill status={d.customsStatus} />
                                </span>
                                {canReview && d.customsStatus === "approved" && !canManageDocuments ? (
                                  // An approved document changes only with a manager's approval.
                                  changeRequests.newestOf.get(d.id)?.status === "pending" ? (
                                    <span />
                                  ) : (
                                    // A link, as under an approved document in the Documents tab.
                                    <button
                                      type="button"
                                      onClick={() => setChanging(d)}
                                      className={`${LINK} whitespace-nowrap text-[12px] font-medium cursor-pointer bg-transparent border-none p-0`}
                                    >
                                      Change after approval
                                    </button>
                                  )
                                ) : canReview ? (
                                  <button
                                    onClick={() => review.mutate({ id: d.id, status: "" })}
                                    className={BTN}
                                  >
                                    Change
                                  </button>
                                ) : (
                                  <span />
                                )}
                                {d.customsReviewedAt && (
                                  <small
                                    className="col-span-2 flex w-full min-w-0 text-[11px] leading-4 text-slate-500 whitespace-nowrap tabular-nums"
                                    title={`${d.customsReviewedByName || "Customs"} · ${formatDateTime(d.customsReviewedAt)}`}
                                  >
                                    <span className="truncate">{d.customsReviewedByName || "Customs"}</span>
                                    <span className="flex-none">&nbsp;· {formatDateTime(d.customsReviewedAt)}</span>
                                  </small>
                                )}
                                {canReview && d.customsStatus === "approved" && <ChangeRequestNote request={changeRequests.newestOf.get(d.id)} canAnswer={canManageDocuments} />}
                              </>
                            ) : !canReview ? (
                              <span className="col-span-2 flex h-8 items-center">
                                <CustomsPill status="" />
                              </span>
                            ) : (
                              /* jeste neposouzeno: Approve / Decline */
                              <>
                                <button
                                  onClick={() => review.mutate({ id: d.id, status: "approved" })}
                                  className={`${BTN} w-full`}
                                >
                                  <CheckOutlined className="text-[14px] text-emerald-600" />
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
                                  className={BTN}
                                >
                                  <CloseOutlined className="text-[14px] text-red-600" />
                                  Decline
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                        )}

                        {/* .acts - nahled a stazeni */}
                        <td className={`pl-0 pr-4 align-middle ${DOC_CELL}`}>
                          <div className="flex gap-0.5 justify-end opacity-60 group-hover:opacity-100 transition-opacity">
                            <Tooltip title="Preview">
                              <a
                                href={apiFileUrl(d.contentUrl)}
                                target="_blank"
                                rel="noreferrer"
                                onClick={filePreview.previewOnClick(d)}
                                className={DOC_ICON_LINK}
                              >
                                <EyeOutlined className="text-[16px]" />
                              </a>
                            </Tooltip>
                            <Tooltip title="Download">
                              <a
                                href={apiFileUrl(d.contentUrl, true)}
                                className={DOC_ICON_LINK}
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
                          <td colSpan={columns.length} className="px-4 pb-3.5 pt-0 border-b border-slate-100 bg-slate-50">
                            <label className={`block mb-1 ${DECLINE_LABEL}`}>
                              Reason for decline
                              <span className={`block ${HINT} font-normal tracking-normal normal-case mt-0.5`}>
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
                                  className="w-full max-w-[620px] text-[13px] text-slate-900 border border-red-600 rounded-lg px-2.5 py-2 bg-white outline-none resize-y focus:ring-2 focus:ring-red-100"
                                />
                                <div className="flex gap-2 mt-2">
                                  <button
                                    onClick={() => review.mutate({ id: d.id, status: "declined", reason: note })}
                                    className={BTN_DANGER}
                                  >
                                    Save decline
                                  </button>
                                  <button
                                    onClick={() => {
                                      setDeclining(null);
                                      setNote("");
                                    }}
                                    className={BTN}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </>
                            ) : (
                              <div className="text-[13px] text-slate-700 max-w-[620px]">“{d.customsNote}”</div>
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
                <div className="px-4 py-9 text-center text-slate-400 text-[13px]">
                  {documents.length === 0
                    ? `No ${group.title.toLowerCase()} yet — files marked ${group.types.join(" or ")} in the Documents tab show up here.`
                    : `No file matches “${search}”.`}
                </div>
              )}
            </div>

            {/* .cs-foot */}
            <div className={`px-4 py-2.5 border-t border-slate-200 bg-slate-50 ${HINT}`}>
              {group.types.join(" and ")} documents. Types are set in the Documents tab
              {!reviewed ? "." : canReview ? " — customs can only approve or decline." : "; they are approved or declined in the Customs section."}
            </div>
          </div>
        );
      })}
    </div>
  );
}
