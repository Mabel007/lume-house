export type Fulfilment = "delivery" | "pickup";
export type DeliveryZone = {
  id: string;
  label: string;
  coverage: string;
  fee: number;
  active: boolean;
};
// Provisional product configuration, not researched courier rates or GPS boundaries.
export const deliveryConfig: {
  serviceCity: string;
  pickupLocation: string;
  zones: DeliveryZone[];
} = {
  serviceCity: "Freetown",
  pickupLocation: "Lumley, Freetown",
  zones: [
    {
      id: "zone-1",
      label: "Goderich to Lumley",
      coverage: "Goderich to Lumley",
      fee: 4000,
      active: true,
    },
    {
      id: "zone-2",
      label: "Lumley to Congo Cross",
      coverage: "Lumley to Congo Cross, including Aberdeen",
      fee: 5000,
      active: true,
    },
    {
      id: "zone-3",
      label: "Congo Cross to Central Freetown",
      coverage: "Congo Cross to Central Freetown",
      fee: 6000,
      active: true,
    },
  ] satisfies DeliveryZone[],
};
export function getDeliveryFee(
  fulfilment: Fulfilment,
  city: string,
  zoneId: string,
  config = deliveryConfig,
): number | null {
  if (fulfilment === "pickup") return 0;
  if (city.trim().toLowerCase() !== config.serviceCity.trim().toLowerCase())
    return null;
  const fee = config.zones.find(
    (zone) => zone.id === zoneId && zone.active,
  )?.fee;
  return typeof fee === "number" && Number.isSafeInteger(fee) && fee >= 0
    ? fee
    : null;
}
