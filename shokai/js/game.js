// 背負い籠の商会（第2版）：ゲーム本体。数値やデータは js/data/ のファイルにある。
(function () {
  'use strict';

  const D = window.SHOKAI, C = D.CONFIG;
  const SAVE_KEY = 'shokai-save-v2';      // 第1版（v1）とは形式がちがうので、保存場所も別
  const SAVE_VERSION = 2;
  const QN = ['朝', '昼', '夕', '夜'];
  const KIND = { village: '村', town: '町', capital: '王都', port: '港町' };
  const DANGER = ['安全', 'やや危険', '危険', 'とても危険'];

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
  const timeStr = () => `${day() + 1}日目 ${QN[S.time % 4]}`;
  const cartT = () => D.CARTS[S.cart.type];
  const other = (r, t) => (r.a === t ? r.b : r.a);
  const townName = (t) => (S.named[t] ? D.TOWNS[t].name : '？？？');
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

  // ---------- 物語 ----------
  // 節目の場面を、一度だけお知らせに積む
  function tell(key, vars) {
    const sc = D.STORY[key];
    if (!sc || S.told[key]) return false;
    S.told[key] = 1;
    const fill = (s) => s.replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));
    notices.push({ title: '📖 ' + fill(sc.title), body: sc.text.map((p) => `<p class="story">${fill(p)}</p>`).join(''), label: sc.label });
    return true;
  }

  // ---------- セーブ ----------
  function newGame() {
    S = {
      v: SAVE_VERSION, time: 0, gold: C.startGold, town: C.startTown,
      cart: { type: 'basket', hp: 100 }, guards: 0, cargo: {},
      market: {}, drift: {}, stock: {}, hist: {},
      seen: {}, named: {}, roads: {}, rep: {}, memo: {}, pass: {},
      debt: 0, loan: { n: 0, pre: 0, cycle: 0, done: false }, shop: null,
      trends: [], rumors: [], hot: {}, hotKnown: {}, caravans: {}, offers: {}, orders: [], told: {},
      rain: false, stageMax: 1, dead: false, stats: { trips: 0, wins: 0, robbed: 0, profit: 0, orders: 0 }
    };
    fillMissing();
    discover(S.town);
    recordMemo(S.town);
  }
  function fillMissing() {
    for (const t in D.TOWNS) {
      S.market[t] = S.market[t] || {}; S.drift[t] = S.drift[t] || {}; S.stock[t] = S.stock[t] || {};
      for (const g in D.GOODS) {
        if (typeof S.market[t][g] !== 'number') S.market[t][g] = 0;
        if (typeof S.drift[t][g] !== 'number') S.drift[t][g] = rnd(-0.1, 0.1);
      }
      for (const g in D.TOWNS[t].stock) if (typeof S.stock[t][g] !== 'number') S.stock[t][g] = D.TOWNS[t].stock[g];
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

  // ---------- 荷 ----------
  function cargoWeight() { let n = 0; for (const g in S.cargo) n += S.cargo[g].qty * D.GOODS[g].w; return n; }
  function cargoCount() { let n = 0; for (const g in S.cargo) n += S.cargo[g].qty; return n; }
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
      const c = S.cargo[g], k = Math.min(c.qty, Math.ceil(c.qty * frac));
      c.cost -= (c.cost / c.qty) * k; c.qty -= k; n += k;
      if (c.qty <= 0) delete S.cargo[g];
    }
    return n;
  }
  function dropContraband() {
    let n = 0;
    for (const g of Object.keys(S.cargo)) if (D.CONTRABAND.includes(g)) { n += S.cargo[g].qty; delete S.cargo[g]; }
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
  function trendOf(t, g) { for (const x of S.trends) if (x.t === t && x.g === g) return x; return null; }
  // その日の倍率 = 町の基本の倍率 × 市況（高騰・値崩れ）×（1 + 日々のゆれ）
  function mult(t, g) {
    const m = D.TOWNS[t].prices[g], tr = trendOf(t, g);
    return (typeof m === 'number' ? m : 1) * (tr ? tr.m : 1) * (1 + S.drift[t][g]);
  }
  const step = (t, g) => 1 / (D.GOODS[g].depth * D.TOWNS[t].size);
  const unitBuy = (t, g, dev) => Math.max(1, Math.ceil(D.GOODS[g].base * mult(t, g) * (1 + dev)));
  const unitSell = (t, g, dev, f) => Math.max(1, Math.floor(D.GOODS[g].base * mult(t, g) * (1 + dev) * C.sellRate * (f == null ? 1 : f)));
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
  // 買える数：重さ・在庫・お金のどれかが尽きるまで
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
    for (const g in D.GOODS) sell[g] = banned(t, g) ? null : sellNow(t, g);
    return { d: day(), sell };
  }
  function recordMemo(t) { S.memo[t] = snapshot(t); }
  // 町 from にいて聞ける、町 to の相場。知らせは人の足で届くので、道のりの日数ぶん古い
  function heard(from, to) {
    const lag = DIST[from][to], h = S.hist[to], want = day() - lag;
    let best = h[0];
    for (const x of h) if (x.d <= want && x.d >= best.d) best = x;
    return { age: Math.max(lag, day() - best.d), sell: best.sell };
  }
  function neighbors(t) { return [...new Set(roadsFrom(t).map((rid) => other(D.ROADS[rid], t)))]; }
  function spawnTrend() {
    if (S.trends.length >= C.trendMax) return null;
    const t = pick(Object.keys(D.TOWNS)), g = pick(Object.keys(D.GOODS));
    if (trendOf(t, g) || banned(t, g)) return null;
    const down = sellsHere(t, g) ? true : Math.random() < 0.25, range = down ? C.trendDown : C.trendUp;
    const x = { t, g, m: +rnd(range[0], range[1]).toFixed(2), until: day() + rndi(C.trendDays[0], C.trendDays[1]) };
    S.trends.push(x);
    return x;
  }

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
  const owed = () => Math.max(0, dueNow() - S.loan.pre) + Math.ceil(S.debt);   // 次の返済日に取り立てられる額
  function loanLeft() { let v = 0; if (!S.loan.done) for (let i = S.loan.n; i < C.loan.dues.length; i++) v += C.loan.dues[i]; return v - S.loan.pre; }
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
      const over = cargoWeight() - cartT().cap;
      if (over > 0) { loseCargo(over / cargoWeight()); while (cargoWeight() > cartT().cap) loseCargo(0.2); dayNotes.push('背負いきれない荷は、置いていくしかなかった。'); }
    }
    if (short > 0 && cargoCount() > 0) { take(Math.floor(cargoWorth() * 0.5), '荷をすべて取り上げられた'); S.cargo = {}; }
    if (short > 0) { S.dead = true; wipeSave(); return; }
    if (short < 0 && seized) S.gold += -short;     // 取りすぎたぶんは返ってくる
    S.debt = 0; S.loan.pre = 0; S.loan.cycle++;
    if (!S.loan.done) {
      S.loan.n++;
      dayNotes.push(`💰 返済日。バルドの使いに ${fmt(need)}枚 を納めた${seized ? '（差し押さえで穴を埋めた）' : ''}。`);
      if (S.loan.n >= C.loan.dues.length) { S.loan.done = true; tell('free'); }
      else {
        const next = C.loan.dues[S.loan.n];
        if (!tell('pay1', { next })) { if (next >= 380) tell('payBig', { next }); }
        dayNotes.push(`次は ${C.loan.every}日後に ${fmt(next)}枚。`);
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
  function newDay() {
    const d = day();
    const short = pay(dailyCost().total);
    if (short > 0 && !S.tabNoted) { S.tabNoted = true; dayNotes.push(`<span class="bad">宿代や給金を払えず、${fmt(short)}枚がツケになった。次の返済日に取り立てられる。</span>`); }
    if (short === 0) S.tabNoted = false;
    if (short > 0 && S.guards > 0) { dayNotes.push(`<span class="bad">給金が払えず、護衛${S.guards}人は去っていった。</span>`); S.guards = 0; }
    if (S.debt > 0) S.debt = +(S.debt * (1 + C.tabInterest)).toFixed(2);

    // 傷む品
    const age = (store, where) => {
      for (const g in store) {
        const sh = D.GOODS[g].shelf;
        if (!sh) continue;
        store[g].age += S.rain ? 1.3 : 1;
        if (store[g].age > sh) { dayNotes.push(`<span class="bad">🪰 ${where}${D.GOODS[g].name} ${store[g].qty}個が腐り、捨てるしかなかった。</span>`); delete store[g]; }
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
      for (const g in D.TOWNS[t].stock) S.stock[t][g] = Math.min(D.TOWNS[t].stock[g], S.stock[t][g] + D.TOWNS[t].stock[g] / C.stockDays);
    }
    S.trends = S.trends.filter((x) => x.until > d);
    S.rumors = S.rumors.filter((x) => x.until > d);
    if (Math.random() < C.trendChance) spawnTrend();
    for (const t in S.hist) { S.hist[t].push(snapshot(t)); if (S.hist[t].length > C.histDays) S.hist[t].shift(); }

    // 天気・山賊の動き・隊商
    S.rain = Math.random() < (S.rain ? C.rainStay : C.rainStart);
    for (const r in S.hot) if (S.hot[r] <= d) { delete S.hot[r]; delete S.hotKnown[r]; }
    if (Math.random() < C.hotChance) { const r = pick(Object.keys(D.ROADS).filter((k) => D.ROADS[k].danger >= 1)); S.hot[r] = d + rndi(8, 20); }
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

    // 期限の切れた依頼
    S.orders = S.orders.filter((o) => {
      if (d <= o.due) return true;
      S.rep[o.t] = Math.max(0, S.rep[o.t] - C.orderFailRep);
      dayNotes.push(`<span class="bad">📜 ${D.TOWNS[o.t].name}の${D.TOWNS[o.t].who.name}との約束（${D.GOODS[o.g].name}${o.n}個）を守れなかった。評判が落ちた。</span>`);
      tell('orderFail');
      return false;
    });

    // 評判が上がれば通行手形
    for (const t in D.TOWNS) {
      if (S.pass[t] || S.rep[t] < C.passRep || !Object.values(D.ROADS).some((r) => r.gate === t)) continue;
      S.pass[t] = true;
      dayNotes.push(`<span class="good">🪪 ${D.TOWNS[t].name}の通行手形をもらった。この町の関所では税がかからない。</span>`);
      tell('pass', { town: D.TOWNS[t].name });
    }
    if (d >= dueDay()) collect();
  }
  // 商いにかかる時間。その町で売り買いを始めると tradeTime 刻進む。同じ刻のうちは、何度売り買いしても進まない
  function tradeTick() {
    if (S.tradedAt === S.time) return;
    advance(C.tradeTime);
    S.tradedAt = S.time;
  }
  // 操作のあとの後始末：破産の確認、お知らせ、保存、描き直し
  function settle() {
    if (S.dead) return gameOver();
    if (dayNotes.length) { notices.unshift({ title: '📒 日々のできごと', body: dayNotes.map((x) => `<p>${x}</p>`).join('') }); dayNotes = []; }
    checkStage();
    save(); render(); showNotices();
  }
  function gameOver() {
    travel = null; notices = [];
    const st = S.stats, d = day() + 1, sc = D.STORY.bankrupt;
    const last = dayNotes.map((x) => `<p>${x}</p>`).join(''); dayNotes = [];
    modal({
      title: '💀 ' + sc.title,
      body: last + sc.text.map((p) => `<p class="story">${p}</p>`).join('') +
        `<p class="sub">${d}日目 ／ 返済 ${S.loan.n}回 ／ 行商 ${st.trips}回 ／ 山賊を退けた ${st.wins}回</p><p class="bad">記録は消えた。最初からやり直しになる。</p>`,
      buttons: [{ label: sc.label, cls: 'pri', fn: () => { newGame(); save(); ui = { tab: 'market', dest: null }; render(); intro(); } }]
    });
  }

  // ---------- 段階と目標 ----------
  function stage() { return S.shop ? 3 : S.cart.type !== 'basket' ? 2 : 1; }
  function goalText() {
    if (S.cart.type === 'basket') return `手押し車を買う（${D.CARTS.handcart.price}枚。カワベの車屋で）。籠のままでは返済が続かない`;
    if (S.cart.type === 'handcart') return `ロバの荷車を買う（${D.CARTS.donkey.price}枚）。返済額はまだ上がる`;
    if (!S.shop) return `町で評判を${C.shop[1].rep}まで上げ、露店を出す（${C.shop[1].cost}枚）`;
    if (S.shop.lv === 1) return `露店を小さな店にする（評判${C.shop[2].rep}・${C.shop[2].cost}枚）`;
    if (!S.loan.done) return '親の借金を返しきる';
    return 'この版の物語はここまで。王都の商人組合と船は、次の版で。';
  }
  function checkStage() {
    const s = stage();
    if (s > S.stageMax) S.stageMax = s;
    if (S.cart.type !== 'basket') tell(S.cart.type);
    if (S.shop) tell(S.shop.lv >= 2 ? 'shop' : 'stall');
  }

  // ---------- 地図の知識 ----------
  function discover(t) {
    const first = S.seen[t] !== 2;
    S.seen[t] = 2; S.named[t] = true;
    for (const rid in D.ROADS) {
      const r = D.ROADS[rid];
      if (r.a !== t && r.b !== t) continue;
      S.roads[rid] = true;
      const o = other(r, t);
      if (!S.seen[o]) S.seen[o] = 1;
    }
    return first;
  }
  function roadsFrom(t) { return Object.keys(D.ROADS).filter((rid) => S.roads[rid] && (D.ROADS[rid].a === t || D.ROADS[rid].b === t)); }
  // 山賊に遭う確率。積み荷の値打ちが大きいほど上がる
  function banditChance(danger, caravan) {
    const vm = Math.min(C.banditValueMax, 0.5 + cargoWorth() / C.banditValueRef);
    let p = C.banditBase[danger] * vm * Math.max(0.3, 1 - C.banditGuardCut * S.guards);
    if (caravan) p *= C.caravanSafety;
    return Math.min(0.9, p);
  }
  function gateTax(rid) {
    const r = D.ROADS[rid];
    if (!r.gate || S.pass[r.gate] || cargoCount() === 0) return 0;
    return Math.max(1, Math.ceil(cargoWorth() * C.gateTax));
  }
  function routeInfo(rid, caravan) {
    const r = D.ROADS[rid], cart = cartT();
    let m = caravan ? 0.9 : cart.speed[r.type];
    if (S.rain) m *= C.rainSlow[r.type];
    const hot = !!S.hot[rid] && S.hot[rid] > day();
    const danger = Math.min(3, r.danger + (hot ? 1 : 0)), shown = Math.min(3, r.danger + (hot && S.hotKnown[rid] ? 1 : 0));
    return {
      r, to: other(r, S.town), days: Math.max(1, Math.round(r.len * m)), toll: gateTax(rid), gate: r.gate || null,
      pass: !!(r.gate && S.pass[r.gate]), danger, shown,
      risk: banditChance(shown, caravan),
      breakP: cart.breakP[r.type] * (S.rain ? 1.6 : 1) * (S.cart.hp < 40 ? 2 : 1)
    };
  }
  function power(caravan) { return C.selfPower + S.guards * C.guardPower + (caravan ? C.caravanPower : 0); }

  // ---------- 依頼 ----------
  // 町の顔役からの注文。よその町の特産を、期限までに届ける
  function offersOf(t) {
    const d = day(), cur = S.offers[t];
    if (cur && d - cur.day < C.orderRefresh) return cur.list;
    const list = [], T = D.TOWNS[t];
    const cand = Object.keys(D.GOODS).filter((g) => !sellsHere(t, g) && !D.CONTRABAND.includes(g) && !S.orders.some((o) => o.t === t && o.g === g));
    for (let i = 0; i < 2 && cand.length; i++) {
      const g = cand.splice(Math.floor(Math.random() * cand.length), 1)[0], G0 = D.GOODS[g];
      const src = Object.keys(D.TOWNS).filter((p) => sellsHere(p, g)), dist = Math.min.apply(null, src.map((p) => DIST[t][p]));
      const maxStock = Math.max.apply(null, src.map((p) => D.TOWNS[p].stock[g]));
      const W = pick([8, 8, 30, 30, 70]);                      // 小口（籠でも運べる）〜大口（荷車がいる）
      const n = clamp(Math.round(W / G0.w), 1, Math.max(1, Math.floor(maxStock * 1.2)));
      list.push({
        id: d + '-' + t + '-' + g, g, n, days: Math.ceil(dist * 2 * 1.4) + 5,
        // 報酬 = 品の値打ちの8割 ＋ 運び賃（重さ × 道のり）。重い注文ほど割がいい
        reward: Math.round(n * G0.base * 0.8 + n * G0.w * (1 + dist)), rep: C.orderRep + (n * G0.w >= 30 ? 3 : 0)
      });
    }
    S.offers[t] = { day: d, list };
    return list;
  }

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
    modal({ title: n.title, body: n.body, buttons: [{ label: n.label || 'OK', cls: 'pri', fn: showNotices }] });
  }

  // ---------- 画面 ----------
  const TABS = [
    { id: 'market', ic: '⚖️', name: '市場' },
    { id: 'map', ic: '🗺️', name: '地図' },
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
    else if (ui.tab === 'town') m.innerHTML = viewTown();
    else m.innerHTML = viewBook();
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
      `<div class="hud2"><span>📅 ${timeStr()}</span><span>${S.rain ? '🌧' : '☀️'}</span>` +
      `<span>${cartT().icon} ${cargoWeight()}/${cartT().cap}</span>` + (S.guards ? `<span>🛡${S.guards}</span>` : '') + `<span>${dueText()}</span></div>`;
  }
  function dueCard() {
    const o = owed(), left = daysLeft();
    if (S.loan.done && o === 0) return '';
    const hard = S.gold < o;
    return `<div class="card ${hard && left <= 10 ? 'danger' : 'goal'}"><div class="sub">${S.loan.done ? 'ツケの清算' : `親の借金　${S.loan.n + 1}回目の返済`}</div>` +
      `<div class="name">あと${left}日で ${fmt(o)}枚${hard ? `　<span class="bad">（${fmt(o - S.gold)}枚 足りない）</span>` : '　<span class="good">（手持ちで足りる）</span>'}</div>` +
      `<div class="sub">足りなければ、店・荷車・荷の順に差し押さえ。何も残らなければ破産。</div></div>`;
  }

  function tags(g) {
    let h = `<span class="tag">重さ${D.GOODS[g].w}</span>`;
    if (D.GOODS[g].shelf) h += `<span class="tag">傷む</span>`;
    if (D.CONTRABAND.includes(g)) h += `<span class="tag bad">禁制品</span>`;
    return h;
  }
  function goodCard(g) {
    const G0 = D.GOODS[g], t = S.town, can = sellsHere(t, g), own = S.cargo[g], ban = banned(t, g), tr = trendOf(t, g);
    const f = own ? fresh(g, own.age) : 1, sp = sellNow(t, g, f);
    let l2 = can ? `買値 <b>${fmt(buyNow(t, g))}枚</b>　在庫 ${Math.floor(S.stock[t][g])}　` : '';
    l2 += ban ? `<span class="bad">この町では売れない</span>` : `売値 ${can ? '' : '<b>'}${fmt(sp)}枚${can ? '' : '</b>'}`;
    if (tr) l2 += ` <span class="${tr.m > 1 ? 'good' : 'bad'}">${tr.m > 1 ? '📈高騰中' : '📉値崩れ中'}</span>`;
    let l3 = '';
    if (own) {
      const avg = own.cost / own.qty;
      l3 = `<div class="sub">所持 <b>${own.qty}</b>（仕入れ ${fmt(avg)}枚）` +
        (G0.shelf ? ` 鮮度 <span class="${f < 0.6 ? 'bad' : ''}">${Math.round(f * 100)}%</span>` : '') +
        (ban ? '' : `<span class="${sp >= avg ? 'good' : 'bad'}"> ${sp >= avg ? '▲利益' : '▼損'}</span>`) + `</div>`;
    }
    return `<div class="card row"><div class="grow"><div class="name">${G0.icon} ${G0.name}${tags(g)}</div><div>${l2}</div>${l3}</div><div class="btns">` +
      (own && !ban ? `<button class="b" data-a="sell" data-g="${g}">売る</button>` : '') +
      (can ? `<button class="b pri" data-a="buy" data-g="${g}">買う</button>` : '') + `</div></div>`;
  }
  function rumorLine(x) {
    return `<div class="${x.up ? 'good' : 'bad'}">${x.up ? '📈' : '📉'} ${D.TOWNS[x.t].name}で${D.GOODS[x.g].name}が${x.up ? '高騰' : '値崩れ'}しているらしい</div>`;
  }
  function orderCards() {
    return S.orders.map((o, i) => {
      const here = o.t === S.town, have = S.cargo[o.g] ? S.cargo[o.g].qty : 0, left = o.due - day();
      return `<div class="card row"><div class="grow"><div class="name">📜 ${D.TOWNS[o.t].name}の${D.TOWNS[o.t].who.name}へ ${D.GOODS[o.g].name} ${o.n}個</div>` +
        `<div class="sub"><span class="${left <= 3 ? 'bad' : ''}">あと${left}日</span> ／ 報酬 ${o.reward}枚 ／ 持っている ${have}個</div></div>` +
        (here ? `<button class="b pri" data-a="deliver" data-i="${i}" ${have >= o.n ? '' : 'disabled'}>納める</button>` : '') + `</div>`;
    }).join('');
  }
  function viewMarket() {
    const T = D.TOWNS[S.town], here = Object.keys(T.stock);
    let h = `<h2>${T.name}の市場</h2><p class="sub">${KIND[T.kind]}　評判 ${Math.floor(S.rep[S.town])}　${T.desc}</p>`;
    h += dueCard();
    h += `<div class="card"><div class="sub">次の目標</div><div class="name">${goalText()}</div></div>`;
    if (S.orders.length) h += orderCards();
    if (S.rumors.length) h += `<div class="card"><div class="name">👂 耳にした噂</div><div class="sub">酒場の噂は外れることもある。</div>${S.rumors.map(rumorLine).join('')}</div>`;
    h += `<h3>この町の特産（あと 重さ${freeWeight()} 積める）</h3>` + here.map(goodCard).join('');
    const owned = Object.keys(S.cargo).filter((g) => !here.includes(g));
    if (owned.length) h += `<h3>持ってきた荷</h3>` + owned.map(goodCard).join('');
    h += heardTable();
    const all = Object.keys(D.GOODS).sort((a, b) => mult(S.town, b) - mult(S.town, a));
    h += `<details class="card"><summary>この町の相場をすべて見る</summary><table class="t"><tr><th>品（重さ）</th><th>売値</th><th>ふだんとの差</th></tr>` +
      all.map((g) => {
        if (banned(S.town, g)) return `<tr><td>${D.GOODS[g].icon} ${D.GOODS[g].name}</td><td class="bad">禁制</td><td></td></tr>`;
        const pct = Math.round((mult(S.town, g) * (1 + S.market[S.town][g]) - 1) * 100);
        return `<tr><td>${D.GOODS[g].icon} ${D.GOODS[g].name}（${D.GOODS[g].w}）</td><td>${fmt(sellNow(S.town, g))}枚</td>` +
          `<td class="${pct >= 15 ? 'good' : pct <= -15 ? 'bad' : ''}">${pct >= 0 ? '+' : ''}${pct}%</td></tr>`;
      }).join('') + `</table></details>`;
    return h;
  }
  // 道でつながった、名前を知っている町の売値。旅人から聞いた話なので、道のりの日数ぶん古い
  function heardTable() {
    const ns = neighbors(S.town).filter((t) => S.named[t]);
    if (!ns.length) return '';
    const hs = ns.map((t) => heard(S.town, t));
    const rows = Object.keys(D.GOODS).filter((g) => sellsHere(S.town, g) || S.cargo[g]);
    if (!rows.length) return '';
    return `<details class="card" open><summary>となり町で聞いた売値</summary>` +
      `<div class="sub">旅人の話なので古い。値は日々動くので、着くころには変わっているかもしれない。</div>` +
      `<div class="scroll"><table class="t"><tr><th>品</th><th>ここで買う</th>` +
      ns.map((t, i) => `<th>${D.TOWNS[t].name.replace(/の.*|村|鉱山町|グランヴェル/, '')}<br>${hs[i].age}日前</th>`).join('') + `</tr>` +
      rows.map((g) => {
        const base = sellsHere(S.town, g) ? buyNow(S.town, g) : S.cargo[g].cost / S.cargo[g].qty;
        return `<tr><td>${D.GOODS[g].name}</td><td>${fmt(base)}</td>` + hs.map((x) => {
          const v = x.sell[g];
          return v == null ? `<td class="bad">禁制</td>` : `<td class="${v > base * 1.05 ? 'good' : v < base ? 'bad' : ''}">${fmt(v)}</td>`;
        }).join('') + `</tr>`;
      }).join('') + `</table></div></details>`;
  }

  // 地図。知っている町と道だけを描く
  function mapXY(p, w, h) { return [6 + p[0] / 100 * (w - 12), 10 + (p[1] - 24) / 104 * (h - 26)]; }
  function drawMap(cv, bind) {
    if (!cv) return;
    const w = cv.clientWidth || 340, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const h = clamp(Math.round(w * 1.05), 260, Math.round((window.innerHeight || 700) * 0.52));
    cv.style.height = h + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#e6d5ac'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(120,95,55,.25)'; ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0, h * i / 6); ctx.lineTo(w, h * i / 6); ctx.moveTo(w * i / 6, 0); ctx.lineTo(w * i / 6, h); ctx.stroke(); }
    const here = travel ? travel.from : S.town, dest = travel ? travel.to : ui.dest;

    // 道。同じ町どうしを結ぶ2本目（抜け道）は曲げて描く
    const bend = (rid) => (D.ROADS[rid].type === 'path' && Object.keys(D.ROADS).some((k) => k !== rid &&
      D.ROADS[k].a === D.ROADS[rid].a && D.ROADS[k].b === D.ROADS[rid].b)) ? 22 : 0;
    const roadPts = (rid) => {
      const r = D.ROADS[rid], a = mapXY(D.TOWNS[r.a].pos, w, h), b = mapXY(D.TOWNS[r.b].pos, w, h), k = bend(rid);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return { a, b, c: [(a[0] + b[0]) / 2 - (b[1] - a[1]) / len * k, (a[1] + b[1]) / 2 + (b[0] - a[0]) / len * k] };
    };
    const along = (P, f) => {
      const u = 1 - f;
      return [u * u * P.a[0] + 2 * u * f * P.c[0] + f * f * P.b[0], u * u * P.a[1] + 2 * u * f * P.c[1] + f * f * P.b[1]];
    };
    for (const rid in D.ROADS) {
      if (!S.roads[rid]) continue;
      const r = D.ROADS[rid], P = roadPts(rid), hot = S.hot[rid] > day() && S.hotKnown[rid];
      ctx.strokeStyle = hot ? '#c0392b' : r.type === 'road' ? '#7a5a34' : '#9a8056';
      ctx.lineWidth = r.type === 'road' ? 3 : 2;
      ctx.setLineDash(r.type === 'road' ? [] : r.type === 'trail' ? [7, 4] : [2, 4]);
      ctx.beginPath(); ctx.moveTo(P.a[0], P.a[1]); ctx.quadraticCurveTo(P.c[0], P.c[1], P.b[0], P.b[1]); ctx.stroke();
      ctx.setLineDash([]);
      if (r.gate) {
        const m = along(P, 0.5), ok = S.pass[r.gate];
        ctx.fillStyle = ok ? '#cfe8c4' : '#fff7df'; ctx.strokeStyle = '#7a5a34'; ctx.lineWidth = 1.5;
        ctx.fillRect(m[0] - 7, m[1] - 7, 14, 14); ctx.strokeRect(m[0] - 7, m[1] - 7, 14, 14);
        ctx.fillStyle = '#5a3d1c'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('関', m[0], m[1] + 0.5);
      }
    }
    ctx.textBaseline = 'middle';
    for (const t in D.TOWNS) {
      if (!S.seen[t]) continue;
      const T = D.TOWNS[t], q = mapXY(T.pos, w, h), visited = S.seen[t] === 2;
      const rad = T.kind === 'capital' ? 9 : T.kind === 'village' ? 5 : 7;
      if (t === dest) { ctx.beginPath(); ctx.arc(q[0], q[1], rad + 5, 0, 7); ctx.strokeStyle = '#d2452f'; ctx.lineWidth = 2.5; ctx.stroke(); }
      if (t === here) { ctx.beginPath(); ctx.arc(q[0], q[1], rad + 5, 0, 7); ctx.strokeStyle = '#c8961e'; ctx.lineWidth = 2.5; ctx.stroke(); }
      ctx.beginPath(); ctx.arc(q[0], q[1], rad, 0, 7);
      ctx.fillStyle = !visited ? '#f6ecd0' : T.kind === 'capital' ? '#b8862b' : T.kind === 'port' ? '#3d7ea6' : '#6b4a2a';
      ctx.fill(); ctx.strokeStyle = '#3a2814'; ctx.lineWidth = 1.5; ctx.stroke();
      if (!visited) { ctx.fillStyle = '#5a3d1c'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('？', q[0], q[1] + 0.5); }
      let mark = '';
      if (S.shop && S.shop.town === t) mark += '🏪';
      if (S.orders.some((o) => o.t === t)) mark += '📜';
      if (mark) { ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(mark, q[0], q[1] - rad - 8); }
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
        let best = null, bd = 32;
        for (const t in D.TOWNS) {
          if (!S.seen[t] || t === S.town) continue;
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
    let l2 = `${i.days}日${S.rain ? '（雨で遅い）' : ''} ／ `;
    if (!r.gate) l2 += '関所なし';
    else if (i.pass) l2 += '<span class="good">関所（手形で税なし）</span>';
    else l2 += `関所の税 ${i.toll}枚`;
    const pct = Math.round(i.risk * 100);
    l2 += ` ／ <span class="${pct >= 35 ? 'bad' : ''}">${DANGER[i.shown]}（山賊 約${pct}%）</span>`;
    let warn = '';
    if (i.breakP >= 0.1) warn += `<div class="bad sub">⚠ この荷車には悪い道。壊れやすい。</div>`;
    return `<div class="card"><div class="row"><div class="grow"><div class="name">${D.ROAD_TYPES[r.type].name}` +
      (r.gate ? `<span class="tag">関所</span>` : '') + `</div><div class="sub">${l2}</div>${warn}</div>` +
      `<button class="b pri" data-a="go" data-r="${rid}">出発</button></div></div>`;
  }
  function viewMap() {
    let h = `<div class="mapwrap"><canvas id="map"></canvas></div>` +
      `<p class="sub">金の輪が現在地。隣の町をタップで行き先に。実線＝街道、破線＝山道、点線＝抜け道、「関」＝関所（緑は手形あり）。</p>`;
    const rids = roadsFrom(S.town);
    if (!ui.dest) {
      h += `<h3>ここから行ける町</h3><div class="card">` + neighbors(S.town).map((t) => {
        const days = Math.min.apply(null, rids.filter((rid) => other(D.ROADS[rid], S.town) === t).map((rid) => routeInfo(rid).days));
        return `<div class="row" style="padding:4px 0"><div class="grow"><span class="name">${townName(t)}</span> ` +
          `<span class="sub">${days}日〜　${S.named[t] ? Object.keys(D.TOWNS[t].stock).filter((g) => !D.CONTRABAND.includes(g)).map((g) => D.GOODS[g].name).join('・') : 'どんな町かわからない'}</span></div>` +
          `<button class="b" data-a="dest" data-id="${t}">選ぶ</button></div>`;
      }).join('') + `</div>`;
      return h;
    }
    const t = ui.dest, T = D.TOWNS[t];
    h += `<div class="row"><div class="grow"><h2>${townName(t)}</h2></div><button class="b" data-a="dest" data-id="">選び直す</button></div>`;
    if (S.named[t]) {
      h += `<p class="sub">${KIND[T.kind]}　評判 ${Math.floor(S.rep[t])}　${T.desc}` +
        (T.cityTax ? `<br>門で、荷の値打ちの${Math.round(T.cityTax * 100)}%を税として取られる。禁制品は売れない。` : '') + `</p>`;
      const rows = Object.keys(D.GOODS).filter((g) => sellsHere(S.town, g) || S.cargo[g]), x = heard(S.town, t);
      if (rows.length) {
        h += `<table class="t"><tr><th>${x.age}日前に聞いた値</th><th>ここの買値</th><th>${T.name.slice(0, 5)}の売値</th></tr>` + rows.map((g) => {
          const hb = sellsHere(S.town, g) ? buyNow(S.town, g) : null, own = S.cargo[g], base = hb !== null ? hb : own.cost / own.qty, v = x.sell[g];
          return `<tr><td>${D.GOODS[g].name}${own ? `（${own.qty}）` : ''}</td><td>${hb !== null ? fmt(hb) : '—'}</td>` +
            (v == null ? `<td class="bad">禁制</td>` : `<td class="${v > base ? 'good' : 'bad'}">${fmt(v)}</td>`) + `</tr>`;
        }).join('') + `</table><p class="sub">着くころには値が動いているかもしれない。自分が売りこんだぶんも下がる。</p>`;
      }
    } else {
      h += `<p class="sub">まだ行ったことがない。どんな町かも、何が売れるかもわからない。</p>`;
    }
    const worth = cargoWorth();
    if (worth > 0) h += `<p class="sub">積み荷の値打ち ${fmt(worth)}枚。値打ちが大きいほど山賊に狙われ、関所の税も重くなる。</p>`;
    if (Object.keys(S.cargo).some((g) => D.GOODS[g].shelf)) h += `<p class="sub">🪰 傷む品を積んでいる。日数がかかるほど値が落ちる。</p>`;
    if (contraWorth() > 0) h += `<p class="bad sub">⚠ 禁制品を積んでいる。関所で見つかれば没収と罰金。</p>`;
    h += `<h3>道を選ぶ</h3>` + rids.filter((rid) => other(D.ROADS[rid], S.town) === t).map(routeBlock).join('');
    return h;
  }

  function ensureCaravans(t) {
    const d = day();
    const list = (S.caravans[t] || []).filter((c) => c.leave >= d);
    const roads = Object.keys(D.ROADS).filter((rid) => D.ROADS[rid].type === 'road' && (D.ROADS[rid].a === t || D.ROADS[rid].b === t));
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

    // 依頼
    const offers = offersOf(t);
    h += `<h3>${T.who.role}の${T.who.name}の頼み</h3>`;
    if (S.orders.length) h += orderCards();
    h += offers.length ? offers.map((o, i) => {
      const w = o.n * D.GOODS[o.g].w;
      return `<div class="card row"><div class="grow"><div class="name">${D.GOODS[o.g].icon} ${D.GOODS[o.g].name}を ${o.n}個</div>` +
        `<div class="sub">重さ ${w}${w > cart.cap ? '（<span class="bad">今の荷車では一度に運べない</span>）' : ''} ／ ${o.days}日以内 ／ 報酬 ${o.reward}枚・評判+${o.rep}</div>` +
        `<div class="sub">遅れると評判が${C.orderFailRep}下がる。</div></div><button class="b pri" data-a="accept" data-i="${i}">受ける</button></div>`;
    }).join('') : `<p class="sub">いまは頼みごとがない。</p>`;

    h += `<h3>酒場</h3><div class="card row"><div class="grow">噂を聞く<div class="sub">知らない町や、相場、山賊の話。外れることもある。</div></div>` +
      `<button class="b pri" data-a="rumor">${C.rumorCost}枚</button></div>`;

    if (T.has.guard || S.guards > 0) {
      h += `<h3>${T.has.guard ? '口入れ屋（護衛）' : '護衛'}</h3><div class="card"><div>護衛 <b>${S.guards}人</b>　<span class="sub">${cart.name}は${cart.guards}人まで</span></div>` +
        `<div class="sub">手付け ${C.guardHire}枚、日給 ${C.guardWage}枚。山賊と戦う力になり、襲われにくくなる。` +
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
            (D.ROADS[c.rid].gate ? ' ／ 関所あり' : '') + `</div></div><button class="b pri" data-a="caravan" data-i="${i}">加わる</button></div>`;
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
          `<div class="stat"><div><span>積める重さ</span> ${c.cap}</div><div><span>餌代</span> 1日${c.feed}枚</div>` +
          `<div><span>街道</span> ${c.speed.road <= 0.7 ? '速い' : c.speed.road <= 0.95 ? 'やや速い' : '普通'}</div>` +
          `<div><span>山道</span> ${c.speed.trail >= 1.4 ? '苦手' : c.speed.trail >= 1.1 ? 'やや遅い' : '普通'}</div>` +
          `<div><span>護衛</span> ${c.guards}人まで</div><div><span>鉄なら</span> ${Math.floor(c.cap / D.GOODS.iron.w)}個</div></div></div>`;
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
        `<div class="card row"><div class="grow">国じゅうの地図<div class="sub">すべての町と道がわかる</div></div><button class="b pri" data-a="mapBuy" data-k="full">${C.mapFull}枚</button></div>`;
    }
    h += viewShop();
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
      (st.length ? `<div class="sub">在庫：${st.map((g) => `${D.GOODS[g].name}×${sh.stock[g].qty}`).join('、')}</div>` : `<div class="sub bad">在庫がない。荷を預けよう。</div>`);
    if (sh.town !== t) return h + `<div class="sub">店のある町に行けば、荷を預けたり売上金を受け取ったりできる。</div></div>`;
    h += `<button class="b pri wide" data-a="shopTake" ${sh.till > 0 ? '' : 'disabled'}>売上金を受け取る</button></div>`;
    const mine = Object.keys(S.cargo).filter((g) => !banned(t, g));
    if (mine.length) {
      h += `<div class="card"><div class="name">荷を店に預ける</div>` + mine.map((g) =>
        `<div class="row" style="padding:4px 0"><div class="grow">${D.GOODS[g].icon} ${D.GOODS[g].name} × ${S.cargo[g].qty}</div>` +
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
    let h = `<h2>帳簿</h2>` + dueCard();
    h += `<div class="card"><div class="sub">いまの身分：${names[stage()]}　次の目標</div><div class="name">${goalText()}</div></div>`;
    h += `<h3>お金</h3><div class="card stat"><div><span>手持ち</span> ${fmt(S.gold)}枚</div><div><span>1日の出費</span> ${cost.total}枚</div>` +
      `<div><span>親の借金の残り</span> ${fmt(loanLeft())}枚</div><div><span>ツケ</span> ${fmt(Math.ceil(S.debt))}枚</div></div>`;
    if (!S.loan.done) {
      h += `<div class="card"><div class="name">返済の予定</div><div class="sub">${C.loan.every}日ごと。` +
        C.loan.dues.map((v, i) => (i < S.loan.n ? `<s>${v}</s>` : i === S.loan.n ? `<b class="gold">${v}</b>` : v)).join(' → ') + ` 枚</div></div>`;
    }
    h += `<h3>荷車と護衛</h3><div class="card"><div class="name">${cart.icon} ${cart.name}</div><div class="sub">${cart.desc}</div>` +
      `<div class="stat"><div><span>荷の重さ</span> ${cargoWeight()}/${cart.cap}</div><div><span>具合</span> ${Math.round(S.cart.hp)}%</div>` +
      `<div><span>護衛</span> ${S.guards}/${cart.guards}人</div><div><span>戦う力</span> ${power(false)}</div></div></div>`;
    const cg = Object.keys(S.cargo);
    h += `<h3>荷（値打ち ${fmt(cargoWorth())}枚）</h3><div class="card">` + (cg.length ? cg.map((g) => `<div>${D.GOODS[g].icon} ${D.GOODS[g].name} × ${S.cargo[g].qty}` +
      ` <span class="sub">重さ${S.cargo[g].qty * D.GOODS[g].w}` + (D.GOODS[g].shelf ? `・鮮度${Math.round(fresh(g, S.cargo[g].age) * 100)}%` : '') + `</span></div>`).join('') : `<span class="sub">空っぽ</span>`) + `</div>`;
    const vis = Object.keys(D.TOWNS).filter((t) => S.seen[t] === 2);
    h += `<h3>町の評判（訪れた町 ${vis.length}/${Object.keys(D.TOWNS).length}）</h3><div class="card stat">` +
      vis.map((t) => `<div><span>${D.TOWNS[t].name}</span> ${Math.floor(S.rep[t])}${S.pass[t] ? ' 🪪' : ''}</div>`).join('') + `</div>` +
      `<p class="sub">評判は、町が欲しがる品を売る、頼みごとを果たす、で上がる。${C.passRep}で関所の通行手形（🪪）、${C.shop[1].rep}で露店。</p>`;
    h += `<h3>これまで</h3><div class="card stat"><div><span>行商</span> ${S.stats.trips}回</div><div><span>果たした頼み</span> ${S.stats.orders}件</div>` +
      `<div><span>山賊を退けた</span> ${S.stats.wins}回</div><div><span>奪われた</span> ${S.stats.robbed}回</div></div>`;
    h += `<button class="b wide" data-a="help">遊び方を見る</button><button class="b warn wide" data-a="reset">記録を捨てて最初から</button>`;
    return h;
  }
  function helpBody() {
    return `<p>① <b>市場</b>で特産を買う。品には<b>重さ</b>があり、籠にはわずかしか入らない。売り買いを始めると1刻（1日の4分の1）進む。</p>` +
      `<p>② <b>地図</b>で隣の町を選び、道を決めて出発する。</p><p>③ 着いた町で売る。差額がもうけ。</p>` +
      `<p>④ <b>${C.loan.every}日ごと</b>に親の借金を納める。額は上がっていく。足りなければ差し押さえ、何も残らなければ<b>破産で最初から</b>。</p>` +
      `<p class="sub">特産の在庫には限りがあり、売りこんだ町の値はなかなか戻らない。同じ道の往復では続かない。</p>` +
      `<p class="sub">となり町の売値は「◯日前に聞いた値」。値は日々動く。</p>` +
      `<p class="sub">値打ちのある荷ほど山賊に狙われ、関所の税（荷の値打ちの${Math.round(C.gateTax * 100)}%）も重くなる。関所を預かる町で評判を上げれば通行手形がもらえる。</p>` +
      `<p class="sub"><b>町</b>では、顔役からの頼みごと（期限つき）、護衛、隊商、車屋、金貸しが使える。</p>`;
  }
  function intro() {
    S.told.intro = 0;
    tell('intro', { gold: C.startGold });
    notices.push({ title: '遊び方', body: helpBody(), label: 'はじめる' });
    save(); showNotices();
  }

  // ---------- 町での操作 ----------
  const actions = {
    tab(d) { ui.tab = d.id; window.scrollTo(0, 0); render(); },
    dest(d) { ui.dest = d.id || null; render(); },
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
      if (max <= 0) return toast(Math.floor(S.stock[t][g]) <= 0 ? '売り切れ。数日待てば入る' : freeWeight() < D.GOODS[g].w ? '重くてもう積めない' : 'お金が足りない');
      openQty({
        title: `${D.GOODS[g].name}を買う`, max, okLabel: '買う',
        calc: (q) => { const r = quote(t, g, q, 1); return `合計 ${G(r.tot)}　<span class="sub">重さ ${q * D.GOODS[g].w}（残り ${freeWeight() - q * D.GOODS[g].w}）</span>`; },
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
        title: `${D.GOODS[g].name}を売る`, max: own.qty, okLabel: '売る',
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
      const who = D.TOWNS[S.town].who, src = Object.keys(D.TOWNS).filter((p) => sellsHere(p, o.g) && S.named[p]).map((p) => D.TOWNS[p].name);
      notices.push({
        title: `📜 ${who.name}の頼み`,
        body: `<p class="story">「${D.GOODS[o.g].name}を${o.n}個、${o.days}日のうちに。頼んだよ。」</p>` +
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
      S.orders.splice(+d.i, 1);
      notices.push({ title: '📜 約束を果たした', body: `<p>${D.TOWNS[o.t].who.name}に${D.GOODS[o.g].name}${o.n}個を納めた。</p><p>報酬 ${G(o.reward)}　評判 +${o.rep}</p>` });
      tell('order1');
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
      const hint = Object.keys(D.TOWNS).filter((t) => !S.named[t] && Object.keys(D.ROADS).some((rid) => {
        const r = D.ROADS[rid]; return (r.a === t && S.seen[r.b]) || (r.b === t && S.seen[r.a]);
      }));
      const hotNew = Object.keys(S.hot).filter((r) => S.hot[r] > d && !S.hotKnown[r] && S.roads[r]);
      const roll = Math.random();
      if (hint.length && roll < 0.45) {
        const t = pick(hint), T = D.TOWNS[t];
        S.named[t] = true; if (!S.seen[t]) S.seen[t] = 1;
        for (const rid in D.ROADS) { const r = D.ROADS[rid]; if ((r.a === t && S.seen[r.b]) || (r.b === t && S.seen[r.a])) S.roads[rid] = true; }
        body = `<p>「<b>${T.name}</b>を知ってるかい。${T.desc}」</p><p class="sub">特産：${Object.keys(T.stock).filter((g) => !D.CONTRABAND.includes(g)).map((g) => D.GOODS[g].name).join('・')}　地図に書きこんだ。</p>`;
      } else if (hotNew.length && roll < 0.7) {
        const rid = pick(hotNew), r = D.ROADS[rid];
        S.hotKnown[rid] = true;
        body = `<p>「${townName(r.a)}と${townName(r.b)}のあいだの${D.ROAD_TYPES[r.type].name}に、近ごろ山賊が居ついたそうだ。」</p><p class="sub">地図に赤く印をつけた。</p>`;
      } else {
        let x;
        if (Math.random() < C.rumorFalse) {
          const t = pick(Object.keys(D.TOWNS).filter((k) => S.named[k])), g = pick(Object.keys(D.GOODS).filter((k) => !banned(t, k)));
          x = { t, g, up: Math.random() < 0.7, until: d + rndi(8, 16) };
        } else {
          const real = S.trends.filter((k) => S.named[k.t] && !S.rumors.some((q) => q.t === k.t && q.g === k.g));
          const k = real.length ? pick(real) : spawnTrend();
          if (k && S.named[k.t]) x = { t: k.t, g: k.g, up: k.m > 1, until: k.until };
        }
        if (x) { S.rumors.push(x); body = `<p>「聞いたかい。」</p>${rumorLine(x)}<p class="sub">本当かどうかは、行ってみないとわからない。</p>`; }
        else body = `<p>酔っぱらいの自慢話ばかりで、役に立つ話はなかった。</p>`;
      }
      advance(1);
      notices.push({ title: '🍺 酒場の噂', body });
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
        `<p class="sub">待つあいだも宿代はかかる。関所の税は自分で払う。</p>`, '加わる', () => {
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
      confirmBox(`${c.name}を買う`, `<p>${c.desc}</p><p>支払い ${G(Math.max(0, cost))}${c.feed ? `　餌代 1日${c.feed}枚` : ''}</p>`, '買う', () => {
        S.gold -= cost; S.cart = { type: d.id, hp: 100 }; S.guards = Math.min(S.guards, c.guards);
        settle(); toast(`${c.name}を手に入れた`);
      });
    },
    sellCart() {
      const tin = tradeIn(), c = cartT();
      if (S.cart.type === 'basket') return;
      if (cargoWeight() > D.CARTS.basket.cap) return toast(`荷が重すぎる（背負い籠は重さ${D.CARTS.basket.cap}まで）`);
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
      for (let i = 0; i < (full ? 20 : 2); i++) for (const rid in D.ROADS) { const r = D.ROADS[rid]; if (set.has(r.a) || set.has(r.b)) set = new Set([...set, r.a, r.b]); }
      let n = 0;
      for (const t of set) { if (!S.named[t]) n++; S.named[t] = true; if (!S.seen[t]) S.seen[t] = 1; }
      for (const rid in D.ROADS) { const r = D.ROADS[rid]; if (set.has(r.a) && set.has(r.b) && !S.roads[rid]) { S.roads[rid] = true; n++; } }
      if (!n) return toast('この地図に、知らないことは載っていない');
      S.gold -= cost;
      notices.push({ title: '🗺️ 地図を買った', body: `<p>${full ? '国じゅう' : 'このあたり'}の町と道を書き写した。</p>` });
      settle();
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
        title: `${D.GOODS[g].name}を預ける`, max, okLabel: '預ける',
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
      if (travel || !S.roads[d.r]) return;
      const r = D.ROADS[d.r];
      if (r.a !== S.town && r.b !== S.town) return;
      startTravel(d.r, false);
    }
  };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.a];
    if (fn) fn(el.dataset);
  });

  // ---------- 移動 ----------
  function tlog(msg, cls) { travel.log.push(`<div class="${cls || ''}">${msg}</div>`); const el = $('#rlog'); if (el) el.innerHTML = travel.log.join(''); }
  function startTravel(rid, caravan) {
    const i = routeInfo(rid, caravan), r = i.r;
    recordMemo(S.town);
    travel = { rid, from: S.town, to: i.to, days: i.days, caravan, frac: 0, log: [], queue: [] };
    if (r.gate) travel.queue.push('gate');
    if (Math.random() < banditChance(i.danger, caravan)) travel.queue.push('bandit');
    if (Math.random() < i.breakP) travel.queue.push('break');
    $('#tabs').classList.add('hidden');
    $('#main').innerHTML = `<h2>${townName(travel.from)} → ${townName(travel.to)}</h2><div class="mapwrap"><canvas id="map"></canvas></div>` +
      `<div class="card roadlog" id="rlog"></div>`;
    window.scrollTo(0, 0);
    tlog(`${caravan ? '隊商とともに' : D.ROAD_TYPES[r.type].name + 'を'}歩きだした。${i.days}日の道のり。${S.rain ? '雨が降っている。' : ''}`);
    renderHud(); drawMap($('#map'), false);
    walk(0.5, nextEvent);
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
    if (!ev) return walk(1, arrive);
    if (ev === 'gate') gateEvent(); else if (ev === 'bandit') banditEvent(); else breakEvent();
  }
  const cont = (label) => [{ label: label || '先へ進む', cls: 'pri', fn: nextEvent }];

  // 関所：荷の値打ちに応じた税。通行手形があれば免除。禁制品は、そのまま通るか、袖の下を渡すか
  function gateEvent() {
    const r = D.ROADS[travel.rid], gt = r.gate, hasPass = !!S.pass[gt], tax = gateTax(travel.rid), cw = contraWorth();
    let head = `<p>${D.TOWNS[gt].name}の関所だ。役人が荷をあらためる。</p>`;
    if (hasPass) head += `<p class="good">通行手形を見せた。税はかからない。</p>`;
    else if (tax) { const s = pay(tax); head += `<p>荷の値打ち ${fmt(cargoWorth())}枚に対し、税 ${G(tax)} を払った。${s ? `<span class="bad">足りない ${fmt(s)}枚はツケになった。</span>` : ''}</p>`; }
    else head += `<p>荷がないので、税はかからない。</p>`;
    tlog(`🏯 関所を通った（${hasPass ? '手形で税なし' : '税 ' + tax + '枚'}）。`);
    renderHud();
    if (!cw) return modal({ title: '🏯 関所', body: head, buttons: cont() });
    const inspect = (p, bribed) => {
      if (Math.random() < p) {
        const n = dropContraband(), fine = Math.ceil(cw * C.fineRate), s = pay(fine);
        S.rep[gt] = Math.max(0, S.rep[gt] - 8);
        tlog('🚫 関所で禁制品を没収された。', 'bad'); renderHud();
        modal({
          title: '🚫 見つかった',
          body: `<p class="bad">${bribed ? '役人は金を受け取ったうえで、荷の底をあらためた。' : '荷の底の包みを、役人の手が探り当てた。'}</p>` +
            `<p>禁制品 ${n}個を没収され、罰金 ${G(fine)}。${s ? 'ツケになった。' : ''}${D.TOWNS[gt].name}での評判も落ちた。</p>`, buttons: cont()
        });
      } else {
        tlog(bribed ? '🤝 袖の下で関所を通った。' : '😮‍💨 禁制品は見つからなかった。', 'good');
        modal({ title: '通してもらえた', body: `<p class="good">${bribed ? '役人は銅貨を袖にしまい、あごで先を示した。' : '役人は荷の上をひと撫でしただけで、手を振った。'}</p>`, buttons: cont() });
      }
    };
    const bribe = Math.ceil(cw * C.bribeRate + C.bribeBase), base = hasPass ? C.gateFindPass : C.gateFind;
    const btns = [{ label: `そのまま通る（見つかる 約${Math.round(base * 100)}%）`, cls: 'pri', fn: () => inspect(base, false) }];
    if (S.gold >= bribe) btns.push({ label: `🤝 袖の下を渡す（${bribe}枚）`, fn: () => { S.gold -= bribe; renderHud(); inspect(C.bribeFind, true); } });
    modal({
      title: '🏯 関所',
      body: head + `<p class="bad">荷の底には禁制品（値打ち ${fmt(cw)}枚）。見つかれば没収のうえ、罰金 ${fmt(Math.ceil(cw * C.fineRate))}枚。</p>`,
      buttons: btns
    });
  }

  function banditEvent() {
    const info = routeInfo(travel.rid), worth = cargoWorth();
    const big = Math.random() < clamp(0.2 + worth / 1500 + (info.danger >= 3 ? 0.2 : 0), 0, 0.8);
    const B = C.bandits[big ? 'gang' : 'thief'], ep = rnd(B.min, B.max), pp = power(travel.caravan);
    const after = () => { tell('firstBandit'); nextEvent(); };
    const done = (label) => [{ label: label || '先へ進む', cls: 'pri', fn: after }];
    if (S.gold < 1 && cargoCount() === 0) {
      tlog(`${B.name}に囲まれたが、取るものが何もなかった。`);
      return modal({ title: `🗡️ ${B.name}`, body: '<p>囲まれたが、荷は空、財布も空。あきれ顔で去っていった。</p>', buttons: done() });
    }
    const prob = (pp * pp) / (pp * pp + ep * ep);
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
        S.gold -= toll; tlog(`💰 ${B.name}に通行料 ${toll}枚 を払った。`); renderHud();
        modal({ title: '見逃してもらった', body: `<p>${G(toll)} を渡すと、道をあけた。</p>`, buttons: done() });
      }
    });
    if (cargoCount() > 0) btns.push({
      label: `📦 荷の${Math.round(B.take * 10)}割を渡す`, fn: () => {
        const n = loseCargo(B.take); tlog(`📦 ${B.name}に荷 ${n}個 を渡した。`); renderHud();
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
        const lost = loseCargo(0.6), gold = Math.floor(S.gold * 0.35);
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
      tlog(`🔧 ${c.name}が壊れ、荷 ${n}個 を捨てた。1日遅れた。`, 'bad'); renderHud();
      modal({ title: '荷を捨てた', body: `<p>軽くするしかない。荷 ${n}個を道ばたに置き、だましだまし進む。</p>`, buttons: cont() });
    };
    const btns = [];
    if (S.gold >= c.repair) btns.push({
      label: `🔧 直してもらう（${c.repair}枚）`, cls: 'pri', fn: () => {
        S.gold -= c.repair; tlog(`🔧 ${c.name}が壊れ、${c.repair}枚 で直した。1日遅れた。`); renderHud(); nextEvent();
      }
    });
    if (cargoCount() > 0) btns.push({ label: '📦 荷を4割捨てて進む', fn: dump });
    if (!btns.length) btns.push({ label: 'だましだまし進む', cls: 'pri', fn: () => { S.cart.hp = Math.max(5, S.cart.hp - 20); tlog(`🔧 ${c.name}が壊れた。1日遅れた。`, 'bad'); nextEvent(); } });
    modal({
      title: '🔧 車が壊れた',
      body: `<p>${S.rain ? 'ぬかるみに車輪を取られ、' : '石に乗り上げ、'}${c.name}の車輪が割れた。1日の遅れ。</p>` +
        `<p class="sub">通りがかりの職人に直してもらうか、荷を減らして進むか。</p>`,
      buttons: btns
    });
  }
  function arrive() {
    const t = travel, T = D.TOWNS[t.to], type = D.ROADS[t.rid].type;
    S.town = t.to;
    if (S.cart.type !== 'basket') S.cart.hp = Math.max(5, S.cart.hp - rnd(2, 5) * (type === 'road' ? 1 : 2));
    advance(t.days * 4 - (S.time % 4));   // 着くのは朝
    travel = null; ui = { tab: 'market', dest: null };
    if (S.dead) return gameOver();
    const first = discover(t.to);
    let body = `<p>${t.days}日かけて着いた。${first ? '<b class="good">はじめて訪れる町だ。地図に書きこんだ。</b>' : ''}</p>` + t.log.slice(1).join('');
    if (T.cityTax) {  // 王都の門
      const tax = cargoCount() ? Math.max(1, Math.ceil(cargoWorth() * T.cityTax)) : 0;
      if (tax) { const s = pay(tax); body += `<p>門で入市税 ${G(tax)} を取られた。${s ? `<span class="bad">足りない ${fmt(s)}枚はツケになった。</span>` : ''}</p>`; }
      const cw = contraWorth();
      if (cw && Math.random() < C.cityFind) {
        const n = dropContraband(), fine = Math.ceil(cw * C.fineRate);
        pay(fine); S.rep[t.to] = Math.max(0, S.rep[t.to] - 10);
        body += `<p class="bad">門番に禁制品を見つけられた。${n}個を没収され、罰金 ${fmt(fine)}枚。評判も落ちた。</p>`;
      }
    }
    S.stats.trips++;
    recordMemo(S.town);
    notices.push({ title: `🚩 ${T.name}に着いた`, body, label: '町に入る' });
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
    const gy = H * 0.72, DUR = 2.6, mine = 1 + Math.min(4, S.guards + (travel && travel.caravan ? 3 : 0)), foes = 3;
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
  window.addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(() => { if (travel) drawMap($('#map'), false); else if (ui.tab === 'map') render(); }, 200); });

  // 動作確認用（テストやコンソールから中をのぞける）
  window.__shokai = {
    get state() { return S; }, get travel() { return travel; },
    routeInfo, roadsFrom, neighbors, buyNow, sellNow, mult, maxBuy, heard, offersOf, banditChance, gateTax,
    dailyCost, advance, settle, stage, power, fresh, sellsHere, banned, cargoCount, cargoWeight, freeWeight, cargoWorth, contraWorth,
    owed, daysLeft, dueNow, loanLeft, tradeIn, DIST, SAVE_KEY
  };
})();
