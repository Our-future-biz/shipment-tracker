"use client";

import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dropdown } from "antd";
import type { MenuProps } from "antd";
import { ArrowLeftOutlined, DownOutlined } from "@ant-design/icons";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useCustomer } from "@/hooks/useCustomers";
import type { CustomerItem } from "@/hooks/useCustomers";
import { useToast } from "@/lib/toast";
import { CustomerAccountTypeBadge } from "../../_components/CustomerAccountTypeBadge";
import { CustomerStatusDot } from "../../_components/CustomerStatusDot";
import { isRegistryActive } from "../../_lib/companyAnalysis";
import { useCustomerListHref } from "../../_lib/customerListHref";
import { fmtMoney, marginPct } from "../../_lib/customerMoney";
import { CustomerKpiTile, profitTone } from "./CustomerKpiTile";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

// Top of the customer detail: who the customer is, the four totals (the only place they
// are shown) and the record-level actions.
export function CustomerHeader({ customer }: { customer: CustomerItem }) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const listHref = useCustomerListHref();
  const { deleteCustomer, fetchLogo, isFetchingLogo, uploadLogo, deleteLogo } = useCustomer(customer.id);
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

  const handleFetchLogo = () => {
    fetchLogo()
      .then(() => toast.success("Logo fetched"))
      .catch(() => toast.error("No logo found — set a website first"));
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
    { key: "fetch-logo", label: isFetchingLogo ? "Fetching logo…" : "Fetch logo from website", disabled: isFetchingLogo, onClick: handleFetchLogo },
    { key: "upload-logo", label: "Upload logo", onClick: () => fileRef.current?.click() },
    ...(customer.logoData ? [{ key: "remove-logo", label: "Remove logo", onClick: handleRemoveLogo }] : []),
    { type: "divider" },
    { key: "delete", label: "Delete customer", danger: true, onClick: () => setDeleteOpen(true) },
  ];

  const registryActive = isRegistryActive(customer.companyStatus);
  // Identity only; the full registry record is the Registry card on the Overview tab.
  const meta = [
    `IČO ${customer.ico}`,
    customer.city && `${customer.city}, ${customer.country}`,
    customer.salesOwner && `Owner: ${customer.salesOwner}`,
  ].filter(Boolean);

  return (
    <>
      <Link href={listHref} className="inline-flex items-center gap-1.5 text-[13px] text-indigo-500 hover:text-indigo-600 mb-2">
        <ArrowLeftOutlined className="text-[11px]" />
        Customer Database
      </Link>

      <div className="flex items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
            {customer.logoData ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={customer.logoData} alt="" className="w-full h-full object-contain" />
            ) : (
              <span className="text-sm font-semibold text-slate-400">{customer.companyName.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-[22px] font-bold text-slate-800 m-0">{customer.companyName}</h1>
              <CustomerAccountTypeBadge label={customer.label} />
              <CustomerStatusDot status={customer.status} />
              {customer.companyStatus && (
                <span
                  className={`rounded-xl text-[11px] font-medium px-2.5 py-0.5 leading-[18px] ${
                    registryActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}
                >
                  Registry: {registryActive ? "Active" : customer.companyStatus}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{meta.join(" · ")}</div>
          </div>
        </div>

        <Dropdown menu={{ items: actionItems }} trigger={["click"]}>
          <button
            type="button"
            className="flex items-center gap-1.5 shrink-0 px-3 py-1.5 text-xs border border-slate-200 rounded bg-white hover:bg-slate-50 cursor-pointer text-slate-600"
          >
            Actions <DownOutlined className="text-[10px]" />
          </button>
        </Dropdown>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleLogoFile} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
        <CustomerKpiTile label="Revenue" value={fmtMoney(customer.totalRevenue, customer.currency)} />
        <CustomerKpiTile
          label="Profit"
          value={fmtMoney(customer.totalProfit, customer.currency)}
          tone={profitTone(customer.totalProfit)}
        />
        <CustomerKpiTile label="Margin" value={`${marginPct(customer.totalRevenue, customer.totalProfit)}%`} />
        <CustomerKpiTile label="Shipments" value={customer.totalShipments} />
      </div>

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete customer"
        description={`Delete ${customer.companyName} and all its contacts, invoices, documents and notes? Its shipments and quotes are kept. This cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={deleting}
      />
    </>
  );
}
