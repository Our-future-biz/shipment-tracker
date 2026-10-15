import { sql, type SQL } from "drizzle-orm";
import { db } from "../db/db";
import { shipmentTable } from "../schemas/shipment.schema";
import { masterJobTable } from "../schemas/masterJob.schema";
import { shipmentRefCounterTable, type ShipmentRefSequence } from "../schemas/shipmentRefCounter.schema";

/** A transaction, or the database itself when no transaction is open. */
export type Tx = Pick<typeof db, "execute">;

/** CZ00000123 / MCZ00000045: the sequence's prefix and eight digits. */
export function formatRef(sequence: ShipmentRefSequence, n: number): string {
  return `${sequence}${String(n).padStart(8, "0")}`;
}

// The highest number of the sequence already stored for the company, live or archived (0 when
// there is none). Only the digits right after the prefix count, so CZQ… references and other
// free text are no CZ number. MCZ numbers can also be typed in by hand when a shipment is linked
// to a master job, so the stored rows always have the last word, not the counter alone.
export function storedMaxSql(companyId: string, sequence: ShipmentRefSequence): SQL {
  if (sequence === "MCZ") {
    return sql`(SELECT coalesce(max(substring(${masterJobTable.mczNumber} from '^MCZ([0-9]+)')::bigint), 0)
      FROM ${masterJobTable} WHERE ${masterJobTable.companyId} = ${companyId} AND ${masterJobTable.mczNumber} LIKE 'MCZ%')`;
  }
  return sql`(SELECT coalesce(max(substring(${shipmentTable.jobNumber} from '^CZ([0-9]+)')::bigint), 0)
    FROM ${shipmentTable} WHERE ${shipmentTable.companyId} = ${companyId} AND ${shipmentTable.jobNumber} LIKE 'CZ%')`;
}

// Bumps the company's counter in one statement and returns the new number. The first use
// creates the row from the highest stored number; later uses never fall below it either.
// The row stays locked until the caller's transaction ends, so a second create waits and then
// gets the next number, and a rolled-back create gives its number back.
export function allocateSql(companyId: string, sequence: ShipmentRefSequence): SQL {
  const stored = storedMaxSql(companyId, sequence);
  return sql`INSERT INTO ${shipmentRefCounterTable} (company_id, sequence, last)
    VALUES (${companyId}, ${sequence}, ${stored} + 1)
    ON CONFLICT (company_id, sequence) DO UPDATE
      SET last = GREATEST(${shipmentRefCounterTable}.last, ${stored}) + 1, updated_at = now()
    RETURNING last`;
}

// The number the next create would get, without taking it.
export function peekSql(companyId: string, sequence: ShipmentRefSequence): SQL {
  return sql`SELECT GREATEST(
      coalesce((SELECT last FROM ${shipmentRefCounterTable} WHERE company_id = ${companyId} AND sequence = ${sequence}), 0),
      ${storedMaxSql(companyId, sequence)}
    ) + 1 AS next`;
}

class ShipmentRefCounterRepository {
  /** Takes the next number of the sequence; call it inside the transaction that stores it. */
  async allocate(tx: Tx, companyId: string, sequence: ShipmentRefSequence): Promise<string> {
    const res = await tx.execute<{ last: number | string }>(allocateSql(companyId, sequence));
    return formatRef(sequence, Number(res.rows[0]!.last));
  }

  /** The number the next create would get. Only a preview: a parallel create may take it first. */
  async peek(companyId: string, sequence: ShipmentRefSequence): Promise<string> {
    const res = await db.execute<{ next: number | string }>(peekSql(companyId, sequence));
    return formatRef(sequence, Number(res.rows[0]!.next));
  }
}

export const shipmentRefCounterRepository = new ShipmentRefCounterRepository();
