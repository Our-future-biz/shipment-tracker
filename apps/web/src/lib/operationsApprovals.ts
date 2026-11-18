// The bell's one line for managers (Council Outlay 11, step 3): how many operations approvals wait on
// Shipments → Managers → Approvals - changes of an approved document, changes of a Customs Office and requests to
// release a job held for payment. Each queue is read on its own; one that could not be read is not an empty one.

/** One queue as it was read: `isError` when it could not be (its `waiting` then says nothing). */
export interface ApprovalQueueCount {
  waiting: number;
  isError: boolean;
}

/** Where the line leads: the Approvals tab of Shipments → Managers. */
export const OPERATIONS_APPROVALS_HREF = "/shipments/managers?tab=approvals";

export interface OperationsApprovalsLine {
  /** What the queues that were read hold together. */
  count: number;
  /** A queue could not be read: there are at least `count`. */
  atLeast: boolean;
  title: string;
}

/**
 * The line, or null for none: it is shown only while something is known to wait. With a queue unread the count is
 * what the others hold, marked "+" ("3+ operations approvals waiting").
 */
export function operationsApprovalsLine(queues: readonly ApprovalQueueCount[]): OperationsApprovalsLine | null {
  const read = queues.filter((q) => !q.isError);
  const count = read.reduce((sum, q) => sum + Math.max(0, q.waiting), 0);
  if (count <= 0) return null;
  const atLeast = read.length < queues.length;
  return { count, atLeast, title: `${count}${atLeast ? "+" : ""} operations approval${count === 1 && !atLeast ? "" : "s"} waiting` };
}
