# Dynamic Route Agent - Backend API

自然言語の自由な要望（気分・足の疲れ・治安への不安・食べたいもの等）と、リアルタイムの気象・時期・時間帯を掛け合わせ、複数の最適ルート案を推論・生成する FastAPI バックエンドです。

## 1. 起動方法（フロントエンド開発者向け）

**APIキー（`.env`）がなくてもそのまま起動でき、リアルなモックデータ（`mode: "mock"`）が返ります。**
まずは以下のコマンドだけでローカルサーバーを立ち上げてフロントエンドと繋ぎ込めます。

### `uv` を使う場合（推奨・最速）
```bash
cd backend
uv venv
uv pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8080
```

### 標準の `python3 -m venv` を使う場合
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

- **API ベースURL**: `http://localhost:8080`
- **Swagger UI (ブラウザでAPIテスト可能)**: `http://localhost:8080/docs`
- **ヘルスチェック**: `GET http://localhost:8080/api/health`

---

## 2. 実APIモード（`mode: "live"`）で動かす場合（任意）

Google Maps API と Vertex AI (Gemini) を実際に叩く場合は、`backend/.env.example` をコピーして `backend/.env` を作成してください。

```bash
cp .env.example .env
```

```env
GOOGLE_MAPS_API_KEY=AIzaSy...
GOOGLE_CLOUD_PROJECT=あなたのGCPプロジェクトID
GOOGLE_CLOUD_LOCATION=global
```
※ Vertex AI をローカルから呼ぶ場合は `gcloud auth application-default login` を1回実行してください。未設定またはエラー時は自動的にモックへフォールバックするため、フロントの開発が止まることはありません。

---

## 3. エンドポイント仕様：`POST /api/route`

新規ルート検索も、歩いている途中の動的リルート（再検索）もすべてこのエンドポイント1本で行えます。

### リクエスト例 (`application/json`)

```json
{
  "prompt": "渋谷から原宿まで歩きたい。もう夜で暗くなるから治安が不安なのと、足が疲れてるから坂道は避けたい。途中で温かい飲み物か甘いものも欲しい",
  "origin": null,
  "destination": null,
  "current_location": {
    "lat": 35.6580,
    "lng": 139.7016
  },
  "context_override": {
    "weather": "rain",
    "time_of_day": "夜間 (20:00)"
  },
  "route_count": 2,
  "previous_route_summary": null
}
```

- **`prompt`** *(必須)*: ユーザーの自由な文章（数値換算不要。気分、疲れ、雨宿り、治安、食べたいもの等なんでもOK）
- **`origin` / `destination`** *(任意)*: 省略（`null`）時は `prompt` の文章からAIが自動抽出します。
- **`context_override`** *(任意)*: デモ・シミュレーション用の上書き辞書。`{"weather": "rain" | "heavy_rain" | "hot" | "cold" | "clear"}` や `{"season": "真冬", "time_of_day": "深夜"}` など、任意のキー・値を渡せます。省略時は現在地のリアルタイム天気を Google Weather API から自動取得します。
- **`route_count`** *(任意)*: 提案してほしいルート案の数（デフォルト `2`、最大 `3`）。

---

## 4. フロントエンド用 TypeScript 型定義

フロントエンド側でそのままコピペして使える型定義です。
`routes[i].metrics.path` に **デコード済みの座標配列（`{lat, lng}[]`）** が入っているため、フロント側でポリラインのデコード処理を書く必要はありません。

```typescript
export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteRequest {
  prompt: string;
  origin?: string | null;
  destination?: string | null;
  current_location?: LatLng | null;
  context_override?: Record<string, string> | null;
  route_count?: number;
  previous_route_summary?: string | null;
}

export interface ContextFactor {
  category: string; // 例: "season_weather" | "safety" | "fatigue_terrain" | "mood_preference"
  label: string;    // UIバッジ用の短い見出し（例: "11月の冷たい雨 (13.6℃)", "夜間・治安配慮"）
  detail: string;   // この要素をどう解釈し、どうルートへ反映したかの説明
}

export interface PlaceStop {
  name: string;
  lat: number;
  lng: number;
  reason: string;          // なぜこの場所を経由・目的地にしたかの理由
  tags: string[];          // 特徴タグ配列（例: ["地下直結", "明るい大通り", "甘味処", "エレベーターあり"]）
  place_id: string | null;
  address: string | null;
  rating: number | null;   // Googleマップの星評価 (例: 4.3)
  open_now: boolean | null;// 現在営業中か
}

export interface RouteMetrics {
  distance_meters: number;       // 総距離 (m)
  duration_seconds: number;      // 所要時間 (秒)
  encoded_polyline: string;      // エンコード済みポリライン文字列
  path: LatLng[];                // デコード済み座標配列（そのまま地図のPolylineに渡せます）
  elevation_gain_meters: number; // 累計登り標高差 (m)
  warnings: string[];            // 高低差などの注意事項リスト
}

export interface RouteCandidate {
  route_id: string; // "route_1", "route_2" ...
  title: string;    // ルート案タイトル（例: "案1: 地下道＆屋内カフェで足を休める快適ルート"）
  concept: string;  // このルート案のコンセプト
  travel_mode: "WALK" | "TRANSIT" | "BICYCLE" | "DRIVE";
  tags: string[];   // ルート特徴タグ（例: ["大通り優先", "坂道なし", "雨宿り可能", "夜間も明るい"]）
  safety_note: string | null;           // 治安・夜道・道幅・明るさに関するコメント
  fatigue_note: string | null;          // 足の疲れ・坂道・階段・休憩に関するコメント
  seasonal_weather_note: string | null; // 時期・気温・天候への適応コメント
  waypoints: PlaceStop[];               // [出発地, ...経由地, 目的地] の確定ピン配列
  metrics: RouteMetrics;                // 距離・時間・ポリライン・高低差
}

export interface RouteResponse {
  mode: "live" | "mock";
  environment: {
    timestamp_iso: string;
    season_and_time: string;
    weather_condition: string;
    temp_c: number;
    precipitation_mm: number;
    weather_source: string;
    custom_overrides: Record<string, string>;
  };
  summary: string;                  // AIエージェントからの全体提案メッセージ
  origin_query: string;
  destination_query: string;
  inferred_factors: ContextFactor[]; // AIが汲み取った考慮条件リスト
  routes: RouteCandidate[];          // 複数ルート案の配列
}
```
