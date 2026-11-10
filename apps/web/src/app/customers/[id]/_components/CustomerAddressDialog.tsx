"use client";

import { Button, Form, Input, Modal, Select } from "antd";
import type { AddressItem } from "@/hooks/useCustomerAddresses";
import type { interfaces } from "@/lib/api/client";
import { COUNTRY_OPTIONS } from "@/components/countryOptions";
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
}

const required = (message: string) => [{ required: true, whitespace: true, message }];

// Add / edit dialog of a customer address. Like the contact dialog, it is mounted anew (a new React key) for
// every opening, so the form starts from `address`.
export function CustomerAddressDialog({ open, address, defaultCountry, saving, onCancel, onSubmit, hasRegistered, hasBilling }: CustomerAddressDialogProps) {
  const [form] = Form.useForm<CustomerAddressFormValues>();
  const registeredTaken = hasRegistered && !address?.types.includes("Registered");
  const billingTaken = hasBilling && !address?.types.includes("Billing");
  const typeOptions = ADDRESS_TYPES.map((type) => ({
    value: type,
    label:
      type === "Registered" && registeredTaken
        ? "Registered (already on file)"
        : type === "Billing" && billingTaken
          ? "Billing (on another address - use “Use for invoices”)"
          : type,
    disabled: (type === "Registered" && registeredTaken) || (type === "Billing" && billingTaken),
  }));

  const initialValues: CustomerAddressFormValues = address
    ? { types: address.types, label: address.label, street: address.street, city: address.city, postalCode: address.postalCode, country: address.country }
    : { types: ["Pickup"], label: "", street: "", city: "", postalCode: "", country: defaultCountry };

  const handleSubmit = () => form.submit();

  const handleFinish = (values: CustomerAddressFormValues) => {
    // Enter can be pressed again while the first save is still running.
    if (saving) return;
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
            {address ? "Save changes" : "Add address"}
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
        <Form.Item
          name="types"
          label="Types"
          extra="One address can be several types, e.g. Registered, Billing, Pickup and Delivery. Billing is where invoices are addressed, instead of the Registered address; a customer has one. A Pickup or Delivery address is also a site (Sites tab), where its opening hours, avizace and tail lift are kept."
          rules={[{ required: true, type: "array", min: 1, message: "Choose at least one type" }]}
        >
          <Select mode="multiple" aria-label="Types" placeholder="Choose the types" options={typeOptions} />
        </Form.Item>
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
      </Form>
    </Modal>
  );
}
