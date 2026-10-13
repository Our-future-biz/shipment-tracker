"use client";

import { useMemo, useState } from "react";
import { Table, Button, Modal, Form, Input, Select } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useToast } from "@/lib/toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useBranches, useCountries, useLocations } from "@/hooks/useOrgUnits";
import type { Branch, BranchInput, Location } from "@/hooks/useOrgUnits";
import { matchesSearch, sectionTitle, emptyText } from "../_lib/orgSearch";

// "Springfield, Illinois (USSPI)": the region and the code tell apart places of the same name.
const cityLabel = (l: Location) => `${l.name}${l.subdivisionName ? `, ${l.subdivisionName}` : ""} (${l.code})`;

// Matches the name with or without diacritics, the region and the UN/LOCODE.
const cityMatches = (l: Location, query: string) => {
  const q = query.trim().toLowerCase();
  return [l.name, l.nameAscii, l.subdivisionName ?? "", l.code].some((v) => v.toLowerCase().includes(q));
};

// null = closed, "new" = adding, otherwise the branch being edited.
type Editing = Branch | "new" | null;

export function BranchesManager({ search }: { search: string }) {
  const toast = useToast();
  const { branches, isLoading, createBranch, updateBranch, deleteBranch } = useBranches();
  const shown = branches.filter((b) => matchesSearch(search, b.name, b.city, b.country, b.countryCode));
  const [editing, setEditing] = useState<Editing>(null);
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<BranchInput>();
  const { countries } = useCountries();
  // The city list follows the country chosen in the dialog.
  const countryCode = Form.useWatch("countryCode", form);
  const { locations, isLoading: locationsLoading } = useLocations(editing ? countryCode : undefined);
  const byId = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const cityOptions = useMemo(() => locations.map((l) => ({ value: l.id, label: cityLabel(l) })), [locations]);

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
    { title: "City", dataIndex: "city", width: 200, render: (city: string | null) => city ?? <span className="text-slate-400">—</span> },
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
        <span className="text-sm font-semibold text-slate-800">{sectionTitle("Branches", shown.length, branches.length)}</span>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setEditing("new")}>
          Add Branch
        </Button>
      </div>

      <Table<Branch>
        size="small"
        rowKey="id"
        loading={isLoading}
        dataSource={shown}
        columns={columns}
        pagination={false}
        locale={{ emptyText: emptyText(search, "No branches yet") }}
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
          initialValues={
            editing && editing !== "new"
              ? { name: editing.name, countryCode: editing.countryCode ?? undefined, locationId: editing.locationId ?? undefined }
              : { name: "" }
          }
          // A city belongs to one country: choosing another country clears it.
          onValuesChange={(changed) => {
            if ("countryCode" in changed) form.setFieldValue("locationId", undefined);
          }}
        >
          <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: "Name is required" }]}>
            <Input placeholder="e.g. Prague Office" />
          </Form.Item>
          <Form.Item
            name="countryCode"
            label="Country"
            extra={
              countries.length
                ? "Users of this branch see the noticeboard of this country."
                : "Add the country under Countries below first."
            }
            rules={[{ required: true, message: "Choose a country" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Choose a country"
              options={countries.map((c) => ({ value: c.code, label: c.name }))}
            />
          </Form.Item>
          <Form.Item name="locationId" label="City" rules={[{ required: true, message: "Choose a city" }]}>
            <Select
              showSearch
              disabled={!countryCode}
              loading={locationsLoading}
              placeholder={countryCode ? "Type to search the cities of this country" : "Choose a country first"}
              options={cityOptions}
              filterOption={(input, option) => {
                const place = option ? byId.get(option.value) : undefined;
                return !!place && cityMatches(place, input);
              }}
              notFoundContent={locationsLoading ? "Loading cities…" : "No city found"}
            />
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
