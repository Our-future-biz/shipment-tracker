"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, Input, Select, Checkbox, InputNumber, Collapse, Spin, Tag, Dropdown, Alert } from "antd";
import {
  ArrowLeftOutlined,
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
  FilePdfOutlined,
  SaveOutlined,
  DownOutlined,
  ThunderboltOutlined,
  MailOutlined,
  EyeOutlined,
  ImportOutlined,
} from "@ant-design/icons";
import { useSalesQuote } from "@/hooks/useSalesQuotes";
import { useCustomers } from "@/hooks/useCustomers";
import { useTermsConditions } from "@/hooks/useTermsConditions";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { SalesQuoteData, PackageLine, CostLine } from "../../_lib/types";
import { INCOTERMS, SERVICE_TYPES, DIRECTIONS, CURRENCIES, COST_LINE_TYPES, PACKING_TYPES, VALIDITY_OPTIONS } from "../../_lib/types";
import { computeTotals, computeCargo, fmt } from "../../_lib/salesQuote";
import { printQuote } from "../../_lib/printQuote";
import { LifecycleBar } from "./_components/LifecycleBar";
import { ImportInquiryModal } from "./_components/ImportInquiryModal";
import { CopyFromModal } from "./_components/CopyFromModal";
import { DuplicateWizardModal } from "./_components/DuplicateWizardModal";
import { PdfPreviewModal } from "./_components/PdfPreviewModal";
import { EmailQuoteModal } from "./_components/EmailQuoteModal";

const emptyPackage: PackageLine = { qty: 1, type: "Pallets", length: 120, width: 80, height: 100, weight: 100, stackable: true };
const emptyLine = (): CostLine => ({ type: "Ocean freight", description: "", supplier: "", currency: "EUR", amount: 0 });

export function QuoteWorkflow() {
  const { ref } = useParams<{ ref: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data: loaded, isLoading, saveData } = useSalesQuote(ref);
  const { customers } = useCustomers();
  const { terms, updateTerms } = useTermsConditions();

  const [draft, setDraft] = useState<SalesQuoteData>({});
  const hydrated = useRef(false);
  const draftRef = useRef<SalesQuoteData>({});
  const [savedAt, setSavedAt] = useState<string>("");
  const [modal, setModal] = useState<null | "import" | "copyQuote" | "copyShipment" | "duplicate" | "preview" | "email">(null);

  useEffect(() => {
    if (loaded && !hydrated.current) {
      setDraft(loaded);
      hydrated.current = true;
    }
  }, [loaded]);

  // Debounced autosave (+ flush latest on unmount / navigation so nothing is lost)
  useEffect(() => {
    draftRef.current = draft;
    if (!hydrated.current) return;
    const t = setTimeout(() => {
      saveData(draft)
        .then(() => setSavedAt(new Date().toLocaleTimeString("en-GB")))
        .catch(() => {});
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  useEffect(() => {
    return () => {
      if (hydrated.current) saveData(draftRef.current).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (patch: Partial<SalesQuoteData>) => setDraft((d) => ({ ...d, ...patch }));

  // Packages
  const packages = draft.packages ?? [];
  const cargo = useMemo(() => computeCargo(draft), [draft]);
  const updatePackages = (pkgs: PackageLine[]) => set({ packages: pkgs, weight: computeCargo({ packages: pkgs }).grossWeight, cbm: computeCargo({ packages: pkgs }).cbm });

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
              options={customers.map((c) => ({
                value: c.id,
                label: `${c.companyName}${c.ico ? " · IČO " + c.ico : ""}${c.city ? " · " + c.city : ""}`,
              }))}
            />
            {draft.customerId && (
              <div className="mt-1.5 flex items-center gap-2 text-xs">
                <Tag color="green">Loaded from CRM</Tag>
                {draft.customerLabel && <Tag color="blue">{draft.customerLabel}</Tag>}
                <button type="button" className="text-slate-400 hover:text-red-500" onClick={() => set({ customerId: undefined, customerLabel: undefined })}>
                  clear
                </button>
              </div>
            )}
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

          {draft.dangerous && (
            <Alert
              type="warning"
              showIcon
              message="Dangerous goods declared"
              description="Provide UN number, class, packing group and an SDS before booking. DG surcharges may apply."
            />
          )}

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[60px_1.3fr_70px_70px_70px_80px_70px_40px] gap-2 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">
              <span>Qty</span><span>Packing</span><span>L (cm)</span><span>W (cm)</span><span>H (cm)</span><span>Kg/ea</span><span>Stack</span><span />
            </div>
            {packages.map((p, i) => (
              <div key={i} className="grid grid-cols-[60px_1.3fr_70px_70px_70px_80px_70px_40px] gap-2 px-3 py-2 items-center border-t border-slate-100">
                <InputNumber size="small" min={1} value={p.qty} onChange={(v) => updatePackages(packages.map((x, j) => (j === i ? { ...x, qty: v ?? 1 } : x)))} />
                <Select size="small" value={p.type} onChange={(v) => updatePackages(packages.map((x, j) => (j === i ? { ...x, type: v } : x)))} options={PACKING_TYPES.map((t) => ({ value: t, label: t }))} />
                <InputNumber size="small" min={0} value={p.length} onChange={(v) => updatePackages(packages.map((x, j) => (j === i ? { ...x, length: v ?? 0 } : x)))} />
                <InputNumber size="small" min={0} value={p.width} onChange={(v) => updatePackages(packages.map((x, j) => (j === i ? { ...x, width: v ?? 0 } : x)))} />
                <InputNumber size="small" min={0} value={p.height} onChange={(v) => updatePackages(packages.map((x, j) => (j === i ? { ...x, height: v ?? 0 } : x)))} />
                <InputNumber size="small" min={0} value={p.weight} onChange={(v) => updatePackages(packages.map((x, j) => (j === i ? { ...x, weight: v ?? 0 } : x)))} />
                <div className="flex justify-center">
                  <Checkbox checked={p.stackable !== false} onChange={(e) => updatePackages(packages.map((x, j) => (j === i ? { ...x, stackable: e.target.checked } : x)))} />
                </div>
                <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => updatePackages(packages.filter((_, j) => j !== i))} />
              </div>
            ))}
            <div className="px-3 py-2 border-t border-slate-100">
              <Button size="small" icon={<PlusOutlined />} onClick={() => updatePackages([...packages, { ...emptyPackage }])}>
                Add package
              </Button>
            </div>
          </div>

          {/* Freight metrics */}
          <div className="grid grid-cols-5 gap-2">
            <Metric label="Packages" value={String(cargo.totalPackages)} />
            <Metric label="Gross weight" value={`${cargo.grossWeight} kg`} />
            <Metric label="Volume" value={`${cargo.cbm} cbm`} />
            <Metric label="Volumetric wt" value={`${cargo.volumetricWeight} kg`} />
            <Metric label="Chargeable wt" value={`${cargo.chargeableWeight} kg`} highlight />
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
          <CostLinesEditor title="Buying (cost)" lines={draft.buyingLines ?? []} onChange={(l) => updateLines("buyingLines", l)} showSupplier />
          <div className="flex justify-end">
            <Button size="small" icon={<CopyOutlined />} onClick={() => set({ sellingLines: (draft.buyingLines ?? []).map((l) => ({ ...l, supplier: undefined })) })}>
              Copy buying → selling
            </Button>
          </div>
          <CostLinesEditor title="Selling (rate)" lines={draft.sellingLines ?? []} onChange={(l) => updateLines("sellingLines", l)} />
          <div className="grid grid-cols-3 gap-3">
            <SummaryBox label="Buying" value={fmt(totals.buying, draft.currency)} />
            <SummaryBox label="Selling" value={fmt(totals.selling, draft.currency)} />
            <SummaryBox
              label={`Profit · ${totals.margin}%`}
              value={fmt(totals.profit, draft.currency)}
              tone={totals.margin >= 15 ? "green" : totals.margin >= 5 ? "amber" : "red"}
            />
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
          <Field label="Additional conditions / notes">
            <Input.TextArea rows={2} value={draft.shippingTermsNotes ?? ""} onChange={(e) => set({ shippingTermsNotes: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3 items-end">
            <Field label="Quote validity (days)">
              <Select
                className="w-full"
                value={draft.validityDays ?? 14}
                onChange={(v) => set({ validityDays: v })}
                options={VALIDITY_OPTIONS.map((d) => ({ value: d, label: `${d} days` }))}
              />
            </Field>
            {draft.shippingTerms && (
              <Button
                onClick={() => {
                  const t = terms.find((x) => x.name === draft.shippingTerms);
                  if (!t) return;
                  updateTerms({ id: t.id, params: { includes: draft.shippingIncludes ?? "", excludes: draft.shippingExcludes ?? "" } })
                    .then(() => toast.success(`Saved back to "${t.name}" template`))
                    .catch(() => toast.error("Failed to update template"));
                }}
              >
                Save changes to “{draft.shippingTerms}” template
              </Button>
            )}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="bg-slate-50 min-h-full p-6">
      <div className="max-w-[1100px] mx-auto">
        <button onClick={() => router.push("/sales/quotes")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeftOutlined className="text-xs" /> Quote History
        </button>

        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800 m-0 font-mono">{ref}</h1>
            <div className="text-xs text-slate-400 mt-0.5">{savedAt ? `Saved ${savedAt}` : "Autosaves as you type"}</div>
          </div>
          <div className="flex gap-2">
            <Dropdown
              menu={{
                items: [
                  { key: "import", icon: <ImportOutlined />, label: "Import inquiry data", onClick: () => setModal("import") },
                  { key: "copyQuote", icon: <CopyOutlined />, label: "Copy from quote", onClick: () => setModal("copyQuote") },
                  { key: "copyShipment", icon: <CopyOutlined />, label: "Copy from shipment", onClick: () => setModal("copyShipment") },
                ],
              }}
            >
              <Button icon={<ThunderboltOutlined />}>
                Quick actions <DownOutlined />
              </Button>
            </Dropdown>
            <Button icon={<SaveOutlined />} onClick={() => saveData(draft).then(() => toast.success("Saved"))}>
              Save
            </Button>
            <Button icon={<CopyOutlined />} onClick={() => setModal("duplicate")}>
              Duplicate
            </Button>
            <Button icon={<EyeOutlined />} onClick={() => setModal("preview")}>
              Preview
            </Button>
            <Button icon={<MailOutlined />} onClick={() => setModal("email")}>
              Email
            </Button>
            <Button type="primary" icon={<FilePdfOutlined />} onClick={() => printQuote(ref, draft)}>
              Export PDF
            </Button>
          </div>
        </div>

        <div className="mb-4">
          <LifecycleBar data={draft} onChange={(patch) => set(patch)} />
        </div>

        <div className="flex gap-4 items-start">
          <div className="flex-1 min-w-0">
            <Collapse items={collapseItems} defaultActiveKey={["customer"]} className="bg-white" />
          </div>
          <PreviewSidebar draft={draft} cargo={cargo} totals={totals} />
        </div>
      </div>

      <ImportInquiryModal open={modal === "import"} onClose={() => setModal(null)} onApply={(p) => set(p)} />
      <CopyFromModal open={modal === "copyQuote"} mode="quote" currentRef={ref} onClose={() => setModal(null)} onApply={(p) => set(p)} />
      <CopyFromModal open={modal === "copyShipment"} mode="shipment" currentRef={ref} onClose={() => setModal(null)} onApply={(p) => set(p)} />
      <DuplicateWizardModal
        open={modal === "duplicate"}
        baseRef={ref}
        data={draft}
        onClose={() => setModal(null)}
        onDone={(r) => {
          setModal(null);
          router.push(`/sales/quote/${r}`);
        }}
      />
      <PdfPreviewModal open={modal === "preview"} quoteNumber={ref} data={draft} onClose={() => setModal(null)} />
      <EmailQuoteModal open={modal === "email"} quoteNumber={ref} data={draft} onClose={() => setModal(null)} />
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

function CostLinesEditor({ title, lines, onChange, showSupplier }: { title: string; lines: CostLine[]; onChange: (l: CostLine[]) => void; showSupplier?: boolean }) {
  const cols = showSupplier ? "grid-cols-[1.1fr_1.1fr_1fr_80px_100px_100px_36px]" : "grid-cols-[1.3fr_1.3fr_80px_100px_100px_36px]";
  const patch = (i: number, p: Partial<CostLine>) => onChange(lines.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">{title}</div>
      <div className={`grid ${cols} gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase text-slate-400`}>
        <span>Type</span>
        <span>Description</span>
        {showSupplier && <span>Supplier</span>}
        <span>Ccy</span>
        <span>Amount</span>
        <span>Value</span>
        <span />
      </div>
      {lines.map((l, i) => (
        <div key={i} className={`grid ${cols} gap-2 px-3 py-2 items-center border-t border-slate-100`}>
          <Select size="small" value={l.type} onChange={(v) => patch(i, { type: v })} options={COST_LINE_TYPES.map((t) => ({ value: t, label: t }))} />
          <Input size="small" placeholder="Description" value={l.description} onChange={(e) => patch(i, { description: e.target.value })} />
          {showSupplier && <Input size="small" placeholder="Supplier" value={l.supplier ?? ""} onChange={(e) => patch(i, { supplier: e.target.value })} />}
          <Select size="small" value={l.currency} onChange={(v) => patch(i, { currency: v })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          <InputNumber size="small" className="w-full" min={0} value={l.amount} onChange={(v) => patch(i, { amount: v ?? 0 })} />
          <InputNumber size="small" className="w-full" min={0} placeholder="=amt" value={l.value} onChange={(v) => patch(i, { value: v ?? undefined })} />
          <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => onChange(lines.filter((_, j) => j !== i))} />
        </div>
      ))}
      <div className="px-3 py-2 border-t border-slate-100">
        <Button size="small" icon={<PlusOutlined />} onClick={() => onChange([...lines, emptyLine()])}>
          Add {showSupplier ? "buying" : "selling"} cost
        </Button>
      </div>
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2 border ${highlight ? "bg-indigo-50 border-indigo-200" : "bg-slate-50 border-slate-100"}`}>
      <div className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-bold mt-0.5 ${highlight ? "text-indigo-700" : "text-slate-800"}`}>{value}</div>
    </div>
  );
}

function SummaryBox({ label, value, tone }: { label: string; value: string; tone?: "green" | "amber" | "red" }) {
  const toneClass = tone === "green" ? "text-green-600" : tone === "amber" ? "text-amber-600" : tone === "red" ? "text-red-600" : "text-slate-800";
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
      <div className="text-[11px] text-slate-400 uppercase tracking-wide">{label}</div>
      <div className={`text-base font-bold mt-0.5 ${toneClass}`}>{value}</div>
    </div>
  );
}

function PreviewSidebar({
  draft,
  cargo,
  totals,
}: {
  draft: SalesQuoteData;
  cargo: { totalPackages: number; grossWeight: number; cbm: number; chargeableWeight: number };
  totals: { selling: number; buying: number; profit: number; margin: number };
}) {
  const line = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-2">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-700 text-right">{value || "—"}</span>
    </div>
  );
  return (
    <div className="w-72 shrink-0 sticky top-4 bg-white border border-slate-200 rounded-2xl p-4 space-y-3 text-[12px]">
      <div className="text-sm font-semibold text-slate-800">Live preview</div>
      <div className="space-y-1">
        {line("Customer", draft.customerName)}
        {line("Service", draft.serviceType)}
        {line("Incoterm", draft.incoterm)}
      </div>
      <div className="border-t border-slate-100 pt-2 space-y-1">
        {line("Route", draft.origin || draft.destination ? `${draft.origin || "—"} → ${draft.destination || "—"}` : "")}
        {line("Ready", draft.readyDate)}
      </div>
      <div className="border-t border-slate-100 pt-2 space-y-1">
        {line("Packages", cargo.totalPackages || "")}
        {line("Chargeable wt", cargo.chargeableWeight ? `${cargo.chargeableWeight} kg` : "")}
        {line("CBM", cargo.cbm || "")}
      </div>
      <div className="border-t border-slate-100 pt-2 space-y-1">
        {line("Selling", fmt(totals.selling, draft.currency))}
        {line("Profit", <span className={totals.profit >= 0 ? "text-green-600" : "text-red-600"}>{fmt(totals.profit, draft.currency)} ({totals.margin}%)</span>)}
      </div>
    </div>
  );
}
