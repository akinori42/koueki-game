// 「背負い籠の商会」（shokai/）の自動テスト。ブラウザなしで読み込み、仕組みを一つずつ確かめる。
// 使い方： node tests/shokai_smoke.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..', 'shokai');
const FILES = ['js/data/config.js', 'js/data/goods.js', 'js/data/towns.js', 'js/data/carts.js', 'js/game.js'];
const KEY = 'shokai-save-v1';

let fails = 0;
function check(name, ok, detail) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? '  ' + detail : ''));
}
const realRandom = Math.random;
function withRandom(v, fn) { Math.random = typeof v === 'function' ? v : () => v; try { return fn(); } finally { Math.random = realRandom; } }

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
  const e = { timers: [], rafs: [], els, store, click: null, t: 0, seen: {} };
  const win = {
    devicePixelRatio: 3, innerHeight: 844, scrollTo() {}, addEventListener() {},
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; }
    },
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
  e.press = (idx) => {
    if (!e.open()) return false;
    const b = e.modal.btns[Math.min(idx || 0, e.modal.btns.length - 1)];
    const k = b.label.replace(/[0-9]+/g, 'N'); e.seen[k] = (e.seen[k] || 0) + 1;
    b.onclick(); return true;
  };
  e.pressLabel = (re) => {   // ラベルが合うボタンを押す。無ければ false
    if (!e.open()) return false;
    const i = e.modal.btns.findIndex((b) => re.test(b.label));
    return i < 0 ? false : e.press(i);
  };
  e.drain = () => {   // たまったタイマーと描画コマを進める
    for (let round = 0; round < 60; round++) {
      let n = 0;
      while (e.timers.length && n++ < 2000) e.timers.shift()();
      const fr = e.rafs.splice(0, e.rafs.length);
      for (const f of fr) { e.t += 400; f(e.t); }
      if (!e.timers.length && !e.rafs.length) break;
    }
  };
  // 破産の画面が出たら、押さずに止まる（押すと最初からになるため）
  e.bust = () => { if (e.open() && /💀 破産/.test(e.modal.innerHTML)) { if (e.died == null) e.died = Math.floor(e.g.state.time / 4); return true; } return false; };
  e.closeAll = () => { let n = 0; while (e.open() && !e.bust() && n++ < 40) { e.press(0); e.drain(); } };
  // 道 rid を通って隣町へ。途中の選択は choose(本文) が返す正規表現のボタンを押す
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
  // 個数えらびを出して決定（最大数）。q を指定するとその数にする
  e.qty = (a, data, q) => {
    e.act(a, data);
    if (!e.open() || !/やめる/.test(e.modal.btns[0].label)) return false;
    if (q != null) { const r = e.els['#qR']; if (r && r.oninput) r.oninput({ target: { value: q } }); }
    e.press(1); return true;
  };
  return e;
}
const fresh = () => { const e = boot(); e.closeAll(); return e; };

// ---------- 1. データ ----------
function testData() {
  console.log('■ データ');
  const e = fresh(), D = e.D, towns = Object.keys(D.TOWNS), goods = Object.keys(D.GOODS);
  const kinds = towns.map((t) => D.TOWNS[t].kind);
  console.log(`  町 ${towns.length} / 道 ${Object.keys(D.ROADS).length} / 品 ${goods.length} / 荷車 ${Object.keys(D.CARTS).length}`);
  check('村と町が6〜7、王都が1、港町が1', kinds.filter((k) => k === 'village' || k === 'town').length >= 6 && kinds.filter((k) => k === 'village' || k === 'town').length <= 7 &&
    kinds.filter((k) => k === 'capital').length === 1 && kinds.filter((k) => k === 'port').length === 1);
  check('品物が10〜12種', goods.length >= 10 && goods.length <= 12, goods.length + '種');
  check('荷車が4種（背負い籠・手押し車・ロバの荷車・一頭立て馬車）', ['basket', 'handcart', 'donkey', 'horse'].every((c) => D.CARTS[c]) && Object.keys(D.CARTS).length === 4);
  const bad = [];
  for (const rid in D.ROADS) { const r = D.ROADS[rid]; if (!D.TOWNS[r.a] || !D.TOWNS[r.b] || !D.ROAD_TYPES[r.type]) bad.push(rid); }
  for (const t of towns) { for (const g of D.TOWNS[t].sells) if (!D.GOODS[g]) bad.push(t + ':' + g); for (const g in D.TOWNS[t].prices) if (!D.GOODS[g]) bad.push(t + ':' + g); }
  check('道と町が参照する先がすべて存在する', !bad.length, bad.join(','));
  check('どの品にも産地がある', goods.every((g) => towns.some((t) => D.TOWNS[t].sells.includes(g))));
  const reach = new Set([D.CONFIG.startTown]);
  for (let i = 0; i < 20; i++) for (const rid in D.ROADS) { const r = D.ROADS[rid]; if (reach.has(r.a)) reach.add(r.b); if (reach.has(r.b)) reach.add(r.a); }
  check('すべての町へ道がつながっている', reach.size === towns.length);
  check('関所のある道と、それを避ける抜け道がある', Object.values(D.ROADS).some((r) => r.toll) && Object.values(D.ROADS).some((r) => r.type === 'path'));
  check('傷む品と禁制品がある', goods.some((g) => D.GOODS[g].shelf) && D.CONTRABAND.length > 0);
}

// ---------- 2. はじまりと保存 ----------
function testStart() {
  console.log('■ はじまり・保存');
  const e = boot(), S = e.g.state, D = e.D;
  check('最初に説明が出る', /はじめる/.test(e.modal.innerHTML)); e.closeAll();
  check('背負い籠・少ない元手・借金なしで始まる', S.cart.type === 'basket' && S.gold === D.CONFIG.startGold && S.gold < 100 && S.debt === 0);
  const seen2 = Object.keys(S.seen).filter((t) => S.seen[t] === 2), seen1 = Object.keys(S.seen).filter((t) => S.seen[t] === 1);
  check('地図は出発地だけ。隣の町は「？」', seen2.length === 1 && seen1.length >= 2 && seen1.every((t) => !S.named[t]), `確定${seen2.length}・？${seen1.length}`);
  check('遠くの町（王都・港）はまだ地図に無い', !S.seen.oto && !S.seen.shiokaze);
  check('保存名が航海版と別', e.g.SAVE_KEY === KEY && KEY !== 'kaze-to-ho-save-v1' && !!e.store[KEY] && !e.store['kaze-to-ho-save-v1']);
  for (const t of ['market', 'map', 'town', 'book']) { e.act('tab', { id: t }); if (e.main.innerHTML.length < 200) fails++; }
  check('4つの画面が描ける', e.main.innerHTML.length > 200);
  S.gold = 77; e.g.settle();
  const e2 = boot(Object.assign({}, e.store));
  check('続きから再開できる（自動保存）', e2.g.state.gold === 77 && !/はじめる/.test(e2.modal.innerHTML));
  const e3 = boot({ [KEY]: '{こわれた' });
  check('壊れたセーブなら新しく始まる', e3.g.state.time === 0);
}

// ---------- 3. 売り買いと時間 ----------
function testTrade() {
  console.log('■ 売り買い・時間・維持費');
  const e = fresh(), S = e.g.state, D = e.D;
  const p0 = e.g.buyNow('hashibami', 'grain'), t0 = S.time, g0 = S.gold;
  e.qty('buy', { g: 'grain' }, 5);
  check('買うと荷が増え、お金が減る', S.cargo.grain && S.cargo.grain.qty === 5 && S.gold < g0);
  check('売り買いで時間が進む', S.time === t0 + D.CONFIG.tradeTime);
  check('買うと値が上がる', e.g.buyNow('hashibami', 'grain') >= p0 && S.market.hashibami.grain > -0.08);
  check('背負い籠には12個まで', D.CARTS.basket.cap === 12 && e.g.cargoCount() <= 12);
  const before = S.gold;
  e.act('rest'); e.closeAll();
  check('日が変わると宿代がかかる', S.gold === before - e.g.dailyCost().total && S.time % 4 === 0);
  const gw = S.gold; e.act('work'); e.closeAll();
  check('日雇いは、宿代をわずかに上回るだけ', S.gold - gw === D.CONFIG.laborPay - D.CONFIG.living && S.gold - gw <= 3);
  S.gold = 0; S.debt = 0; e.act('rest'); e.closeAll();
  check('払えない宿代はツケ（借金）になる', S.debt >= D.CONFIG.living);
}

// ---------- 4. 移動・発見・傷む品 ----------
function testTravel() {
  console.log('■ 移動・手探りの地図・傷む品');
  const e = fresh(), S = e.g.state, D = e.D;
  S.gold = 200;
  const d0 = Math.floor(S.time / 4);
  const ok = withRandom(0.99, () => e.travel('r1'));   // 何も起きない道中
  e.closeAll();
  check('街道を歩いて隣町に着く', ok && S.town === 'kawabe');
  check('歩いた日数だけ時間が進む', Math.floor(S.time / 4) - d0 === 2, (Math.floor(S.time / 4) - d0) + '日');
  check('着いた町が地図に確定し、その先に「？」が増える', S.seen.kawabe === 2 && S.named.kawabe && S.seen.tsuno === 1 && S.seen.hataori === 1 && !S.named.tsuno);
  check('行ったことのない町へも「？」のまま出発できる', e.g.roadsFrom('kawabe').includes('r8'));
  // 傷む品
  e.qty('buy', { g: 'fish' }, 6);
  const f0 = e.g.sellNow('kawabe', 'fish', e.g.fresh('fish', S.cargo.fish.age));
  S.cargo.fish.age = 4;
  check('魚は日がたつと値が落ちる', e.g.fresh('fish', 4) < 0.7 && e.g.sellNow('kawabe', 'fish', e.g.fresh('fish', 4)) < f0);
  withRandom(0.99, () => { e.act('rest'); e.closeAll(); e.act('rest'); });
  check('日数を過ぎると腐って無くなる', !S.cargo.fish && /腐/.test(e.text())); e.closeAll();
  // 雨
  S.rain = false; const dry = e.g.routeInfo('r6b').days; S.rain = true; const wet = e.g.routeInfo('r6b').days;
  check('雨の日は道がぬかるんで遅くなる', wet > dry, `${dry}日 → ${wet}日`); S.rain = false;
  // 酒場の噂と地図屋
  S.gold = 500;
  withRandom(0.1, () => e.act('rumor'));
  check('酒場の噂で「？」の町の名前がわかる', /酒場の噂/.test(e.modal.innerHTML) && (S.named.tsuno || S.named.hataori || S.named.mizunara || S.named.budou)); e.closeAll();
  const known = Object.keys(S.seen).length;
  e.act('mapBuy', { k: 'local' }); e.closeAll();
  check('地図屋でこのあたりの町と道がわかる', Object.keys(S.seen).length > known && S.gold === 500 - D.CONFIG.rumorCost - D.CONFIG.mapLocal);
  e.act('mapBuy', { k: 'full' }); e.closeAll();
  check('国じゅうの地図ですべての町がわかる', Object.keys(S.seen).length === Object.keys(D.TOWNS).length && S.seen.oto === 1);
}

// ---------- 5. 関所・禁制品・王都 ----------
function testGate() {
  console.log('■ 関所・禁制品・王都');
  const e = fresh(), S = e.g.state, D = e.D;
  S.town = 'kawabe'; S.seen.kawabe = 2; S.roads.r6 = true; S.roads.r6b = true; S.gold = 100;
  S.cargo = { liquor: { qty: 4, cost: 200, age: 0 }, grain: { qty: 2, cost: 12, age: 0 } };
  const info = e.g.routeInfo('r6');
  check('関所の道には通行税がかかり、抜け道にはかからない', info.toll > 0 && e.g.routeInfo('r6b').toll === 0 && e.g.routeInfo('r6b').shown > info.shown);
  // 乱数：山賊なし(0.99)・故障なし(0.99)・禁制品は見つかる(0.1)
  const seq = [0.99, 0.99, 0.1]; let i = 0;
  withRandom(() => (i < seq.length ? seq[i++] : 0.99), () => e.travel('r6'));
  check('関所で通行税を払う', S.town === 'tsuno' && S.gold <= 100 - info.toll);
  check('禁制品が見つかると没収と罰金', !S.cargo.liquor && S.cargo.grain && S.gold <= 100 - info.toll - D.CONFIG.contrabandFine);
  e.closeAll();
  // 王都
  S.town = 'tsuno'; S.roads.r9 = true; S.gold = 300; S.debt = 0;
  S.cargo = { cloth: { qty: 5, cost: 300, age: 0 }, liquor: { qty: 2, cost: 100, age: 0 } };
  const seq2 = [0.99, 0.99, 0.9]; i = 0;   // 関所では見つからない
  const g1 = S.gold;
  withRandom(() => (i < seq2.length ? seq2[i++] : 0.99), () => e.travel('r9'));
  check('王都に着く', S.town === 'oto' && e.D.TOWNS.oto.kind === 'capital');
  check('王都の門で入市税を取られる', /入市税/.test(e.text()) && S.gold < g1 - e.g.routeInfo('r9').toll + 1);
  e.closeAll();
  check('王都では禁制品が売れない', e.g.banned('oto', 'liquor') && (e.act('sell', { g: 'liquor' }), !e.open()));
  check('王都は高く売れる（毛織物）', e.g.mult('oto', 'cloth') >= 1.4);
  S.cargo = { liquor: { qty: 3, cost: 150, age: 0 } }; S.town = 'tsuno';
  // 乱数を 0.6 に固定：山賊なし・関所では見つからない（0.5 未満で発見）・門では見つかる（0.7 未満で発見）
  withRandom(0.6, () => e.travel('r9'));
  check('王都の門で禁制品が見つかると没収', !S.cargo.liquor && /門番/.test(e.text())); e.closeAll();
}

// ---------- 6. 山賊 ----------
function testBandits() {
  console.log('■ 山賊');
  const D0 = fresh().D;
  const setup = (guards) => {
    const e = fresh(), S = e.g.state;
    S.town = 'kawabe'; S.seen.kawabe = 2; S.roads.r8 = true; S.gold = 200; S.guards = guards || 0;
    S.cargo = { linen: { qty: 10, cost: 350, age: 0 } };
    return e;
  };
  // 乱数 0 → 山賊に遭う。その後の値で種類と勝敗を決める
  const run = (e, seq, re) => { let i = 0; return withRandom(() => (i < seq.length ? seq[i++] : 0.99), () => e.travel('r8', (txt) => (/だ！/.test(txt) ? re : null))); };
  let e = setup(3);
  run(e, [0, 0.99, 0.99, 0.5, 0.0], /戦う/);       // 遭遇・故障なし・こそ泥・強さ・勝ち
  const up = (e2) => e2.g.dailyCost().total * 3;   // 3日ぶんの宿代など
  check('戦って勝つと金を得て、荷も無事', e.g.state.stats.wins === 1 && e.g.state.gold > 200 - up(e) && e.g.state.cargo.linen.qty === 10 && /追い払った/.test(e.text())); e.closeAll();
  e = setup(0);
  run(e, [0, 0.99, 0.1, 0.5, 0.99], /戦う/);       // 山賊団・負け
  check('戦って負けると荷と金を奪われる', e.g.state.stats.robbed === 1 && e.g.state.gold < 200 && e.g.state.cargo.linen.qty < 10); e.closeAll();
  e = setup(0);
  run(e, [0, 0.99, 0.99, 0.5, 0.0], /逃げる/);     // 逃げ切る
  check('逃げ切れば何も失わない', e.g.state.gold === 200 - up(e) && e.g.state.cargo.linen.qty === 10 && e.g.state.town === 'hataori'); e.closeAll();
  e = setup(0);
  run(e, [0, 0.99, 0.99, 0.5], /通行料/);
  check('通行料を払えば通してもらえる', e.g.state.gold < 200 - up(e) && e.g.state.gold > 150 && e.g.state.cargo.linen.qty === 10); e.closeAll();
  e = setup(0);
  run(e, [0, 0.99, 0.99, 0.5], /荷の/);
  check('荷を渡せば通してもらえる', e.g.state.gold === 200 - up(e) && e.g.state.cargo.linen.qty === 7); e.closeAll();
  check('こそ泥と山賊団の2種がいる', D0.CONFIG.bandits.thief.max < D0.CONFIG.bandits.gang.min);
  const a = setup(0).g, b = setup(3).g;
  check('護衛を雇うと戦う力が上がる', b.power(false) > a.power(false) * 3, `${a.power(false)} → ${b.power(false)}`);
  check('危ない道ほど山賊に遭いやすい', D0.CONFIG.banditBase[3] > D0.CONFIG.banditBase[0] * 4);
}

// ---------- 7. 荷車・故障・隊商 ----------
function testCarts() {
  console.log('■ 荷車・故障・隊商');
  const e = fresh(), S = e.g.state, D = e.D;
  S.town = 'kawabe'; S.seen.kawabe = 2; S.gold = 5000;
  for (const rid in D.ROADS) S.roads[rid] = true;
  for (const id of ['handcart', 'donkey', 'horse']) { e.act('buyCart', { id }); e.press(1); e.closeAll(); }
  check('荷車を順に買い替えられる', S.cart.type === 'horse' && S.stageMax === 2);
  check('大きい荷車ほど積めるが、餌代がかかる', D.CARTS.horse.cap > D.CARTS.donkey.cap && D.CARTS.donkey.cap > D.CARTS.handcart.cap && e.g.dailyCost().feed === D.CARTS.horse.feed);
  const road = e.g.routeInfo('r8').days, trail = (S.town = 'hashibami', e.g.routeInfo('r2').days);
  S.cart.type = 'basket'; const foot = e.g.routeInfo('r2').days; S.cart.type = 'horse'; S.town = 'kawabe';
  check('馬車は街道で速く、山道では徒歩より遅い', road < D.ROADS.r8.len && trail > foot, `街道${road}日（徒歩${D.ROADS.r8.len}日）・山道${trail}日（徒歩${foot}日）`);
  // 故障：山賊なし(0.99)・故障あり(0)
  S.cargo = { linen: { qty: 20, cost: 700, age: 0 } };
  let i = 0; const seq = [0.99, 0];
  const g0 = S.gold;
  withRandom(() => (i < seq.length ? seq[i++] : 0.99), () => e.travel('r8', (txt) => (/壊れた/.test(txt) ? /直して/ : null)));
  check('道中で車が壊れ、修理代と1日がかかる', S.gold === g0 - D.CARTS.horse.repair - e.g.dailyCost().total * (road + 1) && S.cargo.linen.qty === 20, `${g0 - S.gold}枚`);
  e.closeAll();
  S.gold = 3; i = 0; S.town = 'kawabe';
  withRandom(() => (i < seq.length ? seq[i++] : 0.99), () => e.travel('r8'));
  check('修理代が無いと荷を捨てることになる', S.cargo.linen.qty < 20, `残り${S.cargo.linen.qty}個`); e.closeAll();
  // 荷車を売る
  S.town = 'kawabe'; S.cargo = {}; S.gold = 0; S.cart = { type: 'donkey', hp: 100 };
  e.act('sellCart'); e.press(1); e.closeAll();
  check('苦しいときは荷車を売って背負い籠に戻れる', S.cart.type === 'basket' && S.gold > 100 && S.gold < D.CARTS.donkey.price, `+${S.gold}枚`);
  // 隊商
  S.town = 'kawabe'; S.gold = 300; S.debt = 0; S.cart = { type: 'basket', hp: 100 }; S.cargo = {};
  e.act('tab', { id: 'town' });
  check('町に隊商が集まっている', /隊商/.test(e.main.innerHTML) && S.caravans.kawabe.length >= 1);
  const c = S.caravans.kawabe[0], d0 = Math.floor(S.time / 4), dest = D.ROADS[c.rid].a === 'kawabe' ? D.ROADS[c.rid].b : D.ROADS[c.rid].a;
  e.act('caravan', { i: '0' });
  withRandom(0.99, () => { e.press(1); let n = 0; while (e.g.travel && n++ < 100) { e.drain(); if (e.open()) e.press(0); } });
  check('参加費を払い、出発を待って隊商と移動する', S.town === dest && S.gold <= 300 - c.fee && Math.floor(S.time / 4) - d0 >= c.leave - d0 + 1);
  check('隊商は山賊に遭いにくく、戦う力も大きい', D.CONFIG.caravanSafety < 0.5 && e.g.power(true) > e.g.power(false) + 20); e.closeAll();
}

// ---------- 8. 借金・差し押さえ・破産 ----------
function testDebt() {
  console.log('■ 借金・差し押さえ・破産');
  const e = fresh(), S = e.g.state, D = e.D;
  S.town = 'kawabe'; S.seen.kawabe = 2;
  const lim = e.g.debtLimit();
  e.qty('borrow', {}, 50);
  check('金貸しから借りられる', S.debt === 50 && S.gold === D.CONFIG.startGold + 50);
  check('借りられるのは上限の手前まで', (e.qty('borrow', {}), S.debt <= lim * D.CONFIG.borrowRate + 0.01), `借金${S.debt}／上限${lim}`);
  const d1 = S.debt; e.act('rest'); e.closeAll();
  check('借金には毎日利子がつく', S.debt > d1);
  e.qty('repay', {}, 20);
  check('借金を返せる', S.debt < d1);
  // 差し押さえの順番：店 → 荷車 → 荷
  S.cart = { type: 'donkey', hp: 100 }; S.shop = { town: 'kawabe', lv: 1, stock: {}, till: 0 };
  S.cargo = { linen: { qty: 10, cost: 350, age: 0 } }; S.gold = 0;
  S.debt = e.g.debtLimit() + 5; withRandom(0.99, () => { e.act('rest'); });
  check('借金が上限を超えると、まず店を差し押さえられる', S.shop === null && S.cart.type === 'donkey' && /差し押さえ/.test(e.text())); e.closeAll();
  S.debt = e.g.debtLimit() + 5; withRandom(0.99, () => { e.act('rest'); });
  check('次に荷車を差し押さえられ、背負い籠に戻る', S.cart.type === 'basket' && e.g.cargoCount() > 0); e.closeAll();
  S.debt = e.g.debtLimit() + 5; withRandom(0.99, () => { e.act('rest'); });
  check('次に荷を取り上げられる', e.g.cargoCount() === 0 && !S.dead); e.closeAll();
  S.debt = e.g.debtLimit() + 500; withRandom(0.99, () => { e.act('rest'); });
  check('何も残らなければ破産する', S.dead === true && /破産/.test(e.modal.innerHTML));
  check('破産するとセーブが消える', !(KEY in e.store));
  const e2 = boot(Object.assign({}, e.store));
  check('読み直しても破産前には戻れない', e2.g.state.time === 0 && e2.g.state.gold === D.CONFIG.startGold);
  e.press(0); e.drain();
  const S2 = e.g.state;
  check('破産後は完全に最初から', S2.time === 0 && S2.gold === D.CONFIG.startGold && S2.cart.type === 'basket' && S2.debt === 0 && Object.keys(S2.seen).filter((t) => S2.seen[t] === 2).length === 1);
  check('無条件の援助金は無い', !/援助/.test(fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8')));
}

// ---------- 9. 店と評判 ----------
function testShop() {
  console.log('■ 店・評判');
  const e = fresh(), S = e.g.state, D = e.D, L1 = D.CONFIG.shop[1], L2 = D.CONFIG.shop[2];
  S.town = 'kawabe'; S.seen.kawabe = 2; S.gold = 5000;
  e.act('shopOpen');
  check('評判が足りないと露店を出せない', S.shop === null && !e.open());
  S.cargo = { wool: { qty: 12, cost: 200, age: 0 } };
  const r0 = S.rep.kawabe; e.qty('sell', { g: 'wool' }); e.closeAll();
  check('町が欲しがる品を売ると評判が上がる', S.rep.kawabe > r0, `${r0} → ${S.rep.kawabe.toFixed(1)}`);
  S.rep.kawabe = L1.rep; e.act('shopOpen'); e.press(1); e.closeAll();
  check('評判とお金がそろえば露店を出せる', S.shop && S.shop.lv === 1 && S.stageMax === 3 && e.g.stage() === 3);
  check('店賃が毎日の出費に加わる', e.g.dailyCost().shop === L1.rent);
  S.town = 'hashibami'; e.act('tab', { id: 'town' });
  check('村には店を出せない（すでに店があれば状況だけ見える）', /店のある町に行けば/.test(e.main.innerHTML));
  S.town = 'kawabe';
  S.cargo = { honey: { qty: 10, cost: 240, age: 0 }, wine: { qty: 10, cost: 250, age: 0 } };
  e.qty('shopPut', { g: 'honey' }); e.qty('shopPut', { g: 'wine' });
  check('荷を店に預けられる', S.shop.stock.honey.qty === 10 && !S.cargo.honey);
  withRandom(0.99, () => { for (let i = 0; i < L1.every; i++) { e.act('rest'); e.closeAll(); } });
  check('露店は市の日に預けた品を売る', S.shop.till > 0 && S.shop.stock.honey.qty === 10 - L1.rate, `売上 ${S.shop.till}枚`);
  const wholesale = e.g.sellNow('kawabe', 'honey');
  check('店で売るほうが、自分で卸すより高い', S.shop.till / (L1.rate * 2) > 0 && D.CONFIG.shopPrice > D.CONFIG.sellRate, `卸値 ${wholesale}枚`);
  const g0 = S.gold, till = S.shop.till; e.act('shopTake'); e.closeAll();
  check('売上金を受け取れる', S.gold === g0 + till && S.shop.till === 0);
  e.act('shopUp');
  check('評判が足りないと建て替えられない', S.shop.lv === 1);
  S.rep.kawabe = L2.rep; e.act('shopUp'); e.press(1); e.closeAll();
  check('露店を小さな店に建て替えられる', S.shop.lv === 2 && e.g.dailyCost().shop === L2.rent + L2.wage);
  const st = S.shop.stock.honey.qty; withRandom(0.99, () => { e.act('rest'); e.closeAll(); });
  check('小さな店は毎日売れる', S.shop.stock.honey.qty < st);
  const g1 = S.gold; e.act('shopClose'); e.press(1); e.closeAll();
  check('店をたたむと一部が戻り、店賃がなくなる', S.shop === null && S.gold > g1 && S.gold < g1 + L1.cost + L2.cost && e.g.dailyCost().shop === 0, `+${S.gold - g1}枚`);
  // 護衛
  S.town = 'kawabe'; S.guards = 0; S.gold = 100; e.act('guard', { n: '1' });
  const hired = S.guards === 1 && e.g.dailyCost().guards === D.CONFIG.guardWage;
  S.town = 'hashibami'; e.act('guard', { n: '1' }); const noHire = S.guards === 1; e.act('guard', { n: '-1' });
  check('護衛は口入れ屋のある町で雇え、暇を出すのはどの町でもできる', hired && noHire && S.guards === 0);
  S.guards = 1; S.gold = 0; withRandom(0.99, () => { e.act('rest'); });
  check('給金を払えないと護衛は去る', S.guards === 0 && /護衛/.test(e.text())); e.closeAll();
}

// ---------- 10. 通しプレイ ----------
// 手堅い商人：もうかる品を選び、危ない道を避け、余裕があれば荷車・護衛・店に投資する
function playCareful(maxDays) {
  const e = fresh(), g = e.g, D = e.D, C = D.CONFIG, S = () => g.state;
  const mark = {};
  const note = (k) => { if (mark[k] == null) mark[k] = Math.floor(S().time / 4); };
  const other = (r, t) => (r.a === t ? r.b : r.a);
  let guard = 0;
  while (e.died == null && Math.floor(S().time / 4) < maxDays && guard++ < 3000) {
    const t = S().town, T = D.TOWNS[t];
    mark.peak = Math.max(mark.peak || 0, Math.round(S().gold));
    // 売る
    for (const gid of Object.keys(S().cargo)) {
      if (g.banned(t, gid)) continue;
      const own = S().cargo[gid], avg = own.cost / own.qty;
      // 店には、売れ残らない程度（1品12個まで）だけ預ける
      const inShop = S().shop && S().shop.stock[gid] ? S().shop.stock[gid].qty : 0;
      if (S().shop && S().shop.town === t && g.mult(t, gid) > 1.05 && !D.GOODS[gid].shelf && inShop < 12) { e.qty('shopPut', { g: gid }, Math.min(own.qty, 12 - inShop)); if (!S().cargo[gid]) continue; }
      if (g.sellNow(t, gid, g.fresh(gid, own.age)) > avg * 0.95 || D.GOODS[gid].shelf) e.qty('sell', { g: gid });
    }
    e.closeAll(); if (e.died != null) break;
    if (S().shop && S().shop.town === t && S().shop.till > 0) { e.act('shopTake'); e.closeAll(); }
    // 借金を返す・投資する
    if (T.has.lender && S().debt > 0 && S().gold > 60) e.qty('repay', {}, Math.min(Math.floor(S().gold - 40), Math.ceil(S().debt)));
    if (T.has.cart) {
      if (S().cart.type !== 'basket' && S().cart.hp < 60) e.act('fix');
      const next = { basket: 'handcart', handcart: 'donkey', donkey: 'horse' }[S().cart.type];
      if (next && S().gold > D.CARTS[next].price * 1.3 + 120) { e.act('buyCart', { id: next }); e.press(1); e.closeAll(); note(next); }
    }
    const reserve = 25 + g.dailyCost().total * 4;   // 手元に残しておくお金
    if (S().guards > 0 && S().gold < 60) while (S().guards > 0) e.act('guard', { n: '-1' });   // 苦しくなったら護衛に暇を出す
    if (T.has.guard && S().cart.type !== 'basket') {
      const want = S().cart.type === 'handcart' ? 1 : 2;
      while (S().guards < want && S().gold > 150 + S().guards * 80) e.act('guard', { n: '1' });
    }
    if (!S().shop && T.kind !== 'village' && S().rep[t] >= C.shop[1].rep && S().gold > C.shop[1].cost + 150) { e.act('shopOpen'); e.press(1); e.closeAll(); note('露店'); }
    if (S().shop && S().shop.town === t && S().shop.lv === 1 && S().rep[t] >= C.shop[2].rep && S().gold > C.shop[2].cost + 200) { e.act('shopUp'); e.press(1); e.closeAll(); note('小さな店'); }
    // 行き先と品を決める：1日あたりの見込み利益がいちばん大きい組み合わせ
    let best = null;
    for (const rid of g.roadsFrom(t)) {
      const info = g.routeInfo(rid), to = info.to;
      if (info.shown >= 3 || (info.shown >= 2 && S().guards < 2) || info.breakP > 0.12) continue;
      let value = -info.toll, cap = D.CARTS[S().cart.type].cap - g.cargoCount(), money = S().gold - Math.min(reserve, S().gold * 0.25) - info.toll, plan = [];
      const cands = T.sells.filter((gid) => !(D.CONTRABAND.includes(gid) && (D.ROADS[rid].toll || g.banned(to, gid))) && !(D.GOODS[gid].shelf && info.days > D.GOODS[gid].shelf * 0.5))
        .map((gid) => ({ gid, buy: g.buyNow(t, gid), gain: D.GOODS[gid].base * g.mult(to, gid) * (1 + S().market[to][gid]) * C.sellRate * 0.88 - g.buyNow(t, gid) * 1.06 }))
        .filter((x) => x.gain > 0).sort((a, b) => b.gain / b.buy - a.gain / a.buy);
      for (const x of cands) {
        const n = Math.max(0, Math.min(cap, Math.floor(money / (x.buy * 1.1)), Math.round(D.GOODS[x.gid].depth * D.TOWNS[to].size * 0.35)));
        if (n <= 0) continue;
        plan.push([x.gid, n]); value += n * x.gain; cap -= n; money -= n * x.buy * 1.1;
      }
      if (S().seen[to] !== 2) value += 4;
      const perDay = (value - g.dailyCost().total * info.days) / info.days;
      if (!best || perDay > best.perDay) best = { rid, plan, perDay };
    }
    // 行き詰まったとき：荷車を売る、店をたたむ、金を借りる、車屋のある町へ向かう
    if (S().gold < 25 && g.cargoCount() === 0) {
      if (S().shop && S().shop.town === t) { e.act('shopClose'); e.press(1); e.closeAll(); continue; }
      if (T.has.cart && S().cart.type !== 'basket') { e.act('sellCart'); e.press(1); e.closeAll(); continue; }
      if (T.has.lender && S().debt < g.debtLimit() * 0.4) { e.qty('borrow', {}, 50); continue; }
      if (S().cart.type !== 'basket' || S().shop) {
        const want = S().shop ? S().shop.town : 'kawabe';
        const rid = g.roadsFrom(t).filter((r) => g.routeInfo(r).shown < 3).sort((a, b) => (g.routeInfo(a).to === want ? -1 : 0) - (g.routeInfo(b).to === want ? -1 : 0) || g.routeInfo(a).days - g.routeInfo(b).days)[0];
        if (rid) { e.travel(rid, (txt) => (/だ！/.test(txt) ? /逃げる|戦う/ : null)); e.closeAll(); continue; }
      }
    }
    if (!best) { e.act('rest'); e.closeAll(); continue; }
    if (best.perDay < 1 && S().gold < 15 && g.cargoCount() === 0) { e.act('work'); e.closeAll(); continue; }
    for (const [gid, n] of best.plan) e.qty('buy', { g: gid }, n);
    e.closeAll(); if (e.died != null) break;
    e.travel(best.rid, (txt) => {
      if (/だ！/.test(txt)) return /有利/.test(txt) ? /戦う/ : /通行料/.test(e.modal.innerHTML) && S().gold < 80 ? /通行料/ : /五分/.test(txt) ? /戦う/ : /逃げる|荷の/;
      if (/壊れた/.test(txt)) return /直して/;
      return null;
    });
    e.closeAll();
  }
  return { dead: e.died != null, day: e.died != null ? e.died : Math.floor(S().time / 4), gold: Math.round(S().gold), debt: Math.round(S().debt), cart: S().cart.type, shop: S().shop ? S().shop.lv : 0, mark, trips: S().stats.trips, seen: e.seen, towns: Object.keys(S().seen).filter((k) => S().seen[k] === 2).length };
}
// 無鉄砲な商人：適当に買い、適当な道を行き、山賊とは必ず戦い、借りられるだけ借りる
function playReckless(maxDays) {
  const e = fresh(), g = e.g, D = e.D, S = () => g.state;
  let guard = 0;
  while (e.died == null && Math.floor(S().time / 4) < maxDays && guard++ < 2000) {
    const t = S().town;
    for (const gid of Object.keys(S().cargo)) if (!g.banned(t, gid)) e.qty('sell', { g: gid });
    e.closeAll(); if (e.died != null) break;
    if (D.TOWNS[t].has.lender) e.qty('borrow', {});
    const gid = D.TOWNS[t].sells[Math.floor(Math.random() * D.TOWNS[t].sells.length)];
    e.qty('buy', { g: gid }); e.closeAll(); if (e.died != null) break;
    const rs = g.roadsFrom(t);
    e.travel(rs[Math.floor(Math.random() * rs.length)], (txt) => (/だ！/.test(txt) ? /戦う/ : null));
    e.closeAll();
  }
  return { dead: e.died != null, day: e.died != null ? e.died : Math.floor(S().time / 4) };
}
function testPlay() {
  console.log('■ 通しプレイ');
  const N = 24, runs = [], seen = {};
  for (let i = 0; i < N; i++) { const r = playCareful(420); runs.push(r); Object.assign(seen, r.seen); }
  const med = (k) => { const a = runs.map((r) => r.mark[k]).filter((x) => x != null).sort((x, y) => x - y); return a.length ? `${a[Math.floor(a.length / 2)]}日目（${a.length}/${N}回）` : `到達なし（0/${N}回）`; };
  const num = (k) => runs.filter((r) => r.mark[k] != null).length, medDay = (k) => { const a = runs.map((r) => r.mark[k]).filter((x) => x != null).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 9999; };
  console.log(`  手堅い商人 ${N}回（420日まで）`);
  console.log(`    手押し車 ${med('handcart')} / ロバの荷車 ${med('donkey')} / 馬車 ${med('horse')}`);
  console.log(`    露店 ${med('露店')} / 小さな店 ${med('小さな店')} / 破産 ${runs.filter((r) => r.dead).length}回`);
  console.log(`    最後の所持金（中央）${runs.map((r) => r.gold).sort((a, b) => a - b)[N >> 1]}枚 / 訪れた町（中央）${runs.map((r) => r.towns).sort((a, b) => a - b)[N >> 1]} / 行商（中央）${runs.map((r) => r.trips).sort((a, b) => a - b)[N >> 1]}回`);
  console.log(`    所持金の最高（中央）${runs.map((r) => r.mark.peak || 0).sort((a, b) => a - b)[N >> 1]}枚 / （最大）${Math.max.apply(null, runs.map((r) => r.mark.peak || 0))}枚`);
  console.log('    通った場面： ' + Object.keys(seen).join(' / '));
  check('手堅く遊べば、たいてい手押し車まで行ける', num('handcart') >= N * 0.75, num('handcart') + '/' + N);
  check('手押し車まで、すぐには届かない（中央が10日目より後）', medDay('handcart') > 10, medDay('handcart') + '日目');
  check('手堅く遊べば、店を持てることがある', num('露店') >= N * 0.3, num('露店') + '/' + N);
  const bust = runs.filter((r) => r.dead).length;
  check('手堅く遊んでも破産することはあるが、半分は生き残る（理不尽ではない）', bust <= N * 0.5, `破産 ${bust}/${N}`);
  check('店を持つのは簡単ではない（中央が60日目より後）', medDay('露店') > 60, medDay('露店') + '日目');
  check('山賊・関所・故障の場面を通った', Object.keys(seen).some((k) => /戦う|逃げる|通行料|荷の/.test(k)) && Object.keys(seen).some((k) => /先へ進む/.test(k)));
  const M = 30, rk = []; for (let i = 0; i < M; i++) rk.push(playReckless(300));
  const dead = rk.filter((r) => r.dead), dd = dead.map((r) => r.day).sort((a, b) => a - b);
  console.log(`  無鉄砲な商人 ${M}回（300日まで）： 破産 ${dead.length}回` + (dead.length ? `（中央 ${dd[dd.length >> 1]}日目）` : ''));
  check('無鉄砲に遊ぶと、半分以上は破産する（簡単すぎない）', dead.length >= M * 0.5, dead.length + '/' + M);
  check('どの遊び方でも途中で止まらない', runs.every((r) => r.dead || r.day >= 420) && rk.every((r) => r.dead || r.day >= 300));
}

// ---------- 既存のゲームに触っていないこと ----------
function testIsolation() {
  console.log('■ 既存のゲームとの分離');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), js = fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');
  check('shokai/ は自分のフォルダの中だけを読みこむ', !/\.\.\//.test(html));
  check('航海版のデータ（window.DATA）や保存名を使わない', !/window\.DATA|kaze-to-ho/.test(js));
  check('航海版のファイルが残っている', ['index.html', 'js/game.js', 'css/style.css', 'js/data/ports.js'].every((f) => fs.existsSync(path.join(ROOT, '..', f))));
}

testData(); testStart(); testTrade(); testTravel(); testGate(); testBandits(); testCarts(); testDebt(); testShop(); testIsolation(); testPlay();
console.log(fails ? `\n✗ 失敗 ${fails}件` : '\n✓ すべて合格');
process.exit(fails ? 1 : 0);
