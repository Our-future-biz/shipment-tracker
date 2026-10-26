"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { Alert, AutoComplete, Button, DatePicker, Form, Input, Select } from "antd";
import { useAuth } from "@/lib/auth/AuthContext";
import { useCustomers } from "@/hooks/useCustomers";
import { useDebounced } from "@/hooks/useDebounced";
import type { FollowupTask } from "@/hooks/useFollowupTasks";
import { useUsers } from "@/hooks/useUsers";
import { QuotePicker, type PickedQuote } from "./QuotePicker";
import { SalesDialog } from "./SalesDialog";
import { matchesUserOption, userIdOptions, UserOptionLabel } from "../_lib/userOptions";

// What a task can be (TASK_TYPES in the API's followupTask.utils.ts).
const TASK_TYPES = ["Call", "Email", "Visit"] as const;
type TaskType = (typeof TASK_TYPES)[number];

/** Everything the dialog says about a task, as the API takes it. */
export interface TaskFields {
  type: TaskType;
  note: string;
  /** YYYY-MM-DD. */
  dueDate: string | null;
  assigneeUserId: string | null;
  customerId: string | null;
  customerLabel: string;
  contact: string;
  quoteNumber: string | null;
}

// The company a task is about: a customer of the Customer Database - the task then links to its
// page - or just a name.
interface TaskCustomer {
  id: string | null;
  label: string;
}

// The server searches from this many characters on: one letter would match most of the database.
const MIN_SEARCH_LENGTH = 2;

// How many customers the field offers at a time.
const CUSTOMER_LIMIT = 20;

interface CustomerFieldProps {
  value: TaskCustomer;
  onChange: (customer: TaskCustomer) => void;
}

// The company of a task, typed. The server looks what is typed up in the Customer Database (name,
// IČO, DIČ, city); picking one of the customers it finds links the task to that customer. A name
// that is only typed stays text - a company that is not a customer yet can have a task too - and
// typing over a picked customer unlinks it, so the link never names another company than the text.
function CustomerField({ value, onChange }: CustomerFieldProps) {
  const wanted = value.label.trim();
  // The request waits until typing pauses. A picked customer is not looked up again.
  const search = useDebounced(value.label, 300).trim();
  const searching = value.id === null && search.length >= MIN_SEARCH_LENGTH;
  const { customers, isFetching, isError } = useCustomers({ search }, { enabled: searching });
  // Only the answer to what is typed is listed. Until it is here the hook still holds what it
  // had last - an earlier search, or before the first one the whole Customer Database, left
  // behind by the Customers page - and a customer picked from that need not be one that was
  // looked for.
  const answered = searching && search === wanted && !isFetching;
  const found = answered ? customers.slice(0, CUSTOMER_LIMIT) : [];

  let hint = "";
  if (value.id) hint = "Linked to this customer in the Customer Database.";
  else if (searching && isError) hint = "The Customer Database could not be searched - the name is kept as typed.";
  else if (value.label.trim()) hint = "Kept as typed. Pick a customer from the list to link the task to it.";

  return (
    <Form.Item label="Customer" extra={hint && <span className={value.id ? "text-green-600" : undefined}>{hint}</span>}>
      <AutoComplete
        allowClear
        className="w-full"
        placeholder="Type a company name…"
        // The server has already searched; filtering again here would hide what it found by IČO or city.
        filterOption={false}
        value={value.label}
        // Text names no customer record, whatever it reads; only a pick from the list does. antd
        // reports a pick after the change of text the pick makes, so the link is what is left.
        onChange={(label: string | undefined) => onChange({ id: null, label: label ?? "" })}
        onSelect={(_, picked) => onChange({ id: picked.value, label: picked.name })}
        // An option goes by the customer's id: antd finds the picked one by its value, and two
        // customers can carry the same name - by the name the last of them would be linked,
        // whichever was picked.
        options={found.map((customer) => ({
          value: customer.id,
          name: customer.companyName,
          label: (
            <span>
              {customer.companyName}
              <span className="ml-2 text-xs text-slate-400">{[customer.city, customer.ico].filter(Boolean).join(" · ")}</span>
            </span>
          ),
        }))}
      />
    </Form.Item>
  );
}

interface FollowUpTaskDialogProps {
  task: FollowupTask | null;
  onSave: (fields: TaskFields) => Promise<string | null>;
  onClose: () => void;
}

// The dialog a follow-up task is added and edited in: `task` is the one being edited, null for a
// new one, which starts assigned to whoever is signed in. `onSave` asks the server and resolves
// with why it refused - a sentence that finishes "Task not saved - …" - or with null once the task
// is stored; a refusal is shown here, with everything that was entered still there. It queries
// while mounted: render it only while it is open.
export function FollowUpTaskDialog({
  task,
  onSave,
  onClose,
}: FollowUpTaskDialogProps) {
  const { user } = useAuth();
  const { users } = useUsers();
  const [type, setType] = useState<TaskType>(TASK_TYPES.find((known) => known === task?.type) ?? "Call");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? null);
  const [assigneeUserId, setAssigneeUserId] = useState(task ? task.assigneeUserId : (user?.id ?? null));
  const [customer, setCustomer] = useState<TaskCustomer>({ id: task?.customerId ?? null, label: task?.customerLabel ?? "" });
  const [contact, setContact] = useState(task?.contact ?? "");
  // A task keeps only the reference of its quote.
  const [quote, setQuote] = useState<PickedQuote | null>(task?.quoteNumber ? { quoteNumber: task.quoteNumber } : null);
  const [note, setNote] = useState(task?.note ?? "");
  // The request is on its way: the dialog waits for the server's answer.
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  // The company's users by e-mail, as a person is shown everywhere; found by name or e-mail.
  const userOptions = userIdOptions(users);
  // The assignee stays selectable while the users load, and when they are no longer among them: a
  // task keeps a colleague who has left the company until it is handed to somebody else.
  if (assigneeUserId && !users.some((u) => u.id === assigneeUserId)) {
    const email = assigneeUserId === user?.id ? user.email : task?.assigneeName;
    userOptions.unshift({ value: assigneeUserId, label: email || "Unknown user" });
  }

  // A task that names no company, no quote and says nothing is a tick box about nothing.
  const blank = !customer.label.trim() && !quote && !note.trim();

  const save = async () => {
    setSaving(true);
    setRefusal(null);
    const refused = await onSave({
      type,
      note: note.trim(),
      dueDate,
      assigneeUserId,
      customerId: customer.id,
      customerLabel: customer.label.trim(),
      contact: contact.trim(),
      quoteNumber: quote?.quoteNumber ?? null,
    });
    setSaving(false);
    if (refused) setRefusal(refused);
    else onClose();
  };

  return (
    <SalesDialog
      open
      onClose={onClose}
      busy={saving}
      title={task ? "Edit follow-up task" : "Add follow-up task"}
      footer={
        <>
          <Button disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="primary" disabled={blank} loading={saving} onClick={save}>
            {task ? "Save" : "Add"}
          </Button>
        </>
      }
    >
      {refusal && (
        <div className="mb-4">
          <Alert type="error" showIcon message={`Task not saved - ${refusal}`} />
        </div>
      )}
      <Form layout="vertical" disabled={saving}>
        <div className="grid grid-cols-2 gap-x-3">
          <Form.Item label="Type">
            <Select className="w-full" value={type} onChange={setType} options={TASK_TYPES.map((t) => ({ value: t, label: t }))} />
          </Form.Item>
          <Form.Item label="Due date">
            <DatePicker
              className="w-full"
              // Shown in the app's date format; the task keeps the day as YYYY-MM-DD.
              format="DD.MM.YYYY"
              placeholder="No due date"
              value={dueDate ? dayjs(dueDate) : null}
              onChange={(day) => setDueDate(day ? day.format("YYYY-MM-DD") : null)}
            />
          </Form.Item>
        </div>
        <CustomerField value={customer} onChange={setCustomer} />
        <div className="grid grid-cols-2 gap-x-3">
          <Form.Item label="Contact">
            <Input placeholder="Who to talk to" value={contact} onChange={(e) => setContact(e.target.value)} />
          </Form.Item>
          <Form.Item label="Assignee">
            <Select
              showSearch
              allowClear
              className="w-full"
              placeholder="Nobody"
              filterOption={matchesUserOption}
              optionRender={(option) => <UserOptionLabel label={option.label} name={option.data.name} />}
              value={assigneeUserId ?? undefined}
              onChange={(id?: string) => setAssigneeUserId(id ?? null)}
              options={userOptions}
            />
          </Form.Item>
        </div>
        <Form.Item label="Quote">
          <QuotePicker value={quote} onChange={setQuote} />
        </Form.Item>
        <Form.Item
          label="Note"
          className="!mb-0"
          extra={blank && "Name a customer or a quote, or write a note, to say what the task is about."}
        >
          <Input.TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Form.Item>
      </Form>
    </SalesDialog>
  );
}
