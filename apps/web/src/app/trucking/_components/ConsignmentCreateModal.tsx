"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Modal, Segmented } from "antd";
import { api, apiErrorMessage } from "@/lib/api";
import { businessToday } from "@/lib/date";
import { useToast } from "@/lib/toast";
import type { CustomerSiteItem } from "@/hooks/useCustomerSites";
import type { ShipmentItem } from "@/hooks/useShipments";
import { useCreateConsignment } from "@/hooks/useTruckingConsignments";
import { QuotePicker } from "@/app/sales/_components/QuotePicker";
import type { SalesQuote } from "@/app/sales/_lib/salesQuote";
import { ShipmentPicker } from "@/app/sales/quote/[ref]/_components/CopyFromModal";
import {
  SOURCE_OPTIONS,
  consignmentFormProblems,
  emptyConsignmentForm,
  formFromQuote,
  formFromShipment,
  toCreateRequest,
  type ConsignmentForm,
  type ConsignmentSource,
} from "../_lib/consignmentForm";
import { ConsignmentFormFields } from "./ConsignmentFormFields";
import { TruckingCustomerSelect } from "./TruckingCustomerSelect";
import { TruckingField } from "./TruckingField";

interface ConsignmentCreateModalProps {
  /** A job to book on (Shipments → Trucking → Order trucking): the source is fixed to it. */
  shipment?: ShipmentItem;
  onClose: () => void;
  onCreated: (consignmentId: string) => void;
}

const loadSites = async (customerId: string | null | undefined): Promise<CustomerSiteItem[]> => {
  if (!customerId) return [];
  try {
    return (await api.customers.customerSiteList(customerId)).data;
  } catch {
    // Without the sites the stops are typed; nothing is lost.
    return [];
  }
};

// "Create new" consignment: from a job (its customer and stops), from a quote (its road transport
// and price) or a new domestic order (a Road job is created for it). Rendered only while open, so
// every opening starts anew.
export const ConsignmentCreateModal = ({ shipment, onClose, onCreated }: ConsignmentCreateModalProps) => {
  const toast = useToast();
  const today = businessToday();
  const { create, isCreating } = useCreateConsignment();
  const [form, setForm] = useState<ConsignmentForm>(() => (shipment ? formFromShipment(shipment, [], today) : emptyConsignmentForm("job", today)));
  const [pickedShipment, setPickedShipment] = useState<ShipmentItem | null>(shipment ?? null);
  const [pickedQuote, setPickedQuote] = useState<SalesQuote | null>(null);
  const [prefilling, setPrefilling] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const problems = useMemo(() => consignmentFormProblems(form), [form]);

  const applyShipment = async (s: ShipmentItem | null) => {
    setPickedShipment(s);
    if (!s) {
      setForm(emptyConsignmentForm("job", today));
      return;
    }
    setPrefilling(true);
    setForm(formFromShipment(s, await loadSites(s.customerId), today));
    setPrefilling(false);
  };

  // A job handed in fills its stops from the customer's sites once they are read.
  useEffect(() => {
    if (shipment) void applyShipment(shipment);
    // Once, for the job the dialog was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyQuote = async (q: SalesQuote | null) => {
    setPickedQuote(q);
    if (!q) {
      setForm(emptyConsignmentForm("quote", today));
      return;
    }
    setPrefilling(true);
    const next = formFromQuote(q.quoteNumber, q.data, await loadSites(q.data.customerId), today);
    // A won quote has its job already; the consignment goes on it.
    setForm({ ...next, shipmentId: q.shipmentId ?? null, jobNumber: q.shipmentJobNumber ?? "" });
    setPrefilling(false);
  };

  const handleSource = (source: ConsignmentSource) => {
    setPickedShipment(null);
    setPickedQuote(null);
    setRefusal(null);
    setForm(emptyConsignmentForm(source, today));
  };

  const handleCreate = async () => {
    setRefusal(null);
    try {
      const res = await create(toCreateRequest(form));
      const c = res.consignment;
      if (c.belowFloor && !c.marginApproved) toast.warning(`${c.ref} saved below the margin floor — a manager must approve it before the transport order goes out`);
      else toast.success(`${c.ref} booked on job ${c.jobNumber}`);
      onCreated(c.id);
      onClose();
    } catch (e) {
      setRefusal(`Not created — ${apiErrorMessage(e)}.`);
    }
  };

  const ready = form.source === "new" ? !!form.customerId : form.source === "job" ? !!pickedShipment : !!pickedQuote;
  let jobLine = "";
  if (form.source === "new") jobLine = "A Road job is created in Shipments for this order.";
  else if (form.shipmentId) jobLine = `Booked on job ${form.jobNumber}.`;
  else if (pickedQuote) jobLine = "The quote has no job yet: a Road job is created in Shipments for it.";

  return (
    <Modal open title="Create consignment" width={1080} onCancel={isCreating ? undefined : onClose} maskClosable={false} footer={null} destroyOnHidden>
      <div className="flex flex-col gap-4">
        {!shipment && <Segmented<ConsignmentSource> block options={SOURCE_OPTIONS} value={form.source} onChange={handleSource} />}

        {form.source === "job" && !shipment && (
          <TruckingField label="Job">
            <ShipmentPicker value={pickedShipment} onChange={(s) => void applyShipment(s)} />
          </TruckingField>
        )}
        {form.source === "quote" && (
          <TruckingField label="Quote" hint="Its road transport, customer and price are taken; the server checks it is priced, of this customer and not lost">
            <QuotePicker value={pickedQuote} onChange={(q) => void applyQuote(q)} />
          </TruckingField>
        )}
        {form.source === "new" && (
          <TruckingField label="Customer">
            <TruckingCustomerSelect
              ariaLabel="Customer"
              value={form.customerId}
              valueName={form.customerName}
              onChange={(customerId, customerName) => setForm({ ...form, customerId, customerName })}
            />
          </TruckingField>
        )}

        {ready && (
          <>
            <div className="text-[13px] text-slate-600">
              {form.customerName && (
                <span>
                  Customer <b>{form.customerName}</b> ·{" "}
                </span>
              )}
              {jobLine}
            </div>
            {pickedQuote && !pickedQuote.data.roadPricing && (
              <Alert type="info" showIcon message={`${pickedQuote.quoteNumber} was not priced from the tariff: the price comes from the tariff now, or type an agreed price.`} />
            )}
            <div className={prefilling ? "pointer-events-none opacity-60" : undefined}>
              <ConsignmentFormFields form={form} onChange={setForm} />
            </div>
          </>
        )}

        {ready && problems.length > 0 && (
          <div className="text-[12px] text-amber-700">
            <span className="font-semibold">Still needed: </span>
            {problems.join(" · ")}
          </div>
        )}
        {refusal && <Alert type="error" showIcon message={refusal} />}

        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button type="primary" onClick={handleCreate} loading={isCreating} disabled={!ready || prefilling || problems.length > 0}>
            Create consignment
          </Button>
        </div>
      </div>
    </Modal>
  );
};
