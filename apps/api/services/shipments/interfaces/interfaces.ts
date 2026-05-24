export interface ShipmentItem {
  id: string;
  jobNumber: string;
  shipper: string;
  consignee: string;
  personalReference: string;
  containerNumber: string;
  bookingNumber: string;
  loadType: string;
  shippingLine: string;
  pol: string;
  pod: string;
  destination: string;
  hsCode: string;
  cargoDescription: string;
  houseBolNumber: string;
  masterBolNumber: string;
  houseBolType: string;
  masterBolType: string;
  vessel: string;
  voyage: string;
  pcs: string;
  totalWeightTons: string | null;
  totalVolumeCbm: string | null;
  cargoOrigin: string;
  countryCode: string;
  origin: string;
  estimatedDeparture: string | null;
  estimatedArrival: string | null;
  tradeDirection: string;
  agent: string;
  incotermOrigin: string;
  incotermDestination: string;
  commercialInvoiceValue: string | null;
  status: string;
  customsStatus: string;
  masterJobId: string | null;
  masterJobMczNumber: string | null;
  containers: unknown;
  extra: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

export interface MasterJobItem {
  id: string;
  mczNumber: string;
  createdAt: string;
}

export interface CommentItem {
  id: string;
  shipmentId: string;
  authorId: string;
  message: string;
  createdAt: string;
}

export interface TaskItem {
  id: string;
  shipmentId: string;
  taskKey: string;
  completed: boolean;
  completedAt: string | null;
  completedById: string | null;
}

export interface AttachmentItem {
  id: string;
  shipmentId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  storageKey: string;
  createdAt: string;
}

export interface AuditItem {
  id: string;
  shipmentId: string;
  userId: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: string;
}
