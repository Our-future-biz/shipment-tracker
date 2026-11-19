"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { invalidateAfterManagerAction, MANAGERS_COCKPIT_KEY } from "@/hooks/useShipmentManagerActions";
import { passRereadAt, releasePassRead, releasePassUsable, type ReleasePassRead } from "@/lib/paymentWarnings";

export type ReleaseRequestItem = interfaces.ReleaseRequestItem;
export type ReleaseRequestWhat = interfaces.ReleaseRequestWhat;

// "Ask a manager to release" (Council Outlay 11, D16): a user the prepayment stop refused asks where they were
// refused, a manager answers in the Approvals tab of Shipments → Managers, and the answer reaches the one who
// asked under the bell. Approving releases nothing: it is a pass for that job and that release, good for 7 days
// and for one release, which whoever makes the release then makes the usual way. Built as the Customs Office
// request's hooks are.

/** The queue's key: the bell's count of waiting approvals reads the same answer (useOperationsApprovalsWaiting). */
export const RELEASE_REQUESTS_KEY = ["release-requests"] as const;

/** Every job's own requests (the newest of each thing asked), whatever the job. */
const JOB_REQUESTS_KEY = ["release-request"] as const;

const keys = {
  list: RELEASE_REQUESTS_KEY,
  answers: ["release-request-answers"] as const,
  shipment: (shipmentId: string) => [...JOB_REQUESTS_KEY, shipmentId] as const,
};

/** How often a job's requests are read again while a release dialog is open: a manager may answer meanwhile. */
const DIALOG_POLL_MS = 30_000;
/** How long a release dialog waits for the job's requests before it goes on without them (as the payment check). */
const PASS_WAIT_MS = 3000;

// A job's newest request of each thing asked. Read again each time a place that shows it opens: whether a
// release is still stopped or goes through on an approval is said from it, and a manager may just have answered.
// `poll`: while a release dialog is open, every 30 seconds; never otherwise.
const latestQuery = (shipmentId: string, enabled: boolean, poll = false) => ({
  queryKey: keys.shipment(shipmentId),
  queryFn: async () => (await api.shipments.releaseRequestLatest(shipmentId)).requests,
  enabled: enabled && !!shipmentId,
  staleTime: 0,
  // Tried once more only: a dialog waits for this read, and says so when it could not be made.
  retry: 1,
  refetchInterval: poll ? DIALOG_POLL_MS : (false as const),
});

/** The jobs' own requests are read again: an answer arrived, an approval was used, or its time is over. */
export function invalidateJobReleaseRequests(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: JOB_REQUESTS_KEY });
}

/**
 * After a release that may have used an approval (or been refused although one seemed to stand): the jobs'
 * requests, the managers' queue and the askers' answers are read again - a used approval is no longer a pass.
 */
export function invalidateReleaseRequests(queryClient: QueryClient) {
  invalidateJobReleaseRequests(queryClient);
  queryClient.invalidateQueries({ queryKey: keys.list });
  queryClient.invalidateQueries({ queryKey: keys.answers });
}

/**
 * The job's requests as the server holds them right now, read after a release: whether it went through on an
 * approval is worded from this, not from what was read before it. null when they could not be read.
 */
export async function readReleaseRequests(queryClient: QueryClient, shipmentId: string): Promise<ReleaseRequestItem[] | null> {
  try {
    return await queryClient.fetchQuery({ queryKey: keys.shipment(shipmentId), queryFn: async () => (await api.shipments.releaseRequestLatest(shipmentId)).requests, staleTime: 0 });
  } catch {
    return null;
  }
}

/** When `active` last turned on (Date.now()), null while it is off - set after the render in which it turns on. */
function useActiveSince(active: boolean): number | null {
  const [since, setSince] = useState<number | null>(null);
  useEffect(() => {
    setSince(active ? Date.now() : null);
  }, [active]);
  return active ? since : null;
}

/** Turns true once `active` has lasted `ms` without being turned off. */
function useTimedOut(active: boolean, ms = PASS_WAIT_MS): boolean {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    setTimedOut(false);
    if (!active) return;
    const t = setTimeout(() => setTimedOut(true), ms);
    return () => clearTimeout(t);
  }, [active, ms]);
  return timedOut;
}

/**
 * An approval the server called usable whose time is over on this clock by more than a minute: the jobs'
 * requests are read again then, and what the server says is shown - this clock alone never calls one run out.
 */
function useRereadWhenOver(reads: readonly { requests: readonly ReleaseRequestItem[] | undefined; readAt: number }[]) {
  const queryClient = useQueryClient();
  let due: number | null = null;
  for (const r of reads) {
    const at = r.requests ? passRereadAt(r.requests, r.readAt) : null;
    if (at !== null) due = due === null ? at : Math.min(due, at);
  }
  useEffect(() => {
    if (due === null) return;
    const t = setTimeout(() => invalidateJobReleaseRequests(queryClient), Math.max(0, due - Date.now()));
    return () => clearTimeout(t);
  }, [due, queryClient]);
}

type LatestRead = { data: ReleaseRequestItem[] | undefined; dataUpdatedAt: number; isError: boolean; errorUpdatedAt: number };

const readOf = (q: LatestRead, asked: boolean, since: number | null, timedOut: boolean): ReleasePassRead =>
  releasePassRead({ asked, since, hasData: q.data !== undefined, dataUpdatedAt: q.dataUpdatedAt, isError: q.isError, errorUpdatedAt: q.errorUpdatedAt, timedOut });

/**
 * Where a release is made from: the job's newest request of each thing asked, and asking for one. `read` says
 * whether the requests were read since this place opened ("checking" until then, "failed" when they could not be):
 * a place that would say "stopped" waits for it.
 */
export const useReleaseRequest = (shipmentId: string | null | undefined, enabled = true) => {
  const queryClient = useQueryClient();
  const id = shipmentId ?? "";
  const asked = enabled && !!id;
  const query = useQuery(latestQuery(id, enabled));
  const since = useActiveSince(asked);
  const fresh = query.data !== undefined && since !== null && query.dataUpdatedAt >= since;
  const timedOut = useTimedOut(asked && !fresh);
  useRereadWhenOver([{ requests: query.data, readAt: query.dataUpdatedAt }]);
  const ask = useMutation({
    mutationFn: async (request: { what: ReleaseRequestWhat; reason: string }) => (await api.shipments.releaseRequestAsk(id, request)).request,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: keys.shipment(id) });
      queryClient.invalidateQueries({ queryKey: keys.list });
      queryClient.invalidateQueries({ queryKey: MANAGERS_COCKPIT_KEY });
    },
  });
  const requests = query.data ?? [];
  return {
    requests,
    /** The job's newest request for this release; null for none (or not read yet). */
    latestOf: (what: ReleaseRequestWhat): ReleaseRequestItem | null => requests.find((r) => r.what === what) ?? null,
    read: readOf(query, asked, since, timedOut),
    ask,
  };
};

/** What a release dialog knows of an approval for the job: the pass, once the requests were read since it opened. */
export interface ReleasePassState {
  /** The approval that lets this release through right now; null for none, and while `read` is not "read". */
  pass: ReleaseRequestItem | null;
  read: ReleasePassRead;
}

/**
 * The approval that lets this release of the job through, for a release dialog that is open (`active`): it then
 * says the release goes through on it, where it would otherwise say the release is stopped. Nothing is said of
 * "stopped" before the requests were read since the dialog opened, and they are read again every 30 seconds
 * while it is open. The server decides either way.
 */
export const useReleasePass = (shipmentId: string | null | undefined, what: ReleaseRequestWhat, active = true): ReleasePassState => {
  const id = shipmentId ?? "";
  const asked = active && !!id;
  const query = useQuery(latestQuery(id, active, true));
  const since = useActiveSince(asked);
  const fresh = query.data !== undefined && since !== null && query.dataUpdatedAt >= since;
  const timedOut = useTimedOut(asked && !fresh);
  useRereadWhenOver([{ requests: asked ? query.data : undefined, readAt: query.dataUpdatedAt }]);
  const read = readOf(query, asked, since, timedOut);
  const latest = query.data?.find((r) => r.what === what) ?? null;
  return { pass: asked && read === "read" && releasePassUsable(latest) ? latest : null, read };
};

/** The same for several jobs released together (Stock → release to truck). */
export interface ReleasePassesState {
  /** Each job's usable approval, by its id. */
  passes: Map<string, ReleaseRequestItem>;
  /** A job's requests are still being read: nothing is said of "stopped" yet. */
  checking: boolean;
  /** The jobs whose requests could not be read: shown as stopped, and said so. */
  failed: Set<string>;
}

export const useReleasePasses = (shipmentIds: readonly string[], what: ReleaseRequestWhat, active = true): ReleasePassesState => {
  const results = useQueries({ queries: shipmentIds.map((id) => latestQuery(id, active, true)) });
  const since = useActiveSince(active);
  const freshOf = (i: number) => results[i]?.data !== undefined && since !== null && (results[i]?.dataUpdatedAt ?? 0) >= since;
  const waiting = active && shipmentIds.some((_, i) => !freshOf(i));
  const timedOut = useTimedOut(waiting);
  useRereadWhenOver(active ? results.map((r) => ({ requests: r.data, readAt: r.dataUpdatedAt })) : []);
  const state: ReleasePassesState = { passes: new Map(), checking: false, failed: new Set() };
  if (!active) return state;
  shipmentIds.forEach((id, i) => {
    const r = results[i];
    const read = r ? readOf(r, true, since, timedOut) : "checking";
    if (read === "checking") state.checking = true;
    else if (read === "failed") state.failed.add(id);
    else {
      const latest = r?.data?.find((x) => x.what === what);
      if (latest && releasePassUsable(latest)) state.passes.set(id, latest);
    }
  });
  return state;
};

/** The Approvals tab: what waits, and what was answered or closed in the last 30 days (managers). */
export const useReleaseRequestQueue = () => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: keys.list,
    queryFn: async () => (await api.shipments.releaseRequestList()).requests,
    refetchInterval: 60_000,
  });
  const decide = useMutation({
    mutationFn: ({ id, approve, comment }: { id: string; shipmentId: string; approve: boolean; comment: string }) =>
      api.shipments.releaseRequestDecide(id, { approve, comment }),
    // Also after a refusal (answered meanwhile, closed by a release made another way): the queue is read again.
    onSettled: (_data, _err, { shipmentId }) => {
      queryClient.invalidateQueries({ queryKey: keys.list });
      queryClient.invalidateQueries({ queryKey: keys.shipment(shipmentId) });
      // Nothing is released by an answer; the cockpit and the lists are read again all the same, as after
      // every manager's action, so what they say of the job is never older than its answer.
      invalidateAfterManagerAction(queryClient);
    },
  });
  const requests = query.data ?? [];
  return {
    requests,
    waiting: requests.filter((r) => r.status === "pending").length,
    isLoading: query.isLoading,
    // A failed load must not read as "nothing to answer".
    isError: query.isError && !query.data,
    decide,
  };
};

/**
 * K20: withdraw a request - whoever asked their request still waiting, a manager an approval nobody has used yet (it
 * then lets nothing through) - with a reason. The job's requests, the queue, the bell's answers and the cockpit are
 * read again, whether the server took it or not (answered or used meanwhile).
 */
export const useWithdrawReleaseRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; shipmentId: string; reason: string }) => (await api.shipments.releaseRequestWithdraw(id, { reason })).request,
    onSettled: (_data, _err, { shipmentId }) => {
      invalidateReleaseRequests(queryClient);
      queryClient.invalidateQueries({ queryKey: keys.shipment(shipmentId) });
      invalidateAfterManagerAction(queryClient);
    },
  });
};

// The same empty list from render to render, so what is worked out from the answers is not worked out again each time.
const NO_ANSWERS: ReleaseRequestItem[] = [];

/** The bell: the answers to the signed-in user's own requests - approved (usable, used or run out) and rejected. */
export const useReleaseRequestAnswers = () => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: keys.answers,
    queryFn: async () => (await api.shipments.releaseRequestAnswers()).answers,
    refetchInterval: 30_000,
  });
  const seen = useMutation({
    mutationFn: (id: string) => api.shipments.releaseRequestSeen(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.answers }),
  });
  return { answers: query.data ?? NO_ANSWERS, hasLoaded: query.data !== undefined, seen };
};
