"use client";

import { useState } from "react";
import { Button, Tooltip } from "antd";
import { FileTextOutlined, PlusOutlined, WarningOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { ShipmentItem } from "@/hooks/useShipments";
import type { controllers, interfaces } from "@/lib/api/client";
import { formatDate } from "@/lib/date";
import { ADD_BTN, CARD, CARD_BAR, CARD_ICON, CARD_TITLE, EMPTY, HINT, TD, TH } from "@/styles/ui";
import { noticeWords } from "./tracking/trackingText";
import { RowActionsMenu } from "@/app/shipments/_components/RowActionsMenu";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ClaimFormModal, type ClaimValues } from "./ClaimFormModal";

// Claim tab: claims on the shipment itself (how the cargo arrived) and claims on a
// supplier's costs. Each card holds as many claims as needed: "+" opens a dialog to fill one in,
// and ⋯ > Edit opens it again; the rows themselves only show.

type Claim = interfaces.ClaimItem;

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
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["shipment-claims", shipment.id] });
    // The shipment's Claim field (Yes/No) follows the claims.
    queryClient.invalidateQueries({ queryKey: ["shipments"] });
  };
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
      <RowActionsMenu label="Claim actions" onEdit={() => setForm({ kind: c.kind as "cargo" | "cost", claim: c })} onDelete={() => setToDelete(c)} />
    </td>
  );

  // Fixed columns (each head gives its width, the rest share what is left), so a long value is
  // cut instead of pushing the ⋯ off the card.
  const card = (title: string, icon: React.ReactNode, kind: "cargo" | "cost", columns: { label: string; width?: string }[], body: React.ReactNode, empty: string) => (
    <section className={`${CARD} min-w-0 overflow-hidden`}>
      <div className={CARD_BAR}>
        <span className={`${CARD_ICON} shrink-0`}>{icon}</span>
        <h3 className={`${CARD_TITLE} min-w-0`}>{title}</h3>
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
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] table-fixed border-collapse">
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
          saving={create.isPending || update.isPending}
          onClose={() => setForm(null)}
          onSave={saveForm}
        />
      )}
      <ConfirmModal
        open={!!toDelete}
        danger
        title="Delete claim?"
        description="The claim is removed from this shipment. This can't be undone."
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
          [{ label: "Cargo state", width: "w-[150px]" }, { label: "Note" }, { label: "Delivered", width: "w-[110px]" }, { label: "Notice given", width: "w-[150px]" }],
          claims
            .filter((c) => c.kind === "cargo")
            .map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className={`${CELL} ${CARGO_STATE_TONE[c.cargoState] ?? ""}`}>{read(c.cargoState)}</td>
                <td className={CELL}>{read(c.note, "two")}</td>
                <td className={`${CELL} whitespace-nowrap tabular-nums`}>{shipment.actualDeliveryDate ? formatDate(shipment.actualDeliveryDate) : <span className={EMPTY}>—</span>}</td>
                <td className={CELL}>
                  {read(c.noticeDate ? formatDate(c.noticeDate) : "")}
                  {noticeWords(shipment.actualDeliveryDate, c.noticeDate) && <div className={HINT}>{noticeWords(shipment.actualDeliveryDate, c.noticeDate)}</div>}
                </td>
                {deleteCell(c)}
              </tr>
            )),
          "No claim on this shipment — add one with +.",
        )}

        {card(
          "Claim on costs",
          <FileTextOutlined />,
          "cost",
          [{ label: "Supplier", width: "w-[24%]" }, { label: "Invoice number", width: "w-[18%]" }, { label: "Claim reason" }, { label: "Disputed amount", width: "w-[140px]" }],
          claims
            .filter((c) => c.kind === "cost")
            .map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className={CELL}>{read(c.supplier)}</td>
                <td className={CELL}>{read(c.invoiceNumber)}</td>
                <td className={CELL}>{read(c.reason, "two")}</td>
                <td className={CELL}>{read(c.amount)}</td>
                {deleteCell(c)}
              </tr>
            )),
          "No claim on costs — add one with +.",
        )}
      </div>
    </>
  );
}
