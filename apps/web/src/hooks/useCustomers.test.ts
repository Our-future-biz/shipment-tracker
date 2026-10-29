import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { refreshCustomerLists } from "./useCustomers";

describe("refreshCustomerLists", () => {
  it("reads the Customer Database and the Tariffs suppliers again, so a new rail operator, haulier or shipping line shows there", () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();

    refreshCustomerLists(queryClient);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["customers"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["rail-tariffs"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["collection-tariffs"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["ocean-tariffs"] });
  });
});
