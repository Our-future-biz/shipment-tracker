// The count on the Approvals tab of Shipments → Managers: the requests waiting in its queues
// (releases on prepayment, changes of Customs Office, changes of an approved document), each read
// on its own. However many queues there are, the rule is one: add up what was read, and say so
// when a queue was not.

/** One queue as its hook reports it: `isError` when it could not be read (its `waiting` is then 0). */
export interface ApprovalQueue {
  waiting: number;
  isError: boolean;
}

/**
 * What the tab's pill says, or null for no pill. A queue that could not be read is not an empty
 * one: with all of them unread the count is "–", with some it is at least what the others hold ("3+").
 */
export function approvalsBadge(queues: readonly ApprovalQueue[]): string | null {
  const read = queues.filter((q) => !q.isError);
  const waiting = read.reduce((sum, q) => sum + q.waiting, 0);
  if (read.length === 0) return queues.length > 0 ? "–" : null;
  if (read.length < queues.length) return `${waiting}+`;
  return waiting > 0 ? String(waiting) : null;
}
