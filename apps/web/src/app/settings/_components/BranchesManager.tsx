"use client";

import { useState } from "react";
import { Table, Button, Modal, Form, Input } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useToast } from "@/lib/toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useBranches } from "@/hooks/useOrgUnits";
import type { Branch, BranchInput } from "@/hooks/useOrgUnits";

// null = closed, "new" = adding, otherwise the branch being edited.
type Editing = Branch | "new" | null;

export function BranchesManager() {
  const toast = useToast();
  const { branches, isLoading, createBranch, updateBranch, deleteBranch } = useBranches();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<BranchInput>();

  const handleSubmit = async () => {
    if (!editing) return;
    const input = await form.validateFields();
    setSaving(true);
    try {
      if (editing === "new") await createBranch(input);
      else await updateBranch({ id: editing.id, input });
      toast.success("Branch saved");
      setEditing(null);
    } catch {
      toast.error("Failed to save branch (the name may already be in use)");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteBranch(deleteTarget.id);
      toast.success("Branch removed");
    } catch {
      toast.error("Failed to remove branch");
    }
    setDeleteTarget(null);
  };

  const columns: ColumnsType<Branch> = [
    { title: "Name", dataIndex: "name" },
    { title: "Country", dataIndex: "country", width: 200 },
    {
      title: "",
      key: "actions",
      width: 90,
      render: (_: unknown, r) => (
        <div className="flex justify-end gap-1">
          <Button type="text" size="small" icon={<EditOutlined />} aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)} />
          <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={`Remove ${r.name}`} onClick={() => setDeleteTarget(r)} />
        </div>
      ),
    },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-slate-800">Branches ({branches.length})</span>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setEditing("new")}>
          Add Branch
        </Button>
      </div>

      <Table<Branch>
        size="small"
        rowKey="id"
        loading={isLoading}
        dataSource={branches}
        columns={columns}
        pagination={false}
        locale={{ emptyText: "No branches yet" }}
      />

      <Modal
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={handleSubmit}
        confirmLoading={saving}
        title={editing === "new" ? "Add Branch" : "Edit Branch"}
        okText="Save"
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          className="pt-2"
          preserve={false}
          initialValues={editing && editing !== "new" ? { name: editing.name, country: editing.country } : { name: "", country: "" }}
        >
          <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: "Name is required" }]}>
            <Input placeholder="e.g. Prague" />
          </Form.Item>
          <Form.Item
            name="country"
            label="Country"
            extra="Users of this branch see the noticeboard of this country."
            rules={[{ required: true, whitespace: true, message: "Country is required" }]}
          >
            <Input placeholder="e.g. Czech Republic" onPressEnter={handleSubmit} />
          </Form.Item>
        </Form>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remove branch"
        description={`Remove ${deleteTarget?.name}? Its users become unassigned and stop seeing its noticeboard posts.`}
        confirmLabel="Remove"
        danger
      />
    </div>
  );
}
