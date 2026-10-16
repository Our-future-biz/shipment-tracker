"use client";

import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Dropdown } from "antd";
import type { MenuProps } from "antd";
import { EllipsisOutlined, EnvironmentOutlined } from "@ant-design/icons";
import { BackLink } from "@/components/BackLink";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useCustomer } from "@/hooks/useCustomers";
import type { CustomerItem } from "@/hooks/useCustomers";
import { useToast } from "@/lib/toast";
import { CustomerAccountTypeBadge } from "../../_components/CustomerAccountTypeBadge";
import { CustomerHaulierBadge } from "../../_components/CustomerHaulierBadge";
import { statusDotClass } from "../../_lib/constants";
import { CustomerSalesOwnerSelect } from "./CustomerSalesOwnerSelect";
import { useCustomerListHref } from "../../_lib/customerListHref";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

interface CustomerHeaderProps {
  customer: CustomerItem;
}

// Top of the customer detail: who the customer is and the record-level actions.
export function CustomerHeader({ customer }: CustomerHeaderProps) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const listHref = useCustomerListHref();
  const { deleteCustomer, uploadLogo, deleteLogo } = useCustomer(customer.id);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleLogoFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Logo must be under 2 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      uploadLogo(reader.result as string)
        .then(() => toast.success("Logo updated"))
        .catch(() => toast.error("Upload failed"));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    deleteLogo().catch(() => toast.error("Failed to remove the logo"));
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteCustomer();
      toast.success("Customer deleted");
      // Replace, so Back does not return to the page of a customer that no longer exists.
      router.replace(listHref);
    } catch {
      toast.error("Failed to delete the customer");
      setDeleting(false);
    }
  };

  const actionItems: MenuProps["items"] = [
    { key: "upload-logo", label: "Upload logo", onClick: () => fileRef.current?.click() },
    ...(customer.logoData ? [{ key: "remove-logo", label: "Remove logo", onClick: handleRemoveLogo }] : []),
    { type: "divider" },
    { key: "delete", label: "Delete customer", danger: true, onClick: () => setDeleteOpen(true) },
  ];

  return (
    <>
      <BackLink href={listHref} className="mb-2">Customer Database</BackLink>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-2 bg-white border border-slate-200 rounded-xl shadow-sm px-5 py-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center overflow-hidden shrink-0">
            {customer.logoData ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={customer.logoData} alt="" className="w-full h-full object-contain" />
            ) : (
              <span className="text-lg font-semibold text-indigo-500">{customer.companyName.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-[22px] font-bold text-slate-800 m-0">{customer.companyName}</h1>
              <CustomerAccountTypeBadge label={customer.label} />
              <CustomerHaulierBadge roles={customer.roles} />
            </div>
            {/* Only where the customer is; IČO, DIČ and the rest of the registry record are in the Registry card. */}
            {customer.city && (
              <div className="flex items-center gap-1.5 text-[13px] text-slate-500 mt-1">
                <EnvironmentOutlined aria-hidden className="text-slate-400" />
                {customer.city}, {customer.country}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 shrink-0">
          <CustomerSalesOwnerSelect key={customer.id} customer={customer} />
          <span aria-hidden className="h-8 w-px bg-slate-200" />
          {/* Read-only here: the status is changed in the CRM card, and a won quote makes the customer Active. */}
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3.5 py-1.5 text-[13px] font-medium text-slate-600">
            <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${statusDotClass(customer.status)}`} />
            {customer.status}
          </span>
          <span aria-hidden className="h-8 w-px bg-slate-200" />
          <Dropdown menu={{ items: actionItems }} trigger={["click"]} placement="bottomRight">
            <button
              type="button"
              aria-label="Customer actions"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 cursor-pointer transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              <EllipsisOutlined className="text-[18px]" />
            </button>
          </Dropdown>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleLogoFile} />
      </div>

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete customer"
        description={`Delete ${customer.companyName} and all its contacts, sites, invoices, documents and notes? Its shipments and quotes are kept. This cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={deleting}
      />
    </>
  );
}
