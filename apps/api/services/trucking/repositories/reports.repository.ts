import { sql, type SQL } from "drizzle-orm";
import { db } from "../db/db";
import { legCostParts } from "./legCost.sql";
import type { ChargeableFactors, MarginFloor } from "../interfaces/interfaces";
import type {
  DeliveredGroup,
  ExceptionGroup,
  FailedReasonGroup,
  HaulierAmount,
  HaulierCost,
  HaulierPerf,
  InternalGroup,
  MarginGroup,
  PodOpen,
  PodPair,
  ReportPeriod,
} from "../lib/reportCalc";

// Read-only grouped queries of the Trucking Reports (Phase 7). Every query counts and sums in
// the database over the period's rows of one company and returns one row per group, never a row
// per consignment; lib/reportCalc.ts turns the groups into the KPIs. Days are Prague days.
//
// The consignments delivered in the period (the `delivered` CTE) carry what every KPI reads:
//   promised   the final promised date: FTL the planned-pick-up one, LTL only once the gate-in
//              made it final (promised_final)
//   cost_czk   the haulier cost: per live leg (legCost.sql) the real amount of the approved
//              haulier invoice line, else the estimate; without any priced leg the estimate from
//              pricing (est_buy_czk). lib/haulierCost.ts works it out the same way per consignment.
//   haulier    the haulier of the last leg (who delivered it)

const TZ = "Europe/Prague";

const n = (v: unknown) => Number(v ?? 0);
const s = (v: unknown) => (v == null ? null : String(v));

/** The instant a Prague day starts. */
const dayStart = (day: string) => sql`((${day}::date)::timestamp AT TIME ZONE ${TZ})`;
/** The instant after a Prague day ends. */
const dayEnd = (day: string) => sql`(((${day}::date) + 1)::timestamp AT TIME ZONE ${TZ})`;
const inPeriod = (column: SQL, p: ReportPeriod) => sql`${column} >= ${dayStart(p.from)} AND ${column} < ${dayEnd(p.to)}`;
const pragueDay = (column: SQL) => sql`((${column} AT TIME ZONE ${TZ})::date)::text`;

/** The CTEs dc (the delivered consignments), p (their leg cost parts) and d (one row each, with cost and haulier). */
function deliveredCtes(companyId: string, p: ReportPeriod, f: ChargeableFactors, floor: MarginFloor): SQL {
  return sql`
    WITH dc AS (
      SELECT c.id, c.company_id, c.scope, coalesce(c.service_level, '') AS service_level, c.internal, c.customer_id, c.customer_name,
        coalesce(c.pickup->>'postcode', '') AS from_pc, coalesce(c.delivery->>'postcode', '') AS to_pc,
        (c.delivered_at AT TIME ZONE ${TZ})::date AS delivered_day, c.delivered_at, c.pod_received_at,
        CASE WHEN c.scope = 'LTL' AND NOT c.promised_final THEN NULL ELSE c.promised_date END AS promised,
        c.sell_czk, c.est_buy_czk,
        coalesce(nullif(c.chargeable_kg, 0), greatest(
          coalesce((c.load->>'weightKg')::numeric, 0),
          coalesce((c.load->>'ldm')::numeric, 0) * ${f.kgPerLdm},
          coalesce((c.load->>'cbm')::numeric, 0) * ${f.kgPerCbm},
          coalesce((c.load->>'palletPlaces')::numeric, 0) * ${f.kgPerPalletPlace})) AS kg,
        coalesce((c.load->>'palletPlaces')::numeric, 0) AS pallets,
        (coalesce((c.delivery->>'avizaceRequired')::boolean, false) OR coalesce((c.load->>'b2c')::boolean, false)) AS avizace_needed,
        (c.avizace IS NOT NULL AND (c.avizace->>'at')::timestamptz <= c.delivered_at) AS avizace_before,
        EXISTS (SELECT 1 FROM trucking_exception e WHERE e.consignment_id = c.id AND e.deleted_at IS NULL AND e.kind = 'FAILED_DELIVERY') AS failed,
        EXISTS (SELECT 1 FROM trucking_exception e WHERE e.consignment_id = c.id AND e.deleted_at IS NULL AND e.kind = 'FAILED_DELIVERY' AND e.cause = 'CUSTOMER') AS customer_failed
      FROM trucking_consignment c
      WHERE c.company_id = ${companyId} AND c.deleted_at IS NULL AND c.cancelled_at IS NULL AND ${inPeriod(sql`c.delivered_at`, p)}
    ),
    p AS (${legCostParts(companyId, sql`SELECT id FROM dc`)}),
    cost AS (
      SELECT consignment_id, sum(coalesce(real_czk, est_czk)) AS cost_czk, bool_and(real_czk IS NOT NULL) AS all_real
      FROM p WHERE coalesce(real_czk, est_czk) IS NOT NULL GROUP BY consignment_id
    ),
    last_leg AS (
      SELECT DISTINCT ON (consignment_id) consignment_id, haulier_id, haulier_name FROM p ORDER BY consignment_id, seq DESC
    ),
    d0 AS (
      SELECT dc.*, coalesce(cost.cost_czk, dc.est_buy_czk) AS cost_czk, coalesce(cost.all_real, false) AS cost_real,
        last_leg.haulier_id, last_leg.haulier_name
      FROM dc LEFT JOIN cost ON cost.consignment_id = dc.id LEFT JOIN last_leg ON last_leg.consignment_id = dc.id
    ),
    d AS (
      SELECT d0.*,
        (d0.sell_czk IS NOT NULL AND d0.cost_czk IS NOT NULL AND (
          (d0.sell_czk > 0 AND (d0.sell_czk - d0.cost_czk) / d0.sell_czk * 100 < ${floor.percent}) OR (d0.sell_czk - d0.cost_czk) < ${floor.minAmountCzk})) AS below_floor
      FROM d0
    )`;
}

/** The rows of a query (drizzle on node-postgres returns { rows }). */
async function rows(query: SQL): Promise<Record<string, unknown>[]> {
  return (await db.execute<Record<string, unknown>>(query)).rows;
}

export interface ReportScope {
  companyId: string;
  period: ReportPeriod;
  factors: ChargeableFactors;
  floor: MarginFloor;
}

class ReportsRepository {
  /** Delivered consignments per scope × service level × internal (on time, first attempt, avizace, cost, margin, sell). */
  async deliveredGroups(q: ReportScope): Promise<DeliveredGroup[]> {
    const out = await rows(sql`${deliveredCtes(q.companyId, q.period, q.factors, q.floor)}
      SELECT scope, service_level, internal,
        count(*) AS delivered,
        count(*) FILTER (WHERE customer_failed) AS customer_failed,
        count(*) FILTER (WHERE NOT customer_failed AND promised IS NULL) AS no_promise,
        count(*) FILTER (WHERE NOT customer_failed AND promised IS NOT NULL AND delivered_day <= promised) AS on_time,
        count(*) FILTER (WHERE failed) AS failed,
        count(*) FILTER (WHERE avizace_needed) AS avizace_needed,
        count(*) FILTER (WHERE avizace_needed AND avizace_before) AS avizace_before,
        count(*) FILTER (WHERE cost_czk IS NOT NULL) AS costed,
        count(*) FILTER (WHERE cost_real) AS cost_real,
        sum(cost_czk) AS cost_czk,
        sum(kg) FILTER (WHERE cost_czk IS NOT NULL) AS cost_kg,
        sum(pallets) FILTER (WHERE cost_czk IS NOT NULL) AS pallets,
        sum(cost_czk) FILTER (WHERE pallets > 0) AS pallet_cost_czk,
        count(*) FILTER (WHERE sell_czk IS NOT NULL AND cost_czk IS NOT NULL) AS margined,
        sum(sell_czk) FILTER (WHERE cost_czk IS NOT NULL) AS margin_sell_czk,
        sum(cost_czk) FILTER (WHERE sell_czk IS NOT NULL) AS margin_buy_czk,
        count(*) FILTER (WHERE below_floor) AS below_floor,
        sum(sell_czk) AS sell_czk
      FROM d GROUP BY scope, service_level, internal`);
    return out.map((r) => ({
      scope: r.scope as "FTL" | "LTL",
      serviceLevel: String(r.service_level ?? ""),
      internal: r.internal === true,
      delivered: n(r.delivered),
      customerFailed: n(r.customer_failed),
      noPromise: n(r.no_promise),
      onTime: n(r.on_time),
      failed: n(r.failed),
      avizaceNeeded: n(r.avizace_needed),
      avizaceBefore: n(r.avizace_before),
      costed: n(r.costed),
      costReal: n(r.cost_real),
      costCzk: n(r.cost_czk),
      costKg: n(r.cost_kg),
      pallets: n(r.pallets),
      palletCostCzk: n(r.pallet_cost_czk),
      margined: n(r.margined),
      marginSellCzk: n(r.margin_sell_czk),
      marginBuyCzk: n(r.margin_buy_czk),
      belowFloor: n(r.below_floor),
      sellCzk: n(r.sell_czk),
    }));
  }

  /** Road consignments with a sell and a cost, per customer, per lane (pick-up → delivery postcode) and per service level. */
  async marginGroups(q: ReportScope): Promise<MarginGroup[]> {
    const out = await rows(sql`${deliveredCtes(q.companyId, q.period, q.factors, q.floor)},
      m AS (SELECT * FROM d WHERE NOT internal AND sell_czk IS NOT NULL AND cost_czk IS NOT NULL)
      SELECT 'customer' AS dim, customer_id::text AS key, max(customer_name) AS label, count(*) AS consignments,
        sum(sell_czk) AS sell_czk, sum(cost_czk) AS buy_czk, count(*) FILTER (WHERE below_floor) AS below_floor
      FROM m GROUP BY customer_id
      UNION ALL
      SELECT 'lane', from_pc || '>' || to_pc, '', count(*), sum(sell_czk), sum(cost_czk), count(*) FILTER (WHERE below_floor)
      FROM m GROUP BY from_pc, to_pc
      UNION ALL
      SELECT 'serviceLevel', service_level, '', count(*), sum(sell_czk), sum(cost_czk), count(*) FILTER (WHERE below_floor)
      FROM m GROUP BY service_level`);
    return out.map((r) => ({
      dim: r.dim as MarginGroup["dim"],
      key: String(r.key ?? ""),
      label: String(r.label ?? ""),
      consignments: n(r.consignments),
      sellCzk: n(r.sell_czk),
      buyCzk: n(r.buy_czk),
      belowFloor: n(r.below_floor),
    }));
  }

  /** Delivered day → POD day of the period's delivered consignments that have their POD, per delivering haulier. */
  async podPairs(q: ReportScope): Promise<PodPair[]> {
    const out = await rows(sql`${deliveredCtes(q.companyId, q.period, q.factors, q.floor)}
      SELECT delivered_day::text AS delivered_day, ${pragueDay(sql`pod_received_at`)} AS pod_day, haulier_id::text AS haulier_id, count(*) AS n
      FROM d WHERE pod_received_at IS NOT NULL GROUP BY 1, 2, 3`);
    return out.map((r) => ({ deliveredDay: String(r.delivered_day), podDay: String(r.pod_day), haulierId: s(r.haulier_id), n: n(r.n) }));
  }

  /** On time and first attempt of the period's delivered consignments, per delivering haulier. */
  async haulierPerf(q: ReportScope): Promise<HaulierPerf[]> {
    const out = await rows(sql`${deliveredCtes(q.companyId, q.period, q.factors, q.floor)}
      SELECT haulier_id::text AS haulier_id, max(haulier_name) AS haulier_name, count(*) AS delivered,
        count(*) FILTER (WHERE NOT customer_failed AND promised IS NOT NULL) AS measured,
        count(*) FILTER (WHERE NOT customer_failed AND promised IS NOT NULL AND delivered_day <= promised) AS on_time,
        count(*) FILTER (WHERE failed) AS failed
      FROM d WHERE haulier_id IS NOT NULL GROUP BY haulier_id`);
    return out.map((r) => ({
      haulierId: String(r.haulier_id),
      haulierName: s(r.haulier_name),
      delivered: n(r.delivered),
      measured: n(r.measured),
      onTime: n(r.on_time),
      failed: n(r.failed),
    }));
  }

  /** Each haulier's cost parts of the period's delivered consignments: trips, partner deliveries, consignments, cost and their kg. */
  async haulierCosts(q: ReportScope): Promise<HaulierCost[]> {
    const out = await rows(sql`${deliveredCtes(q.companyId, q.period, q.factors, q.floor)},
      hc AS (
        SELECT p.haulier_id, p.consignment_id, max(p.haulier_name) AS haulier_name, sum(coalesce(p.real_czk, p.est_czk)) AS cost_czk,
          array_agg(DISTINCT p.trip_id) FILTER (WHERE p.trip_id IS NOT NULL) AS trips,
          array_agg(DISTINCT p.leg_id) FILTER (WHERE p.trip_id IS NULL) AS partner_legs
        FROM p WHERE p.haulier_id IS NOT NULL GROUP BY p.haulier_id, p.consignment_id
      )
      SELECT hc.haulier_id::text AS haulier_id, max(hc.haulier_name) AS haulier_name,
        (SELECT count(DISTINCT x) FROM hc h2, unnest(h2.trips) AS x WHERE h2.haulier_id = hc.haulier_id) AS trips,
        (SELECT count(DISTINCT x) FROM hc h2, unnest(h2.partner_legs) AS x WHERE h2.haulier_id = hc.haulier_id) AS partner_legs,
        count(*) AS consignments, sum(hc.cost_czk) AS cost_czk, sum(dc.kg) FILTER (WHERE hc.cost_czk IS NOT NULL) AS cost_kg
      FROM hc JOIN dc ON dc.id = hc.consignment_id GROUP BY hc.haulier_id`);
    return out.map((r) => ({
      haulierId: String(r.haulier_id),
      haulierName: s(r.haulier_name),
      trips: n(r.trips),
      partnerLegs: n(r.partner_legs),
      consignments: n(r.consignments),
      costCzk: n(r.cost_czk),
      costKg: n(r.cost_kg),
    }));
  }

  /** Failed-delivery exceptions of the period's delivered consignments, per reason. */
  async failedReasons(q: ReportScope): Promise<FailedReasonGroup[]> {
    const out = await rows(sql`${deliveredCtes(q.companyId, q.period, q.factors, q.floor)}
      SELECT coalesce(e.failed_reason, 'OTHER') AS reason, count(*) AS n
      FROM trucking_exception e JOIN dc ON dc.id = e.consignment_id
      WHERE e.deleted_at IS NULL AND e.kind = 'FAILED_DELIVERY' GROUP BY 1`);
    return out.map((r) => ({ reason: String(r.reason), n: n(r.n) }));
  }

  /** Delivered, not cancelled and no POD — now, whenever delivered — per delivered day and delivering haulier. */
  async podOpen(companyId: string): Promise<PodOpen[]> {
    const out = await rows(sql`
      SELECT ${pragueDay(sql`c.delivered_at`)} AS delivered_day, h.haulier_id::text AS haulier_id, h.haulier_name, count(*) AS n
      FROM trucking_consignment c
      LEFT JOIN LATERAL (
        SELECT coalesce(t.haulier_customer_id, l.haulier_customer_id) AS haulier_id, t.haulier_name
        FROM trucking_leg l LEFT JOIN trucking_trip t ON t.id = l.trip_id
        WHERE l.consignment_id = c.id AND l.deleted_at IS NULL ORDER BY l.seq DESC LIMIT 1
      ) h ON true
      WHERE c.company_id = ${companyId} AND c.deleted_at IS NULL AND c.cancelled_at IS NULL AND c.delivered_at IS NOT NULL AND c.pod_received_at IS NULL
      GROUP BY 1, 2, 3`);
    return out.map((r) => ({ deliveredDay: String(r.delivered_day), haulierId: s(r.haulier_id), haulierName: s(r.haulier_name), n: n(r.n) }));
  }

  /** LTL line hauls and delivery runs that departed in the period, each with the LDM and kg of its live legs' consignments. */
  async fillTrips(companyId: string, period: ReportPeriod): Promise<{ kind: "LINEHAUL" | "DELIVERY_RUN"; vehicleTypeCode: string | null; ldm: number; kg: number }[]> {
    const out = await rows(sql`
      SELECT t.id, t.kind, t.vehicle_type_code,
        sum(coalesce((c.load->>'ldm')::numeric, 0)) AS ldm, sum(coalesce((c.load->>'weightKg')::numeric, 0)) AS kg
      FROM trucking_trip t
      LEFT JOIN trucking_leg l ON l.trip_id = t.id AND l.deleted_at IS NULL
      LEFT JOIN trucking_consignment c ON c.id = l.consignment_id AND c.cancelled_at IS NULL AND c.deleted_at IS NULL
      WHERE t.company_id = ${companyId} AND t.deleted_at IS NULL AND t.cancelled_at IS NULL AND t.kind IN ('LINEHAUL', 'DELIVERY_RUN')
        AND ${inPeriod(sql`t.departed_at`, period)}
      GROUP BY t.id, t.kind, t.vehicle_type_code`);
    return out.map((r) => ({ kind: r.kind as "LINEHAUL" | "DELIVERY_RUN", vehicleTypeCode: s(r.vehicle_type_code), ldm: n(r.ldm), kg: n(r.kg) }));
  }

  /** Delivery exceptions created in the period, per kind and decision. */
  async exceptionGroups(companyId: string, period: ReportPeriod): Promise<ExceptionGroup[]> {
    const out = await rows(sql`
      SELECT kind, decision, count(*) AS n FROM trucking_exception
      WHERE company_id = ${companyId} AND deleted_at IS NULL AND ${inPeriod(sql`created_at`, period)}
      GROUP BY kind, decision`);
    return out.map((r) => ({ kind: String(r.kind), decision: String(r.decision), n: n(r.n) }));
  }

  /** Claims against hauliers (CLAIM_HAULIER exceptions) created in the period, per haulier, currency and day. */
  async claims(companyId: string, period: ReportPeriod): Promise<HaulierAmount[]> {
    const out = await rows(sql`
      SELECT claim_haulier_customer_id::text AS haulier_id, currency, ${pragueDay(sql`created_at`)} AS day, count(*) AS n, sum(coalesce(amount, 0)) AS amount
      FROM trucking_exception
      WHERE company_id = ${companyId} AND deleted_at IS NULL AND decision = 'CLAIM_HAULIER' AND claim_haulier_customer_id IS NOT NULL
        AND ${inPeriod(sql`created_at`, period)}
      GROUP BY 1, 2, 3`);
    return out.map((r) => ({ haulierId: String(r.haulier_id), currency: String(r.currency), day: String(r.day), n: n(r.n), amount: n(r.amount) }));
  }

  /** Invoices blocked now, per haulier. */
  async invoicesBlocked(companyId: string): Promise<{ haulierId: string; n: number }[]> {
    const out = await rows(sql`
      SELECT haulier_customer_id::text AS haulier_id, count(*) AS n FROM trucking_haulier_invoice
      WHERE company_id = ${companyId} AND deleted_at IS NULL AND status = 'BLOCKED' GROUP BY 1`);
    return out.map((r) => ({ haulierId: String(r.haulier_id), n: n(r.n) }));
  }

  /** Σ |difference| of the invoices approved in the period, per haulier, currency and issue date. */
  async invoiceDifferences(companyId: string, period: ReportPeriod): Promise<HaulierAmount[]> {
    const out = await rows(sql`
      SELECT haulier_customer_id::text AS haulier_id, currency, issue_date::text AS day, count(*) AS n, sum(abs(difference)) AS amount
      FROM trucking_haulier_invoice
      WHERE company_id = ${companyId} AND deleted_at IS NULL AND status = 'APPROVED' AND ${inPeriod(sql`approved_at`, period)}
      GROUP BY 1, 2, 3`);
    return out.map((r) => ({ haulierId: String(r.haulier_id), currency: String(r.currency), day: String(r.day), n: n(r.n), amount: n(r.amount) }));
  }

  /**
   * Internal charges per receiving department: charges (and exception charges) whose consignment
   * was delivered in the period, adjustments by the day they were written.
   */
  async internalGroups(companyId: string, period: ReportPeriod): Promise<InternalGroup[]> {
    const out = await rows(sql`
      SELECT department, sum(amount) AS amount, count(DISTINCT consignment_id) FILTER (WHERE kind <> 'ADJUSTMENT') AS consignments
      FROM trucking_internal_charge
      WHERE company_id = ${companyId}
        AND ((kind <> 'ADJUSTMENT' AND ${inPeriod(sql`delivered_at`, period)}) OR (kind = 'ADJUSTMENT' AND ${inPeriod(sql`created_at`, period)}))
      GROUP BY department`);
    return out.map((r) => ({ department: String(r.department), amountCzk: n(r.amount), consignments: n(r.consignments) }));
  }

  /**
   * Consignments still open (not ready to bill, not cancelled) priced with one of these tariff
   * versions: their sell, their trips' or partner deliveries' buy, or an internal charge.
   */
  async openConsignmentsPricedWith(companyId: string, versionIds: string[]): Promise<number> {
    if (!versionIds.length) return 0;
    const ids = sql`ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(versionIds)}::jsonb))`;
    const [r] = await rows(sql`
      SELECT count(*) AS n FROM trucking_consignment c
      WHERE c.company_id = ${companyId} AND c.deleted_at IS NULL AND c.status NOT IN ('READY_TO_BILL', 'CANCELLED')
        AND (c.sell->>'tariffVersionId' = ANY(${ids})
          OR EXISTS (SELECT 1 FROM trucking_leg l LEFT JOIN trucking_trip t ON t.id = l.trip_id
                     WHERE l.consignment_id = c.id AND l.deleted_at IS NULL
                       AND (t.buy->>'tariffVersionId' = ANY(${ids}) OR l.buy->>'tariffVersionId' = ANY(${ids})))
          OR EXISTS (SELECT 1 FROM trucking_internal_charge ic WHERE ic.consignment_id = c.id AND ic.tariff_version_id::text = ANY(${ids})))`);
    return n(r?.n);
  }
}

export const reportsRepository = new ReportsRepository();
