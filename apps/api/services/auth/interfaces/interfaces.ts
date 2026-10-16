/** A part of the app a company can have hidden (superadmin sets it per company; superadmins always see everything). */
export type AppModule = "warehouse_concept" | "trucking_concept";

/** A saved set of visible columns for one screen */
export interface ColumnTemplateItem {
  id: string;
  userId: string;
  name: string;
  columns: string[];
}

/** Who receives system alerts (e.g. missing ČNB rates). */
/** A live user as other services see it: the name for their logs and the current role. */
export interface UserRef {
  id: string;
  /** Display name, or the e-mail when there is none. */
  name: string;
  role: string;
}

export interface AdminContact {
  email: string;
  displayName: string;
}
