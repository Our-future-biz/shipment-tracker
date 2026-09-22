"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, Input, Select, Checkbox, InputNumber, Spin, Tag, Alert, DatePicker } from "antd";
import dayjs from "dayjs";
import {
  ArrowLeftOutlined,
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
  FilePdfOutlined,
  SaveOutlined,
  DownOutlined,
  UpOutlined,
  RightOutlined,
  CheckOutlined,
  EditOutlined,
  SnippetsOutlined,
  MailOutlined,
  EyeOutlined,
  ImportOutlined,
} from "@ant-design/icons";
import { useSalesQuote, useSalesQuotes } from "@/hooks/useSalesQuotes";
import { useCustomers } from "@/hooks/useCustomers";
import { useTermsConditions } from "@/hooks/useTermsConditions";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { SalesQuoteData, PackageLine, CostLine } from "../../_lib/types";
import { INCOTERMS, SERVICE_TYPES, DIRECTIONS, CURRENCIES, COST_LINE_TYPES, PACKING_TYPES } from "../../_lib/types";
import { computeTotals, computeCargo, fmt, validityInfo, quoteFamily } from "../../_lib/salesQuote";
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
  const { salesQuotes } = useSalesQuotes();
  const { customers } = useCustomers();
  const { terms } = useTermsConditions();

  const [draft, setDraft] = useState<SalesQuoteData>({});
  const hydrated = useRef(false);
  const draftRef = useRef<SalesQuoteData>({});
  const [savedAt, setSavedAt] = useState<string>("");
  const [modal, setModal] = useState<null | "import" | "copyQuote" | "copyShipment" | "duplicate" | "preview" | "email">(null);
  const [openKey, setOpenKey] = useState<string>("customer");

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

  // Sibling variants of the same enquiry (base ref + its -2/-3 duplicates).
  // The active quote uses the live draft so the preview always shows fresh data.
  const family = useMemo(
    () =>
      quoteFamily(salesQuotes, ref).map((q) =>
        q.quoteNumber === ref ? { ...q, data: draft } : q,
      ),
    [salesQuotes, ref, draft],
  );

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

  const partial: Record<string, boolean> = {
    customer: !!(draft.customerName || draft.customerContact || draft.customerEmail || draft.customerPhone || draft.salesOwner),
    shipment: !!(draft.direction || draft.serviceType || draft.incoterm || draft.readyDate),
    routing: !!(draft.origin || draft.destination || draft.pickup || draft.delivery),
    cargo: !!(draft.commodity || packages.length || draft.stackable || draft.dangerous),
    pricing: !!(draft.buyingLines?.length || draft.sellingLines?.length),
    terms: !!(draft.shippingTerms || draft.shippingIncludes || draft.shippingExcludes),
  };
  const sectionStatus = (key: keyof typeof done): SectionStatus =>
    done[key] ? "completed" : partial[key] ? "in-progress" : "empty";

  const sections = [
    {
      key: "customer",
      num: 1,
      title: "Customer details",
      subtitle: "Customer and contact person",
      content: (
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
      num: 2,
      title: "Shipment details",
      subtitle: "Direction, service type and incoterm",
      content: (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Trade Direction">
            <Select className="w-full" value={draft.direction} onChange={(v) => set({ direction: v })} options={DIRECTIONS.map((d) => ({ value: d, label: d }))} />
          </Field>
          <Field label="Freight Mode">
            <Select className="w-full" value={draft.serviceType} onChange={(v) => set({ serviceType: v })} options={SERVICE_TYPES.map((d) => ({ value: d, label: d }))} />
          </Field>
          <Field label="Incoterm">
            <Select className="w-full" value={draft.incoterm} onChange={(v) => set({ incoterm: v })} options={INCOTERMS.map((d) => ({ value: d, label: d }))} />
          </Field>
          <Field label="Cargo Readiness Date">
            <DatePicker
              className="w-full"
              format="YYYY-MM-DD"
              placeholder="YYYY-MM-DD"
              value={draft.readyDate ? dayjs(draft.readyDate) : null}
              onChange={(_, dateStr) => set({ readyDate: (dateStr as string) || "" })}
            />
          </Field>
        </div>
      ),
    },
    {
      key: "routing",
      num: 3,
      title: "Routing",
      subtitle: "Origin, destination and addresses",
      content: (
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
        </div>
      ),
    },
    {
      key: "cargo",
      num: 4,
      title: "Cargo details",
      subtitle: "Commodity, packages and dimensions",
      content: (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cargo Description">
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
      num: 5,
      title: "Pricing",
      subtitle: "Buying & selling breakdown with margin",
      content: (
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
      num: 6,
      title: "Shipping terms",
      subtitle: "Rate inclusions, exclusions and validity",
      content: (
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valid until">
              <DatePicker
                className="w-full"
                format="YYYY-MM-DD"
                placeholder="Select expiry date"
                value={draft.validUntil ? dayjs(draft.validUntil) : null}
                onChange={(_, dateStr) => set({ validUntil: (dateStr as string) || "" })}
              />
            </Field>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="bg-slate-50 min-h-full p-6">
      <div className="max-w-[1320px] mx-auto">
        <button onClick={() => router.push("/sales/quotes")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeftOutlined className="text-xs" /> Quote History
        </button>

        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 m-0 font-mono">{ref}</h1>
            <div className="text-xs text-slate-400 mt-1">{savedAt ? `Saved ${savedAt}` : "Autosaves as you type"}</div>
          </div>
          <div className="flex gap-2">
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

        {family.length > 1 && (
          <div className="flex gap-2 mb-4 overflow-x-auto">
            {family.map((q) => {
              const active = q.quoteNumber === ref;
              const eyebrow = [q.data.serviceType, q.data.direction].filter(Boolean).join(" ").toUpperCase() || "QUOTE";
              return (
                <button
                  key={q.quoteNumber}
                  type="button"
                  onClick={() => {
                    if (!active) router.push(`/sales/quote/${q.quoteNumber}`);
                  }}
                  className={`shrink-0 text-left rounded-xl border px-3.5 py-2 transition ${
                    active
                      ? "bg-indigo-50 border-indigo-400 shadow-sm"
                      : "bg-white border-slate-200 hover:border-indigo-300"
                  }`}
                >
                  <div className={`text-[10px] font-semibold tracking-wider ${active ? "text-indigo-500" : "text-slate-400"}`}>
                    {eyebrow}
                  </div>
                  <div className={`font-mono text-[13px] font-bold ${active ? "text-indigo-700" : "text-slate-700"}`}>
                    {q.quoteNumber}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="mb-5">
          <LifecycleBar data={draft} onChange={(patch) => set(patch)} />
        </div>

        {/* Quick action cards */}
        <div className="flex gap-3 mb-5">
          <QuickCard icon={<ImportOutlined />} title="Import inquiry data" onClick={() => setModal("import")} />
          <QuickCard icon={<CopyOutlined />} title="Copy from quote" onClick={() => setModal("copyQuote")} />
          <QuickCard icon={<SnippetsOutlined />} title="Copy from shipment" onClick={() => setModal("copyShipment")} />
          <QuickCard icon={<EditOutlined />} title="Manual entry" onClick={() => setOpenKey("customer")} />
        </div>

        <div className="flex gap-6 items-start">
          <div className="flex-1 min-w-0">
            {sections.map((s, i) => (
              <AccordionSection
                key={s.key}
                num={s.num}
                title={s.title}
                subtitle={s.subtitle}
                status={sectionStatus(s.key as keyof typeof done)}
                open={openKey === s.key}
                onToggle={() => setOpenKey(openKey === s.key ? "" : s.key)}
              >
                {s.content}
                {sections[i + 1] && (
                  <div className="flex justify-end pt-4">
                    <Button type="primary" ghost onClick={() => setOpenKey(sections[i + 1]!.key)}>
                      Save &amp; continue <RightOutlined />
                    </Button>
                  </div>
                )}
              </AccordionSection>
            ))}
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
      <PdfPreviewModal open={modal === "preview"} quoteNumber={ref} data={draft} family={family} onClose={() => setModal(null)} />
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

type SectionStatus = "empty" | "in-progress" | "completed";

function AccordionSection({
  num,
  title,
  subtitle,
  status,
  open,
  onToggle,
  children,
}: {
  num: number;
  title: string;
  subtitle: string;
  status: SectionStatus;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const circle =
    status === "completed" ? "bg-green-600 text-white" : status === "in-progress" ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-500";
  const pill =
    status === "completed"
      ? "bg-green-50 text-green-700 border-green-200"
      : status === "in-progress"
        ? "bg-indigo-50 text-indigo-700 border-indigo-200"
        : "bg-slate-50 text-slate-400 border-slate-200";
  const pillLabel = status === "completed" ? "Completed" : status === "in-progress" ? "In progress" : "Not completed";

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm mb-2.5 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center px-5 py-4 hover:bg-slate-50 transition-colors text-left"
      >
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mr-3.5 ${circle}`}>
          {status === "completed" ? <CheckOutlined className="text-[13px]" /> : <span className="text-[13px] font-bold">{num}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold text-slate-900">{title}</div>
          <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${pill}`}>{pillLabel}</span>
          {open ? <UpOutlined className="text-[12px] text-slate-400" /> : <DownOutlined className="text-[12px] text-slate-400" />}
        </div>
      </button>
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="px-5 pb-5">
            <div className="h-px bg-slate-100 mb-4" />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickCard({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 min-w-0 flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-3.5 py-3 text-left shadow-sm hover:shadow-md hover:border-indigo-400 transition"
    >
      <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 shrink-0">{icon}</div>
      <div className="text-xs font-bold text-slate-800 flex-1 min-w-0">{title}</div>
      <RightOutlined className="text-[11px] text-slate-300 shrink-0" />
    </button>
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
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-2 py-1 border-b border-slate-50 last:border-b-0">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-700 text-right font-medium">{value || "—"}</span>
    </div>
  );
  const heading = (text: string) => (
    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-3 mb-1">{text}</div>
  );
  const validity = validityInfo(draft);
  return (
    <div className="w-80 shrink-0 sticky top-4 bg-white border border-slate-200 rounded-2xl p-4 text-[12px] max-h-[calc(100vh-2rem)] overflow-y-auto">
      <div className="text-sm font-semibold text-slate-800">Live preview</div>

      {heading("Customer")}
      {row("Company", draft.customerName)}
      {row("Contact", draft.customerContact)}
      {row("Email", draft.customerEmail)}
      {row("Phone", draft.customerPhone)}

      {heading("Routing")}
      {row("Service", draft.serviceType)}
      {row("Origin", draft.origin)}
      {row("Destination", draft.destination)}
      {row("Incoterm", draft.incoterm)}
      {row("Cargo ready", draft.readyDate)}

      {heading("Cargo")}
      {row("Commodity", draft.commodity)}
      {row("Packages", cargo.totalPackages || "")}
      {row("Gross weight", cargo.grossWeight ? `${cargo.grossWeight} kg` : "")}
      {row("CBM", cargo.cbm || "")}
      {row("Chargeable wt", cargo.chargeableWeight ? `${cargo.chargeableWeight} kg` : "")}

      {heading("Pricing summary")}
      {row("Buying", fmt(totals.buying, draft.currency))}
      {row("Selling", fmt(totals.selling, draft.currency))}
      {row(
        "Profit",
        <span className={totals.profit >= 0 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
          {fmt(totals.profit, draft.currency)} ({totals.margin}%)
        </span>,
      )}

      {(draft.shippingTerms || validity.date) && (
        <>
          {heading("Shipping terms")}
          {draft.shippingTerms ? row("Type", draft.shippingTerms) : null}
          {validity.date ? row("Valid until", validity.date) : null}
        </>
      )}
    </div>
  );
}
