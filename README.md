# Tour Bus NAVI (Japan)

観光バス向けのモバイルWebナビゲーションシステムのプロトタイプです。

## 対応要件

- 観光バス向け経路: `transportMode=truck` を使い大型車想定でルーティング
- バス対応駐車場: 駐車場検索をバス向けキーワードで実施し、バス対応のみ表示
- 日本語地名検索: 出発地/目的地を日本語で入力して座標へ変換
- 行程表OCR入力: 行程表を撮影して出発地・経由地・目的地を自動抽出
- 3ルート候補: 所要時間・高速有無・渋滞遅延を比較して選択可能
- リアルタイム交通情報: 交通インシデントを地図上に定期更新表示
- ルートヒストリー: 選択ルートの軌跡を保存・表示

## 技術構成

- Frontend: React + Vite + TypeScript + Leaflet
- Backend: Node.js + Express + TypeScript
- Routing / Traffic / Search: HERE API（キー未設定時はモックデータ）

## セットアップ

1. 依存関係をインストール

```bash
npm install
```

2. 環境変数を設定

```bash
cp .env.example .env
# HERE_API_KEY=xxxx を設定（未設定でもモックで動作）
```

3. 開発サーバ起動

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:8787

## API

- `GET /api/routes?originLat=..&originLng=..&destLat=..&destLng=..&vias=lat,lng|lat,lng`
- `GET /api/geocode?q=東京駅&atLat=35.68&atLng=139.76`
- `GET /api/traffic?bbox=minLat,minLng,maxLat,maxLng`
- `GET /api/parking?lat=..&lng=..&limit=12`
- `GET /api/history`
- `POST /api/history`

## 補足

- 現在のヒストリーはインメモリ保存です（再起動で消えます）。
- 本番運用時はDB保存、認証、運行管理データ連携、バス向け制限値の精密化を推奨します。
