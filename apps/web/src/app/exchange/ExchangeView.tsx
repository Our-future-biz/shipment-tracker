"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input, Button, Modal, Tooltip, Spin, message } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";
import {
  currentWeekKey, weekRange, weekKeyFromDate, formatWeekLabel, weeksInYear,
} from "@/lib/isoWeek";

/** Kurzy se zadavaji v CZK za 1 jednotku meny. CZK je zaklad. */
const CELL = "px-4 py-3 border-b border-slate-100 align-middle text-[14px]";
const TH =
  "text-[11.5px] font-bold tracking-[.05em] uppercase text-slate-500 px-4 py-2.5 " +
  "border-b border-slate-200 bg-[#fafafa] text-left whitespace-nowrap";

export function ExchangeView() {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ week: currentWeekKey(), rateEur: "", rateUsd: "", note: "" });
  const [formErr, setFormErr] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["exchange-rates"],
    queryFn: () => api.invoicing.exchangeRateList(),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["exchange-rates"] });

  const rates = data?.rates ?? [];
  const thisWeek = currentWeekKey();
  const hasThisWeek = rates.some((r) => r.week === thisWeek);

  const create = useMutation({
    mutationFn: (params: { week: string; validFrom: string; validTo: string; rateEur?: string; rateUsd?: string; note?: string }) =>
      api.invoicing.exchangeRateCreate(params),
    onSuccess: () => {
      invalidate();
      setAdding(false);
      setForm({ week: currentWeekKey(), rateEur: "", rateUsd: "", note: "" });
      message.success("Rates saved");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Could not save the rates";
      setFormErr(msg.includes("already exist") ? "Rates for this week already exist." : msg);
    },
  });

  const update = useMutation({
    mutationFn: ({ id, ...params }: { id: string; rateEur?: string; rateUsd?: string; note?: string }) =>
      api.invoicing.exchangeRateUpdate(id, params),
    onSuccess: invalidate,
    onError: () => message.error("Could not save the change"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.invoicing.exchangeRateDelete(id),
    onSuccess: invalidate,
  });

  const range = useMemo(() => weekRange(form.week), [form.week]);

  const submit = () => {
    setFormErr("");
    const r = weekRange(form.week);
    if (!r) {
      setFormErr(`Enter a valid week, e.g. ${currentWeekKey()}.`);
      return;
    }
    if (!form.rateEur.trim() && !form.rateUsd.trim()) {
      setFormErr("Enter at least one rate.");
      return;
    }
    create.mutate({
      week: form.week,
      validFrom: r.from,
      validTo: r.to,
      rateEur: form.rateEur.trim(),
      rateUsd: form.rateUsd.trim(),
      note: form.note.trim(),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spin />
      </div>
    );
  }

  return (
    <>
      {/* Toolbar ve stejnem stylu jako Customs */}
      <div className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-semibold text-slate-600">
            Weekly exchange rates — CZK per 1 unit
          </span>
          {!hasThisWeek && (
            <span className="text-[12.5px] font-semibold text-[#95620B] bg-[#FBEED2] border border-[#95620B] rounded-md px-2 py-0.5">
              No rates for the current week
            </span>
          )}
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => { setFormErr(""); setAdding(true); }}
          style={{ borderRadius: 6, height: 32 }}
        >
          Add week
        </Button>
      </div>

      {/* Tabulka */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: "820px" }}>
            <thead>
              <tr>
                <th className={TH} style={{ width: 260 }}>Week</th>
                <th className={TH} style={{ width: 190 }}>Valid</th>
                <th className={`${TH} !text-right`} style={{ width: 150 }}>EUR</th>
                <th className={`${TH} !text-right`} style={{ width: 150 }}>USD</th>
                <th className={`${TH} !text-right`} style={{ width: 110 }}>CZK</th>
                <th className={TH}>Note</th>
                <th className={TH} style={{ width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id} className={`hover:bg-slate-50 ${r.week === thisWeek ? "bg-[#F5F6FD]" : ""}`}>
                  <td className={CELL}>
                    <span className="font-semibold text-slate-900">{formatWeekLabel(r.week)}</span>
                    {r.week === thisWeek && (
                      <span className="ml-2 text-[11px] font-bold uppercase tracking-wide text-[#4457D6]">
                        current
                      </span>
                    )}
                  </td>
                  <td className={`${CELL} text-slate-500 text-[13px] whitespace-nowrap`}>
                    {r.validFrom} → {r.validTo}
                  </td>
                  <td className={`${CELL} text-right`}>
                    <input
                      defaultValue={r.rateEur ?? ""}
                      placeholder="—"
                      onBlur={(e) => e.target.value !== (r.rateEur ?? "") && update.mutate({ id: r.id, rateEur: e.target.value })}
                      className="w-[110px] h-8 px-2 text-right text-[14px] tabular-nums border border-slate-200
                                 rounded-md outline-none focus:border-indigo-500"
                    />
                  </td>
                  <td className={`${CELL} text-right`}>
                    <input
                      defaultValue={r.rateUsd ?? ""}
                      placeholder="—"
                      onBlur={(e) => e.target.value !== (r.rateUsd ?? "") && update.mutate({ id: r.id, rateUsd: e.target.value })}
                      className="w-[110px] h-8 px-2 text-right text-[14px] tabular-nums border border-slate-200
                                 rounded-md outline-none focus:border-indigo-500"
                    />
                  </td>
                  {/* CZK je zaklad - kurz je vzdy 1 */}
                  <td className={`${CELL} text-right text-slate-400 tabular-nums`}>
                    <Tooltip title="CZK is the base currency">
                      <span>1.0000</span>
                    </Tooltip>
                  </td>
                  <td className={CELL}>
                    <input
                      defaultValue={r.note}
                      placeholder="—"
                      onBlur={(e) => e.target.value !== r.note && update.mutate({ id: r.id, note: e.target.value })}
                      className="w-full h-8 px-2 text-[13px] border border-slate-200 rounded-md
                                 outline-none focus:border-indigo-500"
                    />
                  </td>
                  <td className={`${CELL} text-center`}>
                    <Tooltip title="Delete week">
                      <button
                        onClick={() => remove.mutate(r.id)}
                        className="w-[28px] h-[28px] rounded-md grid place-items-center text-slate-400
                                   hover:bg-[#FBE6E4] hover:text-[#C3392B] border-0 bg-transparent cursor-pointer"
                      >
                        <DeleteOutlined />
                      </button>
                    </Tooltip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!rates.length && (
            <div className="px-4 py-9 text-center text-slate-400 text-[13.5px]">
              No exchange rates yet — use “Add week” to enter the first ones.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 text-[13px] text-slate-500">
          <span>Rates are used by Costs Breakdown according to the shipment’s ETA/ETD week.</span>
          <span>{rates.length} {rates.length === 1 ? "week" : "weeks"}</span>
        </div>
      </div>

      {/* Pridani tydne */}
      <Modal
        open={adding}
        onCancel={() => setAdding(false)}
        onOk={submit}
        okText="Save"
        cancelText="Cancel"
        confirmLoading={create.isPending}
        title="Add exchange rates"
        width={420}
      >
        <div className="flex flex-col gap-3 pt-2">
          <div>
            <label className="block text-[12px] font-bold uppercase tracking-wide text-slate-500 mb-1">
              Week
            </label>
            <Input
              value={form.week}
              onChange={(e) => { setForm({ ...form, week: e.target.value.toUpperCase() }); setFormErr(""); }}
              placeholder={currentWeekKey()}
            />
            <div className="text-[12px] text-slate-500 mt-1">
              {range ? `${range.from} → ${range.to}` : "Format: 2026-W36"}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[12px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                EUR
              </label>
              <Input
                value={form.rateEur}
                onChange={(e) => setForm({ ...form, rateEur: e.target.value })}
                placeholder="24.1200"
                className="text-right"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[12px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                USD
              </label>
              <Input
                value={form.rateUsd}
                onChange={(e) => setForm({ ...form, rateUsd: e.target.value })}
                placeholder="20.6200"
                className="text-right"
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-bold uppercase tracking-wide text-slate-500 mb-1">
              Note
            </label>
            <Input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="optional"
            />
          </div>

          <div className="text-[12px] text-slate-500">
            CZK per 1 unit of the currency. CZK is the base and is always 1.
          </div>

          {formErr && (
            <div className="text-[#C3392B] text-[12.5px] font-semibold">{formErr}</div>
          )}
        </div>
      </Modal>
    </>
  );
}
