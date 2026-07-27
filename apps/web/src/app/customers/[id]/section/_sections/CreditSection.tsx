"use client";

import { useMemo, useState } from "react";
import { Table, Spin, InputNumber, Button } from "antd";
import type { ColumnsType } from "antd/es/table";
import { KpiCard, SectionCard, CHART_COLORS } from "./shared";
import { useCustomer } from "@/hooks/useCustomers";
import { useCustomerInvoices } from "@/hooks/useCustomerInvoices";
import type { InvoiceItem } from "@/hooks/useCustomerInvoices";
import { fmtMoney } from "@/app/customers/_lib/constants";

const DAY_MS = 86400000;

const daysOverdueOf = (dueDate: string): number | null => {
  if (!dueDate) return null;
  const due = new Date(dueDate).getTime();
  if (Number.isNaN(due)) return null;
  return Math.floor((Date.now() - due) / DAY_MS);
};

type AgingBucket = { key: string; label: string; amount: number; tone?: "red" };

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  status: string;
  amount: number;
  issuedAt: string;
  dueDate: string;
  daysOverdue: number | null;
};

export function CreditSection({ customerId }: { customerId: string }) {
  const { customer, updateCustomer } = useCustomer(customerId);
  const { invoices, isLoading } = useCustomerInvoices(customerId);

  const currency = customer?.currency;
  const creditLimit = customer?.creditLimit ?? 0;

  const [limitInput, setLimitInput] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const stats = useMemo(() => {
    const unpaid = invoices.filter((i) => i.status !== "Paid");
    const outstanding = unpaid.reduce((sum, i) => sum + i.amount, 0);
    const overdueCount = invoices.filter((i) => i.status === "Overdue").length;
    const openCount = invoices.filter((i) => i.status === "Open").length;
    const available = creditLimit - outstanding;
    const utilization = creditLimit > 0 ? Math.round((outstanding / creditLimit) * 100) : 0;
    return { unpaid, outstanding, overdueCount, openCount, available, utilization };
  }, [invoices, creditLimit]);

  const barColor =
    stats.utilization >= 90 ? CHART_COLORS.red : stats.utilization >= 70 ? CHART_COLORS.amber : CHART_COLORS.green;

  const aging = useMemo<AgingBucket[]>(() => {
    const buckets: AgingBucket[] = [
      { key: "current", label: "Current", amount: 0 },
      { key: "1-30", label: "1–30", amount: 0 },
      { key: "31-60", label: "31–60", amount: 0 },
      { key: "61-90", label: "61–90", amount: 0, tone: "red" },
      { key: "90+", label: "90+", amount: 0, tone: "red" },
    ];
    for (const inv of stats.unpaid) {
      const days = daysOverdueOf(inv.dueDate);
      let idx: number;
      if (days == null || days <= 0) idx = 0;
      else if (days <= 30) idx = 1;
      else if (days <= 60) idx = 2;
      else if (days <= 90) idx = 3;
      else idx = 4;
      const bucket = buckets[idx];
      if (bucket) bucket.amount += inv.amount;
    }
    return buckets;
  }, [stats.unpaid]);

  const rows = useMemo<InvoiceRow[]>(
    () =>
      invoices.map((inv: InvoiceItem) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        amount: inv.amount,
        issuedAt: inv.issuedAt,
        dueDate: inv.dueDate,
        daysOverdue: inv.status === "Paid" ? null : daysOverdueOf(inv.dueDate),
      })),
    [invoices],
  );

  const columns: ColumnsType<InvoiceRow> = [
    { title: "Invoice #", dataIndex: "invoiceNumber", key: "invoiceNumber" },
    { title: "Status", dataIndex: "status", key: "status" },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      align: "right",
      render: (v: number) => fmtMoney(v, currency),
    },
    { title: "Issued", dataIndex: "issuedAt", key: "issuedAt" },
    { title: "Due", dataIndex: "dueDate", key: "dueDate" },
    {
      title: "Days overdue",
      dataIndex: "daysOverdue",
      key: "daysOverdue",
      align: "right",
      render: (v: number | null) => {
        if (v == null || v <= 0) return "—";
        return <span className="text-red-600">{v}</span>;
      },
    },
  ];

  const saveLimit = async () => {
    if (limitInput == null) return;
    setSaving(true);
    try {
      await updateCustomer({ creditLimit: limitInput });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spin />
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-6 gap-3 mb-4">
        <KpiCard label="Credit Limit" value={fmtMoney(creditLimit, currency)} />
        <KpiCard label="Outstanding" value={fmtMoney(stats.outstanding, currency)} />
        <KpiCard
          label="Available"
          value={fmtMoney(stats.available, currency)}
          tone={stats.available < 0 ? "red" : undefined}
        />
        <KpiCard
          label="Utilization %"
          value={`${stats.utilization}%`}
          tone={stats.utilization >= 90 ? "red" : stats.utilization >= 70 ? "amber" : undefined}
        />
        <KpiCard label="Open" value={stats.openCount} />
        <KpiCard label="Overdue" value={stats.overdueCount} tone={stats.overdueCount > 0 ? "red" : undefined} />
      </div>

      <div className="mb-4">
        <SectionCard title="Credit utilization">
          <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-3 rounded-full"
              style={{ width: `${Math.min(100, stats.utilization)}%`, backgroundColor: barColor }}
            />
          </div>
          <div className="mt-2 text-xs text-slate-500">{stats.utilization}% of credit limit used</div>
          <div className="mt-4 flex items-center gap-2">
            <span className="text-sm text-slate-600">Adjust credit limit</span>
            <InputNumber
              value={limitInput ?? creditLimit}
              min={0}
              className="w-40"
              onChange={(v) => setLimitInput(typeof v === "number" ? v : null)}
            />
            <Button type="primary" loading={saving} onClick={saveLimit}>
              Save
            </Button>
          </div>
        </SectionCard>
      </div>

      <div className="mb-4">
        <SectionCard title="Invoice Aging Analysis">
          <div className="grid grid-cols-5 gap-3">
            {aging.map((b) => (
              <KpiCard key={b.key} label={b.label} value={fmtMoney(b.amount, currency)} tone={b.tone} />
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="All invoices">
        <Table<InvoiceRow>
          size="small"
          rowKey="id"
          columns={columns}
          dataSource={rows}
          pagination={false}
        />
      </SectionCard>
    </div>
  );
}
