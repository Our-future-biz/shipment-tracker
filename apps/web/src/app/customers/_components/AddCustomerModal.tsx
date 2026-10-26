"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AutoComplete, Button, Checkbox, Form, Input, Modal, Select } from "antd";
import type { RefSelectProps } from "antd";
import { CheckCircleFilled, InfoCircleOutlined, SearchOutlined } from "@ant-design/icons";
import { useDebounced } from "@/hooks/useDebounced";
import { api, ErrCode, isAPIError } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import { COUNTRY_OPTIONS } from "@/components/countryOptions";
import { useToast } from "@/lib/toast";
import { czechPhoneRule } from "@/lib/phone";
import { ContactPhoneInput, isPossiblePhone } from "../[id]/_components/ContactPhoneInput";
import { CustomerInfoRow } from "../[id]/_components/CustomerInfoRow";
import { CONTACT_ROLES, CUSTOMER_ROLE_OPTIONS } from "../_lib/constants";
import { useCanSeeConcepts } from "@/lib/auth/AuthContext";

const ICO_LENGTH = 8;
// ARES is searched by name from this many characters, once typing has paused.
const MIN_NAME_LENGTH = 3;
const SEARCH_DELAY_MS = 400;
const ICO_INPUT_ID = "add-customer-ico";
// Czech companies are read from ARES; any other country is typed in by hand.
const REGISTRY_COUNTRY = "CZ";

type ManualCustomerValues = Omit<controllers.CustomerCreateManualRequest, "country" | "contact">;
type ContactValues = interfaces.CustomerContactRequest;

const ROLE_OPTIONS = CONTACT_ROLES.map((role) => ({ value: role, label: role }));
const NEW_CONTACT: ContactValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  role: "Logistics Manager",
};

interface AddCustomerModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (customerId: string) => void;
  // Passed in by the list page, so the dialog does not start a customers query of its own.
  createCustomer: (
    params: controllers.CustomerCreateRequest,
  ) => Promise<controllers.CustomerCreateResponse>;
  createManualCustomer: (
    params: controllers.CustomerCreateManualRequest,
  ) => Promise<controllers.CustomerCreateManualResponse>;
  isCreating: boolean;
  /** Roles ticked when the dialog opens (Trucking adds hauliers). */
  defaultRoles?: interfaces.CustomerRole[];
}

const CUSTOMER_ONLY: interfaces.CustomerRole[] = ["customer"];

// The API says what went wrong ("A customer with this IČO already exists", "ARES registry
// unavailable"). The fixed text covers failures without such a message: no connection, or a
// reply that did not come from the API (the client then reports the code "unknown").
function errorMessage(err: unknown, fallback: string): string {
  return isAPIError(err) && err.code !== ErrCode.Unknown && err.message ? err.message : fallback;
}

const required = (message: string) => [{ required: true, whitespace: true, message }];

export function AddCustomerModal({
  open,
  onClose,
  onCreated,
  createCustomer,
  createManualCustomer,
  isCreating,
  defaultRoles = CUSTOMER_ONLY,
}: AddCustomerModalProps) {
  const canSeeConcepts = useCanSeeConcepts();
  const toast = useToast();
  const submitting = useRef(false);
  const [manualForm] = Form.useForm<ManualCustomerValues>();
  const [contactForm] = Form.useForm<ContactValues>();
  const [country, setCountry] = useState(REGISTRY_COUNTRY);
  // A company is a customer, a haulier we subcontract trucking to, or both.
  const [roles, setRoles] = useState<interfaces.CustomerRole[]>(defaultRoles);
  // What is typed: an IČO (digits only) or part of the company name.
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<interfaces.AresResult | null>(null);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState("");
  const queryInputRef = useRef<RefSelectProps>(null);
  // Number of the latest lookup. A response that carries an older number is dropped, so a
  // slow earlier request can never replace the result of a newer one.
  const lookupSeq = useRef(0);

  const fromRegistry = country === REGISTRY_COUNTRY;
  const isIco = /^\d+$/.test(query);
  const searchName = useDebounced(isIco ? "" : query.trim(), SEARCH_DELAY_MS);
  const nameSearch = useQuery({
    queryKey: ["ares-search", searchName],
    queryFn: () => api.customers.aresSearch({ name: searchName }),
    enabled: fromRegistry && !preview && searchName.length >= MIN_NAME_LENGTH,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const resetLookup = () => {
    lookupSeq.current += 1;
    setPreview(null);
    setError("");
    setLooking(false);
  };

  const handleCountryChange = (next: string) => {
    setCountry(next);
    resetLookup();
  };

  const handleQueryChange = (text: string) => {
    // An IČO is kept to its 8 digits; a name is kept as typed.
    const next = /^[\d\s]+$/.test(text) ? text.replace(/\D/g, "").slice(0, ICO_LENGTH) : text;
    if (next === query) return;
    setQuery(next);
    // The preview is what gets created, so it must never describe another company than the field.
    resetLookup();
  };

  const lookup = async (ico: string) => {
    lookupSeq.current += 1;
    const seq = lookupSeq.current;
    setError("");
    setLooking(true);
    try {
      const result = await api.customers.aresLookup(ico);
      if (seq !== lookupSeq.current) return;
      setPreview(result);
    } catch (err) {
      if (seq !== lookupSeq.current) return;
      setPreview(null);
      setError(errorMessage(err, "Could not look the company up. Please try again."));
    } finally {
      if (seq === lookupSeq.current) setLooking(false);
    }
  };

  // Enter or the button: an IČO is looked up; a name only waits for its suggestions.
  const handleLookup = () => {
    if (isIco) {
      if (query.length !== ICO_LENGTH) setError(`IČO must be exactly ${ICO_LENGTH} digits`);
      else void lookup(query);
    } else if (query.trim().length < MIN_NAME_LENGTH) {
      setError(`Type at least ${MIN_NAME_LENGTH} characters of the company name, or the IČO`);
    }
  };

  // A company picked from the suggestions is read by its IČO, which then stands in the field.
  const handleSelectCompany = (ico: string) => {
    setQuery(ico);
    void lookup(ico);
  };

  // Back to the IČO field, to look up another company.
  const handleChangeCompany = () => {
    resetLookup();
    queryInputRef.current?.focus();
  };

  const created = (customer: interfaces.CustomerItem) => {
    toast.success(`${customer.companyName} added`);
    onCreated(customer.id);
  };

  // The contact person as sent: trimmed, and without what was left empty.
  const contactOf = (values: ContactValues): ContactValues => ({
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    email: values.email?.trim() || undefined,
    phone: values.phone || undefined,
    role: values.role,
  });

  // Both forms are checked at once, so every missing field shows; nothing is sent until all pass.
  // A double click must not create the customer twice: `isCreating` only turns true once the
  // request is out, after the forms were checked, so the click is held off here from the start.
  const handleCreate = async () => {
    if (submitting.current || isCreating || (fromRegistry && !preview) || roles.length === 0) return;
    submitting.current = true;
    try {
      await create();
    } finally {
      submitting.current = false;
    }
  };

  const create = async () => {
    let contact: ContactValues;
    let company: ManualCustomerValues | null = null;
    try {
      const [contactValues, manualValues] = await Promise.all([
        contactForm.validateFields(),
        fromRegistry ? Promise.resolve(null) : manualForm.validateFields(),
      ]);
      contact = contactOf(contactValues);
      company = manualValues;
    } catch {
      return;
    }
    try {
      let res: { customer: interfaces.CustomerItem };
      if (fromRegistry && preview) res = await createCustomer({ ico: preview.ico, contact, roles });
      else if (company) res = await createManualCustomer({ ...company, country, contact, roles });
      else return;
      created(res.customer);
    } catch (err) {
      toast.error(errorMessage(err, "Could not create the customer"));
    }
  };

  const handleCancel = () => {
    // Closing now would hide the dialog and then still open the new customer once it is created.
    if (isCreating) return;
    onClose();
  };

  const handleAfterClose = () => {
    setCountry(REGISTRY_COUNTRY);
    setRoles(defaultRoles);
    setQuery("");
    resetLookup();
  };

  // The suggestions are for the name as it stands, not for one typed before.
  const nameResults = !isIco && searchName === query.trim() ? nameSearch.data : undefined;
  const nameOptions = (nameResults?.companies ?? []).map((company) => ({
    value: company.ico,
    label: (
      <div className="py-0.5">
        <div className="font-medium text-slate-800 truncate">{company.companyName}</div>
        <div className="text-xs text-slate-500 truncate">
          IČO {company.ico}
          {company.address && ` · ${company.address}`}
        </div>
      </div>
    ),
  }));
  let nameSearchHelp: string | undefined;
  if (nameSearch.isError && !isIco) {
    const err = nameSearch.error;
    // The server limits searches per company and refuses names ARES can't take.
    if (isAPIError(err) && err.code === ErrCode.ResourceExhausted)
      nameSearchHelp = "Too many ARES searches just now — wait a minute and try again.";
    else if (isAPIError(err) && err.code === ErrCode.InvalidArgument)
      nameSearchHelp = errorMessage(err, "ARES can't search for this name. Try other words or the IČO.");
    else nameSearchHelp = errorMessage(err, "Could not search ARES. Please try again.");
  }
  else if (nameResults?.tooMany)
    nameSearchHelp = "Too many companies match. Type more of the name.";
  else if (nameResults && nameResults.companies.length === 0)
    nameSearchHelp = "No company of this name in ARES.";

  return (
    <Modal
      open={open}
      onCancel={handleCancel}
      afterClose={handleAfterClose}
      title={<span className="text-lg font-semibold text-slate-800">Add Customer</span>}
      width={560}
      destroyOnHidden
      footer={
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button onClick={handleCancel} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            type="primary"
            onClick={() => void handleCreate()}
            loading={isCreating}
            disabled={(fromRegistry && !preview) || roles.length === 0}
          >
            Create customer
          </Button>
        </div>
      }
    >
      <Form layout="vertical" className="pt-3" requiredMark={false}>
        <Form.Item
          label={<RequiredLabel>Country</RequiredLabel>}
          htmlFor="add-customer-country"
          className="!mb-3"
        >
          <Select
            id="add-customer-country"
            showSearch
            optionFilterProp="search"
            value={country}
            options={COUNTRY_OPTIONS}
            disabled={isCreating}
            onChange={handleCountryChange}
          />
        </Form.Item>
        {canSeeConcepts && (
          <Form.Item
            label="Roles"
            extra="A haulier is a company we subcontract trucking to. A company can be both."
            validateStatus={roles.length === 0 ? "error" : undefined}
            help={roles.length === 0 ? "Choose at least one role" : undefined}
            className="!mb-3"
          >
            <Checkbox.Group options={CUSTOMER_ROLE_OPTIONS} value={roles} onChange={setRoles} disabled={isCreating} />
          </Form.Item>
        )}
      </Form>

      <div className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2.5 mb-4 text-[13px] text-slate-600">
        <InfoCircleOutlined aria-hidden className="text-indigo-500" />
        {fromRegistry
          ? "Company data will be retrieved from the Czech ARES registry."
          : "Please fill in the company details manually."}
      </div>

      {fromRegistry ? (
        <>
          <Form layout="vertical" requiredMark={false}>
            <Form.Item
              label={<RequiredLabel>Company name or IČO</RequiredLabel>}
              htmlFor={ICO_INPUT_ID}
              validateStatus={error ? "error" : undefined}
              help={error || nameSearchHelp}
            >
              <div className="flex gap-2">
                <AutoComplete
                  ref={queryInputRef}
                  id={ICO_INPUT_ID}
                  className="flex-1 min-w-0"
                  placeholder="e.g. Alza.cz or 27082440"
                  autoFocus
                  value={query}
                  options={nameOptions}
                  onChange={handleQueryChange}
                  onSelect={handleSelectCompany}
                  disabled={isCreating}
                  popupMatchSelectWidth
                  notFoundContent={nameSearch.isFetching ? "Searching ARES…" : undefined}
                  // Enter on a highlighted suggestion picks it (onSelect); otherwise it looks the IČO up.
                  onInputKeyDown={(e) => {
                    if (e.key === "Enter" && isIco) handleLookup();
                  }}
                />
                <Button
                  type="primary"
                  icon={<SearchOutlined />}
                  onClick={handleLookup}
                  loading={looking || nameSearch.isFetching}
                  disabled={!query.trim() || isCreating}
                >
                  Look up
                </Button>
              </div>
            </Form.Item>
          </Form>

          {preview && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 mb-2">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="inline-flex items-center gap-2 text-[13px] font-medium text-green-700">
                  <CheckCircleFilled aria-hidden className="text-green-600" />
                  Company found in ARES
                </span>
                <Button size="small" onClick={handleChangeCompany} disabled={isCreating}>
                  Change
                </Button>
              </div>
              <div className="text-[15px] font-semibold text-slate-800 mb-1">
                {preview.companyName || "—"}
              </div>
              <CustomerInfoRow label="IČO">
                <span className="font-mono">{preview.ico}</span>
              </CustomerInfoRow>
              <CustomerInfoRow label="DIČ (VAT ID)">{preview.dic}</CustomerInfoRow>
              <CustomerInfoRow label="Address">{preview.street}</CustomerInfoRow>
              <CustomerInfoRow label="City">{preview.postalCity || preview.city}</CustomerInfoRow>
              <CustomerInfoRow label="ZIP">{preview.postalCode}</CustomerInfoRow>
            </div>
          )}
        </>
      ) : (
        <Form form={manualForm} layout="vertical" requiredMark={false} disabled={isCreating}>
          <Form.Item
            name="companyName"
            label={<RequiredLabel>Company name</RequiredLabel>}
            rules={required("Company name is required")}
          >
            <Input autoFocus />
          </Form.Item>
          <Form.Item
            name="street"
            label={<RequiredLabel>Street address</RequiredLabel>}
            rules={required("Street address is required")}
          >
            <Input />
          </Form.Item>
          <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-x-4">
            <Form.Item
              name="city"
              label={<RequiredLabel>City</RequiredLabel>}
              rules={required("City is required")}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="postalCode"
              label={<RequiredLabel>ZIP / Postal code</RequiredLabel>}
              rules={required("ZIP / Postal code is required")}
            >
              <Input />
            </Form.Item>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <Form.Item name="registrationNumber" label="Registration number">
              <Input placeholder="e.g. HRB 12345" />
            </Form.Item>
            {/* Not required: a customer can be set up before its VAT ID is known. */}
            <Form.Item name="vatId" label="VAT ID">
              <Input placeholder="e.g. DE123456789" />
            </Form.Item>
          </div>
        </Form>
      )}

      {/* Every customer starts with somebody to talk to: the person becomes its main contact. A Czech company
          shows the section once it is found in ARES, so the person is entered for the right company. */}
      {(!fromRegistry || preview) && (
        <div className="border-t border-slate-200 pt-4 mt-2">
          <div className="text-sm font-semibold text-slate-800 mb-3">Contact person</div>
          <Form
            form={contactForm}
            layout="vertical"
            requiredMark={false}
            initialValues={NEW_CONTACT}
            disabled={isCreating}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              <Form.Item
                name="firstName"
                label={<RequiredLabel>First name</RequiredLabel>}
                rules={required("First name is required")}
              >
                <Input placeholder="Enter first name" />
              </Form.Item>
              <Form.Item
                name="lastName"
                label={<RequiredLabel>Last name</RequiredLabel>}
                rules={required("Last name is required")}
              >
                <Input placeholder="Enter last name" />
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
                    validator: (_, value?: string) =>
                      value?.trim() || getFieldValue("phone")
                        ? Promise.resolve()
                        : Promise.reject(new Error("Enter an email or a phone number")),
                  }),
                ]}
              >
                <Input placeholder="name@company.com" />
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
                {
                  validator: (_, value?: string) =>
                    !value || isPossiblePhone(value)
                      ? Promise.resolve()
                      : Promise.reject(new Error("Enter a valid phone number")),
                },
              ]}
            >
              <ContactPhoneInput defaultCountry={country} />
            </Form.Item>
          </Form>
        </div>
      )}
    </Modal>
  );
}

// A label with the red asterisk after it, as in the other dialogs of the section.
function RequiredLabel({ children }: { children: string }) {
  return (
    <>
      {children}
      <span className="ml-1 text-red-500">*</span>
    </>
  );
}
