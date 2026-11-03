"use client";

import { useEffect, useState } from "react";
import { Alert, Button, InputNumber, Spin } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "@/lib/api";
import type { controllers } from "@/lib/api/client";
import { useToast } from "@/lib/toast";
import { SectionCard } from "@/components/SectionCard";
import { serviceTypeLabel } from "../_lib/types";

type Row = controllers.GuardrailRow;

const KEY = ["sales-guardrails"] as const;

// Sales Settings → Guardrails (Council Outlay 6): the margin floor of each freight mode, a minimum %
// and a minimum CZK (per container for Sea FCL and Rail), judged on the whole quote. A quote below
// its floor can't be sent, or Won without being sent, until a manager approves its margin. Road's
// floor is Trucking's and is shown here only. Everybody sees the floors; those who manage Sales
// change them.
export function GuardrailsTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: () => api.quotes.salesGuardrailsGet() });
  const [edits, setEdits] = useState<Record<string, { percent: number | null; minAmountCzk: number | null }>>({});
  const save = useMutation({
    mutationFn: (rows: { serviceType: string; percent: number; minAmountCzk: number }[]) => api.quotes.salesGuardrailsSet({ guardrails: rows }),
    onSuccess: (data) => queryClient.setQueryData(KEY, data),
  });
  // What is stored is what the fields start from, again after every save.
  useEffect(() => setEdits({}), [query.data]);

  if (query.isLoading) return <Spin />;
  if (!query.data) return <Alert type="error" showIcon message="Could not load the guardrails." action={<Button size="small" onClick={() => query.refetch()}>Retry</Button>} />;

  const { guardrails, canEdit } = query.data;
  const value = (r: Row, key: "percent" | "minAmountCzk") => (r.serviceType in edits ? edits[r.serviceType]![key] : r[key]);
  const changed = guardrails.filter((r) => r.serviceType in edits && (edits[r.serviceType]!.percent !== r.percent || edits[r.serviceType]!.minAmountCzk !== r.minAmountCzk));
  const incomplete = changed.some((r) => edits[r.serviceType]!.percent === null || edits[r.serviceType]!.minAmountCzk === null);
  const setField = (r: Row, key: "percent" | "minAmountCzk", v: number | null) =>
    setEdits((prev) => ({ ...prev, [r.serviceType]: { percent: value(r, "percent"), minAmountCzk: value(r, "minAmountCzk"), ...prev[r.serviceType], [key]: v } }));

  const submit = () =>
    save
      .mutateAsync(changed.map((r) => ({ serviceType: r.serviceType, percent: edits[r.serviceType]!.percent!, minAmountCzk: edits[r.serviceType]!.minAmountCzk! })))
      .then(() => toast.success("Guardrails saved — every quote is judged by them from now on"))
      .catch((e) => toast.error(apiErrorMessage(e)));

  return (
    <SectionCard title="Margin guardrails">
      <div className="flex flex-col gap-3 px-2 pb-3">
        <p className="text-[13px] text-slate-600 max-w-[72ch] m-0">
          A quote below the floor of its freight mode can&apos;t be sent, or Won without being sent, until a manager approves its margin. A quote must reach both the % and the CZK minimum.
          A quote that sells with no buying lines always needs approval.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="px-3 py-2 font-semibold">Freight mode</th>
                <th className="px-3 py-2 font-semibold">Minimum margin %</th>
                <th className="px-3 py-2 font-semibold">Minimum margin CZK</th>
                <th className="px-3 py-2 font-semibold">Set in</th>
              </tr>
            </thead>
            <tbody>
              {guardrails.map((r) => {
                const editable = canEdit && r.setIn === "sales";
                return (
                  <tr key={r.serviceType} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-semibold text-slate-800">{serviceTypeLabel(r.serviceType)}</td>
                    <td className="px-3 py-2">
                      {editable ? (
                        <InputNumber aria-label={`${r.serviceType} minimum margin %`} min={0} max={100} step={0.5} value={value(r, "percent")} onChange={(v) => setField(r, "percent", v)} suffix="%" className="!w-[130px]" />
                      ) : (
                        <span className="tabular-nums">{r.percent} %</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editable ? (
                        <InputNumber aria-label={`${r.serviceType} minimum margin CZK`} min={0} step={100} value={value(r, "minAmountCzk")} onChange={(v) => setField(r, "minAmountCzk", v)} suffix="CZK" className="!w-[160px]" />
                      ) : (
                        <span className="tabular-nums">{r.minAmountCzk.toLocaleString("cs-CZ")} CZK</span>
                      )}
                      {r.perContainer && <span className="ml-2 text-[12px] text-slate-500">per container</span>}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-slate-500">{r.setIn === "trucking" ? "Trucking (its margin floor)" : r.changed ? "Sales" : "Sales · starting floor"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {canEdit ? (
          <div className="flex items-center gap-2">
            <Button type="primary" disabled={!changed.length || incomplete} loading={save.isPending} onClick={submit}>
              Save guardrails
            </Button>
            {changed.length > 0 && (
              <Button disabled={save.isPending} onClick={() => setEdits({})}>
                Discard changes
              </Button>
            )}
          </div>
        ) : (
          <p className="text-[12px] text-slate-500 m-0">Only managers and admins change the guardrails.</p>
        )}
      </div>
    </SectionCard>
  );
}
