import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { SHIPMENTS, COLUMNS, getColumnValue, type Shipment } from "./shipment-data";
import { apiRequest } from "./queryClient";

export interface EditableShipment extends Shipment {
  _id: string;
}

let _nextId = Date.now();
function genId(): string {
  return `new-${_nextId++}-${Math.random().toString(36).substring(2, 8)}`;
}

function shipmentToEditable(s: Shipment): EditableShipment {
  return { ...s, extra: { ...(s.extra || {}) }, _id: `row-${s.row}` };
}

// Field mapping for setting values on the Shipment interface.
// Keys are the NEW display column names (system-1.xlsx); values are
// the internal Shipment interface field names (kept stable for DB compat).
const FIELD_MAP: Record<string, keyof Shipment> = {
  "Internal Reference": "jobNumber",
  "Shipments Date": "month",
  "Department": "dept",
  "Person In Charge": "handler",
  "Shipper": "shipper",
  "Consignee": "consignee",
  "Customs Status": "customsStatus",
  "Shipment Status": "status",
  "Trade Direction": "shipmentType",
  "Load Type": "fclLcl",
  "Shipping line / Coloader": "shippingLine",
  "POL": "pol",
  "POD": "pod",
  "Estimated Departure": "etd",
  "Estimated Arrival": "eta",
  "ETA Warehouse/HUB": "etaDepo",
  "Planned Delivery Date": "etaCnee",
  "Planned Delivery Time": "etaCneeTime",
  "Vessel": "vessel",
  "Voyage": "voyage",
  "Cargo Description": "goods",
  "HS Code": "hsCode",
  "Booking Number": "booking",
  "Personal Reference": "myRef",
  "Container Number": "cntr",
  "Cargo Readyness Date": "crd",
  "Pickup Date": "pu",
  "Closing Date": "closing",
};

export function setCellValue(s: EditableShipment, col: string, value: string): EditableShipment {
  const clone: EditableShipment = { ...s, extra: { ...(s.extra || {}) } };
  const field = FIELD_MAP[col];
  if (field) {
    (clone as any)[field] = value;
  } else {
    clone.extra![col] = value;
  }
  return clone;
}

// ─── Persistence helpers ──────────────────────────────────────────
// Fire-and-forget POST to /api/shipment-edits
function persistEdit(action: "create" | "update" | "delete", jobKey: string, payload: Record<string, any> = {}) {
  apiRequest("POST", "/api/shipment-edits", { action, jobKey, payload }).catch((err) =>
    console.error("Failed to persist edit:", err)
  );
}

function persistDeleteHistory(jobKey: string) {
  apiRequest("DELETE", `/api/shipment-edits/${encodeURIComponent(jobKey)}`).catch((err) =>
    console.error("Failed to delete edit history:", err)
  );
}

// Apply stored edits on top of base shipments
interface EditRecord {
  action: string;
  jobKey: string;
  payload: string;
}

function applyEditsToBase(base: EditableShipment[], edits: EditRecord[]): EditableShipment[] {
  let result = [...base];
  const deleted = new Set<string>();

  for (const edit of edits) {
    const payload = typeof edit.payload === "string" ? JSON.parse(edit.payload) : edit.payload;

    if (edit.action === "create") {
      // Check if already exists (duplicate guard)
      const exists = result.some(
        (s) => s._id === edit.jobKey || (payload.jobNumber && s.jobNumber && s.jobNumber === payload.jobNumber)
      );
      if (!exists) {
        const newShipment: EditableShipment = {
          row: payload.row || Date.now(),
          jobNumber: payload.jobNumber || "",
          month: payload.month || "",
          dept: payload.dept || "Operation Department",
          handler: payload.handler || "",
          shipper: payload.shipper || "",
          consignee: payload.consignee || "",
          customsStatus: payload.customsStatus || "Waiting For Commercial Paperwork",
          status: payload.status || "Booking Confirmation Pending [IMP]",
          shipmentType: payload.shipmentType || "Import",
          fclLcl: payload.fclLcl || "",
          shippingLine: payload.shippingLine || "",
          pol: payload.pol || "",
          pod: payload.pod || "",
          etd: payload.etd || "",
          eta: payload.eta || "",
          etaDepo: payload.etaDepo || "",
          etaCnee: payload.etaCnee || "",
          etaCneeTime: payload.etaCneeTime || "",
          vessel: payload.vessel || "",
          voyage: payload.voyage || "",
          goods: payload.goods || "",
          hsCode: payload.hsCode || "",
          booking: payload.booking || "",
          myRef: payload.myRef || "",
          cntr: payload.cntr || "",
          crd: payload.crd || "",
          pu: payload.pu || "",
          closing: payload.closing || "",
          destination: payload.destination || "",
          extra: payload.extra || {},
          _id: edit.jobKey,
        };
        result = [newShipment, ...result];
      }
    } else if (edit.action === "update") {
      result = result.map((s) => {
        // Match by _id or jobNumber
        if (s._id !== edit.jobKey && s.jobNumber !== edit.jobKey) return s;
        let updated: EditableShipment = { ...s, extra: { ...(s.extra || {}) } };
        for (const [col, value] of Object.entries(payload)) {
          updated = setCellValue(updated, col, value as string);
        }
        return updated;
      });
    } else if (edit.action === "delete") {
      deleted.add(edit.jobKey);
    }
  }

  // Remove deleted
  if (deleted.size > 0) {
    result = result.filter((s) => !deleted.has(s._id) && !deleted.has(s.jobNumber));
  }

  return result;
}

// ─── Context ────────────────────────────────────────────────────────

interface ShipmentContextType {
  data: EditableShipment[];
  setData: React.Dispatch<React.SetStateAction<EditableShipment[]>>;
  updateShipmentFields: (jobNumber: string, fields: Record<string, string>) => void;
  getShipmentByJobNumber: (jobNumber: string) => EditableShipment | undefined;
  getExistingValues: (jobNumber: string, fieldNames: string[]) => Record<string, string>;
  jobNumbers: string[];
  deleteShipment: (jobNumberOrId: string) => void;
  persistCellEdit: (jobKey: string, col: string, value: string) => void;
  refreshFromAPI: () => Promise<void>;
  isLoading: boolean;
}

const ShipmentContext = createContext<ShipmentContextType | null>(null);

export function ShipmentProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<EditableShipment[]>(() =>
    SHIPMENTS.map(shipmentToEditable)
  );
  const [isLoading, setIsLoading] = useState(true);
  const loadedRef = useRef(false);

  // Load persisted edits on mount
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    (async () => {
      try {
        const resp = await apiRequest("GET", "/api/shipment-edits");
        const edits: EditRecord[] = await resp.json();
        if (edits.length > 0) {
          const base = SHIPMENTS.map(shipmentToEditable);
          const merged = applyEditsToBase(base, edits);
          setData(merged);
        }
      } catch (err) {
        console.error("Failed to load shipment edits:", err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const jobNumbers = data
    .map((s) => s.jobNumber)
    .filter((jn) => jn && jn.trim() !== "");

  const getShipmentByJobNumber = useCallback(
    (jobNumber: string) => data.find((s) => s.jobNumber === jobNumber),
    [data]
  );

  const getExistingValues = useCallback(
    (jobNumber: string, fieldNames: string[]): Record<string, string> => {
      const shipment = data.find((s) => s.jobNumber === jobNumber);
      if (!shipment) return {};
      const result: Record<string, string> = {};
      for (const col of fieldNames) {
        const val = getColumnValue(shipment, col);
        if (val && val.trim() !== "") {
          result[col] = val;
        }
      }
      return result;
    },
    [data]
  );

  const updateShipmentFields = useCallback(
    (jobNumber: string, fields: Record<string, string>) => {
      setData((prev) =>
        prev.map((s) => {
          if (s.jobNumber !== jobNumber) return s;
          let updated: EditableShipment = { ...s, extra: { ...(s.extra || {}) }, _id: s._id };
          for (const [col, value] of Object.entries(fields)) {
            updated = setCellValue(updated, col, value);
          }
          return updated;
        })
      );
      // Persist the field update
      persistEdit("update", jobNumber, fields);
    },
    []
  );

  const persistCellEdit = useCallback((jobKey: string, col: string, value: string) => {
    persistEdit("update", jobKey, { [col]: value });
  }, []);

  const refreshFromAPI = useCallback(async () => {
    try {
      const resp = await apiRequest("GET", "/api/shipment-edits");
      const edits: EditRecord[] = await resp.json();
      const base = SHIPMENTS.map(shipmentToEditable);
      const merged = applyEditsToBase(base, edits);
      setData(merged);
    } catch (err) {
      console.error("Failed to refresh shipment data:", err);
    }
  }, []);

  const deleteShipment = useCallback((jobNumberOrId: string) => {
    setData((prev) => {
      const target = prev.find((s) => s.jobNumber === jobNumberOrId || s._id === jobNumberOrId);
      if (!target) return prev;
      // Soft-delete: record a "delete" edit but keep all data in DB
      // This preserves the job number sequence and allows recovery
      const key = target.jobNumber || target._id;
      persistEdit("delete", key);
      return prev.filter((s) => s !== target);
    });
  }, []);

  return (
    <ShipmentContext.Provider
      value={{ data, setData, updateShipmentFields, getShipmentByJobNumber, getExistingValues, jobNumbers, deleteShipment, persistCellEdit, refreshFromAPI, isLoading }}
    >
      {children}
    </ShipmentContext.Provider>
  );
}

export function useShipments() {
  const ctx = useContext(ShipmentContext);
  if (!ctx) throw new Error("useShipments must be used within ShipmentProvider");
  return ctx;
}

// Re-exports so FullSheetTab can import from one place
export { shipmentToEditable, genId, FIELD_MAP };
