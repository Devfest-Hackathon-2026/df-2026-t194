// WalkReal (Map × BeReal) サブアプリ用の型定義

export type WalkRealScope = "global" | "friends";

export type RealMojiType = "🔥" | "😍" | "☕" | "👟";

export interface WalkRealPhotoSnap {
  id: string;
  order: number; // 1〜5枚目
  timestamp: string; // "14:15" など
  spotName: string;
  caption: string;
  // ベクターマップ座標 (0..1000, 0..600)
  x: number;
  y: number;
  // Google Maps 実座標
  lat: number;
  lng: number;
  // メイン無加工写真URL（風景・街並み）
  mainImageUrl: string;
  // BeReal風インカメラ（ワイプ）写真URLまたは絵文字/アバター表現
  selfieImageUrl: string;
  selfieLabel: string;
  // 無加工メタデータ
  exifInfo: string; // 例: "24mm f/1.8 · 無加工RAW · GPS認証済"
  capturedAt?: string;
  gpsSource?: "exif" | "route" | "sample" | "manual";
  weatherTag?: string;
}

export interface WalkRealReaction {
  emoji: RealMojiType;
  count: number;
  userReacted?: boolean;
}

export interface WalkRealRoutePost {
  photoPoints?: { lat: number; lng: number; capturedAt: string }[];
  ownerUid?: string;
  createdAtMs?: number;
  expiresAtMs?: number;
  updatedAtMs?: number;
  synced?: boolean;
  id: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  authorBadge: string; // "地元ウォーカー" | "観光トラベラー" | "カフェ巡り部" など
  scope: WalkRealScope;
  circleName?: string; // 仲間内共有時のグループ名（例: "ゼミ散歩部", "渋谷ランチ仲間"）
  createdAtLabel: string; // "2時間前", "3日前" など
  daysElapsed: number; // 投稿からの経過日数（新陳代謝計算用）
  title: string;
  summary: string;
  areaLabel: string; // "渋谷〜表参道", "代官山〜中目黒" など
  tags: string[];
  color: string; // ルート描画カラー
  // 3〜5枚の無加工写真スナップ
  snaps: WalkRealPhotoSnap[];
  // 写真間を自動で結んだ歩行ルートパス（ベクター座標 & 実緯度経度）
  pathXY: [number, number][];
  pathGeo: { lat: number; lng: number }[];
  encodedPolyline?: string;
  // 自動算出メトリクス
  distanceKm: number;
  durationMin: number;
  elevationGainM: number;
  // ソーシャル指標 & 新陳代謝（Ephemeral）指標
  likesCount: number;
  likedByMe: boolean;
  walkedCount: number; // 実際にこのルートが歩かれた回数
  walkedThisWeek: number; // 今週歩かれた回数
  walkedByMe: boolean;
  reactions: WalkRealReaction[];
  // expiresAtMsから算出する掲載残日数。掲載期間は固定14日。
  ttlDaysRemaining: number;
  isExpiringSoon: boolean; // 残り3日以下で消滅危機
}

export interface WalkRealAiRecommendation {
  routeId: string;
  matchScore: number; // 98% など
  reason: string;
  highlightSnapOrder: number;
}
