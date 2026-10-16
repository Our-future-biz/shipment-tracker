"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Alert, Button, Checkbox, Select, Spin, Switch, Tag } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useToast } from "@/lib/toast";
import { formatDateTime } from "@/lib/date";
import { APIError, ErrCode } from "@/lib/api/client";
import { errorMessage } from "../../gate-log/_lib/gate";
import { Card } from "../../_components/tabs/shared";
import { useUnsavedGuard } from "../../_lib/useUnsavedGuard";
import { isEmailAddress, normaliseList, recipientsProblem, splitAddresses } from "../_lib/emailList";
import { useWarehouseSettings, type SupplierKind, type SupplierRecipients, type WarehouseSettings } from "@/hooks/useWarehouseSettings";

// Warehouse settings: who gets the supplier e-mails (VGM, Survey, Remeasurement) — an on/off switch
// and To / Cc per type — and the docks with their opening hours (the Dock Schedule grid and dock
// utilisation in Reports). Everyone can see them; only a manager can change them. Every change is logged.

const KINDS: { kind: SupplierKind; label: string; what: string }[] = [
  { kind: "vgm", label: "VGM", what: "the warehouse re-weighing (re-weighed vs declared weight, scale photos)" },
  { kind: "survey", label: "Survey", what: "the cargo survey (damaged / short / over, photos)" },
  { kind: "remeasurement", label: "Remeasurement", what: "the remeasured lines and totals compared with the declared figures" },
];
const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];
const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

type Draft = Pick<WarehouseSettings, "supplierEmail" | "docks">;
const draftOf = (s: WarehouseSettings): Draft => ({ supplierEmail: structuredClone(s.supplierEmail), docks: structuredClone(s.docks) });
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function WarehouseSettingsView() {
  const toast = useToast();
  const { settings, isLoading, isError, save, isSaving } = useWarehouseSettings();
  const [draft, setDraft] = useState<Draft | null>(null);
  // The stored settings the draft started from: a newer save (by someone else) replaces the draft
  // only while nothing is edited here.
  const [base, setBase] = useState<Draft | null>(null);

  // Settings as read (set while rendering, not in an effect): newer stored settings replace the
  // draft only while nothing is edited here.
  const [seen, setSeen] = useState<WarehouseSettings | null>(null);
  if (settings && settings !== seen) {
    setSeen(settings);
    const next = draftOf(settings);
    if (!draft || !base || same(draft, base)) {
      setDraft(next);
      setBase(next);
    }
  }

  const stored = settings ? draftOf(settings) : null;
  const dirty = !!draft && !!stored && !same(draft, stored);
  useUnsavedGuard(dirty);

  const problems = useMemo(() => {
    if (!draft) return [];
    const out: string[] = [];
    for (const k of KINDS) {
      const p = recipientsProblem(draft.supplierEmail[k.kind]);
      if (p) out.push(`${k.label}: ${p}`);
    }
    if (!draft.docks.docks.length) out.push("Docks: add at least one dock");
    if (draft.docks.closesAt <= draft.docks.opensAt) out.push("Docks: closing time must be after opening time");
    if (!draft.docks.workingDays.length) out.push("Docks: choose at least one working day");
    return out;
  }, [draft]);

  if (isLoading || (!draft && !isError)) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }
  if (isError || !settings || !draft) {
    return (
      <div className="p-10 text-center text-slate-500">
        The warehouse settings could not be read — reload the page.{" "}
        <Link href="/warehouse-concept" className="text-indigo-500">
          Back to Warehouse
        </Link>
      </div>
    );
  }

  const canEdit = settings.canEdit;
  const setRecipients = (kind: SupplierKind, patch: Partial<SupplierRecipients>) =>
    setDraft((d) => (d ? { ...d, supplierEmail: { ...d.supplierEmail, [kind]: { ...d.supplierEmail[kind], ...patch } } } : d));
  const setDocks = (patch: Partial<Draft["docks"]>) => setDraft((d) => (d ? { ...d, docks: { ...d.docks, ...patch } } : d));

  const onSave = async () => {
    const clean = (r: SupplierRecipients): SupplierRecipients => {
      const to = normaliseList(r.to).ok;
      return { enabled: r.enabled, to, cc: normaliseList(r.cc).ok.filter((a) => !to.includes(a)) };
    };
    const changed = Object.fromEntries(
      KINDS.filter((k) => !same(draft.supplierEmail[k.kind], settings.supplierEmail[k.kind])).map((k) => [k.kind, clean(draft.supplierEmail[k.kind])]),
    ) as Partial<Record<SupplierKind, SupplierRecipients>>;
    try {
      const res = await save({
        expectedVersion: settings.version,
        ...(Object.keys(changed).length ? { supplierEmail: changed } : {}),
        ...(!same(draft.docks, settings.docks) ? { docks: draft.docks } : {}),
      });
      setDraft(draftOf(res.settings));
      setBase(draftOf(res.settings));
      toast.success("Warehouse settings saved — logged");
    } catch (e) {
      if (e instanceof APIError && e.code === ErrCode.Aborted) {
        // Their version is loaded (the settings reload after a refused save); the change is made again on top of it.
        setDraft(null);
        setBase(null);
        toast.error("Someone else changed the settings meanwhile — their version is loaded; make your change again");
      } else {
        toast.error(errorMessage(e, "Failed to save the settings"));
      }
    }
  };
  const onDiscard = () => {
    setDraft(draftOf(settings));
    setBase(draftOf(settings));
  };

  return (
    <div className="bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-start gap-2">
          <Link href="/warehouse-concept" aria-label="Back to Warehouse" className="mt-1 text-slate-400 hover:text-indigo-500 p-1">
            <ArrowLeftOutlined />
          </Link>
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold text-slate-800 m-0">Warehouse settings</h1>
            <div className="text-xs text-slate-500 mt-1">
              Who gets the supplier e-mails, and the docks with their opening hours.
              {settings.updatedAt ? ` Last changed ${formatDateTime(settings.updatedAt)}${settings.updatedBy ? ` by ${settings.updatedBy}` : ""}.` : " Nothing saved yet — the defaults are shown."}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto p-4 sm:p-6 flex flex-col gap-4">
        {!canEdit && <Alert type="info" showIcon message="Only a manager can change these settings. You can see them." />}
        {!settings.emailConfigured && (
          <Alert
            type="warning"
            showIcon
            message="E-mail sending is off on this server"
            description="E-mail sending is switched off for now (no e-mail provider is connected yet). A send fails with a clear message and nothing is marked as sent. Recipients can be set already."
          />
        )}

        <Card title="Supplier e-mail" extra="Send VGM / Send survey / Send remeasurement on the Remeasurement / Release tab">
          <p className="text-xs text-slate-500 mt-0 mb-3">
            When a type is <b>on</b> and has a To address, its button e-mails it and only then records it as sent (with the recipients in the history). When it is off, the button stays{" "}
            <b>Mark as sent</b> — recorded only, nothing is e-mailed.
          </p>
          <div className="flex flex-col divide-y divide-slate-100">
            {KINDS.map((k) => (
              <RecipientsRow key={k.kind} label={k.label} what={k.what} value={draft.supplierEmail[k.kind]} disabled={!canEdit} onChange={(p) => setRecipients(k.kind, p)} />
            ))}
          </div>
        </Card>

        <Card title="Docks and hours" extra="The Dock Schedule grid and dock utilisation in Reports">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-4 items-start">
            <Field label="Docks">
              <Select
                mode="tags"
                aria-label="Dock names"
                value={draft.docks.docks}
                disabled={!canEdit}
                tokenSeparators={[","]}
                open={false}
                suffixIcon={null}
                placeholder="Type a dock name and press Enter"
                onChange={(v: string[]) => setDocks({ docks: v.map((x) => x.trim()).filter((x, i, a) => x && a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i) })}
                className="w-full"
              />
            </Field>
            <Field label="Open">
              <div className="flex items-center gap-2">
                <Select aria-label="Opens at" value={draft.docks.opensAt} disabled={!canEdit} options={TIMES.map((t) => ({ value: t, label: t }))} onChange={(v) => setDocks({ opensAt: v })} className="w-[90px]" />
                <span className="text-slate-400">–</span>
                <Select aria-label="Closes at" value={draft.docks.closesAt} disabled={!canEdit} options={TIMES.map((t) => ({ value: t, label: t }))} onChange={(v) => setDocks({ closesAt: v })} className="w-[90px]" />
              </div>
            </Field>
            <Field label="Working days">
              <Checkbox.Group
                value={draft.docks.workingDays}
                disabled={!canEdit}
                options={WEEKDAYS}
                onChange={(v) => setDocks({ workingDays: (v as number[]).slice().sort((a, b) => a - b) })}
              />
            </Field>
          </div>
        </Card>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="primary" onClick={onSave} loading={isSaving} disabled={!dirty || problems.length > 0}>
              Save changes
            </Button>
            <Button onClick={onDiscard} disabled={!dirty || isSaving}>
              Discard
            </Button>
            {dirty && !problems.length && <span className="text-xs text-amber-700">unsaved changes</span>}
            {problems.length > 0 && <span className="text-xs text-red-600">{problems.join(" · ")}</span>}
          </div>
        )}

        <Card title="Change log" extra={settings.events.length ? `latest ${settings.events.length}` : undefined}>
          {settings.events.length ? (
            <ul className="list-none m-0 p-0 text-xs text-slate-600">
              {settings.events.map((e, i) => (
                <li key={`${e.at}-${i}`} className="py-1 border-b border-slate-100 last:border-b-0">
                  <span className="font-mono text-slate-500">{formatDateTime(e.at)}</span>
                  {e.by ? <span className="text-slate-500"> · {e.by}</span> : null} — {e.label}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-xs text-slate-400">No changes yet.</span>
          )}
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function AddressSelect({ label, value, disabled, onChange }: { label: string; value: string[]; disabled: boolean; onChange: (v: string[]) => void }) {
  return (
    <Select
      mode="tags"
      aria-label={label}
      value={value}
      disabled={disabled}
      open={false}
      suffixIcon={null}
      tokenSeparators={[",", ";", " "]}
      placeholder="name@company.com — Enter or comma to add"
      className="w-full"
      onChange={(v: string[]) => {
        const seen: string[] = [];
        for (const raw of v.flatMap(splitAddresses)) {
          const a = isEmailAddress(raw) ? raw.trim().toLowerCase() : raw.trim();
          if (a && !seen.some((x) => x.toLowerCase() === a.toLowerCase())) seen.push(a);
        }
        onChange(seen);
      }}
      tagRender={({ value: v, closable, onClose }) => {
        const ok = isEmailAddress(String(v));
        return (
          <Tag color={ok ? undefined : "red"} closable={closable} onClose={onClose} className="my-0.5 me-1" title={ok ? undefined : "Not an e-mail address"}>
            {String(v)}
          </Tag>
        );
      }}
    />
  );
}

function RecipientsRow({
  label,
  what,
  value,
  disabled,
  onChange,
}: {
  label: string;
  what: string;
  value: SupplierRecipients;
  disabled: boolean;
  onChange: (p: Partial<SupplierRecipients>) => void;
}) {
  const problem = recipientsProblem(value);
  const ccDup = normaliseList(value.cc).ok.filter((a) => normaliseList(value.to).ok.includes(a));
  return (
    <div className="py-3 first:pt-0 last:pb-0 grid grid-cols-1 md:grid-cols-[170px_1fr_1fr] gap-3 items-start">
      <div>
        <div className="text-[13px] font-bold text-slate-800">{label}</div>
        <div className="flex items-center gap-2 mt-1">
          <Switch size="small" checked={value.enabled} disabled={disabled} onChange={(on) => onChange({ enabled: on })} aria-label={`E-mail ${label}`} />
          <span className={`text-xs ${value.enabled ? "text-emerald-700 font-semibold" : "text-slate-500"}`}>{value.enabled ? "E-mailed" : "Recorded only"}</span>
        </div>
        <div className="text-[11px] text-slate-400 mt-1">{what}</div>
      </div>
      <Field label="To">
        <AddressSelect label={`${label} To`} value={value.to} disabled={disabled} onChange={(to) => onChange({ to })} />
      </Field>
      <Field label="Cc">
        <AddressSelect label={`${label} Cc`} value={value.cc} disabled={disabled} onChange={(cc) => onChange({ cc })} />
      </Field>
      {(problem || ccDup.length > 0) && (
        <div className="md:col-start-2 md:col-span-2 text-[11px]">
          {problem && <span className="text-red-600">{problem}</span>}
          {ccDup.length > 0 && <span className="text-slate-500"> {ccDup.join(", ")} is in To already — kept in To only.</span>}
        </div>
      )}
    </div>
  );
}
