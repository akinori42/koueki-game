// ゲーム本体。数値やデータは js/data/ のファイルにある。
(function () {
  'use strict';

  const D = window.DATA;
  const C = D.CONFIG;
  const SAVE_KEY = 'kaze-to-ho-save-v1';   // 保存場所の名前（中身の版は S.v で見分ける）
  const SAVE_VERSION = 2;
  const WIND_NAME = { tail: '追い風', side: '横風', head: '向かい風' };
  const MED = ['wmed', 'adri', 'emed', 'levant', 'nafrica', 'black'];

  let S = null;                 // セーブされる状態
  let ui = { tab: 'trade', dest: null };
  let voyage = null;            // 航海中だけ使う
  let notices = [];             // 入港後に順番に出すお知らせ

  // ---------- 小道具 ----------
  const $ = (s) => document.querySelector(s);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rndi = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = (n) => Math.round(n).toLocaleString('ja-JP');
  const G = (n) => `<span class="gold">${fmt(n)}G</span>`;

  function year() { return C.startYear + Math.floor(S.day / 365); }
  function dateStr() {
    const m = Math.min(12, Math.floor((S.day % 365) / 30.42) + 1);
    return `${year()}年${m}月`;
  }
  function eraOf(id) { return D.ERAS.find((e) => e.id === id); }
  function currentEra() {
    let cur = D.ERAS[0];
    for (const e of D.ERAS) if (e.year <= year()) cur = e;
    return cur;
  }
  function nextEra() { return D.ERAS.find((e) => e.year > year()); }
  function shipUnlocked(t) { const e = eraOf(t.era); return !e || e.year <= year(); }
  function regionName(pid) { const r = D.REGIONS[D.PORTS[pid].region]; return r ? r.name : ''; }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast.tm);
    toast.tm = setTimeout(() => t.classList.add('hidden'), 1800);
  }

  // ---------- セーブ ----------
  function newGame() {
    S = {
      v: SAVE_VERSION, gold: C.startGold, day: 0, port: C.startPort,
      ship: newShip(C.startShip, C.startCrew),
      cargo: {}, food: C.startFood, market: {}, known: {}, found: null, trends: [],
      erasSeen: D.ERAS.filter((e) => e.year <= C.startYear).map((e) => e.id),
      stats: { voyages: 0, wins: 0, profit: 0 }
    };
    fillMissing();
    for (let i = 0; i < 8; i++) spawnTrend();
    recordKnown(S.port);
    npcs = [];
  }
  function newShip(type, crew) {
    const t = D.SHIPS[type];
    return { type, sail: t.sail, up: {}, hp: 100, guns: 0, crew: clamp(crew, C.minCrewAbs, t.maxCrew), invested: 0 };
  }
  // 版1（港8・品物8のころ）のセーブを今の形に直す
  function migrate(o) {
    if (o.v === 1) {
      o.v = 2;
      o.found = null;     // fillMissing が、訪れた港から発見済みの港を決め直す
      o.trends = [];
    }
    return o.v === SAVE_VERSION ? o : null;
  }
  // データに港や品物が後から足されても、古いセーブで動くように穴を埋める
  function fillMissing() {
    for (const pid in D.PORTS) {
      S.market[pid] = S.market[pid] || {};
      for (const gid in D.GOODS) {
        if (typeof S.market[pid][gid] !== 'number') S.market[pid][gid] = rnd(-0.1, 0.1);
      }
    }
    for (const gid in S.cargo) if (!D.GOODS[gid]) delete S.cargo[gid];
    if (!D.SHIPS[S.ship.type]) S.ship = newShip(C.startShip, S.ship.crew || C.startCrew);
    if (!D.SAILS[S.ship.sail]) S.ship.sail = D.SHIPS[S.ship.type].sail;
    if (!D.PORTS[S.port]) S.port = C.startPort;
    S.known = S.known || {};
    for (const pid in S.known) {
      if (!D.PORTS[pid]) { delete S.known[pid]; continue; }
      S.known[pid].prices = S.known[pid].prices || {};
      S.known[pid].buys = S.known[pid].buys || {};
    }
    S.trends = (S.trends || []).filter((t) => D.PORTS[t.p] && D.GOODS[t.g]);
    // 発見済みの港：隠れていない港すべて ＋ これまで訪れた港で噂を聞ける港
    const found = new Set((S.found || []).filter((p) => D.PORTS[p]));
    for (const pid in D.PORTS) if (!D.PORTS[pid].hidden) found.add(pid);
    found.add(S.port);
    for (const pid in S.known) found.add(pid);
    S.found = [...found];
    for (const pid of Object.keys(S.known).concat(S.port)) hearRumors(pid, true);
  }
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* 保存できない環境でも遊べる */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      let o = JSON.parse(raw);
      if (!o || typeof o.v !== 'number') return false;
      if (o.v !== SAVE_VERSION) {
        try { localStorage.setItem(SAVE_KEY + '-backup-v' + o.v, raw); } catch (e) { /* 控えが取れなくても続ける */ }
        o = migrate(o);
        if (!o) return false;
      }
      S = o; fillMissing(); npcs = [];
      return true;
    } catch (e) { return false; }
  }

  // ---------- 港の発見 ----------
  // pid に入港したとき、そこで噂が聞ける隠れ港を発見する
  function hearRumors(pid, silent) {
    const got = [];
    for (const id in D.PORTS) {
      const p = D.PORTS[id];
      if (p.hidden && p.heardAt && p.heardAt.includes(pid) && !S.found.includes(id)) { S.found.push(id); got.push(id); }
    }
    if (!silent) {
      for (const id of got) {
        const p = D.PORTS[id];
        notices.push({
          title: '🧭 船乗りの噂', label: '海図に書きこむ',
          body: `<p>酒場で耳よりな話を聞いた。</p><p><b>${p.name}</b>（${regionName(id)}）<br><span class="sub">${p.desc}</span></p>` +
            `<p class="sub">特産：${sellList(id)}</p><p>海図に新しい港が加わった。</p>`
        });
      }
    }
    return got;
  }
  function sellList(pid) { return Object.keys(D.PORTS[pid].sells || {}).map((g) => D.GOODS[g].name).join('・') || 'なし'; }

  // ---------- 船の性能 ----------
  function spec(sh) {
    sh = sh || S.ship;
    const t = D.SHIPS[sh.type];
    let speed = t.speed, hold = t.hold, minCrew = t.minCrew;
    for (const k in D.UPGRADES) {
      const lv = sh.up[k] || 0, e = D.UPGRADES[k].perLevel;
      speed *= Math.pow(e.speed || 1, lv);
      hold *= Math.pow(e.hold || 1, lv);
      minCrew *= Math.pow(e.minCrew || 1, lv);
    }
    return { t, speed, hold: Math.round(hold), minCrew: Math.round(minCrew) };
  }
  function cargoCount() { let n = 0; for (const g in S.cargo) n += S.cargo[g].qty; return n; }
  function usedSpace() { return cargoCount() + Math.ceil(S.food) + S.ship.guns; }
  function freeSpace() { return Math.max(0, spec().hold - usedSpace()); }
  function crewFactor(sp) { return S.ship.crew >= sp.minCrew ? 1 : 0.5 + 0.5 * S.ship.crew / sp.minCrew; }
  function foodPerDay() { return S.ship.crew / C.crewPerFood; }
  function playerPower() { return S.ship.guns * 4 + S.ship.crew * 0.5; }

  // ---------- 相場 ----------
  function sells(pid, gid) { const s = D.PORTS[pid].sells; return !!s && s[gid] != null; }
  // 港と品の基本の倍率（産地 → 特に欲しがる品 → 地域の傾向 → 1.0 の順に探す）
  function rawMult(pid, gid) {
    const p = D.PORTS[pid];
    if (p.sells && p.sells[gid] != null) return p.sells[gid];
    if (p.wants && p.wants[gid] != null) return p.wants[gid];
    const r = D.REGIONS[p.region];
    return (r && r.prices[gid]) || 1;
  }
  // 産地に近い港では、その品は高くならない（近場の往復だけで大もうけできないようにする）
  function baseMult(pid, gid) {
    const raw = rawMult(pid, gid), cap = nearCap[pid][gid];
    return cap !== undefined && cap < raw ? cap : raw;
  }
  function trendOf(pid, gid) {
    for (const t of S.trends) if (t.p === pid && t.g === gid) return t;
    return null;
  }
  function mult(pid, gid) { const t = trendOf(pid, gid); return baseMult(pid, gid) * (t ? t.m : 1); }
  function step(pid, gid) { return 1 / (D.GOODS[gid].depth * D.PORTS[pid].size); }
  function unitBuy(pid, gid, dev) { return Math.max(1, Math.ceil(D.GOODS[gid].base * mult(pid, gid) * (1 + dev))); }
  function unitSell(pid, gid, dev) { return Math.max(1, Math.floor(D.GOODS[gid].base * mult(pid, gid) * (1 + dev) * C.sellRate)); }
  function buyNow(pid, gid) { return unitBuy(pid, gid, S.market[pid][gid]); }
  function sellNow(pid, gid) { return unitSell(pid, gid, S.market[pid][gid]); }

  // q 個まとめて売買したときの合計と、その後の相場
  function quote(pid, gid, q, dir) {
    let dev = S.market[pid][gid], tot = 0;
    const st = step(pid, gid);
    for (let i = 0; i < q; i++) {
      if (dir > 0) { tot += unitBuy(pid, gid, dev); dev = Math.min(C.devMax, dev + st); }
      else { tot += unitSell(pid, gid, dev); dev = Math.max(C.devMin, dev - st); }
    }
    return { tot, dev };
  }
  function maxBuy(pid, gid) {
    const free = freeSpace(), st = step(pid, gid);
    let dev = S.market[pid][gid], cost = 0, n = 0;
    while (n < free) {
      const pr = unitBuy(pid, gid, dev);
      if (cost + pr > S.gold) break;
      cost += pr; dev = Math.min(C.devMax, dev + st); n++;
    }
    return n;
  }
  // 市況の変化を1つ起こす（発見済みの港のどこかで、ある品が高騰／値崩れ）
  function spawnTrend() {
    if (S.trends.length >= C.trendMax) return;
    const p = pick(S.found), g = pick(Object.keys(D.GOODS));
    if (trendOf(p, g)) return;
    const down = sells(p, g) ? true : Math.random() < 0.25;
    const range = down ? C.trendDown : C.trendUp;
    S.trends.push({ p, g, m: +rnd(range[0], range[1]).toFixed(2), until: S.day + rndi(C.trendDays[0], C.trendDays[1]) });
  }
  function advanceMarket(days) {
    for (let d = 0; d < days; d++) {
      for (const pid in S.market) {
        const m = S.market[pid];
        for (const gid in m) m[gid] = clamp(m[gid] * C.devDecay + rnd(-C.devNoise, C.devNoise), C.devMin, C.devMax);
      }
    }
    S.trends = S.trends.filter((t) => t.until > S.day);
    for (let d = 0; d < days; d++) if (Math.random() < C.trendChance) spawnTrend();
  }
  function recordKnown(pid) {
    const prices = {}, buys = {};
    for (const gid in D.GOODS) {
      prices[gid] = sellNow(pid, gid);
      if (sells(pid, gid)) buys[gid] = buyNow(pid, gid);
    }
    S.known[pid] = { day: S.day, prices, buys };
  }
  function trendLine(t) {
    const up = t.m > 1, left = Math.max(1, t.until - S.day);
    return `<div class="${up ? 'good' : 'bad'}">${up ? '📈' : '📉'} ${D.PORTS[t.p].name}：${D.GOODS[t.g].name}が${up ? '高騰' : '値崩れ'}` +
      `<span class="sub">（あと約${left}日）</span></div>`;
  }

  // ---------- 陸と海の判定・航路 ----------
  const LAND = D.MAP.LAND.map((pts) => {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    return { pts, x0, x1, y0, y1 };
  });
  function inLand(p) {
    for (const L of LAND) {
      if (p[0] < L.x0 || p[0] > L.x1 || p[1] < L.y0 || p[1] > L.y1) continue;
      let inside = false;
      const a = L.pts;
      for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
        if ((a[i][1] > p[1]) !== (a[j][1] > p[1]) &&
          p[0] < (a[j][0] - a[i][0]) * (p[1] - a[i][1]) / (a[j][1] - a[i][1]) + a[i][0]) inside = !inside;
      }
      if (inside) return true;
    }
    return false;
  }
  function cross(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
  // a-b の直線が陸を横切らなければ true
  function clearLine(a, b) {
    const sx0 = Math.min(a[0], b[0]), sx1 = Math.max(a[0], b[0]), sy0 = Math.min(a[1], b[1]), sy1 = Math.max(a[1], b[1]);
    for (const L of LAND) {
      if (sx1 < L.x0 || sx0 > L.x1 || sy1 < L.y0 || sy0 > L.y1) continue;
      const q = L.pts;
      for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
        const c = q[j], d = q[i];
        const d1 = cross(c, d, a), d2 = cross(c, d, b);
        if (!((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))) continue;
        const d3 = cross(a, b, c), d4 = cross(a, b, d);
        if ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)) return false;
      }
    }
    return true;
  }
  function nm(a, b) {
    const k = Math.cos((a[1] + b[1]) / 2 * Math.PI / 180);
    return Math.hypot((a[0] - b[0]) * 60 * k, (a[1] - b[1]) * 60);
  }
  // 航路の網を作る：中継点どうし・港と中継点を、陸を横切らない直線で結ぶ
  const graph = (function () {
    const ids = [], pos = [], isPort = [], idx = {}, warnings = [];
    for (const k in D.MAP.SEA_NODES) { idx[k] = ids.length; ids.push(k); pos.push(D.MAP.SEA_NODES[k]); isPort.push(false); }
    const nNodes = ids.length;
    for (const pid in D.PORTS) { idx['p:' + pid] = ids.length; ids.push('p:' + pid); pos.push(D.PORTS[pid].pos); isPort.push(true); }
    const adj = ids.map(() => []);
    const link = (i, j, d) => { adj[i].push([j, d]); adj[j].push([i, d]); };
    for (let i = 0; i < nNodes; i++) {
      for (let j = i + 1; j < nNodes; j++) {
        const d = nm(pos[i], pos[j]);
        if (d <= C.maxLeg && clearLine(pos[i], pos[j])) link(i, j, d);
      }
    }
    for (let i = nNodes; i < ids.length; i++) {
      const p = pos[i], onLand = inLand(p);
      let best = -1, bd = 1e9, cnt = 0;
      for (let j = 0; j < nNodes; j++) {
        const d = nm(p, pos[j]);
        if (d < bd) { bd = d; best = j; }
        if (d > 700) continue;
        let ok;
        if (!onLand) ok = clearLine(p, pos[j]);
        else { // 港が陸の形の内側にあるときは、少し沖へ出た点から調べる
          const len = Math.hypot(pos[j][0] - p[0], pos[j][1] - p[1]) || 1;
          const s = [p[0] + (pos[j][0] - p[0]) / len * 0.4, p[1] + (pos[j][1] - p[1]) / len * 0.4];
          ok = !inLand(s) && clearLine(s, pos[j]);
        }
        if (ok) { link(i, j, d); cnt++; }
      }
      if (!cnt) { link(i, best, bd); warnings.push(ids[i]); } // どこにも出られない港は、いちばん近い中継点へつなぐ
    }
    return { ids, pos, isPort, idx, adj, nNodes, warnings };
  })();
  const ssspCache = {}, routeCache = {};
  function sssp(pid) {
    if (ssspCache[pid]) return ssspCache[pid];
    const n = graph.ids.length, src = graph.idx['p:' + pid];
    const dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
    dist[src] = 0;
    for (;;) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0) break;
      done[u] = true;
      if (graph.isPort[u] && u !== src) continue; // 他の港は通り抜けない
      for (const e of graph.adj[u]) {
        const nd = dist[u] + e[1];
        if (nd < dist[e[0]]) { dist[e[0]] = nd; prev[e[0]] = u; }
      }
    }
    return (ssspCache[pid] = { dist, prev });
  }
  function route(from, to) {
    const key = from + '>' + to;
    if (routeCache[key]) return routeCache[key];
    const sp = sssp(from), dst = graph.idx['p:' + to];
    if (dst == null || !isFinite(sp.dist[dst])) return null;
    const pts = [];
    for (let k = dst; k >= 0; k = sp.prev[k]) pts.unshift(graph.pos[k]);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + nm(pts[i - 1], pts[i]));
    return (routeCache[key] = { pts, cum, total: cum[cum.length - 1] });
  }
  function seaDist(from, to) { return sssp(from).dist[graph.idx['p:' + to]]; }
  // 産地からの距離で決まる値段の上限。産地の倍率 ×（nearCapBase + 距離 ÷ nearCapDist）
  const nearCap = (function () {
    const cap = {};
    for (const pid in D.PORTS) cap[pid] = {};
    for (const a in D.PORTS) {
      const s = D.PORTS[a].sells || {}, gids = Object.keys(s);
      if (!gids.length) continue;
      for (const b in D.PORTS) {
        if (a === b) continue;
        const f = C.nearCapBase + seaDist(a, b) / C.nearCapDist;
        for (const g of gids) { const v = s[g] * f; if (cap[b][g] === undefined || v < cap[b][g]) cap[b][g] = v; }
      }
    }
    return cap;
  })();
  function pointAt(r, d) {
    d = clamp(d, 0, r.total);
    for (let i = 1; i < r.pts.length; i++) {
      if (d <= r.cum[i]) {
        const f = (d - r.cum[i - 1]) / ((r.cum[i] - r.cum[i - 1]) || 1);
        return [r.pts[i - 1][0] + (r.pts[i][0] - r.pts[i - 1][0]) * f, r.pts[i - 1][1] + (r.pts[i][1] - r.pts[i - 1][1]) * f];
      }
    }
    return r.pts[r.pts.length - 1];
  }
  function estDays(r) {
    const sp = spec();
    return Math.max(1, Math.ceil(r.total / (sp.speed * C.nmPerSpeed * 0.97 * crewFactor(sp))));
  }

  // ---------- 地図 ----------
  const V = D.MAP.VIEW, KXV = 0.8;      // KXV : 経度方向の縮み
  let cam = { lon: D.PORTS[C.startPort].pos[0], lat: D.PORTS[C.startPort].pos[1], z: C.zoomStart };
  let mv = null;                         // 今表示している地図 { cv, ctx, w, h, mode, layer, lctx, key }
  let npcs = [];
  let animOn = false, lastTs = 0, frameNo = 0;

  function px(p) { return [mv.w / 2 + (p[0] - cam.lon) * cam.z * KXV, mv.h / 2 - (p[1] - cam.lat) * cam.z]; }
  function clampCam() {
    cam.z = clamp(cam.z, C.zoomMin, C.zoomMax);
    cam.lon = clamp(cam.lon, V.lonMin, V.lonMax);
    cam.lat = clamp(cam.lat, V.latMin, V.latMax);
  }
  function centerOn(pid) { const p = D.PORTS[pid].pos; cam.lon = p[0]; cam.lat = p[1]; }
  function setupCanvas(cv, h) {
    const w = cv.clientWidth || 340, dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.style.height = h + 'px';
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h, dpr };
  }
  function openMap(cv, mode, frac) {
    const h = clamp(Math.round((window.innerHeight || 700) * frac), 230, 520);
    const { ctx, w, dpr } = setupCanvas(cv, h);
    const layer = document.createElement('canvas');
    layer.width = cv.width; layer.height = cv.height;
    const lctx = layer.getContext('2d');
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mv = { cv, ctx, w, h, mode, layer, lctx, key: '' };
    if (mode === 'sail') bindMapInput(cv);
    if (!npcs.length) initNpcs();
    drawFrame();
    startAnim();
  }
  function mapOpts() {
    if (voyage) return { here: voyage.from, dest: voyage.dest, route: voyage.r };
    return { here: S.port, dest: ui.dest, route: ui.dest ? route(S.port, ui.dest) : null };
  }
  function path(ctx, pts) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) { const q = px(pts[i]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }
  }
  // 動かない部分（海・陸・港・航路）を描く。視点が変わったときだけ描き直す
  function renderStatic(ctx, o) {
    const w = mv.w, h = mv.h;
    const lonHalf = w / 2 / (cam.z * KXV), latHalf = h / 2 / cam.z;
    const vx0 = cam.lon - lonHalf, vx1 = cam.lon + lonHalf, vy0 = cam.lat - latHalf, vy1 = cam.lat + latHalf;
    ctx.fillStyle = '#1d4a68'; ctx.fillRect(0, 0, w, h);
    const vis = LAND.filter((L) => !(L.x1 < vx0 || L.x0 > vx1 || L.y1 < vy0 || L.y0 > vy1));
    ctx.lineJoin = 'round'; ctx.strokeStyle = '#6f6040'; ctx.lineWidth = 2.5;
    for (const L of vis) { path(ctx, L.pts); ctx.closePath(); ctx.stroke(); }
    ctx.fillStyle = '#c9b88a';
    for (const L of vis) { path(ctx, L.pts); ctx.closePath(); ctx.fill(); }

    if (o.route) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      path(ctx, o.route.pts); ctx.stroke(); ctx.setLineDash([]);
    }
    // 港。大事な港から順に名前を置き、重なる名前は省く
    const list = S.found.filter((pid) => {
      const p = D.PORTS[pid].pos;
      return p[0] > vx0 - 2 && p[0] < vx1 + 2 && p[1] > vy0 - 2 && p[1] < vy1 + 2;
    }).sort((a, b) => rank(b) - rank(a));
    function rank(pid) { return (pid === o.here ? 100 : 0) + (pid === o.dest ? 90 : 0) + D.PORTS[pid].size; }
    const boxes = [];
    const r0 = cam.z < 6 ? 2.5 : 4;
    ctx.font = 'bold 10px sans-serif'; ctx.textBaseline = 'middle';
    for (const pid of list) {
      const p = D.PORTS[pid], q = px(p.pos), here = pid === o.here, sel = pid === o.dest;
      ctx.beginPath(); ctx.arc(q[0], q[1], sel || here ? r0 + 2 : r0, 0, 7);
      ctx.fillStyle = sel ? '#ff6b4a' : here ? '#e0b04a' : '#fff';
      ctx.fill(); ctx.strokeStyle = '#1a1205'; ctx.lineWidth = 1.2; ctx.stroke();
      const must = here || sel;
      if (!must && !(cam.z >= 9 || (cam.z >= 5.5 && p.size >= 1.2))) continue;
      const tw = p.name.length * 10 + 4;
      let placed = null;
      for (const side of [1, -1]) {
        const bx = side > 0 ? q[0] + 7 : q[0] - 7 - tw, box = [bx, q[1] - 7, bx + tw, q[1] + 7];
        if (!boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) { placed = { side, box }; break; }
      }
      if (!placed && must) placed = { side: 1, box: [q[0] + 7, q[1] - 7, q[0] + 7 + tw, q[1] + 7] };
      if (!placed) continue;
      boxes.push(placed.box);
      ctx.textAlign = placed.side > 0 ? 'left' : 'right';
      const tx = q[0] + placed.side * 7;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,24,38,.85)'; ctx.strokeText(p.name, tx, q[1]);
      ctx.fillStyle = sel ? '#ffb39f' : here ? '#ffd98a' : '#fff'; ctx.fillText(p.name, tx, q[1]);
    }
  }

  // 小さな船の絵。kind で帆の色と形が変わる
  const BOAT = {
    merchant: { hull: '#6b4423', sail: '#fbf3df' },
    galley: { hull: '#6b4423', sail: '#e6c36a' },
    fisher: { hull: '#8a6a45', sail: '#cdb892' },
    pirate: { hull: '#1c1c1c', sail: '#1c1c1c' },
    warship: { hull: '#4a2a1a', sail: '#c9413a' },
    player: { hull: '#7a4a22', sail: '#ffffff' }
  };
  function drawBoat(ctx, x, y, s, face, kind) {
    const b = BOAT[kind];
    ctx.save();
    ctx.translate(x, y); ctx.scale(face * s, s);
    if (kind === 'player') {
      ctx.beginPath(); ctx.arc(0, -3, 12, 0, 7);
      ctx.fillStyle = 'rgba(224,176,74,.28)'; ctx.fill();
    }
    ctx.fillStyle = b.hull;
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(7, 0); ctx.lineTo(4, 3.5); ctx.lineTo(-4, 3.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = b.sail;
    ctx.beginPath();
    if (kind === 'galley' || kind === 'fisher') { ctx.moveTo(-4, -1); ctx.lineTo(4, -9); ctx.lineTo(3, -1); } // 三角帆
    else { ctx.moveTo(-3.5, -9); ctx.lineTo(3.5, -9); ctx.lineTo(4, -1.5); ctx.lineTo(-4, -1.5); }           // 横帆
    ctx.closePath(); ctx.fill();
    if (kind === 'pirate') { ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = '#ff5a4a'; ctx.fillRect(-1, -12, 4, 2.5); }
    if (kind === 'warship') { ctx.fillStyle = '#f4d35e'; ctx.fillRect(-1, -12, 4, 2.5); }
    if (kind === 'player') { ctx.fillStyle = '#2f6fd0'; ctx.fillRect(-1, -12.5, 5, 3); }
    if (kind === 'galley') { ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 0.8; ctx.beginPath(); for (let i = -3; i <= 3; i += 3) { ctx.moveTo(i, 2); ctx.lineTo(i - 1.5, 6); } ctx.stroke(); }
    ctx.restore();
  }

  // ---------- 地図上の他の船（見た目だけ） ----------
  function npcPool(kind) {
    if (kind === 'galley') return S.found.filter((p) => MED.includes(D.PORTS[p].region));
    if (kind === 'warship') return S.found.filter((p) => D.PORTS[p].shipyard);
    return S.found;
  }
  function npcLeg(n) {
    const pool = npcPool(n.kind);
    const from = n.at && pool.includes(n.at) ? n.at : pick(pool);
    let to = null;
    for (let i = 0; i < 12 && !to; i++) {
      const c = pick(pool);
      if (c !== from && seaDist(from, c) < (n.kind === 'fisher' ? 99999 : 2200)) to = c;
    }
    if (!to) to = pool.find((c) => c !== from) || from;
    n.r = route(from, to) || route(to, from);
    n.at = to; n.dir = 1; n.turns = 0;
    const T = n.r ? n.r.total : 0;
    if (n.kind === 'fisher') { n.lo = Math.min(8, T * 0.1); n.hi = Math.min(T * 0.6, rnd(40, 110)); n.at = from; }
    else if (n.kind === 'pirate') { n.lo = T * 0.2; n.hi = T * 0.8; }
    else { n.lo = 0; n.hi = T; }
    n.d = n.lo;
  }
  function initNpcs() {
    npcs = [];
    const sp = C.npc.speed, v = { merchant: sp, galley: sp * 1.1, fisher: sp * 0.3, pirate: sp * 1.2, warship: sp * 1.15 };
    for (const kind of ['merchant', 'galley', 'fisher', 'pirate', 'warship']) {
      for (let i = 0; i < (C.npc[kind] || 0); i++) {
        const n = { kind, v: v[kind] * rnd(0.8, 1.2), face: 1, x: null };
        npcLeg(n);
        if (!n.r) continue;
        n.d = rnd(n.lo, n.hi);
        npcs.push(n);
      }
    }
  }
  function stepNpcs(dt) {
    for (const n of npcs) {
      n.d += n.dir * n.v * dt;
      if (n.d >= n.hi) {
        if (n.kind === 'fisher' || n.kind === 'pirate') { n.d = n.hi; n.dir = -1; if (++n.turns > 5) npcLeg(n); }
        else npcLeg(n);
      } else if (n.d <= n.lo && n.dir < 0) { n.d = n.lo; n.dir = 1; if (++n.turns > 5) npcLeg(n); }
      // 進む向き（東か西か）で船の絵を左右に向ける
      const p = pointAt(n.r, n.d);
      if (n.p && Math.abs(p[0] - n.p[0]) > 1e-5) n.face = p[0] > n.p[0] ? 1 : -1;
      n.p = p;
    }
  }
  function drawFrame() {
    if (!mv) return;
    const o = mapOpts();
    if (voyage) { // 航海中は自分の船を追いかける
      voyage.shown += (voyage.done - voyage.shown) * 0.3;
      const p = pointAt(voyage.r, voyage.shown);
      cam.lon = p[0]; cam.lat = p[1];
    }
    clampCam();
    const key = [cam.lon.toFixed(3), cam.lat.toFixed(3), cam.z.toFixed(2), o.here, o.dest, S.found.length].join('|');
    if (key !== mv.key) { renderStatic(mv.lctx, o); mv.key = key; }
    const ctx = mv.ctx;
    ctx.drawImage(mv.layer, 0, 0, mv.w, mv.h);
    const s = clamp(cam.z / 12, 0.65, 1.25);
    for (const n of npcs) {
      const q = px(n.p || pointAt(n.r, n.d));
      if (q[0] < -12 || q[0] > mv.w + 12 || q[1] < -12 || q[1] > mv.h + 12) continue;
      drawBoat(ctx, q[0], q[1], n.kind === 'fisher' ? s * 0.7 : s, n.face, n.kind);
    }
    if (voyage) {
      const a = pointAt(voyage.r, voyage.shown), b = pointAt(voyage.r, voyage.shown + 5), q = px(a);
      drawBoat(ctx, q[0], q[1], 1.5, b[0] >= a[0] ? 1 : -1, 'player');
    } else {
      const q = px(D.PORTS[S.port].pos);
      drawBoat(ctx, q[0], q[1] - 9, 1.2, 1, 'player');
    }
  }
  function startAnim() {
    if (animOn) return;
    animOn = true; lastTs = 0;
    requestAnimationFrame(animLoop);
  }
  function animLoop(ts) {
    if (!mv || !mv.cv.isConnected) { animOn = false; mv = null; return; }
    const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    stepNpcs(dt);
    if (++frameNo % 2 === 0) drawFrame();   // 1コマおきに描いて軽くする
    requestAnimationFrame(animLoop);
  }
  function setZoom(z) { cam.z = clamp(z, C.zoomMin, C.zoomMax); }
  // 指での操作：1本でずらす、2本で拡大縮小、軽くタップで港を選ぶ
  function bindMapInput(cv) {
    const pts = new Map();
    let moved = 0, pinch = 0;
    const gap = () => { const a = [...pts.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); };
    cv.onpointerdown = (e) => {
      if (cv.setPointerCapture) { try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 古い端末では無視 */ } }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) moved = 0;
      if (pts.size === 2) pinch = gap();
    };
    cv.onpointermove = (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 1) {
        moved += Math.abs(dx) + Math.abs(dy);
        cam.lon -= dx / (cam.z * KXV); cam.lat += dy / cam.z;
      } else if (pts.size === 2) {
        const g = gap();
        if (pinch > 0) setZoom(cam.z * g / pinch);
        pinch = g; moved = 99;
      }
    };
    const up = (e) => {
      const had = pts.delete(e.pointerId);
      if (had && pts.size === 0 && moved < 10 && e.type === 'pointerup') tapMap(e.clientX, e.clientY);
    };
    cv.onpointerup = up; cv.onpointercancel = up;
    cv.onwheel = (e) => { e.preventDefault(); setZoom(cam.z * (e.deltaY < 0 ? 1.15 : 0.87)); };
  }
  function tapMap(cx, cy) {
    if (!mv) return;
    const rc = mv.cv.getBoundingClientRect(), x = cx - rc.left, y = cy - rc.top;
    let best = null, bd = 26;
    for (const pid of S.found) {
      const q = px(D.PORTS[pid].pos), d = Math.hypot(q[0] - x, q[1] - y);
      if (d < bd) { bd = d; best = pid; }
    }
    if (best && best !== S.port) { ui.dest = best; render(); }
  }

  // ---------- モーダル ----------
  function modal(o) {
    const m = $('#modal');
    const btns = o.buttons || [];
    m.innerHTML = `<div class="mbox"><h2>${o.title || ''}</h2><div>${o.body || ''}</div>` +
      `<div class="mbtns ${o.two ? 'two' : ''}">` +
      btns.map((b, i) => `<button class="b ${b.cls || ''}" data-mi="${i}">${b.label}</button>`).join('') +
      `</div></div>`;
    m.classList.remove('hidden');
    m.querySelectorAll('[data-mi]').forEach((el) => {
      el.onclick = () => { const b = btns[+el.dataset.mi]; closeModal(); if (b.fn) b.fn(); };
    });
  }
  function closeModal() { const m = $('#modal'); m.classList.add('hidden'); m.innerHTML = ''; }
  function confirmBox(title, body, okLabel, fn) {
    modal({ title, body, two: true, buttons: [{ label: 'やめる' }, { label: okLabel, cls: 'pri', fn }] });
  }
  // 個数えらび
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
    { id: 'trade', ic: '⚖️', name: '交易所' },
    { id: 'sail', ic: '🧭', name: '出航' },
    { id: 'dock', ic: '🔨', name: 'ドック' },
    { id: 'info', ic: '📜', name: '商会' }
  ];
  function render() {
    renderHud();
    if (voyage) return;
    $('#tabs').classList.remove('hidden');
    $('#tabs').innerHTML = TABS.map((t) =>
      `<button data-a="tab" data-id="${t.id}" class="${ui.tab === t.id ? 'on' : ''}"><span class="ic">${t.ic}</span>${t.name}</button>`).join('');
    const m = $('#main');
    mv = null;
    if (ui.tab === 'trade') m.innerHTML = viewTrade();
    else if (ui.tab === 'sail') { m.innerHTML = viewSail(); const cv = $('#map'); if (cv) openMap(cv, 'sail', 0.46); }
    else if (ui.tab === 'dock') m.innerHTML = viewDock();
    else m.innerHTML = viewInfo();
  }
  function renderHud() {
    const sp = spec();
    const where = voyage ? `航海中 → ${D.PORTS[voyage.dest].name}` : D.PORTS[S.port].name;
    const days = foodPerDay() > 0 ? Math.floor(S.food / foodPerDay()) : 0;
    $('#hud').innerHTML =
      `<div class="hud1"><span>${where}</span><span class="gold">💰 ${fmt(S.gold)}G</span></div>` +
      `<div class="hud2"><span>📅 ${dateStr()}</span><span>📦 ${usedSpace()}/${sp.hold}</span>` +
      `<span class="${days < 5 ? 'bad' : ''}">🍞 ${Math.floor(S.food)}樽(${days}日)</span>` +
      `<span class="${S.ship.crew < sp.minCrew ? 'bad' : ''}">👥 ${S.ship.crew}</span>` +
      `<span class="${S.ship.hp < 40 ? 'bad' : ''}">🛠 ${Math.round(S.ship.hp)}%</span></div>`;
  }

  function goodCard(gid) {
    const g = D.GOODS[gid], can = sells(S.port, gid), own = S.cargo[gid];
    const sp = sellNow(S.port, gid), tr = trendOf(S.port, gid);
    let l2 = can ? `買値 <b>${fmt(buyNow(S.port, gid))}G</b>　` : '';
    l2 += `売値 ${can ? '' : '<b>'}${fmt(sp)}G${can ? '' : '</b>'}`;
    if (tr) l2 += ` <span class="${tr.m > 1 ? 'good' : 'bad'}">${tr.m > 1 ? '📈高騰中' : '📉値崩れ中'}</span>`;
    let l3 = '';
    if (own) {
      const avg = own.cost / own.qty;
      l3 = `<div class="sub">所持 <b>${own.qty}</b>（仕入れ平均 ${fmt(avg)}G）` +
        `<span class="${sp >= avg ? 'good' : 'bad'}"> ${sp >= avg ? '▲利益' : '▼損'}</span></div>`;
    }
    return `<div class="card row"><div class="grow"><div class="name" data-a="book" data-g="${gid}">${g.icon} ${g.name} <span class="lnk">相場帳</span></div>` +
      `<div>${l2}</div>${l3}</div><div class="btns">` +
      (own ? `<button class="b" data-a="sell" data-g="${gid}">売る</button>` : '') +
      (can ? `<button class="b pri" data-a="buy" data-g="${gid}">買う</button>` : '') + `</div></div>`;
  }
  function viewTrade() {
    const p = D.PORTS[S.port];
    let h = `<h2>${p.name}の交易所</h2><p class="sub">${regionName(S.port)}　${p.desc}</p>`;
    if (S.gold < 100 && cargoCount() === 0) {
      h += `<div class="card"><p>資金が尽きかけている。商人ギルドが再起の資金を貸してくれるそうだ。</p>` +
        `<button class="b pri wide" data-a="aid">援助を受ける（+${C.aidGold}G）</button></div>`;
    }
    // 噂：この港の市況と、近い港の市況
    const here = S.trends.filter((t) => t.p === S.port);
    const near = S.trends.filter((t) => t.p !== S.port && S.found.includes(t.p))
      .sort((a, b) => seaDist(S.port, a.p) - seaDist(S.port, b.p)).slice(0, 4);
    if (here.length || near.length) {
      h += `<div class="card rumor"><div class="name">📣 市場の噂</div>${here.concat(near).map(trendLine).join('')}</div>`;
    }
    h += `<div class="card row"><div class="grow"><div class="name">🍞 食料</div>` +
      `<div class="sub">1樽 ${C.foodPrice}G ／ 所持 ${Math.floor(S.food)}樽（1日に ${foodPerDay().toFixed(1)}樽 消費）</div></div>` +
      `<div class="btns"><button class="b" data-a="foodSell">売る</button><button class="b pri" data-a="foodBuy">買う</button></div></div>`;

    const local = Object.keys(p.sells || {});
    h += `<h3>この港の特産（空き ${freeSpace()}）</h3>` + (local.length ? local.map(goodCard).join('') : `<p class="sub">特産はない。</p>`);
    const owned = Object.keys(S.cargo).filter((g) => !local.includes(g));
    if (owned.length) h += `<h3>積み荷を売る</h3>` + owned.map(goodCard).join('');

    // 全品の相場（高く売れる順）
    const all = Object.keys(D.GOODS).sort((a, b) => mult(S.port, b) - mult(S.port, a));
    h += `<details class="card"><summary>この港の相場をすべて見る（${all.length}品）</summary><table class="t">` +
      `<tr><th>品（タップで相場帳）</th><th>売値</th><th>ふだんとの差</th></tr>` +
      all.map((gid) => {
        const m = mult(S.port, gid) * (1 + S.market[S.port][gid]), pct = Math.round((m - 1) * 100);
        return `<tr data-a="book" data-g="${gid}"><td>${D.GOODS[gid].icon} ${D.GOODS[gid].name}</td><td>${fmt(sellNow(S.port, gid))}G</td>` +
          `<td class="${pct >= 15 ? 'good' : pct <= -15 ? 'bad' : ''}">${pct >= 0 ? '+' : ''}${pct}%</td></tr>`;
      }).join('') + `</table></details>`;
    return h;
  }

  // その港で高く売れる品（上位）
  function wantsOf(pid, n) {
    return Object.keys(D.GOODS).filter((g) => !sells(pid, g)).sort((a, b) => baseMult(pid, b) - baseMult(pid, a))
      .slice(0, n || 4).map((g) => D.GOODS[g].name).join('・');
  }
  function viewSail() {
    let h = `<div class="mapwrap"><canvas id="map"></canvas>` +
      `<div class="mapbtns"><button data-a="zoom" data-d="1">＋</button><button data-a="zoom" data-d="-1">−</button>` +
      `<button data-a="home">⌖</button><button data-a="world">全</button></div></div>` +
      `<p class="sub legend">指でずらす・2本指で拡大。港をタップで行き先に。<br>` +
      `<i class="lg" style="background:#fbf3df"></i>商船 <i class="lg" style="background:#e6c36a"></i>ガレー ` +
      `<i class="lg" style="background:#cdb892"></i>漁船 <i class="lg" style="background:#1c1c1c;border-color:#ff5a4a"></i>海賊 ` +
      `<i class="lg" style="background:#c9413a"></i>軍船</p>`;
    if (!ui.dest) {
      const near = S.found.filter((k) => k !== S.port).sort((a, b) => seaDist(S.port, a) - seaDist(S.port, b)).slice(0, 8);
      h += `<h3>近い港（発見済み ${S.found.length}港）</h3><div class="card">` + near.map((k) => {
        const r = route(S.port, k);
        return `<div class="row" style="padding:4px 0"><div class="grow"><span class="name">${D.PORTS[k].name}</span> ` +
          `<span class="sub">約${estDays(r)}日　${sellList(k)}</span></div><button class="b" data-a="dest" data-id="${k}">選ぶ</button></div>`;
      }).join('') + `</div>`;
      return h;
    }
    const p = D.PORTS[ui.dest], r = route(S.port, ui.dest), days = estDays(r);
    const need = Math.ceil(days * foodPerDay()), short = S.food < need;
    const kn = S.known[ui.dest];
    h += `<div class="card"><div class="row"><div class="grow"><h2>${p.name}</h2><span class="sub">${regionName(ui.dest)}</span></div>` +
      `<button class="b" data-a="dest" data-id="">選び直す</button></div>` +
      `<p class="sub">${p.desc}</p>` +
      `<div class="stat"><div><span>距離</span> ${fmt(r.total)}海里</div><div><span>日数の目安</span> 約${days}日</div>` +
      `<div><span>必要な食料</span> <b class="${short ? 'bad' : 'good'}">約${need}樽</b></div><div><span>所持</span> ${Math.floor(S.food)}樽</div>` +
      `<div><span>造船所</span> ${p.shipyard ? 'あり' : 'なし'}</div><div><span>市場</span> ${p.size >= 1.3 ? '大きい' : p.size >= 1 ? 'ふつう' : '小さい'}</div></div>` +
      `<p class="sub">特産：${sellList(ui.dest)}<br>よく売れる品：${wantsOf(ui.dest)}</p>`;
    const tr = S.trends.filter((t) => t.p === ui.dest);
    if (tr.length) h += `<div class="rumor">${tr.map(trendLine).join('')}</div>`;
    const rows = Object.keys(D.GOODS).filter((g) => sells(S.port, g) || S.cargo[g]);
    if (kn && rows.length) {
      h += `<table class="t"><tr><th>前回の相場（${Math.max(0, S.day - kn.day)}日前）</th><th>ここの買値</th><th>行き先の売値</th></tr>`;
      for (const gid of rows) {
        const here = sells(S.port, gid) ? buyNow(S.port, gid) : null, own = S.cargo[gid];
        const base = here !== null ? here : own.cost / own.qty, there = kn.prices[gid];
        h += `<tr><td>${D.GOODS[gid].name}${own ? `（所持${own.qty}）` : ''}</td><td>${here !== null ? fmt(here) : '—'}</td>` +
          (there == null ? `<td class="sub">不明</td>` : `<td class="${there > base ? 'good' : 'bad'}">${fmt(there)}</td>`) + `</tr>`;
      }
      h += `</table>`;
    } else if (!kn) {
      h += `<p class="sub">まだ訪れたことがなく、くわしい相場はわからない。</p>`;
    }
    if (short) h += `<p class="bad">⚠ 食料が足りない。尽きると船足が落ち、船員が減る。</p>`;
    h += `<button class="b pri wide" data-a="depart">⛵ ${p.name}へ出航する</button></div>`;
    return h;
  }

  function upCost(k) { return Math.round(D.SHIPS[S.ship.type].price * D.UPGRADES[k].costRate); }
  function repairCost() { return Math.ceil((100 - S.ship.hp) * C.repairPerPoint * D.SHIPS[S.ship.type].tough); }
  function tradeIn() { return Math.floor((D.SHIPS[S.ship.type].price + S.ship.invested) * C.tradeInRate); }
  function shipStats(t) {
    return `<div class="stat"><div><span>速さ</span> ${t.speed}</div><div><span>船倉</span> ${t.hold}</div>` +
      `<div><span>船員</span> ${t.minCrew}〜${t.maxCrew}人</div><div><span>大砲</span> 最大${t.maxGuns}門</div>` +
      `<div><span>頑丈さ</span> ${t.tough}</div><div><span>帆装</span> ${D.SAILS[t.sail].name}${t.oars ? '＋櫂' : ''}</div></div>`;
  }
  function viewDock() {
    const p = D.PORTS[S.port], sp = spec(), t = sp.t, sh = S.ship;
    let h = `<h2>${p.name}のドック</h2><p class="sub">現在の船：${t.name}</p>`;
    h += `<h3>修理</h3><div class="card row"><div class="grow">船体 <b class="${sh.hp < 40 ? 'bad' : ''}">${Math.round(sh.hp)}%</b>` +
      `<div class="sub">30%を切ると船足が落ちる</div></div>` +
      (sh.hp < 100 ? `<button class="b pri" data-a="repair">修理 ${fmt(repairCost())}G</button>` : `<span class="sub">万全</span>`) + `</div>`;
    h += `<h3>船員</h3><div class="card"><div>現在 <b>${sh.crew}人</b>　<span class="sub">必要 ${sp.minCrew}人 ／ 最大 ${t.maxCrew}人</span></div>` +
      `<div class="sub">雇用 1人${C.hireCost}G。多いほど海賊に強いが、給料と食料がかさむ。</div>` +
      `<div class="qbtns"><button class="b" data-a="crew" data-n="-5">−5</button><button class="b" data-a="crew" data-n="-1">−1</button>` +
      `<button class="b pri" data-a="crew" data-n="1">+1</button><button class="b pri" data-a="crew" data-n="5">+5</button></div></div>`;
    h += `<h3>大砲</h3><div class="card"><div>搭載 <b>${sh.guns}門</b>　<span class="sub">最大 ${t.maxGuns}門</span></div>` +
      `<div class="sub">1門 ${C.gunPrice}G。1門につき船倉を1使う。</div>` +
      `<div class="qbtns"><button class="b" data-a="gun" data-n="-1">−1 売る</button><button class="b pri" data-a="gun" data-n="1">+1 買う</button></div></div>`;
    if (!p.shipyard) {
      h += `<h3>造船所</h3><div class="card sub">この港に造船所はない。改造と船の購入は、造船所のある港で。</div>`;
      return h;
    }
    h += `<h3>改造</h3>`;
    for (const k in D.UPGRADES) {
      const u = D.UPGRADES[k], lv = sh.up[k] || 0;
      h += `<div class="card row"><div class="grow"><div class="name">${u.name} <span class="sub">${lv}/${u.maxLevel}</span></div>` +
        `<div class="sub">${u.desc}</div></div>` +
        (lv < u.maxLevel ? `<button class="b pri" data-a="upg" data-k="${k}">${fmt(upCost(k))}G</button>` : `<span class="sub">最大</span>`) + `</div>`;
    }
    const refit = Math.round(t.price * C.refitRate);
    h += `<div class="card"><div class="name">帆装の張り替え <span class="sub">現在：${D.SAILS[sh.sail].name}</span></div>`;
    for (const k in D.SAILS) {
      if (k === sh.sail) continue;
      h += `<div class="row" style="margin-top:6px"><div class="grow">${D.SAILS[k].name}<div class="sub">${D.SAILS[k].desc}</div></div>` +
        `<button class="b pri" data-a="refit" data-k="${k}">${fmt(refit)}G</button></div>`;
    }
    h += `</div><h3>船を買う（今の船の下取り ${fmt(tradeIn())}G）</h3>`;
    for (const id in D.SHIPS) {
      const st = D.SHIPS[id];
      if (!shipUnlocked(st) || id === sh.type) continue;
      const cost = st.price - tradeIn();
      h += `<div class="card"><div class="row"><div class="grow"><div class="name">⛵ ${st.name}</div><div class="sub">${st.desc}</div></div>` +
        `<button class="b pri" data-a="buyShip" data-id="${id}">${cost >= 0 ? fmt(cost) + 'G' : '+' + fmt(-cost) + 'G'}</button></div>${shipStats(st)}</div>`;
    }
    const ne = nextEra();
    if (ne) h += `<p class="sub">${ne.year}年になると、新しい時代の船が造船所に並ぶ。</p>`;
    return h;
  }

  function viewInfo() {
    const sp = spec(), t = sp.t, sh = S.ship, era = currentEra(), ne = nextEra();
    const total = Object.keys(D.PORTS).length, visited = Object.keys(S.known).length;
    let h = `<h2>商会の記録</h2>`;
    h += `<div class="card"><div class="name">${era.name}（${dateStr()}）</div><div class="sub">${era.desc}</div>` +
      (ne ? `<div class="sub">次の時代：${ne.year}年「${ne.name}」</div>` : `<div class="sub">この版で用意された時代はここまで。交易はずっと続けられる。</div>`) + `</div>`;
    h += `<h3>海図</h3><div class="card stat"><div><span>知っている港</span> ${S.found.length}/${total}</div>` +
      `<div><span>訪れた港</span> ${visited}</div></div>` +
      (S.found.length < total ? `<p class="sub">まだ海図にない港がある。遠くの港の酒場で噂を集めよう。</p>` : '');
    h += `<h3>船</h3><div class="card"><div class="name">⛵ ${t.name}</div><div class="sub">${t.desc}</div><div class="stat">` +
      `<div><span>速さ</span> ${sp.speed.toFixed(1)}</div><div><span>船倉</span> ${usedSpace()}/${sp.hold}</div>` +
      `<div><span>船員</span> ${sh.crew}人（必要${sp.minCrew}）</div><div><span>大砲</span> ${sh.guns}/${t.maxGuns}門</div>` +
      `<div><span>帆装</span> ${D.SAILS[sh.sail].name}${t.oars ? '＋櫂' : ''}</div><div><span>船体</span> ${Math.round(sh.hp)}%</div>` +
      `<div><span>給料</span> 1日 ${fmt(sh.crew * C.wagePerDay)}G</div><div><span>戦力</span> ${fmt(playerPower())}</div></div></div>`;
    h += `<h3>積み荷</h3><div class="card">`;
    const ids = Object.keys(S.cargo);
    h += ids.length ? ids.map((g) => `<div>${D.GOODS[g].icon} ${D.GOODS[g].name} × ${S.cargo[g].qty}</div>`).join('') : `<span class="sub">空っぽ</span>`;
    h += `</div><h3>これまで</h3><div class="card stat"><div><span>航海</span> ${S.stats.voyages}回</div>` +
      `<div><span>海賊に勝利</span> ${S.stats.wins}回</div><div><span>交易の利益</span> ${fmt(S.stats.profit)}G</div></div>`;
    h += `<button class="b wide" data-a="help">遊び方を見る</button>` +
      `<button class="b warn wide" data-a="reset">最初からやり直す</button>`;
    return h;
  }

  function helpBody() {
    return `<p>① <b>交易所</b>で特産品を安く買う。</p><p>② <b>出航</b>で地図から行き先を選ぶ。食料を忘れずに。</p>` +
      `<p>③ 着いた港で高く売る。差額がもうけ。</p><p>④ <b>ドック</b>で修理・船員・大砲、造船所のある港では改造と船の購入。</p>` +
      `<p class="sub">品の名前をタップすると<b>相場帳</b>が開き、訪れた港の値段を見比べられる。地域ごとに安い品・高い品がちがうので、もうかる航路を探そう。</p>` +
      `<p class="sub">まとめて売買すると値段が動き、戻るには日数がかかる。同じ航路ばかりでは、だんだんもうからなくなる。「市場の噂」の高騰も狙い目。</p>` +
      `<p class="sub">遠くの港は、手前の港で噂を聞くと海図に現れる。進行は自動で保存される。</p>`;
  }

  // ---------- 港での操作 ----------
  const actions = {
    tab(d) {
      ui.tab = d.id; window.scrollTo(0, 0);
      if (d.id === 'sail') { if (ui.dest) fitRoute(); else centerOn(S.port); }
      render();
    },
    dest(d) { ui.dest = d.id || null; if (ui.dest) fitRoute(); render(); window.scrollTo(0, 0); },
    zoom(d) { setZoom(cam.z * (+d.d > 0 ? 1.45 : 1 / 1.45)); },
    home() { centerOn(voyage ? voyage.dest : S.port); setZoom(C.zoomStart); },
    world() { cam.lon = 8; cam.lat = 20; setZoom(C.zoomMin); },
    help() { modal({ title: '遊び方', body: helpBody(), buttons: [{ label: 'とじる', cls: 'pri' }] }); },
    reset() {
      confirmBox('最初からやり直す', '<p>今の記録は消える。よい？</p>', 'やり直す', () => {
        newGame(); save(); ui = { tab: 'trade', dest: null }; centerOn(S.port); render(); actions.help();
      });
    },
    aid() { S.gold += C.aidGold; save(); render(); toast(`ギルドから ${C.aidGold}G を受け取った`); },

    // 相場帳：訪れた港での、その品の値段を見比べる
    book(d) {
      const gid = d.g, g = D.GOODS[gid];
      const rows = Object.keys(S.known).map((pid) => ({ pid, k: S.known[pid] })).filter((r) => r.k.prices[gid] != null)
        .sort((a, b) => b.k.prices[gid] - a.k.prices[gid]);
      const buys = rows.filter((r) => r.k.buys[gid] != null).map((r) => r.k.buys[gid]);
      const lo = buys.length ? Math.min.apply(null, buys) : null, hi = rows.length ? rows[0].k.prices[gid] : null;
      let body = `<p class="sub">訪れた港で最後に見た値段。買値があるのは産地だけ。</p>`;
      if (lo !== null && hi !== null && hi > lo) body += `<p>いちばん安い買値 ${G(lo)} → いちばん高い売値 ${G(hi)}　<b class="good">差 +${fmt(hi - lo)}G</b></p>`;
      body += `<table class="t"><tr><th>港</th><th>買値</th><th>売値</th><th>記録</th></tr>` + rows.map((r) => {
        const b = r.k.buys[gid], age = S.day - r.k.day;
        return `<tr><td>${D.PORTS[r.pid].name}${r.pid === S.port ? '（ここ）' : ''}</td>` +
          `<td class="${b != null && b === lo ? 'good' : ''}">${b != null ? fmt(b) : '—'}</td>` +
          `<td class="${r.k.prices[gid] === hi ? 'good' : ''}">${fmt(r.k.prices[gid])}</td><td class="sub">${age <= 0 ? '今' : age + '日前'}</td></tr>`;
      }).join('') + `</table>`;
      if (!rows.length) body += `<p class="sub">まだ記録がない。</p>`;
      modal({ title: `${g.icon} ${g.name}の相場帳`, body, buttons: [{ label: 'とじる', cls: 'pri' }] });
    },

    buy(d) {
      const gid = d.g, g = D.GOODS[gid], max = maxBuy(S.port, gid);
      if (!sells(S.port, gid)) return;
      if (max <= 0) return toast(freeSpace() <= 0 ? '船倉がいっぱい' : 'お金が足りない');
      openQty({
        title: `${g.name}を買う`, max, okLabel: '買う',
        calc: (q) => { const r = quote(S.port, gid, q, 1); return `合計 ${G(r.tot)}　<span class="sub">平均 ${q ? fmt(r.tot / q) : 0}G</span>`; },
        ok: (q) => {
          const r = quote(S.port, gid, q, 1);
          S.gold -= r.tot; S.market[S.port][gid] = r.dev;
          const c = S.cargo[gid] || (S.cargo[gid] = { qty: 0, cost: 0 });
          c.qty += q; c.cost += r.tot;
          save(); render();
        }
      });
    },
    sell(d) {
      const gid = d.g, g = D.GOODS[gid], own = S.cargo[gid];
      if (!own) return;
      const avg = own.cost / own.qty;
      openQty({
        title: `${g.name}を売る`, max: own.qty, okLabel: '売る',
        calc: (q) => {
          const r = quote(S.port, gid, q, -1), pf = r.tot - avg * q;
          return `合計 ${G(r.tot)}　<span class="${pf >= 0 ? 'good' : 'bad'}">${pf >= 0 ? '利益 +' : '損 '}${fmt(pf)}G</span>`;
        },
        ok: (q) => {
          const r = quote(S.port, gid, q, -1);
          S.gold += r.tot; S.market[S.port][gid] = r.dev;
          S.stats.profit += r.tot - avg * q;
          own.cost -= avg * q; own.qty -= q;
          if (own.qty <= 0) delete S.cargo[gid];
          save(); render();
        }
      });
    },
    foodBuy() {
      const max = Math.min(freeSpace(), Math.floor(S.gold / C.foodPrice));
      if (max <= 0) return toast(freeSpace() <= 0 ? '船倉がいっぱい' : 'お金が足りない');
      openQty({
        title: '食料を買う', max, unit: '樽', okLabel: '買う', init: Math.min(max, 20),
        calc: (q) => `合計 ${G(q * C.foodPrice)}　<span class="sub">約${Math.floor((S.food + q) / foodPerDay())}日ぶんになる</span>`,
        ok: (q) => { S.gold -= q * C.foodPrice; S.food += q; save(); render(); }
      });
    },
    foodSell() {
      const max = Math.floor(S.food);
      if (max <= 0) return toast('食料がない');
      openQty({
        title: '食料を売る', max, unit: '樽', okLabel: '売る', init: 0,
        calc: (q) => `合計 ${G(q * C.foodSell)}`,
        ok: (q) => { S.gold += q * C.foodSell; S.food -= q; save(); render(); }
      });
    },

    repair() {
      const cost = repairCost();
      if (cost <= 0) return;
      if (S.gold <= 0) return toast('お金が足りない');
      if (cost > S.gold) { // 払えるぶんだけ直す
        S.ship.hp += (100 - S.ship.hp) * (S.gold / cost); S.gold = 0;
        toast('払えるぶんだけ修理した');
      } else { S.gold -= cost; S.ship.hp = 100; }
      save(); render();
    },
    crew(d) {
      const t = D.SHIPS[S.ship.type];
      let n = +d.n;
      if (n > 0) {
        n = Math.min(n, t.maxCrew - S.ship.crew, Math.floor(S.gold / C.hireCost));
        if (n <= 0) return toast(S.ship.crew >= t.maxCrew ? 'これ以上は乗せられない' : 'お金が足りない');
        S.gold -= n * C.hireCost;
      } else {
        n = -Math.min(-n, S.ship.crew - C.minCrewAbs);
        if (n >= 0) return toast(`最低${C.minCrewAbs}人は必要`);
      }
      S.ship.crew += n; save(); render();
    },
    gun(d) {
      const t = D.SHIPS[S.ship.type];
      if (+d.n > 0) {
        if (S.ship.guns >= t.maxGuns) return toast('これ以上は積めない');
        if (freeSpace() < 1) return toast('船倉がいっぱい');
        if (S.gold < C.gunPrice) return toast('お金が足りない');
        S.gold -= C.gunPrice; S.ship.guns++; S.ship.invested += C.gunPrice;
      } else {
        if (S.ship.guns <= 0) return toast('大砲がない');
        S.gold += Math.floor(C.gunPrice / 2); S.ship.guns--; S.ship.invested = Math.max(0, S.ship.invested - C.gunPrice);
      }
      save(); render();
    },
    upg(d) {
      const k = d.k, u = D.UPGRADES[k], cost = upCost(k);
      if (S.gold < cost) return toast('お金が足りない');
      confirmBox(u.name, `<p>${u.desc}</p><p>費用 ${G(cost)}</p>`, '改造する', () => {
        S.gold -= cost; S.ship.up[k] = (S.ship.up[k] || 0) + 1; S.ship.invested += cost;
        save(); render();
      });
    },
    refit(d) {
      const k = d.k, cost = Math.round(D.SHIPS[S.ship.type].price * C.refitRate);
      if (S.gold < cost) return toast('お金が足りない');
      confirmBox('帆装の張り替え', `<p>${D.SAILS[k].name}に張り替える。${D.SAILS[k].desc}。</p><p>費用 ${G(cost)}</p>`, '張り替える', () => {
        S.gold -= cost; S.ship.sail = k; save(); render();
      });
    },
    buyShip(d) {
      const st = D.SHIPS[d.id], cost = st.price - tradeIn();
      if (S.gold < cost) return toast('お金が足りない');
      if (cargoCount() + Math.ceil(S.food) > st.hold) return toast('今の積み荷が新しい船に収まらない');
      const over = S.ship.crew > st.maxCrew ? `<p class="sub">船員は${st.maxCrew}人まで。あふれた船員とは別れる。</p>` : '';
      confirmBox(`${st.name}を買う`,
        `<p>今の船を ${G(tradeIn())} で下取りに出す。改造と大砲は引き継がれない。</p>${over}<p>支払い ${G(Math.max(0, cost))}</p>`,
        '買う', () => {
          S.gold -= cost; S.ship = newShip(d.id, S.ship.crew);
          save(); render(); toast(`${st.name}に乗り換えた`);
        });
    },
    depart() {
      if (!ui.dest || voyage) return;
      const sp = spec();
      if (S.ship.crew < sp.minCrew) {
        return confirmBox('船員が足りない', `<p>必要 ${sp.minCrew}人に対して ${S.ship.crew}人。船足がかなり落ちる。</p>`, 'それでも出航', startVoyage);
      }
      startVoyage();
    }
  };
  // 現在地と行き先の両方が地図に収まるように視点を合わせる
  function fitRoute() {
    const a = D.PORTS[S.port].pos, b = D.PORTS[ui.dest].pos;
    cam.lon = (a[0] + b[0]) / 2; cam.lat = (a[1] + b[1]) / 2;
    const w = (mv && mv.w) || 340, h = (mv && mv.h) || 300;
    const zx = w * 0.7 / (Math.abs(a[0] - b[0]) * KXV + 0.01), zy = h * 0.7 / (Math.abs(a[1] - b[1]) + 0.01);
    setZoom(Math.min(zx, zy, 16));
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.a];
    if (fn) fn(el.dataset);
  });

  // ---------- 航海 ----------
  function pickWind() { const r = Math.random(); return r < 0.35 ? 'tail' : r < 0.75 ? 'side' : 'head'; }
  function vlog(msg, cls) {
    voyage.log.unshift(`<div class="${cls || ''}">${voyage.days}日目　${msg}</div>`);
    voyage.log.length = Math.min(voyage.log.length, 6);
  }
  function startVoyage() {
    const r = route(S.port, ui.dest);
    if (!r) return toast('航路がない');
    recordKnown(S.port); save();
    voyage = {
      from: S.port, dest: ui.dest, r, done: 0, shown: 0, days: 0, wind: pickWind(), windLeft: rndi(2, 5),
      calm: 0, pirate: false, starved: false, wages: 0, paused: false, log: []
    };
    $('#tabs').classList.add('hidden');
    $('#main').innerHTML = `<h2>${D.PORTS[voyage.from].name} → ${D.PORTS[voyage.dest].name}</h2>` +
      `<div class="mapwrap"><canvas id="sea"></canvas>` +
      `<div class="mapbtns"><button data-a="zoom" data-d="1">＋</button><button data-a="zoom" data-d="-1">−</button></div></div>` +
      `<div class="card"><div class="seastat" id="seastat"></div></div><div class="card log" id="vlog"></div>`;
    window.scrollTo(0, 0);
    setZoom(clamp(cam.z, 9, 20));
    openMap($('#sea'), 'sea', 0.42);
    vlog('錨を上げ、港を出た。');
    seaText();
    voyage.timer = setTimeout(tick, 500);
  }
  function seaText() {
    const v = voyage;
    if (!v) return;
    $('#seastat').innerHTML = `<span><b>${v.days}</b>日目</span><span>${v.calm > 0 ? '凪' : WIND_NAME[v.wind]}</span>` +
      `<span>残り ${fmt(v.r.total - v.done)}海里</span>`;
    $('#vlog').innerHTML = v.log.join('');
    renderHud();
  }
  function resume() {
    if (!voyage) return;
    voyage.paused = false;
    seaText();
    voyage.timer = setTimeout(tick, C.tickMs);
  }
  function tick() {
    const v = voyage;
    if (!v || v.paused) return;
    const sp = spec(), t = sp.t;
    v.days++; S.day++; advanceMarket(1);

    if (--v.windLeft <= 0) { v.wind = pickWind(); v.windLeft = rndi(2, 5); }
    let wm = D.SAILS[S.ship.sail].wind[v.wind];
    if (t.oars) wm = (wm + 1) / 2;
    let dist = sp.speed * C.nmPerSpeed * wm * crewFactor(sp) * (S.ship.hp < 30 ? 0.7 : 1);
    if (v.calm > 0) { v.calm--; dist *= 0.15; }

    const need = foodPerDay();
    if (S.food >= need) S.food -= need;
    else {
      S.food = 0; dist *= 0.7;
      if (!v.starved) { v.starved = true; vlog('⚠ 食料が尽きた。船足が落ち、船員が倒れていく。', 'bad'); }
      if (Math.random() < 0.3 && S.ship.crew > C.minCrewAbs) S.ship.crew--;
    }
    v.wages += S.ship.crew * C.wagePerDay;
    v.done += dist;
    if (v.done >= v.r.total) { v.done = v.r.total; seaText(); return arrive(); }

    let pause = C.tickMs;
    const r = Math.random(), e = C.ev;
    if (r < e.storm) {
      const dmg = rnd(8, 22) / t.tough;
      S.ship.hp = Math.max(5, S.ship.hp - dmg);
      vlog(`🌩 嵐に遭った。船体に ${Math.round(dmg)}% の損傷。`, 'bad'); pause = 700;
    } else if (r < e.storm + e.calm) {
      if (!t.oars && v.calm <= 0) { v.calm = rndi(2, 3); vlog('🌫 風が止んだ。しばらく進めない。'); pause = 600; }
    } else if (r < e.storm + e.calm + e.pirate) {
      if (!v.pirate && v.days > 1) { v.pirate = true; v.paused = true; seaText(); return pirateEvent(); }
    } else if (r < e.storm + e.calm + e.pirate + e.flotsam) {
      const g = rndi(30, 120); S.gold += g;
      vlog(`🪵 漂流する積み荷を拾った。+${g}G`, 'good'); pause = 600;
    }
    seaText();
    v.timer = setTimeout(tick, pause);
  }

  function checkEras() {
    for (const e of D.ERAS) {
      if (e.year <= year() && !S.erasSeen.includes(e.id)) {
        S.erasSeen.push(e.id);
        const ships = Object.values(D.SHIPS).filter((s) => s.era === e.id).map((s) => `<p>⛵ <b>${s.name}</b><br><span class="sub">${s.desc}</span></p>`).join('');
        notices.push({ title: `🎉 ${e.year}年 ${e.name}`, body: `<p>${e.desc}</p><p>造船所に新しい船が並んだ。</p>${ships}`, label: 'すばらしい' });
      }
    }
  }
  function arrive() {
    const v = voyage, p = D.PORTS[v.dest];
    const wages = Math.round(v.wages), first = !S.known[v.dest];
    let body = `<p>${v.days}日の航海を終えた。${first ? '<b class="good">はじめて訪れる港だ。</b>' : ''}</p>`;
    if (S.gold >= wages) {
      S.gold -= wages; body += `<p>船員の給料 ${G(wages)} を払った。</p>`;
    } else {
      const left = Math.max(C.minCrewAbs, Math.floor(S.ship.crew * 0.8));
      body += `<p class="bad">給料 ${fmt(wages)}G を払いきれず、船員 ${S.ship.crew - left}人が船を降りた。</p>`;
      S.gold = 0; S.ship.crew = left;
    }
    if (S.ship.hp < 40) body += `<p class="bad">船体がかなり傷んでいる。ドックで修理を。</p>`;
    S.port = v.dest; S.stats.voyages++;
    voyage = null; ui = { tab: 'trade', dest: null };
    recordKnown(S.port);
    notices.push({ title: `⚓ ${p.name}に入港`, body, label: '上陸する' });
    hearRumors(S.port, false);
    checkEras();
    centerOn(S.port);
    save(); render(); window.scrollTo(0, 0);
    showNotices();
  }

  // ---------- 海賊 ----------
  function pickPirate() {
    let tot = 0; for (const p of C.pirates) tot += p.weight;
    let r = Math.random() * tot;
    for (const p of C.pirates) { if ((r -= p.weight) < 0) return p; }
    return C.pirates[0];
  }
  function loseCargo(frac) {
    let n = 0;
    for (const gid in S.cargo) {
      const c = S.cargo[gid], k = Math.min(c.qty, Math.ceil(c.qty * frac));
      c.cost -= (c.cost / c.qty) * k; c.qty -= k; n += k;
      if (c.qty <= 0) delete S.cargo[gid];
    }
    return n;
  }
  function pirateEvent() {
    const pr = pickPirate(), ep = rnd(pr.min, pr.max), pp = playerPower();
    const prob = (pp * pp) / (pp * pp + ep * ep);
    const odds = prob > 0.66 ? '<span class="good">有利</span>' : prob > 0.4 ? '五分五分' : '<span class="bad">不利</span>';
    const flee = clamp(0.3 + (spec().speed - 4) * 0.15, 0.15, 0.85);
    const hasCargo = cargoCount() > 0;
    modal({
      title: '🏴‍☠️ 海賊だ！',
      body: `<p>水平線に黒い旗。${pr.name}が近づいてくる。</p>` +
        `<p>こちらの戦力 <b>${fmt(pp)}</b>（大砲${S.ship.guns}門・船員${S.ship.crew}人）<br>見立て：${odds}</p>`,
      buttons: [
        { label: '⚔️ 戦う', cls: 'pri', fn: () => battle(prob, pr) },
        {
          label: `💨 逃げる（成功率 ${Math.round(flee * 100)}%）`, fn: () => {
            if (Math.random() < flee) {
              vlog('💨 海賊を振り切った。', 'good');
              modal({ title: '逃げ切った', body: '<p>帆をいっぱいに張り、海賊を振り切った。</p>', buttons: [{ label: '航海を続ける', cls: 'pri', fn: resume }] });
            } else {
              modal({ title: '追いつかれた', body: '<p>逃げ切れない。不利な体勢のまま戦うしかない。</p>', buttons: [{ label: '⚔️ 応戦する', cls: 'pri', fn: () => battle(prob * 0.8, pr) }] });
            }
          }
        },
        {
          label: hasCargo ? '📦 積み荷の3割を渡す' : '💰 所持金の2割を渡す', fn: () => {
            let msg;
            if (hasCargo) msg = `積み荷 ${loseCargo(0.3)}個を渡した。`;
            else { const g = Math.floor(S.gold * 0.2); S.gold -= g; msg = `${fmt(g)}G を渡した。`; }
            vlog('🏴‍☠️ 海賊に貢ぎ物を渡して見逃してもらった。');
            modal({ title: '見逃してもらった', body: `<p>${msg}海賊は満足して去っていった。</p>`, buttons: [{ label: '航海を続ける', cls: 'pri', fn: resume }] });
          }
        }
      ]
    });
  }
  function battle(prob, pr) {
    const win = Math.random() < prob, t = D.SHIPS[S.ship.type];
    modal({ title: '⚔️ 砲撃戦', body: `<canvas id="battle"></canvas><p class="sub" style="text-align:center">砲煙が海を覆う…</p>` });
    playBattle($('#battle'), win, S.ship.guns, () => {
      let body;
      if (win) {
        const loot = Math.round(rnd(150, 400) * pr.loot), dmg = rnd(4, 10) / t.tough;
        S.gold += loot; S.ship.hp = Math.max(5, S.ship.hp - dmg); S.stats.wins++;
        body = `<p class="good">${pr.name}を撃退した！</p><p>戦利品 ${G(loot)}　船体の損傷 ${Math.round(dmg)}%</p>`;
        vlog(`⚔️ 海賊を撃退。+${loot}G`, 'good');
      } else {
        const dmg = rnd(18, 30) / t.tough, gold = Math.floor(S.gold * 0.2), lost = loseCargo(0.5);
        const dead = Math.min(S.ship.crew - C.minCrewAbs, Math.ceil(S.ship.crew * 0.2));
        S.gold -= gold; S.ship.hp = Math.max(5, S.ship.hp - dmg); S.ship.crew -= Math.max(0, dead);
        body = `<p class="bad">${pr.name}に敗れた…</p><p>積み荷 ${lost}個と ${G(gold)} を奪われた。<br>船体の損傷 ${Math.round(dmg)}%　船員 −${Math.max(0, dead)}人</p>`;
        vlog('⚔️ 海賊に敗れ、積み荷を奪われた。', 'bad');
      }
      modal({ title: win ? '勝利！' : '敗北…', body, buttons: [{ label: '航海を続ける', cls: 'pri', fn: resume }] });
    });
  }

  // 砲撃戦の演出（勝敗は先に決まっていて、ここでは見せるだけ）
  function drawShip(ctx, x, y, dir, hull, sail, flag, tilt, sink) {
    ctx.save();
    ctx.translate(x, y + sink); ctx.rotate(tilt); ctx.scale(dir, 1);
    ctx.fillStyle = hull;
    ctx.beginPath(); ctx.moveTo(-30, -10); ctx.lineTo(34, -10); ctx.lineTo(24, 6); ctx.lineTo(-24, 6); ctx.closePath(); ctx.fill();
    ctx.fillRect(-30, -17, 14, 8);
    ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-8, -10); ctx.lineTo(-8, -52); ctx.moveTo(14, -10); ctx.lineTo(14, -44); ctx.stroke();
    ctx.fillStyle = sail;
    ctx.fillRect(-20, -48, 24, 30); ctx.fillRect(5, -40, 18, 24);
    ctx.fillStyle = flag; ctx.fillRect(-8, -60, 12, 8);
    ctx.fillStyle = '#1a1205';
    for (let i = 0; i < 4; i++) ctx.fillRect(-14 + i * 10, -5, 4, 3);
    ctx.restore();
  }
  function playBattle(cv, win, guns, cb) {
    const { ctx, w: W, h: H } = setupCanvas(cv, 180);
    const sx = W * 0.2, ex = W * 0.8, sy = H * 0.66, DUR = 3.6;
    const shots = [];
    const np = clamp(guns || 1, 2, 7), ne = win ? 3 : 6;
    for (let i = 0; i < np; i++) shots.push({ me: true, t0: 0.3 + i * (2.0 / np) + rnd(0, 0.1), hit: Math.random() < (win ? 0.7 : 0.25), off: rnd(18, 40) * (Math.random() < 0.5 ? -1 : 1) });
    for (let i = 0; i < ne; i++) shots.push({ me: false, t0: 0.5 + i * (2.0 / ne) + rnd(0, 0.1), hit: Math.random() < (win ? 0.2 : 0.75), off: rnd(18, 40) * (Math.random() < 0.5 ? -1 : 1) });
    shots.push({ me: win, t0: 2.4, hit: true, off: 0 });
    let start = null;
    function frame(ts) {
      if (!cv.isConnected) return;
      if (start === null) start = ts;
      const t = (ts - start) / 1000;
      const sky = ctx.createLinearGradient(0, 0, 0, sy);
      sky.addColorStop(0, '#f2b872'); sky.addColorStop(1, '#f7e1b5');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      const end = clamp((t - 2.9) / 0.7, 0, 1); // 負けた側が傾いて沈む
      const bob = Math.sin(t * 3) * 1.5;
      drawShip(ctx, sx, sy + bob, 1, '#7a4a22', '#fbf3df', '#2f6fd0', win ? 0 : -end * 0.35, win ? 0 : end * 14);
      drawShip(ctx, ex, sy - bob, -1, '#3a3030', '#d8d0c0', '#111', win ? end * 0.35 : 0, win ? end * 14 : 0);
      ctx.fillStyle = '#1d4a68'; ctx.fillRect(0, sy + 4, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5;
      for (let r = 0; r < 3; r++) {
        ctx.beginPath();
        for (let x = 0; x <= W; x += 8) { const y = sy + 12 + r * 14 + Math.sin(x / 18 + t * 2 + r) * 2; if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
        ctx.stroke();
      }
      for (const s of shots) {
        const u = (t - s.t0) / 0.75;
        if (u < 0) continue;
        const x0 = s.me ? sx + 30 : ex - 30, tx = (s.me ? ex : sx) + (s.hit ? 0 : s.off);
        const y0 = sy - 6, ty = s.hit ? sy - 8 : sy + 10;
        if (u < 0.6) { // 砲口の火と煙
          if (u < 0.15) { ctx.fillStyle = '#ffb030'; ctx.beginPath(); ctx.arc(x0, y0, 7, 0, 7); ctx.fill(); }
          ctx.fillStyle = `rgba(230,230,230,${0.7 - u})`; ctx.beginPath(); ctx.arc(x0 + (s.me ? 6 : -6), y0 - u * 14, 5 + u * 16, 0, 7); ctx.fill();
        }
        if (u < 1) { // 飛んでいく弾
          const x = x0 + (tx - x0) * u, y = y0 + (ty - y0) * u - 46 * 4 * u * (1 - u);
          ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
        } else if (u < 1.5) {
          const k = (u - 1) / 0.5;
          if (s.hit) { // 命中
            ctx.fillStyle = `rgba(255,${150 + 80 * (1 - k)},40,${1 - k})`; ctx.beginPath(); ctx.arc(tx, ty, 6 + k * 16, 0, 7); ctx.fill();
            ctx.fillStyle = `rgba(60,60,60,${0.6 * (1 - k)})`; ctx.beginPath(); ctx.arc(tx, ty - 10 - k * 14, 6 + k * 10, 0, 7); ctx.fill();
          } else { // 水柱
            ctx.fillStyle = `rgba(255,255,255,${1 - k})`;
            ctx.fillRect(tx - 2, ty - 22 * Math.sin(k * Math.PI), 4, 22 * Math.sin(k * Math.PI));
            ctx.beginPath(); ctx.arc(tx, ty, 3 + k * 9, Math.PI, 0); ctx.fill();
          }
        }
      }
      if (t < DUR) requestAnimationFrame(frame); else cb();
    }
    requestAnimationFrame(frame);
  }

  // ---------- 起動 ----------
  const hadSave = load();
  if (!hadSave) { newGame(); save(); }
  else save(); // 版を上げたセーブを書き戻す
  centerOn(S.port);
  render();
  if (!hadSave) modal({ title: '風と帆の商会', body: `<p>${C.startYear}年、リスボン。小さな船1隻と ${fmt(C.startGold)}G を元手に、交易で商会を大きくしよう。</p>` + helpBody(), buttons: [{ label: 'はじめる', cls: 'pri' }] });
  let rsT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rsT);
    rsT = setTimeout(() => {
      if (voyage) { const cv = $('#sea'); if (cv) openMap(cv, 'sea', 0.42); } else if (ui.tab === 'sail') render();
    }, 200);
  });

  // 動作確認用（コンソールやテストから中をのぞける）
  window.__game = {
    get state() { return S; }, get npcs() { return npcs; }, get cam() { return cam; },
    route, spec, inLand, clearLine, graph, baseMult, mult, seaDist, sellNow, buyNow, nm
  };
})();
