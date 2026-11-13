// 背負い籠の商会（第5版）：ゲーム本体。数値やデータは js/data/ のファイルにある。
(function () {
  'use strict';

  const D = window.SHOKAI, C = D.CONFIG, CAL = D.CALENDAR, ST = D.STATS;
  const SAVE_KEY = 'shokai-save-v5';      // この版の保存場所
  const OLD_KEY = 'shokai-save-v4';       // 前の版。あれば引き継ぐ（消さない）。それより古い版は読まない
  const REC_KEY = 'shokai-records';       // 商人録（歴代の記録）。破産しても残る
  const SAVE_VERSION = 5;
  const QN = ['朝', '昼', '夕', '夜'];
  const KIND = { village: '村', town: '町', capital: '都', port: '港町' };
  const DANGER = ['安全', 'やや危険', '危険', 'とても危険'];
  const SRC = { street: '町の声', tavern: '酒場', traveler: '旅人', patron: '得意先', broker: '情報屋' };
  const STARS = { street: '★', tavern: '★★', traveler: '★★', patron: '★★★', broker: '★★★' };
  const STAT_KEYS = Object.keys(ST);

  let S = null;
  let ui = { tab: 'market', dest: null, insure: false };
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
  const isNight = () => S.time % 4 === 3;
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
    toast.tm = setTimeout(() => t.classList.add('hidden'), 2000);
  }
  // 町と町のあいだの最短日数。types に道の種類を渡すと、その種類の道だけで数える
  function distTable(types) {
    const ids = Object.keys(D.TOWNS), d = {};
    for (const a of ids) { d[a] = {}; for (const b of ids) d[a][b] = a === b ? 0 : 999; }
    for (const rid in D.ROADS) { const r = D.ROADS[rid]; if (types && !types.includes(r.type)) continue; d[r.a][r.b] = d[r.b][r.a] = Math.min(d[r.a][r.b], r.len); }
    for (const k of ids) for (const a of ids) for (const b of ids) if (d[a][k] + d[k][b] < d[a][b]) d[a][b] = d[a][k] + d[k][b];
    return d;
  }
  const DIST = distTable(null);                  // 近道もふくめた道のり（噂の届く早さなど）
  const PD = distTable(['road', 'trail']);       // 荷を運ぶふつうの道のり（値段の差を決める）

  // ---------- 値段の土台：産地からの道のりで決まる ----------
  // BASE[町][品] = 基本の倍率、SRCD[町][品] = いちばん近い産地までの日数（産地なら0）
  const BASE = {}, SRCD = {};
  (function () {
    for (const t in D.TOWNS) {
      BASE[t] = {}; SRCD[t] = {};
      for (const g in D.GOODS) {
        const T = D.TOWNS[t];
        if (T.stock[g] != null) { BASE[t][g] = T.prices[g]; SRCD[t][g] = 0; continue; }
        const src = Object.keys(D.TOWNS).filter((p) => D.TOWNS[p].stock[g] != null);
        const d = Math.min.apply(null, src.map((p) => PD[t][p])), cv = C.priceCurve[D.GOODS[g].cls];
        const m = Math.min(cv.cap, cv.near + cv.per * Math.max(0, d - 2)) * ((T.wants && T.wants[g]) || 1);
        BASE[t][g] = +m.toFixed(3); SRCD[t][g] = d;
      }
    }
  })();
  const baseMult = (t, g) => BASE[t][g];
  // 産地に近い町ほど、その品の市場は薄い（少し売りこむだけで値が崩れる）
  function nearDepth(t, g) {
    const d = SRCD[t][g];
    if (d === 0) return 1;
    for (const [lim, f] of C.nearDepth) if (d <= lim) return f;
    return 1;
  }

  // ---------- 暦 ----------
  const seasonOf = (d) => CAL.seasons[Math.floor((d % CAL.yearDays) / 30)];
  const seasonDay = (d) => d % 30;
  const dateStr = () => `${seasonOf(day()).icon}${seasonOf(day()).name}${seasonDay(day()) + 1}日`;
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

  // ---------- 物語・旅日記 ----------
  function tell(key, vars) {
    const sc = D.STORY[key];
    if (!sc || S.told[key]) return false;
    S.told[key] = 1;
    const fill = (s) => s.replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));
    notices.push({ title: '📖 ' + fill(sc.title), body: sc.text.map((p) => `<p class="story">${fill(p)}</p>`).join(''), label: sc.label });
    return true;
  }
  // 旅日記に一行書く（その一代の出来事。商人録にも残る）
  function addDiary(text) {
    S.diary.push({ d: day() + 1, s: seasonOf(day()).name, t: text });
    if (S.diary.length > 80) S.diary.shift();
  }

  // ---------- 商人の能力 ----------
  // 候補を作る。各1〜5、合計15。配分だけがランダム
  function genCand(used) {
    const st = {}; for (const k of STAT_KEYS) st[k] = 1;
    let left = 15 - STAT_KEYS.length, guard = 0;
    while (left > 0 && guard++ < 500) { const k = pick(STAT_KEYS); if (st[k] < 5) { st[k]++; left--; } }
    const top = STAT_KEYS.slice().sort((a, b) => st[b] - st[a])[0];
    let name = pick(D.NAMES), g2 = 0;
    while (used.includes(name) && g2++ < 30) name = pick(D.NAMES);
    used.push(name);
    return { name, nick: ST[top].nick, top, st };
  }
  const buddy = () => (S.buddy ? D.COMPANIONS[S.buddy] : null);
  // いまの能力（生まれつき ＋ 伸びたぶん ＋ 道連れの助け）
  function eff(k) {
    if (!S.me) return 3;
    let v = S.me.st[k] + (S.me.up[k] ? 1 : 0);
    const b = buddy();
    if (b && b.stat === k) v += C.buddyBonus;
    return clamp(v, 1, 7);
  }
  const sd = (k) => eff(k) - 3;                 // 基準（3）との差
  // 能力を使った回数を数え、決まった回数に届いたら +1 伸びる
  function useStat(k, n) {
    if (!S.me || S.me.up[k]) return;
    S.me.use[k] = (S.me.use[k] || 0) + (n == null ? 1 : n);
    if (S.me.use[k] < C.grow[k]) return;
    S.me.up[k] = true;
    notices.push({ title: `✨ ${ST[k].name}が上がった`, body: `<p>${ST[k].grow}を重ねるうちに、${ST[k].name}が ${S.me.st[k]} から <b>${S.me.st[k] + 1}</b> になった。</p><p class="sub">${ST[k].does}。</p>`, label: 'よし' });
    addDiary(`${ST[k].name}が上がった。`);
  }
  const hit = (k, msg) => `<span class="hit">${ST[k].icon}${ST[k].name}：${msg}</span>`;   // 能力が効いたときの一言
  const capNow = () => cartT().cap + (S.cart.type === 'basket' ? C.stat.bodyKg * sd('body') : 0);
  const selfPower = () => Math.max(1, C.selfPower + C.stat.armPower * sd('arm'));
  const fleeChance = () => clamp(cartT().flee + C.stat.armFlee * sd('arm'), 0.05, 0.95);
  const fullName = () => (S.me ? `${S.me.nick}${S.me.name}` : '名もなき商人');

  // ---------- セーブ・商人録 ----------
  function blankState() {
    return {
      v: SAVE_VERSION, time: 0, gold: C.startGold, town: C.startTown,
      me: null, cands: null, diff: 'normal',
      cart: { type: 'basket', hp: 100 }, guards: 0, buddy: null, cargo: {}, store: {},
      market: {}, drift: {}, stock: {}, hist: {},
      seen: {}, named: {}, roads: {}, rep: {}, memo: {}, pass: {}, abroad: false,
      debt: 0, loan: { n: 0, pre: 0, cycle: 0, done: false }, shop: null, home: {},
      trends: [], rumors: [], rid: 0, hot: {}, hotKnown: {}, caravans: {}, offers: {}, orders: [], done: {}, patrons: [], told: {},
      boss: null, bossNext: C.boss.first, bossN: 0, safe: {}, diary: [], visit: { profit: 0, spent: 0, lost: 0 }, warned: -1,
      rain: false, stageMax: 1, dead: false, stats: { trips: 0, wins: 0, robbed: 0, profit: 0, orders: 0, supplies: 0, bestTrip: 0, bosses: 0 }
    };
  }
  function newGame() {
    S = blankState();
    const used = []; S.cands = [genCand(used), genCand(used), genCand(used)];
    fillMissing();
    discover(S.town);
    recordMemo(S.town);
    hearStreet(S.town);
  }
  function fillMissing() {
    const B = blankState();
    for (const k in B) if (S[k] === undefined) S[k] = B[k];
    for (const k in B.stats) if (S.stats[k] === undefined) S.stats[k] = B.stats[k];
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
    if (!C.diff[S.diff]) S.diff = 'normal';
    for (const p of S.patrons) { if (p.lv == null) p.lv = 0; if (p.n0 == null) p.n0 = p.n; }
  }
  // 前の版（v4）のセーブを、この版の形に直す。お金・荷・地図・評判・借金などはそのまま引き継ぐ
  function migrate(o) {
    if (o.v !== 4) return null;
    o.v = SAVE_VERSION;
    const st = {}; for (const k of STAT_KEYS) st[k] = 3;
    o.me = { name: 'ハシバミの子', nick: '', top: 'talk', st, use: {}, up: {}, gen: records().length + 1 };   // 能力は、すべて基準（3）にする
    o.cands = null; o.diff = 'normal';
    o.bossNext = Math.floor(o.time / 4) + 10;
    o.diary = [{ d: Math.floor(o.time / 4) + 1, s: '', t: '前の版の帳簿を引き継いだ。' }];
    return o;
  }
  function save() {
    if (!S || S.dead) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* 保存できない環境でも遊べる */ }
  }
  function wipeSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 無視 */ } }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && o.v === SAVE_VERSION && !o.dead) { S = o; fillMissing(); return 'ok'; }
        return '';
      }
      const old = localStorage.getItem(OLD_KEY);          // この版のセーブが無く、前の版のがあれば引き継ぐ
      if (old) {
        const o = migrate(JSON.parse(old));
        if (o && !o.dead) { S = o; fillMissing(); save(); return 'moved'; }
      }
    } catch (e) { /* 壊れていたら新しく始める */ }
    return '';
  }
  function records() { try { return JSON.parse(localStorage.getItem(REC_KEY) || '[]') || []; } catch (e) { return []; } }
  function addRecord(result) {
    const list = records();
    list.unshift({
      result, gen: S.me ? S.me.gen : list.length + 1, who: fullName(), st: S.me ? STAT_KEYS.map((k) => S.me.st[k] + (S.me.up[k] ? 1 : 0)) : null,
      diff: C.diff[S.diff].name, day: day() + 1, paid: S.loan.n, cart: cartT().name, shop: S.shop ? C.shop[S.shop.lv].name : 'なし',
      towns: Object.keys(S.seen).filter((t) => S.seen[t] === 2).length, best: Math.round(S.stats.bestTrip), abroad: !!S.abroad,
      diary: S.diary.slice(-8).map((x) => `${x.d}日目 ${x.t}`)
    });
    try { localStorage.setItem(REC_KEY, JSON.stringify(list.slice(0, 12))); } catch (e) { /* 無視 */ }
  }

  // ---------- 荷 ----------
  function cargoWeight() { let n = 0; for (const g in S.cargo) n += S.cargo[g].qty * D.GOODS[g].w; return n; }
  function cargoCount() { let n = 0; for (const g in S.cargo) n += S.cargo[g].qty; return n; }
  function cargoCost() { let n = 0; for (const g in S.cargo) n += S.cargo[g].cost; return n; }
  function freeWeight() { return Math.max(0, capNow() - cargoWeight()); }
  function cargoWorth() { let v = 0; for (const g in S.cargo) v += S.cargo[g].qty * D.GOODS[g].base; return v; }
  function contraWorth() { let v = 0; for (const g in S.cargo) if (D.CONTRABAND.includes(g)) v += S.cargo[g].qty * D.GOODS[g].base; return v; }
  function fresh(g, age) {
    const sh = D.GOODS[g].shelf;
    if (!sh || age <= sh * 0.4) return 1;
    return Math.max(0.15, 1 - (age - sh * 0.4) / (sh * 0.6) * 0.85);
  }
  function takeUnits(g, k, ins) {
    const c = S.cargo[g], cost = (c.cost / c.qty) * k;
    c.cost -= cost; c.qty -= k;
    if (travel) { travel.lost += cost; if (ins && travel.insured) travel.insLost += cost; }
    else if (S.visit) S.visit.lost += cost;
    if (c.qty <= 0) delete S.cargo[g];
  }
  // 荷の frac（割合）を失ったときに、何個になるか。全体の個数で四捨五入する（0のこともある）
  const lossUnits = (frac) => Math.round(cargoCount() * frac);
  // 荷を frac だけ失う。全体の個数で数え、品ごとには持っている数に応じて割りふる
  // （1つしかない品が、3割のはずなのに丸ごと消える、ということが起きないようにする）
  function loseCargo(frac, ins) {
    const total = cargoCount(), T = Math.min(total, lossUnits(frac));
    if (T <= 0) return 0;
    const ks = Object.keys(S.cargo), part = ks.map((g) => ({ g, x: S.cargo[g].qty * T / total }));
    let left = T;
    for (const p of part) { p.k = Math.floor(p.x); left -= p.k; }
    part.slice().sort((a, b) => (b.x - b.k) - (a.x - a.k) || S.cargo[b.g].qty - S.cargo[a.g].qty).forEach((p) => { if (left > 0 && p.k < S.cargo[p.g].qty) { p.k++; left--; } });
    for (const p of part) if (p.k > 0) takeUnits(p.g, p.k, ins);
    return T;
  }
  function dropContraband() {
    let n = 0;
    for (const g of Object.keys(S.cargo)) if (D.CONTRABAND.includes(g)) { n += S.cargo[g].qty; takeUnits(g, S.cargo[g].qty, false); }
    return n;
  }
  function addCargo(g, q, cost, age) {
    const c = S.cargo[g] || (S.cargo[g] = { qty: 0, cost: 0, age: 0 });
    c.age = (c.age * c.qty + (age || 0) * q) / (c.qty + q);
    c.qty += q; c.cost += cost;
  }
  // 頼まれごと・得意先のために、売らずに取っておく数
  function reserved(g) {
    let n = 0;
    for (const o of S.orders) if (o.g === g) n += o.n;
    for (const p of S.patrons) if (p.g === g) n += p.n;
    return n;
  }

  // ---------- 相場 ----------
  const sellsHere = (t, g) => D.TOWNS[t].stock[g] != null;
  const banned = (t, g) => (D.TOWNS[t].ban || []).includes(g);
  const homeBonus = (t) => { let b = 1; if (t === C.startTown) for (const k in C.home) if (S.home[k]) b += C.home[k].stock; return b; };
  function stockMax(t, g) { return Math.round(D.TOWNS[t].stock[g] * seasonMods(t, g, day()).s * homeBonus(t)); }
  function trendOf(t, g) { const d = day(); for (const x of S.trends) if (x.t === t && x.g === g && x.from <= d) return x; return null; }
  // その日の倍率 = 産地からの道のりで決まる基本 × 予定外の高騰・値崩れ ×（1 + 日々のゆれ）× 季節 × 行事
  function mult(t, g) {
    const tr = trendOf(t, g), d = day();
    return BASE[t][g] * (tr ? tr.m : 1) * (1 + S.drift[t][g]) * seasonMods(t, g, d).p * eventMult(t, g, d);
  }
  const patronOf = (t) => S.patrons.find((p) => p.t === t) || null;
  const trusted = (t) => { const p = patronOf(t); return !!p && p.streak >= C.patronTrust; };
  // 値段の有利さ：話術 ＋ 得意先の町の優遇（合わせて上限あり）
  const edge = (t) => clamp(C.stat.talkPrice * sd('talk') + (trusted(t) ? C.patronEdge : 0), -0.06, C.stat.edgeMax);
  const step = (t, g) => 1 / (D.GOODS[g].depth * D.TOWNS[t].size * nearDepth(t, g));
  const unitBuy = (t, g, dev) => Math.max(1, Math.ceil(D.GOODS[g].base * mult(t, g) * (1 + dev) * (1 - edge(t))));
  const unitSell = (t, g, dev, f) => Math.max(1, Math.floor(D.GOODS[g].base * mult(t, g) * (1 + dev) * C.sellRate * (f == null ? 1 : f) * (1 + edge(t))));
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
  // 評判が上がる（話術が高いと上がりやすい）
  function addRep(t, v) { S.rep[t] = clamp(S.rep[t] + (v > 0 ? v * (1 + C.stat.talkRep * sd('talk')) : v), 0, 100); }

  // ---------- 噂 ----------
  // 値の噂の誤差の幅。となり町は小さく、遠い町ほど大きい。目利きが高いと狭くなる
  function rumorErr(from, to) {
    const d = DIST[from][to], e = d <= C.rumorErrDays[0] ? C.rumorErr[0] : d <= C.rumorErrDays[1] ? C.rumorErr[1] : C.rumorErr[2];
    return +(e * (1 - C.stat.eyeErr * sd('eye'))).toFixed(4);
  }
  const relOf = (src, rel) => (rel == null ? clamp(C.rumorRel[src] + C.stat.eyeRel * sd('eye'), 0.05, 0.97) : rel);
  function lagged(from, to) {
    const lag = DIST[from][to] + rndi(0, 2), h = S.hist[to], want = day() - lag;
    let best = h[0];
    for (const x of h) if (x.d <= want && x.d >= best.d) best = x;
    return best;
  }
  function addRumor(r) {
    r.id = ++S.rid; r.day = day();
    S.rumors = S.rumors.filter((x) => !(x.kind === r.kind && x.t === r.t && x.g === r.g && x.kind === 'price'));
    S.rumors.unshift(r);
    if (S.rumors.length > 30) S.rumors.length = 30;
    return r;
  }
  function priceRumor(src, t, g, rel) {
    const from = S.town, base = lagged(from, t).sell[g];
    if (base == null) return null;
    const e = rumorErr(from, t), ok = Math.random() < relOf(src, rel);
    const v = ok ? base : base * (Math.random() < 0.5 ? rnd(0.55, 0.8) : rnd(1.25, 1.6));
    const mid = v * (1 + rnd(-e, e) * 0.6);
    return addRumor({ kind: 'price', src, t, g, lo: Math.max(1, Math.round(mid * (1 - e))), hi: Math.round(mid * (1 + e)), err: e, ok, until: day() + C.rumorKeep });
  }
  function omenRumor(src, rel) {
    const ok = Math.random() < relOf(src, rel);
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
  function vagueRumor(src, rel) {
    const ok = Math.random() < relOf(src, rel), here = S.town;
    let t, g, up = true;
    const cands = [];
    if (ok) {
      for (const k of S.trends) if (inPlay(k.t) && k.t !== here) cands.push({ t: k.t, g: k.g, up: k.m > 1 });
      for (const u of upcoming(20)) if (u.ev.t && u.ev.t !== here && u.ev.goods) cands.push({ t: u.ev.t, g: pick(Object.keys(u.ev.goods)), up: true });
      for (const tt of playTowns()) if (tt !== here) for (const gg in D.GOODS) if (goodInPlay(gg) && !banned(tt, gg) && BASE[tt][gg] >= 1.8) cands.push({ t: tt, g: gg, up: true });
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
  function hearStreet() {
    const n = rndi(C.streetCount[0], C.streetCount[1]), got = [];
    for (let i = 0; i < n; i++) {
      const roll = Math.random();
      const r = roll < 0.5 ? vagueRumor('street') : roll < 0.8 ? randomPrice('street') : omenRumor('street');
      if (r) got.push(r);
    }
    return got;
  }
  function randomPrice(src, rel) {
    const here = S.town, towns = playTowns().filter((t) => t !== here && S.named[t]);
    const pool = towns.length ? towns : playTowns().filter((t) => t !== here);
    const t = pick(pool);
    const mine = Object.keys(D.TOWNS[here].stock).concat(Object.keys(S.cargo)).filter((g) => !banned(t, g) && !sellsHere(t, g));
    const g = mine.length && Math.random() < 0.75 ? pick(mine) : pick(Object.keys(D.GOODS).filter((k) => goodInPlay(k) && !banned(t, k)));
    if (!S.named[t]) { S.named[t] = true; if (!S.seen[t]) S.seen[t] = 1; }
    return priceRumor(src, t, g, rel);
  }
  const rumorsAbout = (t) => S.rumors.filter((r) => r.t === t && r.hide !== 't');
  const priceRumorOf = (t, g) => S.rumors.find((r) => r.kind === 'price' && r.t === t && r.g === g) || null;

  // ---------- お金・親の借金 ----------
  const storeTowns = () => Object.keys(S.store).filter((t) => Object.keys(S.store[t]).length);
  function dailyCost() {
    const c = { living: C.living, feed: cartT().feed, guards: S.guards * C.guardWage, buddy: S.buddy ? C.buddyWage : 0, shop: 0, store: storeTowns().length * C.store.rent };
    if (S.shop) { const L = C.shop[S.shop.lv]; c.shop = L.rent + L.wage; }
    c.total = c.living + c.feed + c.guards + c.buddy + c.shop + c.store;
    return c;
  }
  function pay(amount) {
    if (S.gold >= amount) { S.gold -= amount; return 0; }
    const short = amount - S.gold;
    S.gold = 0; S.debt += short;
    return short;
  }
  function shopValue() { let v = 0; if (S.shop) for (let l = 1; l <= S.shop.lv; l++) v += C.shop[l].cost; return v; }
  // 返済額。難しさで変わる
  const dueOf = (i) => Math.round(C.loan.dues[i] * C.diff[S.diff].dues / 10) * 10;
  const dueNow = () => (S.loan.done ? 0 : dueOf(S.loan.n));
  const dueDay = () => (S.loan.cycle + 1) * C.loan.every;
  const daysLeft = () => dueDay() - day();
  const owed = () => Math.max(0, dueNow() - S.loan.pre) + Math.ceil(S.debt);
  function loanLeft() { let v = 0; if (!S.loan.done) for (let i = S.loan.n; i < C.loan.dues.length; i++) v += dueOf(i); return Math.max(0, v - S.loan.pre); }
  // 自分から借りられる上限。返済が重くなるほど、借りられる額も増える
  const tabLimit = () => Math.round(C.tabLimit + dueNow() * C.tabDueRate);
  // 返済のために荷を売る順番：傷む品 → その町で割よく売れる品
  function debtOrder() {
    const t = S.town, val = (g) => (banned(t, g) ? 0 : sellNow(t, g) / D.GOODS[g].base);
    return Object.keys(S.cargo).sort((a, b) => {
      const sa = D.GOODS[a].shelf ? 1 : 0, sb = D.GOODS[b].shelf ? 1 : 0;
      return sb - sa || val(b) - val(a);
    });
  }
  // 荷を、その町の今日の値で、need 枚に届くぶんだけ売る。売れない禁制品は半値で引き取られる。
  // dry = true なら売らずに見積もるだけ
  function sellForDebt(need, dry) {
    const t = S.town, sold = [];
    let sum = 0;
    for (const g of debtOrder()) {
      if (sum >= need) break;
      const c = S.cargo[g], f = fresh(g, c.age), st = step(t, g), ban = banned(t, g);
      let dev = S.market[t][g], k = 0, got = 0;
      while (k < c.qty && sum + got < need) {
        got += ban ? Math.floor(D.GOODS[g].base * 0.5) : unitSell(t, g, dev, f);
        if (!ban) dev = Math.max(C.devMin, dev - st);
        k++;
      }
      if (!k) continue;
      sum += got; sold.push({ g, k, got });
      if (!dry) {
        const avg = c.cost / c.qty;
        S.market[t][g] = dev; S.stats.profit += got - avg * k;
        c.cost -= avg * k; c.qty -= k;
        if (c.qty <= 0) delete S.cargo[g];
      }
    }
    return { sum, sold };
  }
  const stockWorth = (store) => { let v = 0; for (const g in store) v += Math.floor(store[g].qty * D.GOODS[g].base * 0.6); return v; };
  function storeWorth() { let v = 0; for (const t in S.store) v += stockWorth(S.store[t]); return v; }
  // 返済日に足りないとき、何が起きるかの見込み
  function forecast() {
    let short = owed() - S.gold;
    const out = { short: Math.max(0, short), cargo: 0, sold: [], store: false, shop: false, cart: false, dead: false };
    if (short <= 0) return out;
    const sale = sellForDebt(short, true);
    out.cargo = Math.min(sale.sum, short); out.sold = sale.sold; short -= sale.sum;
    if (short > 0 && storeWorth() > 0) { out.store = true; short -= storeWorth(); }
    if (short > 0 && S.shop) { out.shop = true; short -= S.shop.till + stockWorth(S.shop.stock) + Math.floor(shopValue() * 0.6); }
    if (short > 0 && S.cart.type !== 'basket') { out.cart = true; short -= Math.floor(cartT().price * 0.5); }
    if (short > 0) out.dead = true;
    return out;
  }
  function forecastText() {
    const f = forecast();
    if (!f.short) return '';
    let s = `いまのままだと ${fmt(f.short)}枚 足りない。`;
    if (f.sold.length) s += `まず荷を売られる（${f.sold.map((x) => `${D.GOODS[x.g].name}${qtyStr(x.g, x.k)}`).join('、')}＝${D.TOWNS[S.town].name}の値で約${fmt(f.cargo)}枚）。`;
    if (f.store) s += '次に、倉庫の荷。';
    if (f.shop) s += '次に、店の売上金と在庫、それでも足りなければ店そのもの。';
    if (f.cart) s += `最後に、${cartT().name}。`;
    s += f.dead ? '<b>それでも足りず、破産する。</b>' : (f.cart ? '' : (f.shop || f.store ? '' : '荷車は残る。'));
    return s;
  }
  // 返済日。足りなければ、①荷をその町の値で必要なぶんだけ売る ②倉庫の荷 ③店の売上金と在庫 ④店 ⑤荷車。それでも足りなければ破産
  function collect() {
    const need = owed();
    let short = Math.max(0, need - S.gold), seized = false;   // 手持ちで足りていれば 0（余りを二重に戻さない）
    S.gold = Math.max(0, S.gold - need);
    const note = (msg) => dayNotes.push(`<span class="bad">⚖️ ${msg}</span>`);
    if (short > 0 && cargoCount() > 0) {
      const r = sellForDebt(short, false);
      if (r.sum > 0) { short -= r.sum; seized = true; note(`返済のために、荷を${D.TOWNS[S.town].name}の値で売られた：${r.sold.map((x) => `${D.GOODS[x.g].name}${qtyStr(x.g, x.k)}`).join('、')}（${fmt(r.sum)}枚）`); }
    }
    if (short > 0 && storeWorth() > 0) { const v = storeWorth(); short -= v; seized = true; S.store = {}; note(`倉庫の荷を処分された（${fmt(v)}枚ぶん）`); }
    if (short > 0 && S.shop) {
      const v1 = S.shop.till + stockWorth(S.shop.stock);
      if (v1 > 0) { short -= v1; seized = true; S.shop.till = 0; S.shop.stock = {}; note(`店の売上金と在庫をあてた（${fmt(v1)}枚ぶん）`); }
      if (short > 0) { const v2 = Math.floor(shopValue() * 0.6); short -= v2; seized = true; note(`${D.TOWNS[S.shop.town].name}の${C.shop[S.shop.lv].name}を差し押さえられた（${fmt(v2)}枚ぶん）`); addDiary('店を差し押さえられた。'); S.shop = null; }
    }
    if (short > 0 && S.cart.type !== 'basket') {
      const v = Math.floor(cartT().price * 0.5);
      short -= v; seized = true; note(`最後に、${cartT().name}を差し押さえられた（${fmt(v)}枚ぶん）`); addDiary(`${cartT().name}を差し押さえられた。`);
      S.cart = { type: 'basket', hp: 100 }; S.guards = 0;
    }
    if (short > 0) { addDiary('破産した。'); addRecord('破産'); S.dead = true; wipeSave(); return; }
    if (short < 0) S.gold += -short;               // 売りすぎ・取りすぎたぶんは手元に戻る
    S.debt = 0; S.loan.pre = 0; S.loan.cycle++;
    if (!S.loan.done) {
      S.loan.n++;
      dayNotes.push(`💰 返済日。バルドの使いに ${fmt(need)}枚 を納めた${seized ? '（足りないぶんは、上のとおり穴を埋めた）' : ''}。`);
      addDiary(`${S.loan.n}回目の返済 ${fmt(need)}枚${seized ? '（差し押さえあり）' : ''}。`);
      if (S.loan.n >= C.loan.dues.length) { S.loan.done = true; addDiary('親の借金を返し終えた。'); addRecord('完済'); tell('free'); }
      else {
        const next = dueOf(S.loan.n);
        if (!tell('pay1', { next })) { if (S.loan.n >= 3) tell('payBig', { next }); }
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
  function tradeTick() {
    if (S.tradedAt === S.time) return;
    advance(C.tradeTime);
    S.tradedAt = S.time;
  }
  function spawnBoss() {
    const roads = D.BOSS_ROADS.filter((r) => roadUsable(r) && !roadClosed(r) && !(S.safe[r] > day()));
    if (!roads.length) { S.bossNext = day() + 10; return; }
    const rid = pick(roads), r = D.ROADS[rid];
    S.boss = { name: D.BOSSES[S.bossN % D.BOSSES.length], rid, power: rndi(C.boss.power[0], C.boss.power[1]), bounty: Math.round(rnd(C.boss.bounty[0], C.boss.bounty[1]) / 10) * 10 };
    S.bossN++;
    dayNotes.push(`<span class="bad">🗡️ 手配書が出た。山賊の頭「${S.boss.name}」が、${D.TOWNS[r.a].name}と${D.TOWNS[r.b].name}のあいだの${D.ROAD_TYPES[r.type].name}に居ついた。懸賞金 ${S.boss.bounty}枚。</span>`);
  }
  function newDay() {
    const d = day(), sea = seasonOf(d);
    const short = pay(dailyCost().total);
    if (short > 0 && !S.tabNoted) { S.tabNoted = true; dayNotes.push(`<span class="bad">宿代や給金を払えず、${fmt(short)}枚がツケになった。次の返済日に取り立てられる。</span>`); }
    if (short === 0) S.tabNoted = false;
    if (short > 0 && S.guards > 0) { dayNotes.push(`<span class="bad">給金が払えず、護衛${S.guards}人は去っていった。</span>`); S.guards = 0; }
    if (short > 0 && S.buddy) { dayNotes.push(`<span class="bad">給金が払えず、${buddy().name}は去っていった。</span>`); addDiary(`${buddy().name}と別れた。`); S.buddy = null; }
    if (S.debt > 0) S.debt = +(S.debt * (1 + C.tabInterest)).toFixed(2);

    if (seasonDay(d) === 0) {
      dayNotes.push(`${sea.icon} <b>${sea.name}になった。</b>${sea.desc}`);
      const cl = CAL.closed.filter((c) => c.season === sea.id).map((c) => c.roads.filter((r) => S.roads[r]).map((r) => `${townName(D.ROADS[r].a)}〜${townName(D.ROADS[r].b)}`)).reduce((a, b) => a.concat(b), []);
      if (cl.length) dayNotes.push(`<span class="bad">❄️ 雪で道が閉じた：${cl.join('、')}</span>`);
    }
    for (const ev of CAL.events) if (eventOn(ev, d) && !eventOn(ev, d - 1) && (!ev.t || inPlay(ev.t))) dayNotes.push(`📅 <b>${ev.name}</b>が始まった。${ev.desc}。`);

    // 傷む品（夏は足が早い）。倉庫と店の荷も同じように傷む
    const spoil = (S.rain ? 1.3 : 1) * ((CAL.spoil && CAL.spoil[sea.id]) || 1);
    const age = (store, where, mine) => {
      for (const g in store) {
        const sh = D.GOODS[g].shelf;
        if (!sh) continue;
        store[g].age += spoil;
        if (store[g].age > sh) {
          dayNotes.push(`<span class="bad">🪰 ${where}${D.GOODS[g].name} ${qtyStr(g, store[g].qty)}が腐り、捨てるしかなかった。</span>`);
          if (mine) { if (travel) travel.lost += store[g].cost; else S.visit.lost += store[g].cost; }
          delete store[g];
        }
      }
    };
    age(S.cargo, '', true);
    if (S.shop) age(S.shop.stock, '店の');
    for (const t in S.store) age(S.store[t], `${D.TOWNS[t].name}の倉庫の`);

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

    S.rain = Math.random() < (S.rain ? C.rainStay : C.rainStart);
    for (const r in S.hot) if (S.hot[r] <= d) { delete S.hot[r]; delete S.hotKnown[r]; }
    if (Math.random() < C.hotChance) { const r = pick(Object.keys(D.ROADS).filter((k) => D.ROADS[k].danger >= 1 && roadUsable(k))); S.hot[r] = d + rndi(8, 20); }
    for (const t in S.caravans) S.caravans[t] = S.caravans[t].filter((c) => c.leave >= d);
    for (const r in S.safe) if (S.safe[r] <= d) delete S.safe[r];
    if (S.boss && roadClosed(S.boss.rid)) { dayNotes.push(`🗡️ 雪で道が閉じ、山賊の頭「${S.boss.name}」は姿を消した。`); S.boss = null; S.bossNext = d + rndi(C.boss.respawn[0], C.boss.respawn[1]); }
    if (!S.boss && d >= S.bossNext) spawnBoss();

    // 店の売り上げ（留守のあいだも売ってくれる）
    if (S.shop) {
      const L = C.shop[S.shop.lv], t = S.shop.town;
      if (d % L.every === 0) {
        let sold = 0;
        for (const g in S.shop.stock) {
          if (banned(t, g)) continue;
          const it = S.shop.stock[g], n = Math.min(it.qty, L.rate);
          const price = Math.max(1, Math.floor(D.GOODS[g].base * mult(t, g) * (1 + S.market[t][g]) * C.shopPrice * fresh(g, it.age)));
          S.shop.till += n * price; S.stats.profit += n * price - (it.cost / it.qty) * n;
          S.market[t][g] = Math.max(C.devMin, S.market[t][g] - n * step(t, g) * 0.4);
          it.cost -= (it.cost / it.qty) * n; it.qty -= n; sold += n;
          if (it.qty <= 0) delete S.shop.stock[g];
        }
        if (sold) addRep(t, 0.4);
      }
    }

    S.orders = S.orders.filter((o) => {
      if (d <= o.due) return true;
      addRep(o.t, -C.orderFailRep);
      dayNotes.push(`<span class="bad">📜 ${D.TOWNS[o.t].name}の${D.TOWNS[o.t].who.name}との約束（${D.GOODS[o.g].name}${qtyStr(o.g, o.n)}）を守れなかった。評判が落ちた。</span>`);
      tell('orderFail');
      return false;
    });
    S.patrons = S.patrons.filter((p) => {
      if (d <= p.due) return true;
      p.miss++; p.streak = 0; p.due = d + C.patronEvery;
      addRep(p.t, -C.patronMissRep);
      const who = D.TOWNS[p.t].who.name;
      if (p.miss >= 2) { dayNotes.push(`<span class="bad">🤝 ${who}は、もう待ってくれなかった。得意先をひとつ失った。</span>`); addDiary(`${who}との縁が切れた。`); return false; }
      dayNotes.push(`<span class="bad">🤝 ${who}への納めを忘れた。評判が落ちた。次も忘れれば、縁が切れる。</span>`);
      return true;
    });

    if (S.abroad && !S.pass.border && S.rep.oto >= C.abroad.passRep) {
      S.pass.border = true;
      dayNotes.push(`<span class="good">🪪 国境の通行手形をもらった。関税が半分になる。</span>`);
      addDiary('国境の通行手形をもらった。');
      tell('pass');
    }
    // 返済日が近いのに足りないときは、何が起きるかを先に知らせる
    if (!S.dead && daysLeft() === C.warnDays && S.warned !== S.loan.cycle && owed() > S.gold) {
      S.warned = S.loan.cycle;
      dayNotes.push(`<span class="bad">⏳ <b>返済日まで、あと${C.warnDays}日。</b>${forecastText()}</span>`);
      tell('warn');
    }
    if (d >= dueDay()) collect();
  }
  function checkAbroad() {
    if (S.abroad || !S.shop || S.shop.lv < C.abroad.shopLv || S.rep.oto < C.abroad.rep) return;
    S.abroad = true;
    S.roads.r14 = true; S.roads.r14b = true;
    S.seen.karune = S.seen.karune || 1; S.named.karune = true;
    for (const t in D.TOWNS) for (const g in D.TOWNS[t].stock) if (typeof S.stock[t][g] !== 'number') S.stock[t][g] = stockMax(t, g);
    addDiary('組合に認められ、隣国への道が開いた。');
    tell('abroad');
  }
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
        `<p class="sub">${S.me ? S.me.gen + '代目・' : ''}${fullName()}　${d}日目 ／ 返済 ${S.loan.n}回 ／ 行商 ${st.trips}回 ／ 山賊を退けた ${st.wins}回</p>` +
        `<p class="bad">記録は消えた。次の商人で、最初からやり直しになる。（商人録には残る）</p>`,
      buttons: [{ label: sc.label, cls: 'pri', fn: () => { newGame(); save(); ui = { tab: 'market', dest: null, insure: false }; render(); intro(); } }]
    });
  }

  // ---------- 段階・目標・呼び名 ----------
  function stage() { return S.shop ? 3 : S.cart.type !== 'basket' ? 2 : 1; }
  function goalText() {
    if (S.cart.type === 'basket') return `手押し車を買う（${D.CARTS.handcart.price}枚。カワベの車屋で）。籠のままでは返済が続かない`;
    if (S.cart.type === 'handcart') return `ロバの荷車を買う（${D.CARTS.donkey.price}枚）。返済額はまだ上がる。遠い町ほど、荷は高く売れる`;
    if (S.cart.type === 'donkey' && !S.shop) return `王都の車屋で馬車を買う（${D.CARTS.horse.price}枚）か、町で評判を${C.shop[1].rep}まで上げて露店を出す（${C.shop[1].cost}枚）`;
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
  function callName(t) {
    const r = S.rep[t];
    if (r >= 40) return S.shop ? '旦那' : '旦那さん';
    if (r >= 20) return 'おなじみさん';
    if (r >= 8) return '行商さん';
    return S.cart.type === 'basket' ? '籠の兄ちゃん' : '車の兄ちゃん';
  }

  // ---------- 地図の知識・道 ----------
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
  const bossOn = (rid) => !!S.boss && S.boss.rid === rid;
  const safeRoad = (rid) => S.safe[rid] > day();
  // 道の危険度（いまの本当の値）。頭が居座れば最高、頭を倒した道は2下がる
  function dangerOf(rid, known) {
    const r = D.ROADS[rid];
    if (bossOn(rid)) return 3;
    const hot = !!S.hot[rid] && S.hot[rid] > day() && (!known || S.hotKnown[rid]);
    return clamp(r.danger + (hot ? 1 : 0) - (safeRoad(rid) ? 2 : 0), 0, 3);
  }
  // 山賊に遭う確率。積み荷の値打ちが大きいほど上がる。はじめの季節は、安全な街道には出ない
  function banditChance(danger, caravan) {
    if (danger === 0 && day() < C.safeDays) return 0;
    const vm = Math.min(C.banditValueMax, 0.5 + cargoWorth() / C.banditValueRef);
    let p = C.banditBase[danger] * vm * Math.max(0.3, 1 - C.banditGuardCut * S.guards) * C.diff[S.diff].bandit;
    if (caravan) p *= C.caravanSafety;
    return Math.min(0.9, p);
  }
  function tariff(rid) {
    if (!D.ROADS[rid].border || cargoCount() === 0) return 0;
    return Math.max(1, Math.ceil(cargoWorth() * (S.pass.border ? C.abroad.tariffPass : C.abroad.tariff)));
  }
  function routeInfo(rid, caravan) {
    const r = D.ROADS[rid], cart = cartT();
    let m = caravan ? 0.9 : cart.speed[r.type];
    if (S.rain) m *= C.rainSlow[r.type];
    const danger = dangerOf(rid, false), shown = dangerOf(rid, true);
    return {
      r, to: other(r, S.town), days: Math.max(1, Math.round(r.len * m)), toll: tariff(rid), border: !!r.border, closed: roadClosed(rid),
      danger, shown, risk: bossOn(rid) ? 1 : banditChance(shown, caravan), boss: bossOn(rid) ? S.boss : null, safe: safeRoad(rid),
      patrol: r.type === 'road' && contraWorth() > 0,
      breakP: cart.breakP[r.type] * (S.rain ? 1.6 : 1) * (S.cart.hp < 40 ? 2 : 1)
    };
  }
  function power(caravan) { return selfPower() + S.guards * C.guardPower + (caravan ? C.caravanPower : 0); }

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
      const dist = Math.min.apply(null, src.map((p) => PD[t][p]));
      const maxStock = Math.max.apply(null, src.map((p) => D.TOWNS[p].stock[g]));
      const W = pick([25, 25, 100, 100, 300]);
      const n = clamp(Math.round(W / G0.w), 1, Math.max(1, Math.floor(maxStock * 1.2)));
      const far = dist >= C.orderFarDays;                       // 遠方の頼みは、運び賃が倍
      list.push({
        id: d + '-' + t + '-' + g, g, n, far, days: Math.ceil(dist * 2 * 1.4) + 5,
        reward: Math.round(n * G0.base * 0.8 + n * G0.w * C.orderFee * (far ? C.orderFarMult : 1) * (1 + dist)), rep: C.orderRep + (n * G0.w >= 100 ? 3 : 0) + (far ? 2 : 0)
      });
    }
    S.offers[t] = { day: d, list };
    return list;
  }
  const patronPay = (p) => Math.round(p.n * D.GOODS[p.g].base * C.patronPay);
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
    if (n.custom) return n.custom(showNotices);
    modal({ title: n.title, body: n.body, buttons: [{ label: n.label || 'OK', cls: 'pri', fn: showNotices }] });
  }

  // ---------- はじまり：商人を選び、難しさを選ぶ ----------
  function statRow(st, up) {
    return STAT_KEYS.map((k) => { const v = st[k] + (up && up[k] ? 1 : 0); return `<span class="st">${ST[k].icon}${ST[k].name} <b>${v}</b></span>`; }).join('');
  }
  function chooseMerchant(next) {
    const gen = records().length + 1;
    modal({
      title: `${gen}代目の商人を選ぶ`,
      body: `<p class="sub">能力は5つ、どれも1〜5で、合計は誰でも15。3がふつう。破産すると、この商人とはお別れになる。</p>` +
        S.cands.map((c) => `<div class="card"><div class="name">${c.nick}${c.name}</div><div class="strow">${statRow(c.st)}</div>` +
          `<div class="sub">${ST[c.top].name}が高い：${ST[c.top].does}。</div></div>`).join('') +
        `<p class="sub">使った能力は、旅のあいだに1段階だけ伸びる。足りない能力は、あとで道連れが補ってくれる。</p>`,
      buttons: S.cands.map((c, i) => ({
        label: `${c.nick}${c.name}で始める`, cls: i === 0 ? 'pri' : '', fn: () => {
          S.me = { name: c.name, nick: c.nick, top: c.top, st: c.st, use: {}, up: {}, gen };
          S.cands = null;
          addDiary(`${gen}代目・${fullName()}、籠ひとつでハシバミ村を出る。`);
          save(); render(); next();
        }
      }))
    });
  }
  function chooseDiff(next) {
    const keys = Object.keys(C.diff);
    modal({
      title: '難しさを選ぶ',
      body: keys.map((k) => `<p><b>${C.diff[k].name}</b>：${C.diff[k].desc}<br><span class="sub">返済 ${C.loan.dues.map((v) => Math.round(v * C.diff[k].dues / 10) * 10).join('→')}枚</span></p>`).join(''),
      buttons: keys.map((k, i) => ({ label: C.diff[k].name, cls: i === 0 ? 'pri' : '', fn: () => { S.diff = k; save(); render(); next(); } }))
    });
  }
  function intro() {
    S.told.intro = 0;
    tell('intro', { gold: C.startGold });
    notices.push({ custom: chooseMerchant });
    notices.push({ custom: chooseDiff });
    notices.push({ title: '遊び方', body: helpBody(), label: 'はじめる' });
    save(); showNotices();
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
      if (r) useStat('eye');
      items.push({ g, qty: c.qty, avg: c.cost / c.qty, actual, rumor: r ? { lo: r.lo, hi: r.hi } : null, tot, note: ev ? ev.name : tre ? (tre.m > 1 ? '品不足で高騰中' : 'だぶついて値崩れ中') : (f < 0.7 ? '傷みで値が落ちた' : '') });
    }
    const profit = sale - cost - Math.max(0, tr.spent) - tr.lost;
    const stake = tr.cost0 / Math.max(1, tr.gold0 + tr.cost0);
    return { t, items, sale, cost, spent: tr.spent, lost: tr.lost, payout: tr.payout || 0, profit, days: tr.days, full: items.length >= 2 && (stake >= C.bigBet || items.length >= 3) };
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
        body += `<div class="card tally"><div class="name">旅の決算の見込み（ここで全部売った場合）</div><div class="stat">` +
          `<div><span>仕入れ値</span> ${fmt(R.cost)}枚</div><div><span>売れば</span> ${fmt(R.sale)}枚</div>` +
          `<div><span>道中の出費（${R.days}日）</span> ${fmt(Math.max(0, R.spent))}枚</div><div><span>失った荷</span> ${fmt(R.lost)}枚ぶん</div></div>` +
          `<div class="total ${R.profit >= 0 ? 'good' : 'bad'}">${R.profit >= 0 ? 'もうけ +' : '損 '}${fmt(R.profit)}枚</div>` +
          `<div class="sub">まとめて売ると値は下がっていく。売るかどうかは市場で決める。実際のもうけは、売ったあとで帳簿につく。</div></div>`;
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
      `<div class="hud2"><span>${dateStr()}<b class="${isNight() ? 'bad' : ''}">${QN[S.time % 4]}</b></span><span>${S.rain ? '🌧' : '☀️'}</span>` +
      `<span>${cartT().icon} ${cargoWeight()}/${capNow()}kg</span>` + (S.guards ? `<span>🛡${S.guards}</span>` : '') + `<span>${dueText()}</span></div>`;
  }
  function dueCard() {
    const o = owed(), left = daysLeft();
    if (S.loan.done && o === 0) return '';
    const hard = S.gold < o, soon = hard && left <= C.warnDays;
    return `<div class="card ${hard && left <= 10 ? 'danger' : 'goal'}"><div class="sub">${S.loan.done ? 'ツケの清算' : `親の借金　${S.loan.n + 1}回目の返済（${seasonOf(day()).name}の終わり）`}</div>` +
      `<div class="name">あと${left}日で ${fmt(o)}枚${hard ? `　<span class="bad">（${fmt(o - S.gold)}枚 足りない）</span>` : '　<span class="good">（手持ちで足りる）</span>'}</div>` +
      `<div class="sub">${soon ? forecastText() : '足りなければ、まず荷をその町の値で必要なぶんだけ売られる。次に店、最後に荷車。何も残らなければ破産。'}</div></div>`;
  }
  function nightCard() {
    return isNight() ? `<div class="card danger"><div class="name">🌙 夜になった</div><div class="sub">${S.tradedAt === S.time ? '店じまいの刻。いま始めた売り買いは続けられるが、酒場は閉まり、出発もできない。' : '市場も酒場も閉まっている。出発もできない。'}</div><button class="b pri wide" data-a="rest">朝まで休む</button></div>` : '';
  }
  function calendarCard() {
    const sea = seasonOf(day()), ups = upcoming(30), cl = CAL.closed.filter((c) => c.season === sea.id);
    let h = `<div class="name">${sea.icon} ${sea.name} ${seasonDay(day()) + 1}日目<span class="sub">　あと${30 - seasonDay(day())}日で${seasonOf(day() + 30).name}</span></div>` +
      `<div class="sub">${sea.desc}</div>`;
    if (cl.length && cl[0].roads.some((r) => S.roads[r])) h += `<div class="sub bad">雪で閉じている道がある（旅じたくの地図に ✕）</div>`;
    h += ups.map((u) => `<div class="cal">📅 <b>${u.ev.name}</b> ${u.inDays === 0 ? `<span class="good">開催中（あと${u.left}日）</span>` : `あと${u.inDays}日`}<span class="sub">　${u.ev.desc}</span></div>`).join('');
    if (S.boss) { const r = D.ROADS[S.boss.rid]; h += `<div class="cal bad">🗡️ 手配書：山賊の頭「${S.boss.name}」　${townName(r.a)}〜${townName(r.b)}の${D.ROAD_TYPES[r.type].name}　懸賞金 ${S.boss.bounty}枚</div>`; }
    return h;
  }
  function rumorBook(list, title, open) {
    if (!list.length) return '';
    const e = sd('eye');
    return `<details class="card" ${open ? 'open' : ''}><summary>${title}（${list.length}件）</summary>` +
      `<div class="sub">★が多いほど当たりやすい。値の噂は幅つきで、遠い町ほど幅が広い。${e ? hit('eye', e > 0 ? '噂の幅が狭く聞こえる' : '噂の幅が広く聞こえる') : ''}</div>` +
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
      const avg = own.cost / own.qty, rs = reserved(g);
      l3 = `<div class="sub">所持 <b>${qtyStr(g, own.qty)}</b>・${own.qty * G0.w}kg（仕入れ ${fmt(avg)}枚）` +
        (G0.shelf ? ` 鮮度 <span class="${f < 0.6 ? 'bad' : ''}">${Math.round(f * 100)}%</span>` : '') +
        (ban ? '' : `<span class="${sp >= avg ? 'good' : 'bad'}"> ${sp >= avg ? '▲利益' : '▼損'}</span>`) + (rs ? ` 📜頼まれ物${qtyStr(g, rs)}` : '') + `</div>`;
      if (!ban && !can && nearDepth(t, g) < 1) l3 += `<div class="sub">産地に近い町なので、たくさん売ると値がすぐ崩れる。</div>`;
    }
    return `<div class="card row"><div class="grow"><div class="name">${G0.icon} ${G0.name}${tags(g)}</div><div>${l2}</div>${l3}</div><div class="btns">` +
      (own && !ban ? `<button class="b" data-a="sell" data-g="${g}">売る</button>` : '') +
      (can ? `<button class="b pri" data-a="buy" data-g="${g}">買う</button>` : '') + `</div></div>`;
  }
  function orderCards(onlyHere) {
    let h = S.orders.map((o, i) => {
      const here = o.t === S.town, have = S.cargo[o.g] ? S.cargo[o.g].qty : 0, left = o.due - day();
      if (onlyHere && !here) return '';
      return `<div class="card row"><div class="grow"><div class="name">📜 ${D.TOWNS[o.t].name}の${D.TOWNS[o.t].who.name}へ ${D.GOODS[o.g].name} ${qtyStr(o.g, o.n)}（${o.n * D.GOODS[o.g].w}kg）</div>` +
        `<div class="sub"><span class="${left <= 3 ? 'bad' : ''}">あと${left}日</span> ／ 報酬 ${o.reward}枚 ／ 持っている ${qtyStr(o.g, have)}</div></div>` +
        (here ? `<button class="b pri" data-a="deliver" data-i="${i}" ${have >= o.n ? '' : 'disabled'}>納める</button>` : '') + `</div>`;
    }).join('');
    h += S.patrons.map((p, i) => {
      const here = p.t === S.town, have = S.cargo[p.g] ? S.cargo[p.g].qty : 0, left = p.due - day();
      if (onlyHere && !here) return '';
      return `<div class="card row"><div class="grow"><div class="name">🤝 得意先 ${D.TOWNS[p.t].who.name}（${D.TOWNS[p.t].name}）へ ${D.GOODS[p.g].name} ${qtyStr(p.g, p.n)}</div>` +
        `<div class="sub"><span class="${left <= 4 ? 'bad' : ''}">あと${left}日</span> ／ 代金 ${patronPay(p)}枚 ／ 続けて${p.streak}回 ／ 持っている ${qtyStr(p.g, have)}</div></div>` +
        (here ? `<button class="b pri" data-a="supply" data-i="${i}" ${have >= p.n ? '' : 'disabled'}>納める</button>` : '') + `</div>`;
    }).join('');
    return h;
  }
  // 市場：売り買いする品をいちばん上に。返済・暦・噂などは、その下にたたんで置く
  function viewMarket() {
    const T = D.TOWNS[S.town], here = Object.keys(T.stock), o = owed(), short = S.gold < o && daysLeft() <= C.warnDays;
    const tk = edge(S.town);
    let h = `<h2>${T.name}の市場</h2><p class="sub">${KIND[T.kind]}　評判 ${Math.floor(S.rep[S.town])}「${callName(S.town)}」${trusted(S.town) ? '　<span class="good">得意先の町</span>' : ''}` +
      `${tk ? '　' + hit('talk', `買値${tk > 0 ? '−' : '+'}${Math.abs(Math.round(tk * 100))}%・売値${tk > 0 ? '+' : '−'}${Math.abs(Math.round(tk * 100))}%`) : ''}</p>`;
    h += nightCard();
    if (short) h += dueCard();
    h += orderCards(true);
    h += `<h3>この町の特産（あと ${freeWeight()}kg 積める）</h3>` + here.map(goodCard).join('');
    const owned = Object.keys(S.cargo).filter((g) => !here.includes(g));
    if (owned.length) {
      h += `<h3>持ってきた荷</h3>` + owned.map(goodCard).join('');
    }
    if (Object.keys(S.cargo).some((g) => !banned(S.town, g) && S.cargo[g].qty > reserved(g))) h += `<button class="b wide" data-a="sellAll">持っている荷をまとめて売る（頼まれ物は残す）</button>`;
    // ここから下は、たたんである
    h += `<h3>帳面</h3>`;
    if (!short) h += dueCard();
    h += `<details class="card"><summary>次の目標</summary><div class="name">${goalText()}</div></details>`;
    h += `<details class="card"><summary>${seasonOf(day()).icon} 暦と手配書</summary>${calendarCard()}</details>`;
    h += rumorBook(S.rumors, '👂 噂帳', false);
    const rest = orderCards(false);
    if (rest) h += `<details class="card"><summary>📜 頼まれごと・得意先（${S.orders.length + S.patrons.length}件）</summary>${rest}</details>`;
    const all = Object.keys(D.GOODS).filter(goodInPlay).sort((a, b) => mult(S.town, b) - mult(S.town, a));
    h += `<details class="card"><summary>この町の今日の相場をすべて見る</summary><table class="t"><tr><th>品（1つの重さ）</th><th>売値</th><th>ふだんとの差</th></tr>` +
      all.map((g) => {
        if (banned(S.town, g)) return `<tr><td>${D.GOODS[g].icon} ${D.GOODS[g].name}</td><td class="bad">禁制</td><td></td></tr>`;
        const pct = Math.round((mult(S.town, g) * (1 + S.market[S.town][g]) / BASE[S.town][g] - 1) * 100);
        return `<tr><td>${D.GOODS[g].icon} ${D.GOODS[g].name}（1${U(g)} ${D.GOODS[g].w}kg）</td><td>${fmt(sellNow(S.town, g))}枚</td>` +
          `<td class="${pct >= 15 ? 'good' : pct <= -15 ? 'bad' : ''}">${pct >= 0 ? '+' : ''}${pct}%</td></tr>`;
      }).join('') + `</table><div class="sub">産地から遠い町ほど、重くて安い品（麦・塩・樽・鉄）は高く売れる。</div></details>`;
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
    const mark = (m, ch, bg, fg) => {
      ctx.fillStyle = bg; ctx.strokeStyle = '#7a5a34'; ctx.lineWidth = 1.5;
      ctx.fillRect(m[0] - 7, m[1] - 7, 14, 14); ctx.strokeRect(m[0] - 7, m[1] - 7, 14, 14);
      ctx.fillStyle = fg || '#5a3d1c'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch, m[0], m[1] + 0.5);
    };
    for (const rid in D.ROADS) {
      if (!S.roads[rid] || !roadUsable(rid)) continue;
      const r = D.ROADS[rid], P = roadPts(rid), hot = S.hot[rid] > day() && S.hotKnown[rid], closed = roadClosed(rid), boss = bossOn(rid), safe = safeRoad(rid);
      ctx.strokeStyle = closed ? '#bdb6a6' : boss || hot ? '#c0392b' : safe ? '#4f8a4b' : r.type === 'road' ? '#7a5a34' : '#9a8056';
      ctx.lineWidth = r.type === 'road' ? 3 : 2;
      ctx.setLineDash(r.type === 'road' ? [] : r.type === 'trail' ? [7, 4] : [2, 4]);
      ctx.beginPath(); ctx.moveTo(P.a[0], P.a[1]); ctx.quadraticCurveTo(P.c[0], P.c[1], P.b[0], P.b[1]); ctx.stroke();
      ctx.setLineDash([]);
      if (closed) mark(along(P, 0.5), '✕', '#eef3f7');
      else if (boss) mark(along(P, 0.5), '頭', '#c0392b', '#fff');
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
      if (S.store[t] && Object.keys(S.store[t]).length) mk += '📦';
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
    l2 += i.boss ? ` ／ <span class="bad">山賊の頭が待ちかまえている</span>` : ` ／ <span class="${pct >= 30 ? 'bad' : ''}">${DANGER[i.shown]}（山賊 約${pct}%）</span>`;
    let warn = '';
    if (i.boss) warn += `<div class="bad sub">🗡️ 「${i.boss.name}」の縄張り。かならず出くわす。倒せば懸賞金 ${i.boss.bounty}枚。こちらの力 ${power(false)}。</div>`;
    else if (i.safe) warn += `<div class="good sub">頭を倒したので、しばらくは安全（あと${S.safe[rid] - day()}日）。</div>`;
    else if (r.type === 'path') warn += `<div class="sub">街道より早いが、山賊の巣を抜ける。</div>`;
    if (i.patrol) warn += `<div class="bad sub">⚠ 街道には見回りの役人がいる。禁制品をあらためられることがある（山道と近道にはいない）。</div>`;
    if (i.breakP >= 0.1) warn += `<div class="bad sub">⚠ この荷車には悪い道。壊れやすい。</div>`;
    return `<div class="card"><div class="row"><div class="grow"><div class="name">${D.ROAD_TYPES[r.type].name}` +
      (r.border ? `<span class="tag">国境の関所</span>` : '') + `</div><div class="sub">${l2}</div>${warn}</div>` +
      `<button class="b pri" data-a="go" data-r="${rid}">出発</button></div></div>`;
  }
  const canInsure = () => !!D.TOWNS[S.town].has.lender && cargoCost() > 0;
  const premium = () => Math.ceil(cargoCost() * C.insure.rate);
  function viewMap() {
    let h = `<div class="mapwrap"><canvas id="map"></canvas></div>` +
      `<p class="sub">金の輪が現在地。隣の町をタップで行き先に。実線＝街道、破線＝山道、点線＝近道、✕＝雪で閉鎖、頭＝山賊の頭。</p>` + nightCard();
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
    const worth = cargoWorth(), cost = cargoCost();
    h += `<div class="card"><div class="name">この旅に賭けるもの</div><div class="stat">` +
      `<div><span>荷</span> ${cargoWeight()}/${capNow()}kg</div><div><span>仕入れ値</span> ${fmt(cost)}枚</div>` +
      `<div><span>残る手持ち</span> ${fmt(S.gold)}枚</div><div><span>護衛</span> ${S.guards}/${cartT().guards}人${S.buddy ? '・' + buddy().name : ''}</div></div>` +
      (cargoCount() ? `<div class="sub">${Object.keys(S.cargo).map((g) => `${D.GOODS[g].name}${qtyStr(g, S.cargo[g].qty)}`).join('、')}</div>` : `<div class="sub bad">荷がない。市場で仕入れてから出よう（空荷で行くこともできる）。</div>`) +
      (worth > 0 ? `<div class="sub">値打ち ${fmt(worth)}枚。値打ちが大きいほど山賊に狙われる。</div>` : '') +
      (D.TOWNS[S.town].has.guard && cartT().guards ? `<div class="qbtns"><button class="b" data-a="guard" data-n="-1">護衛 −1</button><button class="b" data-a="guard" data-n="1">護衛 +1（手付け${C.guardHire}枚・日給${C.guardWage}枚）</button></div>` : '') +
      (canInsure() ? `<button class="b wide ${ui.insure ? 'pri' : ''}" data-a="insure">${ui.insure ? '☑' : '☐'} 荷に保険をかける（掛け金 ${premium()}枚）</button>` +
        `<div class="sub">山賊・川・故障で荷を失ったら、その仕入れ値の${Math.round(C.insure.cover * 100)}%が戻る。金貸しのいる町でだけかけられる。</div>` : '') + `</div>`;
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
  const storeWeight = (t) => { let n = 0; const s = S.store[t] || {}; for (const g in s) n += s[g].qty * D.GOODS[g].w; return n; };
  function viewTown() {
    const t = S.town, T = D.TOWNS[t], cart = cartT(), cost = dailyCost();
    let h = `<h2>${T.name}</h2><p class="sub">${T.desc}</p>` + nightCard();
    h += `<h3>宿</h3><div class="card"><div class="sub">1日の出費 ${cost.total}枚（宿と食事${cost.living}` +
      (cost.feed ? `・餌${cost.feed}` : '') + (cost.guards ? `・護衛${cost.guards}` : '') + (cost.buddy ? `・道連れ${cost.buddy}` : '') + (cost.shop ? `・店${cost.shop}` : '') + (cost.store ? `・倉庫${cost.store}` : '') + `）</div>` +
      `<div class="qbtns"><button class="b" data-a="rest">${isNight() ? '朝まで休む' : '1日休む'}</button><button class="b" data-a="work">日雇いで働く（+${C.laborPay}枚）</button></div></div>`;

    const offers = offersOf(t), pt = patronOf(t);
    h += `<h3>${T.who.role}の${T.who.name}</h3>` + orderCards(false);
    if (pt) {
      const nextLv = pt.lv < C.patronLv.length - 1 ? `あと${C.patronGrow - (pt.streak % C.patronGrow)}回守れば、注文が大きくなる。` : '注文はいちばん大きい段階。';
      h += `<div class="card sub">🤝 得意先。${C.patronEvery}日ごとに${D.GOODS[pt.g].name}${qtyStr(pt.g, pt.n)}を納める約束。` +
        (pt.streak >= C.patronTrust ? `<span class="good">信用されている（この町での売り買いが${Math.round(C.patronEdge * 100)}%有利、確かな噂をくれる）</span>` : `あと${C.patronTrust - pt.streak}回守れば、売り買いが有利になる。`) + nextLv + `</div>`;
    } else if (patronReady(t)) {
      const w = T.who.want;
      h += `<div class="card goal"><div class="name">🤝 「うちと、続けて商いをしないか」</div>` +
        `<div class="sub">${C.patronEvery}日ごとに ${D.GOODS[w.g].name}を${qtyStr(w.g, w.n)}（${w.n * D.GOODS[w.g].w}kg）。代金は1回 ${Math.round(w.n * D.GOODS[w.g].base * C.patronPay)}枚。` +
        `守りつづければ、この町での売り買いが有利になり、確かな噂をもらえ、注文も大きくなっていく。2回忘れると縁が切れる。</div>` +
        `<button class="b pri wide" data-a="patron">得意先になる</button></div>`;
    } else if (!pt && goodInPlay(T.who.want.g)) {
      h += `<p class="sub">頼みごとを${C.patronAfter}回果たすと、得意先の話が来る（今 ${S.done[t] || 0}回）。</p>`;
    }
    h += offers.length ? offers.map((o, i) => {
      const w = o.n * D.GOODS[o.g].w;
      return `<div class="card row"><div class="grow"><div class="name">${D.GOODS[o.g].icon} ${D.GOODS[o.g].name}を ${qtyStr(o.g, o.n)}${o.far ? '<span class="tag gold">遠方・運び賃2倍</span>' : ''}</div>` +
        `<div class="sub">${w}kg${w > capNow() ? '（<span class="bad">今の荷車では一度に運べない</span>）' : ''} ／ ${o.days}日以内 ／ 報酬 ${o.reward}枚・評判+${o.rep}</div>` +
        `<div class="sub">遅れると評判が${C.orderFailRep}下がる。</div></div><button class="b pri" data-a="accept" data-i="${i}">受ける</button></div>`;
    }).join('') : `<p class="sub">いまは頼みごとがない。</p>`;

    // 道連れ
    const bd = buddy(), cands = Object.keys(D.COMPANIONS).filter((k) => D.COMPANIONS[k].town === t && S.buddy !== k);
    if (bd || cands.length) {
      h += `<h3>旅の道連れ</h3>`;
      if (bd) h += `<div class="card row"><div class="grow"><div class="name">🧑‍🤝‍🧑 ${bd.name}（${bd.role}）</div><div class="sub">${ST[bd.stat].icon}${ST[bd.stat].name} +${C.buddyBonus}　日給 ${C.buddyWage}枚</div></div><button class="b" data-a="buddyBye">別れる</button></div>`;
      for (const k of cands) {
        const c = D.COMPANIONS[k];
        h += `<div class="card"><div class="row"><div class="grow"><div class="name">${c.name}（${c.role}）</div><div class="sub">${c.line}</div>` +
          `<div class="sub">${ST[c.stat].icon}${ST[c.stat].name}を +${C.buddyBonus} 補ってくれる（今 ${eff(c.stat)}）。手付け ${C.buddyHire}枚、日給 ${C.buddyWage}枚。連れて歩けるのは1人。</div></div>` +
          `<button class="b pri" data-a="buddyHire" data-k="${k}">誘う</button></div></div>`;
      }
    }

    h += `<h3>酒場</h3><div class="card row"><div class="grow">噂を聞く ${STARS.tavern}<div class="sub">値の噂、これから起きること、知らない町や山賊の話。何が聞けるかは運。</div></div>` +
      `<button class="b pri" data-a="rumor">${C.rumorCost}枚</button></div>`;
    if (T.has.info) {
      const towns = playTowns().filter((x) => x !== t && S.named[x]), vg = S.rumors.filter((r) => r.kind === 'vague' && r.hide);
      h += `<h3>情報屋 ${STARS.broker}</h3><div class="card"><div class="sub">町を指定すると、その町の値を${C.brokerGoods}品ぶん教えてくれる（${C.brokerCost}枚）。当たる割合は9割。遠い町ほど幅は広い。</div>` +
        `<div class="chips">` + towns.map((x) => `<button class="b" data-a="broker" data-t="${x}">${D.TOWNS[x].name.replace(/^(国境の町|港町|砂の都|王都)/, '').replace(/(の町|村|鉱山町|の宿場)$/, '')}</button>`).join('') + `</div>` +
        (vg.length ? `<div class="sub" style="margin-top:8px">あいまいな噂の、伏せられた部分を聞く（${C.brokerCost}枚）。<b>本当かどうかまでは、情報屋にもわからない。</b></div>` + vg.map((r) =>
          `<div class="row" style="padding:4px 0"><div class="grow sub">❓ ${rumorText(r)}</div><button class="b" data-a="clarify" data-id="${r.id}">聞く</button></div>`).join('') : '') + `</div>`;
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
    if (T.has.store) h += viewStore();
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
        const pr = c.price - tin, here2 = !c.only || c.only.includes(t);
        h += `<div class="card"><div class="row"><div class="grow"><div class="name">${c.icon} ${c.name}</div><div class="sub">${c.desc}</div></div>` +
          (here2 ? `<button class="b pri" data-a="buyCart" data-id="${id}">${pr >= 0 ? fmt(pr) + '枚' : '+' + fmt(-pr) + '枚'}</button>` : `<span class="tag bad">この町には無い</span>`) + `</div>` +
          `<div class="stat"><div><span>積める重さ</span> <b>${c.cap}kg</b></div><div><span>餌代</span> 1日${c.feed}枚</div>` +
          `<div><span>街道</span> ${c.speed.road <= 0.7 ? '速い' : c.speed.road <= 0.95 ? 'やや速い' : '普通'}</div>` +
          `<div><span>山道</span> ${c.speed.trail >= 1.4 ? '苦手' : c.speed.trail >= 1.1 ? 'やや遅い' : '普通'}</div>` +
          `<div><span>護衛</span> ${c.guards}人まで</div><div><span>麦なら</span> ${Math.floor(c.cap / D.GOODS.grain.w)}袋</div>` +
          `<div><span>ワインなら</span> ${Math.floor(c.cap / D.GOODS.wine.w)}樽</div><div><span>今の${cart.name}</span> ${capNow()}kg</div></div></div>`;
      }
      if (tin) h += `<div class="card row"><div class="grow">今の${cart.name}を売る<div class="sub">背負い籠に戻る。苦しいときの最後の手。</div></div>` +
        `<button class="b" data-a="sellCart">+${tin}枚</button></div>`;
    }
    if (T.has.lender) {
      const can = Math.max(0, Math.floor(tabLimit() - S.debt)), rest = Math.max(0, dueNow() - S.loan.pre);
      h += `<h3>金貸しバルド${t === 'kawabe' ? 'の店' : 'の出店'}</h3><div class="card">`;
      if (!S.loan.done) {
        h += `<div>親の借金　残り <b>${fmt(loanLeft())}枚</b>（あと${C.loan.dues.length - S.loan.n}回）</div>` +
          `<div class="sub">次は ${daysLeft()}日後に ${dueNow()}枚${S.loan.pre ? `（うち${S.loan.pre}枚は先に納めた）` : ''}。回を追うごとに額が上がる。</div>`;
      } else h += `<div class="good">親の借金は返し終えた。</div>`;
      h += `<div>ツケ <b class="${S.debt > 0 ? 'bad' : ''}">${fmt(Math.ceil(S.debt))}枚</b>　<span class="sub">上限 ${tabLimit()}枚（返済が重くなるほど、借りられる額も増える）。利子は1日${(C.tabInterest * 100).toFixed(1)}%。次の返済日にまとめて取り立て。</span></div>` +
        `<div class="qbtns">` + (!S.loan.done ? `<button class="b" data-a="prepay" ${rest > 0 && S.gold > 0 ? '' : 'disabled'}>先に納める</button>` : '') +
        `<button class="b" data-a="repay" ${S.debt > 0 && S.gold > 0 ? '' : 'disabled'}>ツケを返す</button>` +
        `<button class="b pri" data-a="borrow" ${can > 0 ? '' : 'disabled'}>借りる（あと${can}）</button></div>` +
        `<div class="sub">旅じたくの画面で、荷に保険をかけることもできる。</div></div>`;
    }
    if (T.has.map) {
      h += `<h3>地図屋</h3><div class="card row"><div class="grow">このあたりの地図<div class="sub">近くの町と道がわかる</div></div><button class="b pri" data-a="mapBuy" data-k="local">${C.mapLocal}枚</button></div>` +
        `<div class="card row"><div class="grow">国じゅうの地図<div class="sub">国の中の、すべての町と道がわかる</div></div><button class="b pri" data-a="mapBuy" data-k="full">${C.mapFull}枚</button></div>`;
    }
    if (t === C.startTown) h += viewHome();
    h += viewShop();
    return h;
  }
  // 貸し倉庫：荷を寝かせて、祭りや冬の値上がりを待つ
  function viewStore() {
    const t = S.town, st = S.store[t] || {}, ks = Object.keys(st), w = storeWeight(t);
    let h = `<h3>貸し倉庫</h3><div class="card"><div class="sub">荷を預けて、値が上がる時を待てる。預けている町ごとに1日${C.store.rent}枚。1つの町に${C.store.cap}kgまで。傷む品は倉庫でも傷む。</div>` +
      `<div>預けている荷 <b>${w}/${C.store.cap}kg</b></div>`;
    h += ks.map((g) => `<div class="row" style="padding:4px 0"><div class="grow">${D.GOODS[g].icon} ${D.GOODS[g].name} ${qtyStr(g, st[g].qty)}<span class="sub">　仕入れ ${fmt(st[g].cost / st[g].qty)}枚・今の売値 ${banned(t, g) ? '禁制' : fmt(sellNow(t, g, fresh(g, st[g].age))) + '枚'}</span></div>` +
      `<button class="b" data-a="storeTake" data-g="${g}">出す</button></div>`).join('');
    const mine = Object.keys(S.cargo);
    if (mine.length) h += `<div class="sub" style="margin-top:6px">手持ちの荷を預ける</div>` + mine.map((g) =>
      `<div class="row" style="padding:4px 0"><div class="grow">${D.GOODS[g].icon} ${D.GOODS[g].name} ${qtyStr(g, S.cargo[g].qty)}</div><button class="b" data-a="storePut" data-g="${g}">預ける</button></div>`).join('');
    const others = storeTowns().filter((x) => x !== t);
    if (others.length) h += `<div class="sub">ほかの町の倉庫：${others.map((x) => `${D.TOWNS[x].name}（${storeWeight(x)}kg）`).join('、')}</div>`;
    return h + `</div>`;
  }
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
      return h + `<div class="card"><div class="name">🏪 露店を出す</div><div class="sub">預けた荷を、${L.every}日に1度の市の日に、1品${L.rate}個ずつ売ってくれる。自分で卸すより高く売れ、値崩れもしにくい。` +
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

  function statCard() {
    if (!S.me) return '';
    const bd = buddy();
    return `<div class="card"><div class="name">${S.me.gen}代目・${fullName()}<span class="sub">　難しさ：${C.diff[S.diff].name}</span></div>` +
      STAT_KEYS.map((k) => {
        const base = S.me.st[k], v = eff(k), up = S.me.up[k], use = S.me.use[k] || 0, help = bd && bd.stat === k;
        return `<div class="strow1"><span class="stn">${ST[k].icon}${ST[k].name}</span><span class="bar">${'●'.repeat(Math.min(7, v))}${'○'.repeat(Math.max(0, 5 - v))}</span><b>${v}</b>` +
          `<span class="sub">${up ? '（伸びた）' : `（${ST[k].grow} ${Math.min(use, C.grow[k])}/${C.grow[k]}で+1）`}${help ? `＋${bd.name}` : ''}</span></div>` +
          `<div class="sub stdoes">${ST[k].does}（生まれつき ${base}）</div>`;
      }).join('') +
      (S.cart.type === 'basket' && sd('body') ? `<div class="sub">${hit('body', `背負い籠 ${capNow()}kg（ふつうは${cartT().cap}kg）`)}</div>` : '') + `</div>`;
  }
  function viewBook() {
    const cart = cartT(), cost = dailyCost(), names = ['', '行商人', '荷車商人', '店主'];
    let h = `<h2>帳簿</h2><div class="mapwrap"><canvas id="scene"></canvas></div>` +
      `<p class="sub">いまの姿：${names[stage()]}（${cart.name}${S.shop ? '・' + C.shop[S.shop.lv].name : ''}${S.abroad ? '・隣国との商いを許された' : ''}）</p>` + statCard() + dueCard();
    h += `<div class="card"><div class="sub">次の目標</div><div class="name">${goalText()}</div></div>`;
    h += `<h3>お金</h3><div class="card stat"><div><span>手持ち</span> ${fmt(S.gold)}枚</div><div><span>1日の出費</span> ${cost.total}枚</div>` +
      `<div><span>親の借金の残り</span> ${fmt(loanLeft())}枚</div><div><span>ツケ</span> ${fmt(Math.ceil(S.debt))}枚</div></div>`;
    if (!S.loan.done) {
      h += `<div class="card"><div class="name">返済の予定</div><div class="sub">${C.loan.every}日ごと（季節の終わり）。` +
        C.loan.dues.map((v, i) => (i < S.loan.n ? `<s>${dueOf(i)}</s>` : i === S.loan.n ? `<b class="gold">${dueOf(i)}</b>` : dueOf(i))).join(' → ') + ` 枚</div></div>`;
    }
    h += `<h3>荷車と護衛</h3><div class="card"><div class="name">${cart.icon} ${cart.name}</div><div class="sub">${cart.desc}</div>` +
      `<div class="stat"><div><span>荷の重さ</span> ${cargoWeight()}/${capNow()}kg</div><div><span>具合</span> ${Math.round(S.cart.hp)}%</div>` +
      `<div><span>護衛</span> ${S.guards}/${cart.guards}人</div><div><span>戦う力</span> ${power(false)}</div>` +
      `<div><span>道連れ</span> ${S.buddy ? buddy().name : 'なし'}</div><div><span>倉庫</span> ${storeTowns().length ? storeTowns().map((x) => D.TOWNS[x].name).join('・') : 'なし'}</div></div></div>`;
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
      `<div><span>山賊を退けた</span> ${S.stats.wins}回</div><div><span>倒した頭</span> ${S.stats.bosses}人</div></div>`;
    h += `<details class="card" open><summary>📖 旅日記（${S.diary.length}行）</summary>` +
      (S.diary.length ? S.diary.slice(-30).reverse().map((x) => `<div class="diary"><span class="sub">${x.d}日目${x.s ? '・' + x.s : ''}</span>　${x.t}</div>`).join('') : `<div class="sub">まだ何も書かれていない。</div>`) + `</details>`;
    const rec = records();
    if (rec.length) {
      h += `<h3>商人録（歴代の記録）</h3>` + rec.map((r) =>
        `<details class="card"><summary>${r.result === '完済' ? '🏅' : '💀'} ${r.gen ? r.gen + '代目・' : ''}${r.who || ''}　${r.result}</summary>` +
        `<div class="sub">${r.day}日目・返済${r.paid}回・${r.cart}・店:${r.shop}・町${r.towns}・最高の旅 +${fmt(r.best)}枚${r.abroad ? '・隣国へ' : ''}${r.diff ? '・' + r.diff : ''}</div>` +
        (r.st ? `<div class="sub">${STAT_KEYS.map((k, i) => `${ST[k].name}${r.st[i]}`).join('　')}</div>` : '') +
        (r.diary ? r.diary.map((x) => `<div class="diary sub">${x}</div>`).join('') : '') + `</details>`).join('');
    }
    h += `<button class="b wide" data-a="help">遊び方を見る</button><button class="b warn wide" data-a="reset">記録を捨てて最初から</button>`;
    return h;
  }
  function helpBody() {
    return `<p>① <b>噂</b>を集める。町に着くと耳に入り、酒場や情報屋でも聞ける。値の噂は「35〜47枚」のような幅つきで、外れることもある。</p>` +
      `<p>② <b>市場</b>で仕入れる。品は袋・樽・反などで数え、重さ（kg）がある。背負い籠は${D.CARTS.basket.cap}kgほど。</p>` +
      `<p>③ <b>旅じたく</b>で行き先と道を決めて出発。街道は安全で遅く、近道は早いが山賊が多い。道中で、迂回するか、川を渡るかなどを自分で決める。</p>` +
      `<p>④ 着いたら<b>札をめくって</b>今日の値を見る。噂が当たれば大もうけ、外れれば損。</p>` +
      `<p>⑤ <b>${C.loan.every}日ごと（季節の終わり）</b>に親の借金を納める。額は上がっていく。足りなければ、まず荷をその町の値で必要なぶんだけ売られ、次に店、最後に荷車。何も残らなければ<b>破産で最初から</b>。</p>` +
      `<p class="sub"><b>遠くへ運ぶほど高く売れる。</b>麦・塩・樽・鉄は、産地から離れるほど値が上がる。産地のとなり町は市場が薄く、たくさん売ると値がすぐ崩れる。籠ひとつなら近場で足りるが、荷車を持ったら遠くへ。</p>` +
      `<p class="sub">1日は朝・昼・夕・夜。売り買いや酒場で1刻ずつ進み、夜は店が閉まる。昼に出発すれば、昼に着く。</p>` +
      `<p class="sub">季節で値が変わる。暦の行事は誰でも知っている。予定外の出来事は噂でしか分からない。</p>` +
      `<p class="sub"><b>町</b>では、顔役の頼みごと、道連れ、護衛、隊商、倉庫、車屋、金貸しが使える。</p>`;
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
  function drawScene(cv) {
    const c = sceneCtx(cv, 120);
    if (!c) return;
    const { ctx, w, gy } = c, type = S.cart.type;
    const rect = (x, y, ww, hh, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, ww, hh); };
    const wheel = (x, r) => { ctx.beginPath(); ctx.arc(x, gy - r, r, 0, 7); ctx.fillStyle = '#5a3d1c'; ctx.fill(); ctx.beginPath(); ctx.arc(x, gy - r, r * 0.4, 0, 7); ctx.fillStyle = '#c9a66b'; ctx.fill(); };
    const person = (px, col) => {
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(px, gy - 34); ctx.lineTo(px, gy - 14); ctx.lineTo(px - 5, gy); ctx.moveTo(px, gy - 14); ctx.lineTo(px + 5, gy); ctx.stroke();
      ctx.fillStyle = '#e8c9a0'; ctx.beginPath(); ctx.arc(px, gy - 40, 6, 0, 7); ctx.fill(); ctx.stroke();
    };
    const px = w * 0.16;
    if (S.buddy) person(px - 20, '#2f5d8a');
    person(px, '#3a2814');
    if (type === 'basket') { rect(px - 14, gy - 36, 10, 16, '#a9793c'); }
    else {
      const big = type === 'horse', mid = type === 'donkey';
      const bw = big ? 54 : mid ? 42 : 28, bh = big ? 22 : mid ? 18 : 14, bx = px + (type === 'handcart' ? 10 : 62);
      rect(bx, gy - bh - 10, bw, bh, '#8a5a2b'); rect(bx, gy - bh - 16, bw, 6, big ? '#e9e2d0' : '#a9793c');
      wheel(bx + 9, 8); if (type !== 'handcart') wheel(bx + bw - 9, 8);
      if (type !== 'handcart') {
        const ax = px + 26, col = big ? '#7a4a22' : '#8d8d86', hh = big ? 26 : 20;
        ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(ax + 12, gy - hh, 16, big ? 9 : 7, 0, 0, 7); ctx.fill();
        rect(ax + 1, gy - hh, 4, hh, col); rect(ax + 20, gy - hh, 4, hh, col);
        ctx.beginPath(); ctx.ellipse(ax - 5, gy - hh - 9, 6, 5, -0.5, 0, 7); ctx.fill();
        rect(ax - 8, gy - hh - (big ? 18 : 22), 3, big ? 6 : 10, col);
      }
    }
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
  function drawHome(cv) {
    const c = sceneCtx(cv, 110);
    if (!c) return;
    const { ctx, w, gy } = c;
    const rect = (x, y, ww, hh, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, ww, hh); };
    const house = (x, s) => { rect(x, gy - 20 * s, 26 * s, 20 * s, '#e9dcc0'); ctx.fillStyle = '#8a5a2b'; ctx.beginPath(); ctx.moveTo(x - 4, gy - 20 * s); ctx.lineTo(x + 13 * s, gy - 34 * s); ctx.lineTo(x + 26 * s + 4, gy - 20 * s); ctx.closePath(); ctx.fill(); };
    for (let i = 0; i < 8; i++) rect(i * w / 8, gy + 6, w / 16, 20, '#d9c36a');
    rect(w * 0.62, gy - 4, w * 0.16, 30, '#7fb0cf');
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
  const closedMsg = '夜は店が閉まっている。朝まで休もう';
  // 市場が閉まっているか。夕方に始めた売り買いは、夜になっても同じ刻のうちは続けられる
  const marketShut = () => isNight() && S.tradedAt !== S.time;
  // 売り買いのもうけを、この町での決算につける
  const book = (v) => { S.stats.profit += v; S.visit.profit += v; };
  // 話術や得意先の優遇が、この売り買いで何枚ぶん効いたか
  function talkNote(tot, dir) {
    const e = edge(S.town);
    if (!e) return '';
    const d = Math.abs(Math.round(tot * e / (dir > 0 ? 1 - e : 1 + e)));
    if (!d) return '';
    const msg = dir > 0 ? (e > 0 ? `${d}枚 安く買える` : `${d}枚 高くつく`) : (e > 0 ? `${d}枚 高く売れる` : `${d}枚 安くなる`);
    return `<br>${hit('talk', msg)}`;
  }
  const actions = {
    tab(d) { ui.tab = d.id; window.scrollTo(0, 0); render(); },
    dest(d) { ui.dest = d.id || null; ui.insure = false; render(); window.scrollTo(0, 0); },
    help() { modal({ title: '遊び方', body: helpBody(), buttons: [{ label: 'とじる', cls: 'pri' }] }); },
    reset() {
      confirmBox('記録を捨てる', '<p>今の記録は消える。よい？</p>', '最初から', () => {
        wipeSave(); newGame(); save(); ui = { tab: 'market', dest: null, insure: false }; render(); intro();
      });
    },

    buy(d) {
      const g = d.g, t = S.town;
      if (!sellsHere(t, g)) return;
      if (marketShut()) return toast(closedMsg);
      const max = maxBuy(t, g);
      if (max <= 0) return toast(Math.floor(S.stock[t][g]) <= 0 ? '売り切れ。数日待てば入る' : freeWeight() < D.GOODS[g].w ? `重くてもう積めない（1${U(g)} ${D.GOODS[g].w}kg、空きは${freeWeight()}kg）` : 'お金が足りない');
      openQty({
        title: `${D.GOODS[g].name}を買う（1${U(g)} ${D.GOODS[g].w}kg）`, max, okLabel: '買う', unit: U(g),
        calc: (q) => { const r = quote(t, g, q, 1); return `合計 ${G(r.tot)}　<span class="sub">${q * D.GOODS[g].w}kg（積めるのはあと ${freeWeight() - q * D.GOODS[g].w}kg）</span>${talkNote(r.tot, 1)}`; },
        ok: (q) => {
          const r = quote(t, g, q, 1);
          S.gold -= r.tot; S.market[t][g] = r.dev; S.stock[t][g] -= q; addCargo(g, q, r.tot);
          useStat('talk'); tradeTick(); settle();
        }
      });
    },
    sell(d) {
      const g = d.g, t = S.town, own = S.cargo[g];
      if (!own || banned(t, g)) return;
      if (marketShut()) return toast(closedMsg);
      const avg = own.cost / own.qty, f = fresh(g, own.age);
      openQty({
        title: `${D.GOODS[g].name}を売る`, max: own.qty, okLabel: '売る', unit: U(g),
        calc: (q) => {
          const r = quote(t, g, q, -1, f), pf = r.tot - avg * q;
          return `合計 ${G(r.tot)}　<span class="${pf >= 0 ? 'good' : 'bad'}">${pf >= 0 ? '利益 +' : '損 '}${fmt(pf)}枚</span>${talkNote(r.tot, -1)}`;
        },
        ok: (q) => { sellGood(g, q); useStat('talk'); tradeTick(); settle(); }
      });
    },
    // 持っている荷をまとめて売る（頼まれごと・得意先のぶんは残す）
    sellAll() {
      const t = S.town;
      if (marketShut()) return toast(closedMsg);
      const list = Object.keys(S.cargo).filter((g) => !banned(t, g)).map((g) => ({ g, q: S.cargo[g].qty - Math.min(S.cargo[g].qty, reserved(g)) })).filter((x) => x.q > 0);
      if (!list.length) return toast('売れる荷がない');
      let tot = 0, pf = 0;
      for (const x of list) { const c = S.cargo[x.g], r = quote(t, x.g, x.q, -1, fresh(x.g, c.age)); x.tot = r.tot; tot += r.tot; pf += r.tot - (c.cost / c.qty) * x.q; }
      const kept = Object.keys(S.cargo).filter((g) => reserved(g) > 0);
      confirmBox('まとめて売る', list.map((x) => `<div>${D.GOODS[x.g].icon} ${D.GOODS[x.g].name} ${qtyStr(x.g, x.q)}　${G(x.tot)}</div>`).join('') +
        `<p>合計 ${G(tot)}　<span class="${pf >= 0 ? 'good' : 'bad'}">${pf >= 0 ? '利益 +' : '損 '}${fmt(pf)}枚</span></p>` +
        (kept.length ? `<p class="sub">頼まれ物（${kept.map((g) => D.GOODS[g].name).join('・')}）は、約束のぶんだけ残す。</p>` : ''), '全部売る', () => {
          for (const x of list) sellGood(x.g, x.q);
          useStat('talk', list.length); tradeTick(); settle();
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
      S.gold += o.reward; book(o.reward - avg * o.n); S.stats.orders++;
      addRep(o.t, o.rep);
      S.done[o.t] = (S.done[o.t] || 0) + 1;
      S.orders.splice(+d.i, 1);
      notices.push({ title: '📜 約束を果たした', body: `<p>${D.TOWNS[o.t].who.name}に${D.GOODS[o.g].name}${qtyStr(o.g, o.n)}を納めた。</p><p>報酬 ${G(o.reward)}　評判 +${o.rep}</p>` + (patronReady(o.t) ? `<p class="good">${D.TOWNS[o.t].who.name}が、続けての商いを持ちかけてきた（町の画面で）。</p>` : '') });
      tell('order1');
      settle();
    },
    patron() {
      const t = S.town;
      if (!patronReady(t)) return;
      const w = D.TOWNS[t].who.want;
      S.patrons.push({ t, g: w.g, n: w.n, n0: w.n, lv: 0, due: day() + C.patronEvery, streak: 0, miss: 0 });
      addDiary(`${D.TOWNS[t].name}の${D.TOWNS[t].who.name}が得意先になった。`);
      tell('patron', { name: D.TOWNS[t].who.name, days: C.patronEvery });
      settle();
    },
    supply(d) {
      const p = S.patrons[+d.i], own = p && S.cargo[p.g];
      if (!p || p.t !== S.town || !own || own.qty < p.n) return;
      const avg = own.cost / own.qty, payv = patronPay(p), n = p.n;
      own.cost -= avg * n; own.qty -= n;
      if (own.qty <= 0) delete S.cargo[p.g];
      S.gold += payv; book(payv - avg * n); S.stats.supplies++;
      addRep(p.t, C.patronRep);
      p.streak++; p.miss = 0; p.due = day() + C.patronEvery;
      let grew = '';
      if (p.streak % C.patronGrow === 0 && p.lv < C.patronLv.length - 1) {       // 守りつづけると、注文が大きくなる
        p.lv++; p.n = Math.round(p.n0 * C.patronLv[p.lv]);
        grew = `<p class="good">「次からは${qtyStr(p.g, p.n)}頼むよ。」注文が大きくなった（代金 ${patronPay(p)}枚）。</p>`;
        addDiary(`${D.TOWNS[p.t].who.name}の注文が${qtyStr(p.g, p.n)}に増えた。`);
      }
      const r = Math.random() < 0.5 ? omenRumor('patron') : randomPrice('patron');
      notices.push({
        title: '🤝 得意先に納めた',
        body: `<p>${D.TOWNS[p.t].who.name}に${D.GOODS[p.g].name}${qtyStr(p.g, n)}を納めた。代金 ${G(payv)}　評判 +${C.patronRep}</p>` +
          (p.streak === C.patronTrust ? `<p class="good">信用を得た。この町での売り買いが${Math.round(C.patronEdge * 100)}%有利になる。</p>` : '') + grew +
          (r ? `<p class="sub">「ついでに、いい話をひとつ。」</p>${rumorLine(r)}` : '') + `<p class="sub">次は${C.patronEvery}日後まで。</p>`
      });
      settle();
    },

    rest() { advance(4 - (S.time % 4)); settle(); if (!S.dead) toast('朝になった'); },
    work() {
      if (isNight()) return toast('夜は働き口がない。朝まで休もう');
      advance(4 - (S.time % 4)); if (!S.dead) S.gold += C.laborPay;
      settle(); if (!S.dead) toast(`1日働いて ${C.laborPay}枚 稼いだ`);
    },
    rumor() {
      if (isNight()) return toast(closedMsg);
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
    broker(d) {
      const t = d.t;
      if (!D.TOWNS[S.town].has.info || !D.TOWNS[t] || !inPlay(t) || t === S.town) return;
      if (isNight()) return toast(closedMsg);
      if (S.gold < C.brokerCost) return toast('お金が足りない');
      const mine = [...new Set(Object.keys(D.TOWNS[S.town].stock).concat(Object.keys(S.cargo)))].filter((g) => !banned(t, g));
      const rest = Object.keys(D.GOODS).filter((g) => goodInPlay(g) && !banned(t, g) && !mine.includes(g)).sort((a, b) => BASE[t][b] - BASE[t][a]);
      const goods = mine.concat(rest).slice(0, C.brokerGoods), got = [];
      for (const g of goods) { const r = priceRumor('broker', t, g); if (r) got.push(r); }
      if (!got.length) return toast('その町の話は、いまは無いそうだ');
      S.gold -= C.brokerCost;
      notices.push({ title: `🕵️ 情報屋：${D.TOWNS[t].name}の値`, body: got.map(rumorLine).join('') + `<p class="sub">「${DIST[S.town][t]}日ばかり前の話だ。そこは割り引いて聞いてくれ。」</p>` });
      settle();
    },
    // 情報屋：あいまいな噂の、伏せられた部分（どの町の、何の話か）を聞く。本当かどうかまでは分からない
    clarify(d) {
      const r = S.rumors.find((x) => x.id === +d.id);
      if (!r || !r.hide || !D.TOWNS[S.town].has.info) return;
      if (isNight()) return toast(closedMsg);
      if (S.gold < C.brokerCost) return toast('お金が足りない');
      S.gold -= C.brokerCost;
      const was = rumorText(r);
      r.hide = null;
      if (!S.named[r.t]) { S.named[r.t] = true; if (!S.seen[r.t]) S.seen[r.t] = 1; }
      notices.push({ title: '🕵️ 情報屋', body: `<p class="sub">「${was.replace(/<[^>]+>/g, '')}」という話だが…</p><p>「それは<b>${D.TOWNS[r.t].name}</b>の<b>${D.GOODS[r.g].name}</b>の話だろう。どこの誰が言い出したかは、あたしにもわからないがね。」</p>` });
      settle();
    },
    guard(d) {
      if (+d.n > 0) {
        if (!D.TOWNS[S.town].has.guard) return toast('この町に口入れ屋はない');
        if (S.guards >= cartT().guards) return toast(cartT().guards ? `${cartT().name}では${cartT().guards}人まで` : `${cartT().name}では護衛を連れて歩けない`);
        if (S.gold < C.guardHire) return toast('お金が足りない');
        S.gold -= C.guardHire; S.guards++;
      } else {
        if (S.guards <= 0) return toast('護衛がいない');
        S.guards--;
      }
      save(); render();
    },
    buddyHire(d) {
      const c = D.COMPANIONS[d.k];
      if (!c || c.town !== S.town || S.buddy === d.k) return;
      if (S.gold < C.buddyHire) return toast('お金が足りない');
      const old = buddy();
      confirmBox(`${c.name}を誘う`, `<p class="story">${c.line}</p><p>${ST[c.stat].icon}${ST[c.stat].name} +${C.buddyBonus}。手付け ${G(C.buddyHire)}、日給 ${C.buddyWage}枚。</p>` +
        (old ? `<p class="sub">連れて歩けるのは1人。${old.name}とは別れることになる。</p>` : ''), '誘う', () => {
          S.gold -= C.buddyHire; S.buddy = d.k;
          addDiary(`${c.name}（${c.role}）が道連れになった。`);
          S.told.buddy = 0; tell('buddy', { name: c.name, line: c.line });
          settle();
        });
    },
    buddyBye() {
      const b = buddy();
      if (!b) return;
      confirmBox(`${b.name}と別れる`, `<p>日給はかからなくなる。${D.TOWNS[b.town].name}に行けば、また誘える。</p>`, '別れる', () => { addDiary(`${b.name}と別れた。`); S.buddy = null; settle(); });
    },
    caravan(d) {
      const c = ensureCaravans(S.town)[+d.i];
      if (!c) return;
      if (isNight()) return toast(closedMsg);
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
      if (!D.TOWNS[S.town].has.cart) return;
      if (c.only && !c.only.includes(S.town)) return toast(`${c.name}は、${c.only.filter(inPlay).map((x) => D.TOWNS[x].name).join('か')}の車屋でしか買えない`);
      if (S.gold < cost) return toast('お金が足りない');
      if (cargoWeight() > c.cap) return toast('今の荷が積みきれない');
      confirmBox(`${c.name}を買う`, `<p>${c.desc}</p><p>積める重さ ${c.cap}kg　支払い ${G(Math.max(0, cost))}${c.feed ? `　餌代 1日${c.feed}枚` : ''}</p>`, '買う', () => {
        S.gold -= cost; S.cart = { type: d.id, hp: 100 }; S.guards = Math.min(S.guards, c.guards);
        addDiary(`${c.name}を手に入れた。`);
        settle(); toast(`${c.name}を手に入れた`);
      });
    },
    sellCart() {
      const tin = tradeIn(), c = cartT();
      if (S.cart.type === 'basket') return;
      const cap = D.CARTS.basket.cap + C.stat.bodyKg * sd('body');
      if (cargoWeight() > cap) return toast(`荷が重すぎる（背負い籠は${cap}kgまで）`);
      confirmBox(`${c.name}を売る`, `<p>${G(tin)} で売り、背負い籠に戻る。護衛とも別れる。</p>`, '売る', () => {
        S.gold += tin; S.cart = { type: 'basket', hp: 100 }; S.guards = 0;
        addDiary(`${c.name}を手放した。`);
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
      const max = Math.max(0, Math.floor(tabLimit() - S.debt));
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
        addRep(S.town, p.rep);
        addDiary(`故郷の村に${p.name}を贈った。`);
        tell(d.k);
        settle();
      });
    },
    // 倉庫に預ける・出す
    storePut(d) {
      const g = d.g, t = S.town, own = S.cargo[g];
      if (!D.TOWNS[t].has.store || !own) return;
      const max = Math.min(own.qty, Math.floor((C.store.cap - storeWeight(t)) / D.GOODS[g].w));
      if (max <= 0) return toast('倉庫がいっぱい');
      openQty({
        title: `${D.GOODS[g].name}を倉庫に預ける`, max, okLabel: '預ける', unit: U(g),
        calc: (q) => `<span class="sub">${q * D.GOODS[g].w}kg。倉庫代は、荷を預けている町ごとに1日${C.store.rent}枚。${D.GOODS[g].shelf ? '<span class="bad">この品は倉庫でも傷む。</span>' : ''}</span>`,
        ok: (q) => {
          const st = S.store[t] || (S.store[t] = {}), avg = own.cost / own.qty, it = st[g] || (st[g] = { qty: 0, cost: 0, age: own.age });
          it.age = (it.age * it.qty + own.age * q) / (it.qty + q); it.qty += q; it.cost += avg * q;
          own.qty -= q; own.cost -= avg * q; if (own.qty <= 0) delete S.cargo[g];
          tell('store'); settle();
        }
      });
    },
    storeTake(d) {
      const g = d.g, t = S.town, it = S.store[t] && S.store[t][g];
      if (!it) return;
      const max = Math.min(it.qty, Math.floor(freeWeight() / D.GOODS[g].w));
      if (max <= 0) return toast(`重くて積めない（空きは${freeWeight()}kg）`);
      openQty({
        title: `${D.GOODS[g].name}を倉庫から出す`, max, okLabel: '出す', unit: U(g),
        calc: (q) => `<span class="sub">${q * D.GOODS[g].w}kg（積めるのはあと ${freeWeight() - q * D.GOODS[g].w}kg）</span>`,
        ok: (q) => {
          const avg = it.cost / it.qty;
          addCargo(g, q, avg * q, it.age);
          it.qty -= q; it.cost -= avg * q; if (it.qty <= 0) delete S.store[t][g];
          settle();
        }
      });
    },
    insure() { if (!canInsure()) return; ui.insure = !ui.insure; render(); },

    shopOpen() {
      const L = C.shop[1], t = S.town;
      if (S.shop || D.TOWNS[t].kind === 'village') return;
      if (S.rep[t] < L.rep) return toast(`この町の評判が足りない（${L.rep}必要）`);
      if (S.gold < L.cost) return toast('お金が足りない');
      confirmBox('露店を出す', `<p>${D.TOWNS[t].name}に露店を出す。費用 ${G(L.cost)}、場所代 1日${L.rent}枚。</p><p class="sub">この版では、店は1つだけ持てる。</p>`, '出す', () => {
        S.gold -= L.cost; S.shop = { town: t, lv: 1, stock: {}, till: 0 }; addDiary(`${D.TOWNS[t].name}に露店を出した。`); settle();
      });
    },
    shopUp() {
      const N = C.shop[2], t = S.town;
      if (!S.shop || S.shop.town !== t || S.shop.lv !== 1) return;
      if (S.rep[t] < N.rep) return toast(`この町の評判が足りない（${N.rep}必要）`);
      if (S.gold < N.cost) return toast('お金が足りない');
      confirmBox('小さな店に建て替える', `<p>費用 ${G(N.cost)}。店賃と店番で1日${N.rent + N.wage}枚。</p>`, '建て替える', () => { S.gold -= N.cost; S.shop.lv = 2; addDiary(`${D.TOWNS[t].name}に小さな店を構えた。`); settle(); });
    },
    shopTake() {
      if (!S.shop || S.shop.town !== S.town || S.shop.till <= 0) return;
      const n = S.shop.till; S.gold += n; S.shop.till = 0;
      settle(); toast(`売上金 ${fmt(n)}枚 を受け取った`);
    },
    shopClose() {
      if (!S.shop || S.shop.town !== S.town) return;
      const v = closeValue();
      confirmBox('店をたたむ', `<p>店を手放し、${G(v)} を受け取る。評判はそのまま残る。</p>`, 'たたむ', () => { S.gold += v; S.shop = null; addDiary('店をたたんだ。'); settle(); });
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
      if (isNight()) return toast('夜は出発できない。朝まで休もう');
      if (roadClosed(d.r)) return toast('雪で閉じている。春まで通れない');
      let ins = false;
      if (ui.insure && canInsure()) { const pm = premium(); if (S.gold < pm) return toast('保険の掛け金が足りない'); S.gold -= pm; ins = pm; }
      ui.insure = false;
      startTravel(d.r, false, ins);
    }
  };
  // 品を q 個、この町で売る（値崩れ・評判・決算をつける）
  function sellGood(g, q) {
    const t = S.town, own = S.cargo[g], avg = own.cost / own.qty, r = quote(t, g, q, -1, fresh(g, own.age));
    S.gold += r.tot; S.market[t][g] = r.dev; book(r.tot - avg * q);
    addRep(t, Math.min(2, r.tot / (BASE[t][g] >= 1.3 ? 80 : 240)));
    own.cost -= avg * q; own.qty -= q;
    if (own.qty <= 0) delete S.cargo[g];
    return r.tot;
  }
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.a];
    if (fn) fn(el.dataset);
  });

  // ---------- 道中 ----------
  function tlog(msg, cls) { travel.log.push(`<div class="${cls || ''}">${msg}</div>`); const el = $('#rlog'); if (el) el.innerHTML = travel.log.join(''); }
  // 町を出るとき、その町での商いを決算する（実際に売ったもうけ − 来るまでの出費 − 失った荷）。最高の旅は、ここで記録する
  function closeVisit() {
    const v = S.visit, net = v.profit - Math.max(0, v.spent) - v.lost;
    if (v.profit !== 0 && net > S.stats.bestTrip) { S.stats.bestTrip = net; addDiary(`${D.TOWNS[S.town].name}での商いで、これまでで最高のもうけ（+${fmt(net)}枚）。`); }
    S.visit = { profit: 0, spent: 0, lost: 0 };
  }
  function startTravel(rid, caravan, premiumPaid) {
    closeVisit();
    const i = routeInfo(rid, caravan), r = i.r, cost0 = cargoCost();
    recordMemo(S.town);
    travel = { rid, from: S.town, to: i.to, days: i.days, caravan, frac: 0, log: [], queue: [], lost: 0, gold0: S.gold + (premiumPaid || 0), cost0, band: null, insured: !!premiumPaid, premium: premiumPaid || 0, insLost: 0 };
    const choices = [];
    if (!caravan && i.days >= 3 && Math.random() < C.nightChance) choices.push('night');
    if (!caravan && i.days >= 3 && cargoCount() > 0 && (daysLeft() <= i.days || S.orders.concat(S.patrons).some((o) => o.due - day() <= i.days))) choices.push('hurry');
    if (S.rain && Math.random() < C.riverChance) choices.push('river');
    if (Math.random() < C.sideChance) choices.push('side');
    while (choices.length > C.maxChoices) choices.splice(Math.floor(Math.random() * choices.length), 1);
    for (const c of choices) travel.queue.push(c);
    if (i.patrol && !caravan && Math.random() < C.patrol.chance) travel.queue.push('patrol');   // 街道の見回り
    if (i.boss && !caravan) travel.queue.push('boss');                                           // 頭の縄張り
    else if (Math.random() < banditChance(i.danger, caravan)) travel.queue.push(!caravan && Math.random() < clamp(C.scout + 0.1 * S.guards + C.stat.senseScout * sd('sense'), 0.05, 0.97) ? 'sign' : 'bandit');
    if (Math.random() < i.breakP) travel.queue.push('break');
    if (r.border) travel.queue.push('border');
    $('#tabs').classList.add('hidden');
    $('#main').innerHTML = `<h2>${townName(travel.from)} → ${townName(travel.to)}</h2><div class="mapwrap"><canvas id="map"></canvas></div>` +
      `<div class="card roadlog" id="rlog"></div>`;
    window.scrollTo(0, 0);
    tlog(`${caravan ? '隊商とともに' : D.ROAD_TYPES[r.type].name + 'を'}歩きだした。${i.days}日の道のり。${S.rain ? '雨が降っている。' : ''}${travel.insured ? `荷に保険をかけた（掛け金 ${travel.premium}枚）。` : ''}`);
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
  function nextEvent() {
    if (!travel) return;
    const ev = travel.queue.shift();
    if (!ev) return travel.frac >= 1 - 1e-9 ? arrive() : walk(1, arrive);
    const run = () => {
      if (ev === 'night') nightEvent(); else if (ev === 'hurry') hurryEvent(); else if (ev === 'river') riverEvent(); else if (ev === 'side') sideEvent();
      else if (ev === 'sign') signEvent(); else if (ev === 'bandit') banditEvent(); else if (ev === 'boss') bossEvent(); else if (ev === 'patrol') patrolEvent();
      else if (ev === 'border') borderEvent(); else breakEvent();
    };
    const target = Math.min(0.92, travel.frac + (1 - travel.frac) / (travel.queue.length + 2));
    if (target > travel.frac + 0.05) walk(target, run); else run();
  }
  const next = () => { renderHud(); nextEvent(); };
  const cont = (label) => [{ label: label || '先へ進む', cls: 'pri', fn: next }];

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
            if (!travel.queue.includes('bandit') && !travel.queue.includes('sign') && !travel.queue.includes('boss') && Math.random() < banditChance(info.danger, false) * C.nightBandit + 0.04) travel.queue.unshift('bandit');
            if (!travel.queue.includes('break') && Math.random() < info.breakP * 0.6) travel.queue.push('break');
            next();
          }
        }
      ]
    });
  }
  function hurryEvent() {
    const left = daysLeft(), why = left <= travel.days ? `返済日まで、あと${left}日。` : '約束の日が迫っている。', n = lossUnits(C.hurryDump);
    const btns = [{ label: 'このまま進む', cls: 'pri', fn: () => { tlog('荷は捨てなかった。'); next(); } }];
    if (n > 0) btns.push({ label: `📦 荷を${n}個捨てて急ぐ（1日早く着く）`, fn: () => { const k = loseCargo(C.hurryDump, false); travel.days = Math.max(1, travel.days - 1); tlog(`📦 荷 ${k}個を道ばたに置き、先を急いだ。`, 'bad'); next(); } });
    modal({
      title: '⏳ 間に合うか',
      body: `<p>${why}このままの足では、着くのは${travel.days}日後だ。荷を軽くすれば、1日縮められる。</p>` +
        `<p class="sub">${n > 0 ? `捨てるのは荷の${Math.round(C.hurryDump * 10)}割（${n}個）。` : '荷が少なすぎて、捨てても変わらない。'}</p>`,
      buttons: btns
    });
  }
  function riverEvent() {
    const wait = rndi(1, 2), fail = clamp(C.riverFail - C.stat.bodyRiver * sd('body'), 0.05, 0.9), b = sd('body');
    modal({
      title: '🌊 川が増水している',
      body: `<p>雨で川がふくれ、浅瀬が見えない。濁った水が、渡し場の杭を洗っている。</p>` +
        `<p class="sub">無理に渡れば、荷を流されるかもしれない（約${Math.round(fail * 100)}%）。${b ? hit('body', b > 0 ? '足腰が強く、流されにくい' : '足腰が弱く、流されやすい') : ''}</p>`,
      buttons: [
        { label: '🌉 上流の橋へ回る（+1日）', cls: 'pri', fn: () => { travel.days += 1; tlog('🌉 上流の橋まで回り道をした。1日遅れた。'); next(); } },
        { label: `⏳ 水が引くのを待つ（+1〜2日）`, fn: () => { travel.days += wait; tlog(`⏳ 水が引くまで ${wait}日待った。`); next(); } },
        {
          label: `🌊 このまま渡る（荷を流される恐れ）`, fn: () => {
            if (Math.random() < fail) {
              const n = loseCargo(C.riverLoss, true); tlog(`🌊 流れに足を取られ、荷 ${n}個を流された。`, 'bad');
              modal({ title: '流された', body: `<p class="bad">腰まで水に浸かったところで、荷がひとつ、またひとつと流れていった。${n}個を失った。</p>`, buttons: cont() });
            } else { tlog('🌊 増水した川を渡りきった。', 'good'); modal({ title: '渡りきった', body: '<p class="good">息を詰めて、ひと足ずつ。向こう岸に上がったとき、膝が笑っていた。</p>', buttons: cont() }); }
          }
        }
      ]
    });
  }
  function sideEvent() {
    modal({
      title: '🧭 道ばたの旅人',
      body: `<p>車輪の外れた荷車のそばで、旅の商人が途方に暮れている。手を貸せば半日はつぶれる。</p>`,
      buttons: [
        { label: '通り過ぎる', cls: 'pri', fn: () => { tlog('旅人に会ったが、先を急いだ。'); next(); } },
        {
          label: '🤝 手を貸す（+1日）', fn: () => {
            travel.days += 1; addRep(travel.to, 2);
            const keep = S.town; S.town = travel.to;
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
  function rollBand() {
    const info = routeInfo(travel.rid), worth = cargoWorth();
    const roll = Math.random(), big = day() >= C.safeDays && roll < clamp(0.2 + worth / 1500 + (info.danger >= 3 ? 0.2 : 0), 0, 0.8);   // はじめの季節は、山賊団は現れない
    const B = C.bandits[big ? 'gang' : 'thief'];
    travel.band = { big, ep: rnd(B.min, B.max) };
  }
  function signEvent() {
    rollBand();
    useStat('sense');
    const big = travel.band.big, hide = clamp(C.hideOk + C.stat.senseHide * sd('sense'), 0.05, 0.97), sv = sd('sense');
    modal({
      title: '👣 道に足跡',
      body: `<p>${big ? '踏み荒らされた草。足跡は多い。尾根の向こうに、焚き火の煙が上がっている。<b>山賊団</b>らしい。' : '藪の枝が折れている。足跡はひとり分。<b>こそ泥</b>が待ち伏せているようだ。'}</p>` +
        `<p class="sub">まだ気づかれていない。こちらの力 ${power(false)}（護衛${S.guards}人）。荷の値打ち ${fmt(cargoWorth())}枚。${sv > 0 ? hit('sense', '先に気づいた') : ''}</p>`,
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
          label: `🌿 身をひそめて、やり過ごす（成功 約${Math.round(hide * 100)}%）`, fn: () => {
            if (Math.random() < hide) {
              tlog('🌿 藪にひそみ、山賊をやり過ごした。', 'good'); travel.band = null;
              modal({ title: 'やり過ごした', body: '<p class="good">息を殺して待つ。足音が近づき、遠ざかった。</p>', buttons: cont() });
            } else { tlog('🌿 ひそんだが、見つかった。', 'bad'); travel.ambush = true; banditEvent(); }
          }
        },
        { label: '⚔️ そのまま進む', fn: () => banditEvent() }
      ]
    });
  }
  function powerLine(caravan) {
    const a = sd('arm');
    return `こちらの力 <b>${power(caravan)}</b>（${caravan ? '隊商の護衛つき' : '護衛' + S.guards + '人'}）${a ? ' ' + hit('arm', `自分の力 ${selfPower()}`) : ''}`;
  }
  function banditEvent() {
    if (!travel.band) rollBand();
    const worth = cargoWorth(), big = travel.band.big;
    const B = C.bandits[big ? 'gang' : 'thief'], ep = travel.band.ep, pp = power(travel.caravan);
    const after = () => { travel.band = null; travel.ambush = false; renderHud(); tell('firstBandit'); nextEvent(); };
    const done = (label) => [{ label: label || '先へ進む', cls: 'pri', fn: after }];
    if (S.gold < 1 && cargoCount() === 0) {
      tlog(`${B.name}に囲まれたが、取るものが何もなかった。`);
      return modal({ title: `🗡️ ${B.name}`, body: '<p>囲まれたが、荷は空、財布も空。あきれ顔で去っていった。</p>', buttons: done() });
    }
    const prob0 = (pp * pp) / (pp * pp + ep * ep), prob = travel.ambush ? prob0 * 0.8 : prob0;
    const odds = prob > 0.66 ? '<span class="good">有利</span>' : prob > 0.4 ? '五分五分' : '<span class="bad">不利</span>';
    const flee = travel.caravan ? 0 : fleeChance(), tk = sd('talk');
    const toll = Math.max(1, Math.ceil((B.tollBase + worth * B.tollRate) * (1 - C.stat.talkToll * tk))), give = lossUnits(B.take);
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
    if (give > 0) btns.push({
      label: `📦 荷の${Math.round(B.take * 10)}割（${give}個）を渡す`, fn: () => {
        const n = loseCargo(B.take, true); tlog(`📦 ${B.name}に荷 ${n}個 を渡した。`, 'bad');
        modal({ title: '見逃してもらった', body: `<p>荷 ${n}個を置いていくと、道をあけた。</p>`, buttons: done() });
      }
    });
    modal({
      title: `🗡️ ${B.name}だ！`,
      body: `<p>${big ? '道の両側から、武器を持った男たちが現れた。' : '木陰から、刃物を持った男が飛び出してきた。'}` +
        `${worth >= C.banditValueRef ? '荷の値打ちを、どこかで嗅ぎつけたらしい。' : ''}</p>` +
        `<p>${powerLine(travel.caravan)}<br>見立て：${odds}</p>` +
        `<p class="sub">荷の値打ち ${fmt(worth)}枚。要求は値打ちに応じて上がる。${tk ? hit('talk', tk > 0 ? '通行料を値切った' : '通行料をふっかけられた') : ''}</p>`,
      buttons: btns
    });
  }
  function fight(prob, B, done) {
    const win = Math.random() < prob;
    useStat('arm');
    modal({ title: '⚔️ 斬り合い', body: `<canvas id="fight"></canvas><p class="sub" style="text-align:center">砂ぼこりが舞う…</p>` });
    playFight($('#fight'), win, () => {
      let body;
      if (win) {
        const loot = rndi(B.loot[0], B.loot[1]);
        S.gold += loot; S.stats.wins++; addRep(travel.to, 2);
        body = `<p class="good">${B.name}を追い払った！</p><p>落としていった財布から ${G(loot)}。行く先の町で評判になるだろう。</p>`;
        tlog(`⚔️ ${B.name}を追い払った。+${loot}枚`, 'good');
      } else {
        const lost = loseCargo(B.loseCargo, true), gold = Math.floor(S.gold * B.loseGold);
        S.gold -= gold; S.stats.robbed++;
        if (S.cart.type !== 'basket') S.cart.hp = Math.max(5, S.cart.hp - 30);
        let g2 = '';
        if (S.guards > 0 && Math.random() < 0.5) { S.guards--; g2 = '護衛が1人、逃げ出した。'; }
        body = `<p class="bad">${B.name}に負けた…</p><p>荷 ${lost}個と ${G(gold)} を奪われた。${g2}</p>`;
        tlog(`⚔️ ${B.name}に負け、荷と金を奪われた。`, 'bad');
        addDiary(`${B.name}に負け、荷${lost}個と${fmt(gold)}枚を奪われた。`);
      }
      renderHud();
      modal({ title: win ? '勝った！' : '負けた…', body, buttons: done() });
    });
  }
  // 山賊の頭。その道を通れば、かならず出くわす。倒せば懸賞金、道はしばらく安全になる
  function bossEvent() {
    const bs = S.boss, worth = cargoWorth(), pp = power(false), prob = (pp * pp) / (pp * pp + bs.power * bs.power);
    const odds = prob > 0.66 ? '<span class="good">有利</span>' : prob > 0.4 ? '五分五分' : '<span class="bad">不利</span>';
    const toll = Math.max(1, Math.ceil((C.boss.tollBase + worth * C.boss.tollRate) * (1 - C.stat.talkToll * sd('talk')))), flee = fleeChance() * 0.7;
    const B = { name: bs.name, loseCargo: C.boss.loseCargo, loseGold: C.boss.loseGold };
    const clash = (p) => {
      const win = Math.random() < p;
      useStat('arm');
      travel.band = { big: true };
      modal({ title: '⚔️ 頭との斬り合い', body: `<canvas id="fight"></canvas><p class="sub" style="text-align:center">砂ぼこりが舞う…</p>` });
      playFight($('#fight'), win, () => {
        travel.band = null;
        if (win) {
          const r = D.ROADS[bs.rid];
          S.gold += bs.bounty; S.stats.wins++; S.stats.bosses++;
          S.safe[bs.rid] = day() + C.boss.safeDays; S.boss = null; S.bossNext = day() + rndi(C.boss.respawn[0], C.boss.respawn[1]);
          addRep(r.a, 4); addRep(r.b, 4);
          tlog(`🏆 山賊の頭「${bs.name}」を倒した。懸賞金 +${bs.bounty}枚`, 'good');
          addDiary(`山賊の頭「${bs.name}」を倒し、懸賞金${bs.bounty}枚を得た。`);
          S.told.boss = 0; tell('boss', { name: bs.name, bounty: bs.bounty });
          renderHud();
          modal({ title: '🏆 頭を倒した！', body: `<p class="good">「${bs.name}」を倒した！</p><p>懸賞金 ${G(bs.bounty)}。この道は、これから${C.boss.safeDays}日のあいだ安全になる。両側の町で、評判が上がった。</p>`, buttons: cont() });
        } else {
          const lost = loseCargo(B.loseCargo, true), gold = Math.floor(S.gold * B.loseGold);
          S.gold -= gold; S.stats.robbed++;
          if (S.cart.type !== 'basket') S.cart.hp = Math.max(5, S.cart.hp - 30);
          if (S.guards > 0) S.guards--;
          tlog(`⚔️ 頭「${bs.name}」に負け、荷と金を奪われた。`, 'bad');
          addDiary(`山賊の頭「${bs.name}」に負け、荷${lost}個と${fmt(gold)}枚を奪われた。`);
          renderHud();
          modal({ title: '負けた…', body: `<p class="bad">「${bs.name}」には歯が立たなかった。</p><p>荷 ${lost}個と ${G(gold)} を奪われた。護衛も1人、倒れた。</p>`, buttons: cont() });
        }
      });
    };
    const btns = [{ label: '⚔️ 戦う', cls: 'pri', fn: () => clash(prob) }];
    btns.push({
      label: '↩️ 引き返す（1日を無駄にする）', fn: () => {
        tlog('↩️ 頭の縄張りの手前で引き返した。');
        travel.to = travel.from; travel.days = 1; travel.back = true; travel.queue = [];
        next();
      }
    });
    if (S.gold >= toll) btns.push({ label: `💰 通行料を払う（${toll}枚）`, fn: () => { S.gold -= toll; tlog(`💰 頭に通行料 ${toll}枚 を払った。`); modal({ title: '通してもらった', body: `<p>${G(toll)} を放ると、頭は鼻で笑って道をあけた。</p>`, buttons: cont() }); } });
    btns.push({
      label: `💨 すり抜ける（成功率 ${Math.round(flee * 100)}%）`, fn: () => {
        if (Math.random() < flee) { tlog('💨 頭の手下をすり抜けた。', 'good'); modal({ title: 'すり抜けた', body: '<p>手下の輪が閉じる前に、全力で駆け抜けた。</p>', buttons: cont() }); }
        else modal({ title: '囲まれた', body: '<p>逃げ道をふさがれた。不利な体勢で戦うしかない。</p>', buttons: [{ label: '⚔️ 応戦する', cls: 'pri', fn: () => clash(prob * 0.7) }] });
      }
    });
    modal({
      title: `🗡️ 山賊の頭「${bs.name}」`,
      body: `<p>道の真ん中に、男がひとり腰を下ろしている。まわりの藪から、手下が十人あまり。手配書の顔だ。</p>` +
        `<p>${powerLine(false)}<br>頭の力 およそ${C.boss.power[0]}〜${C.boss.power[1]}　見立て：${odds}</p>` +
        `<p class="sub">倒せば懸賞金 ${bs.bounty}枚。この道は${C.boss.safeDays}日のあいだ安全になる。</p>`,
      buttons: btns
    });
  }
  function breakEvent() {
    const c = cartT(), n = lossUnits(0.4);
    travel.days += 1;
    const dump = () => {
      const k = loseCargo(0.4, true); S.cart.hp = Math.max(5, S.cart.hp - 20);
      tlog(`🔧 ${c.name}が壊れ、荷 ${k}個 を捨てた。1日遅れた。`, 'bad');
      modal({ title: '荷を捨てた', body: `<p>軽くするしかない。荷 ${k}個を道ばたに置き、だましだまし進む。</p>`, buttons: cont() });
    };
    const btns = [];
    if (S.gold >= c.repair) btns.push({ label: `🔧 直してもらう（${c.repair}枚）`, cls: 'pri', fn: () => { S.gold -= c.repair; tlog(`🔧 ${c.name}が壊れ、${c.repair}枚 で直した。1日遅れた。`); next(); } });
    if (n > 0) btns.push({ label: `📦 荷を4割（${n}個）捨てて進む`, fn: dump });
    if (!btns.length) btns.push({ label: 'だましだまし進む', cls: 'pri', fn: () => { S.cart.hp = Math.max(5, S.cart.hp - 20); tlog(`🔧 ${c.name}が壊れた。1日遅れた。`, 'bad'); next(); } });
    modal({
      title: '🔧 車が壊れた',
      body: `<p>${S.rain ? 'ぬかるみに車輪を取られ、' : '石に乗り上げ、'}${c.name}の車輪が割れた。1日の遅れ。</p>` +
        `<p class="sub">通りがかりの職人に直してもらうか、荷を減らして進むか。</p>`,
      buttons: btns
    });
  }
  // 禁制品のあらため。そのまま通るか、袖の下を渡すか
  function inspectModal(title, head, findP, repTown, logName) {
    const cw = contraWorth();
    const inspect = (p, bribed) => {
      if (Math.random() < p) {
        const n = dropContraband(), fine = Math.ceil(cw * C.fineRate), s = pay(fine);
        addRep(repTown, -8);
        tlog(`🚫 ${logName}で禁制品を没収された。`, 'bad');
        addDiary(`${logName}で禁制品を没収された。`);
        modal({
          title: '🚫 見つかった',
          body: `<p class="bad">${bribed ? '役人は金を受け取ったうえで、荷の底をあらためた。' : '荷の底の包みを、役人の手が探り当てた。'}</p>` +
            `<p>禁制品 ${n}個を没収され、罰金 ${G(fine)}。${s ? 'ツケになった。' : ''}${D.TOWNS[repTown].name}での評判も落ちた。</p>`, buttons: cont()
        });
      } else {
        tlog(bribed ? `🤝 袖の下で${logName}を通った。` : '😮‍💨 禁制品は見つからなかった。', 'good');
        modal({ title: '通してもらえた', body: `<p class="good">${bribed ? '役人は銅貨を袖にしまい、あごで先を示した。' : '役人は荷の上をひと撫でしただけで、手を振った。'}</p>`, buttons: cont() });
      }
    };
    const bribe = Math.ceil(cw * C.bribeRate + C.bribeBase);
    const btns = [{ label: `そのまま通る（見つかる 約${Math.round(findP * 100)}%）`, cls: 'pri', fn: () => inspect(findP, false) }];
    if (S.gold >= bribe) btns.push({ label: `🤝 袖の下を渡す（${bribe}枚）`, fn: () => { S.gold -= bribe; renderHud(); inspect(C.bribeFind, true); } });
    modal({ title, body: head + `<p class="bad">荷の底には禁制品（値打ち ${fmt(cw)}枚）。見つかれば没収のうえ、罰金 ${fmt(Math.ceil(cw * C.fineRate))}枚。</p>`, buttons: btns });
  }
  // 街道の見回り：国の中でも、禁制品を積んで街道を行けば、あらためられることがある
  function patrolEvent() {
    if (!contraWorth()) return next();
    tlog('👮 街道で、見回りの役人に呼び止められた。');
    inspectModal('👮 街道の見回り', `<p>街道の先に、槍を持った役人がふたり。「荷をあらためる。止まれ。」</p><p class="sub">山道や近道に、見回りは来ない。</p>`, C.patrol.find, travel.to, '街道の見回り');
  }
  function borderEvent() {
    const hasPass = !!S.pass.border, tax = tariff(travel.rid), cw = contraWorth();
    let head = `<p>国境の関所だ。槍を持った兵が、荷車をひとつずつ止めている。</p>`;
    if (tax) { const s = pay(tax); head += `<p>荷の値打ち ${fmt(cargoWorth())}枚に対し、関税 ${G(tax)} を払った${hasPass ? '（通行手形で半分）' : ''}。${s ? `<span class="bad">足りない ${fmt(s)}枚はツケになった。</span>` : ''}</p>`; }
    else head += `<p>荷がないので、関税はかからない。</p>`;
    tlog(`🏯 国境の関所を通った（関税 ${tax}枚）。`);
    renderHud();
    if (!cw) return modal({ title: '🏯 国境の関所', body: head, buttons: cont() });
    inspectModal('🏯 国境の関所', head, hasPass ? C.abroad.findPass : C.abroad.find, 'oto', '国境の関所');
  }
  function arrive() {
    const t = travel, T = D.TOWNS[t.to], type = D.ROADS[t.rid].type;
    S.town = t.to;
    if (S.cart.type !== 'basket') S.cart.hp = Math.max(5, S.cart.hp - rnd(2, 5) * (type === 'road' ? 1 : 2));
    advance(t.days * 4);                         // 旅は日数ちょうど。昼に出れば、昼に着く
    if (S.dead) { travel = null; return gameOver(); }
    useStat('body', t.days);
    const first = discover(t.to);
    let body = t.back ? `<p>引き返して、${T.name}に戻った。1日を無駄にした。</p>` + t.log.slice(1).join('')
      : `<p>${t.days}日かけて着いた。${first ? '<b class="good">はじめて訪れる町だ。地図に書きこんだ。</b>' : ''}</p>` + t.log.slice(1).join('');
    if (t.to === 'oto' && !t.back) {
      const fee = cartT().gate;
      if (fee) { const s = pay(fee); body += `<p>門で入市税 ${G(fee)} を払った。${s ? `<span class="bad">足りない ${fmt(s)}枚はツケになった。</span>` : ''}</p>`; }
      const cw = contraWorth();
      if (cw && Math.random() < C.cityFind) {
        const n = dropContraband(), fine = Math.ceil(cw * C.fineRate);
        pay(fine); addRep(t.to, -10);
        body += `<p class="bad">門番に禁制品を見つけられた。${n}個を没収され、罰金 ${fmt(fine)}枚。評判も落ちた。</p>`;
      }
    }
    // 荷の保険
    t.payout = t.insured ? Math.floor(t.insLost * C.insure.cover) : 0;
    if (t.payout > 0) { S.gold += t.payout; body += `<p class="good">🧾 保険がおりた。失った荷の仕入れ値 ${fmt(t.insLost)}枚に対し、${G(t.payout)}。</p>`; addDiary(`荷の保険で${fmt(t.payout)}枚が戻った。`); }
    else if (t.insured) body += `<p class="sub">🧾 保険は使わずにすんだ（掛け金 ${t.premium}枚）。</p>`;
    if (isNight()) body += `<p class="sub">🌙 着いたのは夜。店は閉まっている。朝まで休もう。</p>`;
    body += `<p class="sub">町の人の声：「おや、${callName(t.to)}。」</p>`;
    S.stats.trips++;
    t.spent = t.gold0 - S.gold;                  // 道中の出費（宿代・通行料・掛け金など。保険金は差し引く）
    S.visit = { profit: 0, spent: Math.max(0, t.spent), lost: t.lost };
    const R = cargoCount() && !t.back ? buildReveal(t.to, t) : null;
    travel = null; ui = { tab: 'market', dest: null, insure: false };
    recordMemo(S.town);
    const heard = t.back ? [] : hearStreet();
    if (trusted(S.town)) { const r = randomPrice('patron'); if (r) heard.push(r); }
    if (heard.length) body += `<div class="card"><div class="name">👂 町で耳に入った噂</div>${heard.map(rumorLine).join('')}</div>`;
    notices.push({ title: t.back ? `↩️ ${T.name}に戻った` : `🚩 ${T.name}に着いた`, body, label: R ? '市場の値を見る' : '町に入る' });
    if (R) notices.push({ reveal: R });
    if (S.stats.trips === 1) tell('firstTrip');
    if (first) { tell(t.to); addDiary(`はじめて${T.name}を訪れた。`); }
    window.scrollTo(0, 0);
    settle();
  }

  function playFight(cv, win, cb) {
    const w = cv.clientWidth || 300, dpr = Math.min(window.devicePixelRatio || 1, 2), H = 150;
    cv.style.height = H + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(H * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const gy = H * 0.72, DUR = 2.6, mine = 1 + Math.min(4, S.guards + (S.buddy ? 1 : 0) + (travel && travel.caravan ? 3 : 0)), foes = travel && travel.band && !travel.band.big ? 1 : 3;
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
  const how = load();
  if (!how) { newGame(); save(); }
  render();
  if (!how || !S.me) intro();                    // 新しく始めたとき（商人をまだ選んでいないときも）
  else if (how === 'moved') modal({ title: '帳簿を引き継いだ', body: `<p>前の版の記録を、この版に引き継いだ。お金・荷・地図・評判・借金はそのまま。</p><p class="sub">商人の能力は、すべて「ふつう（3）」になっている。前の版の記録は消していない。</p>` + helpBody(), buttons: [{ label: '続ける', cls: 'pri' }] });
  let rsT = 0;
  window.addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(() => { if (travel) drawMap($('#map'), false); else render(); }, 200); });

  // 動作確認用（テストやコンソールから中をのぞける）
  window.__shokai = {
    get state() { return S; }, get travel() { return travel; },
    routeInfo, roadsFrom, neighbors, roadUsable, roadClosed, buyNow, sellNow, mult, baseMult, step, nearDepth, maxBuy, stockMax, offersOf, banditChance, tariff, dangerOf,
    priceRumor, omenRumor, vagueRumor, randomPrice, hearStreet, rumorErr, rumorText, rumorsAbout, lagged,
    seasonOf, seasonDay, seasonMods, eventMult, upcoming, callName, patronOf, trusted, patronReady, patronPay, homeBonus, records, checkAbroad,
    dailyCost, advance, settle, stage, power, selfPower, fleeChance, fresh, sellsHere, banned, cargoCount, cargoWeight, freeWeight, cargoWorth, contraWorth, cargoCost, capNow,
    owed, daysLeft, dueNow, dueOf, loanLeft, tabLimit, forecast, forecastText, tradeIn, inPlay, eff, genCand, loseCargo, lossUnits, reserved, edge, isNight, spawnBoss, storeWeight,
    DIST, PD, BASE, SAVE_KEY, OLD_KEY, REC_KEY
  };
})();
