"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Alert, Button, Form, Input, InputNumber, Modal, Select, Tag } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useToast } from "@/lib/toast";
import { errorMessage } from "@/app/warehouse-concept/gate-log/_lib/gate";
import { formatNumber } from "@/lib/number";
import { businessToday } from "@/lib/date";

// Shared pieces of the Warehouse module tabs (Containers, Dock & Yard, Reports):
// sub-tab pills, cards, KPI tiles, callouts, status tags and a record form.

export function SubTabs<K extends string>({ tabs, active, onChange }: { tabs: { key: K; label: string }[]; active: K; onChange: (key: K) => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(t.key)}
            className={[
              "flex items-center h-8 px-3 rounded-lg border text-[13px] font-medium transition-colors cursor-pointer",
              on ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
            ].join(" ")}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function Card({ title, extra, children, bodyClassName = "p-4" }: { title: ReactNode; extra?: ReactNode; children: ReactNode; bodyClassName?: string }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm min-w-0">
      <div className="px-4 py-2.5 flex items-center gap-2.5 bg-indigo-50 border-b border-indigo-100 rounded-t-xl">
        <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-wider m-0">{title}</h3>
        {extra && <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">{extra}</div>}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

const TONE_TEXT = { default: "text-slate-900", indigo: "text-indigo-600", green: "text-emerald-600", amber: "text-amber-600", red: "text-red-600" };

export function Kpi({ label, value, sub, tone = "default" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: keyof typeof TONE_TEXT }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 min-w-0">
      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={`mt-1 text-[26px] leading-tight font-bold ${TONE_TEXT[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

export function Callout({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 border-l-[3px] border-l-indigo-500 rounded-lg px-3.5 py-2.5 text-xs text-slate-600 leading-relaxed">
      {title && <b className="text-slate-800">{title} </b>}
      {children}
    </div>
  );
}

// Status → antd Tag colour.
export function StatusTag({ value, colors }: { value: string; colors: Record<string, string> }) {
  if (!value) return <span className="text-slate-300">—</span>;
  return (
    <Tag color={colors[value] ?? "default"} className="m-0 !text-[11px] !font-semibold">
      {value}
    </Tag>
  );
}

export const dim = (v: string | number | null | undefined) =>
  v === "" || v == null ? <span className="text-slate-300">—</span> : <span className="text-slate-600">{v}</span>;

export const nf = (v: number | null | undefined, d = 0) => formatNumber(v, d, "");

const DAY = 86_400_000;
// Today on the warehouse's calendar (Prague), as a day number.
const todayIndex = () => Math.floor(Date.parse(`${businessToday()}T00:00:00Z`) / DAY);

/** Days until a YYYY-MM-DD date (negative when past). */
export const daysUntil = (date: string) => (date ? Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY) - todayIndex() : null);

// Carrier detention expiry: red when passed, amber within 2 days, green otherwise.
export function ExpiryTag({ date }: { date: string }) {
  const d = daysUntil(date);
  if (d == null) return <span className="text-slate-300">—</span>;
  const color = d < 0 ? "red" : d <= 2 ? "orange" : "green";
  return (
    <Tag color={color} className="m-0 !text-[11px] !font-semibold">
      {date} · {d >= 0 ? `${d} d` : `${-d} d over`}
    </Tag>
  );
}

// ---------- bulk actions ----------

export type BulkResult<T> = { done: T[]; failed: { row: T; reason: string }[] };

// Runs one call per row and keeps going past failures, so the caller can say exactly
// how many went through and why the others did not.
export async function runBulk<T>(rows: T[], fn: (row: T) => Promise<unknown>): Promise<BulkResult<T>> {
  const settled = await Promise.allSettled(rows.map((r) => fn(r)));
  const result: BulkResult<T> = { done: [], failed: [] };
  settled.forEach((s, i) => {
    const row = rows[i]!;
    if (s.status === "fulfilled") result.done.push(row);
    else result.failed.push({ row, reason: errorMessage(s.reason, "failed") });
  });
  return result;
}

const plural = (n: number, [one, many]: [string, string]) => `${n} ${n === 1 ? one : many}`;

// "Deleted 4 bonded entries", or "3 done, 1 failed" with each failure and its reason.
export function reportBulk<T>(
  toast: ReturnType<typeof useToast>,
  result: BulkResult<T>,
  { verb, nouns, label }: { verb: string; nouns: [string, string]; label: (row: T) => string },
) {
  if (result.failed.length === 0) {
    toast.success(`${verb} ${plural(result.done.length, nouns)}`);
    return;
  }
  const shown = result.failed.slice(0, 5).map((f) => `${label(f.row) || "—"}: ${f.reason}`);
  if (result.failed.length > shown.length) shown.push(`… and ${result.failed.length - shown.length} more`);
  toast.notify({
    type: result.done.length ? "warning" : "error",
    title: `${result.done.length} done, ${result.failed.length} failed`,
    description: shown.join(" · "),
  });
}

// Bulk "Delete" for a grid selection: asks first, deletes row by row, reports partial results.
// The selection is cleared only when every row went; failed rows stay ticked to retry.
export function BulkDeleteButton<T>({
  rows,
  nouns,
  label,
  warning,
  remove,
  clear,
}: {
  rows: T[];
  nouns: [string, string];
  label: (row: T) => string;
  warning?: string;
  remove: (row: T) => Promise<unknown>;
  clear: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const result = await runBulk(rows, remove);
    setBusy(false);
    setOpen(false);
    reportBulk(toast, result, { verb: "Deleted", nouns, label });
    if (result.failed.length === 0) clear();
  };
  return (
    <>
      <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setOpen(true)}>
        Delete
      </Button>
      <ConfirmModal
        open={open}
        onClose={() => !busy && setOpen(false)}
        onConfirm={run}
        title={`Delete ${plural(rows.length, nouns)}?`}
        description={`${warning ? `${warning} ` : ""}This cannot be undone from here.`}
        confirmLabel="Delete"
        danger
        loading={busy}
      />
    </>
  );
}

// ---------- record form ----------

export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "time" | "datetime" | "select" | "textarea";
  options?: string[] | { value: string; label: string }[];
  required?: boolean;
  full?: boolean;
  step?: number;
  placeholder?: string;
  section?: string;
};

// Create / edit form for a warehouse record, laid out in two columns with optional sections.
export function RecordFormModal<V extends object>({
  open,
  title,
  fields,
  initial,
  saving,
  onCancel,
  onSubmit,
  onDelete,
  okText = "Save",
  onValuesChange,
  note,
}: {
  open: boolean;
  title: string;
  fields: FieldDef[];
  initial?: Partial<V>;
  saving?: boolean;
  onCancel: () => void;
  onSubmit: (values: V) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
  okText?: string;
  /** A field changed: may fill in others (e.g. a dock slot's party from its position). */
  onValuesChange?: (changed: Partial<V>, set: (values: Partial<V>) => void) => void;
  /** A line above the fields. */
  note?: ReactNode;
}) {
  const [form] = Form.useForm<V>();
  const toast = useToast();
  // antd's static Modal.confirm does not render under React 19; the hook version does.
  const [modal, modalHolder] = Modal.useModal();
  // The server's refusal stays in the form (e.g. a dock door already booked) until the next try.
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    setError("");
    if (initial) form.setFieldsValue(initial as never);
  }, [open, initial, form]);

  const submit = async () => {
    const values = await form.validateFields();
    // Empty inputs are sent as "" / null so a cleared field is saved as cleared.
    const cleaned = Object.fromEntries(
      fields.map((f) => {
        const v = (values as Record<string, unknown>)[f.name];
        return [f.name, f.type === "number" ? (v === undefined || v === "" ? null : v) : (v ?? "")];
      }),
    ) as V;
    setError("");
    try {
      await onSubmit(cleaned);
      onCancel();
    } catch (e) {
      const msg = errorMessage(e, "Failed to save");
      setError(msg);
      toast.error(msg);
    }
  };

  let lastSection: string | undefined;
  return (
    <Modal
      open={open}
      title={title}
      onCancel={onCancel}
      onOk={submit}
      okText={okText}
      confirmLoading={saving}
      width={680}
      destroyOnClose
      footer={(_, { OkBtn, CancelBtn }) => (
        <div className="flex items-center gap-2">
          {onDelete && (
            <button
              type="button"
              className="text-xs text-red-500 hover:underline bg-transparent border-none cursor-pointer p-0"
              onClick={() =>
                modal.confirm({
                  title: "Delete this record?",
                  okText: "Delete",
                  okButtonProps: { danger: true },
                  onOk: () =>
                    onDelete()
                      .then(onCancel)
                      .catch((e) => toast.error(errorMessage(e, "Failed to delete"))),
                })
              }
            >
              Delete
            </button>
          )}
          <div className="flex-1" />
          <CancelBtn />
          <OkBtn />
        </div>
      )}
    >
      {modalHolder}
      {note && <div className="mb-3 text-xs text-slate-500">{note}</div>}
      {error && <Alert type="error" showIcon className="!mb-3" message={error} />}
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        className="grid grid-cols-2 gap-x-4 [&_.ant-form-item]:mb-3"
        onValuesChange={onValuesChange ? (changed: Partial<V>) => onValuesChange(changed, (v) => form.setFieldsValue(v as never)) : undefined}
      >
        {fields.map((f) => {
          const header =
            f.section && f.section !== lastSection ? (
              <div key={`s-${f.section}`} className="col-span-full text-[11px] font-bold uppercase tracking-wide text-slate-500 mt-2 mb-2 pb-1.5 border-b border-slate-100">
                {f.section}
              </div>
            ) : null;
          lastSection = f.section ?? lastSection;
          const options = (f.options ?? []).map((o) => (typeof o === "string" ? { value: o, label: o } : o));
          const control =
            f.type === "number" ? (
              <InputNumber min={0} step={f.step ?? 1} className="w-full" placeholder={f.placeholder} />
            ) : f.type === "select" ? (
              <Select allowClear showSearch optionFilterProp="label" options={options} placeholder={f.placeholder} />
            ) : f.type === "textarea" ? (
              <Input.TextArea rows={2} placeholder={f.placeholder} />
            ) : (
              <Input
                type={f.type === "date" ? "date" : f.type === "time" ? "time" : f.type === "datetime" ? "datetime-local" : "text"}
                placeholder={f.placeholder}
              />
            );
          return [
            header,
            <Form.Item
              key={f.name}
              name={f.name}
              label={f.label}
              className={f.full || f.type === "textarea" ? "col-span-full" : undefined}
              rules={f.required ? [{ required: true, message: `${f.label} is required` }] : undefined}
            >
              {control}
            </Form.Item>,
          ];
        })}
      </Form>
    </Modal>
  );
}
