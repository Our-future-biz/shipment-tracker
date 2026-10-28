"use client";

import { useState, type ReactNode } from "react";
import { Button } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { SectionCard } from "@/components/SectionCard";
import type { interfaces } from "@/lib/api/client";
import { LAYOUT_SOURCE_LABEL } from "../_lib/railTariffs";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

interface TariffLayoutCardProps<L> {
  version: { layout: L; layoutSource: interfaces.LayoutSource };
  /** A manager on a draft: the layout can be corrected and the file read again. */
  editable: boolean;
  isRelayouting: boolean;
  /** Reads the file again with the layout; resolves with the version as read, rejects after telling the user why. */
  onRelayout: (layout: L) => Promise<{ layout: L }>;
  /** Above the form: what the AI worked out and what reading again does */
  intro: string;
  /** The layout as it is sent */
  clean: (layout: L) => L;
  /** What keeps the layout from being sent, in words */
  problemsOf: (layout: L) => string[];
  renderForm: (form: L, onChange: (form: L) => void) => ReactNode;
  /** The layout as text, for those who cannot change it */
  readOnly: ReactNode;
  /** The file's first rows, marked for the layout shown (the form's while it is edited) */
  renderSheet: (shown: L) => ReactNode;
}

// How the file was read. A manager corrects a draft's layout here and has the file read again;
// everyone else sees it as text. The file's first rows sit below.
export function TariffLayoutCard<L>({ version, editable, isRelayouting, onRelayout, intro, clean, problemsOf, renderForm, readOnly, renderSheet }: TariffLayoutCardProps<L>) {
  const [form, setForm] = useState<L>(version.layout);

  // The version as read (set while rendering): a newer one replaces the form only while nothing is edited here.
  const [seen, setSeen] = useState(version);
  if (version !== seen) {
    setSeen(version);
    if (same(form, seen.layout)) setForm(version.layout);
  }

  const dirty = editable && !same(form, version.layout);
  const problems = dirty ? problemsOf(form) : [];

  const handleRelayout = async () => {
    try {
      const read = await onRelayout(clean(form));
      setForm(read.layout);
    } catch {
      // onRelayout has told the user why; the form keeps their changes.
    }
  };

  return (
    <SectionCard title="How the file was read" extra={<span className="text-xs text-slate-500">{LAYOUT_SOURCE_LABEL[version.layoutSource]}</span>}>
      {editable ? (
        <>
          <p className="mt-0 mb-4 text-[13px] text-slate-600">{intro}</p>
          {renderForm(form, setForm)}
          <div className="flex flex-wrap items-center gap-3 mt-5">
            <Button type="primary" icon={<ReloadOutlined />} loading={isRelayouting} disabled={!dirty || problems.length > 0} onClick={handleRelayout}>
              Read the file again with this layout
            </Button>
            <Button onClick={() => setForm(version.layout)} disabled={!dirty || isRelayouting}>
              Reset
            </Button>
            {dirty && !problems.length && <span className="text-xs text-amber-700">Unsaved changes</span>}
            {problems.length > 0 && <span className="text-xs text-red-600">{problems.join(" · ")}</span>}
          </div>
        </>
      ) : (
        readOnly
      )}

      <div className="mt-5 pt-4 border-t border-slate-100">{renderSheet(editable ? form : version.layout)}</div>
    </SectionCard>
  );
}
