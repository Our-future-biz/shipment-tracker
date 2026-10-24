"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, AutoComplete, Button, Form, Input, Modal, Popconfirm, Select, Tooltip } from "antd";
import { ContactsOutlined, DeleteOutlined, FilePdfOutlined, IdcardOutlined, SaveOutlined, TeamOutlined } from "@ant-design/icons";
import { useUsers } from "@/hooks/useUsers";
import { EmailAddressListButton } from "./EmailAddressListButton";
import { useCustomerContacts } from "@/hooks/useCustomerContacts";
import { invalidAddress, splitAddresses, usedAddresses, withAddress, type AddressField } from "@/app/sales/_lib/emailAddresses";
import { useEmailAddresses } from "@/app/sales/_lib/useEmailAddresses";
import { useToast } from "@/lib/toast";
import { PLACEHOLDERS, STANDARD_TEMPLATE, asTemplate, filledTemplate, quoteValues } from "@/app/sales/_lib/emailTemplate";
import { lastTemplateId, rememberTemplateId, useEmailTemplates, type SavedEmailTemplate } from "@/app/sales/_lib/useEmailTemplates";
import { LINK_CLASS } from "@/components/linkClass";
import { SalesDialog } from "@/app/sales/_components/SalesDialog";
import type { SalesQuoteData } from "@/app/sales/_lib/types";
import { businessToday } from "@/app/sales/_lib/salesQuote";

interface EmailFormValues {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  message?: string;
}

// Each of To, CC and BCC takes one address or several, separated by commas or semicolons.
const ADDRESS_RULE = {
  validator: (_: unknown, value: string) => {
    const wrong = invalidAddress(value);
    return wrong ? Promise.reject(new Error(`Not an email: ${wrong}`)) : Promise.resolve();
  },
};

// The message as a mailto: link (RFC 6068). Every value is percent-encoded - a space as %20,
// because a "+" would arrive as a plus sign - line breaks travel as CRLF, and the "@" of an
// address stays readable, as mail programs expect it. Several addresses go comma-separated.
function mailtoLink({ to = "", cc = "", bcc = "", subject = "", message = "" }: Partial<EmailFormValues>): string {
  const address = (value: string) => splitAddresses(value).map((a) => encodeURIComponent(a).replace(/%40/g, "@")).join(",");
  const headers = [
    cc.trim() && `cc=${address(cc)}`,
    bcc.trim() && `bcc=${address(bcc)}`,
    `subject=${encodeURIComponent(subject)}`,
    `body=${encodeURIComponent(message.replace(/\r\n|\r|\n/g, "\r\n"))}`,
  ].filter(Boolean);
  return `mailto:${address(to)}?${headers.join("&")}`;
}

// The app cannot send email. This dialog prepares the message, hands it to the user's own email
// program and then asks whether the quote went out - only the user knows that.
interface EmailQuoteModalProps {
  open: boolean;
  quoteNumber: string;
  data: SalesQuoteData;
  // The quote's validity date as the server keeps it.
  validUntil: string | null;
  // The statuses the server lets the quote move to now.
  allowedTransitions: readonly string[];
  // Why the quote may not be marked as sent now (its margin waits for a manager); null when nothing stops it.
  sendBlocked: string | null;
  onExportPdf: () => void;
  // Asks the server to make the quote Quoted. Resolves with why it refused - a sentence that
  // finishes "QCZ… - …" - or with null once the quote is Quoted.
  onMarkSent: () => Promise<string | null>;
  onClose: () => void;
}

export function EmailQuoteModal({
  open,
  quoteNumber,
  data,
  validUntil,
  allowedTransitions,
  sendBlocked,
  onExportPdf,
  onMarkSent,
  onClose,
}: EmailQuoteModalProps) {
  const [form] = Form.useForm<EmailFormValues>();
  const values = Form.useWatch([], form);
  const [valid, setValid] = useState(false);
  // The email program was opened from this dialog at least once.
  const [opened, setOpened] = useState(false);
  const [marking, setMarking] = useState(false);
  // Why the server did not mark the quote as sent.
  const [refusal, setRefusal] = useState<string | null>(null);

  const toast = useToast();
  // To offers the emails of the quote's customer, from the Customer Database. Three lists put an
  // address to To, CC or BCC: those the user emailed before, the users of the company, and the
  // customer's contacts.
  const { contacts } = useCustomerContacts(open ? (data.customerId ?? "") : "");
  const customerEmails = contacts.filter((c) => c.email.trim());
  const addresses = useEmailAddresses(open);
  // The platform's users of the company, for "My organization".
  const { users } = useUsers();
  const addTo = (field: AddressField, address: string) => {
    form.setFieldValue(field, withAddress(form.getFieldValue(field), address));
    form.validateFields([field]).catch(() => {});
  };
  // The user's own templates, and the standard one everybody has. The subject and message start
  // from the template last chosen, filled in from this quote.
  const templates = useEmailTemplates(open);
  const all: SavedEmailTemplate[] = [STANDARD_TEMPLATE, ...templates.list];
  const [templateId, setTemplateId] = useState(STANDARD_TEMPLATE.id);
  const chosenSaved = templates.list.find((t) => t.id === templateId) ?? null;
  // Saving the message as a template: the name asked for; null while not asked.
  const [naming, setNaming] = useState<string | null>(null);

  // Each time the dialog opens it starts from the quote's current values (and only then: what is
  // typed while it is open stays). The values are read through a ref for that reason.
  const prefill = useRef({ to: data.customerEmail ?? "", values: quoteValues(quoteNumber, data, validUntil), all });
  prefill.current = { to: data.customerEmail ?? "", values: quoteValues(quoteNumber, data, validUntil), all };
  const applyTemplate = (id: string) => {
    const template = prefill.current.all.find((t) => t.id === id) ?? STANDARD_TEMPLATE;
    setTemplateId(template.id);
    form.setFieldsValue(filledTemplate(template, prefill.current.values));
  };
  useEffect(() => {
    if (open) {
      setOpened(false);
      setRefusal(null);
      setNaming(null);
      form.setFieldsValue({ to: prefill.current.to, cc: "", bcc: "" });
      applyTemplate(lastTemplateId() ?? STANDARD_TEMPLATE.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form]);
  // The user's templates read after the dialog opened: the one last chosen is put in, unless the
  // subject or the message were already typed in.
  useEffect(() => {
    const last = lastTemplateId();
    if (open && templates.ready && last && last !== templateId && !form.isFieldsTouched(["subject", "message"])) applyTemplate(last);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, templates.ready]);

  const chooseTemplate = (id: string) => {
    rememberTemplateId(id);
    applyTemplate(id);
  };

  // The subject and message as a template: this quote's values become placeholders again. A
  // template of the same name is replaced; the standard one is never changed.
  const saveTemplate = async (name: string) => {
    const values = prefill.current.values;
    const same = templates.list.find((t) => t.name.toLowerCase() === name.toLowerCase());
    const template: SavedEmailTemplate = {
      id: same?.id ?? crypto.randomUUID(),
      name,
      subject: asTemplate(form.getFieldValue("subject") ?? "", values),
      message: asTemplate(form.getFieldValue("message") ?? "", values),
    };
    const list = same ? templates.list.map((t) => (t.id === same.id ? template : t)) : [...templates.list, template];
    try {
      await templates.save.mutateAsync(list);
      setNaming(null);
      setTemplateId(template.id);
      rememberTemplateId(template.id);
      toast.success(`Template "${name}" saved`);
    } catch (e) {
      toast.error(`Template not saved - ${e instanceof Error ? e.message : "try again"}`);
    }
  };

  const deleteTemplate = async () => {
    if (!chosenSaved) return;
    try {
      await templates.save.mutateAsync(templates.list.filter((t) => t.id !== chosenSaved.id));
      setTemplateId(STANDARD_TEMPLATE.id);
      rememberTemplateId(STANDARD_TEMPLATE.id);
      toast.success(`Template "${chosenSaved.name}" deleted`);
    } catch (e) {
      toast.error(`Template not deleted - ${e instanceof Error ? e.message : "try again"}`);
    }
  };

  // Whether the message may go out is known before the click: the button that hands it over is a
  // real link, and a link has to be stopped in the click itself, not after an asynchronous
  // validation.
  useEffect(() => {
    if (!open) return;
    let latest = true;
    form.validateFields({ validateOnly: true }).then(
      () => latest && setValid(true),
      () => latest && setValid(false),
    );
    return () => {
      latest = false;
    };
  }, [open, form, values]);

  // A real link, opened in a new tab: an email program takes it over from there, and webmail that
  // handles mailto: links opens beside the quote instead of replacing this page and its question.
  const mailLink = {
    href: mailtoLink(values ?? {}),
    target: "_blank",
    rel: "noreferrer",
    onClick: (e: React.MouseEvent) => {
      if (valid) {
        setOpened(true);
        // The addresses are remembered for next time; a failure to remember stops nothing.
        const used = usedAddresses(form.getFieldsValue(["to", "cc", "bcc"]));
        if (used.length) addresses.used.mutate(used);
        return;
      }
      e.preventDefault();
      // Shows next to the fields what is missing.
      form.validateFields().catch(() => {});
    },
  };

  // The dialog closes only once the quote is Quoted. Refused, it stays with the reason, so the
  // question can be answered again when that is dealt with.
  const markSent = async () => {
    setMarking(true);
    setRefusal(null);
    const refused = await onMarkSent();
    setMarking(false);
    if (refused) setRefusal(refused);
    else onClose();
  };

  // Asked only when the server would let the quote become Quoted - the same rule the status menu
  // follows. Still asked while the answer is on its way, although the quote may be Quoted by then.
  const askSent = marking || allowedTransitions.includes("quoted");
  // Marking as sent names no new validity, so a quote whose date has passed is refused for that:
  // the date has to be set first.
  const validityPassed = validUntil !== null && validUntil < businessToday();

  // What the dialog offers next: to hand the message over, then - once the email program was
  // opened - the answer to whether the quote went out.
  let buttons = (
    <>
      <Button onClick={onClose}>Cancel</Button>
      <Button type="primary" {...mailLink}>
        Open in email program
      </Button>
    </>
  );
  if (opened) {
    buttons = askSent ? (
      <>
        <Button disabled={marking} onClick={onClose}>
          Not yet
        </Button>
        <Tooltip title={sendBlocked}>
          <Button type="primary" loading={marking} onClick={markSent}>
            Mark as sent
          </Button>
        </Tooltip>
      </>
    ) : (
      <Button type="primary" onClick={onClose}>
        Close
      </Button>
    );
  }

  return (
    <SalesDialog
      open={open}
      onClose={onClose}
      // While the answer about "Mark as sent" is on its way the dialog stays: a refusal is shown in it.
      busy={marking}
      title="Email quote"
      subtitle="This opens the message in your own email program - the app does not send email."
      footer={buttons}
    >
      {sendBlocked && (
        <div className="mb-4">
          <Alert type="warning" showIcon message={sendBlocked} />
        </div>
      )}
      <div className="mb-4">
        <Alert
          type="info"
          showIcon
          message="The PDF is not attached automatically. Export it, save it as a PDF and attach it to the message before you send it."
          action={
            <Button size="small" icon={<FilePdfOutlined />} onClick={onExportPdf}>
              Export PDF
            </Button>
          }
        />
      </div>

      <Form form={form} layout="vertical" disabled={marking}>
        <Form.Item label="Template">
          <div className="flex items-center gap-2">
            <Select
              className="flex-1 min-w-0"
              aria-label="Email template"
              value={templateId}
              onChange={chooseTemplate}
              options={all.map((t) => ({ value: t.id, label: t.id === STANDARD_TEMPLATE.id ? "Standard (built in)" : t.name }))}
            />
            <Button icon={<SaveOutlined />} onClick={() => setNaming(chosenSaved?.name ?? "")}>
              Save as template
            </Button>
            {chosenSaved && (
              <Popconfirm
                title={`Delete the template "${chosenSaved.name}"?`}
                okText="Delete"
                okButtonProps={{ danger: true }}
                onConfirm={deleteTemplate}
              >
                <Button danger icon={<DeleteOutlined />} aria-label="Delete template" loading={templates.save.isPending} />
              </Popconfirm>
            )}
          </div>
        </Form.Item>
        <div className="flex flex-wrap justify-end gap-2 -mb-1">
          <EmailAddressListButton
            label="Used before"
            icon={<ContactsOutlined />}
            title="Addresses you emailed before"
            entries={addresses.list.map((address) => ({ address }))}
            empty="None yet - the addresses you email a quote to are kept here"
            onAdd={addTo}
            onForget={(address) => addresses.forget.mutate(address)}
          />
          <EmailAddressListButton
            label="My organization"
            icon={<TeamOutlined />}
            title="The users of the platform in your company"
            entries={users.filter((u) => u.email.trim()).map((u) => ({ address: u.email, name: u.displayName }))}
            empty="No users with an email"
            onAdd={addTo}
          />
          <EmailAddressListButton
            label="Customers alternative"
            icon={<IdcardOutlined />}
            title={data.customerName ? `The contacts of ${data.customerName} in the Customer Database` : "The customer's contacts"}
            entries={customerEmails.map((c) => ({ address: c.email, name: `${c.name}${c.isMain ? " · main" : ""}` }))}
            empty={data.customerId ? "This customer has no contact with an email in the Customer Database" : "Pick the customer under Customer details first"}
            onAdd={addTo}
          />
        </div>
        <Form.Item
          name="to"
          label="To"
          rules={[
            { required: true, message: "Recipient is required" },
            ADDRESS_RULE,
          ]}
        >
          <AutoComplete
            placeholder="customer@example.com"
            // The customer's emails, picked in place of what the field holds.
            options={customerEmails.map((c) => ({
              value: c.email,
              label: (
                <div className="flex justify-between gap-3">
                  <span className="truncate">{c.name}{c.isMain ? " · main" : ""}</span>
                  <span className="text-slate-500 truncate">{c.email}</span>
                </div>
              ),
            }))}
            // All of them, whatever the field holds: a customer has a handful.
            filterOption={false}
          />
        </Form.Item>
        <Form.Item
          name="cc"
          label="CC"
          rules={[ADDRESS_RULE]}
        >
          <Input placeholder="Optional - several separated by commas" />
        </Form.Item>
        <Form.Item
          name="bcc"
          label="BCC"
          rules={[ADDRESS_RULE]}
        >
          <Input placeholder="Optional - several separated by commas" />
        </Form.Item>
        <Form.Item name="subject" label="Subject" rules={[{ required: true, message: "Subject is required" }]}>
          <Input />
        </Form.Item>
        <Form.Item
          name="message"
          label="Message"
          className="!mb-0"
          extra={`Saved as a template, this quote's details become placeholders, filled in for the next quote: ${PLACEHOLDERS.map((p) => `{${p.key}}`).join(" ")}.`}
        >
          <Input.TextArea rows={7} />
        </Form.Item>
      </Form>

      <Modal
        open={naming !== null}
        title="Save as template"
        okText={templates.list.some((t) => t.name.toLowerCase() === (naming ?? "").trim().toLowerCase()) ? "Replace template" : "Save template"}
        okButtonProps={{ disabled: !(naming ?? "").trim(), loading: templates.save.isPending }}
        onOk={() => saveTemplate((naming ?? "").trim())}
        onCancel={() => setNaming(null)}
        destroyOnHidden
      >
        <div className="text-[13px] text-slate-500 mb-2">
          Only you see your templates. The subject and message are kept with placeholders, so each quote gets its own contact, reference and route.
        </div>
        <Input
          autoFocus
          maxLength={80}
          aria-label="Template name"
          placeholder="e.g. Standard, Follow-up, German"
          value={naming ?? ""}
          onChange={(e) => setNaming(e.target.value)}
          onPressEnter={() => (naming ?? "").trim() && saveTemplate(naming!.trim())}
        />
      </Modal>

      {opened && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <div className="text-[13px] text-slate-600">
            Your email program should now show the message. Nothing there?{" "}
            <a {...mailLink} className={LINK_CLASS}>
              Open it again
            </a>
            .
          </div>
          {askSent && (
            <div className="mt-1.5 text-[13px] font-medium text-slate-800">
              Was the quote sent? Marking it as sent sets its status to Quoted.
            </div>
          )}
          {refusal && (
            <div className="mt-2">
              <Alert
                type="error"
                showIcon
                message={`${quoteNumber} - ${refusal}`}
                description={validityPassed ? "Set Valid until under Shipping terms, then mark as sent." : undefined}
              />
            </div>
          )}
        </div>
      )}
    </SalesDialog>
  );
}
