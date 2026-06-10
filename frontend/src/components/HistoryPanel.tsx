import { RouteHistoryEntry } from "../lib/types";

type Props = {
  history: RouteHistoryEntry[];
};

export default function HistoryPanel({ history }: Props) {
  return (
    <div className="panel">
      <h2>ルートヒストリー</h2>
      {history.length === 0 && <p>まだ記録がありません。</p>}
      {history.slice(0, 6).map((item) => (
        <div className="history-item" key={item.id}>
          <div>{item.routeName}</div>
          <small>{new Date(item.createdAt).toLocaleString("ja-JP")}</small>
          <small>トラック点数: {item.track.length}</small>
        </div>
      ))}
    </div>
  );
}
