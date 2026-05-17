import { useState, useCallback, useRef, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { X, Paperclip, Upload, FileText, File, Trash2 } from "lucide-react";

interface AttachmentFile {
  id: number;
  jobNumber: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  createdAt: string;
}

interface AttachmentsPanelProps {
  jobNumber: string;
  shipperName?: string;
  consigneeName?: string;
  onClose: () => void;
}

export function AttachmentsPanel({ jobNumber, shipperName, consigneeName, onClose }: AttachmentsPanelProps) {
  const [files, setFiles] = useState<AttachmentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load from API
  useEffect(() => {
    if (!jobNumber) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const resp = await apiRequest("GET", `/api/attachments/${encodeURIComponent(jobNumber)}`);
        const data = await resp.json();
        if (!cancelled) setFiles(data);
      } catch (err) {
        console.error("Failed to load attachments:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [jobNumber]);

  const addFiles = useCallback(async (fileList: FileList) => {
    for (const f of Array.from(fileList)) {
      try {
        const resp = await apiRequest("POST", "/api/attachments", {
          jobNumber,
          fileName: f.name,
          fileSize: f.size,
          fileType: f.type,
        });
        const attachment = await resp.json();
        setFiles((prev) => [...prev, attachment]);
      } catch (err) {
        console.error("Failed to save attachment:", err);
      }
    }
  }, [jobNumber]);

  const removeFile = useCallback(async (id: number) => {
    try {
      await apiRequest("DELETE", `/api/attachments/${id}`);
      setFiles((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      console.error("Failed to delete attachment:", err);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      e.target.value = "";
    }
  }, [addFiles]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) + " " +
        d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    } catch { return iso; }
  };

  const getFileIcon = (type: string, name: string) => {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    if (type === "application/pdf" || ext === "pdf") return <FileText className="w-5 h-5 text-red-400" />;
    if (ext === "doc" || ext === "docx") return <FileText className="w-5 h-5 text-blue-400" />;
    if (ext === "xls" || ext === "xlsx") return <FileText className="w-5 h-5 text-green-400" />;
    if (ext === "rar" || ext === "zip" || ext === "7z") return <File className="w-5 h-5 text-amber-400" />;
    if (type.startsWith("image/")) return <File className="w-5 h-5 text-purple-400" />;
    return <File className="w-5 h-5 text-muted-foreground" />;
  };

  return (
    <div
      className="flex flex-col h-full border-l border-border/50"
      style={{ width: "340px", background: "hsl(var(--surface-8))" }}
      data-testid="attachments-panel"
    >
      {/* Header */}
      <div className="flex-none flex items-center justify-between px-4 py-3 border-b border-border/50" style={{ background: "hsl(var(--surface-9))" }}>
        <div className="flex items-center gap-2 min-w-0">
          <Paperclip className="w-4 h-4 text-[var(--brand-teal)] flex-none" />
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-foreground truncate">Attachments</h3>
            <p className="text-[10px] text-muted-foreground font-mono truncate">{jobNumber}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-none">
          <span className="text-[10px] text-muted-foreground">{files.length} file{files.length !== 1 ? "s" : ""}</span>
          <button onClick={onClose} className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors" data-testid="attachments-close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Shipment context */}
      {(shipperName || consigneeName) && (
        <div className="flex-none px-4 py-2 border-b border-border/30 text-[10px] text-muted-foreground">
          {shipperName && <span>Shipper: <span className="text-foreground">{shipperName}</span></span>}
          {shipperName && consigneeName && <span className="mx-1.5">→</span>}
          {consigneeName && <span>Consignee: <span className="text-foreground">{consigneeName}</span></span>}
        </div>
      )}

      {/* Drop zone */}
      <div
        className="flex-none mx-3 mt-3 rounded-lg border-2 border-dashed p-4 text-center transition-all cursor-pointer"
        style={{
          borderColor: dragOver ? "var(--brand-teal)" : "hsl(var(--border-22))",
          background: dragOver ? "rgba(20, 184, 166, 0.05)" : "hsl(var(--surface-9))",
        }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        data-testid="attachments-drop-zone"
      >
        <input ref={fileInputRef} type="file" multiple onChange={handleFileInput} className="hidden" data-testid="attachments-file-input" />
        <Upload className="w-6 h-6 text-muted-foreground/40 mx-auto mb-1.5" />
        <p className="text-[11px] text-muted-foreground">Drop files here or click to browse</p>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto px-3 py-3" style={{ background: "hsl(var(--surface-6))" }}>
        {loading ? (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">Loading...</div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <Paperclip className="w-8 h-8 opacity-20" />
            <p className="text-xs">No attachments yet</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {files.map((f) => (
              <div key={f.id} className="group flex items-center gap-3 px-3 py-2 rounded-md transition-colors hover:bg-white/[0.03]" style={{ background: "hsl(var(--surface-10))" }} data-testid={`attachment-${f.id}`}>
                <div className="flex-none">{getFileIcon(f.fileType, f.fileName)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground truncate" title={f.fileName}>{f.fileName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] text-muted-foreground/60">{formatSize(f.fileSize)}</span>
                    <span className="text-[9px] text-muted-foreground/40">{formatTime(f.createdAt)}</span>
                  </div>
                </div>
                <button onClick={() => removeFile(f.id)} className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-muted-foreground/40 hover:text-red-400 transition-all flex-none" title="Remove">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
