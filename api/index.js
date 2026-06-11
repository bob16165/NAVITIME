require("dotenv").config();
const cors = require("cors");
const express = require("express");
const { Router } = require("express");
const { z } = require("zod");
const axios = require("axios").default;

const HERE_API_KEY = process.env.HERE_API_KEY;
const hasHereKey = Boolean(HERE_API_KEY);

const hereSearchClient = axios.create({
  baseURL: "https://discover.search.hereapi.com/v1",
  timeout: 12000,
  params: { apiKey: HERE_API_KEY }
});

const hereRoutingClient = axios.create({
  baseURL: "https://router.hereapi.com/v8",
  timeout: 12000,
  params: { apiKey: HERE_API_KEY }
});

const hereTrafficClient = axios.create({
  baseURL: "https://data.traffic.hereapi.com/v7",
  timeout: 12000,
  params: { apiKey: HERE_API_KEY }
});

// ---- Geocoding ----
const placeAliases = {
  "社庫": "ヤサカ観光バス大阪支社"
};

const fallbackPlaces = {
  "ヤサカ観光バス大阪支社": { title: "ヤサカ観光バス大阪支社", address: "大阪府大阪市西淀川区中島2-4-131", location: { lat: 34.6965, lng: 135.4171 } },
  "バスタ新宿":            { title: "バスタ新宿",            address: "東京都渋谷区千駄ヶ谷5丁目24-55",    location: { lat: 35.688923, lng: 139.700442 } },
  "東京駅八重洲南口バスターミナル": { title: "東京駅八重洲南口バスターミナル", address: "東京都千代田区丸の内1丁目9", location: { lat: 35.679596, lng: 139.767062 } },
  "横浜シティエアターミナル": { title: "横浜シティエアターミナル", address: "神奈川県横浜市西区高島2丁目19-12", location: { lat: 35.465976, lng: 139.624599 } },
  "名古屋駅太閤通口バスターミナル": { title: "名古屋駅太閤通口バスターミナル", address: "愛知県名古屋市中村区椿町",   location: { lat: 35.168115, lng: 136.883375 } },
  "大阪駅JR高速バスターミナル": { title: "大阪駅JR高速バスターミナル", address: "大阪府大阪市北区梅田3丁目1-1",  location: { lat: 34.702289, lng: 135.495215 } },
  "京都駅八条口バスターミナル": { title: "京都駅八条口バスターミナル", address: "京都府京都市南区東九条西山王町",  location: { lat: 34.984873, lng: 135.758356 } },
  "仙台駅東口バスターミナル": { title: "仙台駅東口バスターミナル", address: "宮城県仙台市宮城野区榴岡",       location: { lat: 38.260223, lng: 140.884606 } },
  "新潟駅南口バスターミナル": { title: "新潟駅南口バスターミナル", address: "新潟県新潟市中央区花園1丁目",     location: { lat: 37.912307, lng: 139.061327 } },
  "広島駅新幹線口バスターミナル": { title: "広島駅新幹線口バスターミナル", address: "広島県広島市東区若草町",   location: { lat: 34.397515, lng: 132.475383 } },
  "博多バスターミナル":     { title: "博多バスターミナル",     address: "福岡県福岡市博多区博多駅中央街2-1", location: { lat: 33.590213, lng: 130.420481 } },
  "鹿児島中央駅バスターミナル": { title: "鹿児島中央駅バスターミナル", address: "鹿児島県鹿児島市中央町",     location: { lat: 31.583563, lng: 130.541346 } },
  "那覇バスターミナル":     { title: "那覇バスターミナル",     address: "沖縄県那覇市泉崎1丁目20-1",        location: { lat: 26.210931, lng: 127.681109 } }
};

const geocodeJapanesePlace = async (query, at) => {
  const normalized = placeAliases[query.trim()] ?? query.trim();
  if (!normalized) return [];
  if (!hasHereKey) {
    const exact = fallbackPlaces[normalized];
    if (exact) return [exact];
    const partials = Object.values(fallbackPlaces).filter(p => p.title.includes(normalized));
    if (partials.length) return partials;
    try {
      const osm = await axios.get("https://nominatim.openstreetmap.org/search", {
        params: { q: `${normalized} 日本`, format: "jsonv2", limit: 6, "accept-language": "ja" },
        headers: { "User-Agent": "tour-bus-navitime-webapp/0.1" },
        timeout: 12000
      });
      return (Array.isArray(osm.data) ? osm.data : [])
        .map(item => ({ title: String(item.name || item.display_name || normalized), address: String(item.display_name || "住所情報なし"), location: { lat: Number(item.lat), lng: Number(item.lon) } }))
        .filter(item => Number.isFinite(item.location.lat) && Number.isFinite(item.location.lng));
    } catch { return []; }
  }
  const response = await hereSearchClient.get("/geocode", { params: { q: normalized, lang: "ja-JP", limit: 6, ...(at ? { at: `${at.lat},${at.lng}` } : {}) } });
  return (response.data?.items ?? [])
    .map(item => ({ title: item.title ?? normalized, address: item.address?.label ?? "住所情報なし", location: { lat: item.position?.lat, lng: item.position?.lng } }))
    .filter(item => Number.isFinite(item.location.lat) && Number.isFinite(item.location.lng));
};

// ---- Routing mock ----
// ---- Routing ----
const buildFallbackPolyline = (origin, destination, waypoints) => {
  const points = [origin, ...waypoints, destination];
  const result = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const steps = 12;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const lat = a.lat + (b.lat - a.lat) * t + Math.sin(t * Math.PI) * 0.08 * (i % 2 === 0 ? 1 : -1);
      const lng = a.lng + (b.lng - a.lng) * t;
      result.push([lat, lng]);
    }
  }
  return result;
};

const fetchOsrmPolyline = async (origin, destination, waypoints) => {
  const allPoints = [origin, ...waypoints, destination];
  const coords = allPoints.map(p => `${p.lng},${p.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  const res = await axios.get(url, { timeout: 15000, headers: { "User-Agent": "tour-bus-navitime-webapp/0.1" } });
  const coords2d = res.data?.routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coords2d) || coords2d.length < 2) throw new Error("OSRM empty");
  return coords2d.map(([lng, lat]) => [lat, lng]);
};

const mockRoutes = async (origin, destination, waypoints) => {
  let basePolyline;
  try {
    basePolyline = await fetchOsrmPolyline(origin, destination, waypoints);
  } catch {
    basePolyline = buildFallbackPolyline(origin, destination, waypoints);
  }
  const offset = (polyline, dLat, dLng) => polyline.map(([lat, lng]) => [lat + dLat, lng + dLng]);
  return [
    { id: "mock-fast",    label: "最短時間ルート",   durationSec: 5600,  distanceM: 84500,  baseDurationSec: 4900,  trafficDelaySec: 700, hasTollRoad: true,  polyline: basePolyline, summaryText: "高速優先。渋滞影響あり" },
    { id: "mock-balance", label: "バランスルート",   durationSec: 6100,  distanceM: 79200,  baseDurationSec: 5700,  trafficDelaySec: 400, hasTollRoad: false, polyline: offset(basePolyline, 0.015, -0.01), summaryText: "一般道中心" },
    { id: "mock-safe",    label: "安全優先ルート",   durationSec: 6900,  distanceM: 90500,  baseDurationSec: 6600,  trafficDelaySec: 300, hasTollRoad: false, polyline: offset(basePolyline, -0.01, 0.012), summaryText: "狭隘路回避を重視" }
  ];
};

const getRoutes = async (origin, destination, waypoints = []) => {
  if (!hasHereKey) return await mockRoutes(origin, destination, waypoints);

  const params = new URLSearchParams({
    transportMode: "truck",
    alternatives: "3",
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    departureTime: "now",
    return: "summary,polyline,tolls,travelSummary",
    truck: "height:3.6,width:2.5,length:12.0,grossWeight:18000"
  });

  waypoints.forEach(point => {
    params.append("via", `${point.lat},${point.lng}`);
  });

  const res = await hereRoutingClient.get("/routes", { params });
  return (res.data?.routes ?? []).map((route, index) => {
    const section = route.sections?.[0];
    const summary = section?.summary ?? {};
    const travelSummary = section?.travelSummary ?? {};
    return { id: route.id ?? `route-${index+1}`, label: `候補ルート ${index+1}`, durationSec: summary.duration ?? 0, distanceM: summary.length ?? 0, baseDurationSec: travelSummary.baseDuration ?? summary.duration ?? 0, trafficDelaySec: (summary.duration ?? 0) - (travelSummary.baseDuration ?? summary.duration ?? 0), hasTollRoad: Boolean(section?.tolls?.length), polyline: [[origin.lat, origin.lng], [destination.lat, destination.lng]], summaryText: section?.tolls?.length ? "高速道路あり" : "高速道路なし" };
  });
};

// ---- Traffic mock ----
const getTraffic = async (bbox) => {
  const [minLat, minLng, maxLat, maxLng] = bbox.split(",").map(Number);
  const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  if (!hasHereKey) return [
    { id: "mock-1", title: "工事による片側交互通行", type: "construction", severity: "major",    location: { lat: center.lat + 0.03, lng: center.lng + 0.03 } },
    { id: "mock-2", title: "渋滞 4km",              type: "congestion",    severity: "critical", location: { lat: center.lat - 0.02, lng: center.lng + 0.02 } }
  ];
  const res = await hereTrafficClient.get("/incidents", { params: { in: `bbox:${bbox}`, locationReferencing: "none" } });
  return (res.data?.incidents ?? []).map(item => ({ id: item.id, title: item.description?.value ?? item.type, type: item.type, severity: item.criticality ?? "minor", location: { lat: item.location?.shape?.links?.[0]?.points?.[0]?.lat ?? center.lat, lng: item.location?.shape?.links?.[0]?.points?.[0]?.lng ?? center.lng } }));
};

// ---- Parking mock ----
const getParking = async (at, limit = 10) => {
  if (!hasHereKey) return [
    { id: "mock-p1", name: "観光バス専用駐車場A", address: "目的地周辺", location: { lat: at.lat + 0.015, lng: at.lng + 0.01 }, busFriendly: true, notes: "大型車可 / 予約推奨" },
    { id: "mock-p2", name: "大型車対応パーキングB", address: "目的地周辺", location: { lat: at.lat - 0.012, lng: at.lng + 0.018 }, busFriendly: true, notes: "車高3.8mまで" }
  ].slice(0, limit);
  const res = await hereSearchClient.get("/discover", { params: { at: `${at.lat},${at.lng}`, q: "観光バス 駐車場", limit } });
  return (res.data?.items ?? []).map(item => ({ id: item.id, name: item.title, address: item.address?.label ?? "住所情報なし", location: { lat: item.position?.lat, lng: item.position?.lng }, busFriendly: true, notes: "現地の受入条件を確認してください" })).filter(item => Number.isFinite(item.location.lat));
};

// ---- History (in-memory) ----
const history = [];
const saveHistory = entry => { const created = { id: Math.random().toString(36).slice(2), createdAt: new Date().toISOString(), ...entry }; history.unshift(created); return created; };

// ---- Express app ----
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const latLng = obj => {
  const parsed = z.object({ lat: z.coerce.number(), lng: z.coerce.number() }).parse(obj);
  return parsed;
};

const parseWaypoints = value => {
  const raw = Array.isArray(value) ? value.join("|") : String(value || "");
  if (!raw.trim()) return [];

  return raw
    .split("|")
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      const [lat, lng] = item.split(",");
      return latLng({ lat, lng });
    });
};

const router = Router();

router.get("/health", (_req, res) => res.json({ ok: true }));

router.get("/geocode", async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    const at = req.query.atLat ? latLng({ lat: req.query.atLat, lng: req.query.atLng }) : undefined;
    res.json({ results: await geocodeJapanesePlace(q, at) });
  } catch (e) { next(e); }
});

router.get("/routes", async (req, res, next) => {
  try {
    const origin = latLng({ lat: req.query.originLat, lng: req.query.originLng });
    const destination = latLng({ lat: req.query.destLat, lng: req.query.destLng });
    const waypoints = parseWaypoints(req.query.vias);
    res.json({ routes: await getRoutes(origin, destination, waypoints) });
  } catch (e) { next(e); }
});

router.get("/traffic", async (req, res, next) => {
  try {
    const bbox = String(req.query.bbox || "35.55,139.55,35.85,139.95");
    res.json({ incidents: await getTraffic(bbox) });
  } catch (e) { next(e); }
});

router.get("/parking", async (req, res, next) => {
  try {
    const at = latLng({ lat: req.query.lat, lng: req.query.lng });
    res.json({ parking: await getParking(at, Number(req.query.limit || 10)) });
  } catch (e) { next(e); }
});

router.get("/history", (_req, res) => res.json({ history }));

router.post("/history", (req, res, next) => {
  try {
    const body = z.object({ origin: z.object({ lat: z.number(), lng: z.number() }), destination: z.object({ lat: z.number(), lng: z.number() }), selectedRouteId: z.string().min(1), routeName: z.string().min(1), track: z.array(z.object({ lat: z.number(), lng: z.number() })).default([]) }).parse(req.body);
    res.status(201).json(saveHistory(body));
  } catch (e) { next(e); }
});

app.use("/api", router);
app.use((err, _req, res, _next) => res.status(400).json({ error: err instanceof Error ? err.message : "Unknown error" }));

module.exports = app;
