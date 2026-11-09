from typing import Literal
from pydantic import BaseModel, Field, PrivateAttr, field_validator, model_validator


class LatLng(BaseModel):
    lat: float
    lng: float


class ContextFactor(BaseModel):
    category: str = Field(
        description="配慮カテゴリ（例: 'weather' | 'season_time' | 'fatigue_terrain' | 'safety' | 'mood_preference' など自由文字列）"
    )
    label: str = Field(description="UIバッジ用の短い見出し（例: '秋の冷たい雨 (13.6℃)', '夜道・治安配慮', '足の疲れ・坂道回避'）")
    detail: str = Field(description="この要素をどう解釈し、どうルートへ反映したかの具体説明")


class PlaceStop(BaseModel):
    # Only application code can mark coordinates as a user-confirmed pin.
    _coordinates_confirmed: bool = PrivateAttr(default=False)
    _provider_resolved: bool = PrivateAttr(default=False)
    name: str
    lat: float
    lng: float
    reason: str = Field(description="なぜこの場所を経由・目的地にしたかの理由")
    purpose: Literal["user_stop", "road_anchor", "experience", "unspecified"] = Field(default="unspecified", description="ユーザーが名指しした立寄先、指定道路への接続地点、希望体験の地点を区別")
    tags: list[str] = Field(default_factory=list, description="スポットの特徴タグ（例: ['地下直結', '明るい大通り', '甘味処', 'エレベーターあり']）")
    place_id: str | None = None
    address: str | None = None
    rating: float | None = None
    open_now: bool | None = None
    place_verified: bool = False
    place_types: list[str] = Field(default_factory=list)
    restroom: bool | None = None


class PlannedRouteOption(BaseModel):
    _requested_road_names: list[str] = PrivateAttr(default_factory=list)
    route_id: str = Field(description="ルート識別子（例: 'route_1', 'route_2'）")
    title: str = Field(description="ルート案のタイトル（例: '地下街＆カフェで濡れずに休める快適ルート', '人通りが多く明るい大通り安心ルート'）")
    concept: str = Field(description="このルート案のコンセプト・おすすめ理由")
    travel_mode: Literal["WALK"] = "WALK"
    tags: list[str] = Field(default_factory=list, description="このルート案の特性タグ（例: ['雨回避', 'フラット', '治安◎', 'カフェ経由']）")
    safety_note: str | None = Field(default=None, description="治安・夜道・人通り・道幅などの安心感に関するコメント")
    fatigue_note: str | None = Field(default=None, description="足の疲れ・坂道・階段・休憩ポイントに関するコメント")
    seasonal_weather_note: str | None = Field(default=None, description="時期・季節感・気温・天候への適応コメント")
    suggested_stops: list[PlaceStop] = Field(description="希望する景観・沿線エリアを実際に通るための順序付き経由地点。体験に必要な数を選ぶ")


class RouteNeeds(BaseModel):
    elevation: bool = False
    pollen: bool = False
    air_quality: bool = False
    shade: bool = False
    street_view: bool = False
    stops: bool = False
    priorities: list[str] = Field(default_factory=list)


class AgentAnalysis(BaseModel):
    loop_minutes: int | None = Field(default=None, ge=5, le=240)
    summary: str = Field(description="ユーザーの要望・時期・気温・治安・足の疲れ等を総合したAIエージェントからの全体提案メッセージ")
    origin_query: str = Field(description="出発地の検索名（例: 渋谷駅）")
    destination_query: str = Field(description="目的地の検索名（例: 原宿駅）")
    inferred_factors: list[ContextFactor] = Field(
        description="ユーザーの自然文や環境情報（時期・気温・天候・時間帯・治安・疲労度・気分など）から抽出された考慮ファクター一覧"
    )
    planned_routes: list[PlannedRouteOption] = Field(
        description="特徴の異なる複数（2〜3個）のルート提案リスト"
    )
    needs: RouteNeeds = Field(default_factory=RouteNeeds, description="ユーザーが明示的に希望した追加条件だけを判定する。通常の徒歩ルートに含まれる一般的な安全配慮や、モデルが提案しただけの内容は追加APIを要求しない。通常の出発地・目的地だけなら全項目false")


class RouteRequest(BaseModel):
    prompt: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        examples=[
            "渋谷から原宿まで歩きたい。もう夜で暗いから治安が悪い裏道や坂道は避けて、明るくて屋根があるところを通りたい。足も疲れたから途中で甘いもの食べたい。"
        ],
    )

    @field_validator("prompt")
    @classmethod
    def validate_prompt_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("行き先や希望を入力してください。")
        return value
    loop_minutes: int | None = Field(default=None, ge=5, le=240, description="出発地へ戻る周回散歩の目標分数")
    origin: str | None = Field(default=None, description="出発地（省略時はプロンプトから推論）")
    destination: str | None = Field(default=None, description="目的地（省略時はプロンプトから推論）")
    reroute_only: bool = Field(default=False, description="確定済みピンの位置・順序で再計算")
    origin_location: LatLng | None = None
    destination_location: LatLng | None = Field(default=None, description="ピン指し・施設選択時の目的地の緯度経度（指定時は最寄り公道へ自動スナップして案内）")
    waypoints: list[str] = Field(default_factory=list, description="UIで追加された経由地スポット名リスト")
    waypoints_explicit: bool = Field(default=False, description="UIで編集した経由地一覧を優先。空配列は全削除")
    waypoint_locations: list[LatLng | None] = Field(default_factory=list, description="経由地ピンの緯度経度座標リスト")
    current_location: LatLng | None = None
    context_override: dict[str, str] | None = Field(
        default=None,
        description="デモ・シミュレーション用の任意の環境上書き（例: {'weather': 'rain', 'season': '真冬', 'time_of_day': '深夜', 'crowd': '混雑'} など何でも投入可能）",
    )
    route_count: int = Field(default=3, ge=1, le=5, description="提案するルート案の数（デフォルト3案、周回散歩時などは最大4〜5案）")
    previous_user_prompt: str | None = Field(default=None, description="再検索前にユーザーが指定した希望。追加条件を加える際に既存希望も維持するために使う")
    previous_route_summary: str | None = Field(default=None, description="再検索時に前回の希望と選択ルートを引き継ぎ、追加条件だけを反映するための文脈")
    avoid_spots: list[str] = Field(default_factory=list, description="回避したいNGスポット・エリア・条件リスト（例: ['急な坂道', '歌舞伎町', '暗い夜道']）")
    language: str = Field(default="ja", description="応答言語コード（'ja' | 'en' | 'zh' など）")
    custom_system_prompt: str | None = Field(default=None, description="ユーザー定義の追加システムプロンプト（エージェントの人格やこだわり）")

    @model_validator(mode="after")
    def validate_pin_edit(self):
        if self.reroute_only:
            if self.origin_location is None or self.destination_location is None:
                raise ValueError("ピン移動後の出発地・目的地座標が必要です。")
            if len(self.waypoints) != len(self.waypoint_locations) or any(p is None for p in self.waypoint_locations):
                raise ValueError("経由地名と座標の数が一致していません。")
        return self


class ResolveLocationRequest(BaseModel):
    lat: float | None = None
    lng: float | None = None
    place_id: str | None = None
    language: str = "ja"


class ResolveLocationResponse(BaseModel):
    name: str
    address: str = ""
    category: str = "landmark"
    place_id: str | None = None
    lat: float | None = None
    lng: float | None = None


class PhotoWalkRouteRequest(BaseModel):
    points: list[LatLng] = Field(min_length=2, max_length=100)
    language: str = "ja"


class PhotoWalkRouteResponse(BaseModel):
    distance_meters: int
    duration_seconds: int
    encoded_polyline: str
    path: list[LatLng]


class RouteMetrics(BaseModel):
    distance_meters: int
    duration_seconds: int
    encoded_polyline: str
    path: list[LatLng] = Field(description="デコード済み座標配列（フロントでそのままPolyline描画可能）")
    navigation_instructions: list[str] = Field(default_factory=list, description="Routes APIが返した実経路の案内文。道路や施設の存在を推測で補完しない")
    elevation_gain_meters: float = 0.0
    elevation_loss_meters: float = Field(default=0.0, description="ルート全体の累積下り標高差 (m)")
    max_sampled_uphill_grade_percent: float = Field(default=0.0, description="Elevationサンプル区間で観測した最大上り勾配 (%)。短い坂を見落とす可能性あり")
    max_sampled_downhill_grade_percent: float = Field(default=0.0, description="Elevationサンプル区間で観測した最大下り勾配 (%)。短い坂を見落とす可能性あり")
    elevation_sample_spacing_meters: float | None = None
    steep_distance_meters: float | None = None
    slope_load: float | None = None
    extra_duration_seconds: int | None = None
    elevation_profile_meters: list[float] = Field(default_factory=list, description="経路に沿ったElevation API標高サンプル。階段形状は含まない")
    warnings: list[str] = Field(default_factory=list, description="高低差や距離などの客観的な注意事項")
    unverified_preferences: list[str] = Field(default_factory=list)
    route_score: float | None = None
    score_reasons: list[str] = Field(default_factory=list)
    self_overlap_percent: float | None = Field(default=None, description="経路が同じ道路付近を再通過する割合の推定。代表地点間の重複検出")
    experience_span_percent: float | None = Field(default=None, description="希望対象を示す経由地点の経路上の広がり。対象区間そのものの連続性は保証しない")
    feature_visibility_percent: float | None = Field(default=None, description="Street Viewの代表画像で希望対象が視認できた割合")
    decision_match_prob: float | None = Field(default=None, description="EmbeddingGemma 2による候補内の相対類似度ウェイト。統計的な確率ではありません (0.0〜1.0)")
    decision_latency_ms: float | None = Field(default=None, description="EmbeddingGemma 2のテキスト類似度計算時間 (ms)")
    visual_match_score: float | None = Field(default=None, description="Street View画像で確認できた希望条件への適合度（0〜100、治安の評価ではない）")
    visual_match_coverage_percent: float | None = Field(default=None, description="要求された画像評価軸のうち、実際の画像で観察できた割合")
    air_quality_index: int | None = Field(default=None, description="経路中央付近のAir Quality API指数")
    air_quality_category: str | None = None
    pollen_index: int | None = Field(default=None, description="経路中央付近のPollen API予報指数")
    pollen_category: str | None = None


class StreetViewObservation(BaseModel):
    sample_index: int = Field(ge=1, le=3)
    road_width: Literal["narrow", "normal", "wide", "unknown"] = "unknown"
    sidewalk: Literal["visible", "not_visible", "unknown"] = "unknown"
    street_lighting: Literal["visible", "not_visible", "unknown"] = "unknown"
    visibility: Literal["good", "average", "poor", "unknown"] = "unknown"
    surface_condition: Literal["smooth", "uneven", "damaged", "unknown"] = "unknown"
    path_obstruction: Literal["clear", "obstructed", "unknown"] = "unknown"
    requested_feature_visibility: Literal["visible", "not_visible", "unknown"] = "unknown"
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    overhead_cover: Literal["open", "partial", "covered", "unknown"] = "unknown"
    scene_type: Literal["outdoor_road", "outdoor_walkway", "indoor", "unknown"] = "unknown"
    note: str = ""


class StreetViewAssessment(BaseModel):
    observations: list[StreetViewObservation] = Field(default_factory=list)


class RouteCandidate(BaseModel):
    selection_role: Literal["balanced", "gentle", "shortest", "alternative"] | None = None
    route_id: str
    title: str
    concept: str
    travel_mode: Literal["WALK"] = "WALK"
    tags: list[str]
    safety_note: str | None = None
    fatigue_note: str | None = None
    seasonal_weather_note: str | None = None
    waypoints: list[PlaceStop] = Field(description="[出発地, ...経由地, 目的地] の確定スポット配列")
    metrics: RouteMetrics
    street_view_assessment: list[str] = Field(default_factory=list)
    street_view_images: list[str] = Field(default_factory=list)
    street_view_observations: list[StreetViewObservation] = Field(default_factory=list)
    solar_shade_percent: float | None = None


class EnvironmentContext(BaseModel):
    timestamp_iso: str
    season_and_time: str = Field(description="時期・季節・時間帯の文脈（例: '11月上旬（秋）・午前10時台'）")
    weather_condition: str
    temp_c: float
    precipitation_mm: float
    weather_source: str
    custom_overrides: dict[str, str] = Field(default_factory=dict)
    air_quality_index: int | None = None
    air_quality_category: str | None = None
    pollen_index: int | None = None
    pollen_category: str | None = None
    environmental_source: str | None = None


class RouteResponse(BaseModel):
    mode: Literal["live", "mock"]
    environment: EnvironmentContext
    summary: str
    origin_query: str
    destination_query: str
    inferred_factors: list[ContextFactor]
    routes: list[RouteCandidate]
    baseline: RouteMetrics | None = Field(
        default=None, description="Google マップ標準の徒歩ルート（出発地→目的地の直行）。エージェント提案との比較用"
    )


CURRENT_LOCATION_WORDS = {"現在地", "現在位置", "今いる場所", "ここ", "current location"}

WMO_WEATHER_MAP = {
    0: "快晴", 1: "晴れ", 2: "一部曇り", 3: "曇り",
    45: "霧", 48: "霧氷",
    51: "小雨", 53: "雨", 55: "強い霧雨",
    61: "小雨", 63: "雨", 65: "大雨",
    71: "小雪", 73: "雪", 75: "大雪",
    80: "にわか雨", 81: "強いにわか雨", 82: "激しいにわか雨",
    95: "雷雨",
}
