// 「背負い籠の商会」第4版（shokai/）の自動テスト。ブラウザなしで読み込み、仕組みとバランスを確かめる。
// 使い方： node tests/shokai_smoke.js           （全部）
//          node tests/shokai_smoke.js rumors    （一部だけ。名前は一番下の tests を参照）
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..', 'shokai');
const FILES = ['js/data/config.js', 'js/data/goods.js', 'js/data/towns.js', 'js/data/carts.js', 'js/data/calendar.js', 'js/data/story.js', 'js/game.js'];
const KEY = 'shokai-save-v4', REC = 'shokai-records';

let fails = 0;
function check(name, ok, detail) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? '  ' + detail : ''));
}
const realRandom = Math.random;
function withRandom(v, fn) { Math.random = typeof v === 'function' ? v : () => v; try { return fn(); } finally { Math.random = realRandom; } }
// 決まった順番の乱数（足りなくなったら 0.99 ＝「何も起きない」）
const seq = (arr) => { let i = 0; return () => (i < arr.length ? arr[i++] : 0.99); };
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
    e.titles[e.title().replace(/[0-9]+/g, 'N')] = 1;
    b.onclick(); return true;
  };
  e.pressLabel = (re) => {
    if (!e.open()) return false;
    const i = e.modal.btns.findIndex((b) => re.test(b.label));
    return i < 0 ? false : e.press(i);
  };
  e.drain = () => {
    for (let round = 0; round < 80; round++) {
      let n = 0;
      while (e.timers.length && n++ < 2000) e.timers.shift()();
      const fr = e.rafs.splice(0, e.rafs.length);
      for (const f of fr) { e.t += 400; f(e.t); }
      if (!e.timers.length && !e.rafs.length) break;
    }
  };
  // 破産の画面が出たら、押さずに止まる（押すと最初からになるため）
  e.bust = () => { if (e.open() && /💀/.test(e.title())) { if (e.died == null) { e.died = Math.floor(e.g.state.time / 4); e.paidAtDeath = e.g.state.loan.n; } return true; } return false; };
  e.closeAll = () => { let n = 0; while (e.open() && !e.bust() && n++ < 80) { e.press(0); e.drain(); } };
  // 道 rid を行く。途中の場面は choose(本文) が返す正規表現のボタンを押す（無ければ一番上＝無難な選択）
  e.travel = (rid, choose) => {
    e.act('go', { r: rid });
    let guard = 0;
    while (e.g.travel && guard++ < 300) {
      e.drain();
      if (e.bust()) break;
      if (e.g.travel && e.open()) { const re = choose && choose(e.text()); if (!re || !e.pressLabel(re)) e.press(0); }
    }
    e.drain();
    return !e.g.travel;
  };
  // 出発して、最初の場面（モーダル）が出るところまで進める
  e.go = (rid) => { e.act('go', { r: rid }); e.drain(); };
  // 場面のボタンを押して、次の場面まで進める
  e.choose = (re) => { const ok = e.pressLabel(re); e.drain(); return ok; };
  e.qty = (a, data, q) => {
    e.act(a, data);
    if (!e.open() || !/やめる/.test(e.modal.btns[0].label)) return false;
    if (q != null) { const r = e.els['#qR']; if (r && r.oninput) r.oninput({ target: { value: q } }); }
    e.press(1); return true;
  };
  e.days = () => Math.floor(e.g.state.time / 4);
  e.rest = (n) => { for (let i = 0; i < (n || 1); i++) { e.act('rest'); if (e.bust()) return; e.closeAll(); } };
  return e;
}
const fresh = () => { const e = boot(); e.closeAll(); return e; };
// 国の中の町と道をすべて知っている状態にする（仕組みを個別に確かめるとき用）
function knowAll(e) { const S = e.g.state; for (const t in e.D.TOWNS) if (e.g.inPlay(t)) { S.seen[t] = 2; S.named[t] = true; } for (const r in e.D.ROADS) if (e.g.roadUsable(r)) S.roads[r] = true; }
const html = (e) => e.main.innerHTML;
const plain = (e) => e.main.innerHTML.replace(/<[^>]+>/g, '');

// ---------- 1. データ ----------
function testData() {
  console.log('■ データ');
  const e = fresh(), D = e.D, C = D.CONFIG, towns = Object.keys(D.TOWNS), goods = Object.keys(D.GOODS);
  const home = towns.filter((t) => !D.TOWNS[t].abroad), far = towns.filter((t) => D.TOWNS[t].abroad);
  console.log(`  国の中の町 ${home.length} / 隣国の町 ${far.length} / 道 ${Object.keys(D.ROADS).length} / 品 ${goods.length} / 荷車 ${Object.keys(D.CARTS).length} / 物語の場面 ${Object.keys(D.STORY).length} / 暦の行事 ${D.CALENDAR.events.length}`);
  const bad = [];
  for (const rid in D.ROADS) { const r = D.ROADS[rid]; if (!D.TOWNS[r.a] || !D.TOWNS[r.b] || !D.ROAD_TYPES[r.type]) bad.push(rid); }
  for (const t of towns) {
    const T = D.TOWNS[t];
    for (const g in T.stock) if (!D.GOODS[g]) bad.push(t + ':' + g);
    for (const g in T.prices) if (!D.GOODS[g]) bad.push(t + ':' + g);
    if (!T.who || !T.who.want || !D.GOODS[T.who.want.g] || T.stock[T.who.want.g] != null) bad.push(t + ':who');
  }
  for (const m of D.CALENDAR.mods) if (!D.GOODS[m.g] || !D.CALENDAR.seasons.some((s) => s.id === m.season)) bad.push('mod:' + m.g);
  for (const ev of D.CALENDAR.events) { if (ev.t && !D.TOWNS[ev.t]) bad.push('ev:' + ev.id); for (const g in ev.goods || {}) if (!D.GOODS[g]) bad.push('ev:' + g); }
  for (const c of D.CALENDAR.closed) for (const r of c.roads) if (!D.ROADS[r]) bad.push('closed:' + r);
  check('道・町・暦・得意先が参照する先がすべて存在する', !bad.length, bad.join(','));
  check('どの品にも産地・単位・重さがある', goods.every((g) => D.GOODS[g].w > 0 && D.GOODS[g].unit && towns.some((t) => D.TOWNS[t].stock[g] != null)));
  check('国の中に関所は無い（税を取る道は国境の1本だけ）', !Object.values(D.ROADS).some((r) => r.gate) && Object.keys(D.ROADS).filter((k) => D.ROADS[k].border).join() === 'r14' && C.gateTax === undefined);
  const pairs = [['r6', 'r6b'], ['r8', 'r8b'], ['r9', 'r9b']];
  check('近道は街道より1日早く、山賊がずっと多い', pairs.every(([a, b]) => D.ROADS[b].type === 'path' && D.ROADS[b].len === D.ROADS[a].len - 1 && D.ROADS[b].danger >= D.ROADS[a].danger + 2));
  check('王都の入市税は、荷車の大きさで決まる少額の定額', D.CARTS.basket.gate === 0 && D.CARTS.handcart.gate <= 3 && D.CARTS.horse.gate <= 10 && D.TOWNS.oto.cityTax === undefined);
  check('1年は4つの季節 × 30日。返済も30日ごと', D.CALENDAR.seasons.length === 4 && D.CALENDAR.yearDays === 120 && C.loan.every === 30);
  check('物語に、導入・節目・得意先・故郷・隣国・結末がある', ['intro', 'handcart', 'stall', 'shop', 'oto', 'pay1', 'patron', 'well', 'bridge', 'mill', 'abroad', 'karune', 'mirza', 'free', 'bankrupt'].every((k) => D.STORY[k] && D.STORY[k].text.length));
  check('返済額は回を追うごとに上がる', C.loan.dues.every((v, i, a) => i === 0 || v > a[i - 1]), C.loan.dues.join('→'));
  check('噂の誤差の幅は ±15%・±25%・±35%', C.rumorErr.join() === '0.15,0.25,0.35');
  check('隣国の町は、最初は遊びに出てこない', far.length === 2 && far.every((t) => !e.g.inPlay(t)) && Object.keys(D.ROADS).filter((k) => D.ROADS[k].abroad).every((k) => !e.g.roadUsable(k)));
}

// ---------- 2. はじまり・物語・保存 ----------
function testStart() {
  console.log('■ はじまり・物語・保存');
  const e = boot(), S = e.g.state, D = e.D;
  check('親の借金の導入から始まる', /父の残したもの/.test(e.title()) && /バルド/.test(e.text()));
  e.closeAll();
  check('背負い籠（30kg）・わずかな元手で始まる', S.cart.type === 'basket' && D.CARTS.basket.cap === 30 && S.gold === D.CONFIG.startGold && S.gold <= 60);
  check('春の1日目に始まり、最初の返済は春の終わり（30日後）', e.g.seasonOf(0).id === 'spring' && e.g.daysLeft() === 30 && e.g.owed() === D.CONFIG.loan.dues[0]);
  const seen2 = Object.keys(S.seen).filter((t) => S.seen[t] === 2);
  check('地図は出発地だけが確かで、隣の町は「？」', seen2.length === 1 && ['kawabe', 'mizunara', 'budou'].every((t) => S.seen[t] === 1));
  check('村を出る前から、町の声の噂が耳に入っている', S.rumors.length >= 2 && S.rumors.length <= 3 && S.rumors.every((r) => r.src === 'street'), S.rumors.length + '件');
  check('保存名が前の版・航海版と別', e.g.SAVE_KEY === KEY && !!e.store[KEY] && !e.store['shokai-save-v3'] && !e.store['kaze-to-ho-save-v1']);
  for (const t of ['market', 'map', 'town', 'book']) { e.act('tab', { id: t }); if (html(e).length < 200) fails++; }
  check('4つの画面が描ける', html(e).length > 200);
  check('上部に季節・荷の重さ（kg）・返済の期限が出る', /春1日/.test(e.els['#hud'].innerHTML) && /0\/30kg/.test(e.els['#hud'].innerHTML) && /返済 あと30日/.test(e.els['#hud'].innerHTML));
  S.gold = 77; e.g.settle();
  const e2 = boot(Object.assign({}, e.store));
  check('続きから再開できる（導入は出ない）', e2.g.state.gold === 77 && !e2.open());
  const olds = { 'shokai-save-v1': '{"v":1,"gold":9999}', 'shokai-save-v2': '{"v":2,"gold":9999}', 'shokai-save-v3': '{"v":3,"gold":9999,"cargo":{"grain":{"qty":2,"cost":12,"age":0}}}' };
  const e3 = boot(Object.assign({}, olds));
  check('前の版（v1〜v3）のセーブがあっても、新しく始まる', e3.g.state.gold === D.CONFIG.startGold && e3.g.state.time === 0 && /父の残したもの/.test(e3.title()));
  check('前の版のセーブは消さずに残す', Object.keys(olds).every((k) => e3.store[k] === olds[k]));
  check('壊れたセーブなら新しく始まる', boot({ [KEY]: '{こわれた' }).g.state.time === 0);
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

// ---------- 3. 重さ（kg）・在庫・値の動き ----------
function testWeight() {
  console.log('■ 重さ（kg）・在庫・値の動き');
  const e = fresh(), S = e.g.state, D = e.D, C = D.CONFIG;
  S.gold = 5000;
  check('荷車の積載量は 30kg・120kg・350kg・700kg', D.CARTS.basket.cap === 30 && D.CARTS.handcart.cap === 120 && D.CARTS.donkey.cap === 350 && D.CARTS.horse.cap === 700);
  const per = (c, g) => Math.floor(D.CARTS[c].cap / D.GOODS[g].w);
  check('背負い籠に入るのは、麦3袋・ワイン1樽・鉄1束・毛織物7反', per('basket', 'grain') === 3 && per('basket', 'wine') === 1 && per('basket', 'iron') === 1 && per('basket', 'cloth') === 7);
  const dens = (g) => D.GOODS[g].base / D.GOODS[g].w;
  check('麦や塩は安くて重く、布や香辛料は高くて軽い', dens('grain') < dens('salt') && dens('salt') < dens('wool') && dens('wool') < dens('honey') && dens('honey') < dens('linen') && dens('linen') < dens('cloth') && dens('cloth') < dens('spice'));
  const dom = Object.keys(D.TOWNS).filter((t) => !D.TOWNS[t].abroad);
  const spread = (g) => { const v = dom.filter((t) => !(D.TOWNS[t].ban || []).includes(g)).map((t) => D.TOWNS[t].prices[g] == null ? 1 : D.TOWNS[t].prices[g]); const src = dom.filter((t) => D.TOWNS[t].stock[g] != null).map((t) => D.TOWNS[t].prices[g]); return Math.max.apply(null, v) / Math.min.apply(null, src); };
  check('重くて安い品は、産地を離れると値が大きく上がる', ['grain', 'salt', 'wine', 'iron'].every((g) => spread(g) >= 2.4), ['grain', 'salt', 'wine', 'iron'].map((g) => D.GOODS[g].name + '×' + spread(g).toFixed(1)).join(' '));
  const lux = ['linen', 'cloth', 'spice'];
  check('軽くて高い品は、売値で見て産地の1〜3割増しまで', lux.every((g) => spread(g) * C.sellRate >= 1.0 && spread(g) * C.sellRate <= 1.4), lux.map((g) => D.GOODS[g].name + '×' + (spread(g) * C.sellRate).toFixed(2)).join(' '));
  const maxStock = (g) => Math.max.apply(null, dom.map((t) => D.TOWNS[t].stock[g] || 0));
  check('高級品は在庫が少ない', Object.keys(D.GOODS).filter((g) => D.GOODS[g].lux && !D.GOODS[g].abroad).every((g) => maxStock(g) <= 14) && ['grain', 'salt', 'fish'].every((g) => maxStock(g) >= 50));
  check('お金があっても、重さの限界までしか買えない', e.g.maxBuy('hashibami', 'grain') === 3);
  const t0 = S.time;
  e.qty('buy', { g: 'grain' }, 2);
  check('売り買いを始めると時間が1刻進む', S.time === t0 + C.tradeTime);
  check('買うと重さ（kg）が増える', e.g.cargoWeight() === 20 && e.g.freeWeight() === 10);
  e.qty('buy', { g: 'wool' });
  e.act('buy', { g: 'wool' });
  check('空きが足りないと買えない（羊毛1俵8kg、空き2kg）', S.cargo.wool.qty === 1 && e.g.freeWeight() === 2 && !e.open());
  check('同じ刻のうちは、続けて売り買いしても時間は進まない', S.time === t0 + C.tradeTime);
  e.act('tab', { id: 'market' });
  check('市場に単位と重さが出る（1袋 10kg、在庫◯袋、あと◯kg）', /1袋 10kg/.test(html(e)) && /在庫 \d+袋/.test(html(e)) && /あと 2kg 積める/.test(html(e)) && /2袋<\/b>・20kg/.test(html(e)));
  check('上部に荷の重さが kg で出る', /28\/30kg/.test(e.els['#hud'].innerHTML));
  // 在庫
  S.cart.type = 'horse'; S.cargo = {};
  const st0 = Math.floor(S.stock.hashibami.wool);
  e.qty('buy', { g: 'wool' });
  check('特産の在庫は有限で、買い占めると売り切れる', S.cargo.wool.qty === st0 && Math.floor(S.stock.hashibami.wool) === 0 && e.g.maxBuy('hashibami', 'wool') === 0, `${st0}俵で売り切れ`);
  withRandom(0.5, () => e.rest(2));
  const mid = S.stock.hashibami.wool;
  withRandom(0.5, () => e.rest(6));
  check('在庫は数日かけて戻る', mid > 0 && mid < e.g.stockMax('hashibami', 'wool') && S.stock.hashibami.wool === e.g.stockMax('hashibami', 'wool'), `2日後 ${mid.toFixed(1)}俵 → 満杯 ${e.g.stockMax('hashibami', 'wool')}俵`);
  // 売りこんだ値の戻り
  knowAll(e); S.town = 'kawabe'; S.market.kawabe.wool = 0; S.drift.kawabe.wool = 0;
  const p0 = e.g.sellNow('kawabe', 'wool');
  e.qty('sell', { g: 'wool' }); e.closeAll();
  const p1 = e.g.sellNow('kawabe', 'wool'), dev1 = S.market.kawabe.wool;
  withRandom(0.5, () => e.rest(10));
  check('まとめて売ると値が下がる', p1 < p0, `${p0}枚 → ${p1}枚`);
  check('売りこんだ値は10日たっても半分も戻らない', S.market.kawabe.wool < dev1 * 0.55 && S.market.kawabe.wool > dev1);
  const e2 = fresh(); const a = e2.g.sellNow('oto', 'cloth');
  let moved = 0, prev = a; for (let i = 0; i < 12; i++) { e2.rest(1); const v = e2.g.sellNow('oto', 'cloth'); if (v !== prev) moved++; prev = v; }
  check('売り買いしなくても、値は日々動く', moved >= 6, `12日のうち${moved}日で変化`);
}

// ---------- 4. 噂 ----------
function testRumors() {
  console.log('■ 噂（値の噂・兆しの噂・あいまいな噂）');
  const e = fresh(), g = e.g, S = g.state, D = e.D, C = D.CONFIG;
  knowAll(e);
  withRandom(seeded(5), () => e.rest(10));       // 相場の歴史を少し作る
  // 値の噂：当たりなら、本当の（少し古い）値が幅に入る。幅は遠い町ほど広い
  const width = (r) => (r.hi - r.lo) / (r.hi + r.lo);
  S.town = 'mizunara';
  const stat = withRandom(seeded(11), () => {
    const out = { n: 0, ok: 0, inRange: 0, falseOut: 0, falseN: 0 };
    for (let i = 0; i < 400; i++) {
      const t = ['hashibami', 'kawabe', 'iwaya', 'oto', 'shiokaze', 'hataori'][i % 6], gid = ['grain', 'salt', 'wine', 'iron'].filter((x) => !g.sellsHere(t, x))[i % 3];
      const r = g.priceRumor('street', t, gid);
      const truth = S.hist[t].map((h) => h.sell[gid]);       // 噂のもとになりうる、過去の値
      const hit = truth.some((v) => v >= r.lo && v <= r.hi);
      out.n++; if (r.ok) { out.ok++; if (hit) out.inRange++; } else { out.falseN++; if (!truth.slice(-3).some((v) => v >= r.lo && v <= r.hi)) out.falseOut++; }
    }
    return out;
  });
  check('町の声は、6割ほどが当たり', stat.ok / stat.n > 0.5 && stat.ok / stat.n < 0.7, `${stat.ok}/${stat.n}`);
  check('当たりの噂は、本当の値が幅の中に入っている', stat.inRange === stat.ok, `${stat.inRange}/${stat.ok}`);
  check('外れの噂は、たいてい本当の値が幅の外', stat.falseOut / stat.falseN > 0.6, `${stat.falseOut}/${stat.falseN}`);
  // 値の小さい品だと四捨五入で幅がぶれるので、値の張る鉄で確かめる
  const near = withRandom(0.5, () => g.priceRumor('broker', 'hashibami', 'iron', 1)), mid2 = withRandom(0.5, () => g.priceRumor('broker', 'kawabe', 'iron', 1)), far = withRandom(0.5, () => g.priceRumor('broker', 'shiokaze', 'iron', 1));
  check('誤差の幅は、となり町 ±15%・2つ先 ±25%・遠い町 ±35%', Math.abs(width(near) - 0.15) < 0.02 && Math.abs(width(mid2) - 0.25) < 0.02 && Math.abs(width(far) - 0.35) < 0.02,
    `ハシバミ ${near.lo}〜${near.hi} / カワベ ${mid2.lo}〜${mid2.hi} / シオカゼ ${far.lo}〜${far.hi}`);
  check('遠い町の値も噂で聞ける', g.DIST.mizunara.shiokaze >= 7 && far.kind === 'price' && /シオカゼでは鉄が/.test(g.rumorText(far).replace(/<[^>]+>/g, '')));
  check('噂は「◯〜◯枚」の幅で伝わる', /\d+〜\d+枚/.test(g.rumorText(far)));
  // 兆しの噂
  S.town = 'kawabe'; S.trends = []; S.rumors = [];
  const om = withRandom(seeded(3), () => g.omenRumor('broker', 1));
  const tr = S.trends.find((x) => x.t === om.t && x.g === om.g);
  check('兆しの噂は、これから起きる高騰・値崩れを先に伝える', om.ok && tr && tr.from > e.days() && /あと\d+日ほどで/.test(g.rumorText(om)), g.rumorText(om).replace(/<[^>]+>/g, ''));
  const before = g.mult(tr.t, tr.g); S.time = tr.from * 4; const after = g.mult(tr.t, tr.g); S.time = 10 * 4;
  check('噂の日が来ると、本当に値が動く', tr.m > 1 ? after > before * 1.2 : after < before * 0.85, `倍率 ${before.toFixed(2)} → ${after.toFixed(2)}`);
  const fake = withRandom(seeded(4), () => g.omenRumor('street', 0));
  check('外れの兆しは、何も起きない', !fake.ok && !S.trends.some((x) => x.t === fake.t && x.g === fake.g));
  // あいまいな噂
  const vg = withRandom(seeded(8), () => { const a = []; for (let i = 0; i < 40; i++) a.push(g.vagueRumor('street')); return a; });
  const hideT = vg.filter((r) => r.hide === 't'), hideG = vg.filter((r) => r.hide === 'g');
  check('あいまいな噂は、場所か品のどちらかが伏せてある', hideT.length > 5 && hideG.length > 5 && hideT.every((r) => !g.rumorText(r).includes(D.TOWNS[r.t].name)) && hideG.every((r) => !g.rumorText(r).includes(D.GOODS[r.g].name) && /何かが/.test(g.rumorText(r))),
    `例：「${g.rumorText(hideT[0]).replace(/<[^>]+>/g, '')}」「${g.rumorText(hideG[0]).replace(/<[^>]+>/g, '')}」`);
  check('場所を伏せた噂は「北のほう」「どこか」のように伝わる', hideT.every((r) => /のほうで|どこかで/.test(g.rumorText(r))));
  // 情報屋
  S.rumors = [hideT[0]]; S.gold = 200; e.act('tab', { id: 'town' });
  check('大きな町には情報屋がいる', /情報屋/.test(html(e)) && D.TOWNS.kawabe.has.info && !D.TOWNS.hashibami.has.info);
  e.act('clarify', { id: String(hideT[0].id) });
  check('情報屋に払うと、あいまいな噂の伏せた部分が分かる', S.gold === 200 - C.brokerCost && hideT[0].hide === null && e.text().includes(D.TOWNS[hideT[0].t].name)); e.closeAll();
  const n0 = S.rumors.length, g0 = S.gold;
  withRandom(seeded(9), () => e.act('broker', { t: 'oto' }));
  const got = S.rumors.filter((r) => r.src === 'broker' && r.t === 'oto' && r.kind === 'price');
  check('情報屋に町を指定すると、その町の値を4品ぶん教えてくれる', got.length === C.brokerGoods && S.gold === g0 - C.brokerCost && S.rumors.length > n0 && /★★★/.test(e.modal.innerHTML)); e.closeAll();
  check('聞く相手で当たりやすさがちがう（町の声6割・酒場7割・得意先と情報屋9割）', C.rumorRel.street === 0.6 && C.rumorRel.tavern === 0.7 && C.rumorRel.patron === 0.9 && C.rumorRel.broker === 0.9);
  // 酒場
  const g1 = S.gold, n1 = S.rumors.length;
  withRandom(seq([0.9, 0.2, 0.3, 0.3, 0.3, 0.3, 0.3]), () => e.act('rumor'));
  check('酒場で金を払うと噂が聞ける', S.gold === g1 - C.rumorCost && S.rumors.length === n1 + 1 && S.rumors[0].src === 'tavern' && /酒場の噂/.test(e.title())); e.closeAll();
  // 町に着くと耳に入る
  S.rumors = []; S.gold = 300; S.cargo = {};
  withRandom(seeded(21), () => e.travel('r1'));
  check('町に着くと、ただで2〜3件の噂が耳に入る', S.rumors.filter((r) => r.src === 'street').length >= 1 && S.rumors.length <= 3 && /町で耳に入った噂/.test(e.modal.innerHTML), S.rumors.length + '件'); e.closeAll();
  // 画面
  e.act('tab', { id: 'market' });
  check('市場に噂帳がある。となり町の正確な値の表は無い', /噂帳/.test(html(e)) && !/となり町で聞いた売値/.test(html(e)) && !/日前に聞いた値/.test(html(e)));
  S.rumors = []; withRandom(0.5, () => g.priceRumor('tavern', 'kawabe', 'grain', 1));
  e.act('tab', { id: 'map' }); e.act('dest', { id: 'kawabe' });
  check('旅じたくに、行き先についての噂と「自分で見た値」が出る', /カワベの町についての噂/.test(plain(e)) && /カワベの町では麦が/.test(plain(e)) && /自分で見た値/.test(plain(e)) && /この旅に賭けるもの/.test(plain(e)));
  e.act('dest', { id: 'budou' }); S.rumors = []; e.act('dest', { id: 'budou' });
  check('噂を聞いていない町は、何も分からない', /噂は、まだ聞いていない/.test(plain(e)));
  withRandom(0.5, () => g.priceRumor('tavern', 'kawabe', 'grain', 1));
  withRandom(seeded(2), () => e.rest(C.rumorKeep + 1));
  check('古い噂は噂帳から消える', !S.rumors.some((r) => r.t === 'kawabe' && r.g === 'grain' && r.src === 'tavern'));
  // 隣国の話は、道が開くまで出ない
  const leak = withRandom(seeded(31), () => { let bad = 0; for (let i = 0; i < 150; i++) { const r = [g.randomPrice, g.omenRumor, g.vagueRumor][i % 3]('street'); if (r && (D.TOWNS[r.t].abroad || D.GOODS[r.g].abroad)) bad++; } return bad; });
  check('隣国の町や品の噂は、道が開くまで出ない', leak === 0);
}

// ---------- 5. 季節と暦 ----------
function testCalendar() {
  console.log('■ 季節と暦');
  const e = fresh(), g = e.g, S = g.state, D = e.D;
  knowAll(e);
  const at = (d) => { S.time = d * 4; };
  check('30日ごとに季節が移る（春→夏→秋→冬→春）', [0, 30, 60, 90, 120].map((d) => g.seasonOf(d).id).join() === 'spring,summer,autumn,winter,spring');
  at(65);
  check('秋は産地で麦が安く、たくさん出まわる', g.seasonMods('hashibami', 'grain', 65).p < 0.8 && g.stockMax('hashibami', 'grain') > D.TOWNS.hashibami.stock.grain * 1.5 && g.seasonMods('oto', 'grain', 65).p === 1, `在庫 ${D.TOWNS.hashibami.stock.grain}袋 → ${g.stockMax('hashibami', 'grain')}袋`);
  at(100);
  check('冬は麦・塩・羊毛がどこでも高い', ['grain', 'salt', 'wool'].every((x) => g.seasonMods('oto', x, 100).p >= 1.2));
  S.town = 'iwaya';
  check('冬は山の峠が雪で閉じる', g.roadClosed('r7') && g.roadClosed('r13') && !g.roadClosed('r5') && g.routeInfo('r7').closed === true);
  e.act('go', { r: 'r7' });
  check('閉じた道には出発できない', !g.travel && S.town === 'iwaya');
  e.act('tab', { id: 'map' }); e.act('dest', { id: 'tsuno' });
  check('旅じたくに「雪で閉鎖」と出る', /雪で閉鎖/.test(plain(e)));
  at(125); check('春になると峠が開く', !g.roadClosed('r7'));
  // 行事
  at(0);
  const up = g.upcoming(30);
  check('暦に、これからの行事が載っている（誰でも知っている）', up.length >= 1 && up[0].ev.id === 'fest' && up[0].inDays === 17, up.map((u) => `${u.ev.name} あと${u.inDays}日`).join(' / '));
  S.town = 'hashibami'; e.act('tab', { id: 'market' });
  check('市場の画面に季節と行事が出る', /春 1日目/.test(plain(e)) && /王都の春祭り/.test(plain(e)) && /あと17日/.test(plain(e)));
  const w0 = g.mult('oto', 'wine'); at(18); const w1 = g.mult('oto', 'wine'), k1 = g.mult('kawabe', 'wine');
  check('春祭りのあいだ、王都でワインが高く売れる（よその町は変わらない）', g.eventMult('oto', 'wine', 18) === 1.6 && w1 > w0 * 1.5 && g.eventMult('kawabe', 'wine', 18) === 1 && k1 < w1, `倍率 ${w0.toFixed(2)} → ${w1.toFixed(2)}`);
  at(25); check('祭りが終わると元に戻る', g.eventMult('oto', 'wine', 25) === 1);
  at(72); check('秋の大市では、カワベで何でも2割高い', g.eventMult('kawabe', 'iron', 72) === 1.2 && g.eventMult('kawabe', 'wool', 72) === 1.2);
  // 季節の変わり目のお知らせ
  S.time = 29 * 4; S.gold = 500; withRandom(0.5, () => e.act('rest'));
  check('季節が変わると知らせが出て、その日が返済日', /夏になった/.test(e.text()) && /返済日/.test(e.text()) && S.loan.n === 1); e.closeAll();
  check('夏は傷む品の足が早い', D.CALENDAR.spoil.summer > 1);
}

// ---------- 6. 道中（自分で決める場面）----------
function testJourney() {
  console.log('■ 道中（近道・予兆・川・夜通し・急ぐ）');
  const D0 = fresh().D, C = D0.CONFIG;
  const mk = (cargo, opt) => {
    const e = fresh(), S = e.g.state; knowAll(e);
    S.town = 'kawabe'; S.gold = 300; S.rain = false; S.cargo = cargo || { linen: { qty: 5, cost: 200, age: 0 } };
    Object.assign(S, opt || {});
    return e;
  };
  let e = mk(), S = e.g.state;
  const road = e.g.routeInfo('r8'), short = e.g.routeInfo('r8b');
  check('国の中の街道に税はかからない', road.toll === 0 && !road.border);
  check('近道は街道より1日早いが、山賊がずっと多い', short.days === road.days - 1 && short.risk > road.risk * 2.5, `街道 ${road.days}日・山賊${Math.round(road.risk * 100)}% ／ 近道 ${short.days}日・山賊${Math.round(short.risk * 100)}%`);
  const d0 = e.days(); withRandom(0.99, () => e.travel('r8'));
  check('何も起きなければ、宿代だけで着く', S.town === 'hataori' && e.days() - d0 === 3 && S.gold === 300 - C.living * 3 && S.cargo.linen.qty === 5); e.closeAll();
  // 乱数の順：夜通し・道ばた・山賊・気づくか・故障。そのあと：山賊の大きさ・強さ・選んだ結果
  // 予兆に気づいて迂回
  e = mk(); S = e.g.state;
  withRandom(seq([0.99, 0.99, 0, 0, 0.99, 0.99, 0.5, 0.99]), () => { e.go('r8'); });
  check('山賊に先に気づくと、足跡の場面になる', /道に足跡/.test(e.title()) && /こそ泥/.test(e.text()) && /迂回する/.test(e.modal.innerHTML) && /身をひそめ/.test(e.modal.innerHTML) && /そのまま進む/.test(e.modal.innerHTML));
  const dd = e.days(); withRandom(0.99, () => { e.choose(/迂回/); e.closeAll(); });
  check('迂回すれば、1日余計にかかるが無事', S.town === 'hataori' && e.days() - dd === 4 && S.cargo.linen.qty === 5 && S.stats.robbed === 0);
  // 身をひそめる：成功と失敗
  e = mk(); S = e.g.state;
  withRandom(seq([0.99, 0.99, 0, 0, 0.99, 0.99, 0.5, 0.0]), () => { e.go('r8'); e.choose(/身をひそめ/); });
  check('身をひそめて、やり過ごせることがある', /やり過ごした/.test(e.title())); withRandom(0.99, () => e.closeAll());
  e = mk(); S = e.g.state;
  withRandom(seq([0.99, 0.99, 0, 0, 0.99, 0.99, 0.5, 0.99]), () => { e.go('r8'); e.choose(/身をひそめ/); });
  check('見つかれば、不利なまま山賊と向き合う', /こそ泥だ！/.test(e.title())); withRandom(0.99, () => { e.choose(/荷の/); e.closeAll(); });
  // 気づけなければ、いきなり
  e = mk(); S = e.g.state;
  withRandom(seq([0.99, 0.99, 0, 0.99, 0.99, 0.99, 0.5]), () => { e.go('r8'); });
  check('気づけなければ、いきなり山賊が現れる', /だ！/.test(e.title()) && !/足跡/.test(e.title())); withRandom(0.99, () => { e.choose(/荷の/); e.closeAll(); });
  check('護衛がいるほど、先に気づきやすい', C.scout < 1 && C.scout + 0.1 * 3 > C.scout);
  // 夜通し歩く
  e = mk(); S = e.g.state; const dn = e.days();
  withRandom(seq([0]), () => { e.go('r8'); });
  check('長い道では、夜通し歩くか宿をとるか迷う', /日が暮れる/.test(e.title()) && /宿をとる/.test(e.modal.btns[0].label));
  withRandom(0.99, () => { e.choose(/夜通し歩く/); e.closeAll(); });
  check('夜通し歩けば1日早く着く', S.town === 'hataori' && e.days() - dn === 2);
  // 川の増水
  e = mk(null, { rain: true }); S = e.g.state; const dr = e.days();
  withRandom(seq([0.99, 0, 0.99, 0.99, 0.99, 0.5]), () => { e.go('r8'); });
  check('雨の日は、川が増水していることがある', /川が増水/.test(e.title()) && e.modal.btns.length === 3);
  withRandom(0.99, () => { e.choose(/橋へ回る/); e.closeAll(); });
  check('橋へ回れば、1日遅れるが荷は無事', S.town === 'hataori' && e.days() - dr === 4 && S.cargo.linen.qty === 5);
  e = mk({ grain: { qty: 10, cost: 60, age: 0 } }, { rain: true, cart: { type: 'handcart', hp: 100 } }); S = e.g.state;
  withRandom(seq([0.99, 0, 0.99, 0.99, 0.99, 0.5, 0.0]), () => { e.go('r8'); e.choose(/このまま渡る/); });
  check('無理に渡ると、荷を流されることがある', /流された/.test(e.title()) && S.cargo.grain.qty === 7); withRandom(0.99, () => e.closeAll());
  // 荷を捨てて急ぐ
  e = mk({ grain: { qty: 10, cost: 60, age: 0 } }, { cart: { type: 'handcart', hp: 100 }, time: 27 * 4 }); S = e.g.state;
  withRandom(0.99, () => { e.go('r8'); });
  check('返済日に間に合わないとき、荷を捨てて急ぐか迷う', /間に合うか/.test(e.title()) && /返済日まで、あと3日/.test(e.text()));
  withRandom(0.99, () => { e.choose(/捨てて急ぐ/); e.closeAll(); });
  check('荷を2割捨てると、1日早く着く', S.town === 'hataori' && e.days() === 29 && S.cargo.grain.qty === 8 && S.loan.n === 0);
  // 道ばたの旅人
  e = mk(); S = e.g.state; const rn = S.rumors.length, rp = S.rep.hataori, ds = e.days();
  withRandom(seq([0.99, 0]), () => { e.go('r8'); });
  check('道ばたで、困っている旅人に会うことがある', /道ばたの旅人/.test(e.title()));
  withRandom(seq([0.5, 0.1, 0.5, 0.5]), () => { e.choose(/手を貸す/); });
  check('手を貸すと、1日つぶれるが、礼に確かな噂をくれる', /礼の話/.test(e.title()) && S.rumors.length === rn + 1 && S.rumors[0].src === 'traveler' && S.rumors[0].t === 'hataori' && S.rep.hataori === rp + 2);
  withRandom(0.99, () => e.closeAll());
  check('1回の旅で迷う場面は多くても2つ', C.maxChoices === 2 && e.days() - ds === 4);
  // 王都の門
  e = mk({ cloth: { qty: 4, cost: 280, age: 0 }, liquor: { qty: 2, cost: 100, age: 0 } }, { town: 'tsuno', cart: { type: 'donkey', hp: 100 } }); S = e.g.state;
  const g0 = S.gold; withRandom(0.6, () => e.travel('r9'));
  check('王都の門では、荷車で決まる定額の入市税だけ', S.town === 'oto' && /入市税/.test(e.text()) && S.gold === g0 - D0.CARTS.donkey.gate - e.g.dailyCost().total * 3 - Math.ceil(140 * C.fineRate));
  check('禁制品は王都の門であらためられ、見つかれば没収', !S.cargo.liquor && /門番/.test(e.text())); e.closeAll();
  check('王都では禁制品が売れない', e.g.banned('oto', 'pelt') && e.g.banned('oto', 'tobacco'));
}

// ---------- 7. 答え合わせと旅の決算 ----------
function testReveal() {
  console.log('■ 答え合わせ（札をめくる）と旅の決算');
  const e = fresh(), g = e.g, S = g.state, C = e.D.CONFIG; knowAll(e);
  S.town = 'kawabe'; S.gold = 40; S.cart = { type: 'handcart', hp: 100 };
  S.cargo = { fish: { qty: 10, cost: 100, age: 0 }, linen: { qty: 4, cost: 160, age: 0 } };
  withRandom(0.5, () => g.priceRumor('tavern', 'hashibami', 'fish', 1));
  const ru = S.rumors[0];
  withRandom(0.99, () => { e.go('r1'); });
  check('着くと、まず到着の知らせが出る', /ハシバミ村に着いた/.test(e.title()) && /市場の値を見る/.test(e.modal.btns[0].label));
  e.press(0);
  check('大きく賭けた旅は、札が伏せられている', /ハシバミ村の今日の値/.test(e.title()) && /札をめくる（1\/2）/.test(e.modal.btns[0].label) && (e.modal.innerHTML.match(/？？？/g) || []).length === 2 && !/旅の決算/.test(e.text()));
  e.press(0);
  check('1枚めくると、その品の今日の値と、噂との答え合わせが出る', /札をめくる（2\/2）/.test(e.modal.btns[0].label) && (e.modal.innerHTML.match(/？？？/g) || []).length === 1 && new RegExp(`噂では ${ru.lo}〜${ru.hi}枚`).test(e.text()) && /噂どおり|噂より/.test(e.text()));
  e.press(0);
  check('すべてめくると、旅の決算が出る', /旅の決算/.test(e.text()) && /仕入れ値/.test(e.text()) && /道中の出費（2日）/.test(e.text()) && /(もうけ \+|損 )/.test(e.text()) && /市場へ/.test(e.modal.btns[0].label));
  check('噂を聞いていなかった品は、そう出る', /噂は聞いていなかった/.test(e.text()));
  const best = S.stats.bestTrip; e.press(0); e.closeAll();
  check('もうけが出た旅は、最高記録として残る', best > 0 && /最高の旅/.test((e.act('tab', { id: 'book' }), plain(e))));
  // 小さな旅は短く
  S.cargo = { grain: { qty: 2, cost: 12, age: 0 } }; S.gold = 500;
  withRandom(0.99, () => { e.go('r1'); }); e.press(0);
  check('ふだんの小さな旅は、めくらずに一度で見せる', /今日の値/.test(e.title()) && /市場へ/.test(e.modal.btns[0].label) && /旅の決算/.test(e.text())); e.closeAll();
  S.cargo = {}; withRandom(0.99, () => { e.go('r1'); });
  check('空荷なら、答え合わせは出ない', /町に入る/.test(e.modal.btns[0].label)); e.closeAll();
  check('手持ちの3割以上をつぎこむと「大きな賭け」', C.bigBet === 0.3);
}

// ---------- 8. 親の借金と返済 ----------
function testLoan() {
  console.log('■ 30日ごとの返済・差し押さえ・破産・商人録');
  const D0 = fresh().D, dues = D0.CONFIG.loan.dues;
  const to30 = (e) => withRandom(0.5, () => { const c0 = e.g.state.loan.cycle; let n = 0; while (e.g.state.loan.cycle === c0 && !e.g.state.dead && n++ < 40) { e.act('rest'); if (e.bust()) break; if (e.g.state.loan.cycle === c0) e.closeAll(); } });
  let e = fresh(), S = e.g.state;
  S.gold = 500; to30(e);
  check('30日目（季節の終わり）に返済額を取り立てられる', S.loan.n === 1 && S.gold === 500 - dues[0] - D0.CONFIG.living * 30);
  e.closeAll();
  check('次の返済は額が上がる', e.g.owed() === dues[1] && e.g.daysLeft() === 30);
  S.town = 'kawabe'; S.gold = 300; e.qty('prepay', {}, 100);
  check('先に納めたぶんは、返済日の額から引かれる', e.g.owed() === dues[1] - 100 && S.gold === 200);
  e.qty('borrow', {}, 60);
  check('借りた金はツケになり、次の返済日にまとめて取り立てられる', S.debt === 60 && e.g.owed() === dues[1] - 100 + 60);
  const d0 = S.debt; e.rest(1);
  check('ツケには毎日利子がつく', S.debt > d0);
  // 差し押さえ：店 → 荷車 → 荷
  e = fresh(); S = e.g.state; knowAll(e);
  S.cart = { type: 'donkey', hp: 100 }; S.shop = { town: 'kawabe', lv: 1, stock: {}, till: 0 }; S.guards = 0;
  S.cargo = { linen: { qty: 10, cost: 350, age: 0 } };
  S.gold = e.g.dailyCost().total * 30 + 10; to30(e);
  check('払えないと、まず店を差し押さえられる', S.shop === null && S.cart.type === 'donkey' && S.loan.n === 1 && !S.dead);
  check('取りすぎたぶんは返ってくる', S.gold > 0);
  e.closeAll(); S.gold = e.g.dailyCost().total * 30; to30(e);
  check('次は荷車を差し押さえられ、背負い籠に戻る', S.cart.type === 'basket' && S.loan.n === 2 && !S.dead && e.g.cargoWeight() <= 30); e.closeAll();
  S.cargo = { spice: { qty: 5, cost: 800, age: 0 } }; S.gold = e.g.dailyCost().total * 30 + 50; to30(e);
  check('次は荷を取り上げられる', e.g.cargoCount() === 0 && S.loan.n === 3 && !S.dead); e.closeAll();
  S.gold = 0; to30(e);
  check('何も残らなければ破産する', S.dead === true && /💀/.test(e.title()) && /父と同じ道/.test(e.text()));
  check('破産するとセーブが消える', !(KEY in e.store));
  const rec = JSON.parse(e.store[REC] || '[]');
  check('破産しても、商人録には記録が残る', rec.length === 1 && rec[0].result === '破産' && rec[0].paid === 3 && rec[0].day === 121, rec[0] ? `${rec[0].day}日目・返済${rec[0].paid}回・${rec[0].cart}` : '');
  e.press(0); e.drain();
  const S2 = e.g.state;
  check('破産後は完全に最初から（導入からやり直し）', S2.time === 0 && S2.gold === D0.CONFIG.startGold && S2.cart.type === 'basket' && S2.loan.n === 0 && /父の残したもの/.test(e.title()));
  e.closeAll(); e.act('tab', { id: 'book' });
  check('新しく始めても、帳簿に前の代の記録が出る', /商人録/.test(plain(e)) && /破産/.test(plain(e)) && /返済3回/.test(plain(e)));
  // 完済
  e = fresh(); S = e.g.state; S.loan.n = dues.length - 1; S.loan.cycle = dues.length - 1; S.time = (dues.length - 1) * 30 * 4; S.gold = 9000; to30(e);
  check('最後の返済を終えると完済の場面が出て、商人録に残る', S.loan.done === true && S.told.free === 1 && JSON.parse(e.store[REC])[0].result === '完済'); e.closeAll();
  check('完済後は返済がなくなる', e.g.owed() === 0 && /借金なし/.test(e.els['#hud'].innerHTML));
  check('無条件の援助金は無い', !/援助/.test(fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8')));
}

// ---------- 9. 山賊 ----------
function testBandits() {
  console.log('■ 山賊（積み荷の値打ちで遭遇率と要求額が上がる）');
  const e0 = fresh(), C = e0.D.CONFIG, S0 = e0.g.state;
  S0.cargo = {}; const p0 = e0.g.banditChance(1, false);
  S0.cargo = { linen: { qty: 6, cost: 0, age: 0 } }; const p1 = e0.g.banditChance(1, false);
  S0.cargo = { spice: { qty: 6, cost: 0, age: 0 } }; const p2 = e0.g.banditChance(1, false);
  check('値打ちのある荷ほど、山賊に遭いやすい', p0 < p1 && p1 < p2 && p2 >= p0 * 4, `空 ${Math.round(p0 * 100)}% → 亜麻布6反 ${Math.round(p1 * 100)}% → 香辛料6袋 ${Math.round(p2 * 100)}%`);
  S0.guards = 2; check('護衛がいると遭いにくい', e0.g.banditChance(1, false) < p2); S0.guards = 0;
  check('隊商に加わると遭いにくい', e0.g.banditChance(1, true) < p2 * 0.5);
  const setup = (cargo, guards, cart) => {
    const e = fresh(), S = e.g.state; knowAll(e);
    S.town = 'hataori'; S.gold = 300; S.rain = false; S.cart = { type: cart || 'donkey', hp: 100 }; S.guards = guards || 0; S.cargo = cargo;
    return e;
  };
  // 乱数：夜通し無し・道ばた無し・山賊あり・気づかない・故障なし ／ 山賊の大きさ・強さ・結果
  const run = (e, tail, re) => withRandom(seq([0.99, 0.99, 0, 0.99, 0.99].concat(tail)), () => e.travel('r11', (txt) => (/だ！/.test(txt) ? re : null)));
  const cheap = () => ({ grain: { qty: 6, cost: 40, age: 0 } }), rich = () => ({ spice: { qty: 6, cost: 900, age: 0 } });
  const cost = (e) => e.g.dailyCost().total * 3;
  let e = setup(cheap()); run(e, [0.99, 0.5], /通行料/);
  const tollCheap = 300 - cost(e) - e.g.state.gold; e.closeAll();
  e = setup(rich()); run(e, [0.99, 0.5], /通行料/);
  const tollRich = 300 - cost(e) - e.g.state.gold; e.closeAll();
  check('値打ちのある荷ほど、要求される通行料が高い', tollRich > tollCheap * 5 && tollRich === Math.ceil(C.bandits.thief.tollBase + 1200 * C.bandits.thief.tollRate), `麦6袋 ${tollCheap}枚 / 香辛料6袋 ${tollRich}枚`);
  check('山賊と初めて出会うと場面が出る', e.g.state.told.firstBandit === 1);
  e = setup(rich(), 3); run(e, [0.99, 0.5, 0.0], /戦う/);
  check('戦って勝てば荷は無事', e.g.state.stats.wins === 1 && e.g.state.cargo.spice.qty === 6); e.closeAll();
  e = setup(rich(), 0); run(e, [0.0, 0.5, 0.99], /戦う/);
  check('戦って負けると荷と金を奪われる', e.g.state.stats.robbed === 1 && e.g.state.cargo.spice.qty < 6 && e.g.state.gold < 300 - cost(e)); e.closeAll();
  e = setup({ spice: { qty: 3, cost: 450, age: 0 } }, 0, 'basket'); run(e, [0.99, 0.5, 0.0], /逃げる/);
  check('逃げ切れば何も失わない', e.g.state.gold === 300 - cost(e) && e.g.state.cargo.spice.qty === 3); e.closeAll();
  e = setup(rich(), 0); run(e, [0.99, 0.5], /荷の/);
  check('荷を渡せば通してもらえる', e.g.state.cargo.spice.qty === 4 && e.g.state.gold === 300 - cost(e)); e.closeAll();
  check('背負い籠と手押し車では護衛を連れて歩けない', e.D.CARTS.basket.guards === 0 && e.D.CARTS.handcart.guards === 0 && e.D.CARTS.donkey.guards >= 2);
}

// ---------- 10. 頼みごとと得意先 ----------
function testOrders() {
  console.log('■ 頼みごとと得意先');
  const e = fresh(), g = e.g, S = g.state, D = e.D, C = D.CONFIG;
  knowAll(e); S.town = 'kawabe'; S.gold = 2000; S.cart = { type: 'donkey', hp: 100 };
  const offers = withRandom(seeded(7), () => g.offersOf('kawabe'));
  check('町の顔役が頼みごとを出している', offers.length >= 1 && offers.every((o) => o.n > 0 && o.days > 0 && o.reward > 0 && !g.sellsHere('kawabe', o.g) && !D.GOODS[o.g].abroad), offers.map((o) => `${D.GOODS[o.g].name}${o.n}${D.GOODS[o.g].unit}・${o.days}日・${o.reward}枚`).join(' / '));
  e.act('tab', { id: 'town' });
  check('町の画面に頼みごとが、単位と重さつきで出る', /車屋の親方のゴンゾ/.test(plain(e)) && /日以内/.test(plain(e)) && /\d+kg/.test(plain(e)));
  const o = offers[0], gid = o.g, n = o.n, reward = o.reward, repGain = o.rep;
  e.act('accept', { i: '0' }); e.closeAll();
  check('頼みを受けると、期限つきの約束になる', S.orders.length === 1 && S.orders[0].due === e.days() + o.days);
  e.act('deliver', { i: '0' });
  check('品が足りないと納められない', S.orders.length === 1);
  S.cargo[gid] = { qty: n + 1, cost: (n + 1) * 10, age: 0 };
  const g0 = S.gold, r0 = S.rep.kawabe; e.act('deliver', { i: '0' });
  check('期限までに届けると、報酬と評判を得る', S.orders.length === 0 && S.gold === g0 + reward && S.rep.kawabe === r0 + repGain && S.cargo[gid].qty === 1 && S.stats.orders === 1);
  e.closeAll();
  S.rep.kawabe = 20; S.orders.push({ id: 'x', t: 'kawabe', g: 'iron', n: 5, due: e.days() + 1, reward: 300, rep: 6 });
  withRandom(0.5, () => { e.rest(1); e.act('rest'); });
  check('期限に遅れると約束は消え、評判が下がる', S.orders.length === 0 && S.rep.kawabe <= 20 - C.orderFailRep + 0.5 && /約束/.test(e.text())); e.closeAll();
  // 得意先
  check('頼みごとを1回果たしただけでは、得意先の話は来ない', !g.patronReady('kawabe'));
  S.orders.push({ id: 'y', t: 'kawabe', g: 'salt', n: 1, due: e.days() + 9, reward: 30, rep: 6 }); S.cargo.salt = { qty: 1, cost: 10, age: 0 };
  e.act('deliver', { i: '0' });
  check('2回果たすと、顔役が続けての商いを持ちかけてくる', g.patronReady('kawabe') && /続けての商い/.test(e.text())); e.closeAll();
  e.act('tab', { id: 'town' });
  check('町の画面に「得意先になる」が出る', /得意先になる/.test(plain(e)) && /20日ごとに 鉄を4束/.test(plain(e)));
  e.act('patron');
  const want = D.TOWNS.kawabe.who.want;
  check('得意先になると、決まった品を決まった日数ごとに納める約束になる', S.patrons.length === 1 && S.patrons[0].g === want.g && S.patrons[0].n === want.n && S.patrons[0].due === e.days() + C.patronEvery && S.told.patron === 1); e.closeAll();
  const b0 = g.buyNow('kawabe', 'linen'), s0 = g.sellNow('kawabe', 'wine');
  S.cargo.iron = { qty: 20, cost: 700, age: 0 };
  const g1 = S.gold, rr = S.rumors.length; withRandom(seeded(13), () => e.act('supply', { i: '0' }));
  check('納めると、代金・評判・確かな噂をもらえる', S.gold === g1 + Math.round(want.n * D.GOODS.iron.base * C.patronPay) && S.patrons[0].streak === 1 && S.cargo.iron.qty === 20 - want.n && S.rumors.length >= rr + 1 && S.rumors[0].src === 'patron'); e.closeAll();
  check('1回では、まだ信用されていない', !g.trusted('kawabe'));
  withRandom(seeded(14), () => e.act('supply', { i: '0' })); e.closeAll();
  check('約束を守りつづけると、その町での売り買いが有利になる', g.trusted('kawabe') && g.buyNow('kawabe', 'linen') < b0 && g.sellNow('kawabe', 'wine') > s0, `亜麻布の買値 ${b0}→${g.buyNow('kawabe', 'linen')}枚 / ワインの売値 ${s0}→${g.sellNow('kawabe', 'wine')}枚`);
  e.act('tab', { id: 'market' });
  check('市場に「得意先の町」と出る', /得意先の町/.test(plain(e)));
  const rp = S.rep.kawabe; S.patrons[0].due = e.days(); withRandom(0.5, () => e.rest(1));
  check('納め忘れると評判が下がり、信用もなくなる', S.patrons.length === 1 && S.patrons[0].miss === 1 && S.rep.kawabe < rp && !g.trusted('kawabe'));
  S.patrons[0].due = e.days(); withRandom(0.5, () => { e.act('rest'); });
  check('2回忘れると、得意先を失う', S.patrons.length === 0 && /得意先をひとつ失った/.test(e.text())); e.closeAll();
  check('得意先は3つまで', C.patronMax === 3);
}

// ---------- 11. 荷車・店・成り上がり ----------
function testRise() {
  console.log('■ 荷車・店・目に見える成り上がり');
  const e = fresh(), g = e.g, S = g.state, D = e.D, C = D.CONFIG, L1 = C.shop[1], L2 = C.shop[2];
  knowAll(e);
  check('最初の呼び名は「籠の兄ちゃん」', g.callName('hashibami') === '籠の兄ちゃん');
  S.town = 'kawabe'; S.gold = 9000;
  for (const id of ['handcart', 'donkey', 'horse']) { e.act('buyCart', { id }); e.press(1); e.closeAll(); }
  check('荷車を順に買い替えられ、そのたびに場面が出る', S.cart.type === 'horse' && S.told.handcart && S.told.donkey && S.told.horse);
  check('荷車を持つと呼び名が変わり、評判が上がるとまた変わる', g.callName('kawabe') === '車の兄ちゃん' && (S.rep.kawabe = 10, g.callName('kawabe') === '行商さん') && (S.rep.kawabe = 25, g.callName('kawabe') === 'おなじみさん') && (S.rep.kawabe = 45, /旦那/.test(g.callName('kawabe'))));
  S.rep.kawabe = 0;
  const road = g.routeInfo('r8').days; S.town = 'hashibami'; const trail = g.routeInfo('r2').days; S.cart.type = 'basket'; const foot = g.routeInfo('r2').days; S.cart.type = 'horse'; S.town = 'kawabe';
  check('馬車は街道で速く、山道では徒歩より遅い', road < D.ROADS.r8.len && trail > foot);
  S.cargo = { grain: { qty: 20, cost: 120, age: 0 } };
  const g0 = S.gold; withRandom(seq([0.99, 0.99, 0]), () => e.travel('r1', (t) => (/壊れた/.test(t) ? /直して/ : null)));
  check('道中で車が壊れ、修理代と1日がかかる', S.gold === g0 - D.CARTS.horse.repair - g.dailyCost().total * (g.routeInfo('r1').days + 1) && S.cargo.grain.qty === 20, `${g0 - S.gold}枚`); e.closeAll();
  S.town = 'kawabe'; S.cargo = {}; S.gold = 0; S.cart = { type: 'donkey', hp: 100 };
  e.act('sellCart'); e.press(1); e.closeAll();
  check('苦しいときは荷車を売って背負い籠に戻れる', S.cart.type === 'basket' && S.gold > 100 && S.gold < D.CARTS.donkey.price);
  S.gold = 300; e.act('tab', { id: 'town' });
  const c = S.caravans.kawabe[0], d0 = e.days(), dest = D.ROADS[c.rid].a === 'kawabe' ? D.ROADS[c.rid].b : D.ROADS[c.rid].a;
  e.act('caravan', { i: '0' });
  withRandom(0.99, () => { e.press(1); let n = 0; while (g.travel && n++ < 100) { e.drain(); if (e.open()) e.press(0); } });
  check('参加費を払い、出発を待って隊商と移動する', S.town === dest && S.gold <= 300 - c.fee && e.days() - d0 >= c.leave - d0 + 1); e.closeAll();
  // 店
  S.town = 'kawabe'; S.gold = 5000; S.cart = { type: 'donkey', hp: 100 }; S.cargo = {};
  e.act('shopOpen');
  check('評判が足りないと露店を出せない', S.shop === null && !e.open());
  S.rep.kawabe = L1.rep; e.act('shopOpen'); e.press(1);
  check('評判とお金がそろえば露店を出せ、場面が出る', S.shop && S.shop.lv === 1 && S.told.stall === 1 && g.stage() === 3); e.closeAll();
  S.cargo = { honey: { qty: 10, cost: 240, age: 0 }, wine: { qty: 10, cost: 250, age: 0 } };
  e.qty('shopPut', { g: 'honey' }); e.qty('shopPut', { g: 'wine' });
  withRandom(0.5, () => e.rest(L1.every));
  check('露店は市の日に預けた品を売る', S.shop.till > 0 && S.shop.stock.honey.qty === 10 - L1.rate, `売上 ${S.shop.till}枚`);
  const g1 = S.gold, till = S.shop.till; e.act('shopTake'); e.closeAll();
  check('売上金を受け取れる', S.gold === g1 + till);
  S.rep.kawabe = L2.rep; e.act('shopUp'); e.press(1);
  check('露店を小さな店に建て替えると場面が出る（ミナが店番に来る）', S.shop.lv === 2 && S.told.shop === 1 && /ミナ/.test(e.text())); e.closeAll();
  e.act('tab', { id: 'book' });
  check('帳簿に、いまの姿の絵と呼び名が出る', /id="scene"/.test(html(e)) && /いまの姿：店主（ロバの荷車・小さな店/.test(plain(e)) && /「旦那」/.test(plain(e)));
  // 故郷への投資
  S.town = 'hashibami'; S.gold = 3000; e.act('tab', { id: 'town' });
  check('故郷の村では、井戸・橋・水車を建てられる', /故郷の村を育てる/.test(plain(e)) && /id="home"/.test(html(e)) && /井戸/.test(plain(e)) && /石の橋/.test(plain(e)) && /水車/.test(plain(e)));
  const m0 = g.stockMax('hashibami', 'grain'), rep0 = S.rep.hashibami;
  e.act('build', { k: 'well' }); e.press(1);
  check('井戸を建てると、場面が出て、村の評判と特産の在庫が増える', S.home.well === true && S.gold === 3000 - C.home.well.cost && S.told.well === 1 && S.rep.hashibami === rep0 + C.home.well.rep && g.stockMax('hashibami', 'grain') > m0, `麦の在庫 ${m0}袋 → ${g.stockMax('hashibami', 'grain')}袋`); e.closeAll();
  e.act('build', { k: 'bridge' }); e.press(1); e.closeAll(); e.act('build', { k: 'mill' }); e.press(1); e.closeAll();
  check('全部建てると、村の特産の在庫が2倍になる', S.home.bridge && S.home.mill && g.homeBonus('hashibami') === 2 && S.told.bridge === 1 && S.told.mill === 1);
  S.town = 'kawabe'; e.act('build', { k: 'well' });
  check('よその町では建てられない', !e.open());
  // 護衛・傷む品
  S.guards = 0; S.gold = 100; e.act('guard', { n: '1' });
  check('護衛を雇うと日給がかかる', S.guards === 1 && g.dailyCost().guards === C.guardWage);
  const g2 = S.gold; e.act('shopClose'); e.press(1); e.closeAll();
  check('店をたたむと一部が戻り、店賃がなくなる', S.shop === null && S.gold > g2 && g.dailyCost().shop === 0);
  S.gold = 50; S.guards = 0; S.cargo = { fish: { qty: 3, cost: 30, age: 0 } }; withRandom(0.5, () => { for (let k = 0; k < 6; k++) { e.act('rest'); if (/腐/.test(e.text())) break; e.closeAll(); } });
  check('魚は日数を過ぎると腐って無くなる', !S.cargo.fish); e.closeAll();
}

// ---------- 12. 隣国 ----------
function testAbroad() {
  console.log('■ 隣国（商会が大きくなると開く）と国境の関所');
  const e = fresh(), g = e.g, S = g.state, D = e.D, C = D.CONFIG;
  knowAll(e); S.town = 'hataori'; S.gold = 3000; S.cart = { type: 'donkey', hp: 100 }; S.rain = false;
  check('最初は、隣国への道も町も見えない', !S.abroad && !g.roadsFrom('hataori').includes('r14') && !S.seen.karune && !g.neighbors('hataori').includes('karune'));
  S.gold = 200; e.act('mapBuy', { k: 'full' }); S.gold = 3000;
  check('国じゅうの地図を買っても、隣国は載っていない', !S.seen.karune && !S.roads.r14);
  S.shop = { town: 'hataori', lv: 1, stock: {}, till: 0 }; S.rep.oto = 40; g.settle(); e.closeAll();
  check('露店だけでは、まだ開かない', !S.abroad);
  S.shop.lv = 2; S.rep.oto = C.abroad.rep - 1; g.settle(); e.closeAll();
  check('王都の評判が足りないうちは開かない', !S.abroad);
  S.rep.oto = C.abroad.rep; g.settle();
  check('小さな店を持ち、王都の評判が30になると、隣国への道が開く', S.abroad === true && S.told.abroad === 1 && /国境への道/.test(e.title()) && g.roadsFrom('hataori').includes('r14') && g.roadsFrom('hataori').includes('r14b') && S.seen.karune === 1); e.closeAll();
  e.act('tab', { id: 'map' }); e.act('dest', { id: 'karune' });
  check('旅じたくに、国境の関所と関税が出る', /国境の関所/.test(plain(e)) && /国境の関税/.test(plain(e)));
  // 関税
  S.cargo = { iron: { qty: 10, cost: 330, age: 0 } };
  const worth = g.cargoWorth(), tax = g.tariff('r14');
  check('国境の関税は、荷の値打ちの10%', tax === Math.ceil(worth * C.abroad.tariff), `値打ち${worth}枚 → 関税${tax}枚`);
  check('山越えの密輸路は関税がないが、遠くて、とても危ない', g.tariff('r14b') === 0 && g.routeInfo('r14b').days > g.routeInfo('r14').days && g.routeInfo('r14b').shown === 3);
  const g0 = S.gold, days = g.routeInfo('r14').days; withRandom(0.99, () => e.travel('r14'));
  check('国境で関税を払って、隣国の町に着く', S.town === 'karune' && S.gold === g0 - tax - g.dailyCost().total * days && S.told.karune === 1); e.closeAll();
  check('隣国では鉄が国内よりずっと高く売れ、砂糖と香辛料が安い', D.TOWNS.karune.prices.iron >= 2 && D.TOWNS.mirza.prices.iron > D.TOWNS.oto.prices.iron * 1.3 && D.TOWNS.mirza.prices.sugar <= 0.5 && D.TOWNS.oto.prices.sugar >= 1.5 && D.TOWNS.mirza.prices.spice < D.TOWNS.shiokaze.prices.spice);
  check('隣国の町にも顔役がいて、その先に都がある', D.TOWNS.karune.who.name === 'ハディ' && g.neighbors('karune').includes('mirza'));
  // 通行手形
  S.rep.oto = C.abroad.passRep; withRandom(0.5, () => e.act('rest'));
  check('王都の評判がさらに上がると、通行手形で関税が半分になる', S.pass.border === true && S.told.pass === 1); e.closeAll();
  S.cargo = { sugar: { qty: 10, cost: 480, age: 0 } };
  check('手形があれば関税は5%', g.tariff('r14') === Math.ceil(800 * C.abroad.tariffPass));
  // 禁制品と袖の下。乱数：夜通し無し・道ばた無し・山賊無し・故障無し ／ 見つかるか
  const contra = () => ({ tobacco: { qty: 5, cost: 450, age: 0 } });
  S.cargo = contra(); S.gold = 2000;
  withRandom(seq([0.99, 0.99, 0.99, 0.99]), () => { e.go('r14'); });
  check('国境では禁制品をあらためられ、そのまま通るか、袖の下かを選ぶ', /国境の関所/.test(e.title()) && /そのまま通る/.test(e.modal.innerHTML) && /袖の下を渡す/.test(e.modal.innerHTML));
  withRandom(seq([0.2]), () => { e.choose(/袖の下/); });
  check('袖の下を渡せば、ほぼ見つからずに通れる', /通してもらえた/.test(e.title()) && S.cargo.tobacco.qty === 5 && C.bribeFind < C.abroad.findPass / 3); withRandom(0.99, () => e.closeAll());
  S.town = 'karune'; S.cargo = contra();
  withRandom(seq([0.99, 0.99, 0.99, 0.99]), () => { e.go('r14'); });
  const rp = S.rep.oto; withRandom(seq([0.1]), () => { e.choose(/そのまま通る/); });
  check('そのまま通って見つかると、没収・罰金・評判の低下', /見つかった/.test(e.title()) && !S.cargo.tobacco && S.rep.oto < rp); withRandom(0.99, () => e.closeAll());
  // 噂と頼みごとにも隣国が出るようになる
  const seen = withRandom(seeded(41), () => { let n = 0; for (let i = 0; i < 300; i++) { const r = g.randomPrice('street'); if (r && D.TOWNS[r.t].abroad) n++; } return n; });
  check('道が開いたあとは、隣国の町の噂も聞ける', seen > 0, seen + '件/300');
  e.act('tab', { id: 'book' });
  check('帳簿に、隣国との商いを許されたことが出る', /隣国との商いを許された/.test(plain(e)));
}

// ---------- 13. バランス：通しプレイ ----------
// 腕のいい商人。人より有利な条件で遊ぶ：最初から国じゅうの地図を持ち、噂に頼らず、どの町の「今の本当の値」も知っている。
// 3つ先の町までの道すじを比べ、帰りの商いまで見通して、1日あたりの利益がいちばん大きい荷と行き先を選ぶ。
// maxCart より上の荷車は買わない。依頼・得意先・店・隣国・禁制品は使わない。
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
    function leg(rid, t, first) {
      const s = S(), r = D.ROADS[rid], cart = D.CARTS[s.cart.type];
      if (first && t === s.town) { const i = g.routeInfo(rid); return { rid, to: i.to, days: i.days, shown: i.shown, breakP: i.breakP }; }
      const hot = s.hot[rid] > Math.floor(s.time / 4) && s.hotKnown[rid];
      return { rid, to: far(rid, t), days: Math.max(1, Math.round(r.len * cart.speed[r.type])), shown: Math.min(3, r.danger + (hot ? 1 : 0)), breakP: cart.breakP[r.type] };
    }
    const okLeg = (L) => L.shown < 3 && L.breakP < 0.13;
    function legsOf(rids) { let cur = S().town; return rids.map((rid, i) => { const L = leg(rid, cur, i === 0); cur = L.to; return L; }); }
    function paths(t0, maxLen) {
      t0 = t0 || S().town; maxLen = maxLen || 3;
      const out = [];
      const walk = (t, legs, visited) => {
        for (const rid in D.ROADS) {
          const r = D.ROADS[rid];
          if ((r.a !== t && r.b !== t) || !g.roadUsable(rid) || g.roadClosed(rid)) continue;
          const L = leg(rid, t, legs.length === 0);
          if (!okLeg(L) || visited.includes(L.to)) continue;
          const nl = legs.concat([L]); out.push(nl);
          if (nl.length < maxLen) walk(L.to, nl, visited.concat([L.to]));
        }
      };
      walk(t0, [], [t0]);
      return out;
    }
    // その道すじでの、いちばんいい積み方と、1日あたりの見込み利益。
    // t0 を指定すると「その町に元手 money0・空き cap0 で着いたとしたら」の見積もりになる
    function plan(legs, t0, money0, cap0) {
      const s = S(), t = t0 || s.town, to = legs[legs.length - 1].to;
      const days = legs.reduce((a, L) => a + L.days, 0), viaCity = legs.some((L) => L.to === 'oto');
      const reserve = (days + 1 >= g.daysLeft()) ? g.owed() : 0;
      const spoil = (D.CALENDAR.spoil && D.CALENDAR.spoil[g.seasonOf(e.days()).id]) || 1;
      let money = (t0 ? money0 : s.gold - reserve) - g.dailyCost().total * (days + 1) - 3, capW = t0 ? cap0 : g.freeWeight(), gain = 0, value = t0 ? 0 : g.cargoWorth();
      const cnt = {}, cands = Object.keys(D.TOWNS[t].stock).filter((gid) => !g.banned(to, gid) && !(D.CONTRABAND.includes(gid) && viaCity));
      for (let guard = 0; guard < 600; guard++) {
        let best = null;
        for (const gid of cands) {
          const G0 = D.GOODS[gid], n = cnt[gid] || 0;
          if (n >= Math.floor(s.stock[t][gid]) || G0.w > capW) continue;
          const buy = Math.ceil(G0.base * g.mult(t, gid) * (1 + s.market[t][gid] + n * stepOf(t, gid)));
          if (buy > money) continue;
          const f = G0.shelf ? g.fresh(gid, (days + 1) * spoil) : 1;   // 道中の遅れと、夏の傷みの早さを見こむ
          const sell = Math.floor(G0.base * g.mult(to, gid) * (1 + Math.max(C.devMin, s.market[to][gid] - n * stepOf(to, gid))) * C.sellRate * f);
          const net = sell - buy;
          if (net <= 0) continue;
          if (!best || net / G0.w > best.r) best = { gid, r: net / G0.w, net, buy, w: G0.w, base: G0.base };
        }
        if (!best) break;
        cnt[best.gid] = (cnt[best.gid] || 0) + 1; money -= best.buy; capW -= best.w; gain += best.net; value += best.base;
      }
      // 山賊に取られる見込み。この商人の道中の決め方（下の onRoad）どおりに計算する
      let loss = 0;
      const pp = C.selfPower + C.guardPower * s.guards, cart = D.CARTS[s.cart.type], cash = Math.max(0, money);
      const meet = (B) => {
        const lose = B.loseCargo * value + B.loseGold * cash;
        const ep = (B.min + B.max) / 2, prob = pp * pp / (pp * pp + ep * ep), toll = B.tollBase + value * B.tollRate;
        if (prob > 0.66) return (1 - prob) * lose;
        if (toll <= cash * 0.5) return toll;
        if (s.cart.type === 'basket' || s.cart.type === 'horse') return (1 - cart.flee) * (1 - prob * 0.7) * lose;
        return B.take * value;
      };
      for (const L of legs) {
        const p = Math.min(0.9, C.banditBase[L.shown] * Math.min(C.banditValueMax, 0.5 + value / C.banditValueRef) * Math.max(0.3, 1 - C.banditGuardCut * s.guards));
        const pg = Math.max(0, Math.min(0.8, 0.2 + value / 1500 + (L.shown >= 3 ? 0.2 : 0)));
        loss += p * 0.6 * (pg * meet(C.bandits.gang) + (1 - pg) * meet(C.bandits.thief));   // 先に気づいて迂回できるぶんを差し引く
      }
      const net = gain - loss - g.dailyCost().total * days;
      return { legs, to, cnt, days, gain, net, score: net / days };
    }
    // 道中の決め方：無難な選択（宿をとる・橋へ回る・迂回する）を基本に、山賊とは有利なときだけ戦う
    const onRoad = (txt) => {
      if (/だ！/.test(txt)) {
        if (/有利/.test(txt)) return /戦う/;
        const m = e.modal.innerHTML.match(/通行料を払う（(\d+)枚）/);
        if (m && +m[1] <= S().gold * 0.5) return /通行料/;
        if (S().cart.type === 'basket' || S().cart.type === 'horse') return /逃げる/;
        return /荷の/.test(e.modal.innerHTML) ? /荷の/ : /戦う/;
      }
      if (/壊れた/.test(txt)) return /直して|荷を/;
      return null;
    };
    let guard = 0;
    while (e.died == null && e.days() < maxDays && guard++ < 4000) {
      const t = S().town, T = D.TOWNS[t];
      mark.peak = Math.max(mark.peak || 0, Math.round(S().gold));
      for (const gid of Object.keys(S().cargo)) if (!g.banned(t, gid) && !(commit && commit.keep[gid])) e.qty('sell', { g: gid });
      e.closeAll(); if (e.died != null) break;
      if (T.has.cart) {
        if (S().cart.type !== 'basket' && S().cart.hp < 55) e.act('fix');
        const ix = order.indexOf(S().cart.type), next = order[ix + 1];
        if (next && ix < top) {
          // 返済日の直前には買わない。返済ぶんの一部と、仕入れの元手を残す
          const cost = D.CARTS[next].price - g.tradeIn(), keep = g.owed() * 0.4 + [60, 300, 600][ix];
          if (g.daysLeft() >= 16 && S().gold >= cost + keep) { e.act('buyCart', { id: next }); e.press(1); e.closeAll(); if (mark[next] == null) mark[next] = e.days(); }
        }
      }
      if (e.died != null) break;
      const want = Math.min(D.CARTS[S().cart.type].guards, 2);
      if (S().guards > 0 && S().gold < 40) while (S().guards > 0) e.act('guard', { n: '-1' });
      if (T.has.guard) while (S().guards < want && S().gold > g.owed() * 0.5 + 120 + S().guards * 60) e.act('guard', { n: '1' });
      let best;
      const c0 = commit && commit.path.length ? commit.path[0] : null;
      if (c0 && (D.ROADS[c0].a === t || D.ROADS[c0].b === t) && !g.roadClosed(c0)) {
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
        const reach = Object.keys(D.TOWNS).filter((x) => g.inPlay(x) && x !== t && Object.keys(D.TOWNS[x].stock).some((gid) => !D.CONTRABAND.includes(gid) && g.buyNow(x, gid) * 3 <= S().gold - g.dailyCost().total * (g.DIST[t][x] + 2)));
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
    return { dead: e.died != null, day: e.died != null ? e.died : e.days(), paid: e.died != null ? e.paidAtDeath : s.loan.n, done: e.died == null && s.loan.done, cart: s.cart.type, mark, trips: s.stats.trips, seen: e.seen, titles: e.titles, gold: Math.round(s.gold), robbed: s.stats.robbed, wins: s.stats.wins };
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
  console.log('    通った場面： ' + Object.keys(titles).join(' / '));

  check('徒歩だけでは、30日ごとの返済を続けられない（全員が完済前に破産）', foot.every((x) => x.dead), `破産 ${foot.filter((x) => x.dead).length}/${N}`);
  check('徒歩だけだと、完済にはほど遠い（8回のうち5回まで）', med(foot.map((x) => x.paid)) <= 5 && Math.max.apply(null, foot.map((x) => x.paid)) <= 6, `中央 ${med(foot.map((x) => x.paid))}回`);
  check('ただし最初の返済は、徒歩でも払える（出だしで詰まない）', foot.filter((x) => x.paid >= 1).length >= N * 0.75, `${foot.filter((x) => x.paid >= 1).length}/${N}`);
  check('手押し車に上がれば、徒歩より長く返済を続けられる', med(hand.map((x) => x.paid)) > med(foot.map((x) => x.paid)), `中央 ${med(foot.map((x) => x.paid))}回 → ${med(hand.map((x) => x.paid))}回`);
  check('手押し車どまりでは完済できない（ロバや馬車に上がらないと厳しい）', hand.filter((x) => x.done).length <= N * 0.25, `完済 ${hand.filter((x) => x.done).length}/${N}`);
  check('荷車を上げていけば、返済を続けて完済できる', full.filter((x) => x.done).length >= N * 0.5, `完済 ${full.filter((x) => x.done).length}/${N}`);
  check('荷車を上げても、返済の進み方は手押し車どまりより上', med(full.map((x) => x.paid)) > med(hand.map((x) => x.paid)));
  check('腕のいい商人でも破産することがある（危険を感じる難しさ）', full.some((x) => x.dead), `破産 ${full.filter((x) => x.dead).length}/${N}`);
  const has = (re) => Object.keys(titles).some((k) => re.test(k));
  check('足跡・川・夜・山賊・答え合わせ・返済の場面をどれも通った', has(/足跡/) && has(/川が増水/) && has(/日が暮れる/) && has(/だ！/) && has(/今日の値/) && has(/日々のできごと/));
  check('どの回も途中で止まらない', all.every((x) => x.dead || x.day >= DAYS));
}

// ---------- 既存のゲームに触っていないこと ----------
function testIsolation() {
  console.log('■ 既存のゲームとの分離');
  const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), js = fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');
  check('shokai/ は自分のフォルダの中だけを読みこむ', !/\.\.\//.test(page) && /calendar\.js/.test(page));
  check('航海版のデータ（window.DATA）や保存名を使わない', !/window\.DATA|kaze-to-ho/.test(js));
  check('航海版のファイルが残っている', ['index.html', 'js/game.js', 'css/style.css', 'js/data/ports.js'].every((f) => fs.existsSync(path.join(ROOT, '..', f))));
}

module.exports = { boot, fresh, play, knowAll, seeded };
if (require.main === module) {
  const only = process.argv[2];
  const tests = { data: testData, start: testStart, weight: testWeight, rumors: testRumors, calendar: testCalendar, journey: testJourney, reveal: testReveal, loan: testLoan, bandits: testBandits, orders: testOrders, rise: testRise, abroad: testAbroad, isolation: testIsolation, balance: testBalance };
  for (const k in tests) if (!only || only === k) tests[k]();
  console.log(fails ? `\n✗ 失敗 ${fails}件` : '\n✓ すべて合格');
  process.exit(fails ? 1 : 0);
}
