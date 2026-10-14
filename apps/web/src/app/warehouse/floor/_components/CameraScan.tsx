"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "antd";

// "Scan with camera": the browser's own barcode reader (BarcodeDetector) on the camera picture —
// no extra library. It exists in Chrome on Android, and only on https or localhost; elsewhere
// (iPhone Safari, the app over plain http on the Wi-Fi) the button is not shown and the handheld
// scanner or typing is used instead.

type Detected = { rawValue: string };
type Detector = { detect: (source: CanvasImageSource) => Promise<Detected[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

export const cameraScanSupported = () =>
  typeof window !== "undefined" && window.isSecureContext && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;

export function CameraScan({ open, onClose, onScan }: { open: boolean; onClose: () => void; onScan: (value: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    setError("");
    (async () => {
      try {
        const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
        const detector = new Ctor({ formats: ["code_128", "qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const look = async () => {
          if (stopped || !video.current) return;
          try {
            const found = await detector.detect(video.current);
            const value = found[0]?.rawValue?.trim();
            if (value) {
              onScan(value);
              return;
            }
          } catch {
            // A frame that cannot be read; try the next one.
          }
          timer = window.setTimeout(look, 250);
        };
        look();
      } catch {
        setError("The camera cannot be used — allow it for this site, or use the scanner or type the code.");
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onScan]);

  return (
    <Modal open={open} onCancel={onClose} footer={null} title="Scan with camera" destroyOnHidden width={520}>
      {error ? (
        <div className="text-[15px] text-red-700">{error}</div>
      ) : (
        <>
          <video ref={video} playsInline muted className="w-full rounded-lg bg-black aspect-[3/4] object-cover" />
          <p className="mb-0 mt-2 text-[14px] text-slate-600">Point the camera at the label&rsquo;s barcode or QR code.</p>
        </>
      )}
    </Modal>
  );
}
