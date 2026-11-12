// 「背負い籠の商会」第3版（shokai/・重さは kg）の自動テスト。ブラウザなしで読み込み、仕組みとバランスを確かめる。
// 使い方： node tests/shokai_smoke.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..', 'shokai');
const FILES = ['js/data/config.js', 'js/data/goods.js', 'js/data/towns.js', 'js/data/carts.js', 'js/data/story.js', 'js/game.js'];
const KEY = 'shokai-save-v3';

let fails = 0;
function check(name, ok, detail) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? '  ' + detail : ''));
}
const realRandom = Math.random;
function withRandom(v, fn) { Math.random = typeof v === 'function' ? v : () => v; try { return fn(); } finally { Math.random = realRandom; } }
// 種から決まる乱数（同じ種なら毎回同じ結果になるので、バランスのテストがぶれない）
function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ブラウザのまねをする最小限の環境を作り、ゲームを読み込む
function boot(store) {
  store = store || {};
  const ctx2d = new Proxy({}, { get: (t, k) => (typeof k === 'string' ? () => {} : undefined), set: () => true });
  const mk = () => ({
    innerHTML: '', textContent: '', style: {}, dataset: {}, value: 0, width: 0, height: 0,
    classList: { add() {}, remove() {} },
    querySelectorAll(sel) {
      if (sel !== '[data-mi]') return [];
      this.btns = [...this.innerHTML.matchAll(/data-mi="(\d+)">([^<]*)/g)].map((m) => ({ dataset: { mi: m[1] }, label: m[2] }));
      return this.btns;
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 340, height: 357 }),
    clientWidth: 340, isConnected: true, getContext: () => ctx2d
  });
  const els = {};
  const e = { timers: [], rafs: [], els, store, click: null, t: 0, seen: {}, titles: {} };
  const win = {
    devicePixelRatio: 3, innerHeight: 844, scrollTo() {}, addEventListener() {},
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } },
    document: {
      querySelector: (s) => els[s] || (els[s] = mk()), querySelectorAll: () => [], createElement: () => mk(),
      addEventListener: (ev, fn) => { if (ev === 'click') e.click = fn; }
    },
    setTimeout: (f) => { e.timers.push(f); return e.timers.length; }, clearTimeout() {},
    requestAnimationFrame: (f) => { e.rafs.push(f); },
    console, Math, JSON, Object, Map, Set
  };
  win.window = win;
  vm.createContext(win);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), win, { filename: f });
  e.g = win.__shokai; e.D = win.SHOKAI; e.modal = win.document.querySelector('#modal'); e.main = win.document.querySelector('#main');
  e.act = (a, data) => e.click({ target: { closest: () => ({ dataset: Object.assign({ a }, data || {}), disabled: false }) } });
  e.open = () => !!(e.modal.innerHTML && e.modal.btns && e.modal.btns.length);
  e.text = () => e.modal.innerHTML.replace(/<[^>]+>/g, ' ');
  e.title = () => (e.modal.innerHTML.match(/<h2>([^<]*)/) || [])[1] || '';
  e.press = (idx) => {
    if (!e.open()) return false;
    const b = e.modal.btns[Math.min(idx || 0, e.modal.btns.length - 1)];
    const k = b.label.replace(/[0-9]+/g, 'N'); e.seen[k] = (e.seen[k] || 0) + 1;
    e.titles[e.title()] = 1;
    b.onclick(); return true;
  };
  e.pressLabel = (re) => {
    if (!e.open()) return false;
    const i = e.modal.btns.findIndex((b) => re.test(b.label));
    return i < 0 ? false : e.press(i);
  };
  e.drain = () => {
    for (let round = 0; round < 60; round++) {
      let n = 0;
      while (e.timers.length && n++ < 2000) e.timers.shift()();
      const fr = e.rafs.splice(0, e.rafs.length);
      for (const f of fr) { e.t += 400; f(e.t); }
      if (!e.timers.length && !e.rafs.length) break;
    }
  };
  // 破産の画面が出たら、押さずに止まる（押すと最初からになるため）
  e.bust = () => { if (e.open() && /💀/.test(e.title())) { if (e.died == null) { e.died = Math.floor(e.g.state.time / 4); e.paidAtDeath = e.g.state.loan.n; } return true; } return false; };
  e.closeAll = () => { let n = 0; while (e.open() && !e.bust() && n++ < 60) { e.press(0); e.drain(); } };
  e.travel = (rid, choose) => {
    e.act('go', { r: rid });
    let guard = 0;
    while (e.g.travel && guard++ < 200) {
      e.drain();
      if (e.bust()) break;
      if (e.g.travel && e.open()) { const re = choose && choose(e.text()); if (!re || !e.pressLabel(re)) e.press(0); }
    }
    e.drain();
    return !e.g.travel;
  };
  e.qty = (a, data, q) => {
    e.act(a, data);
    if (!e.open() || !/やめる/.test(e.modal.btns[0].label)) return false;
    if (q != null) { const r = e.els['#qR']; if (r && r.oninput) r.oninput({ target: { value: q } }); }
    e.press(1); return true;
  };
  return e;
}
const fresh = () => { const e = boot(); e.closeAll(); return e; };
// すべての町と道を知っている状態にする（仕組みを個別に確かめるとき用）
function knowAll(e) { const S = e.g.state; for (const t in e.D.TOWNS) { S.seen[t] = 2; S.named[t] = true; } for (const r in e.D.ROADS) S.roads[r] = true; }

// ---------- 1. データ ----------
function testData() {
  console.log('■ データ');
  const e = fresh(), D = e.D, towns = Object.keys(D.TOWNS), goods = Object.keys(D.GOODS);
  const kinds = towns.map((t) => D.TOWNS[t].kind), small = kinds.filter((k) => k === 'village' || k === 'town').length;
  console.log(`  町 ${towns.length} / 道 ${Object.keys(D.ROADS).length} / 品 ${goods.length} / 荷車 ${Object.keys(D.CARTS).length} / 物語の場面 ${Object.keys(D.STORY).length}`);
  check('村と町が6〜7、王都が1、港町が1', small >= 6 && small <= 7 && kinds.filter((k) => k === 'capital').length === 1 && kinds.filter((k) => k === 'port').length === 1);
  const bad = [];
  for (const rid in D.ROADS) { const r = D.ROADS[rid]; if (!D.TOWNS[r.a] || !D.TOWNS[r.b] || !D.ROAD_TYPES[r.type] || (r.gate && !D.TOWNS[r.gate])) bad.push(rid); }
  for (const t of towns) { for (const g in D.TOWNS[t].stock) if (!D.GOODS[g]) bad.push(t + ':' + g); for (const g in D.TOWNS[t].prices) if (!D.GOODS[g]) bad.push(t + ':' + g); if (!D.TOWNS[t].who) bad.push(t + ':who'); }
  check('道と町が参照する先がすべて存在する', !bad.length, bad.join(','));
  check('どの品にも産地と重さがある', goods.every((g) => D.GOODS[g].w > 0 && towns.some((t) => D.TOWNS[t].stock[g] != null)));
  check('禁制品が3種あり、どれも王都では売れない', D.CONTRABAND.length >= 3 && D.CONTRABAND.every((g) => D.TOWNS.oto.ban.includes(g)));
  check('関所のある道には、避けて通る道もある', Object.values(D.ROADS).filter((r) => r.gate).length >= 3 && Object.values(D.ROADS).some((r) => r.type === 'path'));
  check('物語に導入・節目・結末がある', ['intro', 'handcart', 'donkey', 'horse', 'stall', 'shop', 'oto', 'pay1', 'free', 'bankrupt'].every((k) => D.STORY[k] && D.STORY[k].text.length));
  check('返済額は回を追うごとに上がる', D.CONFIG.loan.dues.every((v, i, a) => i === 0 || v > a[i - 1]), D.CONFIG.loan.dues.join('→'));
}

// ---------- 2. はじまり・物語・保存 ----------
function testStart() {
  console.log('■ はじまり・物語・保存');
  const e = boot(), S = e.g.state, D = e.D;
  check('親の借金の導入から始まる', /父の残したもの/.test(e.title()) && /バルド/.test(e.text()) && /借金/.test(e.text()));
  e.closeAll();
  check('背負い籠・わずかな元手で始まる', S.cart.type === 'basket' && S.gold === D.CONFIG.startGold && S.gold <= 60);
  check('最初の返済は30日後', e.g.daysLeft() === 30 && e.g.owed() === D.CONFIG.loan.dues[0]);
  const seen2 = Object.keys(S.seen).filter((t) => S.seen[t] === 2), seen1 = Object.keys(S.seen).filter((t) => S.seen[t] === 1);
  check('地図は出発地だけ。隣の町は「？」', seen2.length === 1 && seen1.length >= 2 && seen1.every((t) => !S.named[t]));
  check('保存名が前の版・航海版と別', e.g.SAVE_KEY === KEY && !!e.store[KEY] && !e.store['shokai-save-v1'] && !e.store['shokai-save-v2'] && !e.store['kaze-to-ho-save-v1']);
  for (const t of ['market', 'map', 'town', 'book']) { e.act('tab', { id: t }); if (e.main.innerHTML.length < 200) fails++; }
  check('4つの画面が描ける', e.main.innerHTML.length > 200);
  check('画面に返済の期限と額が出ている', /返済 あと30日/.test(e.els['#hud'].innerHTML));
  S.gold = 77; e.g.settle();
  const e2 = boot(Object.assign({}, e.store));
  check('続きから再開できる（導入は出ない）', e2.g.state.gold === 77 && !e2.open());
  const old2 = '{"v":2,"gold":9999,"cargo":{"grain":{"qty":2,"cost":12,"age":0}}}';
  const e3 = boot({ 'shokai-save-v1': '{"v":1,"gold":9999}', 'shokai-save-v2': old2 });
  check('前の版（v1・v2）のセーブがあっても、新しく始まる', e3.g.state.gold === D.CONFIG.startGold && e3.g.state.time === 0 && /父の残したもの/.test(e3.title()));
  check('前の版のセーブは消さずに残す', e3.store['shokai-save-v1'] === '{"v":1,"gold":9999}' && e3.store['shokai-save-v2'] === old2);
  // 節目の場面
  S.gold = 500;
  withRandom(0.99, () => e.travel('r1'));
  check('初めての商いと、初めての町の場面が出る', S.told.firstTrip === 1 && S.told.kawabe === 1);
  e.closeAll();
  e.act('buyCart', { id: 'handcart' }); e.press(1);
  check('荷車を買うと場面が出る（車屋の親方）', S.told.handcart === 1 && /ゴンゾ/.test(e.text()));
  e.closeAll();
  const n = Object.keys(S.told).length; withRandom(0.99, () => e.travel('r1')); e.closeAll(); withRandom(0.99, () => e.travel('r1')); e.closeAll();
  check('同じ場面は二度出ない', Object.keys(S.told).length === n);
}

// ---------- 3. 重さ・在庫・値の動き ----------
function testWeight() {
  console.log('■ 重さ・在庫・値の動き');
  const e = fresh(), S = e.g.state, D = e.D;
  S.gold = 5000;
  check('荷車の積載量は 30kg・120kg・350kg・700kg', D.CARTS.basket.cap === 30 && D.CARTS.handcart.cap === 120 && D.CARTS.donkey.cap === 350 && D.CARTS.horse.cap === 700);
  const per = (c, g) => Math.floor(D.CARTS[c].cap / D.GOODS[g].w);
  check('背負い籠に入るのは、麦3袋・ワイン1樽・鉄1束・毛織物7反', per('basket', 'grain') === 3 && per('basket', 'wine') === 1 && per('basket', 'iron') === 1 && per('basket', 'cloth') === 7);
  check('馬車なら麦70袋・ワイン35樽', per('horse', 'grain') === 70 && per('horse', 'wine') === 35);
  check('品物には現実の単位と重さ（kg）がある', Object.values(D.GOODS).every((x) => x.unit && x.w >= 1) && D.GOODS.grain.unit === '袋' && D.GOODS.wine.unit === '樽' && D.GOODS.cloth.unit === '反' && D.GOODS.grain.w === 10 && D.GOODS.wine.w === 20 && D.GOODS.spice.w === 1);
  const dens = (g) => D.GOODS[g].base / D.GOODS[g].w;
  check('麦や塩は安くて重く、布や香辛料は高くて軽い', dens('grain') < dens('salt') && dens('salt') < dens('wool') && dens('wool') < dens('honey') && dens('honey') < dens('linen') && dens('linen') < dens('cloth') && dens('cloth') < dens('spice'), `1kgあたり 麦${dens('grain')}枚 / 羊毛${dens('wool').toFixed(1)}枚 / 毛織物${dens('cloth').toFixed(1)}枚 / 香辛料${dens('spice')}枚`);
  // 値段の差：重くて安い品は倍近く、軽くて高い品は1〜3割
  const spread = (g) => { const v = Object.keys(D.TOWNS).filter((t) => !(D.TOWNS[t].ban || []).includes(g)).map((t) => D.TOWNS[t].prices[g] == null ? 1 : D.TOWNS[t].prices[g]); const src = Object.keys(D.TOWNS).filter((t) => D.TOWNS[t].stock[g] != null).map((t) => D.TOWNS[t].prices[g]); return { far: Math.max.apply(null, v) / Math.min.apply(null, src), prod: Math.min.apply(null, src) }; };
  check('重くて安い品は、産地を離れると値が倍以上になる', ['grain', 'salt', 'wine', 'iron'].every((g) => spread(g).far >= 2.4), ['grain', 'salt', 'wine', 'iron'].map((g) => D.GOODS[g].name + '×' + spread(g).far.toFixed(1)).join(' '));
  const lux = Object.keys(D.GOODS).filter((g) => D.GOODS[g].lux && !D.CONTRABAND.includes(g));
  check('軽くて高い品は、売値で見て産地の1〜3割増しまで', lux.every((g) => { const x = spread(g); const top = x.far * x.prod * D.CONFIG.sellRate / x.prod; return top >= 1.0 && top <= 1.4; }), lux.map((g) => D.GOODS[g].name + '×' + (spread(g).far * D.CONFIG.sellRate).toFixed(2)).join(' '));
  const maxStock = (g) => Math.max.apply(null, Object.keys(D.TOWNS).map((t) => D.TOWNS[t].stock[g] || 0));
  check('高級品は在庫が少ない', Object.keys(D.GOODS).filter((g) => D.GOODS[g].lux).every((g) => maxStock(g) <= 14) && ['grain', 'salt', 'fish'].every((g) => maxStock(g) >= 50));
  check('お金があっても、重さの限界までしか買えない', e.g.maxBuy('hashibami', 'grain') === 3, '麦' + e.g.maxBuy('hashibami', 'grain') + '袋');
  const t0 = S.time;
  e.qty('buy', { g: 'grain' }, 2);
  check('売り買いを始めると時間が1刻進む', S.time === t0 + D.CONFIG.tradeTime);
  check('買うと重さ（kg）が増える', e.g.cargoWeight() === 20 && e.g.freeWeight() === 10);
  e.qty('buy', { g: 'wool' });
  e.act('buy', { g: 'wool' });
  check('空きが足りないと買えない（羊毛1俵8kg、空き2kg）', S.cargo.wool.qty === 1 && e.g.freeWeight() === 2 && !e.open());
  e.act('tab', { id: 'market' });
  check('市場に単位と重さが出る（1袋 10kg、在庫◯袋、あと◯kg）', /1袋 10kg/.test(e.main.innerHTML) && /在庫 \d+袋/.test(e.main.innerHTML) && /あと 2kg 積める/.test(e.main.innerHTML) && /2袋<\/b>・20kg/.test(e.main.innerHTML));
  check('上部に荷の重さが kg で出る', /28\/30kg/.test(e.els['#hud'].innerHTML));
  e.act('tab', { id: 'book' });
  check('帳簿に荷の重さが kg で出る', /28\/30kg/.test(e.main.innerHTML) && /麦 2袋/.test(e.main.innerHTML));
  check('同じ刻のうちは、続けて売り買いしても時間は進まない', S.time === t0 + D.CONFIG.tradeTime);
  check('荷車が大きいほど重い品を運べる', D.CARTS.handcart.cap >= D.CARTS.basket.cap * 3 && D.CARTS.donkey.cap >= D.CARTS.handcart.cap * 2 && D.CARTS.horse.cap > D.CARTS.donkey.cap);
  // 在庫
  S.cart.type = 'horse'; S.cargo = {};
  const st0 = Math.floor(S.stock.hashibami.wool), full = D.TOWNS.hashibami.stock.wool;
  e.qty('buy', { g: 'wool' });
  check('特産の在庫は有限で、買い占めると売り切れる', S.cargo.wool.qty === st0 && Math.floor(S.stock.hashibami.wool) === 0 && e.g.maxBuy('hashibami', 'wool') === 0, `${st0}個で売り切れ`);
  withRandom(0.5, () => { e.act('rest'); e.closeAll(); e.act('rest'); e.closeAll(); });
  const mid = S.stock.hashibami.wool;
  withRandom(0.5, () => { for (let i = 0; i < 6; i++) { e.act('rest'); e.closeAll(); } });
  check('在庫は数日かけて戻る', mid > 0 && mid < full && S.stock.hashibami.wool === full, `2日後 ${mid.toFixed(1)}個 → 満杯 ${full}個`);
  // 売りこんだ値の戻り
  knowAll(e); S.town = 'kawabe'; S.market.kawabe.wool = 0; S.drift.kawabe.wool = 0;
  const p0 = e.g.sellNow('kawabe', 'wool');
  e.qty('sell', { g: 'wool' }); e.closeAll();
  const p1 = e.g.sellNow('kawabe', 'wool'), dev1 = S.market.kawabe.wool;
  withRandom(0.5, () => { for (let i = 0; i < 10; i++) { e.act('rest'); e.closeAll(); } });
  check('まとめて売ると値が下がる', p1 < p0, `${p0}枚 → ${p1}枚`);
  check('売りこんだ値は10日たっても半分も戻らない', S.market.kawabe.wool < dev1 * 0.55 && S.market.kawabe.wool > dev1, `ずれ ${dev1.toFixed(2)} → ${S.market.kawabe.wool.toFixed(2)}`);
  S.market.kawabe.fish = 0.3; withRandom(0.5, () => { for (let i = 0; i < 10; i++) { e.act('rest'); e.closeAll(); } });
  check('買われて上がった値は早く戻る', S.market.kawabe.fish < 0.3 * 0.25);
  // 値は日々動く
  const e2 = fresh(); knowAll(e2); const a = e2.g.sellNow('oto', 'cloth');
  let moved = 0, prev = a; for (let i = 0; i < 12; i++) { e2.act('rest'); e2.closeAll(); const v = e2.g.sellNow('oto', 'cloth'); if (v !== prev) moved++; prev = v; }
  check('売り買いしなくても、値は日々動く', moved >= 6, `12日のうち${moved}日で変化`);
}

// ---------- 4. となり町で聞いた値 ----------
function testHeard() {
  console.log('■ となり町の売値（◯日前に聞いた値）');
  const e = fresh(), S = e.g.state, D = e.D;
  e.act('tab', { id: 'market' });
  check('名前を知らない町の値は出ない', !/となり町で聞いた売値/.test(e.main.innerHTML));
  S.gold = 300; withRandom(0.99, () => e.travel('r1')); e.closeAll();
  check('訪れた町では、道でつながった知っている町の売値が出る', /となり町で聞いた売値/.test(e.main.innerHTML) && /ハシバミ/.test(e.main.innerHTML) && /日前/.test(e.main.innerHTML));
  check('名前を知らない隣町は表に出ない', !/ハタオリ/.test(e.main.innerHTML.split('となり町で聞いた売値')[1].split('</details>')[0]));
  withRandom(0.5, () => { for (let i = 0; i < 6; i++) { e.act('rest'); e.closeAll(); } });
  const h = e.g.heard('kawabe', 'hashibami');
  check('聞いた値は、道のりの日数ぶん古い', h.age === D.ROADS.r1.len, h.age + '日前');
  // 今の値とは食いちがう
  let diff = 0; for (const g in D.GOODS) if (h.sell[g] !== e.g.sellNow('hashibami', g)) diff++;
  check('聞いた値と今の値は食いちがう', diff >= 3, `${Object.keys(D.GOODS).length}品のうち${diff}品`);
  e.act('tab', { id: 'map' }); e.act('dest', { id: 'hashibami' });
  check('行き先の画面にも「◯日前に聞いた値」が出る', /日前に聞いた値/.test(e.main.innerHTML));
  e.act('dest', { id: 'hataori' });
  check('行ったことも聞いたこともない町は、何もわからない', /何が売れるかもわからない/.test(e.main.innerHTML));
}

// ---------- 5. 親の借金と返済 ----------
function testLoan() {
  console.log('■ 30日ごとの返済・差し押さえ・破産');
  const D0 = fresh().D, dues = D0.CONFIG.loan.dues;
  const to30 = (e) => withRandom(0.5, () => { const c0 = e.g.state.loan.cycle; let n = 0; while (e.g.state.loan.cycle === c0 && !e.g.state.dead && n++ < 40) { e.act('rest'); if (e.bust()) break; if (e.g.state.loan.cycle === c0) e.closeAll(); } });
  let e = fresh(), S = e.g.state;
  S.gold = 500; to30(e);
  check('30日目に返済額を取り立てられる', S.loan.n === 1 && S.gold === 500 - dues[0] - D0.CONFIG.living * 30, `残り ${S.gold}枚`);
  check('返済すると金貸しの場面が出て、次の額が告げられる', /返済/.test(e.text()) || S.told.pay1 === 1); e.closeAll();
  check('次の返済は額が上がる', e.g.owed() === dues[1] && e.g.daysLeft() === 30);
  // 先に納める
  S.town = 'kawabe'; S.gold = 300; e.qty('prepay', {}, 100);
  check('先に納めたぶんは、返済日の額から引かれる', e.g.owed() === dues[1] - 100 && S.gold === 200);
  // ツケ
  e.qty('borrow', {}, 60);
  check('借りた金はツケになり、次の返済日にまとめて取り立てられる', S.debt === 60 && e.g.owed() === dues[1] - 100 + 60);
  const d0 = S.debt; e.act('rest'); e.closeAll();
  check('ツケには毎日利子がつく', S.debt > d0);
  check('借りられる額には上限がある', (e.qty('borrow', {}), S.debt <= D0.CONFIG.tabLimit + 1));
  // 差し押さえ：店 → 荷車 → 荷
  e = fresh(); S = e.g.state; knowAll(e);
  S.cart = { type: 'donkey', hp: 100 }; S.shop = { town: 'kawabe', lv: 1, stock: {}, till: 0 }; S.guards = 0;
  S.cargo = { linen: { qty: 10, cost: 350, age: 0 } };
  S.gold = e.g.dailyCost().total * 30 + 10; to30(e);   // 暮らしの金はあるが、返済ぶんが足りない
  check('払えないと、まず店を差し押さえられる', S.shop === null && S.cart.type === 'donkey' && S.loan.n === 1 && !S.dead, e.text().slice(0, 40));
  check('取りすぎたぶんは返ってくる', S.gold > 0);
  e.closeAll(); S.gold = e.g.dailyCost().total * 30; to30(e);
  check('次は荷車を差し押さえられ、背負い籠に戻る', S.cart.type === 'basket' && S.loan.n === 2 && !S.dead); e.closeAll();
  S.cargo = { spice: { qty: 5, cost: 800, age: 0 } }; S.gold = e.g.dailyCost().total * 30 + 50; to30(e);   // 荷の値打ち1000枚（差し押さえでは半値）
  check('次は荷を取り上げられる', e.g.cargoCount() === 0 && S.loan.n === 3 && !S.dead); e.closeAll();
  S.gold = 0; to30(e);
  check('何も残らなければ破産する', S.dead === true && /💀/.test(e.title()) && /父と同じ道/.test(e.text()));
  check('破産するとセーブが消える', !(KEY in e.store));
  e.press(0); e.drain();
  const S2 = e.g.state;
  check('破産後は完全に最初から（導入からやり直し）', S2.time === 0 && S2.gold === D0.CONFIG.startGold && S2.cart.type === 'basket' && S2.loan.n === 0 && /父の残したもの/.test(e.title()));
  // 完済
  e = fresh(); S = e.g.state; S.loan.n = dues.length - 1; S.loan.cycle = dues.length - 1; S.time = (dues.length - 1) * 30 * 4; S.gold = 5000; to30(e);
  check('最後の返済を終えると完済の場面が出る', S.loan.done === true && S.told.free === 1); e.closeAll();
  check('完済後は返済がなくなる', e.g.owed() === 0 && /借金なし/.test(e.els['#hud'].innerHTML));
  check('無条件の援助金は無い', !/援助/.test(fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8')));
}

// ---------- 6. 関所 ----------
function testGate() {
  console.log('■ 関所（割合の税・通行手形・禁制品と袖の下）');
  const mkE = (cargo, gold) => { const e = fresh(), S = e.g.state; knowAll(e); S.town = 'kawabe'; S.gold = gold == null ? 500 : gold; S.cargo = cargo; return e; };
  const C = fresh().D.CONFIG, living3 = C.living * 3;
  let e = mkE({ linen: { qty: 10, cost: 350, age: 0 } }), S = e.g.state;
  const worth = e.g.cargoWorth(), tax = e.g.gateTax('r8');
  check('関所の税は、荷の値打ちの8%前後', tax === Math.ceil(worth * C.gateTax) && tax / worth > 0.06 && tax / worth < 0.1, `値打ち${worth}枚 → 税${tax}枚`);
  check('抜け道には税がないが、ずっと危ない', e.g.gateTax('r8b') === 0 && e.g.routeInfo('r8b').risk > e.g.routeInfo('r8').risk * 2);
  withRandom(0.99, () => e.travel('r8'));
  check('関所で税を払って通る', S.town === 'hataori' && S.gold === 500 - tax - living3); e.closeAll();
  check('荷が空なら税はかからない', (S.cargo = {}, e.g.gateTax('r8') === 0));
  // 通行手形
  e = mkE({ linen: { qty: 10, cost: 350, age: 0 } }); S = e.g.state;
  S.rep.hataori = C.passRep; withRandom(0.5, () => { e.act('rest'); });
  check('関所を預かる町の評判が上がると、通行手形をもらえる', S.pass.hataori === true && S.told.pass === 1 && /通行手形/.test(e.modal.innerHTML)); e.closeAll();
  check('手形があれば税が免除される', e.g.gateTax('r8') === 0 && e.g.routeInfo('r8').pass === true && e.g.gateTax('r6') > 0);
  const g0 = S.gold; withRandom(0.99, () => e.travel('r8'));
  check('手形を見せて、税なしで通れる', S.gold === g0 - living3 && S.town === 'hataori'); e.closeAll();
  // 禁制品：そのまま通る
  const contra = () => ({ tobacco: { qty: 4, cost: 420, age: 0 }, grain: { qty: 2, cost: 12, age: 0 } });
  e = mkE(contra()); S = e.g.state; const cw = e.g.contraWorth();
  let i = 0; const seq = [0.99, 0.99, 0.1];   // 山賊なし・故障なし・見つかる
  withRandom(() => (i < seq.length ? seq[i++] : 0.99), () => e.travel('r8', (t) => (/禁制品/.test(t) && /そのまま/.test(e.modal.innerHTML) ? /そのまま通る/ : null)));
  check('禁制品が見つかると、没収・罰金・評判の低下', !S.cargo.tobacco && S.cargo.grain && S.gold === 500 - Math.ceil((cw + 20) * C.gateTax) - Math.ceil(cw * C.fineRate) - living3); e.closeAll();
  e = mkE(contra()); S = e.g.state; i = 0; const seq2 = [0.99, 0.99, 0.9];
  withRandom(() => (i < seq2.length ? seq2[i++] : 0.99), () => e.travel('r8', (t) => (/そのまま/.test(e.modal.innerHTML) ? /そのまま通る/ : null)));
  check('運がよければ、見つからずに通れる', S.cargo.tobacco && S.cargo.tobacco.qty === 4); e.closeAll();
  // 袖の下
  e = mkE(contra()); S = e.g.state; i = 0; const seq3 = [0.99, 0.99, 0.3];   // 0.3：そのままなら見つかるが、袖の下なら通る
  withRandom(() => (i < seq3.length ? seq3[i++] : 0.99), () => e.travel('r8', (t) => (/袖の下/.test(e.modal.innerHTML) ? /袖の下/ : null)));
  const bribe = Math.ceil(cw * C.bribeRate + C.bribeBase);
  check('袖の下を渡せば、ほぼ見つからずに通れる', S.cargo.tobacco && S.gold === 500 - Math.ceil((cw + 20) * C.gateTax) - bribe - living3 && C.bribeFind < C.gateFind / 3, `袖の下 ${bribe}枚`); e.closeAll();
  e = mkE(contra(), 30); S = e.g.state; e.act('go', { r: 'r8' }); withRandom(0.99, () => e.drain());
  check('金がなければ袖の下は選べない', /そのまま通る/.test(e.modal.innerHTML) && !/袖の下を渡す/.test(e.modal.innerHTML));
  // 王都
  e = mkE({ cloth: { qty: 4, cost: 250, age: 0 }, liquor: { qty: 2, cost: 90, age: 0 } }); S = e.g.state; S.town = 'tsuno'; S.pass.oto = true;
  withRandom(0.6, () => e.travel('r9', (t) => (/そのまま/.test(e.modal.innerHTML) ? /そのまま通る/ : null)));
  check('王都の門では入市税を取られ、禁制品は没収される', S.town === 'oto' && /入市税/.test(e.text()) && !S.cargo.liquor && /門番/.test(e.text())); e.closeAll();
  check('王都では禁制品が売れない', e.g.banned('oto', 'pelt') && e.g.banned('oto', 'tobacco'));
}

// ---------- 7. 山賊 ----------
function testBandits() {
  console.log('■ 山賊（積み荷の値打ちで遭遇率と要求額が上がる）');
  const e0 = fresh(), C = e0.D.CONFIG, S0 = e0.g.state;
  S0.cargo = {}; const p0 = e0.g.banditChance(1, false);
  S0.cargo = { linen: { qty: 6, cost: 0, age: 0 } }; const p1 = e0.g.banditChance(1, false);
  S0.cargo = { spice: { qty: 6, cost: 0, age: 0 } }; const p2 = e0.g.banditChance(1, false);
  check('値打ちのある荷ほど、山賊に遭いやすい', p0 < p1 && p1 < p2 && p2 >= p0 * 4, `空 ${Math.round(p0 * 100)}% → 亜麻布6個 ${Math.round(p1 * 100)}% → 香辛料6個 ${Math.round(p2 * 100)}%`);
  S0.guards = 2; check('護衛がいると遭いにくい', e0.g.banditChance(1, false) < p2); S0.guards = 0;
  check('隊商に加わると遭いにくい', e0.g.banditChance(1, true) < p2 * 0.5);
  const setup = (cargo, guards, cart) => {
    const e = fresh(), S = e.g.state; knowAll(e);
    S.town = 'hataori'; S.gold = 300; S.cart = { type: cart || 'donkey', hp: 100 }; S.guards = guards || 0; S.cargo = cargo;
    return e;
  };
  const run = (e, seq, re) => { let i = 0; return withRandom(() => (i < seq.length ? seq[i++] : 0.99), () => e.travel('r11', (txt) => (/だ！/.test(txt) ? re : null))); };
  const cheap = () => ({ grain: { qty: 6, cost: 40, age: 0 } }), rich = () => ({ spice: { qty: 6, cost: 900, age: 0 } });
  const cost = (e) => e.g.dailyCost().total * 3;
  // 乱数：遭遇(0)・故障なし(0.99)・こそ泥(0.99)・強さ(0.5)
  let e = setup(cheap()); run(e, [0, 0.99, 0.99, 0.5], /通行料/);
  const tollCheap = 300 - cost(e) - e.g.state.gold; e.closeAll();
  e = setup(rich()); run(e, [0, 0.99, 0.99, 0.5], /通行料/);
  const tollRich = 300 - cost(e) - e.g.state.gold; e.closeAll();
  check('値打ちのある荷ほど、要求される通行料が高い', tollRich > tollCheap * 5 && tollRich === Math.ceil(C.bandits.thief.tollBase + 1200 * C.bandits.thief.tollRate), `麦6個 ${tollCheap}枚 / 香辛料6個 ${tollRich}枚`);
  check('山賊と初めて出会うと場面が出る', e.g.state.told.firstBandit === 1);
  e = setup(rich(), 3); run(e, [0, 0.99, 0.99, 0.5, 0.0], /戦う/);
  check('戦って勝てば荷は無事', e.g.state.stats.wins === 1 && e.g.state.cargo.spice.qty === 6); e.closeAll();
  e = setup(rich(), 0); run(e, [0, 0.99, 0.0, 0.5, 0.99], /戦う/);
  check('戦って負けると荷と金を奪われる', e.g.state.stats.robbed === 1 && e.g.state.cargo.spice.qty < 6 && e.g.state.gold < 300 - cost(e)); e.closeAll();
  e = setup(rich(), 0, 'basket'); e.g.state.cargo = { spice: { qty: 3, cost: 450, age: 0 } }; run(e, [0, 0.99, 0.99, 0.5, 0.0], /逃げる/);
  check('逃げ切れば何も失わない', e.g.state.gold === 300 - cost(e) && e.g.state.cargo.spice.qty === 3); e.closeAll();
  e = setup(rich(), 0); run(e, [0, 0.99, 0.99, 0.5], /荷の/);
  check('荷を渡せば通してもらえる', e.g.state.cargo.spice.qty === 4 && e.g.state.gold === 300 - cost(e)); e.closeAll();
  check('背負い籠では護衛を連れて歩けない', e.D.CARTS.basket.guards === 0);
}

// ---------- 8. 依頼 ----------
function testOrders() {
  console.log('■ 期限つきの依頼');
  const e = fresh(), S = e.g.state, D = e.D, C = D.CONFIG;
  knowAll(e); S.town = 'kawabe'; S.gold = 2000; S.cart = { type: 'donkey', hp: 100 };
  const offers = withRandom(seeded(7), () => e.g.offersOf('kawabe'));
  check('町の顔役が頼みごとを出している', offers.length >= 1 && offers.every((o) => o.n > 0 && o.days > 0 && o.reward > 0 && !e.g.sellsHere('kawabe', o.g)), offers.map((o) => `${D.GOODS[o.g].name}${o.n}個・${o.days}日・${o.reward}枚`).join(' / '));
  e.act('tab', { id: 'town' });
  check('町の画面に頼みごとが出る（顔役の名前つき）', /ゴンゾの頼み/.test(e.main.innerHTML) && /日以内/.test(e.main.innerHTML) && /麦なら 12袋/.test(e.main.innerHTML.replace(/<[^>]+>/g, '')));
  const o = offers[0], g = o.g, n = o.n, reward = o.reward, repGain = o.rep;
  e.act('accept', { i: '0' }); e.closeAll();
  check('頼みを受けると、期限つきの約束になる', S.orders.length === 1 && S.orders[0].due === Math.floor(S.time / 4) + o.days);
  e.act('deliver', { i: '0' });
  check('品が足りないと納められない', S.orders.length === 1);
  S.cargo[g] = { qty: n + 1, cost: (n + 1) * 10, age: 0 };
  const g0 = S.gold, r0 = S.rep.kawabe; e.act('deliver', { i: '0' });
  check('期限までに届けると、報酬と評判を得る', S.orders.length === 0 && S.gold === g0 + reward && S.rep.kawabe === r0 + repGain && S.cargo[g].qty === 1 && S.stats.orders === 1, `+${reward}枚・評判+${repGain}`);
  check('初めて約束を果たすと場面が出る', S.told.order1 === 1); e.closeAll();
  // 失敗
  S.rep.kawabe = 20; S.orders.push({ id: 'x', t: 'kawabe', g: 'iron', n: 5, due: Math.floor(S.time / 4) + 1, reward: 300, rep: 6 });
  withRandom(0.5, () => { e.act('rest'); e.closeAll(); e.act('rest'); });
  check('期限に遅れると約束は消え、評判が下がる', S.orders.length === 0 && S.rep.kawabe <= 20 - C.orderFailRep + 0.5 && /約束/.test(e.text()), `評判 20 → ${S.rep.kawabe}`); e.closeAll();
  S.orders = [{ id: 'a', t: 'oto', g: 'iron', n: 1, due: 999, reward: 1, rep: 1 }, { id: 'b', t: 'oto', g: 'salt', n: 1, due: 999, reward: 1, rep: 1 }];
  S.offers.kawabe = { day: Math.floor(S.time / 4), list: [{ id: 'c', g: 'wine', n: 2, days: 9, reward: 90, rep: 6 }] };
  e.act('accept', { i: '0' });
  check('同時に受けられる数には限りがある', S.orders.length === C.orderMax);
  // 報酬の重さとの関係
  const big = { n: 14, w: D.GOODS.iron.w }, small = { n: 2, w: D.GOODS.iron.w };
  const rw = (x) => Math.round(x.n * D.GOODS.iron.base * 0.8 + x.n * x.w * C.orderFee * (1 + 3));
  check('重い注文ほど報酬が大きい（荷車がないと運べない）', rw(big) > rw(small) * 6 && big.n * big.w > D.CARTS.handcart.cap, `鉄14束＝${big.n * big.w}kg`);
  e.act('tab', { id: 'town' });
  check('頼みごとに単位と重さ（kg）が出る', /を \d+(袋|樽|束|籠|俵|壺|反)/.test(e.main.innerHTML) && /\d+kg/.test(e.main.innerHTML));
}

// ---------- 9. 荷車・隊商・店 ----------
function testCartsShop() {
  console.log('■ 荷車・故障・隊商・店');
  const e = fresh(), S = e.g.state, D = e.D, C = D.CONFIG, L1 = C.shop[1], L2 = C.shop[2];
  knowAll(e); S.town = 'kawabe'; S.gold = 9000;
  for (const id of ['handcart', 'donkey', 'horse']) { e.act('buyCart', { id }); e.press(1); e.closeAll(); }
  check('荷車を順に買い替えられ、そのたびに場面が出る', S.cart.type === 'horse' && S.told.handcart && S.told.donkey && S.told.horse);
  const road = e.g.routeInfo('r8').days; S.town = 'hashibami'; const trail = e.g.routeInfo('r2').days; S.cart.type = 'basket'; const foot = e.g.routeInfo('r2').days; S.cart.type = 'horse'; S.town = 'kawabe';
  check('馬車は街道で速く、山道では徒歩より遅い', road < D.ROADS.r8.len && trail > foot);
  S.cargo = { grain: { qty: 20, cost: 120, age: 0 } }; let i = 0; const seq = [0.99, 0];
  const g0 = S.gold; withRandom(() => (i < seq.length ? seq[i++] : 0.99), () => e.travel('r1', (t) => (/壊れた/.test(t) ? /直して/ : null)));
  check('道中で車が壊れ、修理代と1日がかかる', S.gold === g0 - D.CARTS.horse.repair - e.g.dailyCost().total * (e.g.routeInfo('r1').days + 1) && S.cargo.grain.qty === 20); e.closeAll();
  S.town = 'kawabe'; S.cargo = {}; S.gold = 0; S.cart = { type: 'donkey', hp: 100 };
  e.act('sellCart'); e.press(1); e.closeAll();
  check('苦しいときは荷車を売って背負い籠に戻れる', S.cart.type === 'basket' && S.gold > 100 && S.gold < D.CARTS.donkey.price);
  S.gold = 300; e.act('tab', { id: 'town' });
  const c = S.caravans.kawabe[0], d0 = Math.floor(S.time / 4), dest = D.ROADS[c.rid].a === 'kawabe' ? D.ROADS[c.rid].b : D.ROADS[c.rid].a;
  e.act('caravan', { i: '0' });
  withRandom(0.99, () => { e.press(1); let n = 0; while (e.g.travel && n++ < 100) { e.drain(); if (e.open()) e.press(0); } });
  check('参加費を払い、出発を待って隊商と移動する', S.town === dest && S.gold <= 300 - c.fee && Math.floor(S.time / 4) - d0 >= c.leave - d0 + 1); e.closeAll();
  // 店
  S.town = 'kawabe'; S.gold = 5000; S.cart = { type: 'donkey', hp: 100 }; S.cargo = {};
  e.act('shopOpen');
  check('評判が足りないと露店を出せない', S.shop === null && !e.open());
  S.rep.kawabe = L1.rep; e.act('shopOpen'); e.press(1);
  check('評判とお金がそろえば露店を出せ、場面が出る', S.shop && S.shop.lv === 1 && S.told.stall === 1 && e.g.stage() === 3); e.closeAll();
  S.cargo = { honey: { qty: 10, cost: 240, age: 0 }, wine: { qty: 10, cost: 250, age: 0 } };
  e.qty('shopPut', { g: 'honey' }); e.qty('shopPut', { g: 'wine' });
  withRandom(0.5, () => { for (let k = 0; k < L1.every; k++) { e.act('rest'); e.closeAll(); } });
  check('露店は市の日に預けた品を売る', S.shop.till > 0 && S.shop.stock.honey.qty === 10 - L1.rate, `売上 ${S.shop.till}枚`);
  const g1 = S.gold, till = S.shop.till; e.act('shopTake'); e.closeAll();
  check('売上金を受け取れる', S.gold === g1 + till);
  S.rep.kawabe = L2.rep; e.act('shopUp'); e.press(1);
  check('露店を小さな店に建て替えると場面が出る（ミナが店番に来る）', S.shop.lv === 2 && S.told.shop === 1 && /ミナ/.test(e.text())); e.closeAll();
  const g2 = S.gold; e.act('shopClose'); e.press(1); e.closeAll();
  check('店をたたむと一部が戻り、店賃がなくなる', S.shop === null && S.gold > g2 && e.g.dailyCost().shop === 0);
  // 護衛・傷む品
  S.guards = 0; S.gold = 100; e.act('guard', { n: '1' });
  check('護衛を雇うと日給がかかる', S.guards === 1 && e.g.dailyCost().guards === C.guardWage);
  S.gold = 0; withRandom(0.5, () => e.act('rest'));
  check('給金を払えないと護衛は去る', S.guards === 0); e.closeAll();
  S.gold = 50; S.cargo = { fish: { qty: 3, cost: 30, age: 0 } }; withRandom(0.5, () => { for (let k = 0; k < 6; k++) { e.act('rest'); if (/腐/.test(e.text())) break; e.closeAll(); } });
  check('魚は日数を過ぎると腐って無くなる', !S.cargo.fish); e.closeAll();
}

// ---------- 10. バランス：通しプレイ ----------
// 腕のいい商人。人より有利な条件で遊ぶ：最初から国じゅうの地図を持ち、どの町の「今の本当の値」も知っている。
// 3つ先の町までの道すじを比べ、1日あたりの利益がいちばん大きい荷と行き先を選ぶ。maxCart より上の荷車は買わない。
// （この商人でも返済できないなら、人が同じ荷車で遊んでも返済できない、と言える）
function play(seed, maxCart, maxDays, init) {
  Math.random = seeded(seed);
  try {
    const e = fresh(), g = e.g, D = e.D, C = D.CONFIG, S = () => g.state;
    knowAll(e); S().seen[S().town] = 2;
    if (init) init(S());   // 条件をそろえて測るとき用（荷車や元手を最初から与える）
    const order = ['basket', 'handcart', 'donkey', 'horse'], top = order.indexOf(maxCart);
    const mark = {};
    let commit = null;   // 遠くの町へ運んでいる途中なら { path: 残りの道, keep: 売らずに運ぶ品 }
    const stepOf = (t, gid) => 1 / (D.GOODS[gid].depth * D.TOWNS[t].size);
    const far = (rid, t) => (D.ROADS[rid].a === t ? D.ROADS[rid].b : D.ROADS[rid].a);
    // 町 t から道 rid を行くときの見通し
    function leg(rid, t, first) {
      const s = S(), r = D.ROADS[rid], cart = D.CARTS[s.cart.type];
      if (first && t === s.town) { const i = g.routeInfo(rid); return { rid, to: i.to, days: i.days, gated: !!(i.gate && !i.pass), gate: !!i.gate, shown: i.shown, breakP: i.breakP }; }
      const hot = s.hot[rid] > Math.floor(s.time / 4) && s.hotKnown[rid];
      return { rid, to: far(rid, t), days: Math.max(1, Math.round(r.len * cart.speed[r.type])), gated: !!(r.gate && !s.pass[r.gate]), gate: !!r.gate, shown: Math.min(3, r.danger + (hot ? 1 : 0)), breakP: cart.breakP[r.type] };
    }
    const okLeg = (L) => L.shown < 3 && L.breakP < 0.13;
    function legsOf(rids) { let cur = S().town; return rids.map((rid, i) => { const L = leg(rid, cur, i === 0); cur = L.to; return L; }); }
    function paths(t0, maxLen) {
      t0 = t0 || S().town; maxLen = maxLen || 3;
      const out = [];
      const walk = (t, legs, visited) => {
        for (const rid in D.ROADS) {
          const r = D.ROADS[rid];
          if (r.a !== t && r.b !== t) continue;
          const L = leg(rid, t, legs.length === 0);
          if (!okLeg(L) || visited.includes(L.to)) continue;
          const nl = legs.concat([L]); out.push(nl);
          if (nl.length < maxLen) walk(L.to, nl, visited.concat([L.to]));
        }
      };
      walk(t0, [], [t0]);
      return out;
    }
    // その道すじでの、いちばんいい積み方と、1日あたりの見込み利益
    // t0 を指定すると「その町に元手 money0・空き cap0 で着いたとしたら」の見積もりになる
    function plan(legs, t0, money0, cap0) {
      const s = S(), t = t0 || s.town, to = legs[legs.length - 1].to;
      const days = legs.reduce((a, L) => a + L.days, 0), gates = legs.filter((L) => L.gated).length, anyGate = legs.some((L) => L.gate);
      let city = 0; for (const L of legs) city += D.TOWNS[L.to].cityTax || 0;
      const reserve = (days + 1 >= g.daysLeft()) ? g.owed() : 0;
      let money = (t0 ? money0 : s.gold - reserve) - g.dailyCost().total * (days + 1) - 2, capW = t0 ? cap0 : g.freeWeight(), gain = 0, value = t0 ? 0 : g.cargoWorth();
      const cnt = {}, cands = Object.keys(D.TOWNS[t].stock).filter((gid) => !g.banned(to, gid) && !(D.CONTRABAND.includes(gid) && (anyGate || city)));
      for (let guard = 0; guard < 500; guard++) {
        let best = null;
        for (const gid of cands) {
          const G0 = D.GOODS[gid], n = cnt[gid] || 0;
          if (n >= Math.floor(s.stock[t][gid]) || G0.w > capW) continue;
          const buy = Math.ceil(G0.base * g.mult(t, gid) * (1 + s.market[t][gid] + n * stepOf(t, gid)));
          if (buy + G0.base * (C.gateTax * gates + city) > money) continue;   // 関所と門の税を払う現金も残す
          const f = G0.shelf ? g.fresh(gid, days) : 1;
          const sell = Math.floor(G0.base * g.mult(to, gid) * (1 + Math.max(C.devMin, s.market[to][gid] - n * stepOf(to, gid))) * C.sellRate * f);
          const net = sell - buy - G0.base * (C.gateTax * gates + city);
          if (net <= 0) continue;
          if (!best || net / G0.w > best.r) best = { gid, r: net / G0.w, net, buy, w: G0.w, base: G0.base };
        }
        if (!best) break;
        cnt[best.gid] = (cnt[best.gid] || 0) + 1; money -= best.buy + best.base * (C.gateTax * gates + city); capW -= best.w; gain += best.net; value += best.base;
      }
      // 山賊に取られる見込み。この商人の道中の決め方（下の onRoad）どおりに計算する
      let loss = 0;
      const pp = C.selfPower + C.guardPower * s.guards, cart = D.CARTS[s.cart.type], cash = Math.max(0, money);
      const lose = 0.6 * value + 0.35 * cash;
      const meet = (B, bonus) => {
        const ep = (B.min + B.max) / 2, prob = pp * pp / (pp * pp + ep * ep), toll = B.tollBase + value * B.tollRate;
        if (prob > 0.66) return (1 - prob) * lose;                         // 有利なら戦う
        if (toll <= cash * 0.5) return toll;                               // 払えるなら通行料
        if (s.cart.type === 'basket' || s.cart.type === 'horse') return (1 - cart.flee) * (1 - prob * 0.7) * lose;   // 逃げる
        return B.take * value;                                             // 荷を渡す
      };
      for (const L of legs) {
        const p = Math.min(0.9, C.banditBase[L.shown] * Math.min(C.banditValueMax, 0.5 + value / C.banditValueRef) * Math.max(0.3, 1 - C.banditGuardCut * s.guards));
        const pg = Math.max(0, Math.min(0.8, 0.2 + value / 1500 + (L.shown >= 3 ? 0.2 : 0)));
        loss += p * (pg * meet(C.bandits.gang) + (1 - pg) * meet(C.bandits.thief));
      }
      const net = gain - loss - g.dailyCost().total * days;
      return { legs, to, cnt, days, gain, net, score: net / days };
    }
    const onRoad = (txt) => {
      if (/だ！/.test(txt)) {
        if (/有利/.test(txt)) return /戦う/;
        const m = e.modal.innerHTML.match(/通行料を払う（(\d+)枚）/);
        if (m && +m[1] <= S().gold * 0.5) return /通行料/;
        if (S().cart.type === 'basket' || S().cart.type === 'horse') return /逃げる/;
        return /荷の/.test(e.modal.innerHTML) ? /荷の/ : /戦う/;   // 不利なら戦わず、荷の一部を渡す
      }
      if (/壊れた/.test(txt)) return /直して|荷を/;
      return null;
    };
    let guard = 0;
    while (e.died == null && Math.floor(S().time / 4) < maxDays && guard++ < 4000) {
      const t = S().town, T = D.TOWNS[t];
      mark.peak = Math.max(mark.peak || 0, Math.round(S().gold));
      for (const gid of Object.keys(S().cargo)) if (!g.banned(t, gid) && !(commit && commit.keep[gid])) e.qty('sell', { g: gid });
      e.closeAll(); if (e.died != null) break;
      // 荷車の買い替え（返済ぶんと元手を残して）
      if (T.has.cart) {
        if (S().cart.type !== 'basket' && S().cart.hp < 55) e.act('fix');
        const ix = order.indexOf(S().cart.type), next = order[ix + 1];
        if (next && ix < top) {
          // 返済日の直前には買わない。返済ぶんの一部と、仕入れの元手を残す
          const cost = D.CARTS[next].price - g.tradeIn(), keep = g.owed() * 0.4 + [120, 300, 600][ix];
          if (g.daysLeft() >= 16 && S().gold >= cost + keep) { e.act('buyCart', { id: next }); e.press(1); e.closeAll(); if (mark[next] == null) mark[next] = Math.floor(S().time / 4); }
        }
      }
      if (e.died != null) break;
      // 護衛（手押し車は1人、ロバの荷車からは2人）
      const want = Math.min(D.CARTS[S().cart.type].guards, 2);
      if (S().guards > 0 && S().gold < 40) while (S().guards > 0) e.act('guard', { n: '-1' });
      if (T.has.guard) while (S().guards < want && S().gold > g.owed() * 0.5 + 120 + S().guards * 60) e.act('guard', { n: '1' });
      // 行き先を決める
      let best;
      if (commit && commit.path.length && D.ROADS[commit.path[0]] && far(commit.path[0], t) !== t && (D.ROADS[commit.path[0]].a === t || D.ROADS[commit.path[0]].b === t)) {
        best = plan(legsOf(commit.path));          // 運んでいる途中。空いたところに、この町の品を積み足す
      } else {
        commit = null;
        const capFull = D.CARTS[S().cart.type].cap;
        best = paths().map((P) => {
          const p1 = plan(P);
          // 着いた先で、次にどれだけ稼げるかも足して比べる（帰りが空荷になる行き先を避ける）
          let nx = null;
          for (const Q of paths(p1.to, 2)) { const p2 = plan(Q, p1.to, S().gold + p1.gain, capFull); if (!nx || p2.score > nx.score) nx = p2; }
          p1.total = nx && nx.net > 0 ? (p1.net + nx.net) / (p1.days + nx.days) : p1.score;
          return p1;
        }).sort((a, b) => b.total - a.total)[0];
      }
      if (!best || (best.gain <= 0 && !commit)) {
        // 仕入れる元手がない：手の届く品のある、いちばん近い町へ空荷で向かう。それも無理なら日雇い
        const reach = Object.keys(D.TOWNS).filter((x) => x !== t && Object.keys(D.TOWNS[x].stock).some((gid) => !D.CONTRABAND.includes(gid) && g.buyNow(x, gid) * 3 <= S().gold - g.dailyCost().total * (g.DIST[t][x] + 2)));
        const target = reach.sort((a, b) => g.DIST[t][a] - g.DIST[t][b])[0];
        const first = target && paths(t, 1).map((p) => p[0]).sort((a, b) => (a.days + g.DIST[a.to][target]) - (b.days + g.DIST[b.to][target]))[0];
        if (!first) { e.act('work'); e.closeAll(); continue; }
        e.travel(first.rid, onRoad); e.closeAll(); continue;
      }
      for (const gid of Object.keys(best.cnt)) e.qty('buy', { g: gid }, best.cnt[gid]);
      e.closeAll(); if (e.died != null) break;
      if (best.legs.length > 1) {
        const keep = Object.assign({}, commit ? commit.keep : {}); for (const gid of Object.keys(best.cnt)) keep[gid] = true;
        commit = { path: best.legs.slice(1).map((L) => L.rid), keep };
      } else commit = null;
      e.travel(best.legs[0].rid, onRoad);
      e.closeAll();
    }
    const s = S();
    return { dead: e.died != null, day: e.died != null ? e.died : Math.floor(s.time / 4), paid: e.died != null ? e.paidAtDeath : s.loan.n, done: e.died == null && s.loan.done, cart: s.cart.type, mark, trips: s.stats.trips, seen: e.seen, titles: e.titles, gold: Math.round(s.gold), robbed: s.stats.robbed, wins: s.stats.wins };
  } finally { Math.random = realRandom; }
}
function testBalance() {
  console.log('■ バランス（腕のいい自動商人・同じ種で毎回同じ結果）');
  const N = 16, DAYS = 250, dues = fresh().D.CONFIG.loan.dues;
  const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : null; };
  const group = (cart) => { const r = []; for (let i = 0; i < N; i++) r.push(play(1000 + i, cart, DAYS)); return r; };
  const line = (name, r) => {
    const dead = r.filter((x) => x.dead);
    console.log(`  ${name}： 完済 ${r.filter((x) => x.done).length}/${N}回 ／ 破産 ${dead.length}回` + (dead.length ? `（中央 ${med(dead.map((x) => x.day))}日目）` : '') +
      ` ／ 返済できた回数（中央）${med(r.map((x) => x.paid))}/${dues.length} ／ 所持金の最高（中央）${med(r.map((x) => x.mark.peak))}枚`);
  };
  const foot = group('basket'), hand = group('handcart'), full = group('horse');
  line('徒歩だけ（背負い籠）　', foot); line('手押し車まで　　　　　', hand); line('荷車を上げていく　　　', full);
  console.log(`    荷車を上げていく商人の買い替え（中央）： 手押し車 ${med(full.map((x) => x.mark.handcart).filter((x) => x != null))}日目 / ロバの荷車 ${med(full.map((x) => x.mark.donkey).filter((x) => x != null))}日目（${full.filter((x) => x.mark.donkey != null).length}回）/ 馬車 ${med(full.map((x) => x.mark.horse).filter((x) => x != null))}日目（${full.filter((x) => x.mark.horse != null).length}回）`);
  const all = foot.concat(hand, full), seen = {}, titles = {};
  for (const r of all) { Object.assign(seen, r.seen); Object.assign(titles, r.titles); }
  console.log('    通った場面： ' + Object.keys(seen).join(' / '));

  check('徒歩だけでは、30日ごとの返済を続けられない（全員が完済前に破産）', foot.every((x) => x.dead), `破産 ${foot.filter((x) => x.dead).length}/${N}`);
  check('徒歩だけだと、完済にはほど遠い（8回のうち5回まで）', med(foot.map((x) => x.paid)) <= 5 && Math.max.apply(null, foot.map((x) => x.paid)) <= 6, `中央 ${med(foot.map((x) => x.paid))}回`);
  check('ただし最初の返済は、徒歩でも払える（出だしで詰まない）', foot.filter((x) => x.paid >= 1).length >= N * 0.75, `${foot.filter((x) => x.paid >= 1).length}/${N}`);
  check('手押し車に上がれば、徒歩より長く返済を続けられる', med(hand.map((x) => x.paid)) > med(foot.map((x) => x.paid)), `中央 ${med(foot.map((x) => x.paid))}回 → ${med(hand.map((x) => x.paid))}回`);
  check('手押し車どまりでは完済できない（ロバや馬車に上がらないと厳しい）', hand.filter((x) => x.done).length <= N * 0.25, `完済 ${hand.filter((x) => x.done).length}/${N}`);
  check('荷車を上げていけば、返済を続けて完済できる', full.filter((x) => x.done).length >= N * 0.5, `完済 ${full.filter((x) => x.done).length}/${N}`);
  check('荷車を上げても、返済の進み方は手押し車どまりより上', med(full.map((x) => x.paid)) > med(hand.map((x) => x.paid)));
  check('腕のいい商人でも破産することがある（危険を感じる難しさ）', full.some((x) => x.dead), `破産 ${full.filter((x) => x.dead).length}/${N}`);
  check('関所・山賊・返済の場面をどれも通った', Object.keys(titles).some((k) => /関所/.test(k)) && Object.keys(seen).some((k) => /戦う|逃げる|通行料|荷の/.test(k)) && Object.keys(titles).some((k) => /日々のできごと/.test(k)));
  check('どの回も途中で止まらない', all.every((x) => x.dead || x.day >= DAYS));
}

// ---------- 既存のゲームに触っていないこと ----------
function testIsolation() {
  console.log('■ 既存のゲームとの分離');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), js = fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');
  check('shokai/ は自分のフォルダの中だけを読みこむ', !/\.\.\//.test(html));
  check('航海版のデータ（window.DATA）や保存名を使わない', !/window\.DATA|kaze-to-ho/.test(js));
  check('航海版のファイルが残っている', ['index.html', 'js/game.js', 'css/style.css', 'js/data/ports.js'].every((f) => fs.existsSync(path.join(ROOT, '..', f))));
}

const only = process.argv[2];
const tests = { data: testData, start: testStart, weight: testWeight, heard: testHeard, loan: testLoan, gate: testGate, bandits: testBandits, orders: testOrders, carts: testCartsShop, isolation: testIsolation, balance: testBalance };
for (const k in tests) if (!only || only === k) tests[k]();
console.log(fails ? `\n✗ 失敗 ${fails}件` : '\n✓ すべて合格');
process.exit(fails ? 1 : 0);
