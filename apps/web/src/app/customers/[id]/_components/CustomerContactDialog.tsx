"use client";

import { Button, Form, Input, Modal, Select, Switch } from "antd";
import type { ContactItem } from "@/hooks/useCustomerContacts";
import type { interfaces } from "@/lib/api/client";
import { CONTACT_ROLES } from "../../_lib/constants";
import { ContactPhoneInput, isPossiblePhone } from "./ContactPhoneInput";

export interface CustomerContactFormValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: interfaces.ContactRole;
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

const NEW_CONTACT: CustomerContactFormValues = { firstName: "", lastName: "", email: "", phone: "", role: "Logistics Manager", isMain: false };

const ROLE_OPTIONS = CONTACT_ROLES.map((role) => ({ value: role, label: role }));

// A space around a pasted address would fail the email rule without being visible.
const trimValue = (value?: string) => value?.trim() ?? "";

const requiredName = (message: string) => [{ required: true, whitespace: true, message }];

// Add / edit dialog of a customer contact. The form takes `contact` only when its instance is created, so the owner
// must mount the dialog anew (a new React key) for every opening.
export function CustomerContactDialog({ open, contact, saving, onCancel, onSubmit }: CustomerContactDialogProps) {
  const [form] = Form.useForm<CustomerContactFormValues>();

  // `normalize` runs only on typed input, so the stored texts are trimmed here: contacts saved before the dialog trimmed
  // can carry a space around the email, which would block every save of an otherwise untouched contact.
  const initialValues: CustomerContactFormValues = contact
    ? {
        firstName: trimValue(contact.firstName),
        lastName: trimValue(contact.lastName),
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
    onSubmit({ ...values, firstName: values.firstName.trim(), lastName: values.lastName.trim(), email: values.email.trim() });
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      width={560}
      destroyOnHidden
      title={
        <div>
          <div className="text-lg font-semibold text-slate-800">{contact ? "Edit Contact" : "Add Contact"}</div>
          <div className="mt-1 text-[13px] font-normal text-slate-500">
            {contact ? "Update the details of this contact." : "Add a new contact for this company."}
          </div>
        </div>
      }
      footer={
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="primary" loading={saving} onClick={handleSubmit}>
            {contact ? "Save changes" : "Add contact"}
          </Button>
        </div>
      }
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={(label, { required }) => (
          <>
            {label}
            {required && <span className="ml-1 text-red-500">*</span>}
          </>
        )}
        className="pt-3"
        preserve={false}
        initialValues={initialValues}
        onFinish={handleFinish}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <Form.Item name="firstName" label="First name" rules={requiredName("First name is required")}>
            <Input placeholder="Enter first name" onPressEnter={handleSubmit} />
          </Form.Item>
          <Form.Item name="lastName" label="Last name" rules={requiredName("Last name is required")}>
            <Input placeholder="Enter last name" onPressEnter={handleSubmit} />
          </Form.Item>
        </div>
        <Form.Item name="email" label="Email" normalize={trimValue} rules={[{ type: "email", message: "Enter a valid email address" }]}>
          <Input placeholder="name@company.com" onPressEnter={handleSubmit} />
        </Form.Item>
        <Form.Item
          name="phone"
          label="Phone"
          rules={[{ validator: (_, value?: string) => (!value || isPossiblePhone(value) ? Promise.resolve() : Promise.reject(new Error("Enter a valid phone number"))) }]}
        >
          <ContactPhoneInput onPressEnter={handleSubmit} />
        </Form.Item>
        <Form.Item name="role" label="Role">
          <Select options={ROLE_OPTIONS} />
        </Form.Item>
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <div className="text-sm font-medium text-slate-800">Main contact</div>
            <div className="text-[13px] text-slate-500">
              Use this contact by default for quotes and shipments.
              {!contact?.isMain && " Turning it on replaces the current main contact."}
            </div>
          </div>
          <Form.Item name="isMain" valuePropName="checked" noStyle>
            <Switch aria-label="Main contact" />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
