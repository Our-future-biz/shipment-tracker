"use client";

import { useState } from "react";
import { Tooltip, message } from "antd";
import { FileTextOutlined, PlusOutlined, WarningOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ShipmentItem } from "@/hooks/useShipments";
import type { controllers, interfaces } from "@/lib/api/client";
import { formatDate } from "@/lib/date";
import { CARD, CARD_BAR, CARD_ICON, CARD_TITLE, EMPTY, HINT, TD, TH } from "@/styles/ui";
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
  const [messageApi, contextHolder] = message.useMessage();

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
  const onError = (what: string) => () => messageApi.error(what);

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
    if (!form) return;
    if (form.claim) await update.mutateAsync({ id: form.claim.id, ...values });
    else await create.mutateAsync({ kind: form.kind, ...values });
    setForm(null);
  };

  // A row's value as text.
  const read = (value: string) => <span className="block text-[13px] text-slate-900 truncate" title={value || undefined}>{value || <span className={EMPTY}>—</span>}</span>;

  // A row's actions behind "⋯", as Container and Cargo Details have them; Delete asks first.
  const [toDelete, setToDelete] = useState<Claim | null>(null);
  const deleteCell = (c: Claim) => (
    <td className={`${CELL} w-[44px]`}>
      <RowActionsMenu label="Claim actions" onEdit={() => setForm({ kind: c.kind as "cargo" | "cost", claim: c })} onDelete={() => setToDelete(c)} />
    </td>
  );

  const card = (title: string, icon: React.ReactNode, kind: "cargo" | "cost", columns: string[], body: React.ReactNode, empty: string) => (
    <section className={`${CARD} min-w-0 overflow-hidden`}>
      <div className={CARD_BAR}>
        <span className={`${CARD_ICON} shrink-0`}>{icon}</span>
        <h3 className={`${CARD_TITLE} min-w-0`}>{title}</h3>
        <Tooltip title="Add claim">
          <button
            type="button"
            aria-label={`Add ${title.toLowerCase()}`}
            onClick={() => setForm({ kind })}
            // the small purple "+" of Container and Cargo Details
            className="ml-auto inline-flex items-center justify-center w-[22px] h-[22px] rounded-md border-0 bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
          >
            <PlusOutlined className="text-[11px]" />
          </button>
        </Tooltip>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} className={TH}>
                  {c}
                </th>
              ))}
              <th className={TH} />
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
      {contextHolder}
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
          ["Cargo state", "Note", "Delivered", "Notice given"],
          claims
            .filter((c) => c.kind === "cargo")
            .map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className={`${CELL} w-[180px] ${CARGO_STATE_TONE[c.cargoState] ?? ""}`}>{read(c.cargoState)}</td>
                <td className={CELL}>{read(c.note)}</td>
                <td className={`${CELL} whitespace-nowrap tabular-nums`}>{shipment.actualDeliveryDate ? formatDate(shipment.actualDeliveryDate) : <span className={EMPTY}>—</span>}</td>
                <td className={`${CELL} w-[150px]`}>
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
          ["Supplier", "Invoice number", "Claim reason", "Disputed amount"],
          claims
            .filter((c) => c.kind === "cost")
            .map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className={CELL}>{read(c.supplier)}</td>
                <td className={CELL}>{read(c.invoiceNumber)}</td>
                <td className={CELL}>{read(c.reason)}</td>
                <td className={`${CELL} w-[150px]`}>{read(c.amount)}</td>
                {deleteCell(c)}
              </tr>
            )),
          "No claim on costs — add one with +.",
        )}
      </div>
    </>
  );
}
