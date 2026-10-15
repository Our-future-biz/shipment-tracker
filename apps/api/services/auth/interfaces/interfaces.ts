/** A saved set of visible columns for one screen */
export interface ColumnTemplateItem {
  id: string;
  userId: string;
  name: string;
  columns: string[];
}

/** Who receives system alerts (e.g. missing ČNB rates). */
export interface AdminContact {
  email: string;
  displayName: string;
}
