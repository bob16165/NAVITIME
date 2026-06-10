import { RouteOption } from "../lib/types";

type Props = {
  routes: RouteOption[];
  selectedRouteId: string;
  onSelect: (routeId: string) => void;
};

const min = (sec: number) => `${Math.round(sec / 60)}分`;
const km = (m: number) => `${(m / 1000).toFixed(1)}km`;

export default function RouteSelector({ routes, selectedRouteId, onSelect }: Props) {
  return (
    <div className="panel">
      <h2>候補ルート</h2>
      {routes.map((route) => (
        <button
          key={route.id}
          className={`route-item ${route.id === selectedRouteId ? "selected" : ""}`}
          onClick={() => onSelect(route.id)}
        >
          <div className="route-header">
            <span>{route.label}</span>
            <span>{min(route.durationSec)}</span>
          </div>
          <div className="route-meta">
            <span>距離: {km(route.distanceM)}</span>
            <span>渋滞遅延: {min(route.trafficDelaySec)}</span>
          </div>
          <div className="route-meta">
            <span className={`road-chip ${route.hasTollRoad ? "highway" : "local"}`}>
              {route.hasTollRoad ? "高速道路" : "一般道"}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
