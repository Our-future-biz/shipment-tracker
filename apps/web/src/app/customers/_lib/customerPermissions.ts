// Deleting a customer, a contact or an address is for superadmins only. A delete only hides the
// record: it stays in the database (invoices, jobs and quotes still point at it) and can be restored.
// The API enforces the same rule; this only decides whether the Delete action is shown.

export interface CustomerPermissionUser {
  role: string;
}

/** Whether `user` may delete (hide) customers, their contacts and addresses. */
export const canDeleteCustomerRecords = (user: CustomerPermissionUser | null | undefined): boolean =>
  user?.role === "superadmin";
