import { WalkRealRoutePost } from "@/types/walkreal";

export interface SanpoSearchResult {
  post: WalkRealRoutePost;
  score: number; // 0 - 100
  matchedReasons: string[];
}

/**
 * 散歩コースの自然言語・キーワードスコアリング検索
 * ユーザーの希望（「カフェ巡り」「静かな路地」「代官山周辺」「短め」など）と
 * 散歩コースのタイトル、概要、タグ、エリア、写真スポット名、所要時間等を照合してスコアリング
 */
export function scoreSanpoPosts(
  query: string,
  posts: WalkRealRoutePost[]
): SanpoSearchResult[] {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) {
    return posts.map((post) => ({
      post,
      score: 100,
      matchedReasons: [],
    }));
  }

  // 検索語句を単語単位に分割
  const rawTerms = normalizedQuery.split(/[\s,、・+＋]+/g).filter((t) => t.length > 0);
  const terms = Array.from(new Set([normalizedQuery, ...rawTerms]));

  const results: SanpoSearchResult[] = posts.map((post) => {
    let rawScore = 0;
    const reasons: string[] = [];

    const titleLower = post.title.toLowerCase();
    const summaryLower = post.summary.toLowerCase();
    const areaLower = post.areaLabel.toLowerCase();
    const tagsLower = post.tags.map((t) => t.toLowerCase());
    const authorBadgeLower = (post.authorBadge || "").toLowerCase();
    const snapNames = post.snaps.map((s) => s.spotName.toLowerCase()).join(" ");
    const snapCaptions = post.snaps.map((s) => s.caption.toLowerCase()).join(" ");

    for (const term of terms) {
      if (term.length === 0) continue;

      // 1. コース名・タイトル一致
      if (titleLower.includes(term)) {
        rawScore += 35;
        reasons.push(`コース名「${term}」`);
      }

      // 2. タグ一致
      const matchedTag = post.tags.find((t) => t.toLowerCase().includes(term));
      if (matchedTag) {
        rawScore += 30;
        reasons.push(`タグ「#${matchedTag}」`);
      }

      // 3. エリア・地域名一致
      if (areaLower.includes(term)) {
        rawScore += 25;
        reasons.push(`エリア「${post.areaLabel}」`);
      }

      // 4. 写真スポット名一致
      if (snapNames.includes(term)) {
        rawScore += 20;
        reasons.push(`スポット名`);
      }

      // 5. 概要・キャプション一致
      if (summaryLower.includes(term) || snapCaptions.includes(term)) {
        rawScore += 15;
        reasons.push(`説明文`);
      }

      // 6. バッジ・属性一致
      if (authorBadgeLower.includes(term)) {
        rawScore += 15;
        reasons.push(`特徴「${post.authorBadge}」`);
      }
    }

    // 意図判定（短い、長い、平坦、写真、人気など）
    if (/短|すぐ|サクッ|近/i.test(normalizedQuery) && (post.durationMin <= 30 || post.distanceKm <= 2.5)) {
      rawScore += 20;
      reasons.push(`手軽な短距離（${post.distanceKm}km / ${post.durationMin}分）`);
    }
    if (/長|がっつり|遠/i.test(normalizedQuery) && (post.durationMin >= 45 || post.distanceKm >= 3.5)) {
      rawScore += 20;
      reasons.push(`じっくりロング散歩`);
    }
    if (/平坦|坂.*(なし|ない|避け)/i.test(normalizedQuery) && post.elevationGainM <= 10) {
      rawScore += 20;
      reasons.push(`平坦で歩きやすい`);
    }
    if (/写真|映え|絶景|スポット/i.test(normalizedQuery) && post.snaps.length >= 3) {
      rawScore += 15;
      reasons.push(`写真スポット豊富（${post.snaps.length}枚）`);
    }
    if (/人気|おすすめ|いいね/i.test(normalizedQuery) && post.likesCount > 0) {
      rawScore += Math.min(20, post.likesCount * 3);
      reasons.push(`高評価（${post.likesCount}いいね）`);
    }

    const uniqueReasons = Array.from(new Set(reasons));
    // 0点以外は最低55%〜最大99%にスケーリングして分かりやすく表示
    const finalScore = rawScore > 0 ? Math.min(99, Math.round(55 + Math.min(44, rawScore * 0.7))) : 0;

    return {
      post,
      score: finalScore,
      matchedReasons: uniqueReasons,
    };
  });

  return results.sort((a, b) => b.score - a.score);
}
