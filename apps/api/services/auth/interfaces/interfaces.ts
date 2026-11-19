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
  /** The user's e-mail: how a person is recorded wherever someone is picked. */
  email: string;
  role: string;
  /**
   * Set only for a superadmin found outside the company asked about (userLookup orSuperadmin): the
   * company their own record is in.
   */
  homeCompanyId?: string;
}

export interface AdminContact {
  email: string;
  displayName: string;
  /** The admin's own company: an alert goes to each company's admins apart, never in one list. */
  companyId: string;
  /** "admin" or "superadmin" (a superadmin works for every company, so is written to on their own). */
  role: string;
}

// ─── Users' absences (Council Outlay 11, D12) ───────────────────────

/** A user's absence as the company sees it (Settings → Users and the user menu: "Away"). */
export interface UserAbsenceItem {
  id: string;
  /** Who is away. */
  userId: string;
  userName: string;
  userEmail: string;
  /** Prague days, YYYY-MM-DD, both included. */
  fromDate: string;
  toDate: string;
  /** Who covers meanwhile; null for nobody named. */
  coverUserId: string | null;
  /** The cover's name and e-mail; null when none is named or the cover is no active user any more. */
  coverName: string | null;
  coverEmail: string | null;
  /** Seen by the absent person and the managers (superadmin, admin, manager) only - it may hold health information; "" for anybody else. */
  note: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  /** Whether the caller may change or delete it: their own, or anybody's for a manager, an admin or a superadmin. */
  mayChange: boolean;
}

/** An absence of any company that covers the day asked about, or ended within the 14 days before it (the cover job's read). */
export interface AbsenceInForce {
  id: string;
  companyId: string;
  userId: string;
  userEmail: string;
  userName: string;
  fromDate: string;
  toDate: string;
  /** It covers the day asked about (from ≤ day ≤ to); false: it ended before it. */
  inForce: boolean;
  coverUserId: string | null;
  /** The cover's e-mail; null when none is named or the cover is no active user any more. */
  coverEmail: string | null;
  coverName: string | null;
}
