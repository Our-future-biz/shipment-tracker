"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Alert, Button, Form, Input, InputNumber, Modal, Select } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { Badge, type Tone } from "@/components/Badge";
import { ConfirmModal } from "@/components/ConfirmModal";
import { KpiTile, type KpiTone } from "@/components/KpiTile";
import { CARD, CARD_BAR, CARD_TITLE, EMPTY, HINT, LABEL_TEXT } from "@/styles/ui";
import { useToast } from "@/lib/toast";
import { errorMessage } from "@/app/warehouse-concept/gate-log/_lib/gate";
import { formatNumber } from "@/lib/number";
import { businessToday } from "@/lib/date";
import { containerNumberInput, isValidContainerNumber } from "@/lib/container";

// Shared pieces of the Warehouse module tabs (Containers, Dock & Yard, Reports):
// sub-tab pills, cards, KPI tiles, callouts, status marks and a record form - in the app's one
// look (styles/ui.ts and the shared components).

// The sub-tab pills are the app's own (PillTabs); re-exported under the name the tabs use.
export { PillTabs as SubTabs } from "@/components/SectionCard";

// A white card with the app's indigo title bar (styles/ui.ts: CARD, CARD_BAR, CARD_TITLE).
export function Card({ title, extra, children, bodyClassName = "p-4" }: { title: ReactNode; extra?: ReactNode; children: ReactNode; bodyClassName?: string }) {
  return (
    <section className={`${CARD} min-w-0`}>
      <div className={`${CARD_BAR} rounded-t-xl`}>
        <h3 className={CARD_TITLE}>{title}</h3>
        {extra && <div className={`ml-auto flex items-center gap-2 ${HINT}`}>{extra}</div>}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

// The app's KPI tile (components/KpiTile); "indigo" and "default" both draw the plain figure.
const KPI_TONE: Record<"default" | "indigo" | "green" | "amber" | "red", KpiTone | undefined> = { default: undefined, indigo: undefined, green: "green", amber: "amber", red: "red" };

export function Kpi({ label, value, sub, tone = "default" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: keyof typeof KPI_TONE }) {
  return <KpiTile label={label} value={value} hint={sub} tone={KPI_TONE[tone]} />;
}

export function Callout({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className={`${CARD} border-l-[3px] border-l-indigo-500 px-3.5 py-2.5 text-[12px] text-slate-700 leading-relaxed`}>
      {title && <b className="text-slate-900">{title} </b>}
      {children}
    </div>
  );
}

// A status in the app's one status mark (Badge); `tones` gives each value its tone, others are grey.
export function StatusTag({ value, tones }: { value: string; tones: Record<string, Tone> }) {
  if (!value) return <span className={EMPTY}>—</span>;
  return <Badge tone={tones[value] ?? ""}>{value}</Badge>;
}

export const dim = (v: string | number | null | undefined) =>
  v === "" || v == null ? <span className={EMPTY}>—</span> : <span className="text-slate-700">{v}</span>;

export const nf = (v: number | null | undefined, d = 0) => formatNumber(v, d, "");

const DAY = 86_400_000;
// Today on the warehouse's calendar (Prague), as a day number.
const todayIndex = () => Math.floor(Date.parse(`${businessToday()}T00:00:00Z`) / DAY);

/** Days until a YYYY-MM-DD date (negative when past). */
export const daysUntil = (date: string) => (date ? Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY) - todayIndex() : null);

// Carrier detention expiry: red when passed, amber within 2 days, green otherwise.
export function ExpiryTag({ date }: { date: string }) {
  const d = daysUntil(date);
  if (d == null) return <span className={EMPTY}>—</span>;
  const tone: Tone = d < 0 ? "r" : d <= 2 ? "a" : "g";
  return (
    <Badge tone={tone}>
      {date} · {d >= 0 ? `${d} d` : `${-d} d over`}
    </Badge>
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
  // "container": a container number, typed as 4 letters then 7 digits (containerNumberInput).
  type?: "text" | "number" | "date" | "time" | "datetime" | "select" | "textarea" | "container";
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
            <Button
              danger
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
            </Button>
          )}
          <div className="flex-1" />
          <CancelBtn />
          <OkBtn />
        </div>
      )}
    >
      {modalHolder}
      {note && <div className={`mb-3 ${HINT}`}>{note}</div>}
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
              <div key={`s-${f.section}`} className={`col-span-full ${LABEL_TEXT} mt-2 mb-2 pb-1.5 border-b border-slate-100`}>
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
              normalize={f.type === "container" ? (v: string) => containerNumberInput(v ?? "") : undefined}
              rules={[
                ...(f.required ? [{ required: true, message: `${f.label} is required` }] : []),
                ...(f.type === "container"
                  ? [{ validator: (_: unknown, v?: string) => (isValidContainerNumber(v) ? Promise.resolve() : Promise.reject(new Error("4 letters + 7 digits, e.g. MSKU1234567"))) }]
                  : []),
              ]}
            >
              {control}
            </Form.Item>,
          ];
        })}
      </Form>
    </Modal>
  );
}
