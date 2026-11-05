"use client";

import { useEffect, useState } from "react";
import { Alert, Button, InputNumber, Spin } from "antd";
import { apiErrorMessage } from "@/lib/api";
import { formatAmount } from "@/lib/money";
import { formatPercent } from "@/lib/number";
import { useToast } from "@/lib/toast";
import { useSalesGuardrails, type GuardrailRow as Row } from "@/hooks/useSalesGuardrails";
import { SectionCard } from "@/components/SectionCard";
import { serviceTypeLabel } from "../_lib/types";
import { HINT, TD, TH } from "@/styles/ui";

// Sales Settings → Guardrails (Council Outlay 6): the margin floor of each freight mode, a minimum %
// and a minimum CZK (per container for Sea FCL and Rail), judged on the whole quote. A quote below
// its floor can't be sent, or Won without being sent, until a manager approves its margin. Road's
// floor is Trucking's and is shown here only. Everybody sees the floors; those who manage Sales
// change them.
export function GuardrailsTab() {
  const toast = useToast();
  const { guardrails: stored, isLoading, reload, save } = useSalesGuardrails();
  const [edits, setEdits] = useState<Record<string, { percent: number | null; minAmountCzk: number | null }>>({});
  // What is stored is what the fields start from, again after every save.
  useEffect(() => setEdits({}), [stored]);

  if (isLoading) return <Spin />;
  if (!stored) return <Alert type="error" showIcon message="Could not load the guardrails." action={<Button size="small" onClick={() => reload()}>Retry</Button>} />;

  const { guardrails, canEdit } = stored;
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
        <p className="text-[13px] text-slate-700 max-w-[72ch] m-0">
          A quote below the floor of its freight mode can&apos;t be sent, or Won without being sent, until a manager approves its margin. A quote must reach both the % and the CZK minimum.
          A quote that sells with no buying lines always needs approval.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={TH}>Freight mode</th>
                <th className={TH}>Minimum margin %</th>
                <th className={TH}>Minimum margin CZK</th>
                <th className={TH}>Set in</th>
              </tr>
            </thead>
            <tbody>
              {guardrails.map((r) => {
                const editable = canEdit && r.setIn === "sales";
                return (
                  <tr key={r.serviceType}>
                    <td className={`${TD} font-semibold`}>
                      <span className="text-slate-900">{serviceTypeLabel(r.serviceType)}</span>
                    </td>
                    <td className={TD}>
                      {editable ? (
                        <InputNumber aria-label={`${r.serviceType} minimum margin %`} min={0} max={100} step={0.5} value={value(r, "percent")} onChange={(v) => setField(r, "percent", v)} suffix="%" className="!w-[130px]" />
                      ) : (
                        <span className="tabular-nums">{formatPercent(r.percent)}</span>
                      )}
                    </td>
                    <td className={TD}>
                      {editable ? (
                        <InputNumber aria-label={`${r.serviceType} minimum margin CZK`} min={0} step={100} value={value(r, "minAmountCzk")} onChange={(v) => setField(r, "minAmountCzk", v)} suffix="CZK" className="!w-[160px]" />
                      ) : (
                        <span className="tabular-nums">{formatAmount(r.minAmountCzk, "CZK")}</span>
                      )}
                      {r.perContainer && <span className="ml-2 text-[12px] text-slate-500">per container</span>}
                    </td>
                    <td className={TD}>
                      <span className={HINT}>{r.setIn === "trucking" ? "Trucking (its margin floor)" : r.changed ? "Sales" : "Sales · starting floor"}</span>
                    </td>
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
