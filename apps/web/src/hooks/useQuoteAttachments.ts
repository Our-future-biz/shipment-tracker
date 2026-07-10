"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers } from "@/lib/api/client";

export const useQuoteAttachments = (quoteNumber: string | null) => {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["quote-attachments", quoteNumber] });

  const query = useQuery({
    queryKey: ["quote-attachments", quoteNumber],
    queryFn: () => api.quotes.quoteAttachmentList(quoteNumber!),
    enabled: !!quoteNumber,
  });

  const uploadMutation = useMutation({
    mutationFn: (params: controllers.QuoteAttachmentCreateRequest) => api.quotes.quoteAttachmentCreate(quoteNumber!, params),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: string) => api.quotes.quoteAttachmentDelete(quoteNumber!, attachmentId),
    onSuccess: invalidate,
  });

  return {
    attachments: query.data?.attachments ?? [],
    isLoading: query.isLoading,
    upload: uploadMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
    remove: deleteMutation.mutateAsync,
  };
};
