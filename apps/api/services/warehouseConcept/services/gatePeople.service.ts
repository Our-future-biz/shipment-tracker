import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "../db/db";
import { gateMovementTable } from "../schemas/gateMovement.schema";
import { warehouseTaskTable } from "../schemas/warehouseTask.schema";
import type { CompanyUser } from "../../../lib/personPick";
import type { PeopleNormalizeResult } from "../interfaces/gate.interfaces";
import { normalizedOwner } from "./shipmentOwner";
import { normalizedPerson } from "./pickedUser";

const g = gateMovementTable;
const w = warehouseTaskTable;

type Stored = { value: string; count: number }[];

// What the backfill does with the stored values of one field: the renames to make and the values
// no single user fits (a value that already is a user's e-mail is neither).
function plan(field: string, stored: Stored, users: CompanyUser[], to: (value: string, users: CompanyUser[]) => string | null) {
  let checked = 0;
  const changes: { from: string; to: string }[] = [];
  const unmatched: PeopleNormalizeResult["unmatched"] = [];
  for (const { value, count } of stored) {
    checked += count;
    const next = to(value, users);
    if (next !== null) changes.push({ from: value, to: next });
    else if (!users.some((u) => u.email === value)) unmatched.push({ field, value, count });
  }
  return { checked, changes, unmatched };
}

class GatePeopleService {
  // The backfill: every stored Shipment Owner of the company's gate records and every assignee of
  // its warehouse positions (archived ones too — only the way the same person is written changes)
  // becomes the e-mail of the one user it names, and the old walk-in placeholder becomes empty.
  // Values no single user fits stay and are reported. Running it again changes nothing. The rows'
  // updatedAt is left alone: nobody edited them.
  async normalize(companyId: string, users: CompanyUser[]): Promise<PeopleNormalizeResult> {
    const owners = plan(
      "shipmentOwner",
      await db
        .select({ value: g.shipmentOwner, count: sql<number>`count(*)::int` })
        .from(g)
        .where(and(eq(g.companyId, companyId), ne(g.shipmentOwner, "")))
        .groupBy(g.shipmentOwner),
      users,
      normalizedOwner,
    );
    const assignees = plan(
      "assignee",
      await db
        .select({ value: w.assignee, count: sql<number>`count(*)::int` })
        .from(w)
        .where(and(eq(w.companyId, companyId), ne(w.assignee, "")))
        .groupBy(w.assignee),
      users,
      normalizedPerson,
    );

    const changed = await db.transaction(async (tx) => {
      let n = 0;
      for (const { from, to } of owners.changes) {
        const rows = await tx
          .update(g)
          .set({ shipmentOwner: to })
          .where(and(eq(g.companyId, companyId), eq(g.shipmentOwner, from)))
          .returning({ id: g.id });
        n += rows.length;
      }
      for (const { from, to } of assignees.changes) {
        const rows = await tx
          .update(w)
          .set({ assignee: to })
          .where(and(eq(w.companyId, companyId), eq(w.assignee, from)))
          .returning({ id: w.id });
        n += rows.length;
      }
      return n;
    });
    const unmatched = [...owners.unmatched, ...assignees.unmatched].sort(
      (a, b) => b.count - a.count || a.field.localeCompare(b.field) || a.value.localeCompare(b.value),
    );
    return { checked: owners.checked + assignees.checked, changed, unmatched };
  }
}

export const gatePeopleService = new GatePeopleService();
