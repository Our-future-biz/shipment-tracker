"use client";

import { useState } from "react";
import { Select } from "antd";
import type { SelectProps } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useCustomerContacts } from "@/hooks/useCustomerContacts";
import { useCustomer } from "@/hooks/useCustomers";
import { fold } from "@/lib/fold";
import { useToast } from "@/lib/toast";
import { apiErrorMessage } from "@/lib/api";
import { CustomerContactDialog, type CustomerContactFormValues } from "@/app/customers/[id]/_components/CustomerContactDialog";

// A customer's person (Customer's PIC) is one of the contacts saved on that customer in the
// Customer Database, picked by name; nothing else can be entered. Without a linked customer
// there is nothing to pick. A stored value that is no contact (old free text) is shown, marked.
export interface CustomerContactPickerProps
  extends Pick<SelectProps, "size" | "variant" | "className" | "autoFocus" | "defaultOpen" | "onBlur" | "popupMatchSelectWidth" | "style"> {
  /** The shipment's customer (Customer Database id); null when none is linked. */
  customerId?: string | null;
  /** The stored contact name ("" for nobody). */
  value?: string | null;
  /** The picked contact's name, "" when cleared. */
  onChange?: (name: string) => void;
  "aria-label"?: string;
  /** Told when the Add contact dialog opens and closes (a grid cell must not close under it). */
  onAddingChange?: (adding: boolean) => void;
}

/** A typed name split for the contact form: the last word is the last name ("Alena Vybralová"). */
export function splitTypedName(typed: string): Pick<CustomerContactFormValues, "firstName" | "lastName"> {
  const words = typed.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return { firstName: words[0] ?? "", lastName: "" };
  return { firstName: words.slice(0, -1).join(" "), lastName: words[words.length - 1]! };
}

export function CustomerContactPicker({ customerId, value, onChange, "aria-label": ariaLabel, onAddingChange, ...rest }: CustomerContactPickerProps) {
  const toast = useToast();
  const { contacts, isLoading, createContact } = useCustomerContacts(customerId ?? "");
  const [search, setSearch] = useState("");
  // The Add contact dialog: open, its React key (a fresh form per opening) and the name it starts with.
  const [adding, setAdding] = useState<{ key: number; open: boolean; typed: string }>({ key: 0, open: false, typed: "" });
  const [saving, setSaving] = useState(false);
  const { customer } = useCustomer(adding.open && customerId ? customerId : null);
  const current = (value ?? "").trim();
  const known = contacts.find((c) => c.name.trim().toLowerCase() === current.toLowerCase());
  const unlinked = !!current && !isLoading && !!customerId && !known;

  // Main contact first, then the rest in the order the Customer Database returns them.
  const options = [...contacts]
    .sort((a, b) => Number(b.isMain) - Number(a.isMain))
    // An empty title: antd would otherwise give every row the browser's own tooltip of its name.
    .map((c) => ({ value: c.name, label: c.name, title: "", role: c.role, reach: c.email || c.phone }));

  const openAdd = () => {
    setAdding((prev) => ({ key: prev.key + 1, open: true, typed: search }));
    onAddingChange?.(true);
  };

  const closeAdd = () => {
    setAdding((prev) => ({ ...prev, open: false }));
    onAddingChange?.(false);
  };

  // The new contact is saved on the customer in the Customer Database, then picked here.
  const handleAdd = async (values: CustomerContactFormValues) => {
    if (!customerId) return;
    setSaving(true);
    try {
      const { contact } = await createContact(values);
      toast.success(`${contact.name} added to the customer's contacts`);
      setAdding((prev) => ({ ...prev, open: false }));
      setSearch("");
      onChange?.(contact.name);
      onAddingChange?.(false);
    } catch (err) {
      toast.error(`Failed to add the contact: ${apiErrorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const typed = search.trim();
  // Offered unless what was typed already is one of the contacts.
  const canAdd = !!customerId && !contacts.some((c) => c.name.trim().toLowerCase() === typed.toLowerCase());

  return (
    <>
    <Select
      {...rest}
      aria-label={ariaLabel}
      showSearch
      allowClear
      loading={isLoading}
      // The field keeps its own colours inside a grid row coloured by a rule (e.g. red for overdue).
      className={`${rest.className ?? ""} [&_.ant-select-selection-search-input]:!text-slate-800 [&_.ant-select-selection-item]:!text-slate-800`}
      disabled={!customerId && !current}
      placeholder={customerId ? "Pick a contact" : "Link the customer first"}
      value={known ? known.name : current || undefined}
      status={unlinked ? "warning" : undefined}
      title={unlinked ? `"${current}" is not a contact of this customer — pick one from the list` : undefined}
      options={options}
      filterOption={(input, option) => fold(`${option?.label ?? ""} ${option?.reach ?? ""}`).includes(fold(input.trim()))}
      optionRender={(option) => (
        <span className="flex flex-col leading-tight py-0.5 min-w-0">
          <span className="text-[13px] font-medium text-slate-800 truncate">{option.data.label}</span>
          {/* The position only; the e-mail still finds the contact when typed. */}
          {option.data.role && <span className="text-[11px] text-slate-500 truncate">{option.data.role}</span>}
        </span>
      )}
      notFoundContent={
        !customerId
          ? "Link the shipment to a customer first"
          : isLoading
            ? "Loading contacts…"
            : "No contact matches"
      }
      searchValue={search}
      onSearch={setSearch}
      popupRender={(menu) => (
        <>
          {menu}
          {canAdd && (
            <>
              <div className="-mx-1 my-1 h-px bg-slate-100" />
              <button
                type="button"
                // Keeps the focus in the field, so the click is not taken for leaving it.
                onMouseDown={(e) => e.preventDefault()}
                onClick={openAdd}
                className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[13px] text-indigo-600 hover:bg-indigo-50 cursor-pointer"
              >
                <PlusOutlined className="text-[11px] shrink-0" />
                {typed ? (
                  <span className="min-w-0 truncate">
                    Add <span className="font-medium">{typed}</span> as a new contact
                  </span>
                ) : (
                  <span>Add a new contact</span>
                )}
              </button>
            </>
          )}
        </>
      )}
      onChange={(name?: string) => {
        setSearch("");
        onChange?.(name ?? "");
      }}
    />
    {customerId && (
      <CustomerContactDialog
        key={adding.key}
        open={adding.open}
        contact={null}
        saving={saving}
        country={customer?.country}
        initial={splitTypedName(adding.typed)}
        onCancel={closeAdd}
        onSubmit={handleAdd}
      />
    )}
    </>
  );
}
