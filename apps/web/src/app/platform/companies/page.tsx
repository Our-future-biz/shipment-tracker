"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Table, Button, Modal, Form, Input } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useAuth } from "@/lib/auth/AuthContext";
import { usePlatformCompanies, type CompanyRow } from "@/hooks/useUserAdmin";
import { useToast } from "@/lib/toast";

export default function PlatformCompaniesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { companies, isLoading, provisionCompany, isProvisioning } = usePlatformCompanies();
  const [addOpen, setAddOpen] = useState(false);
  const [form] = Form.useForm();

  if (user?.role !== "superadmin") {
    return <div className="p-6 text-sm text-slate-500">This area is restricted to platform administrators.</div>;
  }

  const submit = async () => {
    const v = await form.validateFields();
    try {
      await provisionCompany({
        companyName: v.companyName,
        companySlug: v.companySlug,
        adminEmail: v.adminEmail,
        adminPassword: v.adminPassword,
        adminName: v.adminName ?? "",
      });
      toast.success(`Company ${v.companyName} created`);
      form.resetFields();
      setAddOpen(false);
    } catch {
      toast.error("Failed to create company (slug or admin email may already exist)");
    }
  };

  const columns: ColumnsType<CompanyRow> = [
    { title: "Company", dataIndex: "name", render: (v: string) => <span className="font-medium text-slate-800">{v}</span> },
    { title: "Slug", dataIndex: "slug", render: (v: string) => <span className="font-mono text-xs text-slate-500">{v}</span> },
    { title: "Created", dataIndex: "createdAt", width: 140, render: (v: string) => v?.slice(0, 10) ?? "—" },
    {
      title: "",
      key: "actions",
      width: 130,
      render: (_: unknown, r) => (
        <Button size="small" onClick={() => router.push(`/platform/companies/${r.id}`)}>
          Manage users
        </Button>
      ),
    },
  ];

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-slate-800">Companies</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
          New Company
        </Button>
      </div>
      <p className="text-sm text-slate-500 mb-4">Every company on the platform. Only platform administrators see this.</p>

      <Table<CompanyRow>
        size="small"
        rowKey="id"
        loading={isLoading}
        dataSource={companies}
        columns={columns}
        pagination={false}
        onRow={(r) => ({ onClick: () => router.push(`/platform/companies/${r.id}`), className: "cursor-pointer" })}
        locale={{ emptyText: "No companies yet" }}
      />

      <Modal open={addOpen} onCancel={() => setAddOpen(false)} onOk={submit} confirmLoading={isProvisioning} title="New Company" okText="Create company" width={520} destroyOnHidden>
        <p className="text-xs text-slate-500 mb-3 pt-1">Creates the company and its first admin. That admin then adds their own users.</p>
        <Form form={form} layout="vertical">
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="companyName" label="Company name" rules={[{ required: true, message: "Required" }]}>
              <Input placeholder="Acme Logistics" />
            </Form.Item>
            <Form.Item name="companySlug" label="Slug" rules={[{ required: true, pattern: /^[a-z0-9-]+$/, message: "lowercase letters, numbers, hyphens" }]}>
              <Input placeholder="acme" />
            </Form.Item>
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">First admin</div>
          <Form.Item name="adminName" label="Admin name">
            <Input />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="adminEmail" label="Admin email" rules={[{ required: true, type: "email", message: "Valid email required" }]}>
              <Input />
            </Form.Item>
            <Form.Item name="adminPassword" label="Admin password" rules={[{ required: true, min: 8, message: "At least 8 characters" }]}>
              <Input.Password />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
