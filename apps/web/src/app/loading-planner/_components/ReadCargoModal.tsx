"use client";

import { useRef, useState } from "react";
import { Button, Checkbox, Input } from "antd";
import { FileSearchOutlined, UploadOutlined, WarningOutlined } from "@ant-design/icons";
import { AppModal } from "@/components/AppModal";
import { PillTabs } from "@/components/SectionCard";
import { useCargoReading } from "@/hooks/useCargoReading";
import { apiErrorMessage } from "@/lib/api";
import type { lib } from "@/lib/api/client";
import { BTN, EMPTY, HINT, TD, TH } from "@/styles/ui";
import type { DraftLine } from "../_lib/cargoForm";
import { draftsFromReading, isReadLineComplete, MAX_READ_FILE_MB, READ_FILE_TYPES, readFileProblem } from "../_lib/readCargo";
import { formatDim, type DimUnit } from "../_lib/units";

interface ReadCargoModalProps {
  open: boolean;
  onClose: () => void;
  unit: DimUnit;
  /** The lines the user kept, to add to the plan's cargo list. */
  onAdd: (lines: DraftLine[]) => void;
}

const SOURCE_TABS = [
  { key: "file", label: "Upload a file" },
  { key: "text", label: "Paste text" },
] as const;

// Reads cargo lines out of a file or a pasted text with the AI reader, in two steps: first the
// source, then the lines it found, shown for checking. Nothing reaches the plan until the user adds
// the lines they ticked; a figure the document did not give stays empty for them to fill in.
export function ReadCargoModal({ open, onClose, unit, onAdd }: ReadCargoModalProps) {
  const { readCargo, isReading } = useCargoReading();
  const fileInput = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<"file" | "text">("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<{ lines: lib.CargoLineRead[]; partial: boolean } | null>(null);
  const [kept, setKept] = useState<boolean[]>([]);

  const close = () => {
    setFile(null);
    setText("");
    setError(null);
    setFound(null);
    onClose();
  };

  const handleRead = async () => {
    setError(null);
    if (source === "file") {
      const problem = file ? readFileProblem(file) : "Choose a file to read.";
      if (problem) return setError(problem);
    } else if (text.trim().length < 10) {
      return setError("Paste the text that lists the cargo.");
    }
    try {
      const result = await readCargo(source === "file" && file ? { file } : { text });
      setFound(result);
      setKept(result.lines.map(() => true));
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  };

  const handleAdd = () => {
    if (!found) return;
    onAdd(draftsFromReading(found.lines.filter((_, index) => kept[index]), () => crypto.randomUUID()));
    close();
  };

  const keptCount = kept.filter(Boolean).length;
  const dim = (mm: number | null) => (mm === null ? <span className="font-medium text-amber-600">missing</span> : formatDim(mm, unit));

  return (
    <AppModal
      open={open}
      onClose={close}
      title="Read cargo from a file or text"
      subtitle={found ? "Check what was read. Only the lines you keep are added to the plan." : "The AI reader finds the cargo lines. You check them before anything is added."}
      size="large"
      maskClosable={false}
      closable={!isReading}
      footer={
        <div className="flex justify-end gap-2">
          {found && (
            <Button onClick={() => setFound(null)} className="mr-auto">
              Read something else
            </Button>
          )}
          <Button onClick={close} disabled={isReading}>
            Cancel
          </Button>
          {found ? (
            <Button type="primary" disabled={keptCount === 0} onClick={handleAdd}>
              Add {keptCount} {keptCount === 1 ? "line" : "lines"} to the plan
            </Button>
          ) : (
            <Button type="primary" icon={<FileSearchOutlined />} loading={isReading} onClick={handleRead}>
              {isReading ? "Reading…" : "Read"}
            </Button>
          )}
        </div>
      }
    >
      {!found ? (
        <div className="flex flex-col gap-3">
          <PillTabs
            tabs={SOURCE_TABS}
            active={source}
            onChange={(key) => {
              setSource(key);
              setError(null);
            }}
          />
          {source === "file" ? (
            <div className="flex flex-col gap-2">
              <input
                ref={fileInput}
                type="file"
                accept={READ_FILE_TYPES.join(",")}
                className="hidden"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setError(null);
                }}
              />
              <div className="flex items-center gap-3">
                <button type="button" className={BTN} onClick={() => fileInput.current?.click()} disabled={isReading}>
                  <UploadOutlined />
                  Choose a file
                </button>
                <span className="text-[13px] text-slate-700">{file ? file.name : <span className={EMPTY}>No file chosen</span>}</span>
              </div>
              <p className={`${HINT} m-0`}>
                A PDF, a picture (PNG, JPG), an Excel workbook (.xlsx), or a .csv or .txt file, up to {MAX_READ_FILE_MB} MB. A packing list or a quote request works best.
              </p>
            </div>
          ) : (
            <Input.TextArea
              aria-label="Text that lists the cargo"
              rows={9}
              maxLength={100000}
              placeholder={"Paste an e-mail or a list, for example:\n4 pallets 120 x 80 x 100 cm, 400 kg each\n1 case 2.5 x 1.2 x 1.8 m, 950 kg, not stackable"}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
            />
          )}
          {error && <p className="m-0 text-[13px] text-red-600">{error}</p>}
        </div>
      ) : found.lines.length === 0 ? (
        <p className="m-0 text-[13px] text-slate-700">No cargo lines were found in it. Try another file, or paste the part that lists the cargo.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {found.partial && (
            <p className="m-0 flex items-start gap-2 text-[13px] text-amber-700">
              <WarningOutlined className="mt-0.5" />
              The document was too long to read in one go: lines may be missing at its end. Check it against the original.
            </p>
          )}
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${TH} w-[36px]`} aria-label="Keep" />
                  <th className={TH}>Cargo</th>
                  <th className={`${TH} !text-right`}>Length ({unit})</th>
                  <th className={`${TH} !text-right`}>Width ({unit})</th>
                  <th className={`${TH} !text-right`}>Height ({unit})</th>
                  <th className={`${TH} !text-right`}>Weight / pc (kg)</th>
                  <th className={`${TH} !text-right`}>Colli</th>
                  <th className={TH}>Stackable</th>
                  <th className={TH}>Reader&apos;s note</th>
                </tr>
              </thead>
              <tbody>
                {found.lines.map((line, index) => (
                  <tr key={index} className={kept[index] ? "" : "opacity-50"}>
                    <td className={TD}>
                      <Checkbox
                        aria-label={`Keep ${line.name || `line ${index + 1}`}`}
                        checked={kept[index]}
                        onChange={(e) => setKept(kept.map((value, i) => (i === index ? e.target.checked : value)))}
                      />
                    </td>
                    <td className={TD}>{line.name || <span className={EMPTY}>—</span>}</td>
                    <td className={`${TD} text-right tabular-nums`}>{dim(line.lengthMm)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{dim(line.widthMm)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{dim(line.heightMm)}</td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {line.weightKg === null ? <span className="font-medium text-amber-600">missing</span> : line.weightKg.toLocaleString("en-US", { maximumFractionDigits: 1 })}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>{line.colli === null ? <span className="font-medium text-amber-600">missing</span> : line.colli}</td>
                    <td className={TD}>{line.stackable === null ? <span className="text-slate-500">not said</span> : line.stackable ? "Yes" : "No"}</td>
                    <td className={`${TD} text-slate-500`}>{line.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={`${HINT} m-0`}>
            {found.lines.some((line) => !isReadLineComplete(line))
              ? "A figure marked missing was not in the document. Its line is added with that field empty, and is planned once you fill it in."
              : "Every line has all its figures. You can still change them in the cargo table after adding."}{" "}
            Stackable is ticked only where the document says so.
          </p>
        </div>
      )}
    </AppModal>
  );
}
