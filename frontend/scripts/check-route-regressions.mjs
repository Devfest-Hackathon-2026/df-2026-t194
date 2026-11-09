import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const root = path.resolve(new URL('../src', import.meta.url).pathname);
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const code = ts.transpileModule(fs.readFileSync(file,'utf8').replaceAll('import.meta','({env:{}})'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const exports={}; cache.set(file,exports);
  new Function('require','exports',code)(name=> {
    if (name==='./messages.json') return JSON.parse(fs.readFileSync(path.join(root,'i18n/messages.json')));
    if (name.startsWith('@/')) return load(path.join(root,name.slice(2))+'.tsx');
    return require(name);
  },exports);
  return exports;
}
const React=require('react'), {renderToStaticMarkup}=require('react-dom/server');
const {UiLanguage,UiText}=load(path.join(root,'i18n/ui.tsx'));
for(const [language,expected] of [['ja','編集'],['en','Edit'],['zh','编辑']]) {
  const html=renderToStaticMarkup(React.createElement(UiLanguage.Provider,{value:language},React.createElement(UiText,{text:'編集'})));
  assert.equal(html,expected);
}
console.log('PASS: shared labels switch ja → en → zh without remounting the app or rerouting');
const {presentRoute}=load(path.join(root,'services/routePresentation.ts'));
const make=(id,seconds,count)=>({id,apiData:{route_id:id,waypoints:[],tags:[],metrics:{duration_seconds:seconds,distance_meters:1000,path:[{lat:36.7,lng:137.2},{lat:36.71,lng:137.2}],score_reasons:[],elevation_gain_meters:0},street_view_observations:Array.from({length:count},()=>({sidewalk:'visible',road_width:'normal',confidence:0.95}))}});
const a=make('short',900,1),b=make('long',1200,3),peers=[a,b];
const ja=presentRoute(b,peers,'歩道を優先','ja');
assert.match(ja.apiData.concept,/3\/3/); assert.match(ja.apiData.concept,/5分長く/);
assert.notEqual(ja.apiData.concept,presentRoute(a,peers,'歩道を優先','ja').apiData.concept);
const en=presentRoute(b,peers,'歩道を優先','en');
assert.match(en.apiData.concept,/Sidewalks/);assert(!/[ぁ-んァ-ン]/.test(en.apiData.concept));
assert.equal(en.apiData.metrics.path,b.apiData.metrics.path);
const zh=presentRoute(b,peers,'歩道を優先','zh');assert.match(zh.apiData.concept,/人行道/);
assert.notEqual(ja.apiData.concept,en.apiData.concept);
console.log('PASS: different routes get different, localized tradeoff explanations while geometry is unchanged');
const style=load(path.join(root,'data/modernMapStyles.ts')).modernDarkMapStyle;
assert.equal(style.find(s=>s.elementType==='labels.icon').stylers[0].visibility,'on');
console.log('PASS: dark map style preserves native facility icons');

const uploadSource=fs.readFileSync(path.join(root,'components/SanpoShareModal.tsx'),'utf8');
const uploadTree=ts.createSourceFile('SanpoShareModal.tsx',uploadSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let originalInput;
function findInput(node){
  if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(uploadTree)==='input'&&node.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(uploadTree)==='id'&&p.initializer?.text==='sanpo-original-files')) originalInput=node;
  ts.forEachChild(node,findInput);
}
findInput(uploadTree);
assert.ok(originalInput,'original-file chooser exists');
const attributes=originalInput.attributes.properties.map(p=>p.name?.getText(uploadTree));
assert(!attributes.includes('accept'),'image-only filters must not route originals through a photo provider');
assert(!attributes.includes('capture'),'camera capture must not replace original-file selection');
assert(uploadSource.indexOf('inspectPhotoMetadata(file)')<uploadSource.indexOf('compressImageForSanpo(file)'),'extract GPS from original before compression');
console.log('PASS: generic file chooser retains original-file path; GPS extraction precedes compression');

const roleRoute=make('gentle',5400,3);
roleRoute.apiData.selection_role='gentle';
Object.assign(roleRoute.apiData.metrics,{max_sampled_uphill_grade_percent:5.2,max_sampled_downhill_grade_percent:3,elevation_profile_meters:[0,1,2],extra_duration_seconds:3600});
const roleView=presentRoute(roleRoute,[roleRoute],'坂を避けて','ja');
assert.match(roleView.apiData.title,/坂の負担/);
assert.match(roleView.apiData.concept,/60分/);
assert.match(roleView.apiData.concept,/1〜4%/);
assert.match(roleView.apiData.concept,/確認できず/);
roleRoute.apiData.selection_role='shortest';
assert.match(presentRoute(roleRoute,[roleRoute],'坂を避けて','ja').apiData.concept,/坂を避けられるという意味ではありません/);
console.log('PASS: slope roles describe distinct goals, preserve server time differences and disclose unmet gentle-grade target');

const unsupported=make('unsupported',900,1);
unsupported.apiData.metrics.unverified_preferences=['rain_shelter','pollen','current_shade'];
for (const [lang,pattern] of [['ja',/未対応/],['en',/unsupported/],['zh',/暂不支持/]]) {
  const view=presentRoute(unsupported,[unsupported],'雨よけ',''+lang);
  assert.match(view.apiData.concept,pattern);
  assert.equal(view.apiData.metrics.path,unsupported.apiData.metrics.path);
}
const {retainVerifiedStops}=load(path.join(root,'services/routeRefinement.ts'));
const entries=[{name:'manual pin',location:{lat:36.7,lng:137.2}}];
const refined=retainVerifiedStops(entries,[{name:'cafe',lat:36.71,lng:137.21,place_verified:true},{name:'guessed park',lat:36.72,lng:137.22},{name:'manual pin',lat:0,lng:0,place_verified:true}]);
assert.deepEqual(refined.map(e=>e.name),['manual pin','cafe']);
assert.deepEqual(refined[1].location,{lat:36.71,lng:137.21});
assert.equal(entries.length,1);
console.log('PASS: unsupported preferences are disclosed in all 3 languages; refinements retain verified facilities without moving manual pins');
const {ElevationProfile}=load(path.join(root,'components/ElevationProfile.tsx'));
const noElevation=renderToStaticMarkup(React.createElement(ElevationProfile,{route:{id:'rain',elevProfile:[10,20],distanceText:'3km'},isDark:false}));
assert(!noElevation.includes('<svg'));
assert(!noElevation.includes('88%'));
console.log('PASS: legacy route IDs and local profile arrays cannot display fabricated coverage or elevation charts');
const {loopOrigin}=load(path.join(root,'services/routeRefinement.ts'));
assert.equal(loopOrigin('富山駅から30分で戻る散歩。追加で歩道を優先','現在地'),'富山駅');
assert.equal(loopOrigin('30分散歩したい','現在地'),'現在地');
console.log('PASS: an explicit loop origin overrides the default current-location field');
const alternative=make('alternative',3200,2);
alternative.apiData.selection_role='alternative';
Object.assign(alternative.apiData.metrics,{max_sampled_uphill_grade_percent:21,max_sampled_downhill_grade_percent:9.5,elevation_profile_meters:[0,10,30],extra_duration_seconds:800});
for (const [lang,pattern] of [['ja',/坂の負担が減ると確認できた案ではなく/],['en',/Reduced hill effort is unverified/],['zh',/尚未确认坡道负担降低/]]) {
  const view=presentRoute(alternative,[a,alternative],'坂を避けて',lang);
  assert.match(view.apiData.concept,pattern);
  assert.equal(view.apiData.metrics.path,alternative.apiData.metrics.path);
}
console.log('PASS: a distinct comparison route never claims verified hill reduction in ja/en/zh');
const missingMarket=make('missing-market',900,1);
missingMarket.apiData.metrics.unverified_preferences=['supermarket'];
assert.match(presentRoute(missingMarket,[missingMarket],'スーパーに寄って','ja').apiData.concept,/スーパー.*未確認/);
assert.match(presentRoute(missingMarket,[missingMarket],'スーパーに寄って','en').apiData.concept,/supermarket.*unverified/);
assert.match(presentRoute(missingMarket,[missingMarket],'スーパーに寄って','zh').apiData.concept,/超市/);
console.log('PASS: unfulfilled supermarket stops are disclosed in all three languages');
