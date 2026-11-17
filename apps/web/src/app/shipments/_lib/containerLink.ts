// A container found in the main search opens its shipment on Container Details, scrolled to that
// container and marked. The address names it by its row id: two containers of a job never share
// one, while a number can be typed twice.

/** The address param naming the container that Container Details opens on. */
export const CONTAINER_PARAM = "container";

/** The shipment on its Container Details tab, opened on this container. */
export const containerDetailsHref = (shipmentId: string, containerId: string) =>
  `/shipments/${encodeURIComponent(shipmentId)}?tab=container&${CONTAINER_PARAM}=${encodeURIComponent(containerId)}`;

/** The container the address asks Container Details to open on, if any. */
export const containerToShow = (params: Pick<URLSearchParams, "get">): string | null => params.get(CONTAINER_PARAM) || null;
