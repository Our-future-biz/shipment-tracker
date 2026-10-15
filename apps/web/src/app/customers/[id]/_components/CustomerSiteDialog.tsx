"use client";

import { Checkbox, Form, Input, InputNumber, Modal, Select } from "antd";
import type { FormInstance } from "antd";
import type { CustomerSiteItem } from "@/hooks/useCustomerSites";
import type { interfaces } from "@/lib/api/client";
import { CUSTOMER_SITE_KIND_LABELS, CUSTOMER_SITE_KINDS } from "../../_lib/constants";
import { formatPostcode } from "../../_lib/customerSites";

export interface CustomerSiteFormValues {
  label: string;
  kind: interfaces.CustomerSiteKind;
  street: string;
  postcode: string;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
  openingHours: string;
  avizaceName: string;
  avizacePhone: string;
  avizaceEmail: string;
  loadingNotes: string;
  tailLiftNeeded: boolean;
  isDefault: boolean;
}

interface CustomerSiteDialogProps {
  open: boolean;
  // The site being edited; null when a new one is added.
  site: CustomerSiteItem | null;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: CustomerSiteFormValues) => void;
}

const NEW_SITE: CustomerSiteFormValues = {
  label: "",
  kind: "both",
  street: "",
  postcode: "",
  city: "",
  country: "CZ",
  lat: null,
  lng: null,
  openingHours: "",
  avizaceName: "",
  avizacePhone: "",
  avizaceEmail: "",
  loadingNotes: "",
  tailLiftNeeded: false,
  isDefault: false,
};

const KIND_OPTIONS = CUSTOMER_SITE_KINDS.map((kind) => ({ value: kind, label: CUSTOMER_SITE_KIND_LABELS[kind] }));

const trimValue = (value?: string) => value?.trim() ?? "";
const upperValue = (value?: string) => value?.trim().toUpperCase() ?? "";

// The same rule as the API's: a Czech postcode is 5 digits (spaces anywhere are fine), any other
// country's is free text that must not be empty.
const postcodeRule = (form: FormInstance<CustomerSiteFormValues>) => ({
  validator: (_: unknown, value?: string) => {
    const postcode = value ?? "";
    if (form.getFieldValue("country") === "CZ") {
      return /^\d{5}$/.test(postcode.replace(/\s+/g, ""))
        ? Promise.resolve()
        : Promise.reject(new Error("A Czech postcode has 5 digits, e.g. 110 00"));
    }
    return postcode.trim() ? Promise.resolve() : Promise.reject(new Error("Postcode is required"));
  },
});

// Add / edit dialog of a customer site. The form takes `site` only when its instance is created, so the owner must
// mount the dialog anew (a new React key) for every opening.
export function CustomerSiteDialog({ open, site, saving, onCancel, onSubmit }: CustomerSiteDialogProps) {
  const [form] = Form.useForm<CustomerSiteFormValues>();

  const initialValues: CustomerSiteFormValues = site
    ? {
        label: site.label,
        kind: site.kind,
        street: site.street,
        postcode: formatPostcode(site.country, site.postcode),
        city: site.city,
        country: site.country,
        lat: site.lat,
        lng: site.lng,
        openingHours: site.openingHours,
        avizaceName: site.avizaceName,
        avizacePhone: site.avizacePhone,
        avizaceEmail: site.avizaceEmail,
        loadingNotes: site.loadingNotes,
        tailLiftNeeded: site.tailLiftNeeded,
        isDefault: site.isDefault,
      }
    : NEW_SITE;

  const handleSubmit = () => form.submit();

  const handleFinish = (values: CustomerSiteFormValues) => {
    // Enter can be pressed again while the first save is still running.
    if (saving) return;
    onSubmit({
      ...values,
      label: values.label.trim(),
      street: values.street.trim(),
      postcode: values.postcode.trim(),
      city: values.city.trim(),
      openingHours: values.openingHours.trim(),
      avizaceName: values.avizaceName.trim(),
      avizacePhone: values.avizacePhone.trim(),
      loadingNotes: values.loadingNotes.trim(),
      lat: values.lat ?? null,
      lng: values.lng ?? null,
    });
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      onOk={handleSubmit}
      confirmLoading={saving}
      title={site ? "Edit Site" : "Add Site"}
      okText={site ? "Save" : "Add"}
      width={640}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" className="pt-2" preserve={false} initialValues={initialValues} onFinish={handleFinish}>
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_200px] gap-x-4">
          <Form.Item name="label" label="Name" rules={[{ required: true, whitespace: true, message: "Name is required" }]}>
            <Input placeholder="e.g. Main warehouse" onPressEnter={handleSubmit} />
          </Form.Item>
          <Form.Item name="kind" label="Used for">
            <Select options={KIND_OPTIONS} />
          </Form.Item>
        </div>

        <Form.Item name="street" label="Street">
          <Input placeholder="Street and number" onPressEnter={handleSubmit} />
        </Form.Item>
        <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)_100px] gap-x-4">
          <Form.Item name="postcode" label="Postcode" dependencies={["country"]} rules={[postcodeRule(form)]}>
            <Input placeholder="110 00" onPressEnter={handleSubmit} />
          </Form.Item>
          <Form.Item name="city" label="City">
            <Input onPressEnter={handleSubmit} />
          </Form.Item>
          <Form.Item
            name="country"
            label="Country"
            normalize={upperValue}
            rules={[{ required: true, pattern: /^[A-Z]{2}$/, message: "2-letter code, e.g. CZ" }]}
          >
            <Input maxLength={2} onPressEnter={handleSubmit} />
          </Form.Item>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <Form.Item name="lat" label="Latitude">
            <InputNumber className="!w-full" min={-90} max={90} step={0.000001} placeholder="optional" />
          </Form.Item>
          <Form.Item name="lng" label="Longitude">
            <InputNumber className="!w-full" min={-180} max={180} step={0.000001} placeholder="optional" />
          </Form.Item>
        </div>

        <Form.Item name="openingHours" label="Opening hours">
          <Input placeholder="e.g. Mon–Fri 7:00–15:00" onPressEnter={handleSubmit} />
        </Form.Item>

        <div className="text-xs font-semibold text-slate-500 mb-2">Avizace (call before arrival)</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4">
          <Form.Item name="avizaceName" label="Name">
            <Input onPressEnter={handleSubmit} />
          </Form.Item>
          <Form.Item name="avizacePhone" label="Phone">
            <Input onPressEnter={handleSubmit} />
          </Form.Item>
          <Form.Item
            name="avizaceEmail"
            label="Email"
            normalize={trimValue}
            rules={[{ type: "email", message: "Enter a valid email address" }]}
          >
            <Input onPressEnter={handleSubmit} />
          </Form.Item>
        </div>

        <Form.Item name="loadingNotes" label="Loading notes">
          <Input.TextArea rows={2} placeholder="Ramp, access, documents, …" />
        </Form.Item>

        <div className="flex flex-wrap gap-x-6">
          <Form.Item name="tailLiftNeeded" valuePropName="checked" className="!mb-2">
            <Checkbox>Tail lift needed</Checkbox>
          </Form.Item>
          <Form.Item name="isDefault" valuePropName="checked" className="!mb-2">
            <Checkbox>Default site</Checkbox>
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
