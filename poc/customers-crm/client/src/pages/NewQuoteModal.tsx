import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { X, FileText, Loader2, Check, AlertTriangle } from "lucide-react";

const C = {
  blue:    "#2563EB",
  blueL:   "#EFF6FF",
  border:  "#E2E8F0",
  text:    "#0F172A",
  textMuted:"#64748B",
  textLight:"#9CA3AF",
  surface: "#FFFFFF",
  bg:      "#F8FAFC",
  green:   "#16A34A",
  greenL:  "#F0FDF4",
  red:     "#DC2626",
};

interface Props {
  onConfirm: (ref: string, method: string) => void;
  onClose:   () => void;
}

export default function NewQuoteModal({ onConfirm, onClose }: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");

  // Fetch next reference from server (guaranteed unique)
  const { data: refData, isLoading: loadingRef } = useQuery<{ reference: string }>({
    queryKey: ["/api/sales-quotes/next-ref"],
    queryFn: () => apiRequest("GET", "/api/sales-quotes/next-ref").then(r => r.json()),
    staleTime: 0, // always fresh
  });

  const reference = refData?.reference ?? "";

  // Create the quote record in DB (permanent, unique)
  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sales-quotes", {
      reference,
      method: "manual",
    }).then(r => {
      if (!r.ok) return r.json().then((e: any) => Promise.reject(e.error));
      return r.json();
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-quotes"] });
      setConfirmed(true);
      setTimeout(() => onConfirm(reference, "manual"), 400);
    },
    onError: (e: any) => setError(String(e)),
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ background: C.surface, borderRadius: 14, width: "100%", maxWidth: 520, boxShadow: "0 24px 64px rgba(0,0,0,0.22)", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "18px 22px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Create new quotation</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>A unique reference will be permanently assigned.</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.textLight, padding: 4 }}><X style={{ width: 18, height: 18 }} /></button>
        </div>

        <div style={{ padding: "20px 22px" }}>

          {/* Reference number */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: C.textMuted, marginBottom: 8 }}>Quote reference</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: C.blueL, border: `1.5px solid #BFDBFE`, borderRadius: 9 }}>
              <FileText style={{ width: 20, height: 20, color: C.blue, flexShrink: 0 }} />
              {loadingRef ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Loader2 style={{ width: 16, height: 16, color: C.blue, animation: "spin 1s linear infinite" }} />
                  <span style={{ fontSize: 13, color: C.textMuted }}>Generating reference…</span>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.blue, letterSpacing: "0.04em", fontFamily: "monospace" }}>{reference}</div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>This reference is unique and cannot be reused once confirmed.</div>
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ marginBottom: 14, padding: "9px 13px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 7, display: "flex", gap: 8, alignItems: "center" }}>
              <AlertTriangle style={{ width: 13, height: 13, color: C.red, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: C.red }}>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={onClose}
              style={{ padding: "9px 20px", border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, color: C.textMuted, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
              Cancel
            </button>
            <button
              onClick={() => createMut.mutate()}
              disabled={!reference || createMut.isPending || confirmed}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "9px 22px", border: "none", borderRadius: 8,
                background: confirmed ? C.green : C.blue,
                color: "#fff", fontSize: 13, fontWeight: 700,
                cursor: (!reference || createMut.isPending || confirmed) ? "default" : "pointer",
                opacity: !reference ? 0.5 : 1,
                transition: "background 0.2s",
              }}>
              {confirmed
                ? <><Check style={{ width: 15, height: 15 }} /> Opening…</>
                : createMut.isPending
                ? <><Loader2 style={{ width: 15, height: 15 }} /> Creating…</>
                : "Confirm & open"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
