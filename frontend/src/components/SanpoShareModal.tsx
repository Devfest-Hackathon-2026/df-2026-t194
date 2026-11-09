import { UiText, useUiText } from "@/i18n/ui";
import { SanpoPostActions } from "@/components/SanpoPostActions";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  WalkRealPhotoSnap,
  WalkRealRoutePost,
} from "@/types/walkreal";
import { ThemeMode } from "@/types/theme";
import { ComputedRoute } from "@/types/route";
import {
  createDraftFromComputedRoute,
  InitialDraftRoute,
  geoToXY,
  xyToGeo,
} from "@/data/walkrealData";
import { RuneIcon } from "@/components/ui/RuneIcon";
import { inspectPhotoMetadata } from "@/services/exifGps";
import { SanpoRoutePreview } from "@/components/SanpoRoutePreview";
import { encodeWalkPath } from "@/services/sanpoGeometry";
import { buildPhotoWalkingRoute, PhotoWalkingRoute } from "@/services/sanpoRoute";
import { compressImageForSanpo, getSanpoIdentitySync } from "@/services/sanpoFirebase";

interface SanpoShareModalProps {
  isDark: boolean;
  themeMode?: ThemeMode;
  posts: WalkRealRoutePost[];
  selectedPostId: string | null;
  initialTab?: "feed" | "create";
  initialDraftRoute?: InitialDraftRoute | null;
  activeRoute?: ComputedRoute | null;
  origin?: string;
  destination?: string;
  onClose: () => void;
  onSelectPost: (postId: string) => void;
  onToggleLike: (postId: string) => void;
  onWalkThisRoute: (post: WalkRealRoutePost) => void;
  onPublishRoute: (newPost: WalkRealRoutePost) => Promise<void>;
  onAddWaypointFromSnap?: (spotName: string, geo: { lat: number; lng: number }) => void;
  onWalkToSpot?: (spotName: string, geo: { lat: number; lng: number }) => void;
}

type TabType = "feed" | "create";
type SortType = "popular" | "walked" | "distance";

export const SanpoShareModal: React.FC<SanpoShareModalProps> = ({
  isDark,
  themeMode = "modern",
  posts,
  selectedPostId,
  initialTab,
  initialDraftRoute,
  activeRoute,
  origin,
  destination,
  onClose,
  onSelectPost,
  onToggleLike,
  onWalkThisRoute,
  onPublishRoute,
  onAddWaypointFromSnap,
  onWalkToSpot,
}) => {
  const ui = useUiText();
  const [activeTab, setActiveTab] = useState<TabType>(() =>
    initialTab || (initialDraftRoute ? "create" : "feed")
  );
  const [sortBy, setSortBy] = useState<SortType>("popular");
  const [activeSnapIndices, setActiveSnapIndices] = useState<Record<string, number>>({});
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);

  const isTraditional = themeMode === "traditional";

  // 新規作成ステート（ニックネーム・エリア・コース名は初期値空で必須）
  const [draftSnaps, setDraftSnaps] = useState<WalkRealPhotoSnap[]>(() =>
    initialDraftRoute?.snaps || []
  );
  const [featuredIds, setFeaturedIds] = useState<string[]>(() => (initialDraftRoute?.snaps ?? []).slice(0, 5).map(s => s.id));
  const featuredSnaps = draftSnaps.filter(s => featuredIds.includes(s.id));
  const [newTitle, setNewTitle] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [newSummary, setNewSummary] = useState("");
  const [newArea, setNewArea] = useState("");
  const [shareSuccessUrl, setShareSuccessUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [processingPhotos, setProcessingPhotos] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [trustedDraft, setTrustedDraft] = useState(initialDraftRoute);
  const [publishedPost, setPublishedPost] = useState<WalkRealRoutePost | null>(null);

  const routePoints = useMemo(() => draftSnaps.map(({ lat, lng }) => ({ lat, lng })), [draftSnaps]);
  const routeKey = JSON.stringify(routePoints);
  const [previewResult, setPreviewResult] = useState<{ key: string; route: PhotoWalkingRoute } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [buildingPreview, setBuildingPreview] = useState(false);
  const [retryPreview, setRetryPreview] = useState(0);
  const previewRoute = previewResult?.key === routeKey ? previewResult.route : null;
  useEffect(() => {
    if (activeTab !== "create") return;
    let cancelled = false;
    setPreviewError(null);
    setPreviewResult(null);
    if (routePoints.length < 2) { setBuildingPreview(false); return; }
    if (trustedDraft?.pathGeo && trustedDraft.pathGeo.length >= 2) {
      setPreviewResult({ key: routeKey, route: {
        path: trustedDraft.pathGeo, encoded_polyline: encodeWalkPath(trustedDraft.pathGeo),
        distance_meters: trustedDraft.distanceKm * 1000, duration_seconds: trustedDraft.durationMin * 60,
      } });
      setBuildingPreview(false);
      return;
    }
    setBuildingPreview(true);
    const timer = setTimeout(() => {
      buildPhotoWalkingRoute(routePoints).then(route => {
        if (!cancelled) setPreviewResult({ key: routeKey, route });
      }).catch(error => {
        if (!cancelled) setPreviewError(error instanceof Error ? error.message : "徒歩経路を作成できませんでした。");
      }).finally(() => { if (!cancelled) setBuildingPreview(false); });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [routeKey, trustedDraft, retryPreview, activeTab]);
  const movePhotoPoint = useCallback((index: number, point: { lat: number; lng: number }) => {
    if (publishing || processingPhotos) return;
    setTrustedDraft(null);
    setDraftSnaps(previous => previous.map((snap, i) => i === index ? {
      ...snap, ...point, x: geoToXY(point)[0], y: geoToXY(point)[1], gpsSource: "manual",
      exifInfo: `手動補正 (${point.lat.toFixed(5)}, ${point.lng.toFixed(5)})`,
    } : snap));
  }, [publishing, processingPhotos]);

  // マップ上のアクティブルートからドラフト作成（タイトル・エリア・ニックネームは手入力必須のため空のまま）
  const handleImportCurrentMapRoute = () => {
    if (!activeRoute) return;
    const draft = createDraftFromComputedRoute(activeRoute, origin || "", destination || "");
    setTrustedDraft(draft);
    setDraftSnaps(draft.snaps);
    setFeaturedIds(draft.snaps.slice(0, 5).map(s => s.id));
    setActiveTab("create");
    setShareSuccessUrl(null);
  };

  // initialDraftRoute が後から渡された場合も反映
  useEffect(() => {
    if (initialDraftRoute) {
      setActiveTab("create");
      setTrustedDraft(initialDraftRoute);
      setDraftSnaps(initialDraftRoute.snaps);
      setFeaturedIds(initialDraftRoute.snaps.slice(0, 5).map(s => s.id));
    }
  }, [initialDraftRoute]);

  const panelBg = isTraditional
    ? isDark
      ? "border-amber-700/60 bg-[#1e1b18] text-amber-50 shadow-[0_24px_70px_rgba(0,0,0,0.9)] washi-pattern font-serif"
      : "border-amber-800/40 bg-[#faf6ed] text-stone-900 shadow-[0_20px_60px_rgba(90,50,20,0.2)] washi-pattern font-serif"
    : isDark
      ? "border-zinc-800 bg-zinc-950 text-zinc-50 shadow-[0_24px_70px_-15px_rgba(0,0,0,0.9)]"
      : "border-zinc-200 bg-white text-zinc-900 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.18)]";
  const subText = isDark ? "text-zinc-400" : "text-zinc-500";
  const cardBg = isTraditional
    ? isDark
      ? "bg-stone-900/60 border-amber-800/40 backdrop-blur-md font-serif"
      : "bg-amber-50/70 border-amber-800/20 backdrop-blur-md font-serif"
    : isDark ? "bg-zinc-900/50 border-zinc-800/60 backdrop-blur-md" : "bg-zinc-50/60 border-zinc-200/60 backdrop-blur-md";
  const inputBg = isDark
    ? "bg-zinc-900/60 border-zinc-800/80 text-zinc-100 placeholder:text-zinc-500 focus:border-[#4285F4]"
    : "bg-zinc-100/60 border-zinc-200/80 text-zinc-900 placeholder:text-zinc-400 focus:border-[#4285F4]";

  const currentUid = useMemo(() => getSanpoIdentitySync() || undefined, []);

  // ソート（不要な再計算・再レンダリングを抑止）
  const sortedPosts = useMemo(() => {
    return [...posts].sort((a, b) => {
      if (sortBy === "popular") return (b.likesCount || 0) - (a.likesCount || 0);
      if (sortBy === "walked") return (b.walkedCount || 0) - (a.walkedCount || 0);
      return a.distanceKm - b.distanceKm;
    });
  }, [posts, sortBy]);

  // 共有URLコピー
  const handleCopyShareLink = (post: WalkRealRoutePost) => {
    const url = `${window.location.origin}${window.location.pathname}?walk=${post.id}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopiedPostId(post.id);
      setTimeout(() => setCopiedPostId(null), 2500);
    });
  };


  // 圧縮前の原本からGPSと撮影時刻を抽出。位置のない写真に座標を補わない。
  const handlePhotoFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const files = Array.from(input.files || []);
    if (files.length + draftSnaps.length > 100) {
      setPhotoNotice("ルート推定用の写真は合計100枚まで選べます。写真を分けて選択してください。");
      input.value = ""; return;
    }
    if (!files.length) return;
    setProcessingPhotos(true);
    setPhotoNotice(null);
    try {
      const failures: string[] = [];
      let gpsFound = 0;
      const results: (WalkRealPhotoSnap | null)[] = [];
      // Process one original at a time to avoid decoding many large images at once.
      for (const [index, file] of files.entries()) {
        const loadPhoto = async (): Promise<WalkRealPhotoSnap | null> => {
        const metadata = await inspectPhotoMetadata(file);
        if (metadata.status !== "ok") {
          failures.push(`${file.name}（${file.size.toLocaleString()} bytes）: ${metadata.message}`);
          return null;
        }
        gpsFound += 1;
        const gps = metadata.gps;
        let image = "";
        try { image = await compressImageForSanpo(file); } catch { /* GPS still contributes to routing. */ }
        if (!image || image.length > 120000) {
          image = "";
          failures.push(`${file.name}: GPSを経路推定に使いますが、表示用画像に変換できないため掲載写真には選べません。`);
        }
        const capturedAt = gps.capturedAt || new Date(file.lastModified).toISOString();
        const xy = geoToXY(gps);
        return {
          id: `snap_exif_${Date.now()}_${index}`, order: index + 1,
          timestamp: capturedAt.slice(11, 16), capturedAt, gpsSource: "exif",
          spotName: "",
          caption: "", x: xy[0], y: xy[1], lat: gps.lat, lng: gps.lng,
          mainImageUrl: image, selfieImageUrl: "", selfieLabel: "",
          exifInfo: `EXIF GPS (${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)})`,
        };
        };
        try { results.push(await loadPhoto()); }
        catch { failures.push(`${file.name}: 写真の読み込みに失敗しました。`); results.push(null); }
        setPhotoNotice(`写真を処理中: ${index + 1}/${files.length}枚（GPS取得 ${gpsFound}枚）`);
      }
      const located = results.filter((item): item is WalkRealPhotoSnap => item !== null);
      located.sort((a, b) => (a.capturedAt || "").localeCompare(b.capturedAt || ""));
      if (located.length) {
        setTrustedDraft(null);
        setDraftSnaps(previous => [...previous, ...located]
          .sort((a, b) => (a.capturedAt || "").localeCompare(b.capturedAt || ""))
          .map((snap, index) => ({
            ...snap,
            order: index + 1,
            spotName: !snap.spotName || /^チェックポイント\s*\d+$/.test(snap.spotName)
              ? `チェックポイント${index + 1}`
              : snap.spotName,
          })));
      }
      if (located.length) {
        setFeaturedIds(current => [...current.filter(id => draftSnaps.some(s => s.id === id)), ...located.filter(s => s.mainImageUrl).map(s => s.id)].slice(0, 5));
      }
      setPhotoNotice([
        `選択${files.length}枚 / GPS取得${gpsFound}枚 / 追加${located.length}枚。`,
        ...failures,
        located.length ? "撮影時刻順に並べました。撮影時刻がない写真はファイル日時順です。" : "写真の位置が削除されている場合は、位置情報を含めて書き出す必要があります。",
      ].join("\n"));
    } finally {
      setProcessingPhotos(false);
      input.value = "";
    }
  };

  // ルート公開・共有
  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (draftSnaps.length < 2) return;
    if (featuredSnaps.length < 2 || featuredSnaps.length > 5) {
      setShareError("掲載する代表写真を2〜5枚選んでください。ルート推定には全写真の位置を使います。"); return;
    }
    if (!newTitle.trim() || !newAuthor.trim() || !newArea.trim()) {
      setShareError("コース名、ニックネーム、エリアをすべて入力してください。");
      return;
    }

    if (publishing || processingPhotos) return;
    setPublishing(true);
    setShareError(null);
    try {
      if (!previewRoute || buildingPreview) throw new Error("徒歩経路の生成完了を待ち、地図で確認してください。");
      const photoRoute = previewRoute;
      const fullPathGeo = photoRoute.path;
      // Keep shared Firestore documents comfortably below Firestore's 1 MiB document limit.
      const maxSharedPathPoints = 300;
      const pathGeo = fullPathGeo.length > maxSharedPathPoints
        ? Array.from({ length: maxSharedPathPoints }, (_, index) =>
            fullPathGeo[Math.round(index * (fullPathGeo.length - 1) / (maxSharedPathPoints - 1))]
          )
        : fullPathGeo;
      const newId = `walk_${Date.now()}`;
      const authorName = newAuthor.trim();
      const title = newTitle.trim();
      const areaLabel = newArea.trim();

      const newPost: WalkRealRoutePost = {
        id: newId,
        authorName: authorName,
        authorHandle: `@${authorName.toLowerCase().replace(/\s+/g, "_")}`,
        authorAvatar: isTraditional ? "👘" : "🚶",
        authorBadge: initialDraftRoute ? (isTraditional ? "道中記記録士" : "AI公認ウォーカー") : (isTraditional ? "新参旅人" : "新着ウォーカー"),
        scope: "global",
        createdAtLabel: "たった今",
        daysElapsed: 0,
        title: title,
        summary: newSummary.trim() || (isTraditional ? "道中の名所を巡る風流な散歩絵巻です。" : "写真の位置情報から自動作成された散歩ルートです。"),
        areaLabel: areaLabel,
        tags: isTraditional ? ["街道歩き", "散歩絵巻", "道中記"] : ["散歩", "無加工写真", "路地裏", "AI探索"],
        color: isTraditional ? "#C73E3A" : "#4285F4",
        snaps: featuredSnaps.map((snap, index) => ({ ...snap, order: index + 1 })),
        photoPoints: draftSnaps.map(({ lat, lng, capturedAt }) => ({ lat, lng, capturedAt: capturedAt ?? "" })),
        pathXY: pathGeo.map(point => geoToXY(point)),
        pathGeo,
        encodedPolyline: photoRoute.encoded_polyline,
        distanceKm: photoRoute.distance_meters / 1000,
        durationMin: Math.round(photoRoute.duration_seconds / 60),
        elevationGainM: 0,
        likesCount: 0,
        likedByMe: false,
        walkedCount: 0,
        walkedThisWeek: 0,
        walkedByMe: false,
        reactions: [
          { emoji: "🔥", count: 1, userReacted: true },
          { emoji: "☕", count: 1, userReacted: false },
        ],
        ttlDaysRemaining: 14,
        isExpiringSoon: false,
      };

      await onPublishRoute(newPost);
      setPublishedPost(newPost);
      const shareUrl = `${window.location.origin}${window.location.pathname}?walk=${newId}`;
      setShareSuccessUrl(shareUrl);
      navigator.clipboard?.writeText(shareUrl).catch(() => {});
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "共有に失敗しました。接続を確認して再試行してください。");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3.5 backdrop-blur-md transition-all"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={`flex flex-col h-[auto] max-h-[820px] w-full max-w-2xl rounded-[32px] border overflow-hidden backdrop-blur-2xl transition-all ${panelBg}`}
      >
        {/* モーダルヘッダー */}
        <div className="flex items-center justify-between border-b border-inherit px-5 py-3.5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div>
              <h2 className="text-sm font-black tracking-tight">
                {isTraditional ? <UiText text={"散歩絵巻"} /> : <UiText text={"散歩シェア"} />}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition active:scale-95 ${
              isDark ? "bg-zinc-900 hover:bg-zinc-800" : "bg-zinc-100 hover:bg-zinc-200"
            }`}
            aria-label={ui(ui("閉じる"))}
          >
            <RuneIcon name="indicators-x" size={15} />
          </button>
        </div>

        {/* セグメントコントロールタブ */}
        <div className="px-5 py-3 shrink-0 tranparent absolute top-16 left-0 right-0 z-10">
          <div className="flex p-1 rounded-full bg-zinc-100 dark:bg-zinc-900/80 border border-zinc-200/60 dark:border-zinc-800/60 gap-1">
            <button
              type="button"
              onClick={() => setActiveTab("feed")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-xs font-bold transition ${
                activeTab === "feed"
                  ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              <span><UiText text={"みんなの散歩"} /></span>
              <span className="rounded-full bg-zinc-200/80 dark:bg-zinc-700 px-1.5 py-0.2 text-[10px] font-bold">
                {posts.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("create");
                setShareSuccessUrl(null);
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-full text-xs font-bold transition ${
                activeTab === "create"
                  ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              <span><UiText text={"＋ 写真から作成"} /></span>
            </button>
          </div>
        </div>

        {/* コンテンツエリア */}
        <div className="flex-1 overflow-y-auto px-5 py-4 no-scrollbar pt-[72px]">
          {activeTab === "feed" ? (
            sortedPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-3xl mb-4 shadow-sm">
                  {isTraditional ? "👘" : "👟"}
                </div>
                <h3 className="text-sm font-black mb-1.5">
                  {isTraditional ? <UiText text={"まだ散歩絵巻の記録がありません"} /> : <UiText text={"まだ散歩ルートがありません"} />}
                </h3>
                <p className={`text-xs ${subText} max-w-sm mb-6 leading-relaxed`}>
                  {isTraditional
                    ? <UiText text={"あなたが歩いた風情ある名所や街道の写真を投稿して、最初の散歩絵巻を記してみましょう。"} />
                    : <UiText text={"あなたの散歩コースを最初のルートとして登録してみましょう！無加工の写真や立ち寄りスポットを添えて、みんなと共有できます。"} />}
                </p>

                <div className="flex flex-col sm:flex-row gap-2.5 w-full max-w-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("create");
                      setShareSuccessUrl(null);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 rounded-full bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 py-2.5 px-4 text-xs font-black shadow-md hover:opacity-90 transition active:scale-95"
                  >
                    <RuneIcon name="tools-sparkles" size={13} className="text-[#FBBC05]" />
                    <span><UiText text={"最初のルートを作成"} /></span>
                  </button>

                  {activeRoute && destination && (
                    <button
                      type="button"
                      onClick={handleImportCurrentMapRoute}
                          disabled={processingPhotos || publishing}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-full border border-[#4285F4]/40 bg-[#4285F4]/10 py-2.5 px-3 text-xs font-bold text-[#4285F4] hover:bg-[#4285F4]/20 transition active:scale-95 shadow-sm"
                    >
                      <RuneIcon name="tools-map" size={13} />
                      <span><UiText text={"現在のマップを取り込む"} /></span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
            <div className="flex flex-col gap-3.5">
              {/* ソートセレクタ */}
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-bold ${subText}`}><UiText text={"表示順:"} /></span>
                <div className="flex gap-1">
                  {(
                    [
                      ["popular", <UiText text={"人気順 (いいね)"} />],
                      ["walked", <UiText text={"歩かれた数順"} />],
                      ["distance", <UiText text={"距離の近い順"} />],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSortBy(key)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${sortBy === key
                          ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 shadow-sm"
                          : isDark
                            ? "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
                            : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                        }`}
                    >
                      {<UiText text={label} />}
                    </button>
                  ))}
                </div>
              </div>

              {/* 投稿カード一覧 */}
              {sortedPosts.map((post) => {
                const isSelected = post.id === selectedPostId;
                const activeSnapIdx = activeSnapIndices[post.id] || 0;
                const currentSnap = post.snaps[activeSnapIdx] || post.snaps[0];

                return (
                  <div
                    key={post.id}
                    className={`flex flex-col rounded-[32px] border p-4 transition-all ${isSelected
                        ? "border-zinc-900 dark:border-zinc-100 ring-1 ring-zinc-900/10 dark:ring-white/10 bg-white dark:bg-zinc-900 shadow-md"
                        : cardBg
                      }`}
                  >
                    {/* カード上部: 投稿者情報 & エリア & 残り日数 */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{post.authorAvatar || "🚶"}</span>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-black">{post.authorName}</span>
                            <span className={`text-[10px] ${subText}`}>{post.createdAtLabel}</span>
                          </div>
                          <span className="text-[11px] font-bold text-[#4285F4]">
                            {post.areaLabel}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            post.ttlDaysRemaining <= 4
                              ? "bg-rose-500/10 text-rose-500 dark:text-rose-400"
                              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                          }`}
                        >
                          <UiText text={"残り"} />{post.ttlDaysRemaining}<UiText text={"日"} /></span>
                      </div>
                    </div>

                    {/* タイトル & 紹介メモ */}
                    <h3 className="text-md font-bold tracking-tight mb-1">{<UiText text={post.title} />}</h3>
                    <p className={`text-xs ${subText} mb-2.5 leading-relaxed`}>{<UiText text={post.summary} />}</p>

                    {/* 写真プレビュー */}
                    {currentSnap && (
                      <div className="relative mb-3 overflow-hidden rounded-3xl border border-black/5 dark:border-white/10 bg-black aspect-[16/9] max-h-52 select-none">
                        <img
                          src={currentSnap.mainImageUrl}
                          alt={currentSnap.spotName}
                          className="h-full w-full object-cover select-none"
                        />
                        {/* 撮影時刻（画像中央に少し大きめで表示） */}
                        {currentSnap.timestamp && (
                          <div className="pointer-events-none absolute flex flex-col left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center text-3xl font-black text-white shadow-lg">
                            <span>{currentSnap.timestamp}</span>
                            <div className="text-xl font-bold">
                              <span>{currentSnap.spotName}</span>
                            </div>
                          </div>
                        )}

                        {/* 写真枚数インジケーター（複数枚ある場合） */}
                        {post.snaps.length > 1 && (
                          <div className="absolute right-2.5 top-2.5 flex items-center gap-1 bg-black/60 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white backdrop-blur-md">
                            <span>{activeSnapIdx + 1} / {post.snaps.length}</span>
                          </div>
                        )}

                        {/* 左右画像切替ボタン（2枚以上ある場合に左右端に配置） */}
                        {post.snaps.length > 1 && (
                          <>
                            {/* 前の写真へボタン（左端中央） */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveSnapIndices((prev) => ({
                                  ...prev,
                                  [post.id]: (activeSnapIdx - 1 + post.snaps.length) % post.snaps.length,
                                }));
                              }}
                              title={ui(ui("前の写真へ"))}
                              aria-label={ui(ui("前の写真"))}
                              className="absolute left-2.5 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm hover:bg-black/80 hover:scale-105 active:scale-95 transition z-10"
                            >
                              <RuneIcon name="arrows-arrow-left" size={18} />
                            </button>

                            {/* 次の写真へボタン（右端中央） */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveSnapIndices((prev) => ({
                                  ...prev,
                                  [post.id]: (activeSnapIdx + 1) % post.snaps.length,
                                }));
                              }}
                              title={ui(ui("次の写真へ"))}
                              aria-label={ui(ui("次の写真"))}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm hover:bg-black/80 hover:scale-105 active:scale-95 transition z-10"
                            >
                              <RuneIcon name="arrows-arrow-right" size={18} />
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* ルートのメトリクス（距離・時間・完歩数） */}
                    <div className="flex items-center gap-2 py-1 mb-2 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                      <span>{post.distanceKm.toFixed(1)} km</span>
                      <span>·</span>
                      <span><UiText text={"約"} />{post.durationMin}<UiText text={"分"} /></span>
                      <span>·</span>
                      <span>{post.walkedCount}<UiText text={"人が歩いた"} /></span>
                    </div>

                    {/* アクションボタンバー */}
                    <div className="flex items-center gap-2">
                      {/* 「このコースを歩く」プライマリボタン */}
                      <button
                        type="button"
                        onClick={() => {
                          onWalkThisRoute(post);
                          onClose();
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-full bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 py-2 px-3 text-xs font-bold shadow-xs transition active:scale-95"
                      >
                        <RuneIcon name="tools-map" size={13} />
                        <span><UiText text={"このコースを歩く"} /></span>
                      </button>

                      {/* いいねボタン */}
                      <button
                        type="button"
                        onClick={() => onToggleLike(post.id)}
                        className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold border transition active:scale-95 ${post.likedByMe
                            ? "border-[#EA4335]/40 bg-[#EA4335]/10 text-[#EA4335]"
                            : isDark
                              ? "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                          }`}
                      >
                        <RuneIcon
                          name="tools-heart"
                          size={13}
                          className={post.likedByMe ? "text-[#EA4335]" : ""}
                        />
                        <span>{post.likesCount}</span>
                      </button>

                      {/* 共有URLコピーボタン */}
                      <button
                        type="button"
                        onClick={() => handleCopyShareLink(post)}
                        title={ui(ui("友達に送る共有リンクをコピー"))}
                        className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold border transition active:scale-95 ${copiedPostId === post.id
                            ? "border-[#34A853]/40 bg-[#34A853]/10 text-[#34A853]"
                            : isDark
                              ? "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                          }`}
                      >
                        <RuneIcon
                          name={copiedPostId === post.id ? "indicators-check" : "tools-share-2"}
                          size={13}
                        />
                        <span>{copiedPostId === post.id ? <UiText text={"コピー済"} /> : <UiText text={"シェア"} />}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            )
          ) : (
            /* 「＋ 写真から作成」フォーム */
            <form onSubmit={handlePublish} className="flex flex-col gap-3.5">
              {shareSuccessUrl ? (
                <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#34A853]/15 text-[#34A853]">
                    <RuneIcon name="indicators-check" size={24} />
                  </div>
                  <h3 className="text-sm font-black"><UiText text={"ルートが共有されました！"} /></h3>
                  <p className={`text-xs ${subText} max-w-sm`}>
                    <UiText text={"共有リンクがクリップボードにコピーされました。LINEやXで友達に送ると、相手の地図上にこの散歩コースが即座に表示されます。"} /></p>
                  <div className="w-full max-w-md p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono break-all text-zinc-300 select-all">
                    {shareSuccessUrl}
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center mt-2">
                    {publishedPost && (
                      <button
                        type="button"
                        onClick={() => {
                          onWalkThisRoute(publishedPost);
                          onClose();
                        }}
                        className="rounded-full bg-[#4285F4] hover:bg-[#3367d6] text-white px-4 py-1.5 text-xs font-black shadow-md transition active:scale-95 flex items-center gap-1.5"
                      >
                        <RuneIcon name="tools-map" size={13} />
                        <span><UiText text={"このコースを歩く (マップに適用)"} /></span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setActiveTab("feed")}
                      className="rounded-full bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 px-4 py-1.5 text-xs font-bold shadow hover:opacity-90 transition"
                    >
                      <UiText text={"みんなの散歩一覧で確認"} /></button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-full border border-inherit px-3.5 py-1.5 text-xs font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                    >
                      <UiText text={"閉じる"} /></button>
                  </div>
                </div>
              ) : (
                <>
                  {/* AIルート連携バッジ */}
                  {initialDraftRoute && (
                    <div className={`rounded-2xl border p-3 flex items-start gap-3 ${
                      isTraditional
                        ? "border-amber-700/40 bg-amber-500/10 text-amber-950 dark:text-amber-100 font-serif"
                        : "border-[#4285F4]/30 bg-[#4285F4]/10 text-zinc-900 dark:text-zinc-100"
                    }`}>
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white font-bold text-sm shadow ${
                        isTraditional ? "bg-[#C73E3A]" : "bg-[#4285F4]"
                      }`}>
                        {isTraditional ? "📜" : "✨"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-black">
                          {isTraditional
                            ? `踏破した街道（${initialDraftRoute.distanceKm}km / 約${initialDraftRoute.durationMin}分）を道中記に複写`
                            : `AIルート情報（${initialDraftRoute.distanceKm}km / 約${initialDraftRoute.durationMin}分）を引き継ぎました`}
                        </div>
                        <div className={`text-[11px] ${subText} mt-0.5 leading-relaxed`}>
                          {isTraditional
                            ? `歩行距離（${initialDraftRoute.distanceKm}km）を引き継ぎました。道中で撮影した原本写真（GPS付き・2〜5枚）を選択して絵巻を完成させましょう。`
                            : `歩行距離（${initialDraftRoute.distanceKm}km）を引き継ぎました。道中で撮影した原本写真（GPS付き・2〜5枚）を選択して散歩記録を作成しましょう。`}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 説明 & アクション */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 py-3">
                    <div>
                      <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        <UiText text={"写真や立ち寄りスポット（2〜5箇所）"} /></div>
                      <div className={`text-[12px] ${subText}`}>
                        <UiText text={"写真から自動でコースが繋がり、名称やメモも自由に編集できます"} /></div>
                    </div>
                    {activeRoute && destination && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={handleImportCurrentMapRoute}
                          disabled={processingPhotos || publishing}
                          className="flex items-center gap-1 rounded-full border border-[#4285F4]/40 bg-[#4285F4]/10 text-[#4285F4] px-3 py-1 text-xs font-bold transition hover:bg-[#4285F4]/20 shadow-sm"
                        >
                          <RuneIcon name="tools-map" size={12} />
                          <span><UiText text={"マップを取り込む"} /></span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 写真アップロードボタン（ファイルピッカーで原本からGPSを保持） */}
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="sanpo-original-files" className="text-xs font-bold"><UiText text={"ファイルから写真原本を選択（GPS付き・2〜100枚）:"} /></label>
                    {/* Keep accept/capture unset: image/* can select a photo-provider copy without EXIF GPS. */}
                    <input
                      id="sanpo-original-files"
                      type="file"
                      multiple
                      aria-describedby="sanpo-original-files-help"
                      onChange={handlePhotoFileSelect}
                      disabled={processingPhotos || publishing}
                      className={`w-full rounded-full border p-2 text-xs file:mr-3 file:rounded-full file:border-0 file:bg-zinc-900 file:dark:bg-white file:text-white file:dark:text-zinc-950 file:px-3 file:py-1 file:text-xs file:font-bold hover:file:opacity-90 ${inputBg}`}
                    />
                    <p id="sanpo-original-files-help" className="text-[11px] text-zinc-400"><UiText text={"選択画面では「ファイル」「ブラウズ」から、DCIM／Cameraなどの原本を選んでください。写真ライブラリ経由ではGPSが削除される場合があります。GPS抽出後に掲載用画像を圧縮します。"} /></p>
                  </div>
                  {photoNotice && <p role="status" className="whitespace-pre-line text-xs text-amber-600">{photoNotice}</p>}
                  {processingPhotos && <p role="status" className="text-xs"><UiText text={"写真のGPSを読み込んでいます…"} /></p>}
                  {shareError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{shareError}</p>}
                  <p className="text-xs leading-relaxed"><UiText text={"投稿は14日間掲載されます。投稿したブラウザからタイトル・説明の編集と削除ができます。ブラウザのデータを削除すると管理できなくなります。"} /></p>
                  {publishing && <p role="status" className="text-xs"><UiText text={"徒歩経路を作成し、クラウドへ投稿しています…"} /></p>}
                  {draftSnaps.length >= 2 && <div className="flex flex-col gap-2">
                    <p className="text-xs font-bold"><UiText text={"写真から推定した徒歩経路"} /></p>
                    <p className="text-xs text-zinc-500"><UiText text={"撮影地点を撮影順に通る推定経路です。青線を確認し、GPS位置がずれていれば番号ピンをドラッグして補正できます。"} /></p>
                    <SanpoRoutePreview points={routePoints} path={previewRoute?.path || []} onMove={movePhotoPoint} />
                    {buildingPreview && <p role="status" className="text-xs"><UiText text={"道に沿った徒歩経路を生成しています…"} /></p>}
                    {previewRoute && <p className="text-xs">{(previewRoute.distance_meters / 1000).toFixed(2)}<UiText text={"km · 約"} />{Math.round(previewRoute.duration_seconds / 60)}<UiText text={"分"} /></p>}
                    {previewError && <div role="alert" className="text-xs text-red-600">{previewError} <button type="button" className="underline" onClick={() => setRetryPreview(value => value + 1)}><UiText text={"再試行"} /></button></div>}
                  </div>}
                  {/* プレビュースナップ一覧（スポット名・一言の編集対応） */}
                  {draftSnaps.length > 0 && (
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">
                          <UiText text={"推定用"} />{draftSnaps.length}<UiText text={"地点 · 掲載"} />{featuredSnaps.length}<UiText text={"/5枚:"} /></span>
                        <button
                          type="button"
                          onClick={() => { setDraftSnaps([]); setFeaturedIds([]); setTrustedDraft(null); }}
                          disabled={processingPhotos || publishing}
                          className="text-[11px] text-[#EA4335] font-bold hover:underline"
                        >
                          <UiText text={"すべてクリア"} /></button>
                      </div>
                      <fieldset disabled={processingPhotos || publishing} className="flex flex-col gap-2 max-h-[300px] overflow-y-auto no-scrollbar pr-0.5">
                        {draftSnaps.map((snap, idx) => (
                          <div
                            key={snap.id}
                            className={`flex items-start gap-2.5 p-2 rounded-xl border ${cardBg}`}
                          >
                            <div className="relative h-14 w-14 shrink-0 rounded-lg overflow-hidden border border-inherit bg-black">
                              {snap.mainImageUrl ? <img
                                src={snap.mainImageUrl}
                                alt={snap.spotName}
                                className="h-full w-full object-cover"
                              /> : <span className="text-[10px] text-white"><UiText text={"GPSのみ"} /></span>}
                              <div className="absolute left-1 top-1 rounded-full bg-black/70 px-1 py-0.2 text-[8px] font-black text-white">
                                #{idx + 1}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col gap-1">
                              <label className="flex items-center gap-2 text-xs">
                                <input type="checkbox" checked={featuredIds.includes(snap.id)}
                                  disabled={!snap.mainImageUrl || processingPhotos || publishing || (!featuredIds.includes(snap.id) && featuredSnaps.length >= 5)}
                                  onChange={e => setFeaturedIds(ids => e.target.checked ? [...ids, snap.id] : ids.filter(id => id !== snap.id))} />
                                <UiText text={"投稿に掲載する"} /></label>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={snap.spotName}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setDraftSnaps((prev) =>
                                      prev.map((s, i) => (i === idx ? { ...s, spotName: val } : s))
                                    );
                                  }}
                                  placeholder={`チェックポイント${idx + 1}`}
                                  className={`flex-1 rounded-lg border px-2 py-0.5 text-xs font-bold ${inputBg}`}
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTrustedDraft(null);
                                    setFeaturedIds(ids => ids.filter(id => id !== snap.id));
                                    setDraftSnaps((prev) =>
                                      prev
                                        .filter((_, i) => i !== idx)
                                        .map((s, i) => ({
                                          ...s,
                                          order: i + 1,
                                          spotName: !s.spotName || /^チェックポイント\s*\d+$/.test(s.spotName)
                                            ? `チェックポイント${i + 1}`
                                            : s.spotName,
                                        }))
                                    );
                                  }}
                                  title={ui(ui("このスポットを削除"))}
                                  className="h-6 w-6 shrink-0 flex items-center justify-center rounded-full text-zinc-400 hover:text-[#EA4335] hover:bg-zinc-200 dark:hover:bg-zinc-800 transition"
                                >
                                  ✕
                                </button>
                              </div>
                              <input
                                type="text"
                                value={snap.caption}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setDraftSnaps((prev) =>
                                    prev.map((s, i) => (i === idx ? { ...s, caption: val } : s))
                                  );
                                }}
                                placeholder={ui(ui("おすすめポイント・一言メモ"))}
                                className={`w-full rounded-lg border px-2 py-0.5 text-[11px] ${inputBg}`}
                              />
                            </div>
                          </div>
                        ))}
                      </fieldset>
                    </div>
                  )}

                  {/* ルート基本情報 */}
                  <div className="flex flex-col gap-2.5">
                    <div>
                      <label className="text-sm font-bold mb-1 block">
                        <UiText text={"コース名"} /><span className="text-rose-500">*</span>:
                      </label>
                      <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder={trustedDraft?.title ? `例: ${trustedDraft.title}` : ui(ui("例: 富山駅北口からの散歩道"))}
                        required
                        className={`w-full rounded-full border px3 py-2 text-md focus:outline-none ${inputBg}`}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-sm font-bold mb-1 block">
                          <UiText text={"あなたのニックネーム"} /><span className="text-rose-500">*</span>:
                        </label>
                        <input
                          type="text"
                          value={newAuthor}
                          onChange={(e) => setNewAuthor(e.target.value)}
                          placeholder={ui("例: Kevin")}
                          required
                          className={`w-full rounded-full border px-3 py-2 text-md focus:outline-none ${inputBg}`}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-bold mb-1 block">
                          <UiText text={"エリア"} /><span className="text-rose-500">*</span>:
                        </label>
                        <input
                          type="text"
                          value={newArea}
                          onChange={(e) => setNewArea(e.target.value)}
                          placeholder={trustedDraft?.areaLabel ? `例: ${trustedDraft.areaLabel}` : ui("例: 富山駅〜環水公園")}
                          required
                          className={`w-full rounded-full border px-3 py-2 text-md focus:outline-none ${inputBg}`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-bold mb-1 block"><UiText text={"おすすめメモ・一言:"} /></label>
                      <textarea
                        value={newSummary}
                        onChange={(e) => setNewSummary(e.target.value)}
                        placeholder={ui(ui("例: 人通りが少なくて夕暮れの風が気持ちいいコースです。"))}
                        rows={1}
                        className={`w-full rounded-full border px-4 py-3 text-sm focus:outline-none resize-none ${inputBg}`}
                      />
                    </div>
                  </div>

                  {/* 送信ボタン */}
                  <button
                    type="submit"
                    disabled={
                      draftSnaps.length < 2 || featuredSnaps.length < 2 || featuredSnaps.length > 5 ||
                      !newTitle.trim() ||
                      !newAuthor.trim() ||
                      !newArea.trim() ||
                      publishing ||
                      processingPhotos ||
                      buildingPreview ||
                      !previewRoute
                    }
                    className="w-full flex items-center justify-center gap-2 rounded-full bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 py-2.5 text-md font-bold shadow-md transition active:scale-95 disabled:opacity-30 mt-1"
                  >
                    <span><UiText text={"散歩ルートを公開 ＆ 共有リンクを発行"} /></span>
                  </button>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
