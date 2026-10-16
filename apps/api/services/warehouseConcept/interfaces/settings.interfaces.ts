// Warehouse settings and supplier e-mails as the API returns them.

export interface SupplierRecipientsItem {
  /** E-mail this type when it is sent; off = "Mark as sent" records it only. */
  enabled: boolean;
  to: string[];
  cc: string[];
}

export interface SupplierEmailSettingsItem {
  vgm: SupplierRecipientsItem;
  survey: SupplierRecipientsItem;
  remeasurement: SupplierRecipientsItem;
}

export interface DockSettingsItem {
  docks: string[];
  /** "HH:MM", Prague time */
  opensAt: string;
  closesAt: string;
  /** ISO weekdays: 1 = Monday … 7 = Sunday */
  workingDays: number[];
}

export interface SettingsEventItem {
  at: string;
  by: string;
  label: string;
}

export interface WarehouseSettingsItem {
  supplierEmail: SupplierEmailSettingsItem;
  docks: DockSettingsItem;
  /** 0 = nothing saved yet (the defaults are shown). Send it back as expectedVersion. */
  version: number;
  updatedAt: string | null;
  updatedBy: string;
  /** Change log, newest first (the latest 50). */
  events: SettingsEventItem[];
  /** The caller may change the settings (manager, admin). */
  canEdit: boolean;
  /** The server has a Resend key — without it nothing can be e-mailed. */
  emailConfigured: boolean;
}

export interface SupplierEmailAttachmentItem {
  fileId: string;
  fileName: string;
  size: number;
  /** attached | linked (download link in the text) | listed (named only) */
  how: string;
}

/** One attempt to e-mail a VGM / survey / remeasurement. */
export interface SupplierEmailItem {
  id: string;
  kind: string;
  to: string[];
  cc: string[];
  subject: string;
  attachments: SupplierEmailAttachmentItem[];
  note: string;
  /** sending | sent | failed | unknown (a "sending" attempt that never finished) */
  status: string;
  error: string;
  requestedBy: string;
  createdAt: string;
  sentAt: string | null;
}

/** What "Send" would e-mail (previewOnly), so the user sees it before sending. */
export interface SupplierEmailPreview {
  kind: string;
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  attachments: SupplierEmailAttachmentItem[];
}
