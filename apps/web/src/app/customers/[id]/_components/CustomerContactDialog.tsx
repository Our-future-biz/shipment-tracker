"use client";

import { Checkbox, Form, Input, Modal, Select } from "antd";
import type { ContactItem } from "@/hooks/useCustomerContacts";
import { CONTACT_ROLES } from "../../_lib/constants";

export interface CustomerContactFormValues {
  name: string;
  email: string;
  phone: string;
  role: string;
  isMain: boolean;
}

interface CustomerContactDialogProps {
  open: boolean;
  // The contact being edited; null when a new one is added.
  contact: ContactItem | null;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: CustomerContactFormValues) => void;
}

const NEW_CONTACT: CustomerContactFormValues = { name: "", email: "", phone: "", role: "Operations", isMain: false };

const ROLE_OPTIONS = CONTACT_ROLES.map((role) => ({ value: role, label: role }));

// A space around a pasted address would fail the email rule without being visible.
const trimValue = (value?: string) => value?.trim() ?? "";

// Add / edit dialog of a customer contact. The form takes `contact` only when its instance is created, so the owner
// must mount the dialog anew (a new React key) for every opening.
export function CustomerContactDialog({ open, contact, saving, onCancel, onSubmit }: CustomerContactDialogProps) {
  const [form] = Form.useForm<CustomerContactFormValues>();

  // `normalize` runs only on typed input, so the stored texts are trimmed here: contacts saved before the dialog trimmed
  // can carry a space around the email, which would block every save of an otherwise untouched contact.
  const initialValues: CustomerContactFormValues = contact
    ? {
        name: trimValue(contact.name),
        email: trimValue(contact.email),
        phone: trimValue(contact.phone),
        role: contact.role,
        isMain: contact.isMain,
      }
    : NEW_CONTACT;

  const handleSubmit = () => form.submit();

  const handleFinish = (values: CustomerContactFormValues) => {
    // Enter can be pressed again while the first save is still running.
    if (saving) return;
    onSubmit({ ...values, name: values.name.trim(), email: values.email.trim(), phone: values.phone.trim() });
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      onOk={handleSubmit}
      confirmLoading={saving}
      title={contact ? "Edit Contact" : "Add Contact"}
      okText={contact ? "Save" : "Add"}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" className="pt-2" preserve={false} initialValues={initialValues} onFinish={handleFinish}>
        <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: "Name is required" }]}>
          <Input onPressEnter={handleSubmit} />
        </Form.Item>
        <Form.Item name="email" label="Email" normalize={trimValue} rules={[{ type: "email", message: "Enter a valid email address" }]}>
          <Input onPressEnter={handleSubmit} />
        </Form.Item>
        <Form.Item name="phone" label="Phone">
          <Input onPressEnter={handleSubmit} />
        </Form.Item>
        <Form.Item name="role" label="Role">
          <Select options={ROLE_OPTIONS} />
        </Form.Item>
        <Form.Item
          name="isMain"
          valuePropName="checked"
          extra="Quotes are prefilled with the main contact and shipments offer it first. Marking this contact replaces the current one."
        >
          <Checkbox>Main contact</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
}
