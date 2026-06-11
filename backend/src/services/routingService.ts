import polyline from "@here/flexpolyline";
import axios from "axios";
import { hasHereKey, hereRoutingClient } from "./hereClient.js";
import { LatLng, RouteOption } from "../types.js";

const toLatLngString = (p: LatLng) => `${p.lat},${p.lng}`;

// OSRM公開APIから実際の道路に沿ったポリラインを取得する
const fetchOsrmPolyline = async (
  origin: LatLng,
  destination: LatLng,
  waypoints: LatLng[]
): Promise<[number, number][]> => {
  const allPoints = [origin, ...waypoints, destination];
  // OSRM は lng,lat 順
  const coords = allPoints.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  const res = await axios.get(url, { timeout: 8000 });
  const coords2d: [number, number][] = res.data.routes[0].geometry.coordinates.map(
    ([lng, lat]: [number, number]) => [lat, lng] as [number, number]
  );
  return coords2d;
};

// フォールバック: 主要な中継点を使った疑似道路ポリライン
const buildFallbackPolyline = (
  origin: LatLng,
  destination: LatLng,
  waypoints: LatLng[],
  variant: number
): [number, number][] => {
  const allWaypoints = [origin, ...waypoints, destination];
  const points: [number, number][] = [];

  for (let i = 0; i < allWaypoints.length - 1; i++) {
    const start = allWaypoints[i];
    const end = allWaypoints[i + 1];
    const steps = 40;

    // variant で各ルートに異なるカーブ特性を与える
    const curvature = (variant - 1) * 0.3; // 0, 0.3, 0.6

    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      const lat = start.lat + (end.lat - start.lat) * t;
      const lng = start.lng + (end.lng - start.lng) * t;

      // sin カーブで道路のような蛇行を追加
      const dist = Math.hypot(end.lat - start.lat, end.lng - start.lng);
      const perpLat = -(end.lng - start.lng) / Math.max(dist, 1e-9);
      const perpLng = (end.lat - start.lat) / Math.max(dist, 1e-9);
      const amplitude = dist * 0.04 * (1 + curvature);
      const offset = Math.sin(t * Math.PI) * amplitude;

      points.push([lat + perpLat * offset, lng + perpLng * offset]);
    }
  }

  return points;
};

const parsePoly = (encoded: string): [number, number][] => {
  const decoded = polyline.decode(encoded);
  return decoded.polyline.map(([lat, lng]) => [lat, lng] as [number, number]);
};

const mockRoutes = async (origin: LatLng, destination: LatLng, waypoints: LatLng[]): Promise<RouteOption[]> => {
  // OSRM で実際の道路軌跡を取得し、3ルート分に少し変化をつけて返す
  let basePolyline: [number, number][];
  try {
    basePolyline = await fetchOsrmPolyline(origin, destination, waypoints);
  } catch {
    // OSRM が失敗した場合は疑似ポリラインにフォールバック
    basePolyline = buildFallbackPolyline(origin, destination, waypoints, 1);
  }

  // ルート2・3は基本ルートを少しシフトして別ルートに見せる
  const makeVariant = (base: [number, number][], offsetLat: number, offsetLng: number): [number, number][] =>
    base.map(([lat, lng]) => [lat + offsetLat, lng + offsetLng]);

  return [
    {
      id: "mock-fast",
      label: "最短時間ルート",
      durationSec: 5600,
      distanceM: 84500,
      baseDurationSec: 4900,
      trafficDelaySec: 700,
      hasTollRoad: true,
      polyline: basePolyline,
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
      polyline: makeVariant(basePolyline, 0.015, -0.01),
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
      polyline: makeVariant(basePolyline, -0.01, 0.012),
      summaryText: "狭隘路回避を重視"
    }
  ];
};


export const getAlternativeBusRoutes = async (
  origin: LatLng,
  destination: LatLng,
  waypoints: LatLng[] = []
): Promise<RouteOption[]> => {
  if (!hasHereKey) {
    return await mockRoutes(origin, destination, waypoints);
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
