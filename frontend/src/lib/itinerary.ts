const placeAliases: Record<string, string> = {
  "社庫": "ヤサカ観光バス大阪支社"
};

const labelPatterns = {
  origin: /^(?:出発地?|乗車地?|始発|集合地?|発地|発車地?)\s*[:：]?\s*/i,
  destination: /^(?:目的地?|終着地?|到着地?|降車地?|行先|行き先|着地|解散地?)\s*[:：]?\s*/i,
  via: /^(?:経由地?|経由|立寄(?:り)?|立ち寄り|中継地?|停車地?)\s*[:：]?\s*/i
};

const ignoredLinePatterns = [
  /^行程表$/,
  /^日程表$/,
  /^配車表$/,
  /^配席表$/,
  /^乗務員/,
  /^TEL[:：]?/i,
  /^FAX[:：]?/i,
  /^備考[:：]?/,
  /^注意[:：]?/
];

const splitFragments = (value: string) =>
  value
    .split(/[\n|｜→⇨⇒]/)
    .flatMap((item) => item.split(/[、,\/]/))
    .map((item) => item.trim())
    .filter(Boolean);

const cleanupPlaceText = (value: string) => {
  const normalized = value
    .replace(/[（(][^）)]*[）)]/g, " ")
    .replace(/\b\d{1,2}[:：]\d{2}\b/g, " ")
    .replace(/\b\d{1,2}時(?:\d{1,2}分)?\b/g, " ")
    .replace(/\b\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2}\b/g, " ")
    .replace(/\b\d{1,2}月\d{1,2}日\b/g, " ")
    .replace(/^[\s\-ー・●○■□◆◇※*]+/, "")
    .replace(/^\d+[.)．、\s-]*/, "")
    .replace(/^(?:出発地?|目的地?|経由地?|経由|立寄(?:り)?|立ち寄り|中継地?|停車地?|乗車地?|降車地?|集合地?|解散地?)\s*[:：]?\s*/i, "")
    .replace(/(?:発車|出発|到着|着|発|乗車|降車|集合|解散)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";
  if (/^[0-9０-９/:：.-]+$/.test(normalized)) return "";
  if (ignoredLinePatterns.some((pattern) => pattern.test(normalized))) return "";

  return placeAliases[normalized] ?? normalized;
};

const uniquePlaces = (places: string[]) => {
  const seen = new Set<string>();
  return places.filter((place) => {
    if (seen.has(place)) return false;
    seen.add(place);
    return true;
  });
};

export const splitWaypointInput = (value: string) => uniquePlaces(splitFragments(value).map(cleanupPlaceText).filter(Boolean));

export const normalizePlaceAlias = (value: string) => cleanupPlaceText(value) || value.trim();

export type ParsedItinerary = {
  originText: string;
  destinationText: string;
  waypointTexts: string[];
  rawPlaces: string[];
};

export const parseItineraryText = (value: string): ParsedItinerary | null => {
  const lines = value
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let explicitOrigin = "";
  let explicitDestination = "";
  const explicitWaypoints: string[] = [];
  const sequenceCandidates: string[] = [];

  lines.forEach((line) => {
    if (labelPatterns.origin.test(line)) {
      const place = cleanupPlaceText(line.replace(labelPatterns.origin, ""));
      if (place) explicitOrigin = place;
      return;
    }

    if (labelPatterns.destination.test(line)) {
      const place = cleanupPlaceText(line.replace(labelPatterns.destination, ""));
      if (place) explicitDestination = place;
      return;
    }

    if (labelPatterns.via.test(line)) {
      splitFragments(line.replace(labelPatterns.via, ""))
        .map(cleanupPlaceText)
        .filter(Boolean)
        .forEach((place) => explicitWaypoints.push(place));
      return;
    }

    splitFragments(line)
      .map(cleanupPlaceText)
      .filter(Boolean)
      .forEach((place) => sequenceCandidates.push(place));
  });

  const rawPlaces = uniquePlaces(sequenceCandidates);
  const originText = explicitOrigin || rawPlaces[0] || "";
  const destinationText = explicitDestination || rawPlaces[rawPlaces.length - 1] || "";

  if (!originText || !destinationText || originText === destinationText) {
    return null;
  }

  const waypointTexts = uniquePlaces(
    explicitWaypoints.length ? explicitWaypoints : rawPlaces.filter((place) => place !== originText && place !== destinationText)
  );

  return {
    originText,
    destinationText,
    waypointTexts,
    rawPlaces
  };
};