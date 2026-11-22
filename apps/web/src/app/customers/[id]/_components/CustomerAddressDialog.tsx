"use client";

import { useState } from "react";
import { Button, Form, Input, Modal, Radio, Select } from "antd";
import type { AddressItem } from "@/hooks/useCustomerAddresses";
import type { interfaces } from "@/lib/api/client";
import { COUNTRY_OPTIONS } from "@/components/countryOptions";
import { COUNTRIES } from "@/lib/countries";
import { ADDRESS_TYPES } from "../../_lib/constants";
import { HINT, MODAL_TITLE } from "@/styles/ui";

export interface CustomerAddressFormValues {
  types: interfaces.AddressType[];
  label: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

interface CustomerAddressDialogProps {
  open: boolean;
  // The address being edited; null when a new one is added.
  address: AddressItem | null;
  // A new address starts in the customer's country.
  defaultCountry: string;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: CustomerAddressFormValues) => void;
  // A customer has one Registered address; with one on file, the type is not offered for another address.
  // The same goes for its one Billing address, which its invoices are addressed to. The other types
  // can be combined freely: one address is often all of them.
  hasRegistered: boolean;
  hasBilling: boolean;
  // The customer's Registered address, when it has one: a new address may be it, the chosen types then added to
  // it (owner's answer 22 Nov: a company whose seat is also its warehouse, its pickup place...).
  registered?: AddressItem;
  onAddToRegistered?: (types: interfaces.AddressType[]) => void;
}

/** The types an address gets when chosen ones are added to it: its own first, each once, in the list's order. */
export function withAddedTypes(own: readonly interfaces.AddressType[], added: readonly interfaces.AddressType[]): interfaces.AddressType[] {
  return ADDRESS_TYPES.filter((t) => own.includes(t) || added.includes(t));
}

const COUNTRY_NAME = new Map(COUNTRIES.map((c) => [c.code, c.name]));
const countryName = (code: string) => COUNTRY_NAME.get(code) ?? code;

// The Registered address in one line, as the dialog shows it to be picked.
const oneLine = (a: AddressItem) => [a.label, a.street, [a.postalCode, a.city].filter(Boolean).join(" "), countryName(a.country)].filter(Boolean).join(", ");

const required = (message: string) => [{ required: true, whitespace: true, message }];

// Add / edit dialog of a customer address. Like the contact dialog, it is mounted anew (a new React key) for
// every opening, so the form starts from `address`.
export function CustomerAddressDialog({
  open,
  address,
  defaultCountry,
  saving,
  onCancel,
  onSubmit,
  hasRegistered,
  hasBilling,
  registered,
  onAddToRegistered,
}: CustomerAddressDialogProps) {
  const [form] = Form.useForm<CustomerAddressFormValues>();
  // Adding: a new address, or the Registered address taking more types. Editing is always the address itself.
  const [where, setWhere] = useState<"new" | "registered">("new");
  const toRegistered = !address && where === "registered" && !!registered;
  const registeredTaken = hasRegistered && !address?.types.includes("Registered");
  const billingTaken = hasBilling && !address?.types.includes("Billing");
  // Of the Registered address: the types it has already, named as such (picking one again changes nothing).
  const onRegistered = (type: interfaces.AddressType) => toRegistered && !!registered?.types.includes(type);
  const typeOptions = ADDRESS_TYPES.map((type) => ({
    value: type,
    label: onRegistered(type)
      ? `${type} (it is already)`
      : type === "Registered" && registeredTaken
        ? "Registered (already on file)"
        : type === "Billing" && billingTaken
          ? "Billing (on another address - use “Use for invoices”)"
          : type,
    disabled: (type === "Registered" && registeredTaken) || (type === "Billing" && billingTaken),
  }));

  // Added to the Registered address, at least one of the types picked must be new to it.
  const addsToRegistered = {
    validator: (_: unknown, types: interfaces.AddressType[] = []) =>
      !toRegistered || types.some((t) => !registered?.types.includes(t))
        ? Promise.resolve()
        : Promise.reject(new Error("The Registered address is all of these already: choose another type")),
  };

  const initialValues: CustomerAddressFormValues = address
    ? { types: address.types, label: address.label, street: address.street, city: address.city, postalCode: address.postalCode, country: address.country }
    : { types: ["Pickup"], label: "", street: "", city: "", postalCode: "", country: defaultCountry };

  const handleSubmit = () => form.submit();

  const handleFinish = (values: CustomerAddressFormValues) => {
    // Enter can be pressed again while the first save is still running.
    if (saving) return;
    if (toRegistered) return onAddToRegistered?.(values.types);
    onSubmit({
      ...values,
      label: (values.label ?? "").trim(),
      street: values.street.trim(),
      city: values.city.trim(),
      postalCode: values.postalCode.trim(),
    });
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      width={560}
      destroyOnHidden
      title={
        <div>
          <div className={MODAL_TITLE}>{address ? "Edit Address" : "Add Address"}</div>
          <div className={`${HINT} font-normal mt-0.5`}>
            {address ? "Update this address." : "Add an address where this company is billed or goods are picked up or delivered."}
          </div>
        </div>
      }
      footer={
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="primary" loading={saving} onClick={handleSubmit}>
            {address ? "Save changes" : toRegistered ? "Add to Registered address" : "Add address"}
          </Button>
        </div>
      }
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={(label, { required: isRequired }) => (
          <>
            {label}
            {isRequired && <span className="ml-1 text-red-500">*</span>}
          </>
        )}
        className="pt-3"
        preserve={false}
        initialValues={initialValues}
        onFinish={handleFinish}
      >
        {!address && registered && (
          <Form.Item label="Address" className="!mb-4">
            <Radio.Group value={where} onChange={(e) => setWhere(e.target.value)} className="flex flex-col gap-1.5">
              <Radio value="new">A new address</Radio>
              <Radio value="registered">
                The Registered address <span className={HINT}>({oneLine(registered)})</span>
              </Radio>
            </Radio.Group>
          </Form.Item>
        )}
        <Form.Item
          name="types"
          label="Types"
          extra="One address can be several types, e.g. Registered, Billing, Pickup and Delivery. Billing is where invoices are addressed, instead of the Registered address; a customer has one. A Pickup or Delivery address is also a site (Sites tab), where its opening hours, delivery notice contact and tail lift are kept."
          rules={[{ required: true, type: "array", min: 1, message: "Choose at least one type" }, addsToRegistered]}
        >
          <Select mode="multiple" aria-label="Types" placeholder="Choose the types" options={typeOptions} />
        </Form.Item>
        {toRegistered ? (
          <p className={`mt-0 mb-2 ${HINT}`}>
            The types chosen are added to the Registered address, which keeps its own: one address, no second copy of it.
          </p>
        ) : (
          <>
            <Form.Item name="label" label="Name">
              <Input placeholder="e.g. Plant Kolín" onPressEnter={handleSubmit} />
            </Form.Item>
            <Form.Item name="street" label="Street address" rules={required("Street address is required")}>
              <Input onPressEnter={handleSubmit} />
            </Form.Item>
            <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-x-4">
              <Form.Item name="city" label="City" rules={required("City is required")}>
                <Input onPressEnter={handleSubmit} />
              </Form.Item>
              <Form.Item name="postalCode" label="ZIP / Postal code" rules={required("ZIP / Postal code is required")}>
                <Input onPressEnter={handleSubmit} />
              </Form.Item>
            </div>
            <Form.Item name="country" label="Country" rules={[{ required: true, message: "Country is required" }]}>
              <Select showSearch optionFilterProp="search" options={COUNTRY_OPTIONS} />
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  );
}
