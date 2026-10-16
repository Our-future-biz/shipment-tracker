"use client";

import { useCallback, useRef, useState } from "react";
import { CameraOutlined } from "@ant-design/icons";
import { useGateFiles, type GateMovement } from "@/hooks/useGateLog";
import { useToast } from "@/lib/toast";
import { useFloorQueue } from "../_lib/useFloorQueue";
import { LOCAL_PHOTO } from "../_lib/queue";
import { PHOTO_MAX_BYTES, downscalePhoto } from "../_lib/photo";
import { Chip, FloorCard, bigPrimary } from "./floorUi";
import { FloorBack } from "./FloorBack";

/**
 * Takes a photo with the phone camera and stores it on the movement (the gate job's files): sent
 * now when online, kept on the phone and sent later when not. Returns the file id to attach to an
 * exception — the server's, or `local:<id>` until a queued photo is sent — or null.
 */
export function useTakePhoto(m: GateMovement) {
  const toast = useToast();
  const q = useFloorQueue();
  return useCallback(
    async (file: File, { container, tag }: { container: string; tag: string }): Promise<string | null> => {
      const photo = await downscalePhoto(file);
      if (photo.blob.size > PHOTO_MAX_BYTES) {
        toast.error("The photo is larger than 25 MB — take it again");
        return null;
      }
      const res = await q.submit({
        kind: "photo",
        movement: m,
        label: `Photo ${tag}${container ? ` · ${container}` : ""}`,
        payload: { fileName: photo.fileName, fileType: photo.fileType, size: photo.blob.size, container, tag },
        blob: photo.blob,
      });
      if (res.type === "sent") {
        toast.success("Photo saved");
        return res.fileId ?? null;
      }
      if (res.type === "queued") {
        toast.info("Photo kept on the phone — waiting to send");
        return `${LOCAL_PHOTO}${res.id}`;
      }
      toast.error(res.type === "not_kept" ? res.error : res.error || "Failed to save the photo");
      return null;
    },
    [m, q, toast],
  );
}

/** The camera button: opens the phone camera (`capture="environment"`), one photo per tap. */
export function CameraButton({ onPhoto, label = "Take photo", busy }: { onPhoto: (file: File) => void; label?: string; busy?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={bigPrimary} disabled={busy} onClick={() => input.current?.click()}>
        <CameraOutlined /> {busy ? "Saving…" : label}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onPhoto(f);
        }}
      />
    </>
  );
}

/** Tag of a photo, as on the gate job: CTN (the container / cargo) or PC n (one piece). */
export function TagPicker({ value, onChange, pieces }: { value: string; onChange: (v: string) => void; pieces: number }) {
  const pc = /^PC (\d+)$/.exec(value);
  const n = pc ? Number(pc[1]) : 1;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip on={value === "CTN"} onClick={() => onChange("CTN")}>
        CTN — cargo
      </Chip>
      <Chip on={!!pc} onClick={() => onChange(`PC ${n}`)}>
        Piece
      </Chip>
      {pc && (
        <span className="flex items-center gap-1">
          <button type="button" aria-label="Previous piece" className="h-11 w-11 rounded-xl border border-slate-300 bg-white text-[20px] cursor-pointer" onClick={() => onChange(`PC ${Math.max(1, n - 1)}`)}>
            −
          </button>
          <span className="w-14 text-center text-[16px] font-bold tabular-nums">PC {n}</span>
          <button
            type="button"
            aria-label="Next piece"
            className="h-11 w-11 rounded-xl border border-slate-300 bg-white text-[20px] cursor-pointer"
            onClick={() => onChange(`PC ${pieces > 0 ? Math.min(pieces, n + 1) : n + 1}`)}
          >
            +
          </button>
        </span>
      )}
    </div>
  );
}

// Photos of the position from the phone camera, for the survey and the record.
export function FloorPhotos({ m, onBack }: { m: GateMovement; onBack: () => void }) {
  const q = useFloorQueue();
  const take = useTakePhoto(m);
  const { files } = useGateFiles(m.id);
  const [container, setContainer] = useState(m.containers[0]?.number ?? "");
  const [tag, setTag] = useState("CTN");
  const [busy, setBusy] = useState(false);
  const waiting = q.items.filter((i) => i.kind === "photo" && i.movementId === m.id).length;
  const photos = files.filter((f) => f.fileType.startsWith("image/"));

  return (
    <div className="flex flex-col gap-4">
      <FloorBack onBack={onBack} title="Photos" />
      <FloorCard>
        <div className="flex flex-col gap-3">
          {m.containers.length > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Container">
              <Chip on={container === ""} onClick={() => setContainer("")}>
                Position
              </Chip>
              {m.containers.map((c) => (
                <Chip key={c.number} on={container === c.number} onClick={() => setContainer(c.number)}>
                  {c.number}
                </Chip>
              ))}
            </div>
          )}
          <TagPicker value={tag} onChange={setTag} pieces={m.colli} />
          <CameraButton
            busy={busy}
            onPhoto={async (f) => {
              setBusy(true);
              try {
                await take(f, { container, tag });
              } finally {
                setBusy(false);
              }
            }}
          />
        </div>
      </FloorCard>
      <FloorCard title="On this position">
        <div className="text-[15px] text-slate-700">
          {photos.length} photo{photos.length === 1 ? "" : "s"} stored
          {waiting ? ` · ${waiting} waiting to send` : ""}
        </div>
        {photos.length > 0 && (
          <ul className="m-0 mt-2 list-none p-0 text-[14px] text-slate-600">
            {photos.slice(-8).map((f) => (
              <li key={f.id} className="truncate py-0.5">
                {f.tag ? `${f.tag} · ` : ""}
                {f.container ? `${f.container} · ` : ""}
                {f.fileName}
              </li>
            ))}
          </ul>
        )}
      </FloorCard>
    </div>
  );
}
