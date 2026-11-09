import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../src/services/sanpoStorage.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exported = {};
new Function('exports', code)(exported);
const { serializeSanpoPost, deserializeSanpoPost } = exported;
const now = Date.now();
const timestamp = ms => ({ toMillis: () => ms });
const base = { id: 'test', pathXY: [[1, 2], [3, 4]], ownerUid: 'owner', likedByMe: true, walkedByMe: true,
  createdAt: timestamp(now - 3600000), updatedAt: timestamp(now), expiresAt: timestamp(now + 86400000),
  ttlDaysRemaining: 999, createdAtLabel: 'fake' };
const stored = serializeSanpoPost(base, new Date(now).toISOString());
assert.deepEqual(stored.pathXY, [{ x: 1, y: 2 }, { x: 3, y: 4 }]);
const post = deserializeSanpoPost(stored, 'test');
assert.deepEqual(post.pathXY, base.pathXY);
assert.equal(post.ownerUid, 'owner');
assert.equal(post.ttlDaysRemaining, 1);
assert.equal(post.createdAtLabel, '1時間前');
assert.equal(post.likedByMe, false);
assert.equal(post.walkedByMe, false);
assert.equal(post.synced, true);
const expired = deserializeSanpoPost({ ...stored, expiresAt: timestamp(now - 1) }, 'test');
assert.equal(expired.ttlDaysRemaining, 0);
const legacy = deserializeSanpoPost({ pathXY: base.pathXY, serverCreatedAt: new Date(now - 15 * 86400000).toISOString() }, 'legacy');
assert.equal(legacy.ttlDaysRemaining, 0);
assert.equal(legacy.ownerUid, undefined);
assert.throws(() => deserializeSanpoPost({ pathXY: [{ x: 'bad', y: 1 }] }, 'bad'));
console.log('PASS: timestamp-derived age/expiry, legacy expiry, private flags reset, geometry round trip');

const geometrySource = fs.readFileSync(new URL('../src/services/sanpoGeometry.ts', import.meta.url), 'utf8');
const geometryCode = ts.transpileModule(geometrySource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const geometry = {};
new Function('exports', geometryCode)(geometry);
const stops = geometry.getSanpoRouteStops({
  snaps: [{ spotName: '掲載写真A', lat: 35.1, lng: 139, caption: '' }, { spotName: '掲載写真B', lat: 35.2, lng: 139, caption: '' }],
  photoPoints: [{ lat: 35, lng: 139, capturedAt: '' }, { lat: 35.1, lng: 139, capturedAt: '' }, { lat: 35.2, lng: 139, capturedAt: '' }, { lat: 35.3, lng: 139, capturedAt: '' }],
});
assert.equal(stops[0].lat, 35);
assert.equal(stops.at(-1).lat, 35.3);
assert.deepEqual(stops.slice(1, -1).map(s => s.name), ['掲載写真A', '掲載写真B']);
console.log('PASS: unselected start/end photos retain actual route endpoints');
