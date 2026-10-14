"use client";

import { useEffect, useState } from "react";
import { Button, Form, Input, InputNumber, Switch, Select, Tag } from "antd";
import { PlusOutlined, DeleteOutlined, UploadOutlined, SearchOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useInvoiceProfile, type InvoiceProfileInput } from "@/hooks/useInvoiceProfile";

const CURRENCIES = ["CZK", "EUR", "USD", "GBP", "CHF", "PLN"];

/** The database keeps the logo as a data URL; the server allows about 300 KB. */
const MAX_LOGO_BYTES = 290 * 1024;

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** Section title inside the card. */
const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <fieldset className="border-0 p-0 m-0 mb-4">
    <legend className="text-[11.5px] font-bold uppercase tracking-[.04em] text-slate-500 mb-2">{title}</legend>
    {children}
  </fieldset>
);

/**
 * Issuer details printed on every invoice: company name, address, IČO, DIČ, VAT payer,
 * bank accounts per currency and the logo. Issued invoices keep their own copy, so a
 * change here only affects invoices issued afterwards.
 */
export function InvoiceProfileManager() {
  const toast = useToast();
  const { profile, isLoading, saveProfile, isSaving } = useInvoiceProfile();
  const [form] = Form.useForm<InvoiceProfileInput>();
  const [logo, setLogo] = useState("");
  const vatPayer = Form.useWatch("vatPayer", form);
  const icoValue = Form.useWatch("ico", form) ?? "";
  const [looking, setLooking] = useState(false);

  useEffect(() => {
    if (!profile) return;
    // missingForIssue is computed by the server, not a form field
    form.setFieldsValue({ ...profile, missingForIssue: undefined } as Partial<InvoiceProfileInput>);
    setLogo(profile.logoData);
  }, [profile, form]);

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) return toast.error("The logo must be a PNG or JPEG image");
    if (file.size > MAX_LOGO_BYTES) return toast.error("The logo is too large (max. about 290 KB)");
    setLogo(await readAsDataUrl(file));
  };

  /** Fills the company from the Czech ARES registry, the same way the Customer Database does. */
  const lookUpAres = async () => {
    const ico = String(icoValue).replace(/\s/g, "");
    if (!/^\d{8}$/.test(ico)) {
      form.setFields([{ name: "ico", errors: ["IČO must be exactly 8 digits"] }]);
      return;
    }
    setLooking(true);
    try {
      const a = await api.customers.aresLookup(ico);
      // field by field: setFieldsValue deep-merges the whole store, and antd warns about that here
      const filled: Partial<InvoiceProfileInput> = {
        ico: a.ico,
        companyName: a.companyName,
        street: a.street,
        city: a.postalCity,
        postalCode: a.postalCode,
        country: a.country || "CZ",
        dic: a.dic,
        vatPayer: a.vatPayer,
        // replaced too: an entry left over from another company would be wrong on the invoice
        registerEntry: a.registerEntry,
      };
      form.setFields(
        (Object.keys(filled) as (keyof InvoiceProfileInput)[]).map((name) => ({ name, value: filled[name], errors: [] })),
      );
      toast.success(
        a.registerEntry
          ? `Filled from ARES: ${a.companyName} — check the details and save`
          : `Filled from ARES: ${a.companyName} — no commercial register entry in ARES, add it by hand if you have one`,
      );
    } catch (e) {
      form.setFields([{ name: "ico", errors: [e instanceof Error && e.message ? e.message : "ARES lookup failed"] }]);
    } finally {
      setLooking(false);
    }
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      await saveProfile({ ...values, logoData: logo, bankAccounts: values.bankAccounts ?? [] });
      toast.success("Invoicing details saved");
    } catch (e) {
      // the server lists every problem, e.g. "IČO check digit does not match"
      toast.error(e instanceof Error && e.message ? e.message : "Failed to save invoicing details");
    }
  };

  const missing = profile?.missingForIssue ?? [];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="text-sm font-semibold text-slate-800">Invoicing details</span>
        {profile && (missing.length === 0
          ? <Tag color="green" bordered={false}>Ready for invoicing</Tag>
          : <Tag color="orange" bordered={false}>Missing: {missing.join(", ")}</Tag>)}
      </div>
      <p className="text-[13px] text-slate-500 mt-0 mb-4">
        Printed on every invoice as the issuer. Issued invoices keep their own copy, so changes apply to new invoices only.
      </p>

      <Form form={form} layout="vertical" disabled={isLoading} requiredMark={false}>
        <Group title="Company">
          <Form.Item label="IČO" required={false} className="mb-3" extra="Look up fills the company from the Czech ARES registry.">
            <div className="flex gap-2 max-w-md">
              <Form.Item name="ico" noStyle>
                <Input
                  placeholder="e.g. 27082440"
                  inputMode="numeric"
                  onPressEnter={() => void lookUpAres()}
                  // a lookup error belongs to the IČO it was about: typing clears it
                  onChange={() => form.setFields([{ name: "ico", errors: [] }])}
                  aria-label="IČO"
                />
              </Form.Item>
              <Button icon={<SearchOutlined />} onClick={() => void lookUpAres()} loading={looking} disabled={!String(icoValue).trim()}>
                Look up
              </Button>
            </div>
          </Form.Item>
          <Form.Item name="companyName" label="Company name" className="mb-3">
            <Input placeholder="e.g. Example Logistics s.r.o." />
          </Form.Item>
          <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_80px] gap-x-3">
            <Form.Item name="street" label="Street" className="mb-3"><Input /></Form.Item>
            <Form.Item name="city" label="City" className="mb-3"><Input /></Form.Item>
            <Form.Item name="postalCode" label="Postal code" className="mb-3"><Input /></Form.Item>
            <Form.Item name="country" label="Country" className="mb-3"><Input maxLength={2} placeholder="CZ" /></Form.Item>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-x-3 items-end max-w-xl">
            <Form.Item
              name="dic"
              label="DIČ"
              className="mb-3"
              rules={[{ required: !!vatPayer, message: "A VAT payer needs a DIČ" }]}
            >
              <Input placeholder="CZ12345678" />
            </Form.Item>
            <Form.Item name="vatPayer" label="VAT payer (plátce DPH)" valuePropName="checked" className="mb-3">
              <Switch />
            </Form.Item>
          </div>
          <Form.Item name="registerEntry" label="Commercial register entry" className="mb-3">
            <Input placeholder="e.g. C 12345 vedená u Městského soudu v Praze" />
          </Form.Item>
        </Group>

        <Group title="Contact">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-3">
            <Form.Item name="email" label="E-mail" className="mb-3"><Input /></Form.Item>
            <Form.Item name="phone" label="Phone" className="mb-3"><Input /></Form.Item>
            <Form.Item name="web" label="Web" className="mb-3"><Input /></Form.Item>
          </div>
        </Group>

        <Group title="Bank accounts">
          <p className="text-[12.5px] text-slate-500 mt-0 mb-2">
            One account per currency. An invoice shows the account in its own currency.
          </p>
          <Form.List name="bankAccounts">
            {(fields, { add, remove }) => (
              <div className="flex flex-col gap-2">
                {fields.map(({ key, name }) => (
                  <div key={key} className="grid grid-cols-1 sm:grid-cols-[90px_1fr_1fr_1.4fr_1fr_32px] gap-2 items-start">
                    <Form.Item name={[name, "currency"]} className="mb-0" rules={[{ required: true, message: "Currency" }]}>
                      <Select aria-label="Account currency" options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
                    </Form.Item>
                    <Form.Item name={[name, "bankName"]} className="mb-0"><Input placeholder="Bank" aria-label="Bank name" /></Form.Item>
                    <Form.Item name={[name, "accountNumber"]} className="mb-0"><Input placeholder="123456789/0800" aria-label="Account number" /></Form.Item>
                    <Form.Item name={[name, "iban"]} className="mb-0"><Input placeholder="IBAN" aria-label="IBAN" /></Form.Item>
                    <Form.Item name={[name, "swift"]} className="mb-0"><Input placeholder="SWIFT / BIC" aria-label="SWIFT / BIC" /></Form.Item>
                    <Button type="text" danger icon={<DeleteOutlined />} aria-label="Remove bank account" onClick={() => remove(name)} />
                  </div>
                ))}
                <div>
                  <Button
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => add({ currency: "CZK", bankName: "", accountNumber: "", iban: "", swift: "" })}
                  >
                    Add bank account
                  </Button>
                </div>
              </div>
            )}
          </Form.List>
        </Group>

        <Group title="Invoice">
          <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-x-3">
            <Form.Item
              name="defaultDueDays"
              label="Default due days"
              tooltip="Used when the customer has no payment terms"
              className="mb-3"
              rules={[{ required: true, message: "Enter the number of days" }]}
            >
              <InputNumber min={0} max={365} precision={0} className="!w-full" suffix="days" />
            </Form.Item>
            <Form.Item name="footerNote" label="Footer note" className="mb-3">
              <Input placeholder="Printed at the bottom of every invoice (optional)" />
            </Form.Item>
          </div>
          <div className="flex items-center gap-3">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- a data URL, nothing for next/image to optimise
              <img src={logo} alt="Invoice logo" className="h-12 max-w-[180px] object-contain border border-slate-200 rounded-md p-1" />
            ) : (
              <span className="text-[13px] text-slate-500">No logo</span>
            )}
            <label className="inline-flex">
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                onChange={(e) => { void pickLogo(e.target.files?.[0]); e.target.value = ""; }}
              />
              <span className="inline-flex items-center gap-1.5 h-7 px-3 text-[13px] border border-slate-300 rounded-md cursor-pointer hover:border-indigo-400">
                <UploadOutlined /> {logo ? "Change logo" : "Upload logo"}
              </span>
            </label>
            {logo && <Button size="small" type="text" danger onClick={() => setLogo("")}>Remove logo</Button>}
          </div>
        </Group>

        <div className="flex justify-end">
          <Button type="primary" loading={isSaving} onClick={handleSave}>Save invoicing details</Button>
        </div>
      </Form>
    </div>
  );
}
