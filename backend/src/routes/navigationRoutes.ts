import { Router } from "express";
import { z } from "zod";
import { getAlternativeBusRoutes } from "../services/routingService.js";
import { getTrafficIncidents } from "../services/trafficService.js";
import { getBusFriendlyParking } from "../services/parkingService.js";
import { geocodeJapanesePlace } from "../services/geocodingService.js";
import { listHistory, saveHistory } from "../services/historyStore.js";

const router = Router();

const latLngSchema = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number()
});

const parseWaypoints = (value: unknown) => {
  const raw = Array.isArray(value) ? value.join("|") : String(value || "");
  if (!raw.trim()) return [];

  return raw
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [lat, lng] = item.split(",");
      return latLngSchema.parse({ lat, lng });
    });
};

router.get("/routes", async (req, res, next) => {
  try {
    const origin = latLngSchema.parse({ lat: req.query.originLat, lng: req.query.originLng });
    const destination = latLngSchema.parse({ lat: req.query.destLat, lng: req.query.destLng });
    const waypoints = parseWaypoints(req.query.vias);

    const routes = await getAlternativeBusRoutes(origin, destination, waypoints);
    res.json({ routes });
  } catch (error) {
    next(error);
  }
});

router.get("/traffic", async (req, res, next) => {
  try {
    const bbox = String(req.query.bbox || "35.55,139.55,35.85,139.95");
    const incidents = await getTrafficIncidents(bbox);
    res.json({ incidents });
  } catch (error) {
    next(error);
  }
});

router.get("/parking", async (req, res, next) => {
  try {
    const at = latLngSchema.parse({ lat: req.query.lat, lng: req.query.lng });
    const limit = Number(req.query.limit || "10");
    const parking = await getBusFriendlyParking(at, limit);
    res.json({ parking });
  } catch (error) {
    next(error);
  }
});

router.get("/geocode", async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    const hasAt = req.query.atLat !== undefined && req.query.atLng !== undefined;
    const at = hasAt ? latLngSchema.parse({ lat: req.query.atLat, lng: req.query.atLng }) : undefined;

    const results = await geocodeJapanesePlace(q, at);
    res.json({ results });
  } catch (error) {
    next(error);
  }
});

router.get("/history", (_req, res) => {
  res.json({ history: listHistory() });
});

router.post("/history", (req, res, next) => {
  try {
    const bodySchema = z.object({
      origin: latLngSchema,
      destination: latLngSchema,
      selectedRouteId: z.string().min(1),
      routeName: z.string().min(1),
      track: z.array(latLngSchema).default([])
    });

    const payload = bodySchema.parse(req.body);
    const saved = saveHistory(payload);
    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
});

export default router;
