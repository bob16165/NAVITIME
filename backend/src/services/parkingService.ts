import { hasHereKey, hereSearchClient } from "./hereClient.js";
import { BusParkingSpot, LatLng } from "../types.js";

const mockParking = (at: LatLng): BusParkingSpot[] => [
  {
    id: "mock-p1",
    name: "観光バス専用駐車場A",
    address: "東京都千代田区",
    location: { lat: at.lat + 0.015, lng: at.lng + 0.01 },
    busFriendly: true,
    notes: "大型車可 / 予約推奨"
  },
  {
    id: "mock-p2",
    name: "大型車対応パーキングB",
    address: "東京都中央区",
    location: { lat: at.lat - 0.012, lng: at.lng + 0.018 },
    busFriendly: true,
    notes: "車高3.8mまで"
  }
];

export const getBusFriendlyParking = async (at: LatLng, limit = 10): Promise<BusParkingSpot[]> => {
  if (!hasHereKey) {
    return mockParking(at).slice(0, limit);
  }

  const response = await hereSearchClient.get("/discover", {
    params: {
      at: `${at.lat},${at.lng}`,
      q: "観光バス 駐車場",
      limit
    }
  });

  const items = response.data?.items ?? [];

  return items
    .map((item: any) => ({
      id: item.id,
      name: item.title,
      address: item.address?.label ?? "住所情報なし",
      location: {
        lat: item.position?.lat,
        lng: item.position?.lng
      },
      busFriendly: true,
      notes: "現地の受入条件を確認してください"
    }))
    .filter((item: BusParkingSpot) => Number.isFinite(item.location.lat) && Number.isFinite(item.location.lng));
};
