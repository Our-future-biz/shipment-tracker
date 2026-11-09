"use client";

import { Form, Input, Radio, Select, type FormInstance } from "antd";
import type { interfaces } from "@/lib/api/client";
import { CUSTOMS_OFFICES } from "@/lib/customsOffices";
import { foldIncludes } from "@/lib/fold";
import { HINT, LABEL_TEXT } from "@/styles/ui";

export type ImportAnswers = interfaces.ImportInstructionAnswers;

const need = (message: string) => [{ required: true, whitespace: true, message }];

// The offices of Shipments → Customs: a T1 office is picked from them, never typed.
const OFFICE_OPTIONS = CUSTOMS_OFFICES.map((office) => ({ value: office, label: office }));
const filterOffice = (input: string, option?: { label?: string }) => foldIncludes(option?.label ?? "", input);

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-slate-200 pt-3 mt-3 first:border-t-0 first:pt-0 first:mt-0">
      <h2 className={`m-0 mb-2 ${LABEL_TEXT}`}>{title}</h2>
      {hint && <p className={`${HINT} mt-0 mb-2`}>{hint}</p>}
      {children}
    </section>
  );
}

// Sections 2-6 of the paper form, inside an antd Form: the customer's page and the preview in Warehouse.
export function ImportInstructionsFields({ form }: { form: FormInstance<ImportAnswers> }) {
  const procedure = Form.useWatch("procedure", form);
  const tariffCode = Form.useWatch("tariffCode", form);
  const needsAnswers = !tariffCode?.trim();

  return (
    <>
      <Section title="2. Please clear the goods through customs under the following procedure">
        <Form.Item name="procedure" rules={[{ required: true, message: "Choose the customs procedure" }]} className="!mb-2">
          <Radio.Group className="flex flex-col gap-1">
            <Radio value="free_circulation">a) Release for free circulation (SAD)</Radio>
            <Radio value="t1">b) T1 transit</Radio>
            <Radio value="other">c) Customs warehousing (SAD) or another procedure</Radio>
          </Radio.Group>
        </Form.Item>
        {procedure === "free_circulation" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <Form.Item name="bank" label="Bank" rules={need("Fill in the bank")}>
              <Input maxLength={200} />
            </Form.Item>
            <Form.Item name="accountNumber" label="Account number" rules={need("Fill in the account number")}>
              <Input maxLength={100} />
            </Form.Item>
          </div>
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
      </Section>

      <Section
        title="3. Customs tariff code (Combined Nomenclature)"
        hint="This code is available if your goods have previously been released by customs under a customs procedure (see box 33 of the SAD), or may be provided by your overseas partner. If left blank, we will classify the goods using section 4, without any guarantee."
      >
        <Form.Item name="tariffCode" className="!mb-2">
          <Input maxLength={50} />
        </Form.Item>
      </Section>

      <Section title="4. Detailed description of the goods">
        <Form.Item name="description" rules={need("Describe the goods")}>
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} maxLength={2000} />
        </Form.Item>
        <p className={`${HINT} mt-0 mb-2`}>If you do not know the Combined Nomenclature code, the goods will be classified using your description. Please answer the following questions to enable correct classification:</p>
        <Form.Item name="whatIsIt" label="What is it? (basic characteristics of the goods)" rules={needsAnswers ? need("Without a tariff code this is needed") : undefined}>
          <Input maxLength={500} />
        </Form.Item>
        <Form.Item name="madeOf" label="What is it made of? (material from which the goods are manufactured)" rules={needsAnswers ? need("Without a tariff code this is needed") : undefined}>
          <Input maxLength={500} />
        </Form.Item>
        <Form.Item name="usedFor" label="What is it used for? (purpose and function of the goods)" rules={needsAnswers ? need("Without a tariff code this is needed") : undefined}>
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
      </Section>

      <Section title="6. Billing address">
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
  const text = (key: keyof Omit<ImportAnswers, "procedure">) => values[key] ?? "";
  return {
    procedure: values.procedure ?? "",
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
    billingAddress: text("billingAddress"),
    eori: text("eori"),
    companyId: text("companyId"),
    vatId: text("vatId"),
    name: text("name"),
    telephone: text("telephone"),
  };
}
