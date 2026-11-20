"use client";

import { Form, Input, Radio, Select, type FormInstance } from "antd";
import type { interfaces } from "@/lib/api/client";
import { CUSTOMS_OFFICES } from "@/lib/customsOffices";
import { foldIncludes } from "@/lib/fold";
import { HINT, LABEL_TEXT } from "@/styles/ui";
import { ACCOUNT_FORMAT_PROBLEM, accountQuestions, isAccountNumber } from "./importAccount";

export type ImportAnswers = interfaces.ImportInstructionAnswers;

const need = (message: string) => [{ required: true, whitespace: true, message }];

// As the server refuses it: a Czech account or an IBAN, nothing else.
const ACCOUNT_RULES = [
  ...need("Fill in the account number"),
  { validator: (_: unknown, value?: string) => (!value?.trim() || isAccountNumber(value) ? Promise.resolve() : Promise.reject(new Error(ACCOUNT_FORMAT_PROBLEM))) },
];

// The offices of Shipments → Customs: a T1 office is picked from them, never typed.
const OFFICE_OPTIONS = CUSTOMS_OFFICES.map((office) => ({ value: office, label: office }));
const filterOffice = (input: string, option?: { label?: string }) => foldIncludes(option?.label ?? "", input);

/** The mark of a required answer, as antd puts it before a label. */
export const REQUIRED_MARK = "*";

function Section({ title, hint, required = false, children }: { title: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <section className="border-t border-slate-200 pt-3 mt-3 first:border-t-0 first:pt-0 first:mt-0">
      <h2 className={`m-0 mb-2 ${LABEL_TEXT}`}>
        {required && (
          <span aria-hidden className="mr-1 text-red-500">
            {REQUIRED_MARK}
          </span>
        )}
        {title}
        {required && <span className="sr-only"> (required)</span>}
      </h2>
      {hint && <p className={`${HINT} mt-0 mb-2`}>{hint}</p>}
      {children}
    </section>
  );
}

/**
 * Whether the three classification questions must be answered: we classify the goods from them when
 * no tariff code is given, unless the customer clears customs itself or through its own broker (as the
 * server's answersProblem holds to).
 */
export const needsClassification = (procedure: ImportAnswers["procedure"] | undefined, tariffCode: string | undefined): boolean =>
  !tariffCode?.trim() && procedure !== "own_broker";

// Sections 2-6 of the paper form, inside an antd Form: the customer's page and the preview in Warehouse.
// `markRequired`: the section titles of required answers carry the mark the labelled ones get from
// the form (the customer's page; user council E11: required fields carried no mark).
export function ImportInstructionsFields({ form, markRequired = false }: { form: FormInstance<ImportAnswers>; markRequired?: boolean }) {
  const procedure = Form.useWatch("procedure", form);
  const dutyPaidBy = Form.useWatch("dutyPaidBy", form);
  const bank = Form.useWatch("bank", form);
  const accountNumber = Form.useWatch("accountNumber", form);
  const tariffCode = Form.useWatch("tariffCode", form);
  const needsAnswers = needsClassification(procedure, tariffCode);
  const { asksAccount, mustSayWhoPays } = accountQuestions(dutyPaidBy, bank, accountNumber);
  // Checked again whenever the tariff code or the procedure changes: an error shown while both were
  // empty goes once a code is typed (user council E11).
  const classifyRules = needsAnswers ? need("Without a tariff code this is needed") : [];
  const classifyDependencies = ["tariffCode", "procedure"];

  return (
    <>
      <Section title="2. Please clear the goods through customs under the following procedure" required={markRequired}>
        <Form.Item name="procedure" rules={[{ required: true, message: "Choose the customs procedure" }]} className="!mb-2">
          <Radio.Group className="flex flex-col gap-1">
            <Radio value="free_circulation">a) Release for free circulation (SAD)</Radio>
            <Radio value="t1">b) T1 transit</Radio>
            <Radio value="other">c) Customs warehousing (SAD) or another procedure</Radio>
            <Radio value="own_broker">d) We clear the goods through customs ourselves or through our own broker</Radio>
          </Radio.Group>
        </Form.Item>
        {procedure === "free_circulation" && (
          <>
            <Form.Item name="dutyPaidBy" label="Duty and VAT paid by" rules={mustSayWhoPays ? [{ required: true, message: "Say who pays the duty and VAT" }] : undefined} className="!mb-2">
              <Radio.Group className="flex flex-col gap-1">
                <Radio value="us">Us, invoiced to you</Radio>
                <Radio value="own_account">From your own account</Radio>
              </Radio.Group>
            </Form.Item>
            {asksAccount && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                  <Form.Item name="bank" label="Bank" rules={need("Fill in the bank")} className="!mb-1">
                    <Input maxLength={200} />
                  </Form.Item>
                  <Form.Item name="accountNumber" label="Account number" rules={dutyPaidBy === "own_account" ? ACCOUNT_RULES : need("Fill in the account number")} className="!mb-1">
                    <Input maxLength={100} placeholder="e.g. 19-2000145399/0800 or IBAN" />
                  </Form.Item>
                </div>
                <p className={`${HINT} mt-0 mb-2`}>Your company&apos;s account that the duty and VAT are paid from.</p>
              </>
            )}
          </>
        )}
        {procedure === "t1" && (
          <Form.Item name="t1Office" label="Customs office of destination where the goods will be presented" rules={need("Choose the customs office")}>
            <Select showSearch placeholder="Select customs office" options={OFFICE_OPTIONS} filterOption={filterOffice} />
          </Form.Item>
        )}
        {procedure === "other" && (
          <Form.Item name="otherProcedure" label="Which procedure?">
            <Input maxLength={300} />
          </Form.Item>
        )}
        {procedure === "own_broker" && (
          <Form.Item name="otherProcedure" label="Your customs broker (optional)" extra="We hand the goods over for clearance; the tariff code and the questions in section 4 are not needed.">
            <Input maxLength={300} placeholder="Company name and contact" />
          </Form.Item>
        )}
      </Section>

      <Section
        title="3. Customs tariff code (Combined Nomenclature)"
        hint="This code is available if your goods have previously been released by customs under a customs procedure (see box 33 of the SAD), or may be provided by your overseas partner. If left blank, we will classify the goods using section 4, without any guarantee."
      >
        <Form.Item name="tariffCode" className="!mb-2">
          <Input maxLength={50} />
        </Form.Item>
      </Section>

      <Section title="4. Detailed description of the goods" required={markRequired}>
        <Form.Item name="description" rules={need("Describe the goods")}>
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} maxLength={2000} />
        </Form.Item>
        <p className={`${HINT} mt-0 mb-2`}>If you do not know the Combined Nomenclature code, the goods will be classified using your description. Please answer the following questions to enable correct classification:</p>
        <Form.Item name="whatIsIt" label="What is it? (basic characteristics of the goods)" dependencies={classifyDependencies} rules={classifyRules}>
          <Input maxLength={500} />
        </Form.Item>
        <Form.Item name="madeOf" label="What is it made of? (material from which the goods are manufactured)" dependencies={classifyDependencies} rules={classifyRules}>
          <Input maxLength={500} />
        </Form.Item>
        <Form.Item name="usedFor" label="What is it used for? (purpose and function of the goods)" dependencies={classifyDependencies} rules={classifyRules}>
          <Input maxLength={500} />
        </Form.Item>
      </Section>

      <Section title="5. Delivery address" hint="Only if delivery by our vehicle is required.">
        <Form.Item name="deliveryAddress">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={500} />
        </Form.Item>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <Form.Item name="deliveryContact" label="Contact person">
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="deliveryPhone" label="Telephone">
            <Input maxLength={50} />
          </Form.Item>
        </div>
        <Form.Item name="deliveryNotes" label="Delivery time window and unloading notes">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={500} placeholder="e.g. Mon–Fri 08:00–14:00, ramp 3, call 30 minutes ahead" />
        </Form.Item>
      </Section>

      <Section title="6. Billing address" required={markRequired}>
        <Form.Item name="billingAddress" rules={need("Fill in the billing address")}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={500} />
        </Form.Item>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4">
          <Form.Item name="eori" label="EORI">
            <Input maxLength={30} />
          </Form.Item>
          <Form.Item name="companyId" label="Company ID">
            <Input maxLength={50} />
          </Form.Item>
          <Form.Item name="vatId" label="VAT ID">
            <Input maxLength={30} />
          </Form.Item>
        </div>
      </Section>

      <Section title="Completed by">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <Form.Item name="name" label="Name" rules={need("Fill in your name")}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="telephone" label="Telephone" rules={need("Fill in your telephone")}>
            <Input maxLength={50} />
          </Form.Item>
        </div>
      </Section>
    </>
  );
}

/** Every answer as a string, what was left out empty: the API takes them all. */
export function completeAnswers(values: Partial<ImportAnswers>): ImportAnswers {
  const text = (key: keyof Omit<ImportAnswers, "procedure" | "dutyPaidBy">) => values[key] ?? "";
  return {
    procedure: values.procedure ?? "",
    dutyPaidBy: values.dutyPaidBy ?? "",
    bank: text("bank"),
    accountNumber: text("accountNumber"),
    t1Office: text("t1Office"),
    otherProcedure: text("otherProcedure"),
    tariffCode: text("tariffCode"),
    description: text("description"),
    whatIsIt: text("whatIsIt"),
    madeOf: text("madeOf"),
    usedFor: text("usedFor"),
    deliveryAddress: text("deliveryAddress"),
    deliveryContact: text("deliveryContact"),
    deliveryPhone: text("deliveryPhone"),
    deliveryNotes: text("deliveryNotes"),
    billingAddress: text("billingAddress"),
    eori: text("eori"),
    companyId: text("companyId"),
    vatId: text("vatId"),
    name: text("name"),
    telephone: text("telephone"),
  };
}
