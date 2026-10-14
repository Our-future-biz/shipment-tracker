"use client";

import { useState } from "react";
import { Button, Dropdown, Tag } from "antd";
import { DeleteOutlined, EditOutlined, EllipsisOutlined, PlusOutlined } from "@ant-design/icons";
import { ConfirmModal } from "@/components/ConfirmModal";
import { SectionCard } from "@/components/SectionCard";
import { useCustomerAddresses } from "@/hooks/useCustomerAddresses";
import type { AddressItem } from "@/hooks/useCustomerAddresses";
import { COUNTRIES } from "@/lib/countries";
import { useToast } from "@/lib/toast";
import { ADDRESS_TYPE_COLORS, ADDRESS_TYPES } from "../../_lib/constants";
import { CustomerAddressDialog } from "./CustomerAddressDialog";
import type { CustomerAddressFormValues } from "./CustomerAddressDialog";

const COUNTRY_NAME = new Map(COUNTRIES.map((country) => [country.code, country.name]));

// The seat first, then the others in the order of the type list, each type in the order added.
const typeOrder = (address: AddressItem) => ADDRESS_TYPES.indexOf(address.type);

interface AddressDialogState {
  // Counts the openings; used as the dialog's React key, so the form starts afresh each time.
  key: number;
  open: boolean;
  address: AddressItem | null;
}

interface CustomerAddressesCardProps {
  customerId: string;
  // A new address starts in the customer's country.
  country: string;
}

// Where the customer is: its seat, where invoices go, where goods are picked up and delivered.
export function CustomerAddressesCard({ customerId, country }: CustomerAddressesCardProps) {
  const toast = useToast();
  const { addresses, isLoading, createAddress, updateAddress, deleteAddress } = useCustomerAddresses(customerId);
  const [dialog, setDialog] = useState<AddressDialogState>({ key: 0, open: false, address: null });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AddressItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const rows = [...addresses].sort((a, b) => typeOrder(a) - typeOrder(b));

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

  return (
    <SectionCard
      title="Addresses"
      extra={
        <Button type="link" size="small" icon={<PlusOutlined />} className="!px-0 !text-xs !font-semibold" onClick={() => handleOpenDialog(null)}>
          Add
        </Button>
      }
    >
      {rows.length === 0 ? (
        <p className="m-0 text-[13px] text-slate-400">{isLoading ? "Loading…" : "No addresses yet."}</p>
      ) : (
        <ul className="m-0 p-0 list-none divide-y divide-slate-100 -my-1">
          {rows.map((address) => (
            <li key={address.id} className="flex items-start gap-2 py-2.5 text-[13px]">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
                  <Tag color={ADDRESS_TYPE_COLORS[address.type] ?? "default"} className="!m-0">
                    {address.type}
                  </Tag>
                  {address.label && <span className="font-semibold text-slate-800 [overflow-wrap:anywhere]">{address.label}</span>}
                </div>
                <div className="text-slate-700 [overflow-wrap:anywhere]">{address.street}</div>
                <div className="text-slate-500 [overflow-wrap:anywhere]">
                  {[address.postalCode, address.city].filter(Boolean).join(" ")}
                  {address.country && `, ${COUNTRY_NAME.get(address.country) ?? address.country}`}
                </div>
              </div>
              <Dropdown
                trigger={["click"]}
                placement="bottomRight"
                menu={{
                  items: [
                    { key: "edit", label: "Edit", icon: <EditOutlined />, onClick: () => handleOpenDialog(address) },
                    { key: "delete", label: "Delete", icon: <DeleteOutlined />, danger: true, onClick: () => setDeleteTarget(address) },
                  ],
                }}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<EllipsisOutlined className="!text-[18px]" />}
                  aria-label={`Actions for the ${address.type} address`}
                  className="!text-slate-600 hover:!text-slate-900 shrink-0"
                />
              </Dropdown>
            </li>
          ))}
        </ul>
      )}

      <CustomerAddressDialog
        key={dialog.key}
        open={dialog.open}
        address={dialog.address}
        defaultCountry={country}
        saving={saving}
        onCancel={handleCloseDialog}
        onSubmit={handleSubmit}
      />
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete address"
        description={`Delete the ${deleteTarget?.type ?? ""} address${deleteTarget?.label ? ` “${deleteTarget.label}”` : ""}?`}
        confirmLabel="Delete"
        danger
        loading={deleting}
      />
    </SectionCard>
  );
}
