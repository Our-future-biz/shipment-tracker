"use client";

import { useState } from "react";
import { Table, Button, Modal, Form, Input } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useToast } from "@/lib/toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useDepartments } from "@/hooks/useOrgUnits";
import type { Department } from "@/hooks/useOrgUnits";

// null = closed, "new" = adding, otherwise the department being renamed.
type Editing = Department | "new" | null;

export function DepartmentsManager() {
  const toast = useToast();
  const { departments, isLoading, createDepartment, updateDepartment, deleteDepartment } = useDepartments();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<{ name: string }>();

  const handleSubmit = async () => {
    if (!editing) return;
    const { name } = await form.validateFields();
    setSaving(true);
    try {
      if (editing === "new") await createDepartment(name);
      else await updateDepartment({ id: editing.id, name });
      toast.success("Department saved");
      setEditing(null);
    } catch {
      toast.error("Failed to save department (the name may already be in use)");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDepartment(deleteTarget.id);
      toast.success("Department removed");
    } catch {
      toast.error("Failed to remove department");
    }
    setDeleteTarget(null);
  };

  const columns: ColumnsType<Department> = [
    { title: "Name", dataIndex: "name" },
    {
      title: "",
      key: "actions",
      width: 90,
      render: (_: unknown, r) => (
        <div className="flex justify-end gap-1">
          <Button type="text" size="small" icon={<EditOutlined />} aria-label={`Rename ${r.name}`} onClick={() => setEditing(r)} />
          <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={`Remove ${r.name}`} onClick={() => setDeleteTarget(r)} />
        </div>
      ),
    },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-slate-800">Departments ({departments.length})</span>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setEditing("new")}>
          Add Department
        </Button>
      </div>

      <Table<Department>
        size="small"
        rowKey="id"
        loading={isLoading}
        dataSource={departments}
        columns={columns}
        pagination={false}
        locale={{ emptyText: "No departments yet" }}
      />

      <Modal
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={handleSubmit}
        confirmLoading={saving}
        title={editing === "new" ? "Add Department" : "Rename Department"}
        okText="Save"
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          className="pt-2"
          preserve={false}
          initialValues={{ name: editing && editing !== "new" ? editing.name : "" }}
        >
          <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: "Name is required" }]}>
            <Input placeholder="e.g. Sea Import" onPressEnter={handleSubmit} />
          </Form.Item>
        </Form>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remove department"
        description={`Remove ${deleteTarget?.name}? Its users become unassigned and stop seeing its noticeboard posts.`}
        confirmLabel="Remove"
        danger
      />
    </div>
  );
}
