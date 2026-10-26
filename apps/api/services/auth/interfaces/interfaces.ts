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
}

export interface AdminContact {
  email: string;
  displayName: string;
}
