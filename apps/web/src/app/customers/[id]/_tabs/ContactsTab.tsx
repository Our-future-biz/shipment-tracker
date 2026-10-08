"use client";

import { useMemo, useState } from "react";
import { Button, Table, Tag } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined, StarFilled } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { ConfirmModal } from "@/components/ConfirmModal";
import { SectionCard } from "@/components/SectionCard";
import { useCustomerContacts } from "@/hooks/useCustomerContacts";
import type { ContactItem } from "@/hooks/useCustomerContacts";
import { useToast } from "@/lib/toast";
import { CONTACT_ROLE_COLORS } from "../../_lib/constants";
import { CustomerContactDialog } from "../_components/CustomerContactDialog";
import type { CustomerContactFormValues } from "../_components/CustomerContactDialog";
import { CustomerCountChip } from "../_components/CustomerCountChip";
import { EMPTY_CELL, TABLE_PAGINATION } from "../../_lib/customerTable";

interface ContactDialogState {
  // Counts the openings; used as the dialog's React key (see where the dialog is rendered).
  key: number;
  open: boolean;
  // The contact being edited; null when a new one is added.
  contact: ContactItem | null;
}

export function ContactsTab({ customerId }: { customerId: string }) {
  const { contacts, isLoading, createContact, updateContact, deleteContact } = useCustomerContacts(customerId);
  const toast = useToast();
  const [dialog, setDialog] = useState<ContactDialogState>({ key: 0, open: false, contact: null });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ContactItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Main contact first, as in the contact pickers on shipments and quotes; the rest stay in the order they were added.
  const rows = useMemo(() => [...contacts].sort((a, b) => Number(b.isMain) - Number(a.isMain)), [contacts]);

  const handleOpenDialog = (contact: ContactItem | null) => setDialog((prev) => ({ key: prev.key + 1, open: true, contact }));

  const handleCloseDialog = () => setDialog((prev) => ({ ...prev, open: false }));

  const handleSubmit = async (values: CustomerContactFormValues) => {
    const { contact } = dialog;
    setSaving(true);
    try {
      if (contact) await updateContact({ id: contact.id, params: values });
      else await createContact(values);
      toast.success(contact ? "Contact updated" : "Contact added");
      handleCloseDialog();
    } catch {
      toast.error(contact ? "Failed to update contact" : "Failed to add contact");
    } finally {
      setSaving(false);
    }
  };

  const handleCloseDelete = () => setDeleteTarget(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteContact(deleteTarget.id);
      toast.success("Contact deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete contact");
    } finally {
      setDeleting(false);
    }
  };

  const columns: ColumnsType<ContactItem> = [
    {
      title: "Name",
      dataIndex: "name",
      render: (v: string, r) => (
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
          {v}
          {r.isMain && (
            <span role="img" aria-label="Main contact" title="Main contact" className="text-xs text-amber-400">
              <StarFilled aria-hidden />
            </span>
          )}
        </span>
      ),
    },
    {
      title: "Email",
      dataIndex: "email",
      render: (v: string) =>
        v ? (
          <a href={`mailto:${v.trim()}`} className="text-indigo-600 hover:underline">
            {v}
          </a>
        ) : (
          EMPTY_CELL
        ),
    },
    { title: "Phone", dataIndex: "phone", render: (v: string) => v || EMPTY_CELL },
    {
      title: "Role",
      dataIndex: "role",
      width: 130,
      render: (v: string) =>
        v ? (
          <Tag color={CONTACT_ROLE_COLORS[v] ?? "default"} className="!m-0">
            {v}
          </Tag>
        ) : (
          EMPTY_CELL
        ),
    },
    {
      title: "",
      key: "actions",
      width: 90,
      render: (_: unknown, r) => (
        <div className="flex justify-end gap-1">
          <Button type="text" size="small" icon={<EditOutlined />} aria-label={`Edit ${r.name}`} onClick={() => handleOpenDialog(r)} />
          <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={`Delete ${r.name}`} onClick={() => setDeleteTarget(r)} />
        </div>
      ),
    },
  ];

  const deleteDescription = deleteTarget?.isMain
    ? `Delete ${deleteTarget.name}? This is the main contact used on shipments and quotes; mark another one as main afterwards.`
    : `Delete ${deleteTarget?.name ?? "this contact"}?`;

  return (
    <div className="space-y-5">
      <SectionCard
        title="Contacts"
        bodyClassName="p-2"
        extra={
          <>
            <CustomerCountChip count={contacts.length} />
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => handleOpenDialog(null)}>
              Add Contact
            </Button>
          </>
        }
      >
        <Table<ContactItem>
          size="small"
          rowKey="id"
          loading={isLoading}
          dataSource={rows}
          columns={columns}
          scroll={{ x: "max-content" }}
          pagination={TABLE_PAGINATION}
          locale={{ emptyText: "No contacts yet" }}
        />
      </SectionCard>

      {/* A new key on every opening mounts the dialog with a fresh form. A reused form instance keeps the values it was
          opened with before and, in a production build, shows them again for the next contact. */}
      <CustomerContactDialog
        key={dialog.key}
        open={dialog.open}
        contact={dialog.contact}
        saving={saving}
        onCancel={handleCloseDialog}
        onSubmit={handleSubmit}
      />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={handleCloseDelete}
        onConfirm={handleDelete}
        title="Delete contact"
        description={deleteDescription}
        confirmLabel="Delete"
        danger
        loading={deleting}
      />
    </div>
  );
}
