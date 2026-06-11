import axios from "axios";
import { hasHereKey, hereSearchClient } from "./hereClient.js";
import { LatLng } from "../types.js";

export type GeocodeResult = {
  title: string;
  address: string;
  location: LatLng;
};

const placeAliases: Record<string, string> = {
  "社庫": "ヤサカ観光バス大阪支社"
};

const fallbackPlaces: Record<string, GeocodeResult> = {
  "ヤサカ観光バス大阪支社": {
    title: "ヤサカ観光バス大阪支社",
    address: "大阪府大阪市西淀川区中島2-4-131",
    location: { lat: 34.6965, lng: 135.4171 }
  },
  "バスタ新宿": {
    title: "バスタ新宿",
    address: "東京都渋谷区千駄ヶ谷5丁目24-55",
    location: { lat: 35.688923, lng: 139.700442 }
  },
  "東京駅八重洲南口バスターミナル": {
    title: "東京駅八重洲南口バスターミナル",
    address: "東京都千代田区丸の内1丁目9",
    location: { lat: 35.679596, lng: 139.767062 }
  },
  "横浜シティエアターミナル": {
    title: "横浜シティエアターミナル",
    address: "神奈川県横浜市西区高島2丁目19-12",
    location: { lat: 35.465976, lng: 139.624599 }
  },
  "名古屋駅太閤通口バスターミナル": {
    title: "名古屋駅太閤通口バスターミナル",
    address: "愛知県名古屋市中村区椿町",
    location: { lat: 35.168115, lng: 136.883375 }
  },
  "大阪駅JR高速バスターミナル": {
    title: "大阪駅JR高速バスターミナル",
    address: "大阪府大阪市北区梅田3丁目1-1",
    location: { lat: 34.702289, lng: 135.495215 }
  },
  "京都駅八条口バスターミナル": {
    title: "京都駅八条口バスターミナル",
    address: "京都府京都市南区東九条西山王町",
    location: { lat: 34.984873, lng: 135.758356 }
  },
  "仙台駅東口バスターミナル": {
    title: "仙台駅東口バスターミナル",
    address: "宮城県仙台市宮城野区榴岡",
    location: { lat: 38.260223, lng: 140.884606 }
  },
  "新潟駅南口バスターミナル": {
    title: "新潟駅南口バスターミナル",
    address: "新潟県新潟市中央区花園1丁目",
    location: { lat: 37.912307, lng: 139.061327 }
  },
  "広島駅新幹線口バスターミナル": {
    title: "広島駅新幹線口バスターミナル",
    address: "広島県広島市東区若草町",
    location: { lat: 34.397515, lng: 132.475383 }
  },
  "博多バスターミナル": {
    title: "博多バスターミナル",
    address: "福岡県福岡市博多区博多駅中央街2-1",
    location: { lat: 33.590213, lng: 130.420481 }
  },
  "鹿児島中央駅バスターミナル": {
    title: "鹿児島中央駅バスターミナル",
    address: "鹿児島県鹿児島市中央町",
    location: { lat: 31.583563, lng: 130.541346 }
  },
  "那覇バスターミナル": {
    title: "那覇バスターミナル",
    address: "沖縄県那覇市泉崎1丁目20-1",
    location: { lat: 26.210931, lng: 127.681109 }
  }
};

const fallbackGeocode = (query: string): GeocodeResult[] => {
  const normalized = query.trim();
  if (!normalized) return [];

  const exact = fallbackPlaces[normalized];
  if (exact) return [exact];

  return Object.values(fallbackPlaces).filter((p) => p.title.includes(normalized));
};

const normalizePlaceQuery = (query: string) => {
  const normalized = query.trim();
  return placeAliases[normalized] ?? normalized;
};

export const geocodeJapanesePlace = async (query: string, at?: LatLng): Promise<GeocodeResult[]> => {
  const normalized = normalizePlaceQuery(query);
  if (!normalized) return [];

  if (!hasHereKey) {
    const fromLocal = fallbackGeocode(normalized);
    if (fromLocal.length) {
      return fromLocal;
    }

    try {
      const osm = await axios.get("https://nominatim.openstreetmap.org/search", {
        params: {
          q: normalized.includes("日本") ? normalized : `${normalized} 日本`,
          format: "jsonv2",
          limit: 6,
          "accept-language": "ja"
        },
        headers: {
          "User-Agent": "tour-bus-navitime-webapp/0.1"
        },
        timeout: 12000
      });

      const osmItems = Array.isArray(osm.data) ? osm.data : [];
      const osmResults = osmItems
        .map((item: any) => ({
          title: String(item.name || item.display_name || normalized),
          address: String(item.display_name || "住所情報なし"),
          location: {
            lat: Number(item.lat),
            lng: Number(item.lon)
          }
        }))
        .filter((item: GeocodeResult) => Number.isFinite(item.location.lat) && Number.isFinite(item.location.lng));

      if (osmResults.length) {
        return osmResults;
      }
    } catch {
      // Fallback dictionary is returned below if web geocoding fails.
    }

    return fallbackGeocode(normalized);
  }

  const response = await hereSearchClient.get("/geocode", {
    params: {
      q: normalized,
      lang: "ja-JP",
      limit: 6,
      ...(at ? { at: `${at.lat},${at.lng}` } : {})
    }
  });

  const items = response.data?.items ?? [];

  return items
    .map((item: any) => ({
      title: item.title ?? normalized,
      address: item.address?.label ?? "住所情報なし",
      location: {
        lat: item.position?.lat,
        lng: item.position?.lng
      }
    }))
    .filter((item: GeocodeResult) => Number.isFinite(item.location.lat) && Number.isFinite(item.location.lng));
};
