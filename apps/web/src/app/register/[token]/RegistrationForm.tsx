"use client";

import { useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, AutoComplete, Button, Checkbox, Form, Input, Select, Spin } from "antd";
import { CheckCircleFilled, SearchOutlined } from "@ant-design/icons";
import { useDebounced } from "@/hooks/useDebounced";
import { apiErrorMessage, isNotFound, publicApi } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { COUNTRY_OPTIONS } from "@/components/countryOptions";
import { CONTACT_ROLES } from "@/app/customers/_lib/constants";
import { ContactPhoneInput, isPossiblePhone } from "@/app/customers/[id]/_components/ContactPhoneInput";
import { CustomerInfoRow } from "@/app/customers/[id]/_components/CustomerInfoRow";
import { czechPhoneRule } from "@/lib/phone";
import { CARD, LABEL_TEXT, PAGE_SUBTITLE, PAGE_TITLE } from "@/styles/ui";

// The form a company fills in through its registration link: as Add Customer / Supplier, without what is
// only ours to decide. Only when the terms are ticked can it be confirmed; a manager then answers it on
// Sales → Managers → Company approval.

const ICO_LENGTH = 8;
const MIN_NAME_LENGTH = 3;
const SEARCH_DELAY_MS = 400;
const REGISTRY_COUNTRY = "CZ";
const ROLE_OPTIONS = CONTACT_ROLES.map((role) => ({ value: role, label: role }));
const NEW_CONTACT = { firstName: "", lastName: "", email: "", phone: "", role: "Logistics Manager" as const };

interface ManualValues {
  companyName: string;
  street: string;
  city: string;
  postalCode: string;
  registrationNumber?: string;
  vatId?: string;
}

type ContactValues = interfaces.CustomerContactRequest;

const required = (message: string) => [{ required: true, whitespace: true, message }];

function Label({ children }: { children: string }) {
  return (
    <>
      {children}
      <span className="ml-1 text-red-500">*</span>
    </>
  );
}

function Page({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-[620px]">{children}</div>
    </main>
  );
}

export function RegistrationForm({ token }: { token: string }) {
  const form = useQuery({ queryKey: ["public-registration", token], queryFn: () => publicApi.customers.publicRegistrationForm(token), retry: false });
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <Page>
        <section className={`${CARD} px-6 py-10 text-center`}>
          <CheckCircleFilled aria-hidden className="text-emerald-600 text-[36px]" />
          <h1 className={`${PAGE_TITLE} mt-3`}>Thank you for registering</h1>
          <p className={`${PAGE_SUBTITLE} mt-1 mb-0`}>We have received your details. Our team will review them and get in touch with you.</p>
        </section>
      </Page>
    );
  }
  if (form.isLoading) {
    return (
      <Page>
        <div className="flex justify-center py-20">
          <Spin />
        </div>
      </Page>
    );
  }
  if (!form.data) {
    return (
      <Page>
        <section className={`${CARD} px-6 py-10 text-center`}>
          <h1 className={PAGE_TITLE}>{isNotFound(form.error) ? "This link is no longer valid" : "The registration could not be opened"}</h1>
          <p className={`${PAGE_SUBTITLE} mt-1 mb-0`}>
            {isNotFound(form.error) ? "It was already used, it has expired or it was cancelled. Please ask your contact for a new one." : "Please try again in a moment."}
          </p>
        </section>
      </Page>
    );
  }
  return <Filling token={token} terms={form.data.form} onDone={() => setDone(true)} />;
}

function Filling({ token, terms, onDone }: { token: string; terms: interfaces.PublicRegistrationForm; onDone: () => void }) {
  const [manualForm] = Form.useForm<ManualValues>();
  const [contactForm] = Form.useForm<ContactValues>();
  const [country, setCountry] = useState(REGISTRY_COUNTRY);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<interfaces.AresResult | null>(null);
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  // A slow earlier look-up must not replace a newer one.
  const lookupSeq = useRef(0);

  const fromRegistry = country === REGISTRY_COUNTRY;
  const isIco = /^\d+$/.test(query);
  const searchName = useDebounced(isIco ? "" : query.trim(), SEARCH_DELAY_MS);
  const nameSearch = useQuery({
    queryKey: ["public-ares-search", token, searchName],
    queryFn: () => publicApi.customers.publicRegistrationAresSearch(token, { name: searchName }),
    enabled: fromRegistry && !preview && searchName.length >= MIN_NAME_LENGTH,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const resetLookup = () => {
    lookupSeq.current += 1;
    setPreview(null);
    setLookupError("");
    setLooking(false);
  };

  const lookup = async (ico: string) => {
    lookupSeq.current += 1;
    const seq = lookupSeq.current;
    setLookupError("");
    setLooking(true);
    try {
      const result = await publicApi.customers.publicRegistrationAres(token, ico);
      if (seq === lookupSeq.current) setPreview(result);
    } catch (err) {
      if (seq === lookupSeq.current) {
        setPreview(null);
        setLookupError(apiErrorMessage(err));
      }
    } finally {
      if (seq === lookupSeq.current) setLooking(false);
    }
  };

  const handleQueryChange = (text: string) => {
    const next = /^[\d\s]+$/.test(text) ? text.replace(/\D/g, "").slice(0, ICO_LENGTH) : text;
    if (next === query) return;
    setQuery(next);
    resetLookup();
  };

  const handleLookup = () => {
    if (isIco) {
      if (query.length !== ICO_LENGTH) setLookupError(`IČO must be exactly ${ICO_LENGTH} digits`);
      else void lookup(query);
    } else if (query.trim().length < MIN_NAME_LENGTH) {
      setLookupError(`Type at least ${MIN_NAME_LENGTH} characters of the company name, or the IČO`);
    }
  };

  const contactOf = (values: ContactValues): ContactValues => ({
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    email: values.email?.trim() || undefined,
    phone: values.phone || undefined,
    role: values.role,
  });

  const handleConfirm = async () => {
    if (submitting || !accepted || (fromRegistry && !preview)) return;
    let contact: ContactValues;
    let manual: ManualValues | null = null;
    try {
      const [contactValues, manualValues] = await Promise.all([contactForm.validateFields(), fromRegistry ? Promise.resolve(null) : manualForm.validateFields()]);
      contact = contactOf(contactValues);
      manual = manualValues;
    } catch {
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      await publicApi.customers.publicRegistrationSubmit(token, {
        termsAccepted: accepted,
        // The terms as shown: refused when a manager changed them meanwhile.
        termsUrl: terms.termsUrl,
        country,
        contact,
        ...(fromRegistry && preview ? { ico: preview.ico } : manual),
      });
      onDone();
    } catch (err) {
      // The server's own sentence: a link no longer valid says so, and so do terms changed meanwhile.
      setSubmitError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const nameResults = !isIco && searchName === query.trim() ? nameSearch.data : undefined;
  const nameOptions = (nameResults?.companies ?? []).map((company) => ({
    value: company.ico,
    label: (
      <div className="py-0.5">
        <div className="font-medium text-slate-900 truncate">{company.companyName}</div>
        <div className="text-xs text-slate-500 truncate">
          IČO {company.ico}
          {company.address && ` · ${company.address}`}
        </div>
      </div>
    ),
  }));
  const nameHelp = nameResults?.tooMany ? "Too many companies match. Type more of the name." : nameResults && nameResults.companies.length === 0 ? "No company of this name in the Czech register." : nameSearch.isError ? apiErrorMessage(nameSearch.error) : undefined;

  const canConfirm = accepted && (!fromRegistry || !!preview);

  return (
    <Page>
      <header className="mb-4">
        <h1 className={PAGE_TITLE}>Company registration</h1>
        <p className={`${PAGE_SUBTITLE} m-0`}>Please fill in your company&apos;s details.</p>
      </header>
      <section className={`${CARD} px-6 py-5`}>
        <Form layout="vertical" requiredMark={false}>
          <Form.Item label={<Label>Country</Label>} htmlFor="registration-country" className="!mb-3">
            <Select
              id="registration-country"
              showSearch
              optionFilterProp="search"
              value={country}
              options={COUNTRY_OPTIONS}
              disabled={submitting}
              onChange={(next) => {
                setCountry(next);
                resetLookup();
              }}
            />
          </Form.Item>
        </Form>

        {fromRegistry ? (
          <>
            <Form layout="vertical" requiredMark={false}>
              <Form.Item label={<Label>Company name or IČO</Label>} htmlFor="registration-ico" validateStatus={lookupError ? "error" : undefined} help={lookupError || nameHelp}>
                <div className="flex gap-2">
                  <AutoComplete
                    id="registration-ico"
                    className="flex-1 min-w-0"
                    placeholder="e.g. Alza.cz or 27082440"
                    value={query}
                    options={nameOptions}
                    onChange={handleQueryChange}
                    onSelect={(ico: string) => {
                      setQuery(ico);
                      void lookup(ico);
                    }}
                    disabled={submitting}
                    popupMatchSelectWidth
                    notFoundContent={nameSearch.isFetching ? "Searching…" : undefined}
                    onInputKeyDown={(e) => {
                      if (e.key === "Enter" && isIco) handleLookup();
                    }}
                  />
                  <Button type="primary" icon={<SearchOutlined />} onClick={handleLookup} loading={looking || nameSearch.isFetching} disabled={!query.trim() || submitting}>
                    Look up
                  </Button>
                </div>
              </Form.Item>
            </Form>
            {preview && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 mb-2">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="inline-flex items-center gap-2 text-[13px] font-medium text-emerald-700">
                    <CheckCircleFilled aria-hidden className="text-emerald-600" />
                    Company found
                  </span>
                  <Button size="small" onClick={resetLookup} disabled={submitting}>
                    Change
                  </Button>
                </div>
                <div className="text-[14px] font-semibold text-slate-900 mb-1">{preview.companyName || "—"}</div>
                <CustomerInfoRow label="IČO">
                  <span className="tabular-nums">{preview.ico}</span>
                </CustomerInfoRow>
                <CustomerInfoRow label="DIČ (VAT ID)">{preview.dic}</CustomerInfoRow>
                <CustomerInfoRow label="Address">{preview.street}</CustomerInfoRow>
                <CustomerInfoRow label="City">{preview.postalCity || preview.city}</CustomerInfoRow>
                <CustomerInfoRow label="ZIP">{preview.postalCode}</CustomerInfoRow>
              </div>
            )}
          </>
        ) : (
          <Form form={manualForm} layout="vertical" requiredMark={false} disabled={submitting}>
            <Form.Item name="companyName" label={<Label>Company name</Label>} rules={required("Company name is required")}>
              <Input maxLength={300} />
            </Form.Item>
            <Form.Item name="street" label={<Label>Street address</Label>} rules={required("Street address is required")}>
              <Input maxLength={200} />
            </Form.Item>
            <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-x-4">
              <Form.Item name="city" label={<Label>City</Label>} rules={required("City is required")}>
                <Input maxLength={200} />
              </Form.Item>
              <Form.Item name="postalCode" label={<Label>ZIP / Postal code</Label>} rules={required("ZIP / Postal code is required")}>
                <Input maxLength={20} />
              </Form.Item>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              <Form.Item name="registrationNumber" label="Registration number">
                <Input placeholder="e.g. HRB 12345" maxLength={50} />
              </Form.Item>
              <Form.Item name="vatId" label="VAT ID">
                <Input placeholder="e.g. DE123456789" maxLength={20} />
              </Form.Item>
            </div>
          </Form>
        )}

        {(!fromRegistry || preview) && (
          <div className="border-t border-slate-200 pt-4 mt-2">
            <div className={`${LABEL_TEXT} mb-3`}>Contact person</div>
            <Form form={contactForm} layout="vertical" requiredMark={false} initialValues={NEW_CONTACT} disabled={submitting}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                <Form.Item name="firstName" label={<Label>First name</Label>} rules={required("First name is required")}>
                  <Input placeholder="Enter first name" maxLength={100} />
                </Form.Item>
                <Form.Item name="lastName" label={<Label>Last name</Label>} rules={required("Last name is required")}>
                  <Input placeholder="Enter last name" maxLength={100} />
                </Form.Item>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                <Form.Item
                  name="email"
                  label="Email"
                  dependencies={["phone"]}
                  rules={[
                    { type: "email", message: "Enter a valid email address" },
                    ({ getFieldValue }) => ({
                      validator: (_, value?: string) => (value?.trim() || getFieldValue("phone") ? Promise.resolve() : Promise.reject(new Error("Enter an email or a phone number"))),
                    }),
                  ]}
                >
                  <Input placeholder="name@company.com" maxLength={320} />
                </Form.Item>
                <Form.Item name="role" label="Role">
                  <Select options={ROLE_OPTIONS} />
                </Form.Item>
              </div>
              <Form.Item
                name="phone"
                label="Phone"
                rules={[
                  czechPhoneRule,
                  { validator: (_, value?: string) => (!value || isPossiblePhone(value) ? Promise.resolve() : Promise.reject(new Error("Enter a valid phone number"))) },
                ]}
              >
                <ContactPhoneInput defaultCountry={country} />
              </Form.Item>
            </Form>
          </div>
        )}

        <div className="border-t border-slate-200 pt-4 mt-2">
          <Checkbox checked={accepted} disabled={submitting} onChange={(e) => setAccepted(e.target.checked)}>
            I accept the{" "}
            <a href={terms.termsUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline" onClick={(e) => e.stopPropagation()}>
              {terms.termsName}
            </a>
          </Checkbox>
        </div>
        {submitError && <Alert type="error" showIcon className="!mt-3" message={submitError} />}
        <div className="flex justify-end mt-4">
          <Button type="primary" size="large" disabled={!canConfirm} loading={submitting} onClick={() => void handleConfirm()}>
            Confirm the Registration
          </Button>
        </div>
      </section>
    </Page>
  );
}
