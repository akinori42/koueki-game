// ゲーム本体。数値やデータは js/data/ のファイルにある。
(function () {
  'use strict';

  const D = window.DATA;
  const C = D.CONFIG;
  const SAVE_KEY = 'kaze-to-ho-save-v1';
  const WIND_NAME = { tail: '追い風', side: '横風', head: '向かい風' };

  let S = null;                 // セーブされる状態
  let ui = { tab: 'trade', dest: null };
  let voyage = null;            // 航海中だけ使う
  let notices = [];             // 入港後に順番に出すお知らせ

  // ---------- 小道具 ----------
  const $ = (s) => document.querySelector(s);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rndi = (a, b) => Math.floor(rnd(a, b + 1));
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

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast.tm);
    toast.tm = setTimeout(() => t.classList.add('hidden'), 1800);
  }

  // ---------- セーブ ----------
  function newGame() {
    S = {
      v: 1, gold: C.startGold, day: 0, port: C.startPort,
      ship: newShip(C.startShip, C.startCrew),
      cargo: {}, food: C.startFood, market: {}, known: {},
      erasSeen: D.ERAS.filter((e) => e.year <= C.startYear).map((e) => e.id),
      stats: { voyages: 0, wins: 0, profit: 0 }
    };
    fillMissing();
    recordKnown(S.port);
  }
  function newShip(type, crew) {
    const t = D.SHIPS[type];
    return { type, sail: t.sail, up: {}, hp: 100, guns: 0, crew: clamp(crew, C.minCrewAbs, t.maxCrew), invested: 0 };
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
  }
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* 保存できない環境でも遊べる */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const o = JSON.parse(raw);
      if (!o || o.v !== 1) return false;
      S = o; fillMissing();
      return true;
    } catch (e) { return false; }
  }

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
  function mult(pid, gid) { const m = D.PORTS[pid].prices[gid]; return typeof m === 'number' ? m : 1; }
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
  function advanceMarket(days) {
    for (let d = 0; d < days; d++) {
      for (const pid in S.market) {
        const m = S.market[pid];
        for (const gid in m) m[gid] = clamp(m[gid] * C.devDecay + rnd(-C.devNoise, C.devNoise), C.devMin, C.devMax);
      }
    }
  }
  function recordKnown(pid) {
    const prices = {};
    for (const gid in D.GOODS) prices[gid] = sellNow(pid, gid);
    S.known[pid] = { day: S.day, prices };
  }

  // ---------- 航路 ----------
  const KX = 60 * 0.77, KY = 60; // 経度・緯度1度あたりの海里
  function nm(a, b) { return Math.hypot((a[0] - b[0]) * KX, (a[1] - b[1]) * KY); }
  const graph = (function () {
    const pos = {}, adj = {};
    const link = (a, b) => { (adj[a] = adj[a] || []).push(b); (adj[b] = adj[b] || []).push(a); };
    for (const id in D.MAP.SEA_NODES) pos[id] = D.MAP.SEA_NODES[id];
    for (const e of D.MAP.SEA_EDGES) link(e[0], e[1]);
    for (const pid in D.PORTS) { pos['p:' + pid] = D.PORTS[pid].pos; link('p:' + pid, D.PORTS[pid].link); }
    return { pos, adj };
  })();
  const routeCache = {};
  function route(from, to) {
    const key = from + '>' + to;
    if (routeCache[key]) return routeCache[key];
    const src = 'p:' + from, dst = 'p:' + to;
    const dist = { [src]: 0 }, prev = {}, done = {};
    for (;;) {
      let u = null;
      for (const k in dist) if (!done[k] && (u === null || dist[k] < dist[u])) u = k;
      if (u === null || u === dst) break;
      done[u] = true;
      for (const w of graph.adj[u] || []) {
        if (w.startsWith('p:') && w !== dst) continue; // 他の港は通り抜けない
        const nd = dist[u] + nm(graph.pos[u], graph.pos[w]);
        if (dist[w] === undefined || nd < dist[w]) { dist[w] = nd; prev[w] = u; }
      }
    }
    if (dist[dst] === undefined) return null;
    const pts = [];
    for (let k = dst; k; k = prev[k]) pts.unshift(graph.pos[k]);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + nm(pts[i - 1], pts[i]));
    return (routeCache[key] = { pts, cum, total: dist[dst] });
  }
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

  // ---------- 地図を描く ----------
  const V = D.MAP.VIEW;
  const MAP_ASPECT = ((V.lonMax - V.lonMin) * 0.77) / (V.latMax - V.latMin);
  function setupCanvas(cv, h) {
    const w = cv.clientWidth || 340, dpr = window.devicePixelRatio || 1;
    cv.style.height = h + 'px';
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }
  function proj(p, w, h) {
    return [(p[0] - V.lonMin) / (V.lonMax - V.lonMin) * w, (V.latMax - p[1]) / (V.latMax - V.latMin) * h];
  }
  function poly(ctx, pts, w, h) {
    ctx.beginPath();
    pts.forEach((p, i) => { const q = proj(p, w, h); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
    ctx.closePath();
  }
  function drawMap(cv, o) {
    const w0 = cv.clientWidth || 340;
    const { ctx, w, h } = setupCanvas(cv, Math.round(w0 / MAP_ASPECT));
    ctx.fillStyle = '#1d4a68'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c9b88a'; ctx.strokeStyle = '#7d6d48'; ctx.lineWidth = 1;
    for (const l of D.MAP.LAND) { poly(ctx, l, w, h); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#1d4a68';
    for (const l of D.MAP.SEA) { poly(ctx, l, w, h); ctx.fill(); ctx.stroke(); }

    if (o.route) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      ctx.beginPath();
      o.route.pts.forEach((p, i) => { const q = proj(p, w, h); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
      ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.font = 'bold 10px sans-serif'; ctx.textBaseline = 'middle';
    for (const pid in D.PORTS) {
      const p = D.PORTS[pid], q = proj(p.pos, w, h);
      const here = pid === o.here, sel = pid === o.dest;
      ctx.beginPath(); ctx.arc(q[0], q[1], sel || here ? 6 : 4.5, 0, 7);
      ctx.fillStyle = sel ? '#ff6b4a' : here ? '#e0b04a' : '#fff';
      ctx.fill(); ctx.strokeStyle = '#1a1205'; ctx.lineWidth = 1.5; ctx.stroke();
      const lb = p.label || [7, 0, 'left'];
      ctx.textAlign = lb[2];
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,24,38,.85)';
      ctx.strokeText(p.name, q[0] + lb[0], q[1] + lb[1]);
      ctx.fillStyle = sel ? '#ffb39f' : here ? '#ffd98a' : '#fff';
      ctx.fillText(p.name, q[0] + lb[0], q[1] + lb[1]);
    }
    if (o.ship) {
      const q = proj(o.ship, w, h);
      ctx.font = '18px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('⛵', q[0], q[1] - 2);
    }
    return { w, h };
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
    if (ui.tab === 'trade') m.innerHTML = viewTrade();
    else if (ui.tab === 'sail') { m.innerHTML = viewSail(); drawSailMap(); }
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

  function viewTrade() {
    const p = D.PORTS[S.port];
    let h = `<h2>${p.name}の交易所</h2><p class="sub">${p.desc}</p>`;
    if (S.gold < 100 && cargoCount() === 0) {
      h += `<div class="card"><p>資金が尽きかけている。商人ギルドが再起の資金を貸してくれるそうだ。</p>` +
        `<button class="b pri wide" data-a="aid">援助を受ける（+${C.aidGold}G）</button></div>`;
    }
    h += `<div class="card row"><div class="grow"><div class="name">🍞 食料</div>` +
      `<div class="sub">1樽 ${C.foodPrice}G ／ 所持 ${Math.floor(S.food)}樽（1日に ${foodPerDay().toFixed(1)}樽 消費）</div></div>` +
      `<div class="btns"><button class="b" data-a="foodSell">売る</button><button class="b pri" data-a="foodBuy">買う</button></div></div>`;
    h += `<h3>交易品（空き ${freeSpace()}）</h3>`;
    for (const gid in D.GOODS) {
      const g = D.GOODS[gid], sells = p.sells.includes(gid), own = S.cargo[gid];
      const sp = sellNow(S.port, gid);
      let l2 = sells ? `買値 <b>${fmt(buyNow(S.port, gid))}G</b>　` : `<span class="sub">ここでは買えない</span>　`;
      l2 += `売値 ${fmt(sp)}G`;
      let l3 = '';
      if (own) {
        const avg = own.cost / own.qty;
        l3 = `<div class="sub">所持 <b>${own.qty}</b>（仕入れ平均 ${fmt(avg)}G）` +
          `<span class="${sp >= avg ? 'good' : 'bad'}"> ${sp >= avg ? '▲利益' : '▼損'}</span></div>`;
      }
      h += `<div class="card row"><div class="grow"><div class="name">${g.icon} ${g.name}${sells ? ' <span class="sub good">特産</span>' : ''}</div>` +
        `<div>${l2}</div>${l3}</div><div class="btns">` +
        `<button class="b" data-a="sell" data-g="${gid}" ${own ? '' : 'disabled'}>売る</button>` +
        `<button class="b pri" data-a="buy" data-g="${gid}" ${sells ? '' : 'disabled'}>買う</button></div></div>`;
    }
    return h;
  }

  function wantsOf(pid) {
    return Object.keys(D.GOODS).sort((a, b) => mult(pid, b) - mult(pid, a)).slice(0, 3).map((g) => D.GOODS[g].name).join('・');
  }
  function viewSail() {
    let h = `<h2>行き先を選ぶ</h2><p class="sub">地図の港をタップ。金色が現在地。</p>` +
      `<div class="mapwrap"><canvas id="map"></canvas></div>`;
    if (!ui.dest) {
      h += `<div class="card">` + Object.keys(D.PORTS).filter((k) => k !== S.port).map((k) => {
        const r = route(S.port, k);
        return `<div class="row" style="padding:4px 0"><div class="grow"><span class="name">${D.PORTS[k].name}</span> ` +
          `<span class="sub">約${estDays(r)}日</span></div><button class="b" data-a="dest" data-id="${k}">選ぶ</button></div>`;
      }).join('') + `</div>`;
      return h;
    }
    const p = D.PORTS[ui.dest], r = route(S.port, ui.dest), days = estDays(r);
    const need = Math.ceil(days * foodPerDay()), short = S.food < need;
    const kn = S.known[ui.dest];
    h += `<div class="card"><div class="row"><div class="grow"><h2>${p.name}</h2></div>` +
      `<button class="b" data-a="dest" data-id="">選び直す</button></div>` +
      `<p class="sub">${p.desc}</p>` +
      `<div class="stat"><div><span>距離</span> ${fmt(r.total)}海里</div><div><span>日数の目安</span> 約${days}日</div>` +
      `<div><span>必要な食料</span> <b class="${short ? 'bad' : 'good'}">約${need}樽</b></div><div><span>所持</span> ${Math.floor(S.food)}樽</div>` +
      `<div><span>特産</span> ${p.sells.map((g) => D.GOODS[g].name).join('・')}</div><div><span>造船所</span> ${p.shipyard ? 'あり' : 'なし'}</div></div>` +
      `<p class="sub">よく売れる品：${wantsOf(ui.dest)}</p>`;
    if (kn) {
      h += `<table class="t"><tr><th>前回の相場（${Math.max(0, S.day - kn.day)}日前）</th><th>ここの買値</th><th>行き先の売値</th></tr>`;
      for (const gid in D.GOODS) {
        const here = D.PORTS[S.port].sells.includes(gid) ? buyNow(S.port, gid) : null;
        const own = S.cargo[gid];
        if (here === null && !own) continue;
        const base = here !== null ? here : own.cost / own.qty;
        const there = kn.prices[gid];
        h += `<tr><td>${D.GOODS[gid].name}${own ? `（所持${own.qty}）` : ''}</td><td>${here !== null ? fmt(here) : '—'}</td>` +
          `<td class="${there > base ? 'good' : 'bad'}">${fmt(there)}</td></tr>`;
      }
      h += `</table>`;
    } else {
      h += `<p class="sub">まだ訪れたことがなく、相場はわからない。</p>`;
    }
    if (short) h += `<p class="bad">⚠ 食料が足りない。尽きると船足が落ち、船員が減る。</p>`;
    h += `<button class="b pri wide" data-a="depart">⛵ ${p.name}へ出航する</button></div>`;
    return h;
  }
  function drawSailMap() {
    const cv = $('#map');
    if (!cv) return;
    drawMap(cv, { here: S.port, dest: ui.dest, route: ui.dest ? route(S.port, ui.dest) : null });
    cv.onclick = (e) => {
      const rc = cv.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top;
      let best = null, bd = 28;
      for (const pid in D.PORTS) {
        const q = proj(D.PORTS[pid].pos, rc.width, rc.height), d = Math.hypot(q[0] - x, q[1] - y);
        if (d < bd) { bd = d; best = pid; }
      }
      if (best && best !== S.port) { ui.dest = best; render(); }
    };
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
    let h = `<h2>商会の記録</h2>`;
    h += `<div class="card"><div class="name">${era.name}（${dateStr()}）</div><div class="sub">${era.desc}</div>` +
      (ne ? `<div class="sub">次の時代：${ne.year}年「${ne.name}」</div>` : `<div class="sub">この版で用意された時代はここまで。交易はずっと続けられる。</div>`) + `</div>`;
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
    return `<p>① <b>交易所</b>で特産品を安く買う。</p><p>② <b>出航</b>で行き先を選ぶ。食料を忘れずに。</p>` +
      `<p>③ 着いた港で高く売る。差額がもうけ。</p><p>④ <b>ドック</b>で修理・船員・大砲、造船所のある港では改造と船の購入。</p>` +
      `<p class="sub">まとめて売買すると値段が動く。同じ品ばかり運ぶと、だんだんもうからなくなる。</p>` +
      `<p class="sub">${D.ERAS[D.ERAS.length - 1].year}年には新しい時代の船が解放される。進行は自動で保存される。</p>`;
  }

  // ---------- 港での操作 ----------
  const actions = {
    tab(d) { ui.tab = d.id; window.scrollTo(0, 0); render(); },
    dest(d) { ui.dest = d.id || null; render(); },
    help() { modal({ title: '遊び方', body: helpBody(), buttons: [{ label: 'とじる', cls: 'pri' }] }); },
    reset() {
      confirmBox('最初からやり直す', '<p>今の記録は消える。よい？</p>', 'やり直す', () => {
        newGame(); save(); ui = { tab: 'trade', dest: null }; render(); actions.help();
      });
    },
    aid() { S.gold += C.aidGold; save(); render(); toast(`ギルドから ${C.aidGold}G を受け取った`); },

    buy(d) {
      const gid = d.g, g = D.GOODS[gid], max = maxBuy(S.port, gid);
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
      let cost = repairCost();
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
      if (!ui.dest) return;
      const sp = spec();
      if (S.ship.crew < sp.minCrew) {
        return confirmBox('船員が足りない', `<p>必要 ${sp.minCrew}人に対して ${S.ship.crew}人。船足がかなり落ちる。</p>`, 'それでも出航', startVoyage);
      }
      startVoyage();
    }
  };

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
      from: S.port, dest: ui.dest, r, done: 0, days: 0, wind: pickWind(), windLeft: rndi(2, 5),
      calm: 0, pirate: false, starved: false, wages: 0, paused: false, log: [], goldAtStart: S.gold
    };
    $('#tabs').classList.add('hidden');
    $('#main').innerHTML = `<h2>${D.PORTS[voyage.from].name} → ${D.PORTS[voyage.dest].name}</h2>` +
      `<div class="mapwrap"><canvas id="sea"></canvas></div><div class="card"><div class="seastat" id="seastat"></div></div>` +
      `<div class="card log" id="vlog"></div>`;
    window.scrollTo(0, 0);
    vlog('錨を上げ、港を出た。');
    drawSea();
    voyage.timer = setTimeout(tick, 500);
  }
  function drawSea() {
    const v = voyage, cv = $('#sea');
    if (!v || !cv) return;
    drawMap(cv, { here: v.from, dest: v.dest, route: v.r, ship: pointAt(v.r, v.done) });
    $('#seastat').innerHTML = `<span><b>${v.days}</b>日目</span><span>${v.calm > 0 ? '凪' : WIND_NAME[v.wind]}</span>` +
      `<span>残り ${fmt(v.r.total - v.done)}海里</span>`;
    $('#vlog').innerHTML = v.log.join('');
    renderHud();
  }
  function resume() {
    if (!voyage) return;
    voyage.paused = false;
    drawSea();
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
    if (v.done >= v.r.total) { v.done = v.r.total; drawSea(); return arrive(); }

    let pause = C.tickMs;
    const r = Math.random(), e = C.ev;
    if (r < e.storm) {
      const dmg = rnd(8, 22) / t.tough;
      S.ship.hp = Math.max(5, S.ship.hp - dmg);
      vlog(`🌩 嵐に遭った。船体に ${Math.round(dmg)}% の損傷。`, 'bad'); pause = 700;
    } else if (r < e.storm + e.calm) {
      if (!t.oars && v.calm <= 0) { v.calm = rndi(2, 3); vlog('🌫 風が止んだ。しばらく進めない。'); pause = 600; }
    } else if (r < e.storm + e.calm + e.pirate) {
      if (!v.pirate && v.days > 1) { v.pirate = true; v.paused = true; drawSea(); return pirateEvent(); }
    } else if (r < e.storm + e.calm + e.pirate + e.flotsam) {
      const g = rndi(30, 120); S.gold += g;
      vlog(`🪵 漂流する積み荷を拾った。+${g}G`, 'good'); pause = 600;
    }
    drawSea();
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
    const wages = Math.round(v.wages);
    let body = `<p>${v.days}日の航海を終えた。</p>`;
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
    checkEras();
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
    const px = W * 0.2, ex = W * 0.8, sy = H * 0.66, DUR = 3.6;
    const shots = [];
    const np = clamp(guns || 1, 2, 7), ne = win ? 3 : 6;
    for (let i = 0; i < np; i++) shots.push({ me: true, t0: 0.3 + i * (2.0 / np) + rnd(0, 0.1), hit: Math.random() < (win ? 0.7 : 0.25), off: rnd(18, 40) * (Math.random() < 0.5 ? -1 : 1) });
    for (let i = 0; i < ne; i++) shots.push({ me: false, t0: 0.5 + i * (2.0 / ne) + rnd(0, 0.1), hit: Math.random() < (win ? 0.2 : 0.75), off: rnd(18, 40) * (Math.random() < 0.5 ? -1 : 1) });
    if (win) shots.push({ me: true, t0: 2.4, hit: true, off: 0 }); else shots.push({ me: false, t0: 2.4, hit: true, off: 0 });
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
      drawShip(ctx, px, sy + bob, 1, '#7a4a22', '#fbf3df', '#2f6fd0', win ? 0 : -end * 0.35, win ? 0 : end * 14);
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
        const x0 = s.me ? px + 30 : ex - 30, tx = (s.me ? ex : px) + (s.hit ? 0 : s.off);
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
  const isNew = !load();
  if (isNew) { newGame(); save(); }
  render();
  if (isNew) modal({ title: '風と帆の商会', body: `<p>${C.startYear}年、リスボン。小さな船1隻と ${fmt(C.startGold)}G を元手に、交易で商会を大きくしよう。</p>` + helpBody(), buttons: [{ label: 'はじめる', cls: 'pri' }] });
  window.addEventListener('resize', () => { if (voyage) drawSea(); else if (ui.tab === 'sail') drawSailMap(); });

  // 動作確認用（コンソールから状態をのぞける）
  window.__game = { get state() { return S; }, route, spec };
})();
