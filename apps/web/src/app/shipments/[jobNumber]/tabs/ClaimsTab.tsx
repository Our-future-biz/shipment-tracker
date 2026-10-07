"use client";

import { Input, Select, Tooltip, message } from "antd";
import { DeleteOutlined, FileTextOutlined, PlusOutlined, WarningOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ShipmentItem } from "@/hooks/useShipments";
import type { controllers, interfaces } from "@/lib/api/client";

// Claim tab: claims on the shipment itself (how the cargo arrived) and claims on a
// supplier's costs. Each card holds as many claims as needed — "+" adds a row.

type Claim = interfaces.ClaimItem;

const CARGO_STATES = ["Damaged", "Incomplete", "Undamaged", "Lost"];
const CARGO_STATE_TONE: Record<string, string> = {
  Undamaged: "bg-emerald-50",
  Incomplete: "bg-amber-50",
  Damaged: "bg-red-50",
  Lost: "bg-red-50",
};

const TH = "px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 text-left";
const CELL = "px-2 py-1.5 border-b border-slate-100 align-middle";
const FIELD = "!text-[13px]";

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
    mutationFn: (kind: "cargo" | "cost") => api.shipments.claimCreate(shipment.id, { kind }),
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

  const save = (id: string, field: keyof controllers.ClaimUpdateRequest, value: string, current: string) => {
    if (value !== current) update.mutate({ id, [field]: value });
  };

  const text = (c: Claim, field: "note" | "supplier" | "invoiceNumber" | "reason" | "amount", placeholder?: string) => (
    <Input
      size="small"
      variant="borderless"
      className={FIELD}
      placeholder={placeholder ?? "—"}
      defaultValue={c[field]}
      key={`${c.id}-${field}-${c[field]}`}
      onBlur={(e) => save(c.id, field, e.target.value, c[field])}
      onPressEnter={(e) => e.currentTarget.blur()}
    />
  );

  const deleteCell = (c: Claim) => (
    <td className={`${CELL} w-[44px]`}>
      <Tooltip title="Delete claim">
        <button
          type="button"
          aria-label="Delete claim"
          onClick={() => remove.mutate(c.id)}
          className="text-slate-300 hover:text-red-500 bg-transparent border-none cursor-pointer p-1"
        >
          <DeleteOutlined />
        </button>
      </Tooltip>
    </td>
  );

  const card = (title: string, icon: React.ReactNode, kind: "cargo" | "cost", columns: string[], body: React.ReactNode, empty: string) => (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm min-w-0 overflow-hidden">
      <div className="px-4 py-2.5 flex items-center gap-2.5 bg-indigo-50 border-b border-indigo-100">
        <span className="text-indigo-500 text-base leading-none">{icon}</span>
        <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-wider m-0">{title}</h3>
        <Tooltip title="Add claim">
          <button
            type="button"
            aria-label={`Add ${title.toLowerCase()}`}
            onClick={() => create.mutate(kind)}
            className="ml-auto flex items-center justify-center w-7 h-7 rounded-lg border border-slate-300 bg-white text-slate-600 hover:border-indigo-400 hover:text-indigo-500 cursor-pointer transition-colors"
          >
            <PlusOutlined />
          </button>
        </Tooltip>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
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
                <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-xs text-slate-400">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {card(
          "Claim on the shipment",
          <WarningOutlined />,
          "cargo",
          ["Cargo state", "Note"],
          claims
            .filter((c) => c.kind === "cargo")
            .map((c) => (
              <tr key={c.id} className="hover:bg-slate-50/60">
                <td className={`${CELL} w-[180px] ${CARGO_STATE_TONE[c.cargoState] ?? ""}`}>
                  <Select
                    size="small"
                    variant="borderless"
                    placeholder="—"
                    className="w-full [&_.ant-select-selection-item]:!text-[13px]"
                    value={c.cargoState || undefined}
                    options={CARGO_STATES.map((v) => ({ value: v, label: v }))}
                    onChange={(v) => update.mutate({ id: c.id, cargoState: v ?? "" })}
                  />
                </td>
                <td className={CELL}>{text(c, "note", "What happened")}</td>
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
              <tr key={c.id} className="hover:bg-slate-50/60">
                <td className={CELL}>{text(c, "supplier")}</td>
                <td className={CELL}>{text(c, "invoiceNumber")}</td>
                <td className={CELL}>{text(c, "reason")}</td>
                <td className={`${CELL} w-[150px]`}>{text(c, "amount", "CZK 0.00")}</td>
                {deleteCell(c)}
              </tr>
            )),
          "No claim on costs — add one with +.",
        )}
      </div>
    </>
  );
}
