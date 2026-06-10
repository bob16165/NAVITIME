import { hasHereKey, hereTrafficClient } from "./hereClient.js";
import { LatLng, TrafficIncident } from "../types.js";

const mockTraffic = (center: LatLng): TrafficIncident[] => [
  {
    id: "mock-1",
    title: "工事による片側交互通行",
    type: "construction",
    severity: "major",
    location: { lat: center.lat + 0.03, lng: center.lng + 0.03 }
  },
  {
    id: "mock-2",
    title: "渋滞 4km",
    type: "congestion",
    severity: "critical",
    location: { lat: center.lat - 0.02, lng: center.lng + 0.02 }
  }
];

export const getTrafficIncidents = async (bbox: string): Promise<TrafficIncident[]> => {
  const center = (() => {
    const [minLat, minLng, maxLat, maxLng] = bbox.split(",").map(Number);
    return {
      lat: (minLat + maxLat) / 2,
      lng: (minLng + maxLng) / 2
    };
  })();

  if (!hasHereKey) {
    return mockTraffic(center);
  }

  const response = await hereTrafficClient.get("/incidents", {
    params: {
      in: `bbox:${bbox}`,
      locationReferencing: "none"
    }
  });

  const incidents = response.data?.incidents ?? [];

  return incidents.map((item: any) => ({
    id: item.id,
    title: item.description?.value ?? item.type,
    type: item.type,
    severity: item.criticality ?? "minor",
    location: {
      lat: item.location?.shape?.links?.[0]?.points?.[0]?.lat ?? center.lat,
      lng: item.location?.shape?.links?.[0]?.points?.[0]?.lng ?? center.lng
    }
  }));
};
