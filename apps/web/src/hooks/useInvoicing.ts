"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers } from "@/lib/api/client";

export const useInvoicing = (shipmentId: string | null) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["invoicing", shipmentId],
    queryFn: () => api.invoicing.invoicingGet(shipmentId!),
    enabled: !!shipmentId,
  });

  const upsertCostMutation = useMutation({
    mutationFn: (params: controllers.UpsertCostRequest) => api.invoicing.invoicingUpsertCost(shipmentId!, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoicing", shipmentId] }),
  });

  const upsertBillingMutation = useMutation({
    mutationFn: (params: controllers.UpsertBillingSettingsRequest) => api.invoicing.invoicingUpsertBillingSettings(shipmentId!, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoicing", shipmentId] }),
  });

  const generateMutation = useMutation({
    mutationFn: (params: controllers.GenerateInvoiceRequest) => api.invoicing.invoicingGenerate(shipmentId!, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoicing", shipmentId] }),
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    upsertCost: upsertCostMutation.mutateAsync,
    upsertBilling: upsertBillingMutation.mutateAsync,
    generateInvoice: generateMutation.mutateAsync,
    isGenerating: generateMutation.isPending,
  };
};
