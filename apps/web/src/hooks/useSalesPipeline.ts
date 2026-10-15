"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";

export type PipelineBoard = interfaces.PipelineBoard;
export type PipelineCard = interfaces.PipelineCard;
export type PipelineStage = interfaces.PipelineStage;

// Which cards a "Show more" asks for: the ones of `stage` after the `offset` already on the board
// of the period that starts with `wonSince`.
interface MoreCards {
  wonSince: string | undefined;
  stage: PipelineStage;
  offset: number;
}

const boardKey = (wonSince: string | undefined) => ["sales-pipeline", wonSince ?? null];

// The customer pipeline: every customer of the company under Prospect, Proposal or Won. The
// server works the stages out on every read from the customers' quotes and shipments - nothing of
// it is stored, and nothing here decides where a customer stands. `wonSince` (YYYY-MM-DD, the day
// in Prague; undefined = all time) is the first day of the period of the Won column, the only
// column it changes. Each column comes with the number of customers it holds in all and with its
// first cards; `showMore` fetches the next ones of one column.
export const useSalesPipeline = (wonSince: string | undefined) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: boardKey(wonSince),
    queryFn: () => api.sales.salesPipeline({ wonSince }),
    // The board of the period before stays on screen until the one asked for is there.
    placeholderData: (prev) => prev,
    // A customer moves when a quote is sent or a shipment is created - on other screens, which
    // know nothing of this board. Whoever opens it gets it read again, however fresh the copy.
    refetchOnMount: "always",
  });

  // A read, kept as a mutation because its answer is not a board of its own: the next cards of one
  // column, which are added to the board they were asked for. That answer carries the other two
  // columns empty - it is appended, never put in the board's place.
  const moreMutation = useMutation({
    mutationFn: (asked: MoreCards) => api.sales.salesPipeline(asked),
    onSuccess: (more, { stage, offset, ...asked }) => {
      const key = boardKey(asked.wonSince);
      const shown = queryClient.getQueryData<PipelineBoard>(key);
      // The board was read again meanwhile: the cards would not follow the ones it shows now.
      if (!shown || shown.cards[stage].length !== offset) return;
      // The column is cut by position, and positions move when a customer's activity does: a
      // card that is on screen already can come again.
      const known = new Set(shown.cards[stage].map((card) => card.customerId));
      const added = more.cards[stage].filter((card) => !known.has(card.customerId));
      // Nothing new although the column holds more: it changed under the cards on screen, and
      // only reading the board again shows it as it is now.
      if (!added.length && more.totals[stage] > offset) return queryClient.invalidateQueries({ queryKey: key });
      // Counts and notes are the newer answer's; they cover whole columns whatever cards it carries.
      queryClient.setQueryData<PipelineBoard>(key, { ...more, cards: { ...shown.cards, [stage]: [...shown.cards[stage], ...added] } });
    },
  });

  const board = query.data;

  return {
    board,
    // No board to show: the first read, or another try after one that failed - what an earlier
    // read brought is not passed off as the board meanwhile.
    isLoading: query.isPending || (query.isError && query.isFetching),
    // Another period was asked for; the Won column on screen is still the one of the period before.
    isChangingPeriod: query.isPlaceholderData,
    // The last request failed. The board read earlier may be out of date, or of another period.
    isError: query.isError && !query.isFetching,
    reload: query.refetch,
    /** Adds the next cards of a column to the board; rejects when they could not be fetched. */
    showMore: (stage: PipelineStage) => moreMutation.mutateAsync({ wonSince, stage, offset: board?.cards[stage].length ?? 0 }),
    /** The column whose next cards are on their way. */
    loadingMore: moreMutation.isPending ? moreMutation.variables.stage : null,
  };
};
