"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, Input, Select, Checkbox, InputNumber, Collapse, Spin, Tag } from "antd";
import {
  ArrowLeftOutlined,
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
  FilePdfOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { useSalesQuote, useSalesQuotes } from "@/hooks/useSalesQuotes";
import { useCustomers } from "@/hooks/useCustomers";
import { useTermsConditions } from "@/hooks/useTermsConditions";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { SalesQuoteData, PackageLine, CostLine } from "../../_lib/types";
import { INCOTERMS, SERVICE_TYPES, DIRECTIONS, CURRENCIES, COST_LINE_TYPES } from "../../_lib/types";
import { computeTotals, fmt } from "../../_lib/salesQuote";
import { printQuote } from "../../_lib/printQuote";
import { LifecycleBar } from "./_components/LifecycleBar";

const emptyPackage: PackageLine = { qty: 1, type: "Pallet", length: 120, width: 80, height: 100, weight: 100 };
const emptyLine = (): CostLine => ({ type: "Ocean freight", description: "", supplier: "", currency: "EUR", amount: 0 });

export function QuoteWorkflow() {
  const { ref } = useParams<{ ref: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data: loaded, isLoading, saveData } = useSalesQuote(ref);
  const { duplicateQuote } = useSalesQuotes();
  const { customers } = useCustomers();
  const { terms } = useTermsConditions();

  const [draft, setDraft] = useState<SalesQuoteData>({});
  const hydrated = useRef(false);
  const [savedAt, setSavedAt] = useState<string>("");

  useEffect(() => {
    if (loaded && !hydrated.current) {
      setDraft(loaded);
      hydrated.current = true;
    }
  }, [loaded]);

  // Debounced autosave
  useEffect(() => {
    if (!hydrated.current) return;
    const t = setTimeout(() => {
      saveData(draft)
        .then(() => setSavedAt(new Date().toLocaleTimeString("en-GB")))
        .catch(() => {});
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const set = (patch: Partial<SalesQuoteData>) => setDraft((d) => ({ ...d, ...patch }));

  // Packages
  const packages = draft.packages ?? [];
  const recalcCargo = (pkgs: PackageLine[]) => {
    const weight = pkgs.reduce((s, p) => s + p.qty * p.weight, 0);
    const cbm = pkgs.reduce((s, p) => s + (p.qty * p.length * p.width * p.height) / 1_000_000, 0);
    return { weight, cbm: Math.round(cbm * 1000) / 1000 };
  };
  const updatePackages = (pkgs: PackageLine[]) => set({ packages: pkgs, ...recalcCargo(pkgs) });

  // Pricing
  const totals = useMemo(() => computeTotals(draft), [draft]);
  const updateLines = (kind: "buyingLines" | "sellingLines", lines: CostLine[]) => set({ [kind]: lines } as Partial<SalesQuoteData>);

  const done = {
    customer: !!draft.customerName,
    shipment: !!(draft.direction && draft.serviceType && draft.incoterm),
    routing: !!(draft.origin && draft.destination),
    cargo: !!(draft.commodity || packages.length),
    pricing: !!(draft.sellingLines?.length),
    terms: !!draft.shippingTerms,
  };

  const duplicate = async () => {
    try {
      const newRef = await duplicateQuote({ baseRef: ref, data: { ...draft } });
      toast.success(`Duplicated as ${newRef}`);
      router.push(`/sales/quote/${newRef}`);
    } catch {
      toast.error("Failed to duplicate");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Spin />
      </div>
    );
  }

  const badge = (ok: boolean) => (
    <Tag color={ok ? "green" : "default"} className="ml-2 rounded-xl text-[11px]">
      {ok ? "Completed" : "Incomplete"}
    </Tag>
  );

  const collapseItems = [
    {
      key: "customer",
      label: <span className="font-medium">Customer{badge(done.customer)}</span>,
      children: (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Customer">
            <Select
              showSearch
              className="w-full"
              placeholder="Search customer database…"
              value={draft.customerId}
              optionFilterProp="label"
              onChange={async (id) => {
                const c = customers.find((x) => x.id === id);
                if (!c) return;
                set({ customerId: c.id, customerName: c.companyName, customerLabel: c.label });
                // Auto-fill contact from the customer's main CRM contact.
                try {
                  const res = await api.customers.contactList(c.id);
                  const main = res.data.find((x) => x.isMain) ?? res.data[0];
                  if (main) set({ customerContact: main.name, customerEmail: main.email, customerPhone: main.phone });
                } catch {
                  /* ignore — contact fields stay editable */
                }
              }}
              options={customers.map((c) => ({ value: c.id, label: c.companyName }))}
            />
          </Field>
          <Field label="Contact person">
            <Input value={draft.customerContact ?? ""} onChange={(e) => set({ customerContact: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input value={draft.customerEmail ?? ""} onChange={(e) => set({ customerEmail: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={draft.customerPhone ?? ""} onChange={(e) => set({ customerPhone: e.target.value })} />
          </Field>
          <Field label="Sales owner">
            <Input value={draft.salesOwner ?? ""} onChange={(e) => set({ salesOwner: e.target.value })} />
          </Field>
        </div>
      ),
    },
    {
      key: "shipment",
      label: <span className="font-medium">Shipment details{badge(done.shipment)}</span>,
      children: (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Direction">
            <Select className="w-full" value={draft.direction} onChange={(v) => set({ direction: v })} options={DIRECTIONS.map((d) => ({ value: d, label: d }))} />
          </Field>
          <Field label="Service type">
            <Select className="w-full" value={draft.serviceType} onChange={(v) => set({ serviceType: v })} options={SERVICE_TYPES.map((d) => ({ value: d, label: d }))} />
          </Field>
          <Field label="Incoterm">
            <Select className="w-full" value={draft.incoterm} onChange={(v) => set({ incoterm: v })} options={INCOTERMS.map((d) => ({ value: d, label: d }))} />
          </Field>
          <Field label="Cargo ready date">
            <Input placeholder="YYYY-MM-DD" value={draft.readyDate ?? ""} onChange={(e) => set({ readyDate: e.target.value })} />
          </Field>
        </div>
      ),
    },
    {
      key: "routing",
      label: <span className="font-medium">Routing{badge(done.routing)}</span>,
      children: (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Origin">
            <Input value={draft.origin ?? ""} onChange={(e) => set({ origin: e.target.value })} />
          </Field>
          <Field label="Destination">
            <Input value={draft.destination ?? ""} onChange={(e) => set({ destination: e.target.value })} />
          </Field>
          <Field label="Pickup">
            <Input value={draft.pickup ?? ""} onChange={(e) => set({ pickup: e.target.value })} />
          </Field>
          <Field label="Delivery">
            <Input value={draft.delivery ?? ""} onChange={(e) => set({ delivery: e.target.value })} />
          </Field>
          <Field label="Transit time">
            <Input value={draft.transit ?? ""} onChange={(e) => set({ transit: e.target.value })} />
          </Field>
        </div>
      ),
    },
    {
      key: "cargo",
      label: <span className="font-medium">Cargo details{badge(done.cargo)}</span>,
      children: (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Commodity">
              <Input value={draft.commodity ?? ""} onChange={(e) => set({ commodity: e.target.value })} />
            </Field>
            <div className="flex items-end gap-4 pb-1">
              <Checkbox checked={!!draft.stackable} onChange={(e) => set({ stackable: e.target.checked })}>
                Stackable
              </Checkbox>
              <Checkbox checked={!!draft.dangerous} onChange={(e) => set({ dangerous: e.target.checked })}>
                Dangerous goods
              </Checkbox>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[60px_1fr_1fr_1fr_1fr_90px_40px] gap-2 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">
              <span>Qty</span><span>Type</span><span>L (cm)</span><span>W (cm)</span><span>H (cm)</span><span>Kg/ea</span><span />
            </div>
            {packages.map((p, i) => (
              <div key={i} className="grid grid-cols-[60px_1fr_1fr_1fr_1fr_90px_40px] gap-2 px-3 py-2 items-center border-t border-slate-100">
                <InputNumber size="small" min={1} value={p.qty} onChange={(v) => updatePackages(packages.map((x, j) => (j === i ? { ...x, qty: v ?? 1 } : x)))} />
                <Input size="small" value={p.type} onChange={(e) => updatePackages(packages.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))} />
                <InputNumber size="small" min={0} value={p.length} onChange={(v) => updatePackages(packages.map((x, j) => (j === i ? { ...x, length: v ?? 0 } : x)))} />
                <InputNumber size="small" min={0} value={p.width} onChange={(v) => updatePackages(packages.map((x, j) => (j === i ? { ...x, width: v ?? 0 } : x)))} />
                <InputNumber size="small" min={0} value={p.height} onChange={(v) => updatePackages(packages.map((x, j) => (j === i ? { ...x, height: v ?? 0 } : x)))} />
                <InputNumber size="small" min={0} value={p.weight} onChange={(v) => updatePackages(packages.map((x, j) => (j === i ? { ...x, weight: v ?? 0 } : x)))} />
                <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => updatePackages(packages.filter((_, j) => j !== i))} />
              </div>
            ))}
            <div className="px-3 py-2 border-t border-slate-100 flex items-center justify-between">
              <Button size="small" icon={<PlusOutlined />} onClick={() => updatePackages([...packages, { ...emptyPackage }])}>
                Add package
              </Button>
              <span className="text-xs text-slate-500">
                Total: <b>{draft.weight ?? 0} kg</b> · <b>{draft.cbm ?? 0} cbm</b>
              </span>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "pricing",
      label: <span className="font-medium">Pricing{badge(done.pricing)}</span>,
      children: (
        <div className="space-y-4">
          <Field label="Currency">
            <Select className="w-40" value={draft.currency ?? "EUR"} onChange={(v) => set({ currency: v })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          </Field>
          <CostLinesEditor title="Buying (cost)" lines={draft.buyingLines ?? []} onChange={(l) => updateLines("buyingLines", l)} />
          <CostLinesEditor title="Selling (rate)" lines={draft.sellingLines ?? []} onChange={(l) => updateLines("sellingLines", l)} />
          <div className="flex justify-end gap-6 text-sm">
            <span className="text-slate-500">Selling: <b className="text-slate-800">{fmt(totals.selling, draft.currency)}</b></span>
            <span className="text-slate-500">Buying: <b className="text-slate-800">{fmt(totals.buying, draft.currency)}</b></span>
            <span className="text-slate-500">Profit: <b className={totals.profit >= 0 ? "text-green-600" : "text-red-600"}>{fmt(totals.profit, draft.currency)} ({totals.margin}%)</b></span>
          </div>
        </div>
      ),
    },
    {
      key: "terms",
      label: <span className="font-medium">Shipping terms{badge(done.terms)}</span>,
      children: (
        <div className="space-y-3">
          <Field label="Template">
            <Select
              className="w-full"
              placeholder="Select a T&C template…"
              value={draft.shippingTerms}
              onChange={(name) => {
                const t = terms.find((x) => x.name === name);
                set({ shippingTerms: name, shippingIncludes: t?.includes ?? draft.shippingIncludes, shippingExcludes: t?.excludes ?? draft.shippingExcludes });
              }}
              options={terms.map((t) => ({ value: t.name, label: t.name }))}
            />
          </Field>
          <Field label="Rate offer includes">
            <Input.TextArea rows={4} value={draft.shippingIncludes ?? ""} onChange={(e) => set({ shippingIncludes: e.target.value })} />
          </Field>
          <Field label="Rate offer excludes">
            <Input.TextArea rows={4} value={draft.shippingExcludes ?? ""} onChange={(e) => set({ shippingExcludes: e.target.value })} />
          </Field>
        </div>
      ),
    },
  ];

  return (
    <div className="bg-slate-50 min-h-full p-6">
      <div className="max-w-[1100px] mx-auto">
        <button onClick={() => router.push("/sales?tab=quotes")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeftOutlined className="text-xs" /> Quote History
        </button>

        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800 m-0 font-mono">{ref}</h1>
            <div className="text-xs text-slate-400 mt-0.5">{savedAt ? `Saved ${savedAt}` : "Autosaves as you type"}</div>
          </div>
          <div className="flex gap-2">
            <Button icon={<SaveOutlined />} onClick={() => saveData(draft).then(() => toast.success("Saved"))}>
              Save
            </Button>
            <Button icon={<CopyOutlined />} onClick={duplicate}>
              Duplicate
            </Button>
            <Button type="primary" icon={<FilePdfOutlined />} onClick={() => printQuote(ref, draft)}>
              Export PDF
            </Button>
          </div>
        </div>

        <div className="mb-4">
          <LifecycleBar data={draft} onChange={(patch) => set(patch)} />
        </div>

        <Collapse items={collapseItems} defaultActiveKey={["customer"]} className="bg-white" />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      {children}
    </div>
  );
}

function CostLinesEditor({ title, lines, onChange }: { title: string; lines: CostLine[]; onChange: (l: CostLine[]) => void }) {
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">{title}</div>
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_90px_110px_40px] gap-2 px-3 py-2 items-center border-t border-slate-100">
          <Select
            size="small"
            value={l.type}
            onChange={(v) => onChange(lines.map((x, j) => (j === i ? { ...x, type: v } : x)))}
            options={COST_LINE_TYPES.map((t) => ({ value: t, label: t }))}
          />
          <Input size="small" placeholder="Description" value={l.description} onChange={(e) => onChange(lines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
          <Select
            size="small"
            value={l.currency}
            onChange={(v) => onChange(lines.map((x, j) => (j === i ? { ...x, currency: v } : x)))}
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          />
          <InputNumber size="small" className="w-full" min={0} value={l.amount} onChange={(v) => onChange(lines.map((x, j) => (j === i ? { ...x, amount: v ?? 0 } : x)))} />
          <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => onChange(lines.filter((_, j) => j !== i))} />
        </div>
      ))}
      <div className="px-3 py-2 border-t border-slate-100">
        <Button size="small" icon={<PlusOutlined />} onClick={() => onChange([...lines, emptyLine()])}>
          Add line
        </Button>
      </div>
    </div>
  );
}
