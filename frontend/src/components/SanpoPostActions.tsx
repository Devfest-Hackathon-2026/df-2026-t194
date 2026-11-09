import { UiText, useUiText } from "@/i18n/ui";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { WalkRealRoutePost } from "@/types/walkreal";
import { getSanpoIdentity, getSanpoIdentitySync, editSanpoRoute, deleteSanpoRoute, incrementWalkedCountInFirestore } from "@/services/sanpoFirebase";

export function SanpoPostActions({ post, currentUid }: { post: WalkRealRoutePost; currentUid?: string }) {
  const ui = useUiText();
  const [uid, setUid] = useState<string | undefined>(() => currentUid || getSanpoIdentitySync() || undefined);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmWalk, setConfirmWalk] = useState(false);
  const [title, setTitle] = useState(post.title);
  const [summary, setSummary] = useState(post.summary);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [walked, setWalked] = useState(post.walkedByMe);
  useEffect(() => {
    if (uid) return;
    let live = true;
    void getSanpoIdentity().then(id => { if (live) setUid(id); }).catch(() => {});
    return () => { live = false; };
  }, [uid]);
  useEffect(() => { setWalked(post.walkedByMe); }, [post.walkedByMe]);
  const own = !!uid && uid === post.ownerUid;
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await action(); setEditing(false); setConfirmDelete(false); setConfirmWalk(false); }
    catch (e) { setError(e instanceof Error ? e.message : "保存できませんでした。再試行してください。"); }
    finally { setBusy(false); }
  };
  return <div className="mt-1.5 text-[11px]" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
    <div className="flex flex-wrap gap-1.5 items-center">
      <span className="text-[10.5px] opacity-75 whitespace-nowrap">{post.walkedCount}<UiText text={"人が歩いた"} /></span>
      <button type="button" disabled={busy || walked} className="rounded-full border border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold whitespace-nowrap transition active:scale-95 disabled:opacity-50" onClick={() => setConfirmWalk(true)}>{walked ? <UiText text={"歩いた記録済み"} /> : <UiText text={"歩いたと記録"} />}</button>
      {own && <><button type="button" disabled={busy} className="rounded-full border border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold whitespace-nowrap transition active:scale-95" onClick={() => { setTitle(post.title); setSummary(post.summary); setEditing(!editing); setConfirmDelete(false); }}><UiText text={"編集"} /></button>
      <button type="button" disabled={busy} className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400 whitespace-nowrap transition active:scale-95" onClick={() => { setTitle(post.title); setSummary(post.summary); setConfirmDelete(true); setEditing(false); }}><UiText text={"削除"} /></button></>}
    </div>

    {(editing || confirmDelete || confirmWalk) && createPortal(
      <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4" onClick={e => e.stopPropagation()}>
        <section role="dialog" aria-modal="true" aria-label={editing ? ui(ui("散歩投稿を編集")) : confirmDelete ? ui(ui("散歩投稿を削除")) : ui(ui("歩いた記録"))} className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-5 text-zinc-900 shadow-xl">
          {editing ? <form className="space-y-3" onSubmit={e => { e.preventDefault(); void run(() => editSanpoRoute(post.id, title, summary)); }}>
            <h2 className="font-bold"><UiText text={"散歩投稿を編集"} /></h2>
            <label className="block"><UiText text={"タイトル"} /><input aria-label={ui(ui("投稿タイトル"))} required maxLength={100} value={title} onChange={e => setTitle(e.target.value)} className="block w-full rounded border p-2" autoFocus /></label>
            <label className="block"><UiText text={"説明"} /><textarea aria-label={ui(ui("投稿の説明"))} maxLength={1000} value={summary} onChange={e => setSummary(e.target.value)} className="block w-full rounded border p-2" rows={4} /></label>
            <p className="text-xs"><UiText text={"写真と経路、掲載期限は変更されません。"} /></p>
            <button type="submit" disabled={busy || !title.trim()} className="rounded border px-3 py-2">{busy ? <UiText text={"保存中…"} /> : <UiText text={"保存"} />}</button>
          </form> : confirmDelete ? <><h2 className="font-bold"><UiText text={"この投稿を削除しますか？"} /></h2><p className="my-3"><UiText text={"元に戻せません。"} /></p><button type="button" disabled={busy} className="rounded border px-3 py-2 text-red-600" onClick={() => void run(() => deleteSanpoRoute(post.id))}>{busy ? <UiText text={"削除中…"} /> : <UiText text={"削除する"} />}</button></>
          : <><h2 className="font-bold"><UiText text={"このコースを歩いた記録を残しますか？"} /></h2><p className="my-3 text-sm"><UiText text={"自己申告の記録です。GPSによる完歩確認は行っていません。"} /></p><button type="button" disabled={busy} className="rounded border px-3 py-2" onClick={() => void run(async () => { await incrementWalkedCountInFirestore(post.id); setWalked(true); })}>{busy ? <UiText text={"保存中…"} /> : <UiText text={"記録する"} />}</button></>}
          <button type="button" disabled={busy} className="mt-3 ml-2 rounded border px-3 py-2" onClick={() => { setEditing(false); setConfirmDelete(false); setConfirmWalk(false); setError(""); }}><UiText text={"キャンセル"} /></button>
          {error && <p role="alert" className="mt-2 text-red-600">{error}</p>}
        </section>
      </div>, document.body)}
    {error && <p role="alert" className="mt-2 text-red-600">{error}</p>}
  </div>;
}
