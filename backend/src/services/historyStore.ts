import { randomUUID } from "node:crypto";
import { LatLng, RouteHistoryEntry } from "../types.js";

const history: RouteHistoryEntry[] = [];

type SaveInput = {
  origin: LatLng;
  destination: LatLng;
  selectedRouteId: string;
  routeName: string;
  track: LatLng[];
};

export const listHistory = (): RouteHistoryEntry[] => history;

export const saveHistory = (entry: SaveInput): RouteHistoryEntry => {
  const created: RouteHistoryEntry = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry
  };

  history.unshift(created);
  return created;
};
