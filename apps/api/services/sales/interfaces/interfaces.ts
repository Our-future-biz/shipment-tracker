// Plain interfaces for controllers. Never import Drizzle table types here.

export interface TermsConditionItem {
  id: string;
  name: string;
  includes: string;
  excludes: string;
  createdAt: string;
  updatedAt: string;
}
