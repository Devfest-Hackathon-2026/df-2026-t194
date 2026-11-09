import { buildRoutePinEdit } from "@/services/routePinEdit";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FloatingHUD } from "@/components/FloatingHUD";
import { MapViewport } from "@/components/MapViewport";
import { AgentAnswer, RouteInsightModal } from "@/components/RouteInsightModal";
import { SanpoShareModal } from "@/components/SanpoShareModal";
import { buildDynamicRoutes, ROUTE_MODES, reverseComputedRoute } from "@/data/complexRoutes";
import {
  createDraftFromComputedRoute,
  createComputedRouteFromSanpoPost,
  reverseSanpoPost,
  InitialDraftRoute,
  INITIAL_WALKREAL_POSTS,
} from "@/data/walkrealData";
import {
  fetchDynamicRoute,
  inferRouteModeFromPrompt,
  RouteApiError,
} from "@/services/routeAgent";
import { MapFacilityPin } from "@/data/facilityPins";
import { ComputedRoute } from "@/types/route";
import { WalkRealRoutePost } from "@/types/walkreal";
import { ThemeMode } from "@/types/theme";
import { isCurrentLocationText, I18N } from "@/components/hud/hudTypes";
import {
  subscribeToSanpoRoutes,
  publishSanpoRouteToFirestore,
  toggleSanpoLikeInFirestore,
  fetchSanpoRouteById,
  getSanpoIdentitySync,
} from "@/services/sanpoFirebase";
import { scoreSanpoPosts } from "@/services/sanpoSearch";

import { getSanpoRouteStops } from "@/services/sanpoGeometry";

import { presentRoute } from "@/services/routePresentation";
import { retainVerifiedStops, loopOrigin } from "@/services/routeRefinement";
import { blockMapPinTemporarily } from "@/utils/mapPinGuard";
import { UiLanguage } from "@/i18n/ui";

export function App() {
  // 進行中のAIルート検索リクエストを中断するためのコントローラー
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);



  // 出発地・中継地点リスト・目的地（待機状態では現在地＋目的地は空）
  const [origin, setOrigin] = useState<string>("現在地");
  const [waypoints, setWaypoints] = useState<string[]>([]);
  const [waypointGeos, setWaypointGeos] = useState<({ lat: number; lng: number } | null)[]>([]);
  const [destination, setDestination] = useState<string>("");
  const [destinationGeo, setDestinationGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedPin, setSelectedPin] = useState<MapFacilityPin | null>(null);
  const [isPinCardOpen, setIsPinCardOpen] = useState<boolean>(false);
  const [pinResetKey, setPinResetKey] = useState<number>(0);

  // selectedPin の有無と isPinCardOpen を自動同期
  useEffect(() => {
    setIsPinCardOpen(selectedPin !== null);
  }, [selectedPin]);

  // 着せ替えテーマ: modern (シンプルミニマル) / traditional (江戸・和風絵巻)
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem("app_theme_mode");
      if (saved === "modern" || saved === "traditional") return saved;
    } catch {
      // ignore
    }
    return "modern";
  });

  const handleSelectThemeMode = (mode: ThemeMode) => {
    setThemeMode(mode);
    setOrigin((prev) => {
      if (isCurrentLocationText(prev)) {
        const t = I18N[language] ?? I18N.ja;
        return mode === "traditional" ? t.originTrad : t.origin;
      }
      return prev;
    });
    try {
      localStorage.setItem("app_theme_mode", mode);
    } catch {
      // ignore
    }
  };

  // バックエンドから取得した動的ルート一覧
  const [candidateRoutes, setCandidateRoutes] = useState<ComputedRoute[]>([]);
  const [activeRouteIndex, setActiveRouteIndex] = useState<number>(0);

  // ルート検索中かどうか（false = 普通のGoogle Maps待機状態、true = ルート表示モード）
  const [isRouteActive, setIsRouteActive] = useState<boolean>(false);

  // バックエンドの推論状況
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [analysisSummary, setAnalysisSummary] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [lastSearchPrompt, setLastSearchPrompt] = useState<string | null>(null);
  const [agentAnswer, setAgentAnswer] = useState<AgentAnswer | null>(null);
  const [insightTab, setInsightTab] = useState<"answer" | "compare" | null>(null);

  // デイモード / ナイトモード
  const [isDark, setIsDark] = useState<boolean>(false);

  // マップ全画面表示（イマージブモード: 上部・下部UI退避）
  const [isUiHidden, setIsUiHidden] = useState<boolean>(false);
  const handleRestoreUi = useCallback(() => {
    blockMapPinTemporarily(400);
    setIsUiHidden(false);
  }, []);

  // 案内モードの現在ステップインデックス（null = 通常全体表示モード）
  const [guideStepIndex, setGuideStepIndex] = useState<number | null>(null);
  const [autoPlayGuide, setAutoPlayGuide] = useState<boolean>(true);

  // マップ操作アクション（北向きリセット・現在地移動）
  const [mapActions, setMapActions] = useState<{
    resetNorth: () => void;
    recenter: () => void;
  } | null>(null);

  // 現在地（ブラウザ位置情報、キャッシュまたは初期座標）
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(() => {
    try {
      const saved = localStorage.getItem("last_known_location");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.lat === "number" && typeof parsed?.lng === "number") {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return { lat: 36.6959, lng: 137.2137 };
  });

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    // 1. 初回高精度測位
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCurrentLocation(loc);
        try {
          localStorage.setItem("last_known_location", JSON.stringify(loc));
        } catch {}
      },
      (err) => {
        console.info("Initial geolocation access note:", err.message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    // 2. リアルタイム位置更新
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCurrentLocation(loc);
        try {
          localStorage.setItem("last_known_location", JSON.stringify(loc));
        } catch {}
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // 出発地・中継地点・目的地から動的にローカルルートを再構築（初期状態やオフライン用）
  const localRoutes = useMemo(
    () => buildDynamicRoutes(origin, waypoints, destination, "", destinationGeo),
    [origin, waypoints, destination, destinationGeo]
  );

  // 現在利用可能なルート候補（AIからの提案があればそれ、なければ初期の標準おすすめ＋最短ルート）
  const [language, setLanguage] = useState<"ja" | "en" | "zh">(() => {
    const saved = localStorage.getItem("app-language");
    return saved === "en" || saved === "zh" ? saved : "ja";
  });
  useEffect(() => { localStorage.setItem("app-language", language); document.documentElement.lang = language; }, [language]);

  const handleSelectLanguage = useCallback((lang: "ja" | "en" | "zh") => {
    setLanguage(lang);
    setOrigin((prev) => {
      if (isCurrentLocationText(prev)) {
        const t = I18N[lang] ?? I18N.ja;
        return themeMode === "traditional" ? t.originTrad : t.origin;
      }
      return prev;
    });
  }, [themeMode]);

  const allRoutes = useMemo(() => {
    if (candidateRoutes.length > 0) return candidateRoutes.map(route => presentRoute(route, candidateRoutes, lastSearchPrompt ?? "", language));
    const isTrad = themeMode === "traditional";
    return [
      {
        ...localRoutes.hybrid,
        modeLabel:
          language === "en"
            ? "Recommended Route"
            : language === "zh"
            ? "推荐路线"
            : isTrad
            ? "一之道·推奨街道"
            : "標準おすすめルート",
        summaryBadge:
          language === "en"
            ? "Pedestrian-friendly main route"
            : language === "zh"
            ? "行人优先推荐路线"
            : "歩道優先で歩きやすいメインルート",
      },
      {
        ...localRoutes.fast,
        modeLabel:
          language === "en"
            ? "Shortest Direct Route"
            : language === "zh"
            ? "最短直达"
            : isTrad
            ? "二之道·本街道"
            : "大通り最短ルート",
        summaryBadge:
          language === "en"
            ? "Fastest direct route along main streets"
            : language === "zh"
            ? "直达目的地的最快路线"
            : "寄り道せず目的地へ直行する最速ルート",
      },
    ];
  }, [candidateRoutes, localRoutes, language, lastSearchPrompt, themeMode]);

  // 現在アクティブなルート
  const activeRoute =
    allRoutes[activeRouteIndex] ||
    allRoutes[0] ||
    localRoutes.hybrid ||
    ROUTE_MODES.hybrid;

  useEffect(() => {
    if (!isRouteActive) return;
    const stops = candidateRoutes[activeRouteIndex]?.apiData?.waypoints.slice(1,-1)
      .filter(stop => stop.place_verified || stop.purpose === 'user_stop');
    if (!stops) return;
    setWaypoints(stops.map(stop => stop.name));
    setWaypointGeos(stops.map(stop => ({lat:stop.lat,lng:stop.lng})));
  }, [candidateRoutes, activeRouteIndex, isRouteActive]);

  // 新機能: 言語設定 (他言語)、NGスポットリスト、システムプロンプト設定

  const [avoidSpots, setAvoidSpots] = useState<string[]>([]);
  const [walkedSpots, setWalkedSpots] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("walked_spots") || "[]"); } catch { return []; }
  });
  const [customSystemPrompt, setCustomSystemPrompt] = useState<string | null>(null);
  const [realThinkingStage, setRealThinkingStage] = useState<string | null>(null);

  // ==================== SANPOSHERE (写真散歩ルート共有) 状態管理 ====================
  const [mainTab, setMainTab] = useState<"route" | "sanpo">("route");
  const [sanpoModalInitialTab, setSanpoModalInitialTab] = useState<"feed" | "create">("feed");
  const [sanpoSearchMatch, setSanpoSearchMatch] = useState<{
    query: string;
    score: number;
    reasons: string[];
  } | null>(null);
  const [isSanpoModalOpen, setIsSanpoModalOpen] = useState(false);
  const [sanpoPosts, setSanpoPosts] = useState<WalkRealRoutePost[]>(() => {
    try {
      const saved = localStorage.getItem("sanposhere_custom_posts");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((p: WalkRealRoutePost) => p && !p.id.startsWith("wr-"));
        }
      }
    } catch {
      // ignore
    }
    return INITIAL_WALKREAL_POSTS;
  });
  const [activeSanpoPost, setActiveSanpoPost] = useState<WalkRealRoutePost | null>(null);
  const [draftSanpoRoute, setDraftSanpoRoute] = useState<InitialDraftRoute | null>(null);

  const recordWalkedSpots = useCallback((spots: string[]) => {
    const clean = spots.map((s) => s.trim()).filter((s) => s && !/^写真地点\d+$/.test(s) && !/出発|到着|区間|連絡/.test(s));
    if (clean.length === 0) return;
    setWalkedSpots((prev) => {
      const next = Array.from(new Set([...clean, ...prev])).slice(0, 15);
      try { localStorage.setItem("walked_spots", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Firestore リアルタイム同期（他人が投稿した散歩ルートも自動で「みんなの散歩」に届く）
  useEffect(() => {
    const unsubscribe = subscribeToSanpoRoutes((posts) => {
      setSanpoPosts(posts);
      setActiveSanpoPost(current => current ? posts.find(p => p.id === current.id) ?? null : null);
      const myUid = getSanpoIdentitySync();
      const mySpots = posts
        .filter((p) => (myUid && p.ownerUid === myUid) || p.walkedByMe || p.authorName === "あなた")
        .flatMap((p) => p.snaps.map((s) => s.spotName));
      recordWalkedSpots(mySpots);
    });
    return () => unsubscribe();
  }, [recordWalkedSpots]);

  // URL共有 (ディープリンク ?walk=xxx) の自動ロード（ローカルにない場合はFirestoreから直接取得）
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const walkId = params.get("walk");
    if (!walkId) return;

    const applyRoute = (target: WalkRealRoutePost) => {
      setActiveSanpoPost(target);
      if (target.snaps.length >= 2) {
        const stops = getSanpoRouteStops(target);
        setOrigin(stops[0].name);
        setDestination(stops[stops.length - 1].name);
        setWaypoints(stops.slice(1, -1).map(s => s.name));
        setWaypointGeos(stops.slice(1, -1).map(s => ({ lat: s.lat, lng: s.lng })));
        setIsRouteActive(true);
      }
    };

    const target = sanpoPosts.find((p) => p.id === walkId);
    if (target) {
      applyRoute(target);
    } else {
      fetchSanpoRouteById(walkId).then((post) => {
        if (post) applyRoute(post);
      });
    }
  }, [sanpoPosts]);

  // 散歩ルートのいいねトグル（Firestore & ローカル両方に反映）
  const handleToggleSanpoLike = async (postId: string) => {
    const target = sanpoPosts.find(p => p.id === postId);
    try { await toggleSanpoLikeInFirestore(postId, !target?.likedByMe); }
    catch (error) { setRouteError(error instanceof Error ? error.message : "いいねを保存できませんでした。"); }
  };

  // 「このコースを歩く」は開始操作。歩いた件数は別の自己申告で記録。
  const handleWalkThisSanpoRoute = (post: WalkRealRoutePost) => {
    recordWalkedSpots(post.snaps.map((s) => s.spotName));
    const sanpoRoute = createComputedRouteFromSanpoPost(post);
    setCandidateRoutes([sanpoRoute]);
    setActiveRouteIndex(0);
    setActiveSanpoPost(post);
    if (post.snaps.length >= 2) {
      const stops = getSanpoRouteStops(post);
      setOrigin(stops[0].name);
      setDestination(stops[stops.length - 1].name);
      setWaypoints(stops.slice(1, -1).map(s => s.name));
      setWaypointGeos(stops.slice(1, -1).map(s => ({ lat: s.lat, lng: s.lng })));
      setIsRouteActive(true);
    }

    // スムーズにAIルート探索・案内画面へ切り替え
    setMainTab("route");
    setIsSanpoModalOpen(false);
  };

  // 散歩コースを「逆向きで歩く」
  const handleWalkThisSanpoRouteReversed = (post: WalkRealRoutePost) => {
    const reversedPost = reverseSanpoPost(post);
    handleWalkThisSanpoRoute(reversedPost);
  };

  // 新規散歩ルート公開（Firestoreを通じてアプリ内一般公開）
  const handlePublishSanpoRoute = async (newPost: WalkRealRoutePost) => {
    await publishSanpoRouteToFirestore(newPost);
    recordWalkedSpots(newPost.snaps.map((s) => s.spotName));
    setSanpoPosts((prev) => [newPost, ...prev.filter(post => post.id !== newPost.id)]);
    setActiveSanpoPost(newPost);

  };

  // ① ルート完歩時: 写真散歩ルート投稿（ダミー写真なし、自分の写真をファイルピッカーから追加）
  const handleShareCurrentRoute = (routeToShare?: ComputedRoute) => {
    const targetRoute = routeToShare || activeRoute;
    const draft = createDraftFromComputedRoute(targetRoute, origin, destination);
    setDraftSanpoRoute(draft);
    setSanpoModalInitialTab("create");
    setIsSanpoModalOpen(true);
  };

  // ② 写真ピン・施設ピン・長押しピンからの「経由地に追加」
  const handleAddWaypointFromSnap = (spotName: string, geo?: { lat: number; lng: number }) => {
    const cleanSpotName = spotName.trim() || "経由地点";

    // 同名スポットの重複による追加ブロックを防ぎ、確実に複数経由地を追加可能にする
    let uniqueSpotName = cleanSpotName;
    let counter = 2;
    while (waypoints.includes(uniqueSpotName)) {
      uniqueSpotName = `${cleanSpotName} (${counter++})`;
    }

    const updatedWaypoints = [...waypoints, uniqueSpotName].slice(0, 5);
    const updatedGeos = [...waypoints.map((_, i) => waypointGeos[i] ?? null), geo ?? null].slice(0, 5);
    setWaypoints(updatedWaypoints);
    setWaypointGeos(updatedGeos);
    setSelectedPin(null);

    const targetDest = destination.trim() || "目的地";
    const viaText = updatedWaypoints.map((w) => `「${w}」`).join("と") + "を経由して";
    const promptText = `${viaText}${targetDest}へ向かう徒歩ルートを再計算して`;

    handlePromptSubmit(
      promptText,
      origin,
      destination || undefined,
      destinationGeo,
      updatedWaypoints,
      updatedGeos
    );
  };

  // ② 写真ピン・施設ピン・長押しピンからの「目的地に設定する」
  const handleWalkToSpot = (spotName: string, geo?: { lat: number; lng: number }) => {
    const cleanSpotName = spotName.trim() || "指定した地点";
    setDestination(cleanSpotName);
    setDestinationGeo(geo || null);

    // 新たに目的地を直接指定した際は、前回の古い経由地を引き継がずクリーンにリセット
    setWaypoints([]);
    setWaypointGeos([]);
    setSelectedPin(null);

    const promptText = `「${cleanSpotName}」へ歩いて向かうおすすめの散歩コースを案内して`;

    handlePromptSubmit(
      promptText,
      origin,
      cleanSpotName,
      geo || null,
      [],
      []
    );
  };

  // ③ おまかせ周回散歩（指定時間の一周ループコース自動生成）
  const handleGenerateLoopWalk = (minutes: number = 30) => {
    const startPoint = origin.trim() || "現在地";
    // 目的地を出発地と同じに設定してループルートにする
    setMainTab("route");
    setDestination(startPoint);
    setDestinationGeo(null);
    setWaypoints([]);
    setWaypointGeos([]);
    handlePromptSubmit(
      `${startPoint}に戻ってくる${minutes}分のおまかせ周回散歩コースを作って`,
      startPoint,
      startPoint,
      null,
      [],
      [],
      minutes
    );
  };

  // ルート案選択時のハンドラー（前ルートや散歩オーバーレイの残存を完全リセット）
  const handleSelectRouteIndex = useCallback((idx: number) => {
    setActiveSanpoPost(null);
    setActiveRouteIndex(idx);
  }, []);

  // 自然言語プロンプトの送信ハンドラー
  const handlePromptSubmit = useCallback(async (
    prompt: string,
    overrideOrigin?: string,
    overrideDestination?: string,
    overrideDestGeo?: { lat: number; lng: number } | null,
    overrideWaypoints?: string[],
    overrideWaypointGeos?: ({ lat: number; lng: number } | null)[],
    overrideLoopMinutes?: number,
    routeEdit?: { originLocation: { lat: number; lng: number } }
  ) => {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) {
      setRouteError("行き先や希望を入力してから検索してください。");
      return;
    }
    setRouteError(null);

    // 散歩シェアモード時: 投稿済み散歩コースをスコアリング検索
    if (mainTab === "sanpo" && !overrideLoopMinutes && !routeEdit) {
      const scored = scoreSanpoPosts(normalizedPrompt, sanpoPosts);
      if (scored.length > 0 && scored[0].score > 0) {
        const top = scored[0];
        const reordered = [
          ...scored.filter((s) => s.score > 0).map((s) => s.post),
          ...scored.filter((s) => s.score === 0).map((s) => s.post),
        ];
        setSanpoPosts(reordered);
        setActiveSanpoPost(top.post);
        setSanpoSearchMatch({
          query: normalizedPrompt,
          score: top.score,
          reasons: top.matchedReasons,
        });
      } else {
        setRouteError(
          `「${normalizedPrompt}」にマッチする散歩コースが見つかりませんでした。「AIルート」タブに切り替えて新規探索できます。`
        );
      }
      return;
    }

    // 進行中のリクエストがあれば即時アボートしてエージェントタスクを停止
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setGuideStepIndex(null);
    setIsLoading(true);
    setRealThinkingStage(null);
    setActiveSanpoPost(null);

    // 「n分間散歩したい」「30分散歩」等の現在地発着周回散歩インテントを検出
    const detectedLoopMinutes = (() => {
      if (overrideLoopMinutes !== undefined) return overrideLoopMinutes;
      // 明確な別目的地（「東京駅まで」「浅草へ行く」等）が指定されている場合は周回散歩とみなさない
      const hasExplicitDestination = /[^\s]+(?:まで|へ行く|に行きたい)/.test(normalizedPrompt) &&
        !/(?:戻る|戻って|周回|一周|ループ|発着|現在地)/.test(normalizedPrompt);
      if (hasExplicitDestination) return undefined;

      const timeRegex = /(?:(\d+)\s*(?:時間|hours?|h|小时)(?:\s*(\d+)\s*(?:分|minutes?|min|m|分钟))?|(\d+)\s*(?:分|minutes?|min|m|分钟))/i;
      const match = normalizedPrompt.match(timeRegex);
      if (!match) return undefined;

      const walkIntentRegex = /(?:散歩|さんぽ|歩き|歩く|歩こう|ウォーキング|散策|ぶらぶら|運動|周回|ループ|一周|おまかせ|walk|stroll)/i;
      if (!walkIntentRegex.test(normalizedPrompt)) return undefined;

      const hours = parseInt(match[1] || "0", 10);
      const minutes = parseInt(match[2] || match[3] || "0", 10);
      const total = hours * 60 + minutes;
      return total >= 5 && total <= 240 ? total : undefined;
    })();

    const isLoopIntent = detectedLoopMinutes !== undefined;
    const startPoint = loopOrigin(normalizedPrompt, overrideOrigin ?? origin);

    // 周回散歩時は目的地を出発地（現在地）に設定し、前回の目的地や経由地をクリーンにリセット
    if (isLoopIntent) {
      setDestination(startPoint);
      setDestinationGeo(null);
      setWaypoints([]);
      setWaypointGeos([]);
    }

    const useOrigin = isLoopIntent ? startPoint : (overrideOrigin !== undefined ? overrideOrigin : origin);
    const useDest = isLoopIntent ? startPoint : (overrideDestination !== undefined ? overrideDestination : destination);
    const useDestGeo = isLoopIntent ? null : (overrideDestGeo !== undefined ? overrideDestGeo : destinationGeo);

    // Keep names and nullable coordinates aligned, including while a text field is empty.
    const requestedWaypoints = isLoopIntent ? [] : (overrideWaypoints ?? waypoints);
    const requestedWaypointGeos = isLoopIntent ? [] : (overrideWaypointGeos ?? waypointGeos);
    let waypointEntries = requestedWaypoints.map((name, i) => ({
      name: name.trim(), location: requestedWaypointGeos[i] ?? null,
    })).filter((entry) => entry.name);
    // Keep provider-confirmed stops during refinements; explicit edits and loops may clear them.
    if (isRouteActive && !isLoopIntent && !routeEdit && overrideWaypoints === undefined &&
        !/寄らない|寄らず|外し|不要|なし|無し|やめ|remove|without|skip|取消/i.test(normalizedPrompt)) {
      waypointEntries = retainVerifiedStops(waypointEntries, activeRoute.apiData?.waypoints?.slice(1, -1) ?? []);
    }
    const useWaypoints = waypointEntries.map((entry) => entry.name);
    const useWaypointGeos = waypointEntries.map((entry) => entry.location);
    const selectedStops = activeRoute.apiData?.waypoints?.slice(1, -1).map((stop) => stop.name) ?? [];
    const wantsUnwalked = /歩いたこと(?:が)?ない|未開拓|知らない(?:道|ルート|場所)|新しい(?:道|ルート)|別の(?:道|ルート)|初めて(?:の道|通る)|unwalked|new route/i.test(normalizedPrompt);
    const effectiveAvoidSpots = wantsUnwalked
      ? Array.from(new Set([...avoidSpots, ...walkedSpots, ...selectedStops])).slice(0, 12)
      : avoidSpots;
    const previousRouteSummary = isRouteActive && activeRoute.apiData
      ? [
          lastSearchPrompt ? `前回の希望: ${lastSearchPrompt}` : "",
          `選択中の案: ${activeRoute.apiData.title}。${activeRoute.apiData.concept}`,
          selectedStops.length ? `選択中の経由地: ${selectedStops.join(" → ")}` : "経由地なし",
          `距離${activeRoute.apiData.metrics.distance_meters}m、所要時間${Math.round(activeRoute.apiData.metrics.duration_seconds / 60)}分`,
        ].filter(Boolean).join("\n")
      : null;

    try {
      // 1. バックエンド API (/api/route/stream または /api/route) へリクエスト（リアルタイム思考同期）
      const result = await fetchDynamicRoute({
        prompt: normalizedPrompt,
        loopMinutes: detectedLoopMinutes,
        rerouteOnly: !!routeEdit,
        originLocation: routeEdit?.originLocation,
        origin: useOrigin,
        destination: useDest,
        destinationLocation: useDestGeo,
        waypoints: useWaypoints,
        waypointLocations: useWaypointGeos,
        waypointsExplicit: overrideWaypoints !== undefined,
        currentLocation,
        avoidSpots: effectiveAvoidSpots,
        language,
        customSystemPrompt,
        previousUserPrompt: isRouteActive && !isLoopIntent ? lastSearchPrompt : null,
        previousRouteSummary: isLoopIntent ? null : previousRouteSummary,
        signal: controller.signal,
        onProgress: (event) => {
          if (!controller.signal.aborted) {
            const progress = {
              en: { init: "Starting route search…", gemini: "Understanding your preferences…", routes: "Comparing walking routes…", sensors: "Checking walking conditions…", decision: "Choosing routes that fit your needs…" },
              zh: { init: "开始搜索路线…", gemini: "理解您的偏好…", routes: "比较步行路线…", sensors: "确认步行环境…", decision: "选择符合需求的路线…" },
            };
            setRealThinkingStage(language === "ja" ? event.label : (progress[language] as Record<string,string>)[event.stage] ?? progress[language].routes);
          }
        },
      });

      if (controller.signal.aborted) return;
      if (result.routes.length === 0) {
        throw new RouteApiError(422, "徒歩ルートが見つかりませんでした。出発地と目的地を確認してください。");
      }

      setOrigin(result.origin);
      // 周回散歩時は出発地と目的地が一致（現在地に戻る）
      const isLoopResult = isLoopIntent || result.origin === result.destination || !!result.response.routes?.[0]?.tags?.some((t) => t.includes("周回"));
      if (isLoopResult) {
        setDestination(result.origin || startPoint);
        setDestinationGeo(null);
      } else if (result.destination && result.destination !== "指定した地点" && useDest && result.destination !== useDest) {
        setDestination(result.destination);
        const lastStop = result.response.routes?.[0]?.waypoints?.slice(-1)[0];
        if (lastStop && lastStop.lat && lastStop.lng) {
          setDestinationGeo({ lat: lastStop.lat, lng: lastStop.lng });
        }
      } else if (useDestGeo && useDest) {
        setDestination(useDest);
      } else {
        setDestination(result.destination);
      }
      const displayedStops = result.response.routes[0]?.waypoints.slice(1, -1).filter(stop => stop.place_verified) ?? [];
      setWaypoints(displayedStops.length ? displayedStops.map(stop => stop.name) : useWaypoints);
      setWaypointGeos(displayedStops.length ? displayedStops.map(stop => ({lat: stop.lat, lng: stop.lng})) : useWaypointGeos);
      setLastSearchPrompt((previous) =>
        isRouteActive && previous && !isLoopIntent
          ? `${previous}\n追加希望: ${normalizedPrompt}`
          : normalizedPrompt
      );
      setAnalysisSummary(result.response.summary);
      const env = result.response.environment;
      setAgentAnswer({
        environment: env,
        summary: result.response.summary,
        factors: result.response.inferred_factors || [],
        environmentText: `${env.season_and_time} / ${env.weather_condition} ${env.temp_c}℃${env.air_quality_index != null ? ` / AQI ${env.air_quality_index} (${env.air_quality_category})` : ""}${env.pollen_index != null ? ` / 花粉 ${env.pollen_index}/5 (${env.pollen_category})` : ""}`,
      });

      // 取得した動的ルート候補を登録
      if (result.routes.length > 0) {
        setCandidateRoutes(result.routes);
        setActiveRouteIndex(0);
      }
      setIsRouteActive(true);
    } catch (err: any) {
      if (err?.name === "AbortError" || controller.signal.aborted) {
        console.info("Route search cancelled and agent stopped by user.");
        return;
      }
      if (err instanceof RouteApiError) {
        if (err.status === 422) {
          setIsRouteActive(false);
          setCandidateRoutes([]);
          setAgentAnswer(null);
        }
        setRouteError(err.message);
        return;
      }
      console.warn("Backend API request failed:", err);
      setRouteError(language === "en" ? "Route search failed. Check your connection and retry." : language === "zh" ? "路线搜索失败，请检查网络后重试。" : "ルート検索に失敗しました。通信状態を確認して再試行してください。");
    } finally {
      if (abortControllerRef.current === controller || !abortControllerRef.current) {
        setIsLoading(false);
        setRealThinkingStage(null);
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    }
  }, [
    activeRoute,
    avoidSpots,
    currentLocation,
    customSystemPrompt,
    destination,
    isRouteActive,
    language,
    lastSearchPrompt,
    localRoutes,
    mainTab,
    origin,
    destinationGeo,
    sanpoPosts,
    walkedSpots,
    waypoints,
    waypointGeos,
  ]);

  // マップ上のピンをドラッグ＆ドロップした時のハンドラー
  const handlePinMoved = useCallback((index: number, newPos: { lat: number; lng: number }) => {
    const pins = activeRoute.apiData?.waypoints;
    if (!pins || pins.length < 2) return;
    try {
      const edit = buildRoutePinEdit(pins, index, newPos);
      setMainTab("route");
      setOrigin(edit.origin);
      setDestination(edit.destination);
      setDestinationGeo(edit.destinationLocation);
      setWaypoints(edit.waypoints);
      setWaypointGeos(edit.waypointLocations);
      handlePromptSubmit(
        `${edit.origin}から${edit.destination}まで、指定したピンの位置と順序で徒歩ルートを再計算`,
        edit.origin, edit.destination, edit.destinationLocation,
        edit.waypoints, edit.waypointLocations, undefined,
        { originLocation: edit.originLocation }
      );
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : "ピンの移動先を確認してください。");
    }
  }, [activeRoute.apiData?.waypoints, handlePromptSubmit]);

  // 自動進行ON時は一定間隔で次の曲がり角へカメラを進める（ゴール到達時に自動停止）
  useEffect(() => {
    if (guideStepIndex === null || !autoPlayGuide) return;
    const len = activeRoute.segments.length;
    if (guideStepIndex >= len - 1) {
      setAutoPlayGuide(false);
      return;
    }
    const timer = window.setInterval(() => {
      setGuideStepIndex((prev) => {
        if (prev === null) return null;
        if (prev >= len - 1) {
          setAutoPlayGuide(false);
          return len - 1;
        }
        return prev + 1;
      });
    }, 2800);
    return () => window.clearInterval(timer);
  }, [guideStepIndex, autoPlayGuide, activeRoute.segments.length]);

  // 案内モード中: 実機のGPS測位（watchPosition）で現在地を追跡し、次の目標地点（30m以内）に近づいたらステップを自動進行
  useEffect(() => {
    if (guideStepIndex === null || typeof navigator === "undefined" || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCurrentLocation(loc);
        setGuideStepIndex((prev) => {
          if (prev === null) return null;
          const seg = activeRoute.segments[prev];
          if (!seg || prev >= activeRoute.segments.length - 1) return prev;
          const dLat = ((seg.toGeo.lat - loc.lat) * Math.PI) / 180;
          const dLng = ((seg.toGeo.lng - loc.lng) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((loc.lat * Math.PI) / 180) *
              Math.cos((seg.toGeo.lat * Math.PI) / 180) *
              Math.sin(dLng / 2) ** 2;
          const distM = 2 * 6371000 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
          return distM <= 30 ? prev + 1 : prev;
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 8000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [guideStepIndex, activeRoute.segments]);

  const handleSwapEndpoints = () => {
    if (!destination.trim()) return;

    const nextOrigin = destination;
    const nextDestination = origin;
    const nextWaypoints = [...waypoints].reverse();
    const nextWaypointGeos = waypoints.map((_, i) => waypointGeos[i] ?? null).reverse();

    // 出発地と目的地の座標を入れ替え
    let nextOriginGeo: { lat: number; lng: number } | null = destinationGeo;
    let nextDestGeo: { lat: number; lng: number } | null = null;

    if (isCurrentLocationText(origin) && currentLocation) {
      nextDestGeo = { lat: currentLocation.lat, lng: currentLocation.lng };
    } else if (activeRoute.apiData?.waypoints && activeRoute.apiData.waypoints.length > 0) {
      const firstWp = activeRoute.apiData.waypoints[0];
      if (firstWp.lat && firstWp.lng) {
        nextDestGeo = { lat: firstWp.lat, lng: firstWp.lng };
      }
      if (!nextOriginGeo) {
        const lastWp = activeRoute.apiData.waypoints[activeRoute.apiData.waypoints.length - 1];
        if (lastWp.lat && lastWp.lng) {
          nextOriginGeo = { lat: lastWp.lat, lng: lastWp.lng };
        }
      }
    }

    setOrigin(nextOrigin);
    setDestination(nextDestination);
    setDestinationGeo(nextDestGeo);
    setWaypoints(nextWaypoints);
    setWaypointGeos(nextWaypointGeos);

    // ドロップピンをリセット
    setPinResetKey((prev) => prev + 1);

    // 1. 散歩コース（activeSanpoPost）がアクティブな場合、散歩ルート自体を即座に逆転
    if (activeSanpoPost) {
      const reversedPost = reverseSanpoPost(activeSanpoPost);
      setActiveSanpoPost(reversedPost);
      const reversedRoute = createComputedRouteFromSanpoPost(reversedPost);
      setCandidateRoutes([reversedRoute]);
      setActiveRouteIndex(0);
      setIsRouteActive(true);
      return;
    }

    // 2. 初期おすすめルート（API探索前）の場合、localRoutesが即座に逆向きルートを構築
    if (!isRouteActive || candidateRoutes.length === 0) {
      setIsRouteActive(true);
      return;
    }

    // 3. AI提案ルートが存在する場合、即座に既存ルートを逆転プレビューしつつ、バックエンドに最新逆方向ルートを要請
    setCandidateRoutes((prev) => prev.map((r) => reverseComputedRoute(r)));
    setActiveRouteIndex(0);

    // 前後を入れ替えた逆方向の徒歩ルートを即座に再探索
    const viaText = nextWaypoints.length > 0
      ? nextWaypoints.map((w) => `「${w}」`).join("と") + "を経由して"
      : "";
    const promptText = `${nextOrigin}から${viaText}「${nextDestination}」へ向かう徒歩ルート`;

    handlePromptSubmit(
      promptText,
      nextOrigin,
      nextDestination,
      nextDestGeo,
      nextWaypoints,
      nextWaypointGeos,
      undefined,
      nextOriginGeo ? { originLocation: nextOriginGeo } : undefined
    );
  };

  const handleAddWaypoint = () => {
    if (waypoints.length >= 5) return;
    const defaultSamples = ["表参道", "青山一丁目", "乃木坂", "六本木", "麻布十番"];
    const nextSample = defaultSamples[waypoints.length] || "中継地点";
    setWaypoints((prev) => [...prev, nextSample]);
    setWaypointGeos(waypoints.map((_, i) => waypointGeos[i] ?? null).concat(null));
  };

  const handleChangeWaypoint = (index: number, val: string) => {
    setWaypoints((prev) => prev.map((item, i) => (i === index ? val : item)));
    setWaypointGeos(waypoints.map((_, i) => i === index ? null : waypointGeos[i] ?? null));
  };

  const handleRemoveWaypoint = (index: number) => {
    const nextWaypoints = waypoints.filter((_, i) => i !== index);
    const nextGeos = waypoints.map((_, i) => waypointGeos[i] ?? null).filter((_, i) => i !== index);
    setWaypoints(nextWaypoints);
    setWaypointGeos(nextGeos);
    if (destination.trim()) {
      const viaText = nextWaypoints.length > 0
        ? nextWaypoints.map((w) => `「${w}」`).join("と") + "を経由して"
        : "";
      handlePromptSubmit(
        `${viaText}「${destination.trim()}」へ向かう徒歩ルートを再計算して`,
        origin,
        destination,
        destinationGeo,
        nextWaypoints,
        nextGeos
      );
    }
  };

  const handleClearWaypoints = () => {
    setWaypoints([]);
    setWaypointGeos([]);
    if (destination.trim()) {
      handlePromptSubmit(
        `「${destination.trim()}」へ向かう徒歩ルートを案内して`,
        origin,
        destination,
        destinationGeo,
        [],
        []
      );
    }
  };

  // 案内開始時・新ルート開拓時に通過スポットをローカル履歴へ蓄積（ponytail: localStorage上限15件）
  const recordWalkedRoute = (route: ComputedRoute) => {
    const stops = route.apiData?.waypoints?.slice(1, -1).map((s) => s.name) ?? [];
    const segs = route.segments.slice(1, -1).map((s) => s.label).filter((l) => l && !/出発|到着|区間|連絡/.test(l));
    const next = Array.from(new Set([...(stops.length ? stops : segs), ...walkedSpots])).slice(0, 15);
    setWalkedSpots(next);
    try { localStorage.setItem("walked_spots", JSON.stringify(next)); } catch {}
    return next;
  };

  const handleStartGuide = () => {
    recordWalkedRoute(activeRoute);
    setAutoPlayGuide(true);
    setGuideStepIndex(0);
  };

  const handleExploreNewRoute = () => {
    const recorded = recordWalkedRoute(activeRoute);
    setAvoidSpots((prev) => Array.from(new Set([...prev, ...recorded])).slice(0, 12));
    setMainTab("route");
    const targetDest = destination.trim() || origin.trim() || "現在地";
    const isLoop = !destination.trim() || origin.trim() === destination.trim();
    handlePromptSubmit(
      isLoop
        ? `${origin.trim() || "現在地"}発着でまだ歩いたことがない未開拓ルートをめぐる30分の周回散歩コースを作って`
        : `まだ歩いたことがない未開拓の道・新しいルートで「${targetDest}」へ向かう徒歩ルートを提案して`,
      origin,
      targetDest,
      destinationGeo,
      [],
      [],
      isLoop ? 30 : undefined
    );
  };

  const handleExitGuide = () => {
    setAutoPlayGuide(false);
    setGuideStepIndex(null);
  };

  const handlePrevStep = () => {
    setAutoPlayGuide(false);
    setGuideStepIndex((prev) => Math.max(0, (prev ?? 0) - 1));
  };

  const handleNextStep = () => {
    setAutoPlayGuide(false);
    const len = Math.max(1, activeRoute.segments.length);
    setGuideStepIndex((prev) => Math.min(len - 1, (prev ?? 0) + 1));
  };

  const handleToggleAutoPlay = () => {
    setAutoPlayGuide((prev) => {
      const next = !prev;
      if (next && guideStepIndex !== null && guideStepIndex >= activeRoute.segments.length - 1) {
        setGuideStepIndex(0);
      }
      return next;
    });
  };

  // ルート検索を中止して待機状態へリセット（現在地に戻し、目的地は空に。進行中エージェントも即時中断）
  const handleCancelRoute = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setRealThinkingStage(null);
    setIsRouteActive(false);
    setActiveSanpoPost(null);
    const t = I18N[language] ?? I18N.ja;
    setOrigin(themeMode === "traditional" ? t.originTrad : t.origin);
    setDestination("");
    setDestinationGeo(null);
    setSelectedPin(null);
    setIsPinCardOpen(false);
    setPinResetKey((prev) => prev + 1);
    setWaypoints([]);
    setWaypointGeos([]);
    setCandidateRoutes([]);
    setActiveRouteIndex(0);
    setGuideStepIndex(null);
    setAnalysisSummary(null);
    setRouteError(null);
    setAgentAnswer(null);
    setLastSearchPrompt(null);
  }, []);

  // メインモード切替ハンドラー（AIルートから散歩シェアへ切り替えた時もルート・選択ピンをリセット）
  const handleChangeMainTab = useCallback((tab: "route" | "sanpo") => {
    if (tab === "sanpo") {
      handleCancelRoute();
      if (sanpoPosts.length > 0) {
        setActiveSanpoPost(sanpoPosts[0]);
      }
    } else {
      setPinResetKey((prev) => prev + 1);
    }
    setMainTab(tab);
  }, [handleCancelRoute, sanpoPosts]);



  const isTraditional = themeMode === "traditional";

  return (
    <UiLanguage.Provider value={language}><div
      data-theme={themeMode}
      className={`${isDark ? "dark" : ""} ${
        isTraditional ? "theme-traditional font-serif" : "font-sans"
      } fixed inset-0 h-[100dvh] w-screen overflow-hidden overscroll-none`}
    >
      <main className={`relative h-full w-full overflow-hidden transition-colors ${
        isTraditional
          ? isDark ? "bg-[#181512] text-amber-50" : "bg-[#f5f0e3] text-stone-900"
          : "bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50"
      }`}>
        {/* メイン高精細マップビューポート */}
        <MapViewport
          route={activeRoute}
          isDark={isDark}
          themeMode={themeMode}
          language={language}
          originLabel={origin}
          destinationLabel={destination}
          guideStepIndex={guideStepIndex}
          isRouteActive={isRouteActive}
          currentLocation={currentLocation}
          walkRealPost={mainTab === "sanpo" ? activeSanpoPost : (isRouteActive ? activeSanpoPost : null)}
          isUiHidden={isUiHidden}
          onRestoreUi={handleRestoreUi}
          onPinMoved={handlePinMoved}
          onRegisterMapActions={setMapActions}
          onAddWaypointFromSnap={handleAddWaypointFromSnap}
          onWalkToSpot={handleWalkToSpot}
          onPinCardOpenChange={setIsPinCardOpen}
          pinResetKey={pinResetKey}
          selectedPin={selectedPin}
          onSelectPin={setSelectedPin}
        />

        {/* 洗練されたミニマル・フローティングHUD（和風絵巻着せ替え対応） */}
        <FloatingHUD
          origin={origin}
          waypoints={waypoints}
          destination={destination}
          activeRoute={activeRoute}
          routeCandidates={allRoutes}
          activeRouteIndex={activeRouteIndex}
          isRouteActive={isRouteActive}
          isUiHidden={isUiHidden}
          isPinCardOpen={isPinCardOpen}
          selectedPin={selectedPin}
          onClosePinCard={() => setSelectedPin(null)}
          onWalkToSpot={handleWalkToSpot}
          onAddWaypointFromSnap={handleAddWaypointFromSnap}
          onGenerateLoopWalk={handleGenerateLoopWalk}
          onHideUi={() => setIsUiHidden(true)}
          onRestoreUi={handleRestoreUi}
          themeMode={themeMode}
          onChangeThemeMode={handleSelectThemeMode}
          language={language}
          onChangeLanguage={handleSelectLanguage}
          avoidSpots={avoidSpots}
          onChangeAvoidSpots={setAvoidSpots}
          customSystemPrompt={customSystemPrompt}
          onChangeCustomSystemPrompt={setCustomSystemPrompt}
          onSelectRouteIndex={handleSelectRouteIndex}
          onCancelRoute={handleCancelRoute}
          onResetNorth={() => mapActions?.resetNorth?.()}
          onRecenter={() => mapActions?.recenter?.()}
          isDark={isDark}
          guideStepIndex={guideStepIndex}
          autoPlayGuide={autoPlayGuide}
          isLoading={isLoading}
          realThinkingStage={realThinkingStage}
          analysisSummary={analysisSummary}
          onOpenInsight={setInsightTab}
          onChangeOrigin={setOrigin}
          onAddWaypoint={handleAddWaypoint}
          onChangeWaypoint={handleChangeWaypoint}
          onRemoveWaypoint={handleRemoveWaypoint}
          onClearWaypoints={handleClearWaypoints}
          onChangeDestination={setDestination}
          onSwapEndpoints={handleSwapEndpoints}
          onExploreNewRoute={handleExploreNewRoute}
          walkedSpotsCount={walkedSpots.length}
          onToggleTheme={() => setIsDark((d) => !d)}
          onStartGuide={handleStartGuide}
          onExitGuide={handleExitGuide}
          onPrevStep={handlePrevStep}
          onNextStep={handleNextStep}
          onToggleAutoPlay={handleToggleAutoPlay}
          onSubmitPrompt={handlePromptSubmit}
          mainTab={mainTab}
          onChangeMainTab={handleChangeMainTab}
          sanpoPosts={sanpoPosts}
          activeSanpoPost={activeSanpoPost}
          onSelectSanpoPost={setActiveSanpoPost}
          onWalkThisSanpoRoute={handleWalkThisSanpoRoute}
          onWalkThisSanpoRouteReversed={handleWalkThisSanpoRouteReversed}
          onToggleSanpoLike={handleToggleSanpoLike}
          onOpenCreateSanpo={() => {
            setDraftSanpoRoute(null);
            setSanpoModalInitialTab("create");
            setIsSanpoModalOpen(true);
          }}
          onOpenSanpoShare={() => {
            setDraftSanpoRoute(null);
            setSanpoModalInitialTab("feed");
            setIsSanpoModalOpen(true);
          }}
          onShareRoute={handleShareCurrentRoute}
          sanpoRouteCount={sanpoPosts.length}
          searchMatchInfo={sanpoSearchMatch}
          onClearSearchMatch={() => setSanpoSearchMatch(null)}
          routeError={routeError}
          onClearRouteError={() => setRouteError(null)}
        />

        {/* SANPOSHERE 写真散歩ルート共有モーダル */}
        {isSanpoModalOpen && (
          <SanpoShareModal
            isDark={isDark}
            themeMode={themeMode}
            posts={sanpoPosts}
            selectedPostId={activeSanpoPost?.id || null}
            initialTab={sanpoModalInitialTab}
            initialDraftRoute={draftSanpoRoute}
            activeRoute={activeRoute}
            origin={origin}
            destination={destination}
            onClose={() => {
              setIsSanpoModalOpen(false);
              setDraftSanpoRoute(null);
              if (!isRouteActive && mainTab !== "sanpo") {
                setActiveSanpoPost(null);
              }
            }}
            onSelectPost={(postId) => {
              const target = sanpoPosts.find((p) => p.id === postId);
              if (target) setActiveSanpoPost(target);
            }}
            onToggleLike={handleToggleSanpoLike}
            onWalkThisRoute={handleWalkThisSanpoRoute}
            onPublishRoute={handlePublishSanpoRoute}
            onAddWaypointFromSnap={handleAddWaypointFromSnap}
            onWalkToSpot={handleWalkToSpot}
          />
        )}

        {/* AIの回答解説 / Googleマップ標準ルートとの詳細比較モーダル */}
        {insightTab && (
          <RouteInsightModal
            key={insightTab}
            isDark={isDark}
            themeMode={themeMode}
            answer={agentAnswer}
            route={activeRoute}
            userPrompt={lastSearchPrompt}
            initialTab={insightTab}
            onClose={() => setInsightTab(null)}
          />
        )}
      </main>
    </div></UiLanguage.Provider>
  );
}

export default App;
