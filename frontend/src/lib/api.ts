import { BusParkingSpot, GeocodeResult, LatLng, RouteHistoryEntry, RouteOption, TrafficIncident } from "./types";

const toParams = (o: LatLng, d: LatLng, waypoints: LatLng[] = []) => {
  const params = new URLSearchParams({
    originLat: String(o.lat),
    originLng: String(o.lng),
    destLat: String(d.lat),
    destLng: String(d.lng)
  });

  if (waypoints.length) {
    params.set(
      "vias",
      waypoints.map((point) => `${point.lat},${point.lng}`).join("|")
    );
  }

  return params;
};

export const fetchRoutes = async (origin: LatLng, destination: LatLng, waypoints: LatLng[] = []): Promise<RouteOption[]> => {
  const res = await fetch(`/api/routes?${toParams(origin, destination, waypoints).toString()}`);
  if (!res.ok) throw new Error("ルートの取得に失敗しました");
  const data = await res.json();
  return data.routes;
};

export const searchPlace = async (query: string, around?: LatLng): Promise<GeocodeResult[]> => {
  const params = new URLSearchParams({ q: query });
  if (around) {
    params.set("atLat", String(around.lat));
    params.set("atLng", String(around.lng));
  }

  const res = await fetch(`/api/geocode?${params.toString()}`);
  if (!res.ok) throw new Error("地名検索に失敗しました");
  const data = await res.json();
  return data.results;
};

export const fetchTraffic = async (bbox: string): Promise<TrafficIncident[]> => {
  const res = await fetch(`/api/traffic?bbox=${encodeURIComponent(bbox)}`);
  if (!res.ok) throw new Error("交通情報の取得に失敗しました");
  const data = await res.json();
  return data.incidents;
};

export const fetchParking = async (at: LatLng): Promise<BusParkingSpot[]> => {
  const params = new URLSearchParams({ lat: String(at.lat), lng: String(at.lng), limit: "12" });
  const res = await fetch(`/api/parking?${params.toString()}`);
  if (!res.ok) throw new Error("駐車場情報の取得に失敗しました");
  const data = await res.json();
  return data.parking;
};

export const fetchHistory = async (): Promise<RouteHistoryEntry[]> => {
  const res = await fetch("/api/history");
  if (!res.ok) throw new Error("履歴取得に失敗しました");
  const data = await res.json();
  return data.history;
};

export const saveHistory = async (payload: {
  origin: LatLng;
  destination: LatLng;
  selectedRouteId: string;
  routeName: string;
  track: LatLng[];
}): Promise<RouteHistoryEntry> => {
  const res = await fetch("/api/history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error("履歴保存に失敗しました");
  return res.json();
};
