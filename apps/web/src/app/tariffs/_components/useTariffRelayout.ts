"use client";

import { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/lib/toast";

interface ReadCounts {
  errorCount: number;
  warningCount: number;
}

// Reads a draft's file again with a corrected layout and says how it went: what was read
// (`readText`, then the errors and warnings), or why it failed - passing the failure on, so the
// layout form keeps the user's changes.
export const useTariffRelayout = <L, V extends ReadCounts>(relayout: (req: { id: string; layout: L }) => Promise<V>, readText: (read: V) => string) => {
  const toast = useToast();
  return async (id: string, layout: L): Promise<V> => {
    try {
      const read = await relayout({ id, layout });
      toast.success(`Read again: ${readText(read)}, ${read.errorCount} errors, ${read.warningCount} warnings`);
      return read;
    } catch (e) {
      toast.error(`Could not read the file again: ${apiErrorMessage(e)}`, 8);
      throw e;
    }
  };
};
