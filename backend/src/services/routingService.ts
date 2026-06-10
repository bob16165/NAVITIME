import polyline from "@here/flexpolyline";
import { hasHereKey, hereRoutingClient } from "./hereClient.js";
import { LatLng, RouteOption } from "../types.js";

const toLatLngString = (p: LatLng) => `${p.lat},${p.lng}`;

const buildPolylinePoints = (origin: LatLng, destination: LatLng, waypoints: LatLng[]) => [
  [origin.lat, origin.lng] as [number, number],
  ...waypoints.map((point) => [point.lat, point.lng] as [number, number]),
  [destination.lat, destination.lng] as [number, number]
];

const parsePoly = (encoded: string): [number, number][] => {
  const decoded = polyline.decode(encoded);
  return decoded.polyline.map(([lat, lng]) => [lat, lng] as [number, number]);
};

const mockRoutes = (origin: LatLng, destination: LatLng, waypoints: LatLng[]): RouteOption[] => [
  {
    id: "mock-fast",
    label: "最短時間ルート",
    durationSec: 5600,
    distanceM: 84500,
    baseDurationSec: 4900,
    trafficDelaySec: 700,
    hasTollRoad: true,
    polyline: buildPolylinePoints(origin, destination, waypoints),
    summaryText: "高速優先。渋滞影響あり"
  },
  {
    id: "mock-balance",
    label: "バランスルート",
    durationSec: 6100,
    distanceM: 79200,
    baseDurationSec: 5700,
    trafficDelaySec: 400,
    hasTollRoad: false,
    polyline: buildPolylinePoints(origin, destination, waypoints),
    summaryText: "一般道中心。大型車通行可の道路を優先"
  },
  {
    id: "mock-safe",
    label: "安全優先ルート",
    durationSec: 6900,
    distanceM: 90500,
    baseDurationSec: 6600,
    trafficDelaySec: 300,
    hasTollRoad: false,
    polyline: buildPolylinePoints(origin, destination, waypoints),
    summaryText: "狭隘路回避を重視"
  }
];

export const getAlternativeBusRoutes = async (
  origin: LatLng,
  destination: LatLng,
  waypoints: LatLng[] = []
): Promise<RouteOption[]> => {
  if (!hasHereKey) {
    return mockRoutes(origin, destination, waypoints);
  }

  const params = new URLSearchParams({
    transportMode: "truck",
    alternatives: "3",
    origin: toLatLngString(origin),
    destination: toLatLngString(destination),
    departureTime: "now",
    return: "summary,polyline,tolls,travelSummary",
    truck: "height:3.6,width:2.5,length:12.0,grossWeight:18000"
  });

  waypoints.forEach((point) => {
    params.append("via", toLatLngString(point));
  });

  const response = await hereRoutingClient.get("/routes", {
    params
  });

  const routes = response.data?.routes ?? [];

  return routes.map((route: any, index: number) => {
    const section = route.sections?.[0];
    const summary = section?.summary ?? {};
    const travelSummary = section?.travelSummary ?? {};
    const hasTollRoad = Boolean(section?.tolls?.length);

    return {
      id: route.id ?? `route-${index + 1}`,
      label: `候補ルート ${index + 1}`,
      durationSec: summary.duration ?? 0,
      distanceM: summary.length ?? 0,
      baseDurationSec: travelSummary.baseDuration ?? summary.duration ?? 0,
      trafficDelaySec: (summary.duration ?? 0) - (travelSummary.baseDuration ?? summary.duration ?? 0),
      hasTollRoad,
      polyline: parsePoly(section.polyline),
      summaryText: hasTollRoad ? "高速道路あり" : "高速道路なし"
    } as RouteOption;
  });
};
