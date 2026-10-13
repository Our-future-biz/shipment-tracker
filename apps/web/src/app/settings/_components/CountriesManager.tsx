"use client";

import { useState } from "react";
import { Table, Button, Modal, Form, Select } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useToast } from "@/lib/toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useCountries } from "@/hooks/useOrgUnits";
import type { Country } from "@/hooks/useOrgUnits";
import { COUNTRIES } from "@/lib/countries";

// null = closed, "new" = adding, otherwise the country being edited.
type Editing = Country | "new" | null;

export function CountriesManager() {
  const toast = useToast();
  const { countries, isLoading, createCountry, updateCountry, deleteCountry } = useCountries();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleteTarget, setDeleteTarget] = useState<Country | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<{ code: string }>();

  // A country is added once; the one being edited stays choosable.
  const taken = new Set(countries.filter((c) => editing === "new" || c.id !== editing?.id).map((c) => c.code));
  const options = COUNTRIES.map((c) => ({ value: c.code, label: c.name, disabled: taken.has(c.code) }));

  const handleSubmit = async () => {
    if (!editing) return;
    const { code } = await form.validateFields();
    const country = COUNTRIES.find((c) => c.code === code);
    if (!country) return;
    setSaving(true);
    try {
      if (editing === "new") await createCountry(country);
      else await updateCountry({ id: editing.id, input: country });
      toast.success("Country saved");
      setEditing(null);
    } catch {
      toast.error("Failed to save country (it may already be added)");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCountry(deleteTarget.id);
      toast.success("Country removed");
    } catch {
      toast.error("Failed to remove country");
    }
    setDeleteTarget(null);
  };

  const columns: ColumnsType<Country> = [
    { title: "Name", dataIndex: "name" },
    { title: "Code", dataIndex: "code", width: 200 },
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
        <span className="text-sm font-semibold text-slate-800">Countries ({countries.length})</span>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setEditing("new")}>
          Add Country
        </Button>
      </div>

      <Table<Country>
        size="small"
        rowKey="id"
        loading={isLoading}
        dataSource={countries}
        columns={columns}
        pagination={false}
        locale={{ emptyText: "No countries yet" }}
      />

      <Modal
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={handleSubmit}
        confirmLoading={saving}
        title={editing === "new" ? "Add Country" : "Edit Country"}
        okText="Save"
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          className="pt-2"
          preserve={false}
          initialValues={editing && editing !== "new" ? { code: editing.code } : {}}
        >
          <Form.Item name="code" label="Country" rules={[{ required: true, message: "Choose a country" }]}>
            <Select showSearch optionFilterProp="label" placeholder="Choose a country" options={options} />
          </Form.Item>
        </Form>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remove country"
        description={`Remove ${deleteTarget?.name} from the organization?`}
        confirmLabel="Remove"
        danger
      />
    </div>
  );
}
