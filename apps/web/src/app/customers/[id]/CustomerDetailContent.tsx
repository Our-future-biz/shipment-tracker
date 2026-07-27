"use client";

import { useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button, Select, Dropdown, Spin } from "antd";
import { ArrowLeftOutlined, PictureOutlined, MoreOutlined, StarFilled, DeleteOutlined } from "@ant-design/icons";
import { useCustomer } from "@/hooks/useCustomers";
import type { controllers } from "@/lib/api/client";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useToast } from "@/lib/toast";
import { legalFormText } from "../_lib/companyAnalysis";
import {
  CUSTOMER_DETAIL_TABS,
  CUSTOMER_STATUSES,
  CUSTOMER_LABELS,
  CURRENCIES,
  PAYMENT_TERMS,
  labelStyle,
  statusDotColor,
  fmtMoney,
  marginPct,
} from "../_lib/constants";
import { EditableText } from "../_components/EditableText";
import { OverviewTab } from "./_tabs/OverviewTab";
import { ContactsTab } from "./_tabs/ContactsTab";
import { ShipmentsTab } from "./_tabs/ShipmentsTab";
import { QuotesTab } from "./_tabs/QuotesTab";
import { FinanceTab } from "./_tabs/FinanceTab";
import { DocumentsTab } from "./_tabs/DocumentsTab";
import { CommunicationTab } from "./_tabs/CommunicationTab";

export function CustomerDetailContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const { customer, isLoading, updateCustomer, deleteCustomer, fetchLogo, isFetchingLogo, uploadLogo, deleteLogo } = useCustomer(id);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const rawTab = searchParams.get("tab");
  const activeTab = CUSTOMER_DETAIL_TABS.some((t) => t.key === rawTab) ? (rawTab as string) : "overview";

  const setActiveTab = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const save = (field: string, value: unknown) => {
    updateCustomer({ [field]: value } as controllers.CustomerUpdateRequest).catch(() => toast.error("Failed to save"));
  };

  const onLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      uploadLogo(reader.result as string)
        .then(() => toast.success("Logo updated"))
        .catch(() => toast.error("Upload failed"));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Spin />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-6">
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/customers")}>
          Back to customers
        </Button>
        <div className="text-slate-400 mt-8 text-center">Customer not found.</div>
      </div>
    );
  }

  const margin = marginPct(customer.totalRevenue, customer.totalProfit);

  return (
    <div className="bg-slate-50 min-h-full p-6">
      <div className="max-w-[1600px] mx-auto">
        <button
          onClick={() => router.push("/customers")}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
        >
          <ArrowLeftOutlined className="text-xs" /> Customer Database
        </button>

        {/* Header card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
              {customer.logoData ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={customer.logoData} alt="" className="w-full h-full object-contain" />
              ) : (
                <span className="text-lg font-semibold text-slate-400">
                  {customer.companyName.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold text-slate-800 m-0">{customer.companyName}</h1>
                <span
                  className="inline-flex items-center gap-1 rounded-xl text-[11px] font-medium px-2.5 py-0.5"
                  style={{ backgroundColor: labelStyle(customer.label).bg, color: labelStyle(customer.label).text }}
                >
                  {customer.label === "KEY ACCOUNT" && <StarFilled className="text-[10px]" />}
                  {customer.label}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[13px] text-slate-600">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusDotColor(customer.status) }} />
                  {customer.status}
                </span>
                {/* Registry ACTIVE/INACTIVE badge */}
                <span
                  className={`rounded-xl text-[10px] font-semibold px-2 py-0.5 uppercase ${
                    customer.companyStatus.toLowerCase().includes("active")
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {customer.companyStatus.toLowerCase().includes("active") ? "Registry: Active" : "Registry: Inactive"}
                </span>
              </div>
              <div className="text-[13px] text-slate-500 mt-1 flex items-center gap-1 flex-wrap">
                <span>IČO {customer.ico}</span>
                {customer.dic && <span>· DIČ {customer.dic}</span>}
                {customer.legalForm && <span>· {legalFormText(customer.legalForm)}</span>}
                {customer.city && <span>· {customer.city}, {customer.country}</span>}
                <span>·</span>
                <span className="text-slate-400">Owner:</span>
                <EditableText value={customer.salesOwner} onCommit={(v) => save("salesOwner", v)} placeholder="assign…" />
                <span>·</span>
                <button onClick={() => router.push(`/customers/${id}/profile`)} className="text-indigo-500 hover:text-indigo-600">
                  Full profile →
                </button>
              </div>
            </div>

            <Dropdown
              trigger={["click"]}
              menu={{
                items: [
                  {
                    key: "fetch",
                    icon: <PictureOutlined />,
                    label: isFetchingLogo ? "Fetching…" : "Fetch logo from website",
                    onClick: () =>
                      fetchLogo()
                        .then(() => toast.success("Logo fetched"))
                        .catch(() => toast.error("No logo found — set a website first")),
                  },
                  { key: "upload", icon: <PictureOutlined />, label: "Upload logo", onClick: () => fileRef.current?.click() },
                  ...(customer.logoData
                    ? [{ key: "remove", label: "Remove logo", danger: true, onClick: () => deleteLogo() }]
                    : []),
                ],
              }}
            >
              <Button icon={<MoreOutlined />} />
            </Dropdown>
            <Button danger icon={<DeleteOutlined />} onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onLogoFile} />
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-4 gap-3 mt-5">
            <Kpi label="Total Revenue" value={fmtMoney(customer.totalRevenue, customer.currency)} />
            <Kpi label="Total Profit" value={fmtMoney(customer.totalProfit, customer.currency)} />
            <Kpi label="Margin" value={`${margin}%`} />
            <Kpi label="Shipments" value={String(customer.totalShipments)} />
          </div>
        </div>

        <div className="flex gap-4 items-start">
          {/* Main column: tabs */}
          <div className="flex-1 min-w-0">
            <div className="flex gap-0 mb-4 border-b border-slate-200 bg-white rounded-t-2xl px-2">
              {CUSTOMER_DETAIL_TABS.map((tab) => (
                <div
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-3 text-sm cursor-pointer transition-all duration-150 border-b-2 ${
                    activeTab === tab.key
                      ? "font-semibold text-indigo-500 border-indigo-500"
                      : "font-normal text-slate-400 border-transparent hover:text-slate-600"
                  }`}
                >
                  {tab.label}
                </div>
              ))}
            </div>

            {activeTab === "overview" && <OverviewTab customerId={id} />}
            {activeTab === "contacts" && <ContactsTab customerId={id} />}
            {activeTab === "shipments" && <ShipmentsTab customerId={id} />}
            {activeTab === "quotes" && <QuotesTab customerId={id} />}
            {activeTab === "finance" && <FinanceTab customerId={id} />}
            {activeTab === "documents" && <DocumentsTab customerId={id} />}
            {activeTab === "communication" && <CommunicationTab customerId={id} />}
          </div>

          {/* Right column: profile + registry */}
          <div className="w-80 shrink-0 space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="text-sm font-semibold text-slate-800 mb-3">CRM Profile</div>
              <div className="space-y-2.5 text-[13px]">
                <Field label="Status">
                  <Select
                    size="small"
                    variant="borderless"
                    value={customer.status}
                    onChange={(v) => save("status", v)}
                    options={CUSTOMER_STATUSES.map((s) => ({ value: s, label: s }))}
                    className="min-w-[130px]"
                  />
                </Field>
                <Field label="Account type">
                  <Select
                    size="small"
                    variant="borderless"
                    value={customer.label}
                    onChange={(v) => save("label", v)}
                    options={CUSTOMER_LABELS.map((s) => ({ value: s, label: s }))}
                    className="min-w-[150px]"
                  />
                </Field>
                <Field label="Sales owner">
                  <EditableText value={customer.salesOwner} onCommit={(v) => save("salesOwner", v)} />
                </Field>
                <Field label="Credit limit">
                  <EditableText
                    value={customer.creditLimit ? String(customer.creditLimit) : ""}
                    type="number"
                    onCommit={(v) => save("creditLimit", Number(v) || 0)}
                  />
                </Field>
                <Field label="Currency">
                  <Select
                    size="small"
                    variant="borderless"
                    value={customer.currency}
                    onChange={(v) => save("currency", v)}
                    options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                    className="min-w-[90px]"
                  />
                </Field>
                <Field label="Payment terms">
                  <Select
                    size="small"
                    variant="borderless"
                    value={customer.paymentTerms || undefined}
                    placeholder="—"
                    onChange={(v) => save("paymentTerms", v)}
                    options={PAYMENT_TERMS.map((s) => ({ value: s, label: s }))}
                    className="min-w-[120px]"
                  />
                </Field>
                <Field label="Freight terms">
                  <Select
                    size="small"
                    variant="borderless"
                    value={customer.freightPaymentTerms || undefined}
                    placeholder="—"
                    onChange={(v) => save("freightPaymentTerms", v)}
                    options={PAYMENT_TERMS.map((s) => ({ value: s, label: s }))}
                    className="min-w-[120px]"
                  />
                </Field>
                <Field label="Duty terms">
                  <Select
                    size="small"
                    variant="borderless"
                    value={customer.dutyPaymentTerms || undefined}
                    placeholder="—"
                    onChange={(v) => save("dutyPaymentTerms", v)}
                    options={PAYMENT_TERMS.map((s) => ({ value: s, label: s }))}
                    className="min-w-[120px]"
                  />
                </Field>
                <Field label="Website">
                  <EditableText value={customer.companyWebsite} onCommit={(v) => save("companyWebsite", v)} placeholder="add…" />
                </Field>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="text-sm font-semibold text-slate-800 mb-3">Registry (ARES)</div>
              <div className="space-y-2 text-[13px]">
                <ReadField label="IČO" value={customer.ico} />
                <ReadField label="DIČ" value={customer.dic} />
                <ReadField label="Legal form" value={legalFormText(customer.legalForm)} />
                <ReadField label="Address" value={customer.registeredAddress} />
                <ReadField label="NACE" value={customer.nace} />
                <ReadField label="Registered" value={customer.registrationDate} />
                <ReadField label="Registry status" value={customer.companyStatus} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          await deleteCustomer();
          setDeleteOpen(false);
          toast.success("Customer deleted");
          router.push("/customers");
        }}
        title="Delete customer"
        description={`Delete ${customer.companyName} and all its contacts, shipments, quotes, invoices, documents and notes? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
      <div className="text-[11px] text-slate-400 uppercase tracking-wide">{label}</div>
      <div className="text-lg font-bold text-slate-800 mt-0.5">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-400">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-slate-400 shrink-0">{label}</span>
      <span className="text-slate-700 text-right">{value || "—"}</span>
    </div>
  );
}
