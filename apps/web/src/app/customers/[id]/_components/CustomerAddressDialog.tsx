"use client";

import { Button, Form, Input, Modal, Select } from "antd";
import type { AddressItem } from "@/hooks/useCustomerAddresses";
import type { interfaces } from "@/lib/api/client";
import { COUNTRIES, flagOf } from "@/lib/countries";
import { ADDRESS_TYPES } from "../../_lib/constants";

export interface CustomerAddressFormValues {
  type: interfaces.AddressType;
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
}

const TYPE_OPTIONS = ADDRESS_TYPES.map((type) => ({ value: type, label: type }));

const COUNTRY_OPTIONS = COUNTRIES.map((country) => ({
  value: country.code,
  search: `${country.name} ${country.code}`,
  label: (
    <span className="flex items-center gap-2">
      <span aria-hidden>{flagOf(country.code)}</span>
      <span className="truncate">{country.name}</span>
    </span>
  ),
}));

const required = (message: string) => [{ required: true, whitespace: true, message }];

// Add / edit dialog of a customer address. Like the contact dialog, it is mounted anew (a new React key) for
// every opening, so the form starts from `address`.
export function CustomerAddressDialog({ open, address, defaultCountry, saving, onCancel, onSubmit }: CustomerAddressDialogProps) {
  const [form] = Form.useForm<CustomerAddressFormValues>();

  const initialValues: CustomerAddressFormValues = address
    ? { type: address.type, label: address.label, street: address.street, city: address.city, postalCode: address.postalCode, country: address.country }
    : { type: "Pickup", label: "", street: "", city: "", postalCode: "", country: defaultCountry };

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
          <div className="text-lg font-semibold text-slate-800">{address ? "Edit Address" : "Add Address"}</div>
          <div className="mt-1 text-[13px] font-normal text-slate-500">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <Form.Item name="type" label="Type" rules={[{ required: true, message: "Type is required" }]}>
            <Select options={TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="label" label="Name">
            <Input placeholder="e.g. Plant Kolín" onPressEnter={handleSubmit} />
          </Form.Item>
        </div>
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
