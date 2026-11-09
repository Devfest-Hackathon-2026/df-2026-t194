import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInAnonymously, setPersistence, browserLocalPersistence } from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
  increment,
  serverTimestamp,
  Timestamp,
  query,
  orderBy,
  limit,
  onSnapshot,
  Firestore,
} from "firebase/firestore";
import { WalkRealRoutePost } from "@/types/walkreal";
import { INITIAL_WALKREAL_POSTS } from "@/data/walkrealData";
import { serializeSanpoPost, deserializeSanpoPost } from "@/services/sanpoStorage";

// Firebase 設定
// プロジェクト: learned-now-513800-i6
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "learned-now-513800-i6.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "learned-now-513800-i6",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "learned-now-513800-i6.firebasestorage.app",
};

let dbInstance: Firestore | null = null;

let connectionPromise: Promise<Firestore | null> | null = null;

export function getSanpoDb(): Promise<Firestore | null> {
  if (!connectionPromise) connectionPromise = connectSanpoDb();
  return connectionPromise;
}

let cachedIdentityUid: string | null = null;
let identityPromise: Promise<string> | null = null;
export function getSanpoIdentitySync(): string | null {
  return cachedIdentityUid;
}
export function getSanpoIdentity(): Promise<string> {
  if (cachedIdentityUid) return Promise.resolve(cachedIdentityUid);
  if (!identityPromise) identityPromise = (async () => {
    const db = await getSanpoDb();
    if (!db) throw new Error("Firebaseに接続できません。");
    const auth = getAuth(db.app);
    await setPersistence(auth, browserLocalPersistence);
    await auth.authStateReady();
    const uid = (auth.currentUser ?? (await signInAnonymously(auth)).user).uid;
    cachedIdentityUid = uid;
    return uid;
  })().catch(error => {
    identityPromise = null;
    const code = (error as { code?: string }).code;
    if (code === "auth/configuration-not-found") {
      throw new Error(`投稿先の認証設定がありません。Firebase Consoleの「${firebaseConfig.projectId}」→ Authentication →「始める」で初期設定し、ログイン方法の「匿名」を有効にしてください。`);
    }
    if (code === "auth/operation-not-allowed" || code === "auth/admin-restricted-operation") {
      throw new Error("匿名認証が無効になっています。Firebase Console → Authentication → ログイン方法 → 匿名を有効にしてください。");
    }
    if (code?.includes("requests-to-this-api") || code === "auth/api-key-service-blocked") {
      throw new Error("共有機能の認証APIがAPIキーの制限でブロックされています。Firebase専用キーとIdentity Toolkit API・Token Service APIの許可設定を確認してください。");
    }
    throw new Error(`このブラウザの認証に失敗しました。通信状態とFirebaseの認証設定を確認してください。${code ? ` (${code})` : ""}`);
  });
  return identityPromise;
}

const reactionCache = new Map<string, { liked: boolean; walked: boolean; likesCount?: number; walkedCount?: number }>();
async function personalState(db: Firestore, id: string, uid: string, likesCount: number, walkedCount: number) {
  const key = `${uid}/${id}`;
  const cached = reactionCache.get(key);
  if (!cached || cached.likesCount !== likesCount || cached.walkedCount !== walkedCount) {
    const [like, walk] = await Promise.all([getDoc(doc(db, COLLECTION_NAME, id, "likes", uid)), getDoc(doc(db, COLLECTION_NAME, id, "walks", uid))]);
    reactionCache.set(key, { liked: like.exists(), walked: walk.exists(), likesCount, walkedCount });
  }
  return reactionCache.get(key)!;
}

async function connectSanpoDb(): Promise<Firestore | null> {
  try {
    if (dbInstance) return dbInstance;
    let resolvedConfig = firebaseConfig;
    // Firebase Hosting provides the Web config for the deployed project, including its Firebase API key.
    if (!import.meta.env.VITE_FIREBASE_API_KEY) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch("/__/firebase/init.json", { signal: controller.signal });
        if (response.ok) {
          const hosted = await response.json();
          if (hosted.projectId === firebaseConfig.projectId && typeof hosted.apiKey === "string") {
            resolvedConfig = { ...firebaseConfig, ...hosted };
          }
        }
      } catch {
        // Local Vite development uses explicitly configured environment values.
      } finally {
        clearTimeout(timer);
      }
    }
    if (!resolvedConfig.apiKey) {
      throw new Error("Firebase専用のAPIキーが未設定です。VITE_FIREBASE_API_KEYを設定してください。Maps用キーは認証に利用できません。");
    }
    const app = getApps().find(candidate => candidate.name === "sanpo-share")
      || initializeApp(resolvedConfig, "sanpo-share");
    dbInstance = getFirestore(app);
    return dbInstance;
  } catch (err) {
    console.warn("[SanpoFirebase] Firebase initialization skipped or failed:", err);
    return null;
  }
}

const COLLECTION_NAME = "sanpo_routes";
const LOCAL_STORAGE_KEY = "sanposhere_custom_posts";

// ローカルキャッシュからカスタム投稿を取得（以前のデモ投稿 wr- は除外）
export function getLocalCustomPosts(): WalkRealRoutePost[] {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed)
      ? parsed.filter((p: WalkRealRoutePost) => p && !p.id.startsWith("wr-"))
      : [];
  } catch {
    return [];
  }
}

// ローカルキャッシュにカスタム投稿を保存
export function saveLocalCustomPost(post: WalkRealRoutePost) {
  try {
    const list = getLocalCustomPosts();
    const updated = [post, ...list.filter((p) => p.id !== post.id)];
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

/**
 * 散歩ルート一覧をリアルタイム購読（他人の投稿も即座にアプリ内に届く）
 */
export function subscribeToSanpoRoutes(onUpdate: (posts: WalkRealRoutePost[]) => void): () => void {
  let disposed = false;
  let stopRemote: (() => void) | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let version = 0;
  void (async () => {
    const db = await getSanpoDb();
    if (disposed) return;
    if (!db) { onUpdate(getLocalCustomPosts()); return; }
    let uid: string | undefined;
    try { uid = await getSanpoIdentity(); } catch (error) { console.warn(error); }
    if (disposed) return;
    const q = query(collection(db, COLLECTION_NAME), orderBy("serverCreatedAt", "desc"), limit(50));
    let latest: WalkRealRoutePost[] = [];
    const emit = () => {
      if (!disposed) onUpdate(latest.filter(p => !p.expiresAtMs || p.expiresAtMs > Date.now()).map(p => {
        const state = uid ? reactionCache.get(`${uid}/${p.id}`) : undefined;
        const personal = state ? { likedByMe: state.liked, walkedByMe: state.walked } : {};
        const remaining = p.expiresAtMs ? Math.max(0, Math.ceil((p.expiresAtMs - Date.now()) / 86400000)) : p.ttlDaysRemaining;
        const age = p.createdAtMs ? Math.max(0, Date.now() - p.createdAtMs) : 0;
        return { ...p, ...personal, ttlDaysRemaining: remaining, isExpiringSoon: remaining <= 3,
          createdAtLabel: age < 3600000 ? `${Math.floor(age / 60000)}分前` : age < 86400000 ? `${Math.floor(age / 3600000)}時間前` : `${Math.floor(age / 86400000)}日前` };
      }));
    };
    const refreshPersonal = () => {
      latest = latest.map(post => {
        const state = uid ? reactionCache.get(`${uid}/${post.id}`) : undefined;
        return state ? { ...post, likedByMe: state.liked, walkedByMe: state.walked } : post;
      }); emit();
    };
    window.addEventListener("sanpo-personal-state", refreshPersonal);
    const stopSnapshot = onSnapshot(q, snapshot => {
      const current = ++version;
      void Promise.all(snapshot.docs.filter(d => !d.id.startsWith("wr-")).map(async item => {
        try {
          const post = deserializeSanpoPost(item.data(), item.id);
          if (uid) {
            const state = await personalState(db, item.id, uid, post.likesCount, post.walkedCount);
            post.likedByMe = state.liked; post.walkedByMe = state.walked;
          }
          return post;
        } catch (error) { console.warn("Invalid shared route", error); return null; }
      })).then(posts => {
        if (disposed || current !== version) return;
        const remote = posts.filter((p): p is WalkRealRoutePost => p !== null);
        const ids = new Set(remote.map(p => p.id));
        // Confirmed cloud posts must not reappear from a stale local cache after deletion.
        latest = [...remote, ...getLocalCustomPosts().filter(p => !p.synced && !ids.has(p.id))].sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
        emit();
      });
    }, error => { console.warn(error); if (!disposed) onUpdate(getLocalCustomPosts()); });
    stopRemote = () => { stopSnapshot(); window.removeEventListener("sanpo-personal-state", refreshPersonal); };
    timer = setInterval(emit, 60000);
  })();
  return () => { disposed = true; version++; stopRemote?.(); if (timer) clearInterval(timer); };
}

/**
 * 新しい散歩ルートを Firestore に公開（他人のスマホの「みんなの散歩」に即時反映）
 */
export async function publishSanpoRouteToFirestore(
  post: WalkRealRoutePost
): Promise<void> {
  const db = await getSanpoDb();
  if (!db) throw new Error("Firebaseの接続設定がありません。Firebase Web設定を確認してください。");

  try {
    const ownerUid = await getSanpoIdentity();
    const createdAtMs = Date.now();
    const expiresAtMs = createdAtMs + 14 * 86400000;
    Object.assign(post, { ownerUid, createdAtMs, expiresAtMs,
      likesCount: 0, walkedCount: 0, walkedThisWeek: 0, likedByMe: false, walkedByMe: false });
    const stored = serializeSanpoPost(post, new Date(createdAtMs).toISOString());
    const { createdAtMs: _created, expiresAtMs: _expires, updatedAtMs: _updated, synced: _synced, ...fields } = stored;
    const docRef = doc(db, COLLECTION_NAME, post.id);
    // Firestoreに書き込み
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        setDoc(docRef, { ...fields, ownerUid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(expiresAtMs) }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("クラウドへの保存完了を確認できませんでした。通信状態を確認してください。")), 20000);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    post.synced = true;
    saveLocalCustomPost(post);
  } catch (err) {
    console.warn("[SanpoFirebase] Failed to write route to Firestore:", err);
    const code = (err as { code?: string }).code || "";
    const message = err instanceof Error ? err.message : String(err);
    if (/SERVICE_DISABLED|firestore.*(?:disabled|has not been used)/i.test(message)) {
      throw new Error("接続先のCloud Firestore APIが有効になっていません。APIを有効化してから再投稿してください。");
    }
    if (code.includes("not-found") || /database.*does not exist/i.test(message)) {
      throw new Error("投稿先のFirestoreデータベースがありません。Firebaseで(default)データベースを作成してください。");
    }
    if (code.includes("permission-denied")) {
      throw new Error("投稿がFirestoreに拒否されました。公開済みのFirestoreルールと投稿データの制限を確認してください。");
    }
    throw err instanceof Error ? err : new Error("クラウドへの投稿に失敗しました。");
  }
}

/**
 * 散歩ルートの「いいね」を Firestore に反映
 */
async function updateReaction(postId: string, kind: "likes" | "walks", enabled: boolean): Promise<void> {
  const db = await getSanpoDb();
  if (!db) throw new Error("Firebaseに接続できません。");
  const uid = await getSanpoIdentity();
  const parent = doc(db, COLLECTION_NAME, postId);
  const record = doc(db, COLLECTION_NAME, postId, kind, uid);
  await runTransaction(db, async transaction => {
    const [post, existing] = await Promise.all([transaction.get(parent), transaction.get(record)]);
    if (!post.exists()) throw new Error("投稿が削除されています。");
    if (existing.exists() === enabled) return;
    if (enabled) transaction.set(record, { createdAt: serverTimestamp() });
    else transaction.delete(record);
    const field = kind === "likes" ? "likesCount" : "walkedCount";
    transaction.update(parent, { [field]: increment(enabled ? 1 : -1) });
  });
  const key = `${uid}/${postId}`;
  const state = reactionCache.get(key) ?? { liked: false, walked: false };
  reactionCache.set(key, { ...state, [kind === "likes" ? "liked" : "walked"]: enabled });
  // Reload listeners after the authoritative per-user state has been updated.
  window.dispatchEvent(new Event("sanpo-personal-state"));
}
export async function toggleSanpoLikeInFirestore(postId: string, liked: boolean): Promise<void> {
  return updateReaction(postId, "likes", liked);
}
export async function incrementWalkedCountInFirestore(postId: string): Promise<void> {
  return updateReaction(postId, "walks", true);
}
export async function editSanpoRoute(postId: string, title: string, summary: string): Promise<void> {
  const db = await getSanpoDb();
  if (!db) throw new Error("Firebaseに接続できません。");
  await getSanpoIdentity();
  const cleanTitle = title.trim();
  if (!cleanTitle || cleanTitle.length > 100 || summary.length > 1000) throw new Error("タイトルは1〜100文字、説明は1000文字以内で入力してください。");
  await updateDoc(doc(db, COLLECTION_NAME, postId), { title: cleanTitle, summary, updatedAt: serverTimestamp() });
  const local = getLocalCustomPosts().find(p => p.id === postId);
  if (local) saveLocalCustomPost({ ...local, title: cleanTitle, summary });
}
export async function deleteSanpoRoute(postId: string): Promise<void> {
  const db = await getSanpoDb();
  if (!db) throw new Error("Firebaseに接続できません。");
  await getSanpoIdentity();
  await deleteDoc(doc(db, COLLECTION_NAME, postId));
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(getLocalCustomPosts().filter(p => p.id !== postId)));
}

/**
 * 特定の散歩ルートを ID で取得（URL ?walk=xxx で開かれた時用）
 */
export async function fetchSanpoRouteById(
  postId: string
): Promise<WalkRealRoutePost | null> {
  // 1. まずプリセットから探す
  const preset = INITIAL_WALKREAL_POSTS.find((p) => p.id === postId);
  if (preset) return preset;

  const local = getLocalCustomPosts().find(p => p.id === postId);
  const visible = (post: WalkRealRoutePost | null) => post && (!post.expiresAtMs || post.expiresAtMs > Date.now()) ? post : null;
  const db = await getSanpoDb();
  if (!db) return visible(local ?? null);
  try {
    const snap = await getDoc(doc(db, COLLECTION_NAME, postId));
    if (!snap.exists()) return visible(local && !local.synced ? local : null);
    return visible(deserializeSanpoPost(snap.data(), snap.id));
  } catch (err) {
    console.warn("[SanpoFirebase] Failed to fetch route by id:", err);
    return visible(local ?? null);
  }
}

/**
 * 写真アップロード時の自動リサイズ・圧縮（Firestoreの1MB上限と通信速度を最適化）
 */
function compressRasterImageForSanpo(
  file: File,
  maxWidth = 800,
  quality = 0.78
): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > height && width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else if (height > maxWidth) {
          width = Math.round((width * maxWidth) / height);
          height = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          let encoded = canvas.toDataURL("image/webp", quality);
          for (let attempt = 0; encoded.length > 110000 && attempt < 6; attempt += 1) {
            width = Math.max(160, Math.round(width * 0.8));
            height = Math.max(100, Math.round(height * 0.8));
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            encoded = canvas.toDataURL("image/webp", Math.max(0.45, quality - attempt * 0.06));
          }
          resolve(encoded.length <= 110000 ? encoded : "");
        } else {
          resolve("");
        }
      };
      img.onerror = () => resolve("");
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}


export async function compressImageForSanpo(file: File, maxWidth = 800, quality = 0.78): Promise<string> {
  const native = await compressRasterImageForSanpo(file, maxWidth, quality);
  if (native) return native;
  // Only download the decoder when the browser cannot display a HEIC/HEIF image.
  if (!/\.(heic|heif)$/i.test(file.name) && !/^image\/hei[cf]/i.test(file.type)) return "";
  try {
    const { default: heic2any } = await import("heic2any");
    const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
    const blob = Array.isArray(result) ? result[0] : result;
    return await compressRasterImageForSanpo(new File([blob], "converted.jpg", { type: "image/jpeg" }), maxWidth, quality);
  } catch { return ""; }
}
