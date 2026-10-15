import { sql, type SQL } from "drizzle-orm";

// The haulier cost parts of consignments, one row per live leg: the estimate and the real amount
// of the approved haulier invoice line that covers it. The Reports (reports.repository) and the
// consignment views (consignment.repository legRealCosts) both read them from here, so a
// consignment's buy is the same on its page as in the Reports.
//
//   est_czk         FTL: the trip's buy; LTL leg on a trip: its cost share; partner delivery: its price
//   real_czk        the approved invoice line of its trip (an LTL leg: its share of it,
//                   cost_share / trip buy) or of the partner delivery; EUR lines at the rate of the
//                   price snapshot they were invoiced against; null when no approved line covers it
//   invoice_number  the haulier's number of that invoice
//   haulier_id      the trip's haulier, else the leg's (a partner delivery)

/** SELECT of the cost parts of the live legs of the consignments `consignmentIds` (a subquery of ids). */
export function legCostParts(companyId: string, consignmentIds: SQL): SQL {
  return sql`
    SELECT l.id AS leg_id, l.consignment_id, l.seq, l.trip_id,
      coalesce(t.haulier_customer_id, l.haulier_customer_id) AS haulier_id, t.haulier_name,
      CASE WHEN l.trip_id IS NOT NULL THEN (CASE WHEN t.kind = 'FTL' THEN t.buy_czk ELSE l.cost_share_czk END)
           ELSE (l.buy->>'totalCzk')::numeric END AS est_czk,
      CASE WHEN l.trip_id IS NOT NULL THEN r.real_czk * (CASE WHEN t.kind = 'FTL' THEN 1 ELSE l.cost_share_czk / nullif(t.buy_czk, 0) END)
           ELSE r.real_czk END AS real_czk,
      r.invoice_number
    FROM trucking_leg l
    LEFT JOIN trucking_trip t ON t.id = l.trip_id
    LEFT JOIN LATERAL (
      SELECT CASE WHEN li.currency = 'CZK' THEN li.invoiced
                  WHEN snap.buy->>'currency' = 'EUR' AND (snap.buy->>'total')::numeric > 0
                    THEN li.invoiced * (snap.buy->>'totalCzk')::numeric / (snap.buy->>'total')::numeric END AS real_czk,
        i.invoice_number
      FROM trucking_haulier_invoice_line li
      JOIN trucking_haulier_invoice i ON i.id = li.invoice_id AND i.status = 'APPROVED' AND i.deleted_at IS NULL
      CROSS JOIN LATERAL (SELECT CASE WHEN l.trip_id IS NOT NULL THEN t.buy ELSE l.buy END AS buy) snap
      WHERE li.company_id = l.company_id AND li.live AND li.deleted_at IS NULL
        AND ((l.trip_id IS NOT NULL AND li.target_kind = 'TRIP' AND li.target_id = l.trip_id)
          OR (l.trip_id IS NULL AND li.target_kind = 'PARTNER_LEG' AND li.target_id = l.id))
      LIMIT 1
    ) r ON true
    WHERE l.company_id = ${companyId} AND l.deleted_at IS NULL AND l.consignment_id IN (${consignmentIds})`;
}
