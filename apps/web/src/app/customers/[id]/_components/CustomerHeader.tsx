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
import { CustomerRoleBadges } from "../../_components/CustomerRoleBadges";
import { hasSupplierRole } from "../../_lib/customerListViews";
import { isSupplierOnly } from "../../_lib/supplierStatus";
import { SupplierRatingBox } from "./SupplierRatingBox";
import { statusDotClass } from "../../_lib/constants";
import { shownStatus } from "../../_lib/supplierStatus";
import { CustomerSalesOwnerSelect } from "./CustomerSalesOwnerSelect";
import { useCustomerListHref } from "../../_lib/customerListHref";
import { canDeleteCustomerRecords } from "../../_lib/customerPermissions";
import { useAuth } from "@/lib/auth/AuthContext";
import { apiFileUrl } from "@/lib/api";
import { Pill } from "@/components/Pill";
import { CARD, ICON_BTN, PAGE_TITLE } from "@/styles/ui";

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
  // A supplier only is called a supplier on its own page (Council Review 5, m20).
  const noun = isSupplierOnly(customer.roles) ? "supplier" : "customer";
  const { user } = useAuth();
  const canDelete = canDeleteCustomerRecords(user);
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
      toast.success(noun === "supplier" ? "Supplier deleted" : "Customer deleted");
      // Replace, so Back does not return to the page of a customer that no longer exists.
      router.replace(listHref);
    } catch {
      toast.error(`Failed to delete the ${noun}`);
      setDeleting(false);
    }
  };

  const actionItems: MenuProps["items"] = [
    { key: "upload-logo", label: "Upload logo", onClick: () => fileRef.current?.click() },
    ...(customer.logoUrl ? [{ key: "remove-logo", label: "Remove logo", onClick: handleRemoveLogo }] : []),
    // Superadmins only (the API refuses everyone else).
    ...(canDelete
      ? [{ type: "divider" as const }, { key: "delete", label: `Delete ${noun}`, danger: true, onClick: () => setDeleteOpen(true) }]
      : []),
  ];

  return (
    <>
      <BackLink href={listHref} className="mb-2">Customer Database</BackLink>

      <div className={`flex flex-wrap items-center justify-between gap-4 mb-2 ${CARD} px-5 py-4`}>
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center overflow-hidden shrink-0">
            {customer.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={apiFileUrl(customer.logoUrl)} alt="" className="w-full h-full object-contain" />
            ) : (
              <span className="text-[16px] font-semibold text-indigo-600">{customer.companyName.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className={PAGE_TITLE}>{customer.companyName}</h1>
              {/* A customer's account type; a supplier only shows what it supplies instead. */}
              {!isSupplierOnly(customer.roles) && <CustomerAccountTypeBadge label={customer.label} />}
              <CustomerRoleBadges roles={customer.roles} />
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

        {/* Wraps on a narrow screen (a company that is both shows owner, status and rating side by side). */}
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-4">
          {/* Customer side: who owns it. Supplier side: its rating. A company that is both shows the two. */}
          {!isSupplierOnly(customer.roles) && (
            <>
              <CustomerSalesOwnerSelect key={customer.id} customer={customer} />
              <span aria-hidden className="h-8 w-px bg-slate-200" />
            </>
          )}
          {hasSupplierRole(customer.roles) && isSupplierOnly(customer.roles) && (
            <>
              <SupplierRatingBox key={customer.id} customer={customer} />
              <span aria-hidden className="h-8 w-px bg-slate-200" />
            </>
          )}
          {/* Read-only here: the status is changed in the CRM card, and a won quote makes the customer Active. A supplier only reads In use / Not in use. */}
          <Pill tone="slate">
            <span aria-hidden className={`h-2 w-2 rounded-full ${statusDotClass(shownStatus(customer))}`} />
            {shownStatus(customer)}
          </Pill>
          {hasSupplierRole(customer.roles) && !isSupplierOnly(customer.roles) && (
            <>
              <span aria-hidden className="h-8 w-px bg-slate-200" />
              <SupplierRatingBox key={customer.id} customer={customer} />
            </>
          )}
          <span aria-hidden className="h-8 w-px bg-slate-200" />
          <Dropdown menu={{ items: actionItems }} trigger={["click"]} placement="bottomRight">
            <button
              type="button"
              aria-label={noun === "supplier" ? "Supplier actions" : "Customer actions"}
              className={ICON_BTN}
            >
              <EllipsisOutlined className="text-[16px]" />
            </button>
          </Dropdown>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleLogoFile} />
      </div>

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title={`Delete ${noun}`}
        description={`Delete ${customer.companyName}? It is hidden from everyone together with its contacts, addresses, sites, invoices, documents and notes. Its shipments and quotes are kept, and the record stays in the database: restore it under Customer Database → Deleted.`}
        confirmLabel="Delete"
        danger
        loading={deleting}
      />
    </>
  );
}
