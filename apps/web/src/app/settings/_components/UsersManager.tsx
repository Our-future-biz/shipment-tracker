"use client";

import { useState } from "react";
import { Table, Button, Modal, Form, Input, Select } from "antd";
import { PlusOutlined, EditOutlined, StopOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useToast } from "@/lib/toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Badge, type Tone } from "@/components/Badge";
import { SectionCard } from "@/components/SectionCard";
import { EMPTY } from "@/styles/ui";
import type { ManagedUser, NewUserInput, UpdateUserInput } from "@/hooks/useUserAdmin";
import type { Department, Branch } from "@/hooks/useOrgUnits";

// The role marks in the app's badge tones: the administrators in indigo, managers amber, users grey.
const ROLE_TONE: Record<string, Tone> = { superadmin: "i", admin: "i", manager: "a", user: "" };

// The roles a user may report to: the server's MANAGES (apps/api/services/auth/services/auth.service.ts),
// which refuses anyone else as "Reports to". apps/web has no shared copy of it - keep the two in step.
const MANAGES: readonly string[] = ["superadmin", "admin", "manager"];
const NO_LONGER_MANAGER = "(no longer a manager)";

export function UsersManager({
  users,
  isLoading,
  allowedRoles,
  currentUserId,
  orgUnits,
  createUser,
  updateUser,
  deleteUser,
}: {
  users: ManagedUser[];
  isLoading: boolean;
  allowedRoles: string[]; // roles this actor may assign
  currentUserId: string;
  // The company's departments and branches; when given, users can be assigned to them, and to
  // the manager they report to (a manager or admin of the company), who gets the user's discount
  // inquiries in Sales.
  orgUnits?: { departments: Department[]; branches: Branch[] };
  createUser: (input: NewUserInput) => Promise<unknown>;
  updateUser: (args: { id: string; input: UpdateUserInput }) => Promise<unknown>;
  deleteUser: (id: string) => Promise<unknown>;
}) {
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ManagedUser | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<ManagedUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [addForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const roleOptions = allowedRoles.map((r) => ({ value: r, label: r }));
  const departmentOptions = (orgUnits?.departments ?? []).map((d) => ({ value: d.id, label: d.name }));
  const branchOptions = (orgUnits?.branches ?? []).map((b) => ({ value: b.id, label: `${b.name} (${b.country})` }));
  const managerOptions = users.filter((u) => MANAGES.includes(u.role)).map((u) => ({ value: u.id, label: u.displayName || u.email }));
  const unitName = (options: { value: string; label: string }[], id: string | null) =>
    options.find((o) => o.value === id)?.label ?? <span className={EMPTY}>—</span>;
  // A user may still report to somebody who was since demoted or removed: named for what they are
  // now, never by a bare id.
  const formerManager = (id: string) => {
    const u = users.find((x) => x.id === id);
    return u ? `${u.displayName || u.email} ${NO_LONGER_MANAGER}` : NO_LONGER_MANAGER;
  };
  const reportsToName = (id: string | null) =>
    !id || managerOptions.some((o) => o.value === id) ? unitName(managerOptions, id) : <span className="text-slate-400">{formerManager(id)}</span>;
  // The managers to pick from - never the user themselves - and the one they report to now, when
  // that is no longer a manager: shown, but not to be picked again.
  const current = editTarget?.reportsToUserId ?? null;
  const reportsToOptions = [
    ...managerOptions.filter((o) => o.value !== editTarget?.id),
    ...(current && !managerOptions.some((o) => o.value === current) ? [{ value: current, label: formerManager(current), disabled: true }] : []),
  ];

  const orgUnitFields = orgUnits && (
    <>
      <Form.Item name="departmentId" label="Department">
        <Select options={departmentOptions} allowClear placeholder="Not assigned" />
      </Form.Item>
      <Form.Item name="branchId" label="Branch">
        <Select options={branchOptions} allowClear placeholder="Not assigned" />
      </Form.Item>
    </>
  );
  // Who the user reports to: never themselves. Asked only when editing (the user exists by then).
  const reportsToField = orgUnits && (
    <Form.Item name="reportsToUserId" label="Reports to" extra="Gets this user's discount inquiries in Sales; the admins are told when nobody is set.">
      <Select options={reportsToOptions} allowClear showSearch optionFilterProp="label" placeholder="Nobody" />
    </Form.Item>
  );
  // A cleared select yields undefined; the API needs an explicit null to unassign.
  const placement = (v: { departmentId?: string; branchId?: string }) =>
    orgUnits ? { departmentId: v.departmentId ?? null, branchId: v.branchId ?? null } : {};

  const submitAdd = async () => {
    const v = await addForm.validateFields();
    setSaving(true);
    try {
      await createUser({ email: v.email, password: v.password, displayName: v.displayName ?? "", role: v.role, ...placement(v) });
      toast.success("User created");
      addForm.resetFields();
      setAddOpen(false);
    } catch {
      toast.error("Failed to create user (email may already be in use)");
    } finally {
      setSaving(false);
    }
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    const v = await editForm.validateFields();
    setSaving(true);
    try {
      const input: UpdateUserInput = { displayName: v.displayName, ...placement(v) };
      // Reports to is sent only when it changes: the server checks it again, and a manager who was
      // demoted or removed since would refuse every other edit of the user.
      const reportsTo: string | null = v.reportsToUserId ?? null;
      if (orgUnits && reportsTo !== (editTarget.reportsToUserId ?? null)) input.reportsToUserId = reportsTo;
      // Send the role only when it changes: the API refuses a role "change" on your own
      // account and on superadmins, even to the same value.
      if (v.role !== editTarget.role) input.role = v.role;
      if (v.password) input.password = v.password;
      await updateUser({ id: editTarget.id, input });
      toast.success("User updated");
      setEditTarget(null);
    } catch {
      toast.error("Failed to update user");
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<ManagedUser> = [
    { title: "Name", dataIndex: "displayName", render: (v: string) => v || <span className={EMPTY}>—</span> },
    { title: "Email", dataIndex: "email", render: (v: string) => <span className="tabular-nums text-xs">{v}</span> },
    { title: "Role", dataIndex: "role", width: 130, render: (v: string) => <Badge tone={ROLE_TONE[v] ?? ""}>{v}</Badge> },
    ...(orgUnits
      ? [
          { title: "Department", dataIndex: "departmentId", render: (v: string | null) => unitName(departmentOptions, v) },
          { title: "Branch", dataIndex: "branchId", render: (v: string | null) => unitName(branchOptions, v) },
          { title: "Reports to", dataIndex: "reportsToUserId", render: (v: string | null) => reportsToName(v) },
        ]
      : []),
    {
      title: "",
      key: "actions",
      width: 110,
      render: (_: unknown, r) => (
        <div className="flex justify-end gap-1">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditTarget(r);
              editForm.setFieldsValue({
                displayName: r.displayName,
                role: r.role,
                password: "",
                departmentId: r.departmentId ?? undefined,
                branchId: r.branchId ?? undefined,
                reportsToUserId: r.reportsToUserId ?? undefined,
              });
            }}
          />
          <Button
            type="text"
            size="small"
            danger
            icon={<StopOutlined />}
            disabled={r.id === currentUserId}
            title={r.id === currentUserId ? "You can't deactivate yourself" : "Deactivate"}
            onClick={() => setDeactivateTarget(r)}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <SectionCard
        title={`Users (${users.length})`}
        bodyClassName="p-2"
        extra={
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            Add User
          </Button>
        }
      >
        <Table<ManagedUser>
          size="small"
          rowKey="id"
          loading={isLoading}
          dataSource={users}
          columns={columns}
          pagination={false}
          locale={{ emptyText: "No users yet" }}
        />
      </SectionCard>

      <Modal open={addOpen} onCancel={() => setAddOpen(false)} onOk={submitAdd} confirmLoading={saving} title="Add User" okText="Create" destroyOnHidden>
        <Form form={addForm} layout="vertical" initialValues={{ role: "user" }} className="pt-2">
          <Form.Item name="displayName" label="Name">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: "email", message: "Valid email required" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true, min: 12, message: "At least 12 characters" }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="Role">
            <Select options={roleOptions} />
          </Form.Item>
          {orgUnitFields}
        </Form>
      </Modal>

      <Modal open={!!editTarget} onCancel={() => setEditTarget(null)} onOk={submitEdit} confirmLoading={saving} title={`Edit ${editTarget?.email ?? ""}`} okText="Save" destroyOnHidden>
        <Form form={editForm} layout="vertical" className="pt-2">
          <Form.Item name="displayName" label="Name">
            <Input />
          </Form.Item>
          <Form.Item name="role" label="Role">
            <Select options={roleOptions} disabled={editTarget?.id === currentUserId} />
          </Form.Item>
          {orgUnitFields}
          {reportsToField}
          <Form.Item name="password" label="New password (leave blank to keep)" rules={[{ min: 12, message: "At least 12 characters" }]}>
            <Input.Password placeholder="••••••••" />
          </Form.Item>
        </Form>
      </Modal>

      <ConfirmModal
        open={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={async () => {
          if (deactivateTarget) await deleteUser(deactivateTarget.id);
          setDeactivateTarget(null);
          toast.success("User deactivated");
        }}
        title="Deactivate user"
        description={`Deactivate ${deactivateTarget?.email}? They will no longer be able to log in.`}
        confirmLabel="Deactivate"
        danger
      />
    </>
  );
}
