"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Modal, Segmented } from "antd";
import { apiErrorMessage } from "@/lib/api";
import { businessToday } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { fetchCustomerSites, type CustomerSiteItem } from "@/hooks/useCustomerSites";
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

// "Create new" consignment: from a job (its customer and stops), from a quote (its road transport
// and price) or a new domestic order (a Road job is created for it). Rendered only while open, so
// every opening starts anew.
export const ConsignmentCreateModal = ({ shipment, onClose, onCreated }: ConsignmentCreateModalProps) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const today = businessToday();
  const { create, isCreating } = useCreateConsignment();
  const [form, setForm] = useState<ConsignmentForm>(() => (shipment ? formFromShipment(shipment, [], today) : emptyConsignmentForm("job", today)));
  const [pickedShipment, setPickedShipment] = useState<ShipmentItem | null>(shipment ?? null);
  const [pickedQuote, setPickedQuote] = useState<SalesQuote | null>(null);
  const [prefilling, setPrefilling] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const problems = useMemo(() => consignmentFormProblems(form), [form]);

  // Only the latest pick fills the form: a slow answer for an earlier pick is dropped.
  const pickSeq = useRef(0);

  // Without the sites the stops are typed by hand; the user is told, nothing is lost.
  const loadSites = useCallback(
    async (customerId: string | null | undefined): Promise<CustomerSiteItem[]> => {
      if (!customerId) return [];
      try {
        return (await fetchCustomerSites(queryClient, customerId)).data;
      } catch (e) {
        toast.warning(`The customer's sites could not be read — type the stops: ${apiErrorMessage(e)}`);
        return [];
      }
    },
    [queryClient, toast],
  );

  const applyShipment = useCallback(
    async (s: ShipmentItem | null) => {
      const seq = ++pickSeq.current;
      setPickedShipment(s);
      if (!s) {
        setForm(emptyConsignmentForm("job", today));
        return;
      }
      setPrefilling(true);
      const sites = await loadSites(s.customerId);
      if (seq !== pickSeq.current) return;
      setForm(formFromShipment(s, sites, today));
      setPrefilling(false);
    },
    [loadSites, today],
  );

  // A job handed in fills its stops from the customer's sites once they are read (once per opening).
  const prefilled = useRef(false);
  useEffect(() => {
    if (!shipment || prefilled.current) return;
    prefilled.current = true;
    void applyShipment(shipment);
  }, [shipment, applyShipment]);

  const applyQuote = async (q: SalesQuote | null) => {
    const seq = ++pickSeq.current;
    setPickedQuote(q);
    if (!q) {
      setForm(emptyConsignmentForm("quote", today));
      return;
    }
    setPrefilling(true);
    const sites = await loadSites(q.data.customerId);
    if (seq !== pickSeq.current) return;
    const next = formFromQuote(q.quoteNumber, q.data, sites, today);
    // A won quote has its job already; the consignment goes on it.
    setForm({ ...next, shipmentId: q.shipmentId ?? null, jobNumber: q.shipmentJobNumber ?? "" });
    setPrefilling(false);
  };

  const handleSource = (source: ConsignmentSource) => {
    pickSeq.current++;
    setPrefilling(false);
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
