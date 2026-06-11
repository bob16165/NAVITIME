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
  routes: RouteOption[];
  selectedRouteId: string;
  center: LatLng;
  destination: LatLng;
};

const metersToLat = (meters: number) => meters / 111320;

const moveAhead = (pos: LatLng, bearing: number, meters: number): LatLng => {
  const rad = (bearing * Math.PI) / 180;
  const dLat = metersToLat(meters) * Math.cos(rad);
  const cosLat = Math.max(Math.cos((pos.lat * Math.PI) / 180), 0.01);
  const dLng = (metersToLat(meters) * Math.sin(rad)) / cosLat;
  return { lat: pos.lat + dLat, lng: pos.lng + dLng };
};

function MapController({ isNavigating, navigationPosition, navHeadingDeg, routes, selectedRouteId, center, destination }: CameraProps) {
  const map = useMap();

  // ルートが変わったら全体を表示
  useEffect(() => {
    if (isNavigating) return;
    const selected = routes.find((r) => r.id === selectedRouteId);
    if (selected && selected.polyline.length > 1) {
      const bounds = L.latLngBounds(selected.polyline.map(([lat, lng]) => [lat, lng] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40], animate: true, duration: 0.6 });
    } else if (routes.length === 0) {
      map.setView([center.lat, center.lng], 9, { animate: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRouteId, routes]);

  // ナビ中はバスを追従
  useEffect(() => {
    if (!isNavigating || !navigationPosition) return;
    const viewCenter = moveAhead(navigationPosition, navHeadingDeg, 200);
    map.setView([viewCenter.lat, viewCenter.lng], 13, { animate: true, duration: 0.4 });
  }, [isNavigating, navigationPosition, navHeadingDeg, map]);

  return null;
}

const createBusIcon = (heading: number) =>
  L.divIcon({
    className: "bus-icon-shell",
    html: `<div class="bus-icon" style="transform: rotate(${heading}deg)">
      <svg viewBox="0 0 64 64" width="44" height="44" xmlns="http://www.w3.org/2000/svg" aria-label="bus">
        <circle cx="32" cy="32" r="30" fill="#fff" opacity="0.9"/>
        <polygon points="32,6 24,20 40,20" fill="#ff7a00"/>
        <rect x="14" y="18" width="36" height="24" rx="5" fill="#ff7a00" stroke="#c25200" stroke-width="2"/>
        <rect x="18" y="22" width="28" height="10" rx="2" fill="#e0f2fe"/>
        <circle cx="22" cy="46" r="5" fill="#1e293b"/>
        <circle cx="42" cy="46" r="5" fill="#1e293b"/>
      </svg>
    </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22]
  });

const createUprightLabelIcon = (text: string, className: string) =>
  L.divIcon({
    className: "upright-label-shell",
    html: `<div class="upright-label ${className}">${text}</div>`,
    iconSize: [120, 26],
    iconAnchor: [60, 13]
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
    <MapContainer center={[center.lat, center.lng]} zoom={9} scrollWheelZoom className="map-view">
      <MapController
        isNavigating={isNavigating}
        navigationPosition={navigationPosition}
        navHeadingDeg={navHeadingDeg}
        routes={routes}
        selectedRouteId={selectedRouteId}
        center={center}
        destination={destination}
      />

      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {routes.map((route, idx) => (
        <Polyline
          key={route.id}
          positions={route.polyline}
          pathOptions={{
            color: route.id === selectedRouteId ? "#ff7a00" : ["#10b981", "#3b82f6", "#8b5cf6"][idx % 3],
            weight: route.id === selectedRouteId ? 8 : 3,
            opacity: route.id === selectedRouteId ? 1 : 0.45,
            lineCap: "round",
            lineJoin: "round"
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

      <CircleMarker center={[destination.lat, destination.lng]} radius={10} pathOptions={{ color: "#2563eb", fillColor: "#2563eb", fillOpacity: 1 }}>
        <Popup>目的地</Popup>
      </CircleMarker>
      <Marker
        position={[destination.lat, destination.lng]}
        icon={createUprightLabelIcon("目的地", "destination-label")}
        interactive={false}
      />

      {navigationPosition && (
        <>
          <Circle center={[navigationPosition.lat, navigationPosition.lng]} radius={80} pathOptions={{ color: "#ff7a00", fillColor: "#ff7a00", fillOpacity: 0.15 }} />
          <Marker position={[navigationPosition.lat, navigationPosition.lng]} icon={createBusIcon(navHeadingDeg)}>
            <Popup>現在地（観光バス）</Popup>
          </Marker>
        </>
      )}
    </MapContainer>
  );
}
