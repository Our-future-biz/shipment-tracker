"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Tooltip } from "antd";
import { FileTextOutlined, PlusOutlined, WarningOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { ShipmentItem } from "@/hooks/useShipments";
import type { controllers } from "@/lib/api/client";
import { businessDateTime, businessDayOf, businessToday, formatDate } from "@/lib/date";
import { useInvoicing } from "@/hooks/useInvoicing";
import { supplierInvoiceKeys } from "@/hooks/supplierInvoiceKeys";
import { Pill } from "@/components/Pill";
import { ADD_BTN, CARD, CARD_BAR, CARD_ICON, CARD_TITLE, EMPTY, HINT, LINK, TD, TH } from "@/styles/ui";
import { noticeWords } from "./tracking/trackingText";
import { RowActionsMenu } from "@/app/shipments/_components/RowActionsMenu";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ClaimFormModal, type ClaimValues } from "./ClaimFormModal";
import { claimAmountText, claimDeadlines, claimStatusOf, deadlineFromText, figureText, type Claim } from "./claimValues";
import { apInvoiceHref } from "@/lib/accountsPayable";
import { supplierInvoiceOptions } from "./supplierInvoiceLink";

// Claim tab: claims on the shipment itself (how the cargo arrived) and claims on a
// supplier's costs. Each card holds as many claims as needed: "+" opens a dialog to fill one in,
// and ⋯ > Edit opens it again; the rows themselves only show. Who may (Council Outlay 11, D20): a
// claim on the shipment is added and changed by the job's Handled By, its Holiday Cover or a manager
// (mayEdit); a claim on costs by every user (mayEditCost - Accounts Payable's "Raise claim", D15);
// either is deleted by a manager only (mayDelete). The server says which and holds to it. With the company's claim time limits
// on (D21), a cargo claim shows its deadlines.

const CARGO_STATE_TONE: Record<string, string> = {
  Undamaged: "bg-emerald-50",
  Incomplete: "bg-amber-50",
  Damaged: "bg-red-50",
  Lost: "bg-red-50",
};

const CELL = TD;

export function ClaimsTab({ shipment }: { shipment: ShipmentItem }) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["shipment-claims", shipment.id],
    queryFn: () => api.shipments.claimList(shipment.id),
  });
  const claims = data?.claims ?? [];
  // Until the answer says so, nothing can be added, changed or deleted here.
  const mayEditOf = (kind: "cargo" | "cost") => (kind === "cargo" ? (data?.mayEdit ?? false) : (data?.mayEditCost ?? false));
  const mayDelete = data?.mayDelete ?? false;
  const timeLimitsOn = data?.timeLimitsOn ?? false;
  const today = businessToday();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["shipment-claims", shipment.id] });
    // The shipment's Claim field (Yes/No) follows the claims.
    queryClient.invalidateQueries({ queryKey: ["shipments"] });
    // An open claim on costs holds its supplier invoice's payment on Accounts Payable, where it shows (D15).
    queryClient.invalidateQueries({ queryKey: supplierInvoiceKeys.all });
  };
  // The supplier invoices this shipment's buying lines are on (the Costs tab's own query): what a claim on
  // costs can name (Council Outlay 9, D15).
  const { data: invoicing } = useInvoicing(shipment.id);
  const invoiceOptions = supplierInvoiceOptions(invoicing?.costs ?? []);
  // the server's reason with it (not found: the claim was deleted meanwhile, …)
  const onError = (what: string) => (e: unknown) => toast.error(`${what}: ${apiErrorMessage(e)}`);

  const create = useMutation({
    mutationFn: (req: controllers.ClaimCreateRequest) => api.shipments.claimCreate(shipment.id, req),
    onSuccess: invalidate,
    onError: onError("Could not add the claim"),
  });
  const update = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & controllers.ClaimUpdateRequest) => api.shipments.claimUpdate(shipment.id, id, input),
    onSuccess: invalidate,
    onError: onError("Could not save the change"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.shipments.claimDelete(shipment.id, id),
    onSuccess: invalidate,
    onError: onError("Could not delete the claim"),
  });

  // The claim dialog: a new claim of a kind, or one claim to change.
  const [form, setForm] = useState<{ kind: "cargo" | "cost"; claim?: Claim } | null>(null);
  const saveForm = async (values: ClaimValues) => {
    const saving = form;
    if (!saving) return;
    if (saving.claim) {
      // nothing changed: nothing to write
      if (Object.keys(values).length > 0) await update.mutateAsync({ id: saving.claim.id, ...values });
    } else await create.mutateAsync({ kind: saving.kind, ...values });
    // only the dialog that was saved closes (not one opened since)
    setForm((f) => (f === saving ? null : f));
  };

  // A row's value as text, cut with "…" where its column ends (the whole of it in its title); a
  // note or a reason keeps its lines, two at most.
  const read = (value: string, lines: "one" | "two" = "one") => (
    <span
      className={`block text-[13px] text-slate-900 ${lines === "one" ? "truncate" : "line-clamp-2 whitespace-pre-line break-words"}`}
      title={value || undefined}
    >
      {value || <span className={EMPTY}>—</span>}
    </span>
  );

  // A row's actions behind "⋯", as Container and Cargo Details have them; Delete asks first.
  const [toDelete, setToDelete] = useState<Claim | null>(null);
  const deleteCell = (c: Claim) => (
    <td className={CELL}>
      {(mayEditOf(c.kind) || mayDelete) && (
        <RowActionsMenu
          label="Claim actions"
          onEdit={mayEditOf(c.kind) ? () => setForm({ kind: c.kind, claim: c }) : undefined}
          onDelete={mayDelete ? () => setToDelete(c) : undefined}
        />
      )}
    </td>
  );

  // Fixed columns (each head gives its width, the rest share what is left), so a long value is
  // cut instead of pushing the ⋯ off the card.
  const card = (title: string, icon: React.ReactNode, kind: "cargo" | "cost", columns: { label: string; width?: string }[], body: React.ReactNode, empty: string) => (
    <section className={`${CARD} min-w-0 overflow-hidden`}>
      <div className={CARD_BAR}>
        <span className={`${CARD_ICON} shrink-0`}>{icon}</span>
        <h3 className={`${CARD_TITLE} min-w-0`}>{title}</h3>
        {mayEditOf(kind) ? (
          <Tooltip title="Add claim">
            {/* the small purple "+" of Container and Cargo Details */}
            <Button
              size="small"
              type="primary"
              icon={<PlusOutlined className="text-[11px]" />}
              aria-label={`Add ${title.toLowerCase()}`}
              onClick={() => setForm({ kind })}
              className={`${ADD_BTN} ml-auto`}
            />
          </Tooltip>
        ) : (
          data && kind === "cargo" && <span className={`${HINT} ml-auto`}>Handled By, Holiday Cover or a manager adds claims on the shipment</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className={`w-full ${kind === "cost" ? "min-w-[720px]" : "min-w-[860px]"} table-fixed border-collapse`}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.label} className={`${TH} ${c.width ?? ""}`}>
                  {c.label}
                </th>
              ))}
              <th className={`${TH} w-[44px]`}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {body}
            {!isLoading && !claims.some((c) => c.kind === kind) && (
              <tr>
                <td colSpan={columns.length + 1} className={`px-4 py-8 text-center ${HINT}`}>
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <>
      {form && (
        <ClaimFormModal
          kind={form.kind}
          claim={form.claim}
          invoiceOptions={invoiceOptions}
          saving={create.isPending || update.isPending}
          onClose={() => setForm(null)}
          onSave={saveForm}
        />
      )}
      <ConfirmModal
        open={!!toDelete}
        danger
        title="Delete claim?"
        description="The claim is removed from this shipment; the job's history keeps what was deleted. This can't be undone."
        confirmLabel="Delete"
        loading={remove.isPending}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) remove.mutate(toDelete.id, { onSettled: () => setToDelete(null) });
        }}
      />
      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-5 items-start">
        {card(
          "Claim on the shipment",
          <WarningOutlined />,
          "cargo",
          [
            { label: "Status", width: "w-[190px]" },
            { label: "Cargo state", width: "w-[120px]" },
            { label: "Note" },
            { label: "Claimed", width: "w-[140px]" },
            { label: "Notified", width: "w-[170px]" },
            { label: "Owner", width: "w-[150px]" },
          ],
          claims
            .filter((c) => c.kind === "cargo")
            .map((c) => {
              const status = claimStatusOf(c.status, "cargo");
              const deadlines = claimDeadlines(c, timeLimitsOn, today);
              const from = deadlineFromText(c.deadlineFrom);
              const settled = figureText(c.settledAmount, c.settledCurrency);
              const afterDelivery = noticeWords(shipment.actualDeliveryDate, c.noticeDate);
              return (
                <tr key={c.id} className="hover:bg-slate-50 align-top">
                  <td className={CELL}>
                    <Pill tone={status.tone}>{status.label}</Pill>
                    {!c.isOpen && c.closedAt && (
                      <div className={`${HINT} truncate`} title={[businessDateTime(c.closedAt), c.closedBy].filter(Boolean).join(" · ")}>
                        {formatDate(businessDayOf(c.closedAt))}
                        {c.closedBy && ` · ${c.closedBy}`}
                      </div>
                    )}
                    {/* The claim time limits (D21), while they are on: what is due by when, red once passed. */}
                    {deadlines.map((d) => (
                      <div key={d.label} className={`text-[12px] ${d.passed ? "text-red-600 font-medium" : "text-slate-500"}`} title={from ? `Counted ${from}` : undefined}>
                        {d.label} {d.day}
                        {d.passed && " (passed)"}
                      </div>
                    ))}
                    {deadlines.length > 0 && from && <div className={HINT}>{from}</div>}
                    {timeLimitsOn && c.isOpen && !c.deadlineFrom && (
                      <div className={HINT}>Deadlines count from the delivery, else the arrival: neither is in yet</div>
                    )}
                  </td>
                  <td className={`${CELL} ${CARGO_STATE_TONE[c.cargoState] ?? ""}`}>{read(c.cargoState)}</td>
                  <td className={CELL}>{read(c.note, "two")}</td>
                  <td className={`${CELL} tabular-nums`}>
                    {read(claimAmountText(c))}
                    {settled && <div className={`${HINT} truncate`} title={`Settled ${settled}`}>Settled {settled}</div>}
                  </td>
                  <td className={CELL}>
                    {c.noticeDate || c.insurerNotifiedOn ? (
                      <>
                        {c.noticeDate && (
                          <div className="text-[13px] text-slate-900 whitespace-nowrap tabular-nums">Carrier {formatDate(c.noticeDate)}</div>
                        )}
                        {afterDelivery && <div className={HINT}>{afterDelivery}</div>}
                        {c.insurerNotifiedOn && (
                          <div className="text-[13px] text-slate-900 whitespace-nowrap tabular-nums">Insurer {formatDate(c.insurerNotifiedOn)}</div>
                        )}
                      </>
                    ) : (
                      <span className={EMPTY}>—</span>
                    )}
                  </td>
                  <td className={CELL}>{read(c.ownerName)}</td>
                  {deleteCell(c)}
                </tr>
              );
            }),
          mayEditOf("cargo") ? "No claim on this shipment — add one with +." : "No claim on this shipment.",
        )}

        {card(
          "Claim on costs",
          <FileTextOutlined />,
          "cost",
          [
            { label: "Supplier", width: "w-[20%]" },
            { label: "Invoice number", width: "w-[17%]" },
            { label: "Claim reason" },
            { label: "Amount", width: "w-[130px]" },
            { label: "Status", width: "w-[150px]" },
          ],
          claims
            .filter((c) => c.kind === "cost")
            .map((c) => {
              const status = claimStatusOf(c.status);
              return (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className={CELL}>{read(c.supplier)}</td>
                  <td className={CELL}>
                    {read(c.invoiceNumber)}
                    {/* the supplier invoice it disputes, on Finance → Accounts Payable (D15) */}
                    {c.supplierInvoiceId && (
                      <Link href={apInvoiceHref(c.supplierInvoiceId)} className={`${LINK} text-[12px]`}>
                        Accounts Payable
                      </Link>
                    )}
                  </td>
                  <td className={CELL}>{read(c.reason, "two")}</td>
                  {/* the claimed figure; an older claim's amount typed as text */}
                  <td className={`${CELL} tabular-nums`}>{read(claimAmountText(c))}</td>
                  <td className={CELL}>
                    <Pill tone={status.tone}>{status.label}</Pill>
                    {c.status === "open" ? (
                      c.supplierInvoiceId && <div className={HINT}>Holds the invoice&apos;s payment</div>
                    ) : (
                      c.closedAt && (
                        <div className={`${HINT} truncate`} title={[businessDateTime(c.closedAt), c.closedBy].filter(Boolean).join(" · ")}>
                          {formatDate(businessDayOf(c.closedAt))}
                          {c.closedBy && ` · ${c.closedBy}`}
                        </div>
                      )
                    )}
                  </td>
                  {deleteCell(c)}
                </tr>
              );
            }),
          mayEditOf("cost") ? "No claim on costs — add one with +." : "No claim on costs.",
        )}
      </div>
    </>
  );
}
