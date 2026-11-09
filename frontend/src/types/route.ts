// ルート処理エージェントの型定義 (動的地点・中継地点・Google Maps API連携対応)

export interface LatLng {
  lat: number;
  lng: number;
}

export interface ContextFactor {
  category: string;
  label: string;
  detail: string;
}

export interface PlaceStop {
  name: string;
  lat: number;
  lng: number;
  reason: string;
  tags: string[];
  place_id: string | null;
  address: string | null;
  rating: number | null;
  open_now: boolean | null;
  purpose?: "user_stop" | "road_anchor" | "experience" | "unspecified";
  place_verified?: boolean;
  place_types?: string[];
  restroom?: boolean | null;
}

export interface RouteMetrics {
  distance_meters: number;
  duration_seconds: number;
  encoded_polyline: string;
  path: LatLng[];
  navigation_instructions?: string[];
  elevation_gain_meters: number;
  elevation_loss_meters?: number;
  max_sampled_uphill_grade_percent?: number;
  max_sampled_downhill_grade_percent?: number;
  elevation_profile_meters?: number[];
  elevation_sample_spacing_meters?: number | null;
  steep_distance_meters?: number | null;
  slope_load?: number | null;
  extra_duration_seconds?: number | null;
  warnings: string[];
  unverified_preferences?: string[];
  route_score?: number | null;
  score_reasons?: string[];
  self_overlap_percent?: number | null;
  experience_span_percent?: number | null;
  feature_visibility_percent?: number | null;
  decision_match_prob?: number | null;
  decision_latency_ms?: number | null;
  visual_match_score?: number | null;
  visual_match_coverage_percent?: number | null;
  air_quality_index?: number | null;
  air_quality_category?: string | null;
  pollen_index?: number | null;
  pollen_category?: string | null;
}

export interface RouteCandidate {
  selection_role?: "balanced" | "gentle" | "shortest" | "alternative" | null;
  route_id: string;
  title: string;
  concept: string;
  travel_mode: "WALK";
  tags: string[];
  safety_note: string | null;
  fatigue_note: string | null;
  seasonal_weather_note: string | null;
  waypoints: PlaceStop[];
  metrics: RouteMetrics;
  street_view_assessment?: string[];
  street_view_images?: string[];
  street_view_observations?: Array<{
    sample_index: number;
    road_width: "narrow" | "normal" | "wide" | "unknown";
    sidewalk: "visible" | "not_visible" | "unknown";
    street_lighting: "visible" | "not_visible" | "unknown";
    visibility: "good" | "average" | "poor" | "unknown";
    requested_feature_visibility: "visible" | "not_visible" | "unknown";
    scene_type?: "outdoor_road" | "outdoor_walkway" | "indoor" | "unknown";
    overhead_cover?: "open" | "partial" | "covered" | "unknown";
    confidence: number;
    note: string;
  }>;
  solar_shade_percent?: number | null;
}

export interface RouteApiResponse {
  mode: "live" | "mock";
  environment: {
    timestamp_iso: string;
    season_and_time: string;
    weather_condition: string;
    temp_c: number;
    precipitation_mm: number;
    weather_source: string;
    custom_overrides: Record<string, string>;
    air_quality_index?: number | null;
    air_quality_category?: string | null;
    pollen_index?: number | null;
    pollen_category?: string | null;
    environmental_source?: string | null;
  };
  summary: string;
  origin_query: string;
  destination_query: string;
  inferred_factors: ContextFactor[];
  routes: RouteCandidate[];
  baseline: RouteMetrics | null;
}

export type RouteModeId = "hybrid" | "flat" | "rain" | "fast";

export type SegmentColor = "#4285F4" | "#FBBC05" | "#34A853" | "#EA4335";

export type TurnDirectionType =
  | "left"
  | "right"
  | "slight_left"
  | "slight_right"
  | "straight"
  | "arrive";

export interface RouteSegment {
  from: [number, number]; // ベクター座標 [x, y]
  to: [number, number];
  fromGeo: { lat: number; lng: number };
  toGeo: { lat: number; lng: number };
  color: SegmentColor;
  label: string;
  distanceM?: number;
}

export interface RouteCallout {
  x: number;
  y: number;
  text: string;
  dotColor: SegmentColor;
}

export interface WaypointPin {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface WeatherForecast {
  timeLabel: string;
  weatherType: "sunny" | "cloudy" | "rainy" | "storm";
  weatherText: string;
  tempC: number;
  rainProb: number;
  rainMm: number;
}

export interface CongestionStatus {
  level: "low" | "medium" | "heavy";
  levelText: string;
  scorePercent: number;
  color: string;
  description: string;
}

export interface SavedRouteItem {
  id: string;
  title: string;
  createdAt: string;
  origin: string;
  waypoints: string[];
  destination: string;
  mode: RouteModeId;
  durationText: string;
  distanceText: string;
  totalKm: number;
  savedBenefit?: string;
}

export interface TripLogItem {
  id: string;
  completedAt: string;
  origin: string;
  destination: string;
  waypoints: string[];
  durationMinutes: number;
  totalKm: number;
  slopeSavedText: string;
  modeLabel: string;
  memo?: string;
  mode?: RouteModeId;
}

export interface ComputedRoute {
  id: RouteModeId;
  modeLabel: string;
  durationText: string;
  totalMinutes?: number;
  distanceText: string;
  totalKm?: number;
  summaryBadge: string;
  badgeColor: SegmentColor;
  slopeSaveLabel: string;
  oldElevText: string;
  newElevText: string;
  callout: RouteCallout;
  altPath: [number, number][];
  segments: RouteSegment[];
  waypointPins?: WaypointPin[];
  mapLabels?: StreetLabel[];
  elevProfile?: number[];
  baseElevProfile?: number[];
  weatherForecast?: WeatherForecast;
  congestionStatus?: CongestionStatus;
  apiData?: RouteCandidate;
  baseline?: RouteMetrics | null;
}

export interface CityBlockRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

export interface RoadLine {
  id: string;
  pts: [number, number][];
  width: number;
}

export interface StreetLabel {
  id: string;
  x: number;
  y: number;
  text: string;
  rotation: number;
  isPark?: boolean;
}
