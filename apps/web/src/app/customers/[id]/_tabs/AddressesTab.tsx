"use client";

import { useMemo, useState } from "react";
import { Button, Dropdown, Table, Tag } from "antd";
import { DeleteOutlined, EditOutlined, EllipsisOutlined, PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { ConfirmModal } from "@/components/ConfirmModal";
import { SectionCard } from "@/components/SectionCard";
import { useCustomerAddresses } from "@/hooks/useCustomerAddresses";
import type { AddressItem } from "@/hooks/useCustomerAddresses";
import { useCustomer } from "@/hooks/useCustomers";
import { COUNTRIES, flagOf } from "@/lib/countries";
import { useToast } from "@/lib/toast";
import { ADDRESS_TYPE_COLORS, ADDRESS_TYPES } from "../../_lib/constants";
import { CustomerAddressDialog } from "../_components/CustomerAddressDialog";
import type { CustomerAddressFormValues } from "../_components/CustomerAddressDialog";
import { CustomerCountChip } from "../_components/CustomerCountChip";
import { EMPTY_CELL, TABLE_PAGINATION } from "../../_lib/customerTable";

const COUNTRY_NAME = new Map(COUNTRIES.map((country) => [country.code, country.name]));

// The seat first, then the others in the order of the type list, each type in the order added.
const typeOrder = (address: AddressItem) => ADDRESS_TYPES.indexOf(address.type);

interface AddressDialogState {
  // Counts the openings; used as the dialog's React key (see where the dialog is rendered).
  key: number;
  open: boolean;
  // The address being edited; null when a new one is added.
  address: AddressItem | null;
}

// Where the customer is: its seat, where invoices go, where goods are picked up and delivered.
export function AddressesTab({ customerId }: { customerId: string }) {
  const { addresses, isLoading, createAddress, updateAddress, deleteAddress } = useCustomerAddresses(customerId);
  const { customer } = useCustomer(customerId);
  const toast = useToast();
  const [dialog, setDialog] = useState<AddressDialogState>({ key: 0, open: false, address: null });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AddressItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const rows = useMemo(() => [...addresses].sort((a, b) => typeOrder(a) - typeOrder(b)), [addresses]);

  const handleOpenDialog = (address: AddressItem | null) => setDialog((prev) => ({ key: prev.key + 1, open: true, address }));

  const handleCloseDialog = () => setDialog((prev) => ({ ...prev, open: false }));

  const handleSubmit = async (values: CustomerAddressFormValues) => {
    const { address } = dialog;
    setSaving(true);
    try {
      if (address) await updateAddress({ id: address.id, params: values });
      else await createAddress(values);
      toast.success(address ? "Address updated" : "Address added");
      handleCloseDialog();
    } catch {
      toast.error(address ? "Failed to update the address" : "Failed to add the address");
    } finally {
      setSaving(false);
    }
  };

  const handleCloseDelete = () => setDeleteTarget(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAddress(deleteTarget.id);
      toast.success("Address deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete the address");
    } finally {
      setDeleting(false);
    }
  };

  const columns: ColumnsType<AddressItem> = [
    {
      title: "Type",
      dataIndex: "type",
      width: 130,
      render: (v: string) => (
        <Tag color={ADDRESS_TYPE_COLORS[v] ?? "default"} className="!m-0">
          {v}
        </Tag>
      ),
    },
    { title: "Name", dataIndex: "label", render: (v: string) => (v ? <span className="font-semibold text-slate-800">{v}</span> : EMPTY_CELL) },
    { title: "Street", dataIndex: "street", render: (v: string) => v || EMPTY_CELL },
    { title: "City", dataIndex: "city", render: (v: string) => v || EMPTY_CELL },
    { title: "ZIP", dataIndex: "postalCode", render: (v: string) => v || EMPTY_CELL },
    {
      title: "Country",
      dataIndex: "country",
      render: (v: string) =>
        v ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden>{flagOf(v)}</span>
            {COUNTRY_NAME.get(v) ?? v}
          </span>
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
                { key: "delete", label: "Delete", icon: <DeleteOutlined />, danger: true, onClick: () => setDeleteTarget(r) },
              ],
            }}
          >
            <Button
              type="text"
              size="small"
              icon={<EllipsisOutlined className="!text-[20px]" />}
              aria-label={`Actions for the ${r.type} address`}
              className="!text-slate-600 hover:!text-slate-900"
            />
          </Dropdown>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <SectionCard
        title="Addresses"
        bodyClassName="p-2"
        extra={
          <>
            <CustomerCountChip count={addresses.length} />
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => handleOpenDialog(null)}>
              Add Address
            </Button>
          </>
        }
      >
        <Table<AddressItem>
          size="small"
          rowKey="id"
          loading={isLoading}
          dataSource={rows}
          columns={columns}
          scroll={{ x: "max-content" }}
          pagination={TABLE_PAGINATION}
          locale={{ emptyText: "No addresses yet" }}
        />
      </SectionCard>

      {/* A new key on every opening mounts the dialog with a fresh form. */}
      <CustomerAddressDialog
        key={dialog.key}
        open={dialog.open}
        address={dialog.address}
        defaultCountry={customer?.country ?? "CZ"}
        saving={saving}
        onCancel={handleCloseDialog}
        onSubmit={handleSubmit}
      />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={handleCloseDelete}
        onConfirm={handleDelete}
        title="Delete address"
        description={`Delete the ${deleteTarget?.type ?? ""} address${deleteTarget?.label ? ` “${deleteTarget.label}”` : ""}?`}
        confirmLabel="Delete"
        danger
        loading={deleting}
      />
    </div>
  );
}
