// Local emulator only. Verifies the public schema, ownership and atomic reaction records.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, setDoc, getDocFromServer, deleteDoc, doc, terminate,
  setLogLevel, updateDoc, serverTimestamp, Timestamp, runTransaction, writeBatch, increment } from 'firebase/firestore';
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error('Set FIRESTORE_EMULATOR_HOST to a local emulator. Never run against production.');
const project = 'demo-sanpo-rules-test';
const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const response = await fetch(`http://${host}/emulator/v1/projects/${project}:securityRules`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }),
});
assert(response.ok, await response.text());
setLogLevel('silent');
const clients = [];
function client(uid) {
  const app = initializeApp({ projectId: project, apiKey: 'emulator-only' }, uid || 'guest');
  const db = getFirestore(app);
  const [hostname, port] = host.split(':');
  connectFirestoreEmulator(db, hostname, Number(port), uid ? { mockUserToken: { sub: uid } } : undefined);
  clients.push({ app, db }); return db;
}
const owner = client('owner'), other = client('other'), guest = client();
const denied = action => assert.rejects(action, error => error.code === 'permission-denied');
function fixture(count) {
  return {
    id: `walk_check_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    authorName: 'Rules check', authorHandle: '@check', authorAvatar: '', authorBadge: '',
    scope: 'global', circleName: '', createdAtLabel: 'now', daysElapsed: 0,
    title: 'Emulator check', summary: '', areaLabel: '', tags: [], color: '#4285F4',
    snaps: Array.from({ length: count }, (_, i) => ({
      id: `photo_${i}`, order: i + 1, timestamp: '12:00', capturedAt: '2026-01-01T12:00:00', gpsSource: 'exif',
      spotName: 'Photo point', caption: '', x: 40, y: 40, lat: 35, lng: 139,
      mainImageUrl: 'data:image/webp;base64,test', selfieImageUrl: '', selfieLabel: '', exifInfo: '', weatherTag: '',
    })),
    pathXY: [{ x: 40, y: 40 }, { x: 50, y: 50 }], pathGeo: [{ lat: 35, lng: 139 }, { lat: 35.001, lng: 139 }],
    encodedPolyline: 'encoded-route', distanceKm: 0.1, durationMin: 2, elevationGainM: 0,
    likesCount: 0, likedByMe: false, walkedCount: 0, walkedThisWeek: 0, walkedByMe: false,
    reactions: [], ttlDaysRemaining: 14, isExpiringSoon: false, serverCreatedAt: new Date().toISOString(),
  };
}
function newPost(count = 2) {
  return { ...fixture(count), photoPoints: Array.from({length: 100}, (_, i) => ({lat: 35+i/10000, lng:139, capturedAt: ''})), ownerUid: 'owner', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 14 * 86400000) };
}
async function reaction(db, id, uid, kind, enabled = true) {
  const parent = doc(db, 'sanpo_routes', id), record = doc(parent, kind, uid);
  await runTransaction(db, async tx => {
    const [post, existing] = await Promise.all([tx.get(parent), tx.get(record)]);
    if (existing.exists() === enabled) return;
    if (enabled) tx.set(record, { createdAt: serverTimestamp() }); else tx.delete(record);
    const field = kind === 'likes' ? 'likesCount' : 'walkedCount';
    tx.update(parent, { [field]: increment(enabled ? 1 : -1) });
  });
}
try {
  for (const count of [2, 4, 5]) {
    const post = newPost(count), ref = doc(owner, 'sanpo_routes', post.id);
    await setDoc(ref, post);
    assert((await getDocFromServer(ref)).exists());
    await deleteDoc(ref);
    console.log(`PASS: ${count} photos schema and owner deletion`);
  }
  const post = newPost(), ref = doc(owner, 'sanpo_routes', post.id);
  await denied(() => setDoc(doc(guest, 'sanpo_routes', post.id), post));
  await denied(() => setDoc(doc(other, 'sanpo_routes', post.id), post));
  await setDoc(ref, post);
  const created = (await getDocFromServer(ref)).data().createdAt.toMillis();
  await updateDoc(ref, { title: '編集したタイトル', summary: '編集した説明', updatedAt: serverTimestamp() });
  assert.equal((await getDocFromServer(ref)).data().createdAt.toMillis(), created);
  await denied(() => updateDoc(doc(other, 'sanpo_routes', post.id), { title: '他人の変更', updatedAt: serverTimestamp() }));
  await denied(() => deleteDoc(doc(other, 'sanpo_routes', post.id)));
  await denied(() => updateDoc(ref, { ownerUid: 'other' }));
  await denied(() => updateDoc(ref, { expiresAt: Timestamp.fromMillis(Date.now() + 30 * 86400000) }));
  await denied(() => updateDoc(ref, { createdAt: serverTimestamp() }));
  console.log('PASS: owner-only text edits; owner, creation time and expiry immutable');
  await denied(() => updateDoc(ref, { likesCount: 1 }));
  await denied(() => setDoc(doc(other, 'sanpo_routes', post.id, 'likes', 'other'), { createdAt: serverTimestamp() }));
  await reaction(other, post.id, 'other', 'likes');
  await reaction(other, post.id, 'other', 'likes');
  assert.equal((await getDocFromServer(ref)).data().likesCount, 1);
  await reaction(other, post.id, 'other', 'likes', false);
  await reaction(other, post.id, 'other', 'likes', false);
  assert.equal((await getDocFromServer(ref)).data().likesCount, 0);
  await reaction(other, post.id, 'other', 'walks');
  await reaction(other, post.id, 'other', 'walks');
  assert.equal((await getDocFromServer(ref)).data().walkedCount, 1);
  await denied(() => deleteDoc(doc(other, 'sanpo_routes', post.id, 'walks', 'other')));
  await denied(() => getDocFromServer(doc(owner, 'sanpo_routes', post.id, 'likes', 'other')));
  // A record for another UID must not authorize a counter increment.
  const badBatch = writeBatch(owner);
  badBatch.set(doc(owner, 'sanpo_routes', post.id, 'likes', 'other'), { createdAt: serverTimestamp() });
  badBatch.update(ref, { likesCount: 1 });
  await denied(() => badBatch.commit());
  console.log('PASS: atomic, idempotent likes/walks; forged counts and other-user records rejected');
  for (const [label, mutate] of [
    ['missing title', p => delete p.title], ['invalid caption type', p => p.snaps[0].caption = 1], ['missing GPS', p => delete p.snaps[0].lat],
    ['invalid GPS', p => p.snaps[0].lat = 91], ['oversized image', p => p.snaps[0].mainImageUrl = 'x'.repeat(120001)],
    ['initial fake likes', p => p.likesCount = 99], ['too many GPS points', p => p.photoPoints.push(p.photoPoints[0])],
  ]) {
    const invalid = newPost(); mutate(invalid);
    await denied(() => setDoc(doc(owner, 'sanpo_routes', invalid.id), invalid));
    console.log(`PASS: reject ${label}`);
  }
  await Promise.all([reaction(owner, post.id, 'owner', 'likes'), reaction(other, post.id, 'other', 'likes')]);
  assert.equal((await getDocFromServer(ref)).data().likesCount, 2);
  console.log('PASS: concurrent likes retain both users');
  await deleteDoc(ref);
  assert(!(await getDocFromServer(ref)).exists());
} finally {
  await Promise.all(clients.map(async ({app,db}) => { await terminate(db); await deleteApp(app); }));
}
