import L from "leaflet";
import { useEffect } from "react";
import { Circle, CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { LatLng, RouteOption, TrafficIncident, BusParkingSpot } from "../lib/types";

type Props = {
  center: LatLng;
  destination: LatLng;
  routes: RouteOption[];
  selectedRouteId: string;
  incidents: TrafficIncident[];
  parking: BusParkingSpot[];
  navigationPosition: LatLng | null;
  navHeadingDeg: number;
  isNavigating: boolean;
};

type CameraProps = {
  isNavigating: boolean;
  navigationPosition: LatLng | null;
  navHeadingDeg: number;
};

const metersToLat = (meters: number) => meters / 111320;

const moveAhead = (pos: LatLng, bearing: number, meters: number): LatLng => {
  const rad = (bearing * Math.PI) / 180;
  const dLat = metersToLat(meters) * Math.cos(rad);
  const cosLat = Math.max(Math.cos((pos.lat * Math.PI) / 180), 0.01);
  const dLng = (metersToLat(meters) * Math.sin(rad)) / cosLat;
  return { lat: pos.lat + dLat, lng: pos.lng + dLng };
};

function NavigationCamera({ isNavigating, navigationPosition, navHeadingDeg }: CameraProps) {
  const map = useMap();

  useEffect(() => {
    if (!isNavigating || !navigationPosition) return;
    const viewCenter = moveAhead(navigationPosition, navHeadingDeg, 35);
    map.setView([viewCenter.lat, viewCenter.lng], 18, { animate: true, duration: 0.45 });
  }, [isNavigating, navigationPosition, navHeadingDeg, map]);

  useEffect(() => {
    const mapPane = map.getPane("mapPane");
    if (!mapPane) return;

    const originalTransition = mapPane.style.transition;
    const applyRotation = (deg: number) => {
      const currentTransform = mapPane.style.transform || "";
      const withoutRotate = currentTransform.replace(/\s*rotate\([^)]*\)/g, "").trim();
      mapPane.style.transform = `${withoutRotate} rotate(${-deg}deg)`.trim();
      mapPane.style.transition = "transform 220ms linear";
      mapPane.style.transformOrigin = "50% 50%";
    };

    if (isNavigating && navigationPosition) {
      applyRotation(navHeadingDeg);
    } else {
      const currentTransform = mapPane.style.transform || "";
      mapPane.style.transform = currentTransform.replace(/\s*rotate\([^)]*\)/g, "").trim();
      mapPane.style.transition = originalTransition;
    }

    return () => {
      const currentTransform = mapPane.style.transform || "";
      mapPane.style.transform = currentTransform.replace(/\s*rotate\([^)]*\)/g, "").trim();
      mapPane.style.transition = originalTransition;
    };
  }, [isNavigating, navigationPosition, navHeadingDeg, map]);

  return null;
}

const createBusIcon = (heading: number) =>
  L.divIcon({
    className: "bus-icon-shell",
    html: `<div class="bus-icon" style="transform: rotate(${heading}deg)">
      <svg viewBox="0 0 64 64" width="36" height="36" xmlns="http://www.w3.org/2000/svg" aria-label="bus">
        <rect x="10" y="12" width="44" height="30" rx="6" fill="#ff7a00" stroke="#111827" stroke-width="3"/>
        <rect x="16" y="18" width="32" height="10" rx="2" fill="#e0f2fe"/>
        <circle cx="20" cy="46" r="5" fill="#111827"/>
        <circle cx="44" cy="46" r="5" fill="#111827"/>
        <polygon points="32,4 28,12 36,12" fill="#111827"/>
      </svg>
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });

const createUprightLabelIcon = (text: string, counterDeg: number, className: string) =>
  L.divIcon({
    className: "upright-label-shell",
    html: `<div class="upright-label ${className}" style="transform: rotate(${counterDeg}deg)">${text}</div>`,
    iconSize: [180, 30],
    iconAnchor: [90, 15]
  });

export default function MapPanel({
  center,
  destination,
  routes,
  selectedRouteId,
  incidents,
  parking,
  navigationPosition,
  navHeadingDeg,
  isNavigating
}: Props) {
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={11} scrollWheelZoom className="map-view">
      <NavigationCamera isNavigating={isNavigating} navigationPosition={navigationPosition} navHeadingDeg={navHeadingDeg} />

      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {routes.map((route, idx) => (
        <Polyline
          key={route.id}
          positions={route.polyline}
          pathOptions={{
            color: route.id === selectedRouteId ? "#ff7a00" : ["#0d9488", "#2563eb", "#9333ea"][idx % 3],
            weight: route.id === selectedRouteId ? 7 : 4,
            opacity: route.id === selectedRouteId ? 0.95 : 0.6
          }}
        />
      ))}

      {incidents.map((incident) => (
        <CircleMarker
          key={incident.id}
          center={[incident.location.lat, incident.location.lng]}
          radius={7}
          pathOptions={{ color: incident.severity === "critical" ? "#dc2626" : "#f59e0b" }}
        >
          <Popup>
            <strong>{incident.title}</strong>
            <div>{incident.type}</div>
            <div>重要度: {incident.severity}</div>
          </Popup>
        </CircleMarker>
      ))}

      {parking.map((spot) => (
        <Marker key={spot.id} position={[spot.location.lat, spot.location.lng]}>
          <Popup>
            <strong>{spot.name}</strong>
            <div>{spot.address}</div>
            <div>{spot.notes}</div>
          </Popup>
        </Marker>
      ))}

      <CircleMarker center={[destination.lat, destination.lng]} radius={8} pathOptions={{ color: "#2563eb" }}>
        <Popup>目的地</Popup>
      </CircleMarker>
      <Marker
        position={[destination.lat + 0.00015, destination.lng]}
        icon={createUprightLabelIcon("目的地", isNavigating ? navHeadingDeg : 0, "destination-label")}
        interactive={false}
      />

      {navigationPosition && (
        <>
          <Circle center={[navigationPosition.lat, navigationPosition.lng]} radius={100} pathOptions={{ color: "#0f172a" }} />
          <Marker position={[navigationPosition.lat, navigationPosition.lng]} icon={createBusIcon(navHeadingDeg)}>
            <Popup>現在地（観光バス）</Popup>
          </Marker>
          <Marker
            position={[navigationPosition.lat + 0.00015, navigationPosition.lng]}
            icon={createUprightLabelIcon("観光バス現在地", isNavigating ? navHeadingDeg : 0, "bus-label")}
            interactive={false}
          />
        </>
      )}
    </MapContainer>
  );
}
