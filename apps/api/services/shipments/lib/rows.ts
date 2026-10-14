// A row without the columns that never go to clients: the tenant and the soft-delete stamp.
export function publicFields<T extends { companyId: string; deletedAt: Date | null }>(row: T): Omit<T, "companyId" | "deletedAt"> {
  const out: Partial<T> = { ...row };
  delete out.companyId;
  delete out.deletedAt;
  return out as Omit<T, "companyId" | "deletedAt">;
}
