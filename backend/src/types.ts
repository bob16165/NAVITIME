export type LatLng = {
  lat: number;
  lng: number;
};

export type RouteOption = {
  id: string;
  label: string;
  durationSec: number;
  distanceM: number;
  baseDurationSec: number;
  trafficDelaySec: number;
  hasTollRoad: boolean;
  polyline: [number, number][];
  summaryText: string;
};

export type TrafficIncident = {
  id: string;
  title: string;
  type: string;
  severity: string;
  location: LatLng;
};

export type BusParkingSpot = {
  id: string;
  name: string;
  address: string;
  location: LatLng;
  busFriendly: boolean;
  notes: string;
};

export type RouteHistoryEntry = {
  id: string;
  createdAt: string;
  origin: LatLng;
  destination: LatLng;
  selectedRouteId: string;
  routeName: string;
  track: LatLng[];
};
