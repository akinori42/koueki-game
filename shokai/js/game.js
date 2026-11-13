// 背負い籠の商会（第4版：噂・旅の物語・季節・得意先・成り上がり・隣国）：ゲーム本体。
// 数値やデータは js/data/ のファイルにある。
(function () {
  'use strict';

  const D = window.SHOKAI, C = D.CONFIG, CAL = D.CALENDAR;
  const SAVE_KEY = 'shokai-save-v4';      // 前の版（v1〜v3）とは仕組みがちがうので別の保存場所。古いセーブは読まず、消しもしない
  const REC_KEY = 'shokai-records';       // 商人録（歴代の記録）。破産しても残る
  const SAVE_VERSION = 4;
  const QN = ['朝', '昼', '夕', '夜'];
  const KIND = { village: '村', town: '町', capital: '都', port: '港町' };
  const DANGER = ['安全', 'やや危険', '危険', 'とても危険'];
  const SRC = { street: '町の声', tavern: '酒場', traveler: '旅人', patron: '得意先', broker: '情報屋' };
  const STARS = { street: '★', tavern: '★★', traveler: '★★', patron: '★★★', broker: '★★★' };

  let S = null;
  let ui = { tab: 'market', dest: null };
  let travel = null;            // 移動中だけ使う
  let notices = [];             // 順番に出すお知らせ
  let dayNotes = [];            // 日付が変わったときのできごと

  // ---------- 小道具 ----------
  const $ = (s) => document.querySelector(s);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rndi = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = (n) => Math.round(n).toLocaleString('ja-JP');
  const G = (n) => `<span class="gold">${fmt(n)}枚</span>`;
  const day = () => Math.floor(S.time / 4);
  const cartT = () => D.CARTS[S.cart.type];
  const other = (r, t) => (r.a === t ? r.b : r.a);
  const townName = (t) => (S.named[t] ? D.TOWNS[t].name : '？？？');
  const U = (g) => D.GOODS[g].unit;
  const qtyStr = (g, n) => `${n}${D.GOODS[g].unit}`;
  const inPlay = (t) => !D.TOWNS[t].abroad || S.abroad;          // 隣国の町は、道が開くまで出てこない
  const goodInPlay = (g) => !D.GOODS[g].abroad || S.abroad;
  const playTowns = () => Object.keys(D.TOWNS).filter(inPlay);
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast.tm);
    toast.tm = setTimeout(() => t.classList.add('hidden'), 1800);
  }
  // 町と町のあいだの、歩いたときの最短日数
  const DIST = (function () {
    const ids = Object.keys(D.TOWNS), d = {};
    for (const a of ids) { d[a] = {}; for (const b of ids) d[a][b] = a === b ? 0 : 999; }
    for (const rid in D.ROADS) { const r = D.ROADS[rid]; d[r.a][r.b] = d[r.b][r.a] = Math.min(d[r.a][r.b], r.len); }
    for (const k of ids) for (const a of ids) for (const b of ids) if (d[a][k] + d[k][b] < d[a][b]) d[a][b] = d[a][k] + d[k][b];
    return d;
  })();

  // ---------- 暦 ----------
  const seasonOf = (d) => CAL.seasons[Math.floor((d % CAL.yearDays) / 30)];
  const seasonDay = (d) => d % 30;
  const dateStr = () => `${seasonOf(day()).icon}${seasonOf(day()).name}${seasonDay(day()) + 1}日`;
  const timeStr = () => `${day() + 1}日目（${dateStr()}）${QN[S.time % 4]}`;
  // 季節による、値段と在庫の倍率
  function seasonMods(t, g, d) {
    let p = 1, s = 1;
    const sid = seasonOf(d).id, src = D.TOWNS[t].stock[g] != null;
    for (const m of CAL.mods) {
      if (m.season !== sid || m.g !== g) continue;
      if (m.where === 'src' && !src) continue;
      p *= m.price || 1; if (src) s *= m.stock || 1;
    }
    return { p, s };
  }
  const eventOn = (ev, d) => seasonOf(d).id === ev.season && seasonDay(d) >= ev.from && seasonDay(d) <= ev.to;
  function eventMult(t, g, d) {
    let m = 1;
    for (const ev of CAL.events) {
      if (!eventOn(ev, d) || (ev.t && ev.t !== t)) continue;
      if (ev.goods && ev.goods[g]) m *= ev.goods[g]; else if (ev.all) m *= ev.all;
    }
    return m;
  }
  // これから within 日のうちに始まる行事と、いま開かれている行事
  function upcoming(within) {
    const d0 = day(), out = [];
    for (const ev of CAL.events) {
      if (ev.t && !inPlay(ev.t)) continue;
      if (eventOn(ev, d0)) { let left = 0; while (eventOn(ev, d0 + left + 1)) left++; out.push({ ev, inDays: 0, left: left + 1 }); continue; }
      for (let k = 1; k <= within; k++) if (eventOn(ev, d0 + k)) { out.push({ ev, inDays: k, left: ev.to - ev.from + 1 }); break; }
    }
    return out.sort((a, b) => a.inDays - b.inDays);
  }
  const roadClosed = (rid, d) => CAL.closed.some((c) => c.season === seasonOf(d == null ? day() : d).id && c.roads.includes(rid));

  // ---------- 物語 ----------
  function tell(key, vars) {
    const sc = D.STORY[key];
    if (!sc || S.told[key]) return false;
    S.told[key] = 1;
    const fill = (s) => s.replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));
    notices.push({ title: '📖 ' + fill(sc.title), body: sc.text.map((p) => `<p class="story">${fill(p)}</p>`).join(''), label: sc.label });
    return true;
  }

  // ---------- セーブ・商人録 ----------
  function newGame() {
    S = {
      v: SAVE_VERSION, time: 0, gold: C.startGold, town: C.startTown,
      cart: { type: 'basket', hp: 100 }, guards: 0, cargo: {},
      market: {}, drift: {}, stock: {}, hist: {},
      seen: {}, named: {}, roads: {}, rep: {}, memo: {}, pass: {}, abroad: false,
      debt: 0, loan: { n: 0, pre: 0, cycle: 0, done: false }, shop: null, home: {},
      trends: [], rumors: [], rid: 0, hot: {}, hotKnown: {}, caravans: {}, offers: {}, orders: [], done: {}, patrons: [], told: {},
      rain: false, stageMax: 1, dead: false, stats: { trips: 0, wins: 0, robbed: 0, profit: 0, orders: 0, supplies: 0, bestTrip: 0 }
    };
    fillMissing();
    discover(S.town);
    recordMemo(S.town);
    hearStreet(S.town);
  }
  function fillMissing() {
    for (const t in D.TOWNS) {
      S.market[t] = S.market[t] || {}; S.drift[t] = S.drift[t] || {}; S.stock[t] = S.stock[t] || {};
      for (const g in D.GOODS) {
        if (typeof S.market[t][g] !== 'number') S.market[t][g] = 0;
        if (typeof S.drift[t][g] !== 'number') S.drift[t][g] = rnd(-0.1, 0.1);
      }
      for (const g in D.TOWNS[t].stock) if (typeof S.stock[t][g] !== 'number') S.stock[t][g] = stockMax(t, g);
      if (typeof S.rep[t] !== 'number') S.rep[t] = 0;
      if (!S.hist[t] || !S.hist[t].length) S.hist[t] = [snapshot(t)];
    }
    for (const g in S.cargo) if (!D.GOODS[g]) delete S.cargo[g];
    if (!D.CARTS[S.cart.type]) S.cart = { type: 'basket', hp: 100 };
    if (!D.TOWNS[S.town]) S.town = C.startTown;
  }
  function save() {
    if (!S || S.dead) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* 保存できない環境でも遊べる */ }
  }
  function wipeSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 無視 */ } }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const o = JSON.parse(raw);
      if (!o || o.v !== SAVE_VERSION || o.dead) return false;
      S = o; fillMissing();
      return true;
    } catch (e) { return false; }
  }
  function records() { try { return JSON.parse(localStorage.getItem(REC_KEY) || '[]') || []; } catch (e) { return []; } }
  function addRecord(result) {
    const list = records();
    list.unshift({
      result, day: day() + 1, paid: S.loan.n, cart: cartT().name, shop: S.shop ? C.shop[S.shop.lv].name : 'なし',
      towns: Object.keys(S.seen).filter((t) => S.seen[t] === 2).length, best: Math.round(S.stats.bestTrip), abroad: !!S.abroad
    });
    try { localStorage.setItem(REC_KEY, JSON.stringify(list.slice(0, 12))); } catch (e) { /* 無視 */ }
  }

  // ---------- 荷 ----------
  function cargoWeight() { let n = 0; for (const g in S.cargo) n += S.cargo[g].qty * D.GOODS[g].w; return n; }
  function cargoCount() { let n = 0; for (const g in S.cargo) n += S.cargo[g].qty; return n; }
  function cargoCost() { let n = 0; for (const g in S.cargo) n += S.cargo[g].cost; return n; }
  function freeWeight() { return Math.max(0, cartT().cap - cargoWeight()); }
  function cargoWorth() { let v = 0; for (const g in S.cargo) v += S.cargo[g].qty * D.GOODS[g].base; return v; }
  function contraWorth() { let v = 0; for (const g in S.cargo) if (D.CONTRABAND.includes(g)) v += S.cargo[g].qty * D.GOODS[g].base; return v; }
  function fresh(g, age) {
    const sh = D.GOODS[g].shelf;
    if (!sh || age <= sh * 0.4) return 1;
    return Math.max(0.15, 1 - (age - sh * 0.4) / (sh * 0.6) * 0.85);
  }
  function loseCargo(frac) {
    let n = 0;
    for (const g in S.cargo) {
      const c = S.cargo[g], k = Math.min(c.qty, Math.ceil(c.qty * frac)), cost = (c.cost / c.qty) * k;
      c.cost -= cost; c.qty -= k; n += k;
      if (travel) travel.lost += cost;
      if (c.qty <= 0) delete S.cargo[g];
    }
    return n;
  }
  function dropContraband() {
    let n = 0;
    for (const g of Object.keys(S.cargo)) if (D.CONTRABAND.includes(g)) { n += S.cargo[g].qty; if (travel) travel.lost += S.cargo[g].cost; delete S.cargo[g]; }
    return n;
  }
  function addCargo(g, q, cost) {
    const c = S.cargo[g] || (S.cargo[g] = { qty: 0, cost: 0, age: 0 });
    c.age = (c.age * c.qty) / (c.qty + q);
    c.qty += q; c.cost += cost;
  }

  // ---------- 相場 ----------
  const sellsHere = (t, g) => D.TOWNS[t].stock[g] != null;
  const banned = (t, g) => (D.TOWNS[t].ban || []).includes(g);
  const homeBonus = (t) => { let b = 1; if (t === C.startTown) for (const k in C.home) if (S.home[k]) b += C.home[k].stock; return b; };
  function stockMax(t, g) { return Math.round(D.TOWNS[t].stock[g] * seasonMods(t, g, day()).s * homeBonus(t)); }
  // いま効いている高騰・値崩れ（これから起きるものは含めない）
  function trendOf(t, g) { const d = day(); for (const x of S.trends) if (x.t === t && x.g === g && x.from <= d) return x; return null; }
  // その日の倍率 = 町の基本 × 予定外の高騰・値崩れ ×（1 + 日々のゆれ）× 季節 × 行事
  function mult(t, g) {
    const m = D.TOWNS[t].prices[g], tr = trendOf(t, g), d = day();
    return (typeof m === 'number' ? m : 1) * (tr ? tr.m : 1) * (1 + S.drift[t][g]) * seasonMods(t, g, d).p * eventMult(t, g, d);
  }
  const patronOf = (t) => S.patrons.find((p) => p.t === t) || null;
  const trusted = (t) => { const p = patronOf(t); return !!p && p.streak >= C.patronTrust; };   // 得意先として信用されている町
  const step = (t, g) => 1 / (D.GOODS[g].depth * D.TOWNS[t].size);
  const unitBuy = (t, g, dev) => Math.max(1, Math.ceil(D.GOODS[g].base * mult(t, g) * (1 + dev) * (trusted(t) ? 1 - C.patronEdge : 1)));
  const unitSell = (t, g, dev, f) => Math.max(1, Math.floor(D.GOODS[g].base * mult(t, g) * (1 + dev) * C.sellRate * (f == null ? 1 : f) * (trusted(t) ? 1 + C.patronEdge : 1)));
  const buyNow = (t, g) => unitBuy(t, g, S.market[t][g]);
  const sellNow = (t, g, f) => unitSell(t, g, S.market[t][g], f);
  function quote(t, g, q, dir, f) {
    let dev = S.market[t][g], tot = 0;
    const st = step(t, g);
    for (let i = 0; i < q; i++) {
      if (dir > 0) { tot += unitBuy(t, g, dev); dev = Math.min(C.devMax, dev + st); }
      else { tot += unitSell(t, g, dev, f); dev = Math.max(C.devMin, dev - st); }
    }
    return { tot, dev };
  }
  function maxBuy(t, g) {
    const lim = Math.min(Math.floor(freeWeight() / D.GOODS[g].w), Math.floor(S.stock[t][g] || 0)), st = step(t, g);
    let dev = S.market[t][g], cost = 0, n = 0;
    while (n < lim) {
      const pr = unitBuy(t, g, dev);
      if (cost + pr > S.gold) break;
      cost += pr; dev = Math.min(C.devMax, dev + st); n++;
    }
    return n;
  }
  function snapshot(t) {
    const sell = {};
    for (const g in D.GOODS) sell[g] = banned(t, g) ? null : Math.max(1, Math.floor(D.GOODS[g].base * mult(t, g) * (1 + S.market[t][g]) * C.sellRate));
    return { d: day(), sell };
  }
  function recordMemo(t) { S.memo[t] = snapshot(t); }
  function spawnTrend() {
    if (S.trends.length >= C.trendMax) return null;
    const t = pick(playTowns()), g = pick(Object.keys(D.GOODS).filter(goodInPlay));
    if (S.trends.some((x) => x.t === t && x.g === g) || banned(t, g)) return null;
    const down = sellsHere(t, g) ? true : Math.random() < 0.25, range = down ? C.trendDown : C.trendUp;
    const from = day() + rndi(C.trendLead[0], C.trendLead[1]);
    const x = { t, g, m: +rnd(range[0], range[1]).toFixed(2), from, until: from + rndi(C.trendDays[0], C.trendDays[1]) };
    S.trends.push(x);
    return x;
  }

  // ---------- 噂 ----------
  // 値の噂の誤差の幅。となり町は小さく、遠い町ほど大きい
  function rumorErr(from, to) { const d = DIST[from][to]; return d <= C.rumorErrDays[0] ? C.rumorErr[0] : d <= C.rumorErrDays[1] ? C.rumorErr[1] : C.rumorErr[2]; }
  // 町 from で耳に入る、町 to の値。話は人の足で届くので、道のりの日数ぶん古い
  function lagged(from, to) {
    const lag = DIST[from][to] + rndi(0, 2), h = S.hist[to], want = day() - lag;
    let best = h[0];
    for (const x of h) if (x.d <= want && x.d >= best.d) best = x;
    return best;
  }
  function addRumor(r) {
    r.id = ++S.rid; r.day = day();
    S.rumors = S.rumors.filter((x) => !(x.kind === r.kind && x.t === r.t && x.g === r.g && x.kind === 'price'));   // 同じ町・同じ品の値の噂は、新しい話で上書き
    S.rumors.unshift(r);
    if (S.rumors.length > 30) S.rumors.length = 30;
    return r;
  }
  // 値の噂。「◯◯では△△が 35〜47枚 らしい」。当たりなら、本当の（少し古い）値がこの幅に入る
  function priceRumor(src, t, g, rel) {
    const from = S.town, base = lagged(from, t).sell[g];
    if (base == null) return null;
    const e = rumorErr(from, t), ok = Math.random() < (rel == null ? C.rumorRel[src] : rel);
    const v = ok ? base : base * (Math.random() < 0.5 ? rnd(0.55, 0.8) : rnd(1.25, 1.6));   // 外れ：古すぎる話や聞きちがい
    const mid = v * (1 + rnd(-e, e) * 0.6);
    return addRumor({ kind: 'price', src, t, g, lo: Math.max(1, Math.round(mid * (1 - e))), hi: Math.round(mid * (1 + e)), err: e, ok, until: day() + C.rumorKeep });
  }
  // 兆しの噂。これから（または今）起きる、予定外の高騰・値崩れ
  function omenRumor(src, rel) {
    const ok = Math.random() < (rel == null ? C.rumorRel[src] : rel);
    let x = null;
    if (ok) {
      const real = S.trends.filter((k) => inPlay(k.t) && !S.rumors.some((q) => q.kind === 'omen' && q.t === k.t && q.g === k.g));
      x = real.length ? pick(real) : spawnTrend();
      if (!x) return null;
      x = { t: x.t, g: x.g, up: x.m > 1, from: x.from, until: x.until };
    } else {
      const t = pick(playTowns()), g = pick(Object.keys(D.GOODS).filter((k) => goodInPlay(k) && !banned(t, k))), from = day() + rndi(2, 8);
      x = { t, g, up: Math.random() < 0.7, from, until: from + rndi(8, 14) };
    }
    if (!S.named[x.t]) { S.named[x.t] = true; if (!S.seen[x.t]) S.seen[x.t] = 1; }
    return addRumor({ kind: 'omen', src, t: x.t, g: x.g, up: x.up, from: x.from, ok, until: Math.max(x.until, day() + 4) });
  }
  // あいまいな噂。場所か品のどちらかが伏せてある
  function vagueRumor(src, rel) {
    const ok = Math.random() < (rel == null ? C.rumorRel[src] : rel), here = S.town;
    let t, g, up = true;
    const cands = [];
    if (ok) {
      for (const k of S.trends) if (inPlay(k.t) && k.t !== here) cands.push({ t: k.t, g: k.g, up: k.m > 1 });
      for (const u of upcoming(20)) if (u.ev.t && u.ev.t !== here && u.ev.goods) cands.push({ t: u.ev.t, g: pick(Object.keys(u.ev.goods)), up: true });
      for (const tt of playTowns()) if (tt !== here) for (const gg in D.TOWNS[tt].prices) if (D.TOWNS[tt].prices[gg] >= 1.6 && goodInPlay(gg)) cands.push({ t: tt, g: gg, up: true });
    }
    if (cands.length) ({ t, g, up } = pick(cands));
    else { t = pick(playTowns().filter((k) => k !== here)); g = pick(Object.keys(D.GOODS).filter((k) => goodInPlay(k) && !banned(t, k))); up = Math.random() < 0.7; }
    const hide = Math.random() < 0.6 ? 't' : 'g';
    const a = D.TOWNS[here].pos, b = D.TOWNS[t].pos, dx = b[0] - a[0], dy = b[1] - a[1];
    const where = Math.random() < 0.3 ? 'どこか' : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? '東のほう' : '西のほう') : (dy > 0 ? '南のほう' : '北のほう');
    if (hide === 'g' && !S.named[t]) { S.named[t] = true; if (!S.seen[t]) S.seen[t] = 1; }
    return addRumor({ kind: 'vague', src, t, g, up, hide, where, ok, until: day() + C.rumorKeep });
  }
  function rumorText(r) {
    const T = D.TOWNS[r.t].name, Gn = D.GOODS[r.g].name;
    if (r.kind === 'price') return `${T}では${Gn}が <b>${r.lo}〜${r.hi}枚</b> で売れるらしい`;
    if (r.kind === 'omen') {
      const d = r.from - day(), when = d > 0 ? `あと${d}日ほどで` : 'いま';
      return `${T}で${Gn}が${when}<b>${r.up ? '値上がり' : '値崩れ'}</b>${d > 0 ? 'するらしい' : 'しているらしい'}`;
    }
    if (r.hide === 't') return `${r.where}で${Gn}が<b>${r.up ? '足りない' : 'だぶついている'}</b>らしい`;
    if (r.hide === 'g') return `${T}で何かが<b>${r.up ? '高く売れる' : '値崩れしている'}</b>らしい`;
    return `${T}で${Gn}が<b>${r.up ? '足りない' : 'だぶついている'}</b>らしい`;
  }
  function rumorLine(r) {
    const age = day() - r.day, ic = r.kind === 'price' ? '💬' : r.kind === 'omen' ? '🔮' : '❓';
    return `<div class="rumor">${ic} ${rumorText(r)}<span class="sub">　${SRC[r.src]}${STARS[r.src]}・${age <= 0 ? '今日' : age + '日前'}</span></div>`;
  }
  // 町に着いたとき、ただで耳に入る噂
  function hearStreet(t) {
    const n = rndi(C.streetCount[0], C.streetCount[1]), got = [];
    for (let i = 0; i < n; i++) {
      const roll = Math.random();
      let r = null;
      if (roll < 0.5) r = vagueRumor('street');
      else if (roll < 0.8) r = randomPrice('street');
      else r = omenRumor('street');
      if (r) got.push(r);
    }
    return got;
  }
  // 自分に関係のありそうな品（ここで買える品・積んでいる品）を中心に、どこかの町の値を聞く
  function randomPrice(src, rel) {
    const here = S.town, towns = playTowns().filter((t) => t !== here && S.named[t]);
    const pool = towns.length ? towns : playTowns().filter((t) => t !== here);
    const t = pick(pool);
    const mine = Object.keys(D.TOWNS[here].stock).concat(Object.keys(S.cargo)).filter((g) => !banned(t, g) && !sellsHere(t, g));
    const g = mine.length && Math.random() < 0.75 ? pick(mine) : pick(Object.keys(D.GOODS).filter((k) => goodInPlay(k) && !banned(t, k)));
    if (!S.named[t]) { S.named[t] = true; if (!S.seen[t]) S.seen[t] = 1; }
    return priceRumor(src, t, g, rel);
  }
  // その町についての噂（場所を伏せたものは除く）
  const rumorsAbout = (t) => S.rumors.filter((r) => r.t === t && r.hide !== 't');
  const priceRumorOf = (t, g) => S.rumors.find((r) => r.kind === 'price' && r.t === t && r.g === g) || null;

  // ---------- お金・親の借金 ----------
  function dailyCost() {
    const c = { living: C.living, feed: cartT().feed, guards: S.guards * C.guardWage, shop: 0 };
    if (S.shop) { const L = C.shop[S.shop.lv]; c.shop = L.rent + L.wage; }
    c.total = c.living + c.feed + c.guards + c.shop;
    return c;
  }
  // 払えないぶんはツケになり、次の返済日にまとめて取り立てられる
  function pay(amount) {
    if (S.gold >= amount) { S.gold -= amount; return 0; }
    const short = amount - S.gold;
    S.gold = 0; S.debt += short;
    return short;
  }
  function shopValue() { let v = 0; if (S.shop) for (let l = 1; l <= S.shop.lv; l++) v += C.shop[l].cost; return v; }
  const dueNow = () => (S.loan.done ? 0 : C.loan.dues[S.loan.n]);
  const dueDay = () => (S.loan.cycle + 1) * C.loan.every;
  const daysLeft = () => dueDay() - day();
  const owed = () => Math.max(0, dueNow() - S.loan.pre) + Math.ceil(S.debt);
  function loanLeft() { let v = 0; if (!S.loan.done) for (let i = S.loan.n; i < C.loan.dues.length; i++) v += C.loan.dues[i]; return Math.max(0, v - S.loan.pre); }
  // 返済日。足りなければ、店 → 荷車 → 荷の順に差し押さえ。それでも足りなければ破産
  function collect() {
    const need = owed();
    let short = need - S.gold, seized = false;
    S.gold = Math.max(0, S.gold - need);
    const take = (v, msg) => { short -= v; seized = true; dayNotes.push(`<span class="bad">⚖️ ${msg}（${fmt(v)}枚ぶん）</span>`); };
    if (short > 0 && S.shop) { take(Math.floor(shopValue() * 0.6) + S.shop.till, `${D.TOWNS[S.shop.town].name}の${C.shop[S.shop.lv].name}を差し押さえられた`); S.shop = null; }
    if (short > 0 && S.cart.type !== 'basket') {
      take(Math.floor(cartT().price * 0.5), `${cartT().name}を差し押さえられた`);
      S.cart = { type: 'basket', hp: 100 }; S.guards = 0;
      let guard = 0;
      while (cargoWeight() > cartT().cap && guard++ < 30) loseCargo(0.25);
      if (guard) dayNotes.push('背負いきれない荷は、置いていくしかなかった。');
    }
    if (short > 0 && cargoCount() > 0) { take(Math.floor(cargoWorth() * 0.5), '荷をすべて取り上げられた'); S.cargo = {}; }
    if (short > 0) { addRecord('破産'); S.dead = true; wipeSave(); return; }
    if (short < 0 && seized) S.gold += -short;     // 取りすぎたぶんは返ってくる
    S.debt = 0; S.loan.pre = 0; S.loan.cycle++;
    if (!S.loan.done) {
      S.loan.n++;
      dayNotes.push(`💰 返済日。バルドの使いに ${fmt(need)}枚 を納めた${seized ? '（差し押さえで穴を埋めた）' : ''}。`);
      if (S.loan.n >= C.loan.dues.length) { S.loan.done = true; addRecord('完済'); tell('free'); }
      else {
        const next = C.loan.dues[S.loan.n];
        if (!tell('pay1', { next })) { if (next >= C.loan.dues[3]) tell('payBig', { next }); }
        dayNotes.push(`次は ${C.loan.every}日後（${seasonOf(day()).name}の終わり）に ${fmt(next)}枚。`);
      }
    } else if (need > 0) dayNotes.push(`💰 ツケ ${fmt(need)}枚 を清算した。`);
    if (seized) tell('seized');
  }

  // ---------- 時間 ----------
  function advance(q) {
    for (let i = 0; i < q && !S.dead; i++) {
      S.time++;
      if (S.time % 4 === 0) newDay();
    }
  }
  // 商いにかかる時間。その町で売り買いを始めると tradeTime 刻進む。同じ刻のうちは、何度売り買いしても進まない
  function tradeTick() {
    if (S.tradedAt === S.time) return;
    advance(C.tradeTime);
    S.tradedAt = S.time;
  }
  function newDay() {
    const d = day(), sea = seasonOf(d);
    const short = pay(dailyCost().total);
    if (short > 0 && !S.tabNoted) { S.tabNoted = true; dayNotes.push(`<span class="bad">宿代や給金を払えず、${fmt(short)}枚がツケになった。次の返済日に取り立てられる。</span>`); }
    if (short === 0) S.tabNoted = false;
    if (short > 0 && S.guards > 0) { dayNotes.push(`<span class="bad">給金が払えず、護衛${S.guards}人は去っていった。</span>`); S.guards = 0; }
    if (S.debt > 0) S.debt = +(S.debt * (1 + C.tabInterest)).toFixed(2);

    // 季節の変わり目・行事の始まり
    if (seasonDay(d) === 0) {
      dayNotes.push(`${sea.icon} <b>${sea.name}になった。</b>${sea.desc}`);
      const cl = CAL.closed.filter((c) => c.season === sea.id).map((c) => c.roads.filter((r) => S.roads[r]).map((r) => `${townName(D.ROADS[r].a)}〜${townName(D.ROADS[r].b)}`)).reduce((a, b) => a.concat(b), []);
      if (cl.length) dayNotes.push(`<span class="bad">❄️ 雪で道が閉じた：${cl.join('、')}</span>`);
    }
    for (const ev of CAL.events) if (eventOn(ev, d) && !eventOn(ev, d - 1) && (!ev.t || inPlay(ev.t))) dayNotes.push(`📅 <b>${ev.name}</b>が始まった。${ev.desc}。`);

    // 傷む品（夏は足が早い）
    const spoil = (S.rain ? 1.3 : 1) * ((CAL.spoil && CAL.spoil[sea.id]) || 1);
    const age = (store, where) => {
      for (const g in store) {
        const sh = D.GOODS[g].shelf;
        if (!sh) continue;
        store[g].age += spoil;
        if (store[g].age > sh) {
          dayNotes.push(`<span class="bad">🪰 ${where}${D.GOODS[g].name} ${qtyStr(g, store[g].qty)}が腐り、捨てるしかなかった。</span>`);
          if (travel && store === S.cargo) travel.lost += store[g].cost;
          delete store[g];
        }
      }
    };
    age(S.cargo, '');
    if (S.shop) age(S.shop.stock, '店の');

    // 相場：売買で動いた値が戻る（売りこまれた値はゆっくり）、値が日々ゆれる、在庫が戻る
    for (const t in S.market) {
      for (const g in S.market[t]) {
        const v = S.market[t][g];
        S.market[t][g] = clamp(v * (v < 0 ? C.devDecayDown : C.devDecayUp), C.devMin, C.devMax);
        S.drift[t][g] = clamp(S.drift[t][g] * (1 - C.driftPull) + rnd(-C.driftStep, C.driftStep), -C.driftMax, C.driftMax);
      }
      for (const g in D.TOWNS[t].stock) { const mx = stockMax(t, g); S.stock[t][g] = Math.min(mx, S.stock[t][g] + mx / C.stockDays); }
    }
    S.trends = S.trends.filter((x) => x.until > d);
    S.rumors = S.rumors.filter((x) => x.until > d);
    if (Math.random() < C.trendChance) spawnTrend();
    for (const t in S.hist) { S.hist[t].push(snapshot(t)); if (S.hist[t].length > C.histDays) S.hist[t].shift(); }

    // 天気・山賊の動き・隊商
    S.rain = Math.random() < (S.rain ? C.rainStay : C.rainStart);
    for (const r in S.hot) if (S.hot[r] <= d) { delete S.hot[r]; delete S.hotKnown[r]; }
    if (Math.random() < C.hotChance) { const r = pick(Object.keys(D.ROADS).filter((k) => D.ROADS[k].danger >= 1 && roadUsable(k))); S.hot[r] = d + rndi(8, 20); }
    for (const t in S.caravans) S.caravans[t] = S.caravans[t].filter((c) => c.leave >= d);

    // 店の売り上げ
    if (S.shop) {
      const L = C.shop[S.shop.lv], t = S.shop.town;
      if (d % L.every === 0) {
        let sold = 0;
        for (const g in S.shop.stock) {
          if (banned(t, g)) continue;
          const it = S.shop.stock[g], n = Math.min(it.qty, L.rate);
          const price = Math.max(1, Math.floor(D.GOODS[g].base * mult(t, g) * (1 + S.market[t][g]) * C.shopPrice * fresh(g, it.age)));
          S.shop.till += n * price; S.stats.profit += n * price - (it.cost / it.qty) * n;
          S.market[t][g] = Math.max(C.devMin, S.market[t][g] - n * step(t, g) * 0.5);
          it.cost -= (it.cost / it.qty) * n; it.qty -= n; sold += n;
          if (it.qty <= 0) delete S.shop.stock[g];
        }
        if (sold) S.rep[t] = Math.min(100, S.rep[t] + 0.3);
      }
    }

    // 期限の切れた頼みごと
    S.orders = S.orders.filter((o) => {
      if (d <= o.due) return true;
      S.rep[o.t] = Math.max(0, S.rep[o.t] - C.orderFailRep);
      dayNotes.push(`<span class="bad">📜 ${D.TOWNS[o.t].name}の${D.TOWNS[o.t].who.name}との約束（${D.GOODS[o.g].name}${qtyStr(o.g, o.n)}）を守れなかった。評判が落ちた。</span>`);
      tell('orderFail');
      return false;
    });
    // 得意先への納め忘れ
    S.patrons = S.patrons.filter((p) => {
      if (d <= p.due) return true;
      p.miss++; p.streak = 0; p.due = d + C.patronEvery;
      S.rep[p.t] = Math.max(0, S.rep[p.t] - C.patronMissRep);
      const who = D.TOWNS[p.t].who.name;
      if (p.miss >= 2) { dayNotes.push(`<span class="bad">🤝 ${who}は、もう待ってくれなかった。得意先をひとつ失った。</span>`); return false; }
      dayNotes.push(`<span class="bad">🤝 ${who}への納めを忘れた。評判が落ちた。次も忘れれば、縁が切れる。</span>`);
      return true;
    });

    // 国境の通行手形
    if (S.abroad && !S.pass.border && S.rep.oto >= C.abroad.passRep) {
      S.pass.border = true;
      dayNotes.push(`<span class="good">🪪 国境の通行手形をもらった。関税が半分になる。</span>`);
      tell('pass');
    }
    if (d >= dueDay()) collect();
  }
  // 商会が大きくなったら、隣国への道が開く
  function checkAbroad() {
    if (S.abroad || !S.shop || S.shop.lv < C.abroad.shopLv || S.rep.oto < C.abroad.rep) return;
    S.abroad = true;
    for (const rid in D.ROADS) if (D.ROADS[rid].abroad && (S.seen[D.ROADS[rid].a] || S.seen[D.ROADS[rid].b])) S.roads[rid] = true;
    S.roads.r14 = true; S.roads.r14b = true;
    S.seen.karune = S.seen.karune || 1; S.named.karune = true;
    for (const t in D.TOWNS) for (const g in D.TOWNS[t].stock) if (typeof S.stock[t][g] !== 'number') S.stock[t][g] = stockMax(t, g);
    tell('abroad');
  }
  // 操作のあとの後始末：破産の確認、お知らせ、保存、描き直し
  function settle() {
    if (S.dead) return gameOver();
    if (dayNotes.length) { notices.unshift({ title: '📒 日々のできごと', body: dayNotes.map((x) => `<p>${x}</p>`).join('') }); dayNotes = []; }
    checkStage(); checkAbroad();
    save(); render(); showNotices();
  }
  function gameOver() {
    travel = null; notices = [];
    const st = S.stats, d = day() + 1, sc = D.STORY.bankrupt;
    const last = dayNotes.map((x) => `<p>${x}</p>`).join(''); dayNotes = [];
    modal({
      title: '💀 ' + sc.title,
      body: last + sc.text.map((p) => `<p class="story">${p}</p>`).join('') +
        `<p class="sub">${d}日目 ／ 返済 ${S.loan.n}回 ／ 行商 ${st.trips}回 ／ 山賊を退けた ${st.wins}回</p><p class="bad">記録は消えた。最初からやり直しになる。（商人録には残る）</p>`,
      buttons: [{ label: sc.label, cls: 'pri', fn: () => { newGame(); save(); ui = { tab: 'market', dest: null }; render(); intro(); } }]
    });
  }

  // ---------- 段階・目標・呼び名 ----------
  function stage() { return S.shop ? 3 : S.cart.type !== 'basket' ? 2 : 1; }
  function goalText() {
    if (S.cart.type === 'basket') return `手押し車を買う（${D.CARTS.handcart.price}枚。カワベの車屋で）。籠のままでは返済が続かない`;
    if (S.cart.type === 'handcart') return `ロバの荷車を買う（${D.CARTS.donkey.price}枚）。返済額はまだ上がる`;
    if (S.cart.type === 'donkey' && !S.shop) return `馬車を買う（${D.CARTS.horse.price}枚）か、町で評判を${C.shop[1].rep}まで上げて露店を出す（${C.shop[1].cost}枚）`;
    if (!S.shop) return `町で評判を${C.shop[1].rep}まで上げ、露店を出す（${C.shop[1].cost}枚）`;
    if (S.shop.lv === 1) return `露店を小さな店にする（評判${C.shop[2].rep}・${C.shop[2].cost}枚）`;
    if (!S.abroad) return `王都の評判を${C.abroad.rep}まで上げる（今 ${Math.floor(S.rep.oto)}）。組合に認められれば、隣国への道が開く`;
    if (!S.loan.done) return '親の借金を返しきる。隣国との商いは、もうけも危険も大きい';
    return '借金は返し終えた。故郷の村を育て、隣国との商いを広げよう';
  }
  function checkStage() {
    const s = stage();
    if (s > S.stageMax) S.stageMax = s;
    if (S.cart.type !== 'basket') tell(S.cart.type);
    if (S.shop) tell(S.shop.lv >= 2 ? 'shop' : 'stall');
  }
  // 町の人からの呼ばれ方。評判と身なりで変わる
  function callName(t) {
    const r = S.rep[t];
    if (r >= 40) return S.shop ? '旦那' : '旦那さん';
    if (r >= 20) return 'おなじみさん';
    if (r >= 8) return '行商さん';
    return S.cart.type === 'basket' ? '籠の兄ちゃん' : '車の兄ちゃん';
  }

  // ---------- 地図の知識 ----------
  const roadUsable = (rid) => !D.ROADS[rid].abroad || S.abroad;
  function discover(t) {
    const first = S.seen[t] !== 2;
    S.seen[t] = 2; S.named[t] = true;
    for (const rid in D.ROADS) {
      const r = D.ROADS[rid];
      if ((r.a !== t && r.b !== t) || !roadUsable(rid)) continue;
      S.roads[rid] = true;
      const o = other(r, t);
      if (!S.seen[o]) S.seen[o] = 1;
    }
    return first;
  }
  function roadsFrom(t) { return Object.keys(D.ROADS).filter((rid) => S.roads[rid] && roadUsable(rid) && (D.ROADS[rid].a === t || D.ROADS[rid].b === t)); }
  const neighbors = (t) => [...new Set(roadsFrom(t).map((rid) => other(D.ROADS[rid], t)))];
  // 山賊に遭う確率。積み荷の値打ちが大きいほど上がる
  function banditChance(danger, caravan) {
    const vm = Math.min(C.banditValueMax, 0.5 + cargoWorth() / C.banditValueRef);
    let p = C.banditBase[danger] * vm * Math.max(0.3, 1 - C.banditGuardCut * S.guards);
    if (caravan) p *= C.caravanSafety;
    return Math.min(0.9, p);
  }
  // 国境の関税
  function tariff(rid) {
    if (!D.ROADS[rid].border || cargoCount() === 0) return 0;
    return Math.max(1, Math.ceil(cargoWorth() * (S.pass.border ? C.abroad.tariffPass : C.abroad.tariff)));
  }
  function routeInfo(rid, caravan) {
    const r = D.ROADS[rid], cart = cartT();
    let m = caravan ? 0.9 : cart.speed[r.type];
    if (S.rain) m *= C.rainSlow[r.type];
    const hot = !!S.hot[rid] && S.hot[rid] > day();
    const danger = Math.min(3, r.danger + (hot ? 1 : 0)), shown = Math.min(3, r.danger + (hot && S.hotKnown[rid] ? 1 : 0));
    return {
      r, to: other(r, S.town), days: Math.max(1, Math.round(r.len * m)), toll: tariff(rid), border: !!r.border, closed: roadClosed(rid),
      danger, shown, risk: banditChance(shown, caravan),
      breakP: cart.breakP[r.type] * (S.rain ? 1.6 : 1) * (S.cart.hp < 40 ? 2 : 1)
    };
  }
  function power(caravan) { return C.selfPower + S.guards * C.guardPower + (caravan ? C.caravanPower : 0); }

  // ---------- 頼みごと・得意先 ----------
  function offersOf(t) {
    const d = day(), cur = S.offers[t];
    if (cur && d - cur.day < C.orderRefresh) return cur.list;
    const list = [];
    const cand = Object.keys(D.GOODS).filter((g) => goodInPlay(g) && !sellsHere(t, g) && !D.CONTRABAND.includes(g) && !S.orders.some((o) => o.t === t && o.g === g));
    for (let i = 0; i < 2 && cand.length; i++) {
      const g = cand.splice(Math.floor(Math.random() * cand.length), 1)[0], G0 = D.GOODS[g];
      const src = playTowns().filter((p) => sellsHere(p, g));
      if (!src.length) continue;
      const dist = Math.min.apply(null, src.map((p) => DIST[t][p]));
      const maxStock = Math.max.apply(null, src.map((p) => D.TOWNS[p].stock[g]));
      const W = pick([25, 25, 100, 100, 300]);                 // 小口（籠でも運べる 25kg）〜大口（ロバの荷車がいる 300kg）
      const n = clamp(Math.round(W / G0.w), 1, Math.max(1, Math.floor(maxStock * 1.2)));
      list.push({
        id: d + '-' + t + '-' + g, g, n, days: Math.ceil(dist * 2 * 1.4) + 5,
        reward: Math.round(n * G0.base * 0.8 + n * G0.w * C.orderFee * (1 + dist)), rep: C.orderRep + (n * G0.w >= 100 ? 3 : 0)
      });
    }
    S.offers[t] = { day: d, list };
    return list;
  }
  const patronPay = (p) => Math.round(p.n * D.GOODS[p.g].base * C.patronPay);
  // その町の顔役が、得意先の話を持ちかけてくるか
  const patronReady = (t) => (S.done[t] || 0) >= C.patronAfter && !patronOf(t) && S.patrons.length < C.patronMax && goodInPlay(D.TOWNS[t].who.want.g);

  // ---------- モーダル ----------
  function modal(o) {
    const m = $('#modal'), btns = o.buttons || [];
    m.innerHTML = `<div class="mbox"><h2>${o.title || ''}</h2><div>${o.body || ''}</div>` +
      `<div class="mbtns ${o.two ? 'two' : ''}">` +
      btns.map((b, i) => `<button class="b ${b.cls || ''}" data-mi="${i}">${b.label}</button>`).join('') + `</div></div>`;
    m.classList.remove('hidden');
    m.querySelectorAll('[data-mi]').forEach((el) => {
      el.onclick = () => { const b = btns[+el.dataset.mi]; closeModal(); if (b.fn) b.fn(); };
    });
  }
  function closeModal() { const m = $('#modal'); m.classList.add('hidden'); m.innerHTML = ''; }
  function confirmBox(title, body, okLabel, fn) {
    modal({ title, body, two: true, buttons: [{ label: 'やめる' }, { label: okLabel, cls: 'pri', fn }] });
  }
  function openQty(o) {
    let q = o.init != null ? Math.min(o.init, o.max) : o.max;
    modal({
      title: o.title, two: true,
      body: `<div id="qInfo"></div><input type="range" id="qR" min="0" max="${o.max}" value="${q}">` +
        `<div class="qbtns"><button class="b" data-q="-10">−10</button><button class="b" data-q="-1">−1</button>` +
        `<button class="b" data-q="1">+1</button><button class="b" data-q="10">+10</button><button class="b" data-q="max">最大</button></div>`,
      buttons: [{ label: 'やめる' }, { label: o.okLabel, cls: 'pri', fn: () => { if (q > 0) o.ok(q); } }]
    });
    const upd = () => { $('#qInfo').innerHTML = `<b>${q}</b> ${o.unit || '個'}<br>${o.calc(q)}`; $('#qR').value = q; };
    $('#qR').oninput = (e) => { q = +e.target.value; upd(); };
    document.querySelectorAll('.qbtns button').forEach((b) => {
      b.onclick = () => { const v = b.dataset.q; q = v === 'max' ? o.max : clamp(q + (+v), 0, o.max); upd(); };
    });
    upd();
  }
  function showNotices() {
    const n = notices.shift();
    if (!n) return;
    if (n.reveal) return openReveal(n.reveal, showNotices);
    modal({ title: n.title, body: n.body, buttons: [{ label: n.label || 'OK', cls: 'pri', fn: showNotices }] });
  }

  // ---------- 答え合わせ（着いた町の値を、札をめくって見る）と旅の決算 ----------
  function buildReveal(t, tr) {
    const items = [];
    let sale = 0, cost = 0;
    for (const g of Object.keys(S.cargo)) {
      const c = S.cargo[g];
      cost += c.cost;
      if (banned(t, g)) { items.push({ g, qty: c.qty, avg: c.cost / c.qty, ban: true }); continue; }
      const f = fresh(g, c.age), actual = sellNow(t, g, f), r = priceRumorOf(t, g), tot = quote(t, g, c.qty, -1, f).tot;
      const tre = trendOf(t, g), ev = CAL.events.find((e) => eventOn(e, day()) && (!e.t || e.t === t) && ((e.goods && e.goods[g]) || e.all));
      sale += tot;
      items.push({ g, qty: c.qty, avg: c.cost / c.qty, actual, rumor: r ? { lo: r.lo, hi: r.hi } : null, tot, note: ev ? ev.name : tre ? (tre.m > 1 ? '品不足で高騰中' : 'だぶついて値崩れ中') : (f < 0.7 ? '傷みで値が落ちた' : '') });
    }
    const spent = tr.gold0 - S.gold, profit = sale - cost - Math.max(0, spent) - tr.lost;
    const stake = tr.cost0 / Math.max(1, tr.gold0 + tr.cost0);
    return { t, items, sale, cost, spent, lost: tr.lost, profit, days: tr.days, full: items.length >= 2 && (stake >= C.bigBet || items.length >= 3) };
  }
  function revealCard(it, open) {
    const G0 = D.GOODS[it.g], head = `<div class="name">${G0.icon} ${G0.name} ${qtyStr(it.g, it.qty)}</div>`;
    if (!open) return `<div class="card flip closed">${head}<div class="sub">？？？　札をめくると、今日の値がわかる</div></div>`;
    if (it.ban) return `<div class="card flip"><div class="row"><div class="grow">${head}<div class="bad">この町では売れない（禁制品）</div></div></div></div>`;
    const diff = it.actual - it.avg, cls = diff >= 0 ? 'good' : 'bad';
    let ru = '';
    if (it.rumor) {
      const v = it.actual < it.rumor.lo ? '<span class="bad">噂より安い…</span>' : it.actual > it.rumor.hi ? '<span class="good">噂より高い！</span>' : '噂どおり';
      ru = `<div class="sub">噂では ${it.rumor.lo}〜${it.rumor.hi}枚 → ${v}</div>`;
    } else ru = `<div class="sub">噂は聞いていなかった</div>`;
    return `<div class="card flip ${cls}"><div class="row"><div class="grow">${head}` +
      `<div>仕入れ ${fmt(it.avg)}枚 → 今日の売値 <b class="${cls}">${fmt(it.actual)}枚</b>${it.note ? `　<span class="sub">${it.note}</span>` : ''}</div>${ru}</div>` +
      `<div class="big ${cls}">${diff >= 0 ? '+' : ''}${fmt(diff)}</div></div></div>`;
  }
  function openReveal(R, done) {
    const n = R.items.length;
    let k = R.full ? 0 : n;
    const show = () => {
      let body = R.items.map((it, i) => revealCard(it, i < k)).join('');
      if (k >= n) {
        const best = R.profit > S.stats.bestTrip && R.profit > 0;
        if (best) S.stats.bestTrip = R.profit;
        body += `<div class="card tally"><div class="name">旅の決算（ここで全部売った場合の見込み）</div><div class="stat">` +
          `<div><span>仕入れ値</span> ${fmt(R.cost)}枚</div><div><span>売れば</span> ${fmt(R.sale)}枚</div>` +
          `<div><span>道中の出費（${R.days}日）</span> ${fmt(Math.max(0, R.spent))}枚</div><div><span>失った荷</span> ${fmt(R.lost)}枚ぶん</div></div>` +
          `<div class="total ${R.profit >= 0 ? 'good' : 'bad'}">${R.profit >= 0 ? 'もうけ +' : '損 '}${fmt(R.profit)}枚${best ? '　🏆 これまでで最高の旅' : ''}</div>` +
          `<div class="sub">まとめて売ると値は下がっていく。売るかどうかは市場で決める。</div></div>`;
      }
      modal({
        title: `⚖️ ${D.TOWNS[R.t].name}の今日の値`, body,
        buttons: [k < n ? { label: `札をめくる（${k + 1}/${n}）`, cls: 'pri', fn: () => { k++; show(); } } : { label: '市場へ', cls: 'pri', fn: () => { save(); done(); } }]
      });
    };
    show();
  }

  // ---------- 画面 ----------
  const TABS = [
    { id: 'market', ic: '⚖️', name: '市場' },
    { id: 'map', ic: '🗺️', name: '旅じたく' },
    { id: 'town', ic: '🏘️', name: '町' },
    { id: 'book', ic: '📒', name: '帳簿' }
  ];
  function render() {
    renderHud();
    if (travel) return;
    $('#tabs').classList.remove('hidden');
    $('#tabs').innerHTML = TABS.map((t) =>
      `<button data-a="tab" data-id="${t.id}" class="${ui.tab === t.id ? 'on' : ''}"><span class="ic">${t.ic}</span>${t.name}</button>`).join('');
    const m = $('#main');
    if (ui.tab === 'market') m.innerHTML = viewMarket();
    else if (ui.tab === 'map') { m.innerHTML = viewMap(); drawMap($('#map'), true); }
    else if (ui.tab === 'town') { m.innerHTML = viewTown(); drawHome($('#home')); }
    else { m.innerHTML = viewBook(); drawScene($('#scene')); }
  }
  function dueText() {
    const o = owed(), left = daysLeft();
    if (S.loan.done && o === 0) return '<span class="good">借金なし</span>';
    return `<span class="${S.gold < o && left <= 10 ? 'bad' : ''}">返済 あと${left}日・${fmt(o)}枚</span>`;
  }
  function renderHud() {
    const where = travel ? `${townName(travel.from)} → ${townName(travel.to)}` : D.TOWNS[S.town].name;
    $('#hud').innerHTML =
      `<div class="hud1"><span>${where}</span><span class="gold">💰 ${fmt(S.gold)}枚</span></div>` +
      `<div class="hud2"><span>${dateStr()}${QN[S.time % 4]}</span><span>${S.rain ? '🌧' : '☀️'}</span>` +
      `<span>${cartT().icon} ${cargoWeight()}/${cartT().cap}kg</span>` + (S.guards ? `<span>🛡${S.guards}</span>` : '') + `<span>${dueText()}</span></div>`;
  }
  function dueCard() {
    const o = owed(), left = daysLeft();
    if (S.loan.done && o === 0) return '';
    const hard = S.gold < o;
    return `<div class="card ${hard && left <= 10 ? 'danger' : 'goal'}"><div class="sub">${S.loan.done ? 'ツケの清算' : `親の借金　${S.loan.n + 1}回目の返済（季節の終わり）`}</div>` +
      `<div class="name">あと${left}日で ${fmt(o)}枚${hard ? `　<span class="bad">（${fmt(o - S.gold)}枚 足りない）</span>` : '　<span class="good">（手持ちで足りる）</span>'}</div>` +
      `<div class="sub">足りなければ、店・荷車・荷の順に差し押さえ。何も残らなければ破産。</div></div>`;
  }
  // 暦：季節と、これからの行事
  function calendarCard() {
    const sea = seasonOf(day()), ups = upcoming(30), cl = CAL.closed.filter((c) => c.season === sea.id);
    let h = `<div class="card"><div class="name">${sea.icon} ${sea.name} ${seasonDay(day()) + 1}日目<span class="sub">　あと${30 - seasonDay(day())}日で${seasonOf(day() + 30).name}</span></div>` +
      `<div class="sub">${sea.desc}</div>`;
    if (cl.length && cl[0].roads.some((r) => S.roads[r])) h += `<div class="sub bad">雪で閉じている道がある（旅じたくの地図に ✕）</div>`;
    h += ups.map((u) => `<div class="cal">📅 <b>${u.ev.name}</b> ${u.inDays === 0 ? `<span class="good">開催中（あと${u.left}日）</span>` : `あと${u.inDays}日`}<span class="sub">　${u.ev.desc}</span></div>`).join('');
    return h + `</div>`;
  }
  function rumorBook(list, title, open) {
    if (!list.length) return '';
    return `<details class="card" ${open ? 'open' : ''}><summary>${title}（${list.length}件）</summary>` +
      `<div class="sub">★が多いほど当たりやすい。値の噂は幅つきで、遠い町ほど幅が広い。古い話は、もう変わっているかもしれない。</div>` +
      list.map(rumorLine).join('') + `</details>`;
  }

  function tags(g) {
    let h = `<span class="tag">1${D.GOODS[g].unit} ${D.GOODS[g].w}kg</span>`;
    if (D.GOODS[g].lux) h += `<span class="tag gold">高級品</span>`;
    if (D.GOODS[g].shelf) h += `<span class="tag">傷む</span>`;
    if (D.CONTRABAND.includes(g)) h += `<span class="tag bad">禁制品</span>`;
    return h;
  }
  function goodCard(g) {
    const G0 = D.GOODS[g], t = S.town, can = sellsHere(t, g), own = S.cargo[g], ban = banned(t, g), tr = trendOf(t, g);
    const f = own ? fresh(g, own.age) : 1, sp = sellNow(t, g, f);
    let l2 = can ? `買値 <b>${fmt(buyNow(t, g))}枚</b>　在庫 ${qtyStr(g, Math.floor(S.stock[t][g]))}　` : '';
    l2 += ban ? `<span class="bad">この町では売れない</span>` : `売値 ${can ? '' : '<b>'}${fmt(sp)}枚${can ? '' : '</b>'}`;
    if (tr) l2 += ` <span class="${tr.m > 1 ? 'good' : 'bad'}">${tr.m > 1 ? '📈高騰中' : '📉値崩れ中'}</span>`;
    let l3 = '';
    if (own) {
      const avg = own.cost / own.qty;
      l3 = `<div class="sub">所持 <b>${qtyStr(g, own.qty)}</b>・${own.qty * G0.w}kg（仕入れ ${fmt(avg)}枚）` +
        (G0.shelf ? ` 鮮度 <span class="${f < 0.6 ? 'bad' : ''}">${Math.round(f * 100)}%</span>` : '') +
        (ban ? '' : `<span class="${sp >= avg ? 'good' : 'bad'}"> ${sp >= avg ? '▲利益' : '▼損'}</span>`) + `</div>`;
    }
    return `<div class="card row"><div class="grow"><div class="name">${G0.icon} ${G0.name}${tags(g)}</div><div>${l2}</div>${l3}</div><div class="btns">` +
      (own && !ban ? `<button class="b" data-a="sell" data-g="${g}">売る</button>` : '') +
      (can ? `<button class="b pri" data-a="buy" data-g="${g}">買う</button>` : '') + `</div></div>`;
  }
  function orderCards() {
    let h = S.orders.map((o, i) => {
      const here = o.t === S.town, have = S.cargo[o.g] ? S.cargo[o.g].qty : 0, left = o.due - day();
      return `<div class="card row"><div class="grow"><div class="name">📜 ${D.TOWNS[o.t].name}の${D.TOWNS[o.t].who.name}へ ${D.GOODS[o.g].name} ${qtyStr(o.g, o.n)}（${o.n * D.GOODS[o.g].w}kg）</div>` +
        `<div class="sub"><span class="${left <= 3 ? 'bad' : ''}">あと${left}日</span> ／ 報酬 ${o.reward}枚 ／ 持っている ${qtyStr(o.g, have)}</div></div>` +
        (here ? `<button class="b pri" data-a="deliver" data-i="${i}" ${have >= o.n ? '' : 'disabled'}>納める</button>` : '') + `</div>`;
    }).join('');
    h += S.patrons.map((p, i) => {
      const here = p.t === S.town, have = S.cargo[p.g] ? S.cargo[p.g].qty : 0, left = p.due - day();
      return `<div class="card row"><div class="grow"><div class="name">🤝 得意先 ${D.TOWNS[p.t].who.name}（${D.TOWNS[p.t].name}）へ ${D.GOODS[p.g].name} ${qtyStr(p.g, p.n)}</div>` +
        `<div class="sub"><span class="${left <= 4 ? 'bad' : ''}">あと${left}日</span> ／ 代金 ${patronPay(p)}枚 ／ 続けて${p.streak}回 ／ 持っている ${qtyStr(p.g, have)}</div></div>` +
        (here ? `<button class="b pri" data-a="supply" data-i="${i}" ${have >= p.n ? '' : 'disabled'}>納める</button>` : '') + `</div>`;
    }).join('');
    return h;
  }
  function viewMarket() {
    const T = D.TOWNS[S.town], here = Object.keys(T.stock);
    let h = `<h2>${T.name}の市場</h2><p class="sub">${KIND[T.kind]}　評判 ${Math.floor(S.rep[S.town])}　ここでの呼び名「${callName(S.town)}」${trusted(S.town) ? '　<span class="good">得意先の町（売り買いが少し有利）</span>' : ''}</p>`;
    h += dueCard();
    h += `<div class="card"><div class="sub">次の目標</div><div class="name">${goalText()}</div></div>`;
    h += orderCards();
    h += calendarCard();
    h += rumorBook(S.rumors, '👂 噂帳', false);
    h += `<h3>この町の特産（あと ${freeWeight()}kg 積める）</h3>` + here.map(goodCard).join('');
    const owned = Object.keys(S.cargo).filter((g) => !here.includes(g));
    if (owned.length) h += `<h3>持ってきた荷</h3>` + owned.map(goodCard).join('');
    const all = Object.keys(D.GOODS).filter(goodInPlay).sort((a, b) => mult(S.town, b) - mult(S.town, a));
    h += `<details class="card"><summary>この町の今日の相場をすべて見る</summary><table class="t"><tr><th>品（1つの重さ）</th><th>売値</th><th>ふだんとの差</th></tr>` +
      all.map((g) => {
        if (banned(S.town, g)) return `<tr><td>${D.GOODS[g].icon} ${D.GOODS[g].name}</td><td class="bad">禁制</td><td></td></tr>`;
        const pct = Math.round((mult(S.town, g) * (1 + S.market[S.town][g]) / (D.TOWNS[S.town].prices[g] || 1) - 1) * 100);
        return `<tr><td>${D.GOODS[g].icon} ${D.GOODS[g].name}（1${U(g)} ${D.GOODS[g].w}kg）</td><td>${fmt(sellNow(S.town, g))}枚</td>` +
          `<td class="${pct >= 15 ? 'good' : pct <= -15 ? 'bad' : ''}">${pct >= 0 ? '+' : ''}${pct}%</td></tr>`;
      }).join('') + `</table></details>`;
    return h;
  }

  // 地図。知っている町と道だけを描く
  function mapXY(p, w, h) { return [6 + p[0] / 100 * (w - 12), 10 + (p[1] - 24) / 104 * (h - 26)]; }
  function drawMap(cv, bind) {
    if (!cv) return;
    const w = cv.clientWidth || 340, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const h = clamp(Math.round(w * 1.05), 260, Math.round((window.innerHeight || 700) * 0.5));
    cv.style.height = h + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#e6d5ac'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(120,95,55,.25)'; ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0, h * i / 6); ctx.lineTo(w, h * i / 6); ctx.moveTo(w * i / 6, 0); ctx.lineTo(w * i / 6, h); ctx.stroke(); }
    const here = travel ? travel.from : S.town, dest = travel ? travel.to : ui.dest;

    // 同じ町どうしを結ぶ2本目の道は曲げて描く
    const bend = (rid) => (Object.keys(D.ROADS).some((k) => k < rid && D.ROADS[k].a === D.ROADS[rid].a && D.ROADS[k].b === D.ROADS[rid].b)) ? 22 : 0;
    const roadPts = (rid) => {
      const r = D.ROADS[rid], a = mapXY(D.TOWNS[r.a].pos, w, h), b = mapXY(D.TOWNS[r.b].pos, w, h), k = bend(rid);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return { a, b, c: [(a[0] + b[0]) / 2 - (b[1] - a[1]) / len * k, (a[1] + b[1]) / 2 + (b[0] - a[0]) / len * k] };
    };
    const along = (P, f) => {
      const u = 1 - f;
      return [u * u * P.a[0] + 2 * u * f * P.c[0] + f * f * P.b[0], u * u * P.a[1] + 2 * u * f * P.c[1] + f * f * P.b[1]];
    };
    const mark = (m, ch, bg) => {
      ctx.fillStyle = bg; ctx.strokeStyle = '#7a5a34'; ctx.lineWidth = 1.5;
      ctx.fillRect(m[0] - 7, m[1] - 7, 14, 14); ctx.strokeRect(m[0] - 7, m[1] - 7, 14, 14);
      ctx.fillStyle = '#5a3d1c'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch, m[0], m[1] + 0.5);
    };
    for (const rid in D.ROADS) {
      if (!S.roads[rid] || !roadUsable(rid)) continue;
      const r = D.ROADS[rid], P = roadPts(rid), hot = S.hot[rid] > day() && S.hotKnown[rid], closed = roadClosed(rid);
      ctx.strokeStyle = closed ? '#bdb6a6' : hot ? '#c0392b' : r.type === 'road' ? '#7a5a34' : '#9a8056';
      ctx.lineWidth = r.type === 'road' ? 3 : 2;
      ctx.setLineDash(r.type === 'road' ? [] : r.type === 'trail' ? [7, 4] : [2, 4]);
      ctx.beginPath(); ctx.moveTo(P.a[0], P.a[1]); ctx.quadraticCurveTo(P.c[0], P.c[1], P.b[0], P.b[1]); ctx.stroke();
      ctx.setLineDash([]);
      if (closed) mark(along(P, 0.5), '✕', '#eef3f7');
      else if (r.border) mark(along(P, 0.5), '関', S.pass.border ? '#cfe8c4' : '#fff7df');
    }
    ctx.textBaseline = 'middle';
    for (const t in D.TOWNS) {
      if (!S.seen[t] || !inPlay(t)) continue;
      const T = D.TOWNS[t], q = mapXY(T.pos, w, h), visited = S.seen[t] === 2;
      const rad = T.kind === 'capital' ? 9 : T.kind === 'village' ? 5 : 7;
      if (t === dest) { ctx.beginPath(); ctx.arc(q[0], q[1], rad + 5, 0, 7); ctx.strokeStyle = '#d2452f'; ctx.lineWidth = 2.5; ctx.stroke(); }
      if (t === here) { ctx.beginPath(); ctx.arc(q[0], q[1], rad + 5, 0, 7); ctx.strokeStyle = '#c8961e'; ctx.lineWidth = 2.5; ctx.stroke(); }
      ctx.beginPath(); ctx.arc(q[0], q[1], rad, 0, 7);
      ctx.fillStyle = !visited ? '#f6ecd0' : T.abroad ? '#2f7f86' : T.kind === 'capital' ? '#b8862b' : T.kind === 'port' ? '#3d7ea6' : '#6b4a2a';
      ctx.fill(); ctx.strokeStyle = '#3a2814'; ctx.lineWidth = 1.5; ctx.stroke();
      if (!visited) { ctx.fillStyle = '#5a3d1c'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('？', q[0], q[1] + 0.5); }
      let mk = '';
      if (S.shop && S.shop.town === t) mk += '🏪';
      if (S.orders.some((o) => o.t === t)) mk += '📜';
      if (patronOf(t)) mk += '🤝';
      if (CAL.events.some((e) => e.t === t && eventOn(e, day()))) mk += '🎪';
      if (mk) { ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(mk, q[0], q[1] - rad - 8); }
      const right = q[0] < w * 0.62;
      ctx.font = 'bold 11px sans-serif'; ctx.textAlign = right ? 'left' : 'right';
      const tx = q[0] + (right ? rad + 5 : -rad - 5), ty = q[1] + (T.kind === 'capital' ? -14 : 0), nm = townName(t);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(246,236,208,.9)'; ctx.strokeText(nm, tx, ty);
      ctx.fillStyle = '#3a2814'; ctx.fillText(nm, tx, ty);
    }
    if (travel) {
      const P = roadPts(travel.rid), rev = D.ROADS[travel.rid].a !== travel.from;
      const m = along(P, rev ? 1 - travel.frac : travel.frac);
      ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(travel.caravan ? '🐫' : cartT().icon, m[0], m[1] - 4);
    }
    if (bind) {
      cv.onclick = (e) => {
        const rc = cv.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top;
        let best = null, bd = 34;
        for (const t in D.TOWNS) {
          if (!S.seen[t] || !inPlay(t) || t === S.town) continue;
          const q = mapXY(D.TOWNS[t].pos, rc.width, rc.height), d = Math.hypot(q[0] - x, q[1] - y);
          if (d < bd) { bd = d; best = t; }
        }
        if (!best) return;
        if (neighbors(S.town).includes(best)) { ui.dest = best; render(); }
        else toast('ここからの道を知らない');
      };
    }
  }
  function routeBlock(rid) {
    const i = routeInfo(rid), r = i.r;
    if (i.closed) return `<div class="card"><div class="name">${D.ROAD_TYPES[r.type].name} <span class="tag bad">雪で閉鎖</span></div><div class="sub">春になるまで通れない。</div></div>`;
    let l2 = `<b>${i.days}日</b>${S.rain ? '（雨で遅い）' : ''}`;
    if (i.border) l2 += ` ／ 国境の関税 ${i.toll}枚${S.pass.border ? '（手形で半分）' : ''}`;
    const pct = Math.round(i.risk * 100);
    l2 += ` ／ <span class="${pct >= 30 ? 'bad' : ''}">${DANGER[i.shown]}（山賊 約${pct}%）</span>`;
    let warn = '';
    if (r.type === 'path') warn += `<div class="sub">街道より早いが、山賊の巣を抜ける。</div>`;
    if (i.breakP >= 0.1) warn += `<div class="bad sub">⚠ この荷車には悪い道。壊れやすい。</div>`;
    return `<div class="card"><div class="row"><div class="grow"><div class="name">${D.ROAD_TYPES[r.type].name}` +
      (r.border ? `<span class="tag">国境の関所</span>` : '') + `</div><div class="sub">${l2}</div>${warn}</div>` +
      `<button class="b pri" data-a="go" data-r="${rid}">出発</button></div></div>`;
  }
  // 旅じたく：噂を見て、荷・道・護衛を決める
  function viewMap() {
    let h = `<div class="mapwrap"><canvas id="map"></canvas></div>` +
      `<p class="sub">金の輪が現在地。隣の町をタップで行き先に。実線＝街道、破線＝山道、点線＝近道（早いが危ない）、✕＝雪で閉鎖。</p>`;
    const rids = roadsFrom(S.town);
    if (!ui.dest) {
      h += `<h3>ここから行ける町</h3><div class="card">` + neighbors(S.town).map((t) => {
        const open = rids.filter((rid) => other(D.ROADS[rid], S.town) === t && !roadClosed(rid));
        const days = open.length ? Math.min.apply(null, open.map((rid) => routeInfo(rid).days)) + '日〜' : '雪で閉鎖';
        const nr = rumorsAbout(t).length;
        return `<div class="row" style="padding:4px 0"><div class="grow"><span class="name">${townName(t)}</span> ` +
          `<span class="sub">${days}　${S.named[t] ? Object.keys(D.TOWNS[t].stock).filter((g) => !D.CONTRABAND.includes(g)).map((g) => D.GOODS[g].name).join('・') : 'どんな町かわからない'}${nr ? `　👂${nr}` : ''}</span></div>` +
          `<button class="b" data-a="dest" data-id="${t}">選ぶ</button></div>`;
      }).join('') + `</div>` + rumorBook(S.rumors, '👂 噂帳', true);
      return h;
    }
    const t = ui.dest, T = D.TOWNS[t];
    h += `<div class="row"><div class="grow"><h2>${townName(t)}へ</h2></div><button class="b" data-a="dest" data-id="">選び直す</button></div>`;
    if (S.named[t]) h += `<p class="sub">${KIND[T.kind]}　評判 ${Math.floor(S.rep[t])}　${T.desc}${t === 'oto' ? `<br>門で入市税 ${cartT().gate}枚。禁制品はあらためられ、売ることもできない。` : ''}</p>`;
    else h += `<p class="sub">まだ行ったことがない。どんな町かも、何が売れるかもわからない。</p>`;
    // この町についての噂と、自分で見た値
    const ru = rumorsAbout(t);
    h += ru.length ? `<div class="card"><div class="name">👂 ${townName(t)}についての噂</div>${ru.map(rumorLine).join('')}</div>`
      : `<div class="card sub">👂 この町についての噂は、まだ聞いていない。酒場や情報屋で聞ける。</div>`;
    const mm = S.memo[t], rows = Object.keys(D.GOODS).filter((g) => sellsHere(S.town, g) || S.cargo[g]);
    if (mm && S.seen[t] === 2 && rows.length) {
      h += `<details class="card"><summary>自分で見た値（${Math.max(0, day() - mm.d)}日前）</summary><table class="t"><tr><th>品</th><th>ここの買値</th><th>そのときの売値</th></tr>` + rows.map((g) => {
        const hb = sellsHere(S.town, g) ? buyNow(S.town, g) : null, v = mm.sell[g];
        return `<tr><td>${D.GOODS[g].name}</td><td>${hb !== null ? fmt(hb) : '—'}</td>` + (v == null ? `<td class="bad">禁制</td>` : `<td>${fmt(v)}</td>`) + `</tr>`;
      }).join('') + `</table><div class="sub">値は日々動く。古い値は当てにしすぎないこと。</div></details>`;
    }
    // 賭けの中身
    const worth = cargoWorth(), cost = cargoCost();
    h += `<div class="card"><div class="name">この旅に賭けるもの</div><div class="stat">` +
      `<div><span>荷</span> ${cargoWeight()}/${cartT().cap}kg</div><div><span>仕入れ値</span> ${fmt(cost)}枚</div>` +
      `<div><span>残る手持ち</span> ${fmt(S.gold)}枚</div><div><span>護衛</span> ${S.guards}/${cartT().guards}人</div></div>` +
      (cargoCount() ? `<div class="sub">${Object.keys(S.cargo).map((g) => `${D.GOODS[g].name}${qtyStr(g, S.cargo[g].qty)}`).join('、')}</div>` : `<div class="sub bad">荷がない。市場で仕入れてから出よう（空荷で行くこともできる）。</div>`) +
      (worth > 0 ? `<div class="sub">値打ち ${fmt(worth)}枚。値打ちが大きいほど山賊に狙われる。</div>` : '') +
      (D.TOWNS[S.town].has.guard && cartT().guards ? `<div class="qbtns"><button class="b" data-a="guard" data-n="-1">護衛 −1</button><button class="b" data-a="guard" data-n="1">護衛 +1（手付け${C.guardHire}枚・日給${C.guardWage}枚）</button></div>` : '') + `</div>`;
    if (Object.keys(S.cargo).some((g) => D.GOODS[g].shelf)) h += `<p class="sub">🪰 傷む品を積んでいる。日数がかかるほど値が落ちる。</p>`;
    if (contraWorth() > 0 && (t === 'oto' || rids.some((rid) => other(D.ROADS[rid], S.town) === t && D.ROADS[rid].border))) h += `<p class="bad sub">⚠ 禁制品を積んでいる。王都の門と国境の関所で、見つかれば没収と罰金。</p>`;
    h += `<h3>道を選んで出発</h3>` + rids.filter((rid) => other(D.ROADS[rid], S.town) === t).map(routeBlock).join('');
    return h;
  }

  function ensureCaravans(t) {
    const d = day();
    const list = (S.caravans[t] || []).filter((c) => c.leave >= d && !roadClosed(c.rid));
    const roads = Object.keys(D.ROADS).filter((rid) => D.ROADS[rid].type === 'road' && roadUsable(rid) && !roadClosed(rid) && (D.ROADS[rid].a === t || D.ROADS[rid].b === t));
    let guard = 0;
    while (list.length < Math.min(2, roads.length) && guard++ < 20) {
      const rid = pick(roads);
      if (list.some((c) => c.rid === rid)) continue;
      list.push({ rid, leave: d + rndi(1, 3), fee: 6 + D.ROADS[rid].len * 5 });
    }
    S.caravans[t] = list;
    return list;
  }
  function tradeIn() { return S.cart.type === 'basket' ? 0 : Math.floor(cartT().price * 0.5 * (0.5 + S.cart.hp / 200)); }
  function viewTown() {
    const t = S.town, T = D.TOWNS[t], cart = cartT(), cost = dailyCost();
    let h = `<h2>${T.name}</h2><p class="sub">${T.desc}</p>`;
    h += `<h3>宿</h3><div class="card"><div class="sub">1日の出費 ${cost.total}枚（宿と食事${cost.living}` +
      (cost.feed ? `・餌${cost.feed}` : '') + (cost.guards ? `・護衛${cost.guards}` : '') + (cost.shop ? `・店${cost.shop}` : '') + `）</div>` +
      `<div class="qbtns"><button class="b" data-a="rest">1日休む</button><button class="b" data-a="work">日雇いで働く（+${C.laborPay}枚）</button></div></div>`;

    // 頼みごとと得意先
    const offers = offersOf(t), pt = patronOf(t);
    h += `<h3>${T.who.role}の${T.who.name}</h3>` + orderCards();
    if (pt) {
      h += `<div class="card sub">🤝 得意先。${C.patronEvery}日ごとに${D.GOODS[pt.g].name}${qtyStr(pt.g, pt.n)}を納める約束。` +
        (pt.streak >= C.patronTrust ? `<span class="good">信用されている（この町での売り買いが${Math.round(C.patronEdge * 100)}%有利、確かな噂をくれる）</span>` : `あと${C.patronTrust - pt.streak}回守れば、売り買いが有利になる。`) + `</div>`;
    } else if (patronReady(t)) {
      const w = T.who.want;
      h += `<div class="card goal"><div class="name">🤝 「うちと、続けて商いをしないか」</div>` +
        `<div class="sub">${C.patronEvery}日ごとに ${D.GOODS[w.g].name}を${qtyStr(w.g, w.n)}（${w.n * D.GOODS[w.g].w}kg）。代金は1回 ${Math.round(w.n * D.GOODS[w.g].base * C.patronPay)}枚。` +
        `守りつづければ、この町での売り買いが有利になり、確かな噂をもらえる。2回忘れると縁が切れる。</div>` +
        `<button class="b pri wide" data-a="patron">得意先になる</button></div>`;
    } else if (!pt && goodInPlay(T.who.want.g)) {
      h += `<p class="sub">頼みごとを${C.patronAfter}回果たすと、得意先の話が来る（今 ${S.done[t] || 0}回）。</p>`;
    }
    h += offers.length ? offers.map((o, i) => {
      const w = o.n * D.GOODS[o.g].w;
      return `<div class="card row"><div class="grow"><div class="name">${D.GOODS[o.g].icon} ${D.GOODS[o.g].name}を ${qtyStr(o.g, o.n)}</div>` +
        `<div class="sub">${w}kg${w > cart.cap ? '（<span class="bad">今の荷車では一度に運べない</span>）' : ''} ／ ${o.days}日以内 ／ 報酬 ${o.reward}枚・評判+${o.rep}</div>` +
        `<div class="sub">遅れると評判が${C.orderFailRep}下がる。</div></div><button class="b pri" data-a="accept" data-i="${i}">受ける</button></div>`;
    }).join('') : `<p class="sub">いまは頼みごとがない。</p>`;

    h += `<h3>酒場</h3><div class="card row"><div class="grow">噂を聞く ${STARS.tavern}<div class="sub">値の噂、これから起きること、知らない町や山賊の話。何が聞けるかは運。</div></div>` +
      `<button class="b pri" data-a="rumor">${C.rumorCost}枚</button></div>`;
    if (T.has.info) {
      const towns = playTowns().filter((x) => x !== t && S.named[x]), vg = S.rumors.filter((r) => r.kind === 'vague' && r.hide);
      h += `<h3>情報屋 ${STARS.broker}</h3><div class="card"><div class="sub">町を指定すると、その町の値を${C.brokerGoods}品ぶん教えてくれる（${C.brokerCost}枚）。当たる割合は9割。遠い町ほど幅は広い。</div>` +
        `<div class="chips">` + towns.map((x) => `<button class="b" data-a="broker" data-t="${x}">${D.TOWNS[x].name.replace(/^(国境の町|港町|砂の都|王都)/, '').replace(/(の町|村|鉱山町|の宿場)$/, '')}</button>`).join('') + `</div>` +
        (vg.length ? `<div class="sub" style="margin-top:8px">あいまいな噂を確かめる（${C.brokerCost}枚）</div>` + vg.map((r) =>
          `<div class="row" style="padding:4px 0"><div class="grow sub">❓ ${rumorText(r)}</div><button class="b" data-a="clarify" data-id="${r.id}">確かめる</button></div>`).join('') : '') + `</div>`;
    }

    if (T.has.guard || S.guards > 0) {
      h += `<h3>${T.has.guard ? '口入れ屋（護衛）' : '護衛'}</h3><div class="card"><div>護衛 <b>${S.guards}人</b>　<span class="sub">${cart.name}は${cart.guards}人まで</span></div>` +
        `<div class="sub">手付け ${C.guardHire}枚、日給 ${C.guardWage}枚。山賊と戦う力になり、襲われにくく、先に気づきやすくなる。` +
        `${T.has.guard ? '' : 'この町では新しく雇えない。'}</div>` +
        `<div class="qbtns"><button class="b" data-a="guard" data-n="-1">−1 暇を出す</button>` +
        (T.has.guard ? `<button class="b pri" data-a="guard" data-n="1">+1 雇う</button>` : '') + `</div></div>`;
    }
    if (T.has.caravan) {
      h += `<h3>隊商</h3><p class="sub">参加費を払って同行する。出発を待つことになるが、山賊に襲われにくく、襲われても隊商の護衛が戦う。</p>` +
        ensureCaravans(t).map((c, i) => {
          const to = other(D.ROADS[c.rid], t), wait = c.leave - day();
          return `<div class="card row"><div class="grow"><div class="name">🐫 ${townName(to)}行き</div>` +
            `<div class="sub">${wait <= 0 ? '今日' : wait + '日後に'}出発 ／ 道中 ${routeInfo(c.rid, true).days}日 ／ 参加費 ${c.fee}枚` +
            (D.ROADS[c.rid].border ? ' ／ 国境の関所あり' : '') + `</div></div><button class="b pri" data-a="caravan" data-i="${i}">加わる</button></div>`;
        }).join('');
    }
    if (T.has.cart) {
      h += `<h3>車屋</h3>`;
      if (S.cart.type !== 'basket') {
        const rc = Math.ceil((100 - S.cart.hp) / 100 * cart.price * 0.3);
        h += `<div class="card row"><div class="grow">${cart.name}の具合 <b class="${S.cart.hp < 40 ? 'bad' : ''}">${Math.round(S.cart.hp)}%</b>` +
          `<div class="sub">40%を切ると道中で壊れやすい</div></div>` +
          (S.cart.hp < 100 ? `<button class="b pri" data-a="fix">直す ${rc}枚</button>` : `<span class="sub">万全</span>`) + `</div>`;
      }
      const tin = tradeIn();
      for (const id in D.CARTS) {
        const c = D.CARTS[id];
        if (id === S.cart.type || id === 'basket') continue;
        const pr = c.price - tin;
        h += `<div class="card"><div class="row"><div class="grow"><div class="name">${c.icon} ${c.name}</div><div class="sub">${c.desc}</div></div>` +
          `<button class="b pri" data-a="buyCart" data-id="${id}">${pr >= 0 ? fmt(pr) + '枚' : '+' + fmt(-pr) + '枚'}</button></div>` +
          `<div class="stat"><div><span>積める重さ</span> <b>${c.cap}kg</b></div><div><span>餌代</span> 1日${c.feed}枚</div>` +
          `<div><span>街道</span> ${c.speed.road <= 0.7 ? '速い' : c.speed.road <= 0.95 ? 'やや速い' : '普通'}</div>` +
          `<div><span>山道</span> ${c.speed.trail >= 1.4 ? '苦手' : c.speed.trail >= 1.1 ? 'やや遅い' : '普通'}</div>` +
          `<div><span>護衛</span> ${c.guards}人まで</div><div><span>麦なら</span> ${Math.floor(c.cap / D.GOODS.grain.w)}袋</div>` +
          `<div><span>ワインなら</span> ${Math.floor(c.cap / D.GOODS.wine.w)}樽</div><div><span>今の${cart.name}</span> ${cart.cap}kg</div></div></div>`;
      }
      if (tin) h += `<div class="card row"><div class="grow">今の${cart.name}を売る<div class="sub">背負い籠に戻る。苦しいときの最後の手。</div></div>` +
        `<button class="b" data-a="sellCart">+${tin}枚</button></div>`;
    }
    if (T.has.lender) {
      const can = Math.max(0, Math.floor(C.tabLimit - S.debt)), rest = Math.max(0, dueNow() - S.loan.pre);
      h += `<h3>金貸しバルド${t === 'kawabe' ? 'の店' : 'の出店'}</h3><div class="card">`;
      if (!S.loan.done) {
        h += `<div>親の借金　残り <b>${fmt(loanLeft())}枚</b>（あと${C.loan.dues.length - S.loan.n}回）</div>` +
          `<div class="sub">次は ${daysLeft()}日後に ${dueNow()}枚${S.loan.pre ? `（うち${S.loan.pre}枚は先に納めた）` : ''}。回を追うごとに額が上がる。</div>`;
      } else h += `<div class="good">親の借金は返し終えた。</div>`;
      h += `<div>ツケ <b class="${S.debt > 0 ? 'bad' : ''}">${fmt(Math.ceil(S.debt))}枚</b>　<span class="sub">利子は1日${(C.tabInterest * 100).toFixed(1)}%。次の返済日にまとめて取り立て。</span></div>` +
        `<div class="qbtns">` + (!S.loan.done ? `<button class="b" data-a="prepay" ${rest > 0 && S.gold > 0 ? '' : 'disabled'}>先に納める</button>` : '') +
        `<button class="b" data-a="repay" ${S.debt > 0 && S.gold > 0 ? '' : 'disabled'}>ツケを返す</button>` +
        `<button class="b pri" data-a="borrow" ${can > 0 ? '' : 'disabled'}>借りる（あと${can}）</button></div></div>`;
    }
    if (T.has.map) {
      h += `<h3>地図屋</h3><div class="card row"><div class="grow">このあたりの地図<div class="sub">近くの町と道がわかる</div></div><button class="b pri" data-a="mapBuy" data-k="local">${C.mapLocal}枚</button></div>` +
        `<div class="card row"><div class="grow">国じゅうの地図<div class="sub">国の中の、すべての町と道がわかる</div></div><button class="b pri" data-a="mapBuy" data-k="full">${C.mapFull}枚</button></div>`;
    }
    if (t === C.startTown) h += viewHome();
    h += viewShop();
    return h;
  }
  // 故郷の村への投資
  function viewHome() {
    let h = `<h3>故郷の村を育てる</h3><div class="mapwrap"><canvas id="home"></canvas></div>` +
      `<p class="sub">稼いだ金で村に建てものを贈る。建てるほど、村の麦と羊毛の在庫が増える（今 ×${homeBonus(C.startTown).toFixed(1)}）。</p>`;
    for (const k in C.home) {
      const p = C.home[k];
      h += `<div class="card row"><div class="grow"><div class="name">${p.name}${S.home[k] ? ' <span class="tag good">建てた</span>' : ''}</div><div class="sub">${p.desc}。村の評判 +${p.rep}</div></div>` +
        (S.home[k] ? '' : `<button class="b pri" data-a="build" data-k="${k}">${p.cost}枚</button>`) + `</div>`;
    }
    return h;
  }
  // 店をたたんだときに戻るお金：建てた費用の3割 ＋ 在庫の半値 ＋ 売上金
  function closeValue() {
    if (!S.shop) return 0;
    let v = shopValue() * 0.3 + S.shop.till;
    for (const g in S.shop.stock) v += S.shop.stock[g].qty * D.GOODS[g].base * 0.5;
    return Math.floor(v);
  }
  function viewShop() {
    const t = S.town, T = D.TOWNS[t];
    let h = `<h3>自分の店</h3>`;
    if (!S.shop) {
      const L = C.shop[1];
      if (T.kind === 'village') return h + `<div class="card sub">村には店を出せない。町・王都・港町で。</div>`;
      return h + `<div class="card"><div class="name">🏪 露店を出す</div><div class="sub">預けた荷を、${L.every}日に1度の市の日に売ってくれる。自分で卸すより高く売れる。` +
        `品は${L.kinds}種・${L.units}個まで。場所代 1日${L.rent}枚。</div>` +
        `<div class="sub">条件：この町の評判 ${L.rep}（今 ${Math.floor(S.rep[t])}）</div>` +
        `<button class="b pri wide" data-a="shopOpen">露店を出す（${L.cost}枚）</button></div>`;
    }
    const sh = S.shop, L = C.shop[sh.lv], st = Object.keys(sh.stock);
    let units = 0; for (const g of st) units += sh.stock[g].qty;
    h += `<div class="card"><div class="name">🏪 ${D.TOWNS[sh.town].name}の${L.name}</div>` +
      `<div class="stat"><div><span>売上金</span> ${fmt(sh.till)}枚</div><div><span>在庫</span> ${units}/${L.units}個</div>` +
      `<div><span>店賃など</span> 1日${L.rent + L.wage}枚</div><div><span>売れ方</span> ${L.every === 1 ? '毎日' : L.every + '日に1度'}・1品${L.rate}個</div></div>` +
      (st.length ? `<div class="sub">在庫：${st.map((g) => `${D.GOODS[g].name}${qtyStr(g, sh.stock[g].qty)}`).join('、')}</div>` : `<div class="sub bad">在庫がない。荷を預けよう。</div>`);
    if (sh.town !== t) return h + `<div class="sub">店のある町に行けば、荷を預けたり売上金を受け取ったりできる。</div></div>`;
    h += `<button class="b pri wide" data-a="shopTake" ${sh.till > 0 ? '' : 'disabled'}>売上金を受け取る</button></div>`;
    const mine = Object.keys(S.cargo).filter((g) => !banned(t, g));
    if (mine.length) {
      h += `<div class="card"><div class="name">荷を店に預ける</div>` + mine.map((g) =>
        `<div class="row" style="padding:4px 0"><div class="grow">${D.GOODS[g].icon} ${D.GOODS[g].name} ${qtyStr(g, S.cargo[g].qty)}</div>` +
        `<button class="b" data-a="shopPut" data-g="${g}">預ける</button></div>`).join('') + `</div>`;
    }
    h += `<div class="card row"><div class="grow">店をたたむ<div class="sub">在庫は半値で処分。店賃がかからなくなる。</div></div>` +
      `<button class="b warn" data-a="shopClose">+${closeValue()}枚</button></div>`;
    if (sh.lv === 1) {
      const N = C.shop[2];
      h += `<div class="card"><div class="name">小さな店に建て替える</div><div class="sub">毎日売れるようになり、品は${N.kinds}種・${N.units}個まで置ける。` +
        `店賃と店番で1日${N.rent + N.wage}枚。</div><div class="sub">条件：この町の評判 ${N.rep}（今 ${Math.floor(S.rep[t])}）</div>` +
        `<button class="b pri wide" data-a="shopUp">建て替える（${N.cost}枚）</button></div>`;
    }
    return h;
  }

  function viewBook() {
    const cart = cartT(), cost = dailyCost(), names = ['', '行商人', '荷車商人', '店主'];
    let h = `<h2>帳簿</h2><div class="mapwrap"><canvas id="scene"></canvas></div>` +
      `<p class="sub">いまの姿：${names[stage()]}（${cart.name}${S.shop ? '・' + C.shop[S.shop.lv].name : ''}${S.abroad ? '・隣国との商いを許された' : ''}）</p>` + dueCard();
    h += `<div class="card"><div class="sub">次の目標</div><div class="name">${goalText()}</div></div>`;
    h += `<h3>お金</h3><div class="card stat"><div><span>手持ち</span> ${fmt(S.gold)}枚</div><div><span>1日の出費</span> ${cost.total}枚</div>` +
      `<div><span>親の借金の残り</span> ${fmt(loanLeft())}枚</div><div><span>ツケ</span> ${fmt(Math.ceil(S.debt))}枚</div></div>`;
    if (!S.loan.done) {
      h += `<div class="card"><div class="name">返済の予定</div><div class="sub">${C.loan.every}日ごと（季節の終わり）。` +
        C.loan.dues.map((v, i) => (i < S.loan.n ? `<s>${v}</s>` : i === S.loan.n ? `<b class="gold">${v}</b>` : v)).join(' → ') + ` 枚</div></div>`;
    }
    h += `<h3>荷車と護衛</h3><div class="card"><div class="name">${cart.icon} ${cart.name}</div><div class="sub">${cart.desc}</div>` +
      `<div class="stat"><div><span>荷の重さ</span> ${cargoWeight()}/${cart.cap}kg</div><div><span>具合</span> ${Math.round(S.cart.hp)}%</div>` +
      `<div><span>護衛</span> ${S.guards}/${cart.guards}人</div><div><span>戦う力</span> ${power(false)}</div></div></div>`;
    const cg = Object.keys(S.cargo);
    h += `<h3>荷（値打ち ${fmt(cargoWorth())}枚）</h3><div class="card">` + (cg.length ? cg.map((g) => `<div>${D.GOODS[g].icon} ${D.GOODS[g].name} ${qtyStr(g, S.cargo[g].qty)}` +
      ` <span class="sub">${S.cargo[g].qty * D.GOODS[g].w}kg` + (D.GOODS[g].shelf ? `・鮮度${Math.round(fresh(g, S.cargo[g].age) * 100)}%` : '') + `</span></div>`).join('') : `<span class="sub">空っぽ</span>`) + `</div>`;
    const vis = playTowns().filter((t) => S.seen[t] === 2);
    h += `<h3>町の評判と呼び名（訪れた町 ${vis.length}/${playTowns().length}）</h3><div class="card">` +
      vis.map((t) => `<div class="row"><div class="grow">${D.TOWNS[t].name}${patronOf(t) ? ' 🤝' : ''}</div><div class="sub">「${callName(t)}」</div><div style="width:34px;text-align:right">${Math.floor(S.rep[t])}</div></div>`).join('') + `</div>` +
      `<p class="sub">評判は、町が欲しがる品を売る、頼みごとを果たす、得意先に納める、で上がる。${C.shop[1].rep}で露店。王都の評判${C.abroad.rep}と小さな店で、隣国への道。${S.pass.border ? '🪪 国境の通行手形あり。' : ''}</p>`;
    if (S.patrons.length) h += `<h3>得意先</h3>` + S.patrons.map((p) => `<div class="card sub">🤝 ${D.TOWNS[p.t].name}の${D.TOWNS[p.t].who.name}：${D.GOODS[p.g].name}${qtyStr(p.g, p.n)}を${C.patronEvery}日ごと。次はあと${p.due - day()}日。続けて${p.streak}回。</div>`).join('');
    h += `<h3>これまで</h3><div class="card stat"><div><span>行商</span> ${S.stats.trips}回</div><div><span>果たした頼み</span> ${S.stats.orders}件</div>` +
      `<div><span>得意先への納め</span> ${S.stats.supplies}回</div><div><span>最高の旅</span> +${fmt(S.stats.bestTrip)}枚</div>` +
      `<div><span>山賊を退けた</span> ${S.stats.wins}回</div><div><span>奪われた</span> ${S.stats.robbed}回</div></div>`;
    const rec = records();
    if (rec.length) {
      h += `<h3>商人録（歴代の記録）</h3><div class="card">` + rec.map((r) =>
        `<div class="sub">${r.result === '完済' ? '🏅' : '💀'} ${r.result}　${r.day}日目・返済${r.paid}回・${r.cart}・店:${r.shop}・町${r.towns}・最高の旅 +${fmt(r.best)}枚${r.abroad ? '・隣国へ' : ''}</div>`).join('') + `</div>`;
    }
    h += `<button class="b wide" data-a="help">遊び方を見る</button><button class="b warn wide" data-a="reset">記録を捨てて最初から</button>`;
    return h;
  }
  function helpBody() {
    return `<p>① <b>噂</b>を集める。町に着くと耳に入り、酒場や情報屋でも聞ける。値の噂は「35〜47枚」のような幅つきで、外れることもある。</p>` +
      `<p>② <b>市場</b>で仕入れる。品は袋・樽・反などで数え、重さ（kg）がある。背負い籠は${D.CARTS.basket.cap}kgまで。</p>` +
      `<p>③ <b>旅じたく</b>で行き先と道を決めて出発。街道は安全で遅く、近道は早いが山賊が多い。道中で、迂回するか、川を渡るかなどを自分で決める。</p>` +
      `<p>④ 着いたら<b>札をめくって</b>今日の値を見る。噂が当たれば大もうけ、外れれば損。</p>` +
      `<p>⑤ <b>${C.loan.every}日ごと（季節の終わり）</b>に親の借金を納める。額は上がっていく。足りなければ差し押さえ、何も残らなければ<b>破産で最初から</b>。</p>` +
      `<p class="sub">麦・塩・樽・鉄のような重くて安い品ほど、産地を離れると値が大きく上がる。布や香辛料は1〜3割しか変わらない。稼ぎは、運んだ重さでほぼ決まる。</p>` +
      `<p class="sub">季節で値が変わる（秋は麦が安い、冬は峠が閉じる）。暦の行事は誰でも知っている。予定外の出来事は噂でしか分からない。</p>` +
      `<p class="sub"><b>町</b>では、顔役の頼みごと（何度か果たすと得意先に）、護衛、隊商、車屋、金貸しが使える。</p>`;
  }
  function intro() {
    S.told.intro = 0;
    tell('intro', { gold: C.startGold });
    notices.push({ title: '遊び方', body: helpBody(), label: 'はじめる' });
    save(); showNotices();
  }

  // ---------- 成り上がりの絵 ----------
  function sceneCtx(cv, h) {
    if (!cv) return null;
    const w = cv.clientWidth || 340, dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.style.height = h + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#cfe3ee'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#b9a36a'; ctx.fillRect(0, h - 26, w, 26);
    return { ctx, w, h, gy: h - 26 };
  }
  // 自分の姿（荷車）と店
  function drawScene(cv) {
    const c = sceneCtx(cv, 120);
    if (!c) return;
    const { ctx, w, gy } = c, type = S.cart.type;
    const rect = (x, y, ww, hh, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, ww, hh); };
    const wheel = (x, r) => { ctx.beginPath(); ctx.arc(x, gy - r, r, 0, 7); ctx.fillStyle = '#5a3d1c'; ctx.fill(); ctx.beginPath(); ctx.arc(x, gy - r, r * 0.4, 0, 7); ctx.fillStyle = '#c9a66b'; ctx.fill(); };
    // 人
    const px = w * 0.16;
    ctx.strokeStyle = '#3a2814'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px, gy - 34); ctx.lineTo(px, gy - 14); ctx.lineTo(px - 5, gy); ctx.moveTo(px, gy - 14); ctx.lineTo(px + 5, gy); ctx.stroke();
    ctx.fillStyle = '#e8c9a0'; ctx.beginPath(); ctx.arc(px, gy - 40, 6, 0, 7); ctx.fill(); ctx.stroke();
    if (type === 'basket') { rect(px - 14, gy - 36, 10, 16, '#a9793c'); }
    else {
      const big = type === 'horse', mid = type === 'donkey';
      const bw = big ? 54 : mid ? 42 : 28, bh = big ? 22 : mid ? 18 : 14, bx = px + (type === 'handcart' ? 10 : 62);
      rect(bx, gy - bh - 10, bw, bh, '#8a5a2b'); rect(bx, gy - bh - 16, bw, 6, big ? '#e9e2d0' : '#a9793c');
      wheel(bx + 9, 8); if (type !== 'handcart') wheel(bx + bw - 9, 8);
      if (type !== 'handcart') {   // ロバ・馬
        const ax = px + 26, col = big ? '#7a4a22' : '#8d8d86', hh = big ? 26 : 20;
        ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(ax + 12, gy - hh, 16, big ? 9 : 7, 0, 0, 7); ctx.fill();
        rect(ax + 1, gy - hh, 4, hh, col); rect(ax + 20, gy - hh, 4, hh, col);
        ctx.beginPath(); ctx.ellipse(ax - 5, gy - hh - 9, 6, 5, -0.5, 0, 7); ctx.fill();
        rect(ax - 8, gy - hh - (big ? 18 : 22), 3, big ? 6 : 10, col);
      }
    }
    // 店
    const sx = w * 0.66;
    if (!S.shop) {
      ctx.strokeStyle = '#8a7446'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.strokeRect(sx, gy - 46, 70, 46); ctx.setLineDash([]);
      ctx.fillStyle = '#6b5a3a'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('いつか、ここに店を', sx + 35, gy - 23);
    } else if (S.shop.lv === 1) {
      rect(sx + 4, gy - 40, 3, 40, '#5a3d1c'); rect(sx + 63, gy - 40, 3, 40, '#5a3d1c');
      for (let i = 0; i < 7; i++) rect(sx + i * 10, gy - 48, 10, 10, i % 2 ? '#d2452f' : '#f6ecd0');
      rect(sx + 12, gy - 16, 46, 16, '#a9793c'); rect(sx + 18, gy - 24, 12, 8, '#e9b949'); rect(sx + 36, gy - 24, 12, 8, '#8fd68a');
    } else {
      rect(sx, gy - 46, 76, 46, '#e9dcc0');
      ctx.fillStyle = '#9a3b2a'; ctx.beginPath(); ctx.moveTo(sx - 6, gy - 46); ctx.lineTo(sx + 38, gy - 72); ctx.lineTo(sx + 82, gy - 46); ctx.closePath(); ctx.fill();
      rect(sx + 30, gy - 26, 16, 26, '#5a3d1c'); rect(sx + 8, gy - 34, 14, 12, '#9cc7e0'); rect(sx + 54, gy - 34, 14, 12, '#9cc7e0');
      rect(sx + 18, gy - 46, 40, 9, '#e9b949');
    }
    if (S.loan.done) { rect(w * 0.5, gy - 60, 2, 60, '#5a3d1c'); rect(w * 0.5 + 2, gy - 60, 18, 11, '#3d7ea6'); }
  }
  // 故郷の村（井戸・橋・水車が建つと絵が変わる）
  function drawHome(cv) {
    const c = sceneCtx(cv, 110);
    if (!c) return;
    const { ctx, w, gy } = c;
    const rect = (x, y, ww, hh, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, ww, hh); };
    const house = (x, s) => { rect(x, gy - 20 * s, 26 * s, 20 * s, '#e9dcc0'); ctx.fillStyle = '#8a5a2b'; ctx.beginPath(); ctx.moveTo(x - 4, gy - 20 * s); ctx.lineTo(x + 13 * s, gy - 34 * s); ctx.lineTo(x + 26 * s + 4, gy - 20 * s); ctx.closePath(); ctx.fill(); };
    for (let i = 0; i < 8; i++) rect(i * w / 8, gy + 6, w / 16, 20, '#d9c36a');     // 麦畑
    rect(w * 0.62, gy - 4, w * 0.16, 30, '#7fb0cf');                                // 川
    house(w * 0.06, 1); house(w * 0.22, 0.8); house(w * 0.36, 1);
    if (S.home.well) { rect(w * 0.5, gy - 12, 16, 12, '#9a9a94'); rect(w * 0.5 - 1, gy - 26, 2, 14, '#5a3d1c'); rect(w * 0.5 + 15, gy - 26, 2, 14, '#5a3d1c'); rect(w * 0.5 - 3, gy - 28, 22, 3, '#5a3d1c'); }
    if (S.home.bridge) { ctx.strokeStyle = '#8d8d86'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(w * 0.7, gy + 8, w * 0.1, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
    else { rect(w * 0.6, gy - 2, w * 0.2, 3, '#8a5a2b'); }
    if (S.home.mill) {
      rect(w * 0.84, gy - 30, 30, 30, '#e9dcc0'); rect(w * 0.84 - 3, gy - 34, 36, 5, '#8a5a2b');
      ctx.strokeStyle = '#5a3d1c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(w * 0.82, gy - 10, 14, 0, 7); ctx.stroke();
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(w * 0.82, gy - 10); ctx.lineTo(w * 0.82 + Math.cos(i * 1.57 + 0.4) * 14, gy - 10 + Math.sin(i * 1.57 + 0.4) * 14); ctx.stroke(); }
    }
  }

  // ---------- 町での操作 ----------
  const actions = {
    tab(d) { ui.tab = d.id; window.scrollTo(0, 0); render(); },
    dest(d) { ui.dest = d.id || null; render(); window.scrollTo(0, 0); },
    help() { modal({ title: '遊び方', body: helpBody(), buttons: [{ label: 'とじる', cls: 'pri' }] }); },
    reset() {
      confirmBox('記録を捨てる', '<p>今の記録は消える。よい？</p>', '最初から', () => {
        wipeSave(); newGame(); save(); ui = { tab: 'market', dest: null }; render(); intro();
      });
    },

    buy(d) {
      const g = d.g, t = S.town;
      if (!sellsHere(t, g)) return;
      const max = maxBuy(t, g);
      if (max <= 0) return toast(Math.floor(S.stock[t][g]) <= 0 ? '売り切れ。数日待てば入る' : freeWeight() < D.GOODS[g].w ? `重くてもう積めない（1${U(g)} ${D.GOODS[g].w}kg、空きは${freeWeight()}kg）` : 'お金が足りない');
      openQty({
        title: `${D.GOODS[g].name}を買う（1${U(g)} ${D.GOODS[g].w}kg）`, max, okLabel: '買う', unit: U(g),
        calc: (q) => { const r = quote(t, g, q, 1); return `合計 ${G(r.tot)}　<span class="sub">${q * D.GOODS[g].w}kg（積めるのはあと ${freeWeight() - q * D.GOODS[g].w}kg）</span>`; },
        ok: (q) => {
          const r = quote(t, g, q, 1);
          S.gold -= r.tot; S.market[t][g] = r.dev; S.stock[t][g] -= q; addCargo(g, q, r.tot);
          tradeTick(); settle();
        }
      });
    },
    sell(d) {
      const g = d.g, t = S.town, own = S.cargo[g];
      if (!own || banned(t, g)) return;
      const avg = own.cost / own.qty, f = fresh(g, own.age);
      openQty({
        title: `${D.GOODS[g].name}を売る`, max: own.qty, okLabel: '売る', unit: U(g),
        calc: (q) => {
          const r = quote(t, g, q, -1, f), pf = r.tot - avg * q;
          return `合計 ${G(r.tot)}　<span class="${pf >= 0 ? 'good' : 'bad'}">${pf >= 0 ? '利益 +' : '損 '}${fmt(pf)}枚</span>`;
        },
        ok: (q) => {
          const wanted = (D.TOWNS[t].prices[g] || 1) >= 1.15, r = quote(t, g, q, -1, f);
          S.gold += r.tot; S.market[t][g] = r.dev; S.stats.profit += r.tot - avg * q;
          S.rep[t] = Math.min(100, S.rep[t] + Math.min(2, r.tot / (wanted ? 80 : 240)));
          own.cost -= avg * q; own.qty -= q;
          if (own.qty <= 0) delete S.cargo[g];
          tradeTick(); settle();
        }
      });
    },
    accept(d) {
      const o = offersOf(S.town)[+d.i];
      if (!o) return;
      if (S.orders.length >= C.orderMax) return toast(`同時に受けられるのは${C.orderMax}件まで`);
      S.offers[S.town].list.splice(+d.i, 1);
      S.orders.push({ id: o.id, t: S.town, g: o.g, n: o.n, due: day() + o.days, reward: o.reward, rep: o.rep });
      const who = D.TOWNS[S.town].who, src = playTowns().filter((p) => sellsHere(p, o.g) && S.named[p]).map((p) => D.TOWNS[p].name);
      notices.push({
        title: `📜 ${who.name}の頼み`,
        body: `<p class="story">「${D.GOODS[o.g].name}を${qtyStr(o.g, o.n)}、${o.days}日のうちに。頼んだよ。」</p>` +
          `<p class="sub">${src.length ? '産地：' + src.join('・') : '産地はまだ知らない。酒場で聞いてみよう。'}</p>`
      });
      settle();
    },
    deliver(d) {
      const o = S.orders[+d.i], own = o && S.cargo[o.g];
      if (!o || o.t !== S.town || !own || own.qty < o.n) return;
      const avg = own.cost / own.qty;
      own.cost -= avg * o.n; own.qty -= o.n;
      if (own.qty <= 0) delete S.cargo[o.g];
      S.gold += o.reward; S.stats.profit += o.reward - avg * o.n; S.stats.orders++;
      S.rep[o.t] = Math.min(100, S.rep[o.t] + o.rep);
      S.done[o.t] = (S.done[o.t] || 0) + 1;
      S.orders.splice(+d.i, 1);
      notices.push({ title: '📜 約束を果たした', body: `<p>${D.TOWNS[o.t].who.name}に${D.GOODS[o.g].name}${qtyStr(o.g, o.n)}を納めた。</p><p>報酬 ${G(o.reward)}　評判 +${o.rep}</p>` + (patronReady(o.t) ? `<p class="good">${D.TOWNS[o.t].who.name}が、続けての商いを持ちかけてきた（町の画面で）。</p>` : '') });
      tell('order1');
      tradeTick(); settle();
    },
    patron() {
      const t = S.town;
      if (!patronReady(t)) return;
      const w = D.TOWNS[t].who.want;
      S.patrons.push({ t, g: w.g, n: w.n, due: day() + C.patronEvery, streak: 0, miss: 0 });
      tell('patron', { name: D.TOWNS[t].who.name, days: C.patronEvery });
      settle();
    },
    supply(d) {
      const p = S.patrons[+d.i], own = p && S.cargo[p.g];
      if (!p || p.t !== S.town || !own || own.qty < p.n) return;
      const avg = own.cost / own.qty, payv = patronPay(p);
      own.cost -= avg * p.n; own.qty -= p.n;
      if (own.qty <= 0) delete S.cargo[p.g];
      S.gold += payv; S.stats.profit += payv - avg * p.n; S.stats.supplies++;
      S.rep[p.t] = Math.min(100, S.rep[p.t] + C.patronRep);
      p.streak++; p.miss = 0; p.due = day() + C.patronEvery;
      const r = Math.random() < 0.5 ? omenRumor('patron') : randomPrice('patron');
      notices.push({
        title: '🤝 得意先に納めた',
        body: `<p>${D.TOWNS[p.t].who.name}に${D.GOODS[p.g].name}${qtyStr(p.g, p.n)}を納めた。代金 ${G(payv)}　評判 +${C.patronRep}</p>` +
          (p.streak === C.patronTrust ? `<p class="good">信用を得た。この町での売り買いが${Math.round(C.patronEdge * 100)}%有利になる。</p>` : '') +
          (r ? `<p class="sub">「ついでに、いい話をひとつ。」</p>${rumorLine(r)}` : '') + `<p class="sub">次は${C.patronEvery}日後まで。</p>`
      });
      tradeTick(); settle();
    },

    rest() { advance(4 - (S.time % 4)); settle(); if (!S.dead) toast('朝になった'); },
    work() {
      advance(4 - (S.time % 4)); if (!S.dead) S.gold += C.laborPay;
      settle(); if (!S.dead) toast(`1日働いて ${C.laborPay}枚 稼いだ`);
    },
    rumor() {
      if (S.gold < C.rumorCost) return toast('お金が足りない');
      S.gold -= C.rumorCost;
      const d = day();
      let body;
      const hint = playTowns().filter((t) => !S.named[t] && Object.keys(D.ROADS).some((rid) => {
        const r = D.ROADS[rid]; return roadUsable(rid) && ((r.a === t && S.seen[r.b]) || (r.b === t && S.seen[r.a]));
      }));
      const hotNew = Object.keys(S.hot).filter((r) => S.hot[r] > d && !S.hotKnown[r] && S.roads[r]);
      const roll = Math.random();
      if (hint.length && roll < 0.3) {
        const t = pick(hint), T = D.TOWNS[t];
        S.named[t] = true; if (!S.seen[t]) S.seen[t] = 1;
        for (const rid in D.ROADS) { const r = D.ROADS[rid]; if (roadUsable(rid) && ((r.a === t && S.seen[r.b]) || (r.b === t && S.seen[r.a]))) S.roads[rid] = true; }
        body = `<p>「<b>${T.name}</b>を知ってるかい。${T.desc}」</p><p class="sub">特産：${Object.keys(T.stock).filter((g) => !D.CONTRABAND.includes(g)).map((g) => D.GOODS[g].name).join('・')}　地図に書きこんだ。</p>`;
      } else if (hotNew.length && roll < 0.5) {
        const rid = pick(hotNew), r = D.ROADS[rid];
        S.hotKnown[rid] = true;
        body = `<p>「${townName(r.a)}と${townName(r.b)}のあいだの${D.ROAD_TYPES[r.type].name}に、近ごろ山賊が居ついたそうだ。」</p><p class="sub">地図に赤く印をつけた。</p>`;
      } else {
        const k = Math.random(), r = k < 0.5 ? randomPrice('tavern') : k < 0.8 ? omenRumor('tavern') : vagueRumor('tavern');
        body = r ? `<p>「聞いたかい。」</p>${rumorLine(r)}<p class="sub">噂帳に書きとめた。本当かどうかは、行ってみないとわからない。</p>` : `<p>酔っぱらいの自慢話ばかりで、役に立つ話はなかった。</p>`;
      }
      advance(1);
      notices.push({ title: '🍺 酒場の噂', body });
      settle();
    },
    // 情報屋：町を指定して、値を聞く
    broker(d) {
      const t = d.t;
      if (!D.TOWNS[S.town].has.info || !D.TOWNS[t] || !inPlay(t) || t === S.town) return;
      if (S.gold < C.brokerCost) return toast('お金が足りない');
      const mine = [...new Set(Object.keys(D.TOWNS[S.town].stock).concat(Object.keys(S.cargo)))].filter((g) => !banned(t, g));
      const rest = Object.keys(D.GOODS).filter((g) => goodInPlay(g) && !banned(t, g) && !mine.includes(g)).sort((a, b) => (D.TOWNS[t].prices[b] || 1) - (D.TOWNS[t].prices[a] || 1));
      const goods = mine.concat(rest).slice(0, C.brokerGoods), got = [];
      for (const g of goods) { const r = priceRumor('broker', t, g); if (r) got.push(r); }
      if (!got.length) return toast('その町の話は、いまは無いそうだ');
      S.gold -= C.brokerCost;
      notices.push({ title: `🕵️ 情報屋：${D.TOWNS[t].name}の値`, body: got.map(rumorLine).join('') + `<p class="sub">「${DIST[S.town][t]}日ばかり前の話だ。そこは割り引いて聞いてくれ。」</p>` });
      settle();
    },
    // 情報屋：あいまいな噂の、伏せられた部分を確かめる
    clarify(d) {
      const r = S.rumors.find((x) => x.id === +d.id);
      if (!r || !r.hide || !D.TOWNS[S.town].has.info) return;
      if (S.gold < C.brokerCost) return toast('お金が足りない');
      S.gold -= C.brokerCost;
      const was = rumorText(r);
      r.hide = null; r.src = 'broker';
      if (!S.named[r.t]) { S.named[r.t] = true; if (!S.seen[r.t]) S.seen[r.t] = 1; }
      notices.push({ title: '🕵️ 情報屋', body: `<p class="sub">「${was.replace(/<[^>]+>/g, '')}」という話だが…</p><p>「それは<b>${D.TOWNS[r.t].name}</b>の<b>${D.GOODS[r.g].name}</b>の話だ。${r.ok ? 'たしかな筋から聞いている。' : '……ただ、出どころは怪しいな。'}」</p>` });
      settle();
    },
    guard(d) {
      if (+d.n > 0) {
        if (!D.TOWNS[S.town].has.guard) return toast('この町に口入れ屋はない');
        if (S.guards >= cartT().guards) return toast(cartT().guards ? `${cartT().name}では${cartT().guards}人まで` : '背負い籠では護衛を連れて歩けない');
        if (S.gold < C.guardHire) return toast('お金が足りない');
        S.gold -= C.guardHire; S.guards++;
      } else {
        if (S.guards <= 0) return toast('護衛がいない');
        S.guards--;
      }
      save(); render();
    },
    caravan(d) {
      const c = ensureCaravans(S.town)[+d.i];
      if (!c) return;
      if (S.gold < c.fee) return toast('お金が足りない');
      const to = other(D.ROADS[c.rid], S.town), wait = Math.max(0, c.leave - day());
      confirmBox(`🐫 ${townName(to)}行きの隊商`, `<p>参加費 ${G(c.fee)}。${wait > 0 ? wait + '日待ってから' : 'すぐに'}出発する。</p>` +
        `<p class="sub">待つあいだも宿代はかかる。</p>`, '加わる', () => {
          S.gold -= c.fee;
          S.caravans[S.town] = S.caravans[S.town].filter((x) => x !== c);
          if (wait > 0) advance(wait * 4 - (S.time % 4));
          if (S.dead) return gameOver();
          startTravel(c.rid, true);
        });
    },
    fix() {
      const cost = Math.ceil((100 - S.cart.hp) / 100 * cartT().price * 0.3);
      if (S.gold < cost) return toast('お金が足りない');
      S.gold -= cost; S.cart.hp = 100; save(); render();
    },
    buyCart(d) {
      const c = D.CARTS[d.id], cost = c.price - tradeIn();
      if (S.gold < cost) return toast('お金が足りない');
      if (cargoWeight() > c.cap) return toast('今の荷が積みきれない');
      confirmBox(`${c.name}を買う`, `<p>${c.desc}</p><p>積める重さ ${c.cap}kg　支払い ${G(Math.max(0, cost))}${c.feed ? `　餌代 1日${c.feed}枚` : ''}</p>`, '買う', () => {
        S.gold -= cost; S.cart = { type: d.id, hp: 100 }; S.guards = Math.min(S.guards, c.guards);
        settle(); toast(`${c.name}を手に入れた`);
      });
    },
    sellCart() {
      const tin = tradeIn(), c = cartT();
      if (S.cart.type === 'basket') return;
      if (cargoWeight() > D.CARTS.basket.cap) return toast(`荷が重すぎる（背負い籠は${D.CARTS.basket.cap}kgまで）`);
      confirmBox(`${c.name}を売る`, `<p>${G(tin)} で売り、背負い籠に戻る。護衛とも別れる。</p>`, '売る', () => {
        S.gold += tin; S.cart = { type: 'basket', hp: 100 }; S.guards = 0;
        settle();
      });
    },
    prepay() {
      const max = Math.floor(Math.min(S.gold, dueNow() - S.loan.pre));
      if (max <= 0) return;
      openQty({
        title: '返済ぶんを先に納める', max, unit: '枚', okLabel: '納める',
        calc: (q) => `返済日に取り立てられる額は ${fmt(owed() - q)}枚 に減る。`,
        ok: (q) => { S.gold -= q; S.loan.pre += q; settle(); }
      });
    },
    borrow() {
      const max = Math.max(0, Math.floor(C.tabLimit - S.debt));
      if (max <= 0) return toast('これ以上は貸してくれない');
      openQty({
        title: 'バルドから借りる', max, unit: '枚', okLabel: '借りる', init: Math.min(max, 50),
        calc: (q) => `次の返済日（${daysLeft()}日後）に、利子をつけて取り立てられる。<br><span class="sub">そのときの額はおよそ ${fmt((S.debt + q) * Math.pow(1 + C.tabInterest, daysLeft()))}枚</span>`,
        ok: (q) => { S.gold += q; S.debt += q; settle(); }
      });
    },
    repay() {
      const max = Math.floor(Math.min(S.gold, Math.ceil(S.debt)));
      if (max <= 0) return;
      openQty({
        title: 'ツケを返す', max, unit: '枚', okLabel: '返す',
        calc: (q) => `残りのツケ ${fmt(Math.max(0, S.debt - q))}枚`,
        ok: (q) => { S.gold -= q; S.debt = Math.max(0, +(S.debt - q).toFixed(2)); if (S.debt < 0.5) S.debt = 0; settle(); }
      });
    },
    mapBuy(d) {
      const full = d.k === 'full', cost = full ? C.mapFull : C.mapLocal;
      if (S.gold < cost) return toast('お金が足りない');
      let set = new Set([S.town]);
      for (let i = 0; i < (full ? 20 : 2); i++) for (const rid in D.ROADS) { const r = D.ROADS[rid]; if (roadUsable(rid) && (set.has(r.a) || set.has(r.b))) set = new Set([...set, r.a, r.b]); }
      let n = 0;
      for (const t of set) { if (!S.named[t]) n++; S.named[t] = true; if (!S.seen[t]) S.seen[t] = 1; }
      for (const rid in D.ROADS) { const r = D.ROADS[rid]; if (roadUsable(rid) && set.has(r.a) && set.has(r.b) && !S.roads[rid]) { S.roads[rid] = true; n++; } }
      if (!n) return toast('この地図に、知らないことは載っていない');
      S.gold -= cost;
      notices.push({ title: '🗺️ 地図を買った', body: `<p>${full ? '国じゅう' : 'このあたり'}の町と道を書き写した。</p>` });
      settle();
    },
    build(d) {
      const p = C.home[d.k];
      if (!p || S.home[d.k] || S.town !== C.startTown) return;
      if (S.gold < p.cost) return toast('お金が足りない');
      confirmBox(`${p.name}を村に贈る`, `<p>${p.desc}。</p><p>費用 ${G(p.cost)}</p>`, '建てる', () => {
        S.gold -= p.cost; S.home[d.k] = true;
        S.rep[S.town] = Math.min(100, S.rep[S.town] + p.rep);
        tell(d.k);
        settle();
      });
    },

    shopOpen() {
      const L = C.shop[1], t = S.town;
      if (S.shop || D.TOWNS[t].kind === 'village') return;
      if (S.rep[t] < L.rep) return toast(`この町の評判が足りない（${L.rep}必要）`);
      if (S.gold < L.cost) return toast('お金が足りない');
      confirmBox('露店を出す', `<p>${D.TOWNS[t].name}に露店を出す。費用 ${G(L.cost)}、場所代 1日${L.rent}枚。</p><p class="sub">この版では、店は1つだけ持てる。</p>`, '出す', () => {
        S.gold -= L.cost; S.shop = { town: t, lv: 1, stock: {}, till: 0 }; settle();
      });
    },
    shopUp() {
      const N = C.shop[2], t = S.town;
      if (!S.shop || S.shop.town !== t || S.shop.lv !== 1) return;
      if (S.rep[t] < N.rep) return toast(`この町の評判が足りない（${N.rep}必要）`);
      if (S.gold < N.cost) return toast('お金が足りない');
      confirmBox('小さな店に建て替える', `<p>費用 ${G(N.cost)}。店賃と店番で1日${N.rent + N.wage}枚。</p>`, '建て替える', () => { S.gold -= N.cost; S.shop.lv = 2; settle(); });
    },
    shopTake() {
      if (!S.shop || S.shop.town !== S.town || S.shop.till <= 0) return;
      const n = S.shop.till; S.gold += n; S.shop.till = 0;
      settle(); toast(`売上金 ${fmt(n)}枚 を受け取った`);
    },
    shopClose() {
      if (!S.shop || S.shop.town !== S.town) return;
      const v = closeValue();
      confirmBox('店をたたむ', `<p>店を手放し、${G(v)} を受け取る。評判はそのまま残る。</p>`, 'たたむ', () => { S.gold += v; S.shop = null; settle(); });
    },
    shopPut(d) {
      const g = d.g, sh = S.shop, own = S.cargo[g];
      if (!sh || sh.town !== S.town || !own) return;
      const L = C.shop[sh.lv];
      let units = 0; for (const k in sh.stock) units += sh.stock[k].qty;
      if (!sh.stock[g] && Object.keys(sh.stock).length >= L.kinds) return toast(`${L.name}に置けるのは${L.kinds}種まで`);
      const max = Math.min(own.qty, L.units - units);
      if (max <= 0) return toast('店がいっぱい');
      openQty({
        title: `${D.GOODS[g].name}を預ける`, max, okLabel: '預ける', unit: U(g),
        calc: () => `<span class="sub">${L.every === 1 ? '毎日' : L.every + '日に1度'}、${L.rate}個ずつ売れる</span>`,
        ok: (q) => {
          const avg = own.cost / own.qty, it = sh.stock[g] || (sh.stock[g] = { qty: 0, cost: 0, age: own.age });
          it.age = (it.age * it.qty + own.age * q) / (it.qty + q);
          it.qty += q; it.cost += avg * q;
          own.qty -= q; own.cost -= avg * q;
          if (own.qty <= 0) delete S.cargo[g];
          settle();
        }
      });
    },

    go(d) {
      if (travel || !S.roads[d.r] || !roadUsable(d.r)) return;
      const r = D.ROADS[d.r];
      if (r.a !== S.town && r.b !== S.town) return;
      if (roadClosed(d.r)) return toast('雪で閉じている。春まで通れない');
      startTravel(d.r, false);
    }
  };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.a];
    if (fn) fn(el.dataset);
  });

  // ---------- 道中 ----------
  function tlog(msg, cls) { travel.log.push(`<div class="${cls || ''}">${msg}</div>`); const el = $('#rlog'); if (el) el.innerHTML = travel.log.join(''); }
  function startTravel(rid, caravan) {
    const i = routeInfo(rid, caravan), r = i.r, cost0 = cargoCost();
    recordMemo(S.town);
    travel = { rid, from: S.town, to: i.to, days: i.days, caravan, frac: 0, log: [], queue: [], lost: 0, gold0: S.gold, cost0, band: null };
    // 自分で決める場面（多すぎると疲れるので、1回の旅に maxChoices まで）
    const choices = [];
    if (!caravan && i.days >= 3 && Math.random() < C.nightChance) choices.push('night');
    if (!caravan && i.days >= 3 && cargoCount() > 0 && (daysLeft() <= i.days || S.orders.concat(S.patrons).some((o) => o.due - day() <= i.days))) choices.push('hurry');
    if (S.rain && Math.random() < C.riverChance) choices.push('river');
    if (Math.random() < C.sideChance) choices.push('side');
    while (choices.length > C.maxChoices) choices.splice(Math.floor(Math.random() * choices.length), 1);
    for (const c of choices) travel.queue.push(c);
    // 山賊：先に気づければ、どうするか選べる
    if (Math.random() < banditChance(i.danger, caravan)) travel.queue.push(!caravan && Math.random() < Math.min(0.95, C.scout + 0.1 * S.guards) ? 'sign' : 'bandit');
    if (Math.random() < i.breakP) travel.queue.push('break');
    if (r.border) travel.queue.push('border');
    $('#tabs').classList.add('hidden');
    $('#main').innerHTML = `<h2>${townName(travel.from)} → ${townName(travel.to)}</h2><div class="mapwrap"><canvas id="map"></canvas></div>` +
      `<div class="card roadlog" id="rlog"></div>`;
    window.scrollTo(0, 0);
    tlog(`${caravan ? '隊商とともに' : D.ROAD_TYPES[r.type].name + 'を'}歩きだした。${i.days}日の道のり。${S.rain ? '雨が降っている。' : ''}`);
    renderHud(); drawMap($('#map'), false);
    walk(travel.queue.length ? 1 / (travel.queue.length + 1) : 1, nextEvent);
  }
  function walk(target, cb) {
    if (!travel) return;
    travel.frac = Math.min(target, travel.frac + 0.1);
    drawMap($('#map'), false);
    if (travel.frac >= target - 1e-9) return setTimeout(cb, C.stepMs);
    setTimeout(() => walk(target, cb), C.stepMs);
  }
  // 次の出来事へ。出来事のたびに、道を少し進む
  function nextEvent() {
    if (!travel) return;
    const ev = travel.queue.shift();
    if (!ev) return travel.frac >= 1 - 1e-9 ? arrive() : walk(1, arrive);
    const run = () => {
      if (ev === 'night') nightEvent(); else if (ev === 'hurry') hurryEvent(); else if (ev === 'river') riverEvent(); else if (ev === 'side') sideEvent();
      else if (ev === 'sign') signEvent(); else if (ev === 'bandit') banditEvent(); else if (ev === 'border') borderEvent(); else breakEvent();
    };
    const target = Math.min(0.92, travel.frac + (1 - travel.frac) / (travel.queue.length + 2));
    if (target > travel.frac + 0.05) walk(target, run); else run();
  }
  const next = () => { renderHud(); nextEvent(); };
  const cont = (label) => [{ label: label || '先へ進む', cls: 'pri', fn: next }];

  // 夜通し歩くか、宿をとるか
  function nightEvent() {
    modal({
      title: '🌙 日が暮れる',
      body: `<p>道ばたに宿の灯が見える。足はまだ動く。夜のうちに距離を稼げば、1日早く着ける。</p>` +
        `<p class="sub">夜道は山賊の時間だ。車輪も石を拾いやすい。</p>`,
      buttons: [
        { label: '🛏 宿をとる（予定どおり）', cls: 'pri', fn: () => { tlog('🛏 宿で夜を明かした。'); next(); } },
        {
          label: '🌙 夜通し歩く（1日早く着く）', fn: () => {
            travel.days = Math.max(1, travel.days - 1); tlog('🌙 夜通し歩いた。1日縮めた。', 'good');
            const info = routeInfo(travel.rid);
            if (!travel.queue.includes('bandit') && !travel.queue.includes('sign') && Math.random() < banditChance(info.danger, false) * C.nightBandit + 0.04) travel.queue.unshift('bandit');
            if (!travel.queue.includes('break') && Math.random() < info.breakP * 0.6) travel.queue.push('break');
            next();
          }
        }
      ]
    });
  }
  // 荷を捨てて急ぐか
  function hurryEvent() {
    const left = daysLeft(), why = left <= travel.days ? `返済日まで、あと${left}日。` : '約束の日が迫っている。';
    modal({
      title: '⏳ 間に合うか',
      body: `<p>${why}このままの足では、着くのは${travel.days}日後だ。荷を軽くすれば、1日縮められる。</p>` +
        `<p class="sub">捨てるのは荷の${Math.round(C.hurryDump * 10)}割。</p>`,
      buttons: [
        { label: 'このまま進む', cls: 'pri', fn: () => { tlog('荷は捨てなかった。'); next(); } },
        { label: `📦 荷を${Math.round(C.hurryDump * 10)}割捨てて急ぐ（1日早く着く）`, fn: () => { const n = loseCargo(C.hurryDump); travel.days = Math.max(1, travel.days - 1); tlog(`📦 荷 ${n}個を道ばたに置き、先を急いだ。`, 'bad'); next(); } }
      ]
    });
  }
  // 川の増水
  function riverEvent() {
    const wait = rndi(1, 2);
    modal({
      title: '🌊 川が増水している',
      body: `<p>雨で川がふくれ、浅瀬が見えない。濁った水が、渡し場の杭を洗っている。</p>` +
        `<p class="sub">無理に渡れば、荷を流されるかもしれない。</p>`,
      buttons: [
        { label: '🌉 上流の橋へ回る（+1日）', cls: 'pri', fn: () => { travel.days += 1; tlog('🌉 上流の橋まで回り道をした。1日遅れた。'); next(); } },
        { label: `⏳ 水が引くのを待つ（+1〜2日）`, fn: () => { travel.days += wait; tlog(`⏳ 水が引くまで ${wait}日待った。`); next(); } },
        {
          label: `🌊 このまま渡る（荷を流される恐れ）`, fn: () => {
            if (Math.random() < C.riverFail) {
              const n = loseCargo(C.riverLoss); tlog(`🌊 流れに足を取られ、荷 ${n}個を流された。`, 'bad');
              modal({ title: '流された', body: `<p class="bad">腰まで水に浸かったところで、荷がひとつ、またひとつと流れていった。${n}個を失った。</p>`, buttons: cont() });
            } else { tlog('🌊 増水した川を渡りきった。', 'good'); modal({ title: '渡りきった', body: '<p class="good">息を詰めて、ひと足ずつ。向こう岸に上がったとき、膝が笑っていた。</p>', buttons: cont() }); }
          }
        }
      ]
    });
  }
  // 道ばたで人に会う
  function sideEvent() {
    modal({
      title: '🧭 道ばたの旅人',
      body: `<p>車輪の外れた荷車のそばで、旅の商人が途方に暮れている。手を貸せば半日はつぶれる。</p>`,
      buttons: [
        { label: '通り過ぎる', cls: 'pri', fn: () => { tlog('旅人に会ったが、先を急いだ。'); next(); } },
        {
          label: '🤝 手を貸す（+1日）', fn: () => {
            travel.days += 1; S.rep[travel.to] = Math.min(100, S.rep[travel.to] + 2);
            const keep = S.town; S.town = travel.to;               // 行き先の町から見た噂として聞く
            const g = Object.keys(S.cargo).filter((k) => !banned(travel.to, k));
            const r = g.length ? priceRumor('traveler', travel.to, pick(g)) : randomPrice('traveler');
            S.town = keep;
            tlog('🤝 旅の商人に手を貸した。1日遅れた。');
            modal({ title: '礼の話', body: `<p>「助かった。礼に、耳よりな話を。昨日、向こうの町を出てきたところでね。」</p>${r ? rumorLine(r) : ''}<p class="sub">行き先の町での評判も少し上がった。</p>`, buttons: cont() });
          }
        }
      ]
    });
  }
  // 山賊の予兆。先に気づいたので、どうするか選べる
  function rollBand() {
    const info = routeInfo(travel.rid), worth = cargoWorth();
    const big = Math.random() < clamp(0.2 + worth / 1500 + (info.danger >= 3 ? 0.2 : 0), 0, 0.8);
    const B = C.bandits[big ? 'gang' : 'thief'];
    travel.band = { big, ep: rnd(B.min, B.max) };
  }
  function signEvent() {
    rollBand();
    const big = travel.band.big;
    modal({
      title: '👣 道に足跡',
      body: `<p>${big ? '踏み荒らされた草。足跡は多い。尾根の向こうに、焚き火の煙が上がっている。<b>山賊団</b>らしい。' : '藪の枝が折れている。足跡はひとり分。<b>こそ泥</b>が待ち伏せているようだ。'}</p>` +
        `<p class="sub">まだ気づかれていない。こちらの力 ${power(false)}（護衛${S.guards}人）。荷の値打ち ${fmt(cargoWorth())}枚。</p>`,
      buttons: [
        {
          label: '↩️ 迂回する（+1日）', cls: 'pri', fn: () => {
            travel.days += 1;
            if (Math.random() < C.detourMeet) { tlog('↩️ 迂回したが、見張りに見つかった。', 'bad'); return banditEvent(); }
            tlog('↩️ 遠回りして、山賊をかわした。1日遅れた。', 'good'); travel.band = null;
            modal({ title: 'かわした', body: '<p class="good">獣道を大きく回り、気づかれずに抜けた。1日余計にかかった。</p>', buttons: cont() });
          }
        },
        {
          label: '🌿 身をひそめて、やり過ごす', fn: () => {
            if (Math.random() < C.hideOk) {
              tlog('🌿 藪にひそみ、山賊をやり過ごした。', 'good'); travel.band = null;
              modal({ title: 'やり過ごした', body: '<p class="good">息を殺して待つ。足音が近づき、遠ざかった。</p>', buttons: cont() });
            } else { tlog('🌿 ひそんだが、見つかった。', 'bad'); travel.ambush = true; banditEvent(); }
          }
        },
        { label: '⚔️ そのまま進む', fn: () => banditEvent() }
      ]
    });
  }
  function banditEvent() {
    if (!travel.band) rollBand();
    const worth = cargoWorth(), big = travel.band.big;
    const B = C.bandits[big ? 'gang' : 'thief'], ep = travel.band.ep, pp = power(travel.caravan);
    const after = () => { travel.band = null; renderHud(); tell('firstBandit'); nextEvent(); };
    const done = (label) => [{ label: label || '先へ進む', cls: 'pri', fn: after }];
    if (S.gold < 1 && cargoCount() === 0) {
      tlog(`${B.name}に囲まれたが、取るものが何もなかった。`);
      return modal({ title: `🗡️ ${B.name}`, body: '<p>囲まれたが、荷は空、財布も空。あきれ顔で去っていった。</p>', buttons: done() });
    }
    const prob0 = (pp * pp) / (pp * pp + ep * ep), prob = travel.ambush ? prob0 * 0.8 : prob0;
    const odds = prob > 0.66 ? '<span class="good">有利</span>' : prob > 0.4 ? '五分五分' : '<span class="bad">不利</span>';
    const flee = travel.caravan ? 0 : cartT().flee, toll = Math.ceil(B.tollBase + worth * B.tollRate);
    const fightIt = (p) => fight(p, B, done);
    const btns = [{ label: '⚔️ 戦う', cls: 'pri', fn: () => fightIt(prob) }];
    if (!travel.caravan) btns.push({
      label: `💨 逃げる（成功率 ${Math.round(flee * 100)}%）`, fn: () => {
        if (Math.random() < flee) { tlog(`💨 ${B.name}から逃げ切った。`, 'good'); modal({ title: '逃げ切った', body: '<p>息が切れるまで走り、どうにか振り切った。</p>', buttons: done() }); }
        else modal({ title: '追いつかれた', body: '<p>逃げ切れない。背を向けたまま、不利な体勢で戦うしかない。</p>', buttons: [{ label: '⚔️ 応戦する', cls: 'pri', fn: () => fightIt(prob * 0.7) }] });
      }
    });
    if (S.gold >= toll) btns.push({
      label: `💰 通行料を払う（${toll}枚）`, fn: () => {
        S.gold -= toll; tlog(`💰 ${B.name}に通行料 ${toll}枚 を払った。`);
        modal({ title: '見逃してもらった', body: `<p>${G(toll)} を渡すと、道をあけた。</p>`, buttons: done() });
      }
    });
    if (cargoCount() > 0) btns.push({
      label: `📦 荷の${Math.round(B.take * 10)}割を渡す`, fn: () => {
        const n = loseCargo(B.take); tlog(`📦 ${B.name}に荷 ${n}個 を渡した。`, 'bad');
        modal({ title: '見逃してもらった', body: `<p>荷 ${n}個を置いていくと、道をあけた。</p>`, buttons: done() });
      }
    });
    modal({
      title: `🗡️ ${B.name}だ！`,
      body: `<p>${big ? '道の両側から、武器を持った男たちが現れた。' : '木陰から、刃物を持った男が飛び出してきた。'}` +
        `${worth >= C.banditValueRef ? '荷の値打ちを、どこかで嗅ぎつけたらしい。' : ''}</p>` +
        `<p>こちらの力 <b>${pp}</b>（${travel.caravan ? '隊商の護衛つき' : '護衛' + S.guards + '人'}）<br>見立て：${odds}</p>` +
        `<p class="sub">荷の値打ち ${fmt(worth)}枚。要求は値打ちに応じて上がる。</p>`,
      buttons: btns
    });
  }
  function fight(prob, B, done) {
    const win = Math.random() < prob;
    modal({ title: '⚔️ 斬り合い', body: `<canvas id="fight"></canvas><p class="sub" style="text-align:center">砂ぼこりが舞う…</p>` });
    playFight($('#fight'), win, () => {
      let body;
      if (win) {
        const loot = rndi(B.loot[0], B.loot[1]);
        S.gold += loot; S.stats.wins++; S.rep[travel.to] = Math.min(100, S.rep[travel.to] + 2);
        body = `<p class="good">${B.name}を追い払った！</p><p>落としていった財布から ${G(loot)}。行く先の町で評判になるだろう。</p>`;
        tlog(`⚔️ ${B.name}を追い払った。+${loot}枚`, 'good');
      } else {
        // こそ泥に負けても、取られるのは一部。山賊団に負けると、ごっそり持っていかれる
        const lost = loseCargo(B.loseCargo), gold = Math.floor(S.gold * B.loseGold);
        S.gold -= gold; S.stats.robbed++;
        if (S.cart.type !== 'basket') S.cart.hp = Math.max(5, S.cart.hp - 30);
        let g2 = '';
        if (S.guards > 0 && Math.random() < 0.5) { S.guards--; g2 = '護衛が1人、逃げ出した。'; }
        body = `<p class="bad">${B.name}に負けた…</p><p>荷 ${lost}個と ${G(gold)} を奪われた。${g2}</p>`;
        tlog(`⚔️ ${B.name}に負け、荷と金を奪われた。`, 'bad');
      }
      renderHud();
      modal({ title: win ? '勝った！' : '負けた…', body, buttons: done() });
    });
  }
  function breakEvent() {
    const c = cartT();
    travel.days += 1;
    const dump = () => {
      const n = loseCargo(0.4); S.cart.hp = Math.max(5, S.cart.hp - 20);
      tlog(`🔧 ${c.name}が壊れ、荷 ${n}個 を捨てた。1日遅れた。`, 'bad');
      modal({ title: '荷を捨てた', body: `<p>軽くするしかない。荷 ${n}個を道ばたに置き、だましだまし進む。</p>`, buttons: cont() });
    };
    const btns = [];
    if (S.gold >= c.repair) btns.push({ label: `🔧 直してもらう（${c.repair}枚）`, cls: 'pri', fn: () => { S.gold -= c.repair; tlog(`🔧 ${c.name}が壊れ、${c.repair}枚 で直した。1日遅れた。`); next(); } });
    if (cargoCount() > 0) btns.push({ label: '📦 荷を4割捨てて進む', fn: dump });
    if (!btns.length) btns.push({ label: 'だましだまし進む', cls: 'pri', fn: () => { S.cart.hp = Math.max(5, S.cart.hp - 20); tlog(`🔧 ${c.name}が壊れた。1日遅れた。`, 'bad'); next(); } });
    modal({
      title: '🔧 車が壊れた',
      body: `<p>${S.rain ? 'ぬかるみに車輪を取られ、' : '石に乗り上げ、'}${c.name}の車輪が割れた。1日の遅れ。</p>` +
        `<p class="sub">通りがかりの職人に直してもらうか、荷を減らして進むか。</p>`,
      buttons: btns
    });
  }
  // 国境の関所：関税と、禁制品の検査（そのまま通るか、袖の下か）
  function borderEvent() {
    const hasPass = !!S.pass.border, tax = tariff(travel.rid), cw = contraWorth();
    let head = `<p>国境の関所だ。槍を持った兵が、荷車をひとつずつ止めている。</p>`;
    if (tax) { const s = pay(tax); head += `<p>荷の値打ち ${fmt(cargoWorth())}枚に対し、関税 ${G(tax)} を払った${hasPass ? '（通行手形で半分）' : ''}。${s ? `<span class="bad">足りない ${fmt(s)}枚はツケになった。</span>` : ''}</p>`; }
    else head += `<p>荷がないので、関税はかからない。</p>`;
    tlog(`🏯 国境の関所を通った（関税 ${tax}枚）。`);
    renderHud();
    if (!cw) return modal({ title: '🏯 国境の関所', body: head, buttons: cont() });
    const inspect = (p, bribed) => {
      if (Math.random() < p) {
        const n = dropContraband(), fine = Math.ceil(cw * C.fineRate), s = pay(fine);
        S.rep.oto = Math.max(0, S.rep.oto - 8);
        tlog('🚫 関所で禁制品を没収された。', 'bad');
        modal({
          title: '🚫 見つかった',
          body: `<p class="bad">${bribed ? '役人は金を受け取ったうえで、荷の底をあらためた。' : '荷の底の包みを、役人の手が探り当てた。'}</p>` +
            `<p>禁制品 ${n}個を没収され、罰金 ${G(fine)}。${s ? 'ツケになった。' : ''}王都での評判も落ちた。</p>`, buttons: cont()
        });
      } else {
        tlog(bribed ? '🤝 袖の下で関所を通った。' : '😮‍💨 禁制品は見つからなかった。', 'good');
        modal({ title: '通してもらえた', body: `<p class="good">${bribed ? '役人は銅貨を袖にしまい、あごで先を示した。' : '役人は荷の上をひと撫でしただけで、手を振った。'}</p>`, buttons: cont() });
      }
    };
    const bribe = Math.ceil(cw * C.bribeRate + C.bribeBase), base = hasPass ? C.abroad.findPass : C.abroad.find;
    const btns = [{ label: `そのまま通る（見つかる 約${Math.round(base * 100)}%）`, cls: 'pri', fn: () => inspect(base, false) }];
    if (S.gold >= bribe) btns.push({ label: `🤝 袖の下を渡す（${bribe}枚）`, fn: () => { S.gold -= bribe; renderHud(); inspect(C.bribeFind, true); } });
    modal({
      title: '🏯 国境の関所',
      body: head + `<p class="bad">荷の底には禁制品（値打ち ${fmt(cw)}枚）。見つかれば没収のうえ、罰金 ${fmt(Math.ceil(cw * C.fineRate))}枚。</p>`,
      buttons: btns
    });
  }
  function arrive() {
    const t = travel, T = D.TOWNS[t.to], type = D.ROADS[t.rid].type;
    S.town = t.to;
    if (S.cart.type !== 'basket') S.cart.hp = Math.max(5, S.cart.hp - rnd(2, 5) * (type === 'road' ? 1 : 2));
    advance(t.days * 4 - (S.time % 4));   // 着くのは朝
    if (S.dead) { travel = null; return gameOver(); }
    const first = discover(t.to);
    let body = `<p>${t.days}日かけて着いた。${first ? '<b class="good">はじめて訪れる町だ。地図に書きこんだ。</b>' : ''}</p>` + t.log.slice(1).join('');
    if (t.to === 'oto') {  // 王都の門：荷車の大きさで決まる入市税と、禁制品のあらため
      const fee = cartT().gate;
      if (fee) { const s = pay(fee); body += `<p>門で入市税 ${G(fee)} を払った。${s ? `<span class="bad">足りない ${fmt(s)}枚はツケになった。</span>` : ''}</p>`; }
      const cw = contraWorth();
      if (cw && Math.random() < C.cityFind) {
        const n = dropContraband(), fine = Math.ceil(cw * C.fineRate);
        pay(fine); S.rep[t.to] = Math.max(0, S.rep[t.to] - 10);
        body += `<p class="bad">門番に禁制品を見つけられた。${n}個を没収され、罰金 ${fmt(fine)}枚。評判も落ちた。</p>`;
      }
    }
    body += `<p class="sub">町の人の声：「おや、${callName(t.to)}。」</p>`;
    S.stats.trips++;
    const R = cargoCount() ? buildReveal(t.to, t) : null;
    travel = null; ui = { tab: 'market', dest: null };
    recordMemo(S.town);
    const heard = hearStreet(S.town);
    if (trusted(S.town)) { const r = randomPrice('patron'); if (r) heard.push(r); }
    if (heard.length) body += `<div class="card"><div class="name">👂 町で耳に入った噂</div>${heard.map(rumorLine).join('')}</div>`;
    notices.push({ title: `🚩 ${T.name}に着いた`, body, label: R ? '市場の値を見る' : '町に入る' });
    if (R) notices.push({ reveal: R });
    if (S.stats.trips === 1) tell('firstTrip');
    if (first) tell(t.to);
    window.scrollTo(0, 0);
    settle();
  }

  // 斬り合いの演出（勝ち負けは先に決まっていて、ここでは見せるだけ）
  function playFight(cv, win, cb) {
    const w = cv.clientWidth || 300, dpr = Math.min(window.devicePixelRatio || 1, 2), H = 150;
    cv.style.height = H + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(H * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const gy = H * 0.72, DUR = 2.6, mine = 1 + Math.min(4, S.guards + (travel && travel.caravan ? 3 : 0)), foes = travel && travel.band && !travel.band.big ? 1 : 3;
    const man = (x, y, col, lean, down) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(down ? (lean > 0 ? -1.4 : 1.4) : lean * 0.12);
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(0, -6); ctx.lineTo(-5, 4); ctx.moveTo(0, -6); ctx.lineTo(5, 4);
      ctx.moveTo(0, -18); ctx.lineTo(lean * 10, -24); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -27, 5, 0, 7); ctx.fill();
      ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lean * 10, -24); ctx.lineTo(lean * 20, -34); ctx.stroke();
      ctx.restore();
    };
    let start = null;
    function frame(ts) {
      if (!cv.isConnected) return;
      if (start === null) start = ts;
      const t = (ts - start) / 1000, end = t > 2.0;
      ctx.fillStyle = '#d9c79a'; ctx.fillRect(0, 0, w, H);
      ctx.fillStyle = '#8a7446'; ctx.fillRect(0, gy + 4, w, H);
      const rush = Math.min(1, t / 0.7), clash = Math.sin(t * 14) * 4 * (end ? 0 : 1);
      for (let i = 0; i < mine; i++) man(w * 0.12 + i * 16 + rush * w * 0.2 + clash, gy - (i % 2) * 6, i ? '#2f5d8a' : '#7a4a22', 1, end && !win);
      for (let i = 0; i < foes; i++) man(w * 0.88 - i * 16 - rush * w * 0.2 - clash, gy - (i % 2) * 6, '#2a2a2a', -1, end && win);
      if (t > 0.7 && !end) for (let i = 0; i < 5; i++) {
        ctx.fillStyle = `rgba(250,240,210,${0.5 - i * 0.08})`;
        ctx.beginPath(); ctx.arc(w / 2 + Math.sin(t * 9 + i * 2) * 26, gy - 14 + Math.cos(t * 7 + i) * 12, 6 + i * 2, 0, 7); ctx.fill();
      }
      if (t < DUR) requestAnimationFrame(frame); else cb();
    }
    requestAnimationFrame(frame);
  }

  // ---------- 起動 ----------
  const hadSave = load();
  if (!hadSave) { newGame(); save(); }
  render();
  if (!hadSave) intro();
  let rsT = 0;
  window.addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(() => { if (travel) drawMap($('#map'), false); else render(); }, 200); });

  // 動作確認用（テストやコンソールから中をのぞける）
  window.__shokai = {
    get state() { return S; }, get travel() { return travel; },
    routeInfo, roadsFrom, neighbors, roadUsable, roadClosed, buyNow, sellNow, mult, maxBuy, stockMax, offersOf, banditChance, tariff,
    priceRumor, omenRumor, vagueRumor, randomPrice, hearStreet, rumorErr, rumorText, rumorsAbout, lagged,
    seasonOf, seasonDay, seasonMods, eventMult, upcoming, callName, patronOf, trusted, patronReady, homeBonus, records, checkAbroad,
    dailyCost, advance, settle, stage, power, fresh, sellsHere, banned, cargoCount, cargoWeight, freeWeight, cargoWorth, contraWorth, cargoCost,
    owed, daysLeft, dueNow, loanLeft, tradeIn, inPlay, DIST, SAVE_KEY, REC_KEY
  };
})();
