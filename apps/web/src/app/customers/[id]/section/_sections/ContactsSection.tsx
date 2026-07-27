"use client";

import { Table, Spin, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo } from "react";
import { useCustomerContacts, type ContactItem } from "@/hooks/useCustomerContacts";
import { KpiCard, SectionCard } from "./shared";

const ROLE_COLORS: Record<string, string> = {
  Sales: "blue",
  Operations: "green",
  Finance: "gold",
};

export function ContactsSection({ customerId }: { customerId: string }) {
  const { contacts, isLoading } = useCustomerContacts(customerId);

  const kpis = useMemo(() => {
    const rows = contacts as ContactItem[];
    return {
      total: rows.length,
      sales: rows.filter((c) => c.role === "Sales").length,
      operations: rows.filter((c) => c.role === "Operations").length,
      finance: rows.filter((c) => c.role === "Finance").length,
      hasMain: rows.some((c) => c.isMain),
    };
  }, [contacts]);

  const columns: ColumnsType<ContactItem> = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      render: (_: string, row: ContactItem) => (
        <span className="font-bold text-slate-800">
          {row.isMain && <span className="text-amber-500 mr-1">★</span>}
          {row.name}
        </span>
      ),
    },
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
      render: (email: string) => <span className="text-slate-600">{email || "—"}</span>,
    },
    {
      title: "Phone",
      dataIndex: "phone",
      key: "phone",
      render: (phone: string) => <span className="text-slate-600">{phone || "—"}</span>,
    },
    {
      title: "Role",
      dataIndex: "role",
      key: "role",
      render: (role: string) => (role ? <Tag color={ROLE_COLORS[role]}>{role}</Tag> : <span className="text-slate-400">—</span>),
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-5 gap-3 mb-4">
        <KpiCard label="Total" value={kpis.total} />
        <KpiCard label="Sales" value={kpis.sales} />
        <KpiCard label="Operations" value={kpis.operations} />
        <KpiCard label="Finance" value={kpis.finance} />
        <KpiCard label="Main set?" value={kpis.hasMain ? "Yes" : "No"} tone={kpis.hasMain ? "green" : undefined} />
      </div>

      <SectionCard title="Contact directory">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spin />
          </div>
        ) : (
          <Table<ContactItem>
            size="small"
            pagination={false}
            rowKey="id"
            columns={columns}
            dataSource={contacts as ContactItem[]}
          />
        )}
      </SectionCard>
    </div>
  );
}
