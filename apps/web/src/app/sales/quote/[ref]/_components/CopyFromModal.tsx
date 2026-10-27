"use client";

import { useState, useMemo, type ReactNode } from "react";
import { Select, Checkbox, Button, Form } from "antd";
import type { SalesQuoteData } from "@/app/sales/_lib/types";
import type { SalesQuote } from "@/app/sales/_lib/salesQuote";
import { useQuoteCustomerFields } from "@/hooks/useQuoteCustomerFields";
import { SECTIONS, hasSection, pickCarried, pickSections, type SectionKey } from "@/app/sales/_lib/quoteSections";
import { QuotePicker } from "@/app/sales/_components/QuotePicker";
import { SalesDialog } from "@/app/sales/_components/SalesDialog";
import { shipmentToQuoteData } from "@/app/shipments/_components/quoteToShipment";
import { useDebounced } from "@/hooks/useDebounced";
import { useShipments, type ShipmentItem } from "@/hooks/useShipments";

// Sections that can be sourced from a shipment (shipments carry no pricing/terms).
const SHIPMENT_SECTIONS = SECTIONS.filter((s) => s.key !== "pricing" && s.key !== "terms");

// A shipment as the fields of a quote: only what it carries, its Customer's PIC also by the id of
// the contact it names (so the quote keeps the same person, not one of the same name).
function shipmentCarried(shipment: ShipmentItem): SalesQuoteData {
  const carried = shipmentToQuoteData(shipment);
  const contactId = shipment.customerPicContactId;
  return carried.customerId && carried.customerContact && contactId && carried.customerContactId === undefined
    ? { ...carried, customerContactId: contactId }
    : carried;
}

// A shipment in one line of plain text: what a row of the list says in full when it is too long
// to fit, as its tooltip.
const shipmentText = (shipment: ShipmentItem) => `${shipment.jobNumber} — ${shipment.customer}`;

// A shipment as the picker shows it, in its list and in its box: the job number as the app prints
// references, then whose shipment it is.
const shipmentLabel = (shipment: ShipmentItem) => (
  <>
    <span className="font-mono font-semibold">{shipment.jobNumber}</span>
    {shipment.customer && <span className="ml-2">{shipment.customer}</span>}
  </>
);

interface ShipmentPickerProps {
  value: ShipmentItem | null;
  onChange: (shipment: ShipmentItem | null) => void;
}

// Picks one shipment out of all the company has. The server looks for what is typed - in the job
// number, the parties and the ports, as on the Shipments page - so an old shipment can be found
// too; the list itself holds the newest that match and says when there are more.
export function ShipmentPicker({ value, onChange }: ShipmentPickerProps) {
  const [typed, setTyped] = useState("");
  // The request waits until typing pauses.
  const search = useDebounced(typed, 300);
  const { shipments, total, isLoading, isError } = useShipments({ search });

  let emptyText = "No shipments match";
  if (isLoading) emptyText = "Searching…";
  if (isError) emptyText = "Could not load shipments";

  return (
    <Select
      showSearch
      allowClear
      labelInValue
      className="w-full"
      placeholder="Search by job number, customer or port…"
      // The server has already searched, also in fields the label does not show.
      filterOption={false}
      onSearch={setTyped}
      // The box empties itself when the list closes; the search has to go with it.
      onOpenChange={(open) => !open && setTyped("")}
      loading={isLoading}
      value={value ? { value: value.id, label: shipmentLabel(value) } : undefined}
      onChange={(picked?: { value: string; label: ReactNode }) => onChange(shipments.find((shipment) => shipment.id === picked?.value) ?? null)}
      options={shipments.map((shipment) => ({ value: shipment.id, label: shipmentLabel(shipment), title: shipmentText(shipment) }))}
      notFoundContent={emptyText}
      popupRender={(menu) => (
        <>
          {menu}
          {total > shipments.length && (
            <div className="border-t border-slate-100 px-3 py-1.5 text-xs text-slate-400">
              Showing the newest {shipments.length} of {total.toLocaleString("en-US")} - type to find another.
            </div>
          )}
        </>
      )}
    />
  );
}

interface CopyFromModalProps {
  open: boolean;
  mode: "quote" | "shipment";
  currentRef: string;
  onClose: () => void;
  onApply: (patch: Partial<SalesQuoteData>) => void;
}

export function CopyFromModal({ open, mode, currentRef, onClose, onApply }: CopyFromModalProps) {
  // What a shipment carries of its customer, completed from the Customer Database where linked;
  // a contact person copied from another quote, checked against the customer's contacts.
  const { withCustomerRecord, withLiveContact } = useQuoteCustomerFields();
  // What is copied from: the quote or the shipment picked, whole, as the picker found it.
  const [sourceQuote, setSourceQuote] = useState<SalesQuote | null>(null);
  const [sourceShipment, setSourceShipment] = useState<ShipmentItem | null>(null);
  // The sections the user took the tick off. Every other section on offer is copied.
  const [unticked, setUnticked] = useState<SectionKey[]>([]);
  // The shipment's customer is being read from the Customer Database.
  const [copying, setCopying] = useState(false);

  const fromShipment = mode === "shipment";
  const sections = fromShipment ? SHIPMENT_SECTIONS : SECTIONS;

  // The picked shipment as the fields of a quote: only what it carries.
  const carried = useMemo(() => (sourceShipment ? shipmentCarried(sourceShipment) : null), [sourceShipment]);

  // A section the picked shipment has nothing for is not on offer. A quote is copied section by
  // section as it is, so all of its sections are.
  const offered = sections.filter((section) => !carried || hasSection(carried, section.key)).map((section) => section.key);
  const ticked = offered.filter((key) => !unticked.includes(key));
  const hasSource = fromShipment ? !!carried : !!sourceQuote;

  const reset = () => {
    setSourceQuote(null);
    setSourceShipment(null);
    setUnticked([]);
    setCopying(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // A tick put on or taken off. What was decided about a section that is not on offer just now
  // is kept for the next shipment picked.
  const handleTick = (values: SectionKey[]) =>
    setUnticked(SECTIONS.map((s) => s.key).filter((key) => (offered.includes(key) ? !values.includes(key) : unticked.includes(key))));

  const handleCopy = async () => {
    if (fromShipment) {
      if (!carried) return;
      // The customer is read from the Customer Database first, and the dialog waits for it.
      setCopying(true);
      const source = ticked.includes("customer") ? await withCustomerRecord(carried) : carried;
      onApply(pickCarried(source, ticked));
    } else {
      if (!sourceQuote) return;
      const patch = pickSections(sourceQuote.data, ticked);
      // The contact's link is checked with the Customer Database first, and the dialog waits for it.
      setCopying(true);
      onApply(ticked.includes("customer") ? await withLiveContact(patch) : patch);
    }
    reset();
    onClose();
  };

  return (
    <SalesDialog
      open={open}
      onClose={handleClose}
      // The copy is on its way into the quote: closing would not stop it.
      busy={copying}
      title={fromShipment ? "Copy from a shipment" : "Copy from another quote"}
      footer={
        <>
          <Button onClick={handleClose} disabled={copying}>
            Cancel
          </Button>
          {/* Nothing to copy until there is a source and a section of it. */}
          <Button type="primary" loading={copying} disabled={!hasSource || ticked.length === 0} onClick={handleCopy}>
            Copy selected
          </Button>
        </>
      }
    >
      <Form layout="vertical" disabled={copying}>
        {fromShipment ? (
          <Form.Item label="Source shipment" extra="Pricing and shipping terms are not copied from shipments.">
            <ShipmentPicker value={sourceShipment} onChange={setSourceShipment} />
          </Form.Item>
        ) : (
          <Form.Item label="Source quote">
            <QuotePicker value={sourceQuote} onChange={setSourceQuote} exclude={currentRef} />
          </Form.Item>
        )}
        <Form.Item
          label="Sections to copy"
          className="!mb-0"
          // A quote's section is taken whole. A shipment knows only part of a section, and what
          // it does not know stays on the quote.
          extra={
            fromShipment
              ? "Ticked sections replace what this quote holds now, except where the shipment has no value."
              : "Ticked sections replace what this quote holds now."
          }
        >
          <Checkbox.Group value={ticked} onChange={(values) => handleTick(values as SectionKey[])}>
            <div className="flex flex-col gap-1">
              {sections.map((section) => {
                const empty = !offered.includes(section.key);
                return (
                  // A tick box told whether it is disabled no longer asks the form, so it is told both.
                  <Checkbox key={section.key} value={section.key} disabled={empty || copying}>
                    {section.label}
                    {empty && <span className="text-slate-400"> - nothing on this shipment</span>}
                  </Checkbox>
                );
              })}
            </div>
          </Checkbox.Group>
        </Form.Item>
      </Form>
    </SalesDialog>
  );
}
