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

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["invoicing", shipmentId] });

  const upsertCostMutation = useMutation({
    mutationFn: (params: controllers.UpsertCostRequest) => api.invoicing.invoicingUpsertCost(shipmentId!, params),
    onSuccess: invalidate,
  });

  const addChargeMutation = useMutation({
    mutationFn: (params: controllers.AddChargeRequest) => api.invoicing.invoicingAddCharge(shipmentId!, params),
    onSuccess: invalidate,
  });

  const updateChargeMutation = useMutation({
    mutationFn: ({ chargeId, params }: { chargeId: string; params: controllers.UpdateChargeRequest }) =>
      api.invoicing.invoicingUpdateCharge(shipmentId!, chargeId, params),
    onSuccess: invalidate,
  });

  const deleteChargeMutation = useMutation({
    mutationFn: (chargeId: string) => api.invoicing.invoicingDeleteCharge(shipmentId!, chargeId),
    onSuccess: invalidate,
  });

  const upsertOverrideMutation = useMutation({
    mutationFn: (params: controllers.UpsertBillingOverrideRequest) =>
      api.invoicing.invoicingUpsertBillingOverride(shipmentId!, params),
    onSuccess: invalidate,
  });

  const upsertBillingMutation = useMutation({
    mutationFn: (params: controllers.UpsertBillingSettingsRequest) => api.invoicing.invoicingUpsertBillingSettings(shipmentId!, params),
    onSuccess: invalidate,
  });

  const generateMutation = useMutation({
    mutationFn: (params: controllers.GenerateInvoiceRequest) => api.invoicing.invoicingGenerate(shipmentId!, params),
    onSuccess: invalidate,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    upsertCost: upsertCostMutation.mutateAsync,
    addCharge: addChargeMutation.mutateAsync,
    updateCharge: updateChargeMutation.mutateAsync,
    deleteCharge: deleteChargeMutation.mutateAsync,
    upsertOverride: upsertOverrideMutation.mutateAsync,
    upsertBilling: upsertBillingMutation.mutateAsync,
    generateInvoice: generateMutation.mutateAsync,
    isGenerating: generateMutation.isPending,
  };
};
