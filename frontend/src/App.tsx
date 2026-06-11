import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { recognize } from "tesseract.js";
import HistoryPanel from "./components/HistoryPanel";
import MapPanel from "./components/MapPanel";
import RouteSelector from "./components/RouteSelector";
import { fetchHistory, fetchParking, fetchRoutes, fetchTraffic, saveHistory, searchPlace } from "./lib/api";
import { normalizePlaceAlias, parseItineraryText, splitWaypointInput } from "./lib/itinerary";
import { BusParkingSpot, GeocodeResult, LatLng, RouteHistoryEntry, RouteOption, TrafficIncident } from "./lib/types";

const defaultOrigin: LatLng = { lat: 35.688923, lng: 139.700442 };
const defaultDestination: LatLng = { lat: 33.590213, lng: 130.420481 };

const min = (sec: number) => `${Math.round(sec / 60)}分`;
const km = (m: number) => `${(m / 1000).toFixed(1)}km`;

type GuidanceStep = {
  progress: number;
  text: string;
};

const bearingDeg = (from: LatLng, to: LatLng): number => {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

const angleDiff = (b1: number, b2: number): number => {
  let d = b2 - b1;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
};

const buildGuidanceSteps = (route: RouteOption, destName: string): GuidanceStep[] => {
  const steps: GuidanceStep[] = [];
  steps.push({ progress: 0, text: "ナビを開始します。安全運転で出発してください" });

  if (route.hasTollRoad) {
    steps.push({ progress: 0.05, text: "まもなく高速道路の入口です" });
  } else {
    steps.push({ progress: 0.05, text: "一般道を直進します" });
  }

  const poly = route.polyline;
  const total = poly.length;
  if (total >= 3) {
    const stride = Math.max(1, Math.floor(total / 60));
    let lastTurnProgress = 0.05;

    for (let i = stride; i < total - stride; i += stride) {
      const prev = { lat: poly[i - stride][0], lng: poly[i - stride][1] };
      const curr = { lat: poly[i][0], lng: poly[i][1] };
      const next = { lat: poly[Math.min(i + stride, total - 1)][0], lng: poly[Math.min(i + stride, total - 1)][1] };
      const b1 = bearingDeg(prev, curr);
      const b2 = bearingDeg(curr, next);
      const diff = angleDiff(b1, b2);
      const progress = i / (total - 1);

      if (Math.abs(diff) > 28 && progress - lastTurnProgress > 0.08) {
        const remainingKm = Math.round(((1 - progress) * route.distanceM) / 1000);
        let dir: string;
        if (diff >= 120) dir = "Uターン（右）";
        else if (diff >= 60) dir = "右折";
        else if (diff >= 28) dir = "やや右方向";
        else if (diff <= -120) dir = "Uターン（左）";
        else if (diff <= -60) dir = "左折";
        else dir = "やや左方向";
        steps.push({ progress, text: `${dir}です（残り約${remainingKm}km）` });
        lastTurnProgress = progress;
      }
    }
  }

  steps.push({ progress: 0.9, text: `${destName}周辺です。減速してください` });
  steps.push({ progress: 0.99, text: "目的地に到着です" });

  return steps.sort((a, b) => a.progress - b.progress);
};

const speakJapanese = (text: string) => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.rate = 1.0;
  window.speechSynthesis.speak(utterance);
};

const buildSimulationTrack = (polyline: [number, number][], steps = 200): LatLng[] => {
  if (polyline.length <= 1) {
    const p = polyline[0] ?? [defaultOrigin.lat, defaultOrigin.lng];
    return [{ lat: p[0], lng: p[1] }];
  }

  const points: LatLng[] = [];
  const segments = polyline.length - 1;

  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1);
    const segFloat = t * segments;
    const segIdx = Math.min(Math.floor(segFloat), segments - 1);
    const localT = segFloat - segIdx;
    const [lat1, lng1] = polyline[segIdx];
    const [lat2, lng2] = polyline[segIdx + 1];
    points.push({
      lat: lat1 + (lat2 - lat1) * localT,
      lng: lng1 + (lng2 - lng1) * localT
    });
  }

  return points;
};

const nearestProgressOnPolyline = (polyline: [number, number][], point: LatLng) => {
  if (polyline.length <= 1) return 0;

  let bestIdx = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  polyline.forEach(([lat, lng], idx) => {
    const dLat = lat - point.lat;
    const dLng = lng - point.lng;
    const distanceSq = dLat * dLat + dLng * dLng;
    if (distanceSq < bestDistance) {
      bestDistance = distanceSq;
      bestIdx = idx;
    }
  });

  return bestIdx / (polyline.length - 1);
};

function App() {
  const [originText, setOriginText] = useState("バスタ新宿");
  const [destText, setDestText] = useState("博多バスターミナル");
  const [waypointText, setWaypointText] = useState("");
  const [originPoint, setOriginPoint] = useState<LatLng>(defaultOrigin);
  const [destPoint, setDestPoint] = useState<LatLng>(defaultDestination);
  const [originCandidates, setOriginCandidates] = useState<GeocodeResult[]>([]);
  const [destCandidates, setDestCandidates] = useState<GeocodeResult[]>([]);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [traffic, setTraffic] = useState<TrafficIncident[]>([]);
  const [parking, setParking] = useState<BusParkingSpot[]>([]);
  const [history, setHistory] = useState<RouteHistoryEntry[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchingPlace, setSearchingPlace] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrPreview, setOcrPreview] = useState("");
  const [originSuggestLoading, setOriginSuggestLoading] = useState(false);
  const [destSuggestLoading, setDestSuggestLoading] = useState(false);

  const [isNavigating, setIsNavigating] = useState(false);
  const [navRouteId, setNavRouteId] = useState("");
  const [navTrack, setNavTrack] = useState<LatLng[]>([]);
  const [gpsPosition, setGpsPosition] = useState<LatLng | null>(null);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [navIndex, setNavIndex] = useState(0);
  const [navHeadingDeg, setNavHeadingDeg] = useState(0);
  const [guidanceSteps, setGuidanceSteps] = useState<GuidanceStep[]>([]);
  const [spokenStepIndex, setSpokenStepIndex] = useState(-1);
  const gpsWatchIdRef = useRef<number | null>(null);
  const prevGpsPositionRef = useRef<LatLng | null>(null);

  const origin = useMemo(() => originPoint, [originPoint]);
  const destination = useMemo(() => destPoint, [destPoint]);

  const selectedRoute = useMemo(
    () => routes.find((r) => r.id === selectedRouteId),
    [routes, selectedRouteId]
  );

  const navigatingRoute = useMemo(
    () => routes.find((r) => r.id === navRouteId),
    [routes, navRouteId]
  );

  const navProgress = useMemo(() => {
    if (gpsEnabled && gpsPosition && navigatingRoute) {
      return nearestProgressOnPolyline(navigatingRoute.polyline, gpsPosition);
    }
    if (!navTrack.length || navTrack.length === 1) return 0;
    return navIndex / (navTrack.length - 1);
  }, [gpsEnabled, gpsPosition, navigatingRoute, navTrack.length, navIndex]);

  const navPosition = useMemo(() => {
    if (!isNavigating) return null;
    if (gpsEnabled && gpsPosition) return gpsPosition;
    if (!navTrack.length) return null;
    return navTrack[Math.min(navIndex, navTrack.length - 1)];
  }, [gpsEnabled, gpsPosition, isNavigating, navIndex, navTrack]);

  const navRemainingSec = useMemo(() => {
    if (!navigatingRoute) return 0;
    return Math.max(0, Math.round(navigatingRoute.durationSec * (1 - navProgress)));
  }, [navigatingRoute, navProgress]);

  const navRemainingM = useMemo(() => {
    if (!navigatingRoute) return 0;
    return Math.max(0, Math.round(navigatingRoute.distanceM * (1 - navProgress)));
  }, [navigatingRoute, navProgress]);

  const activeGuidanceStepIndex = useMemo(() => {
    if (!guidanceSteps.length) return -1;
    for (let i = guidanceSteps.length - 1; i >= 0; i -= 1) {
      if (navProgress >= guidanceSteps[i].progress) {
        return i;
      }
    }
    return 0;
  }, [guidanceSteps, navProgress]);

  const pickCandidate = (value: string, candidates: GeocodeResult[]): LatLng | null => {
    const matched = candidates.find((c) => c.title === value.trim());
    return matched ? matched.location : null;
  };

  const resolveOrigin = async (): Promise<LatLng> => {
    const candidates = await searchPlace(normalizePlaceAlias(originText));
    setOriginCandidates(candidates);
    if (!candidates.length) throw new Error("出発地が見つかりません");
    setOriginText(candidates[0].title);
    return candidates[0].location;
  };

  const resolveDestination = async (around: LatLng): Promise<LatLng> => {
    const candidates = await searchPlace(normalizePlaceAlias(destText), around);
    setDestCandidates(candidates);
    if (!candidates.length) throw new Error("目的地が見つかりません");
    setDestText(candidates[0].title);
    return candidates[0].location;
  };

  const resolveWaypoints = async (origin: LatLng) => {
    const waypointQueries = splitWaypointInput(waypointText);
    if (!waypointQueries.length) return { points: [] as LatLng[], titles: [] as string[] };

    const points: LatLng[] = [];
    const titles: string[] = [];
    let around = origin;

    for (const query of waypointQueries) {
      const candidates = await searchPlace(query, around);
      if (!candidates.length) throw new Error(`経由地「${query}」が見つかりません`);
      points.push(candidates[0].location);
      titles.push(candidates[0].title);
      around = candidates[0].location;
    }

    return { points, titles };
  };

  const handleItineraryImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    setOcrLoading(true);
    try {
      const result = await recognize(file, "jpn+eng");
      const text = result.data.text.trim();
      setOcrPreview(text);

      const parsed = parseItineraryText(text);
      if (!parsed) {
        throw new Error("行程表から出発地と目的地を抽出できませんでした");
      }

      setOriginText(parsed.originText);
      setDestText(parsed.destinationText);
      setWaypointText(parsed.waypointTexts.join("\n"));
      setOriginCandidates([]);
      setDestCandidates([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "画像の読み取りに失敗しました");
    } finally {
      setOcrLoading(false);
    }
  };

  const searchPlaces = async () => {
    setError("");
    setSearchingPlace(true);
    try {
      const preferredOrigin = pickCandidate(originText, originCandidates);
      const resolvedOrigin = preferredOrigin ?? (await resolveOrigin());
      setOriginPoint(resolvedOrigin);
      const { points: resolvedWaypoints, titles: resolvedWaypointTitles } = await resolveWaypoints(resolvedOrigin);
      const preferredDest = pickCandidate(destText, destCandidates);
      const around = resolvedWaypoints[resolvedWaypoints.length - 1] ?? resolvedOrigin;
      const resolvedDest = preferredDest ?? (await resolveDestination(around));
      setDestPoint(resolvedDest);
      if (resolvedWaypointTitles.length) {
        setWaypointText(resolvedWaypointTitles.join("\n"));
      }
      return { resolvedOrigin, resolvedDest, resolvedWaypoints };
    } finally {
      setSearchingPlace(false);
    }
  };

  const refreshTraffic = async () => {
    const minLat = Math.min(origin.lat, destination.lat) - 0.2;
    const minLng = Math.min(origin.lng, destination.lng) - 0.2;
    const maxLat = Math.max(origin.lat, destination.lat) + 0.2;
    const maxLng = Math.max(origin.lng, destination.lng) + 0.2;
    const bbox = `${minLat},${minLng},${maxLat},${maxLng}`;
    const incidents = await fetchTraffic(bbox);
    setTraffic(incidents);
  };

  const searchRoutes = async () => {
    setError("");
    setLoading(true);
    setIsNavigating(false);
    setNavTrack([]);
    setNavIndex(0);
    setNavRouteId("");
    setGuidanceSteps([]);
    setSpokenStepIndex(-1);
    try {
      const { resolvedOrigin, resolvedDest, resolvedWaypoints } = await searchPlaces();

      const [routeData, trafficData, parkingData, historyData] = await Promise.all([
        fetchRoutes(resolvedOrigin, resolvedDest, resolvedWaypoints),
        fetchTraffic(
          `${resolvedOrigin.lat - 0.2},${resolvedOrigin.lng - 0.2},${resolvedDest.lat + 0.2},${resolvedDest.lng + 0.2}`
        ),
        fetchParking(resolvedDest),
        fetchHistory()
      ]);

      setRoutes(routeData.slice(0, 3));
      setSelectedRouteId(routeData[0]?.id ?? "");
      setTraffic(trafficData);
      setParking(parkingData.filter((p) => p.busFriendly));
      setHistory(historyData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取得エラー");
    } finally {
      setLoading(false);
    }
  };

  const startNavigation = async () => {
    if (!selectedRoute) return;
    const simTrack = buildSimulationTrack(selectedRoute.polyline);
    setNavTrack(simTrack);
    setNavIndex(0);
    setGpsPosition(null);
    setGpsEnabled(false);
    prevGpsPositionRef.current = null;
    if (gpsWatchIdRef.current !== null && typeof navigator !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }

    if (typeof navigator !== "undefined" && "geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const nextPos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setGpsPosition(nextPos);
          setGpsEnabled(true);

          const heading = position.coords.heading;
          if (Number.isFinite(heading)) {
            setNavHeadingDeg(Number(heading));
          } else if (prevGpsPositionRef.current) {
            setNavHeadingDeg(bearingDeg(prevGpsPositionRef.current, nextPos));
          }

          prevGpsPositionRef.current = nextPos;
        },
        () => {
          setGpsEnabled(false);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 2000,
          timeout: 10000
        }
      );
      gpsWatchIdRef.current = watchId;
    }

    setNavRouteId(selectedRoute.id);
    setIsNavigating(true);
    setGuidanceSteps(buildGuidanceSteps(selectedRoute, destText));
    setSpokenStepIndex(-1);
    try {
      await storeCurrentRoute();
    } catch {
      // Keep navigation running even if history save fails.
    }
  };

  const stopNavigation = () => {
    setIsNavigating(false);
    setNavTrack([]);
    setGpsPosition(null);
    setGpsEnabled(false);
    prevGpsPositionRef.current = null;
    if (gpsWatchIdRef.current !== null && typeof navigator !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }
    setNavIndex(0);
    setNavRouteId("");
    setGuidanceSteps([]);
    setSpokenStepIndex(-1);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  };

  const storeCurrentRoute = async () => {
    const selected = routes.find((r) => r.id === selectedRouteId);
    if (!selected) return;

    const track = selected.polyline.map(([lat, lng]) => ({ lat, lng }));
    await saveHistory({
      origin,
      destination,
      selectedRouteId: selected.id,
      routeName: selected.label,
      track
    });
    setHistory(await fetchHistory());
  };

  useEffect(() => {
    void searchRoutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      void refreshTraffic();
    }, 30000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originText, destText]);

  useEffect(() => {
    const value = originText.trim();
    if (!value) {
      setOriginCandidates([]);
      return;
    }

    const timer = setTimeout(() => {
      void (async () => {
        try {
          setOriginSuggestLoading(true);
          const results = await searchPlace(normalizePlaceAlias(value));
          setOriginCandidates(results);
        } finally {
          setOriginSuggestLoading(false);
        }
      })();
    }, 300);

    return () => clearTimeout(timer);
  }, [originText]);

  useEffect(() => {
    const value = destText.trim();
    if (!value) {
      setDestCandidates([]);
      return;
    }

    const timer = setTimeout(() => {
      void (async () => {
        try {
          setDestSuggestLoading(true);
          const results = await searchPlace(normalizePlaceAlias(value), originPoint);
          setDestCandidates(results);
        } finally {
          setDestSuggestLoading(false);
        }
      })();
    }, 300);

    return () => clearTimeout(timer);
  }, [destText, originPoint]);

  useEffect(() => {
    if (!isNavigating || gpsEnabled || navTrack.length <= 1) return;

    const timer = setInterval(() => {
      setNavIndex((current) => {
        if (current >= navTrack.length - 1) {
          setIsNavigating(false);
          return current;
        }
        return current + 1;
      });
    }, 200); // 200ms間隔でより滑らかな走行表示

    return () => clearInterval(timer);
  }, [gpsEnabled, isNavigating, navTrack]);

  useEffect(() => {
    if (!isNavigating || gpsEnabled || navTrack.length <= 1) return;
    const current = navTrack[Math.min(navIndex, navTrack.length - 1)];
    const next = navTrack[Math.min(navIndex + 1, navTrack.length - 1)];
    setNavHeadingDeg(bearingDeg(current, next));
  }, [gpsEnabled, isNavigating, navIndex, navTrack]);

  useEffect(() => {
    return () => {
      if (gpsWatchIdRef.current !== null && typeof navigator !== "undefined" && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isNavigating || activeGuidanceStepIndex < 0) return;
    if (spokenStepIndex >= activeGuidanceStepIndex) return;
    const stepText = guidanceSteps[activeGuidanceStepIndex]?.text;
    if (!stepText) return;

    speakJapanese(stepText);
    setSpokenStepIndex(activeGuidanceStepIndex);
  }, [isNavigating, activeGuidanceStepIndex, guidanceSteps, spokenStepIndex]);

  return (
    <div className="app-shell">
      <MapPanel
        center={origin}
        routes={routes}
        selectedRouteId={selectedRouteId}
        incidents={traffic}
        parking={parking}
        destination={destination}
        navigationPosition={navPosition}
        navHeadingDeg={navHeadingDeg}
        isNavigating={isNavigating}
      />

      <header className="hero">
        <h1>Tour Bus NAVI</h1>
      </header>

      {isNavigating && (
        <>
          <button className="nav-back-btn" onClick={stopNavigation}>
            ← トップへ戻る
          </button>
          <div className="nav-guidance-panel">
            <div className="nav-guidance-text">
              {guidanceSteps[activeGuidanceStepIndex]?.text ?? "案内を準備中..."}
            </div>
            <div className="nav-remaining">
              残り {min(navRemainingSec)} &nbsp;／&nbsp; {km(navRemainingM)}
            </div>
          </div>
        </>
      )}

      {!isNavigating && (
        <section className="panel controls">
          <label>
            行程表の写真から自動入力
            <input type="file" accept="image/*" capture="environment" onChange={handleItineraryImage} />
          </label>
          <small className="helper-text">
            行程表を撮影すると、出発地・経由地・目的地を抽出します。社庫はヤサカ観光バス大阪支社として扱います。
          </small>
          {ocrLoading && <small>行程表を読み取り中...</small>}
          {ocrPreview && !ocrLoading && <p className="ocr-preview">OCR結果: {ocrPreview.slice(0, 160)}{ocrPreview.length > 160 ? "..." : ""}</p>}
          <label>
            出発地 (日本語地名)
            <input value={originText} onChange={(e) => setOriginText(e.target.value)} />
          </label>
          {originSuggestLoading && <small>出発地候補を検索中...</small>}
          {originCandidates.length > 0 && (
            <div className="candidate-list">
              {originCandidates.slice(0, 5).map((item) => (
                <button
                  key={`${item.title}-${item.address}`}
                  className="candidate-item"
                  onClick={() => {
                    setOriginText(item.title);
                    setOriginPoint(item.location);
                  }}
                >
                  <strong>{item.title}</strong>
                  <small>{item.address}</small>
                </button>
              ))}
            </div>
          )}
          <label>
            目的地 (日本語地名)
            <input value={destText} onChange={(e) => setDestText(e.target.value)} />
          </label>
          {destSuggestLoading && <small>目的地候補を検索中...</small>}
          {destCandidates.length > 0 && (
            <div className="candidate-list">
              {destCandidates.slice(0, 5).map((item) => (
                <button
                  key={`${item.title}-${item.address}`}
                  className="candidate-item"
                  onClick={() => {
                    setDestText(item.title);
                    setDestPoint(item.location);
                  }}
                >
                  <strong>{item.title}</strong>
                  <small>{item.address}</small>
                </button>
              ))}
            </div>
          )}
          <label>
            経由地 (改行区切り)
            <textarea value={waypointText} onChange={(e) => setWaypointText(e.target.value)} rows={3} />
          </label>
          <div className="actions">
            <button onClick={() => void searchRoutes()} disabled={loading} style={{ flex: 1 }}>
              {loading || searchingPlace ? "検索中..." : "ルート検索"}
            </button>
            <button onClick={() => void startNavigation()} disabled={!selectedRouteId} style={{ flex: 1 }}>
              ナビ開始
            </button>
          </div>
          {error && <p className="error">{error}</p>}

          <RouteSelector routes={routes} selectedRouteId={selectedRouteId} onSelect={setSelectedRouteId} />
          <HistoryPanel history={history} />
        </section>
      )}
    </div>
  );
}

export default App;
