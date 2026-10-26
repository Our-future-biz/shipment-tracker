"use client";

import { useMemo, useState } from "react";
import { Button, Dropdown, Table, Tag } from "antd";
import { DeleteOutlined, EditOutlined, EllipsisOutlined, PlusOutlined, StarFilled } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { ConfirmModal } from "@/components/ConfirmModal";
import { SectionCard } from "@/components/SectionCard";
import { useCustomerContacts } from "@/hooks/useCustomerContacts";
import type { ContactItem } from "@/hooks/useCustomerContacts";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth/AuthContext";
import { canDeleteCustomerRecords } from "../../_lib/customerPermissions";
import { contactRoleColor } from "../../_lib/constants";
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

// `country` is the customer's: the one a new contact's phone number starts in.
export function ContactsTab({ customerId, country }: { customerId: string; country?: string | null }) {
  const { contacts, isLoading, isError, createContact, updateContact, deleteContact } = useCustomerContacts(customerId);
  const toast = useToast();
  const canDelete = canDeleteCustomerRecords(useAuth().user);
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
      width: 200,
      render: (v: string) =>
        v ? (
          <Tag color={contactRoleColor(v)} className="!m-0">
            {v}
          </Tag>
        ) : (
          EMPTY_CELL
        ),
    },
    {
      title: "",
      key: "actions",
      width: 56,
      render: (_: unknown, r) => (
        <div className="flex justify-end">
          <Dropdown
            trigger={["click"]}
            placement="bottomRight"
            menu={{
              items: [
                { key: "edit", label: "Edit", icon: <EditOutlined />, onClick: () => handleOpenDialog(r) },
                // Superadmins only (the API refuses everyone else).
                ...(canDelete
                  ? [{ key: "delete", label: "Delete", icon: <DeleteOutlined />, danger: true, onClick: () => setDeleteTarget(r) }]
                  : []),
              ],
            }}
          >
            <Button
              type="text"
              size="small"
              icon={<EllipsisOutlined className="!text-[20px]" />}
              aria-label={`Actions for ${r.name}`}
              className="!text-slate-600 hover:!text-slate-900"
            />
          </Dropdown>
        </div>
      ),
    },
  ];

  const deleteDescription = deleteTarget?.isMain
    ? `Delete ${deleteTarget.name}? This is the main contact used on shipments and quotes; mark another one as main afterwards. The contact is hidden from everyone but kept in the database, so it can be restored.`
    : `Delete ${deleteTarget?.name ?? "this contact"}? It is hidden from everyone but kept in the database, so it can be restored.`;

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
          locale={{ emptyText: isError ? "Could not load the contacts." : "No contacts yet" }}
        />
      </SectionCard>

      {/* A new key on every opening mounts the dialog with a fresh form. A reused form instance keeps the values it was
          opened with before and, in a production build, shows them again for the next contact. */}
      <CustomerContactDialog
        key={dialog.key}
        open={dialog.open}
        contact={dialog.contact}
        saving={saving}
        country={country}
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
