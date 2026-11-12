// 自動テスト。ブラウザなしでゲームを読み込み、データ・航路・一連の操作・セーブ移行を確かめる。
// 使い方： node tests/smoke.js          （全部）
//          node tests/smoke.js map      （地図を文字で描いて目で確かめる）
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const FILES = ['js/data/config.js', 'js/data/goods.js', 'js/data/ports.js', 'js/data/ships.js', 'js/data/map.js', 'js/game.js'];

let fails = 0;
function check(name, ok, detail) {
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? '  ' + detail : ''));
}

// ブラウザのまねをする最小限の環境を作り、ゲームを読み込む
function boot(savedJson) {
  const store = {};
  if (savedJson) store['kaze-to-ho-save-v1'] = savedJson;
  const ctx2d = new Proxy({}, {
    get: (t, k) => k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (typeof k === 'string' ? () => {} : undefined),
    set: () => true
  });
  const mk = () => ({
    innerHTML: '', textContent: '', style: {}, dataset: {}, value: 0, width: 0, height: 0,
    classList: { add() {}, remove() {} },
    querySelectorAll(sel) {
      if (sel !== '[data-mi]') return [];
      this.btns = [...this.innerHTML.matchAll(/data-mi="(\d+)">([^<]*)/g)].map((m) => ({ dataset: { mi: m[1] }, label: m[2] }));
      return this.btns;
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 340, height: 300 }),
    clientWidth: 340, isConnected: true, getContext: () => ctx2d
  });
  const els = {};
  const env = { timers: [], rafs: [], els, store, click: null, t: 0, errors: [] };
  const win = {
    devicePixelRatio: 3, innerHeight: 844, scrollTo() {}, addEventListener() {},
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
    document: {
      querySelector: (s) => els[s] || (els[s] = mk()), querySelectorAll: () => [], createElement: () => mk(),
      addEventListener: (ev, fn) => { if (ev === 'click') env.click = fn; }
    },
    setTimeout: (f) => { env.timers.push(f); return env.timers.length; }, clearTimeout() {},
    requestAnimationFrame: (f) => { env.rafs.push(f); },
    console, Math, JSON, Object, Map, Set
  };
  win.window = win;
  vm.createContext(win);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), win, { filename: f });
  env.win = win; env.g = win.__game; env.D = win.DATA; env.modal = win.document.querySelector('#modal');
  env.act = (a, data) => env.click({ target: { closest: () => ({ dataset: Object.assign({ a }, data || {}), disabled: false }) } });
  env.seen = {};
  env.press = (idx) => {
    const m = env.modal;
    if (!m || !m.innerHTML || !m.btns || !m.btns.length) return false;
    const b = m.btns[idx == null ? Math.floor(Math.random() * m.btns.length) : Math.min(idx, m.btns.length - 1)];
    const key = b.label.replace(/[0-9]+/g, 'N');
    env.seen[key] = (env.seen[key] || 0) + 1;
    b.onclick(); return true;
  };
  // たまった処理を進める（タイマーと、描画コマを一定数）
  env.drain = () => {
    for (let round = 0; round < 400; round++) {
      let did = false, n = 0;
      while (env.timers.length && n++ < 5000) { env.timers.shift()(); did = true; }
      const fr = env.rafs.splice(0, env.rafs.length);
      for (const f of fr) { env.t += 400; f(env.t); }
      if (!did && !env.timers.length) { if (round > 12) break; }
    }
  };
  env.closeAll = () => { let n = 0; while (env.press() && n++ < 30) env.drain(); };
  return env;
}

// ---------- 1. データの整合 ----------
function testData(e) {
  console.log('■ データ');
  const D = e.D, ports = Object.keys(D.PORTS), goods = Object.keys(D.GOODS);
  console.log(`  港 ${ports.length} / 品 ${goods.length} / 地域 ${Object.keys(D.REGIONS).length} / 中継点 ${Object.keys(D.MAP.SEA_NODES).length} / 船 ${Object.keys(D.SHIPS).length}`);
  const bad = [];
  for (const pid of ports) {
    const p = D.PORTS[pid];
    if (!D.REGIONS[p.region]) bad.push(pid + ':region');
    for (const g of Object.keys(p.sells || {}).concat(Object.keys(p.wants || {}))) if (!D.GOODS[g]) bad.push(pid + ':' + g);
    for (const h of p.heardAt || []) if (!D.PORTS[h]) bad.push(pid + ':heardAt ' + h);
    if (p.hidden && !(p.heardAt || []).length) bad.push(pid + ':hidden だが heardAt が無い');
    if (!Object.keys(p.sells || {}).length) bad.push(pid + ':特産なし');
  }
  for (const r in D.REGIONS) for (const g in D.REGIONS[r].prices) if (!D.GOODS[g]) bad.push('region ' + r + ':' + g);
  check('港・地域が参照する品と港がすべて存在する', !bad.length, bad.join(', '));
  const unsold = goods.filter((g) => !ports.some((p) => (D.PORTS[p].sells || {})[g] != null));
  check('どの品にも産地がある', !unsold.length, unsold.join(', '));
  for (const id of ['lisbon', 'seville', 'london', 'antwerp', 'marseille', 'genoa', 'venice', 'alexandria']) if (!D.PORTS[id]) bad.push(id);
  for (const id of ['grain', 'salt', 'wine', 'olive', 'wool', 'cloth', 'glass', 'spice']) if (!D.GOODS[id]) bad.push(id);
  check('旧版の港8・品8の id が残っている（セーブ互換）', !bad.length);
  // 隠れ港はすべて、隠れていない港から噂をたどって発見できるか
  const found = new Set(ports.filter((p) => !D.PORTS[p].hidden));
  for (let i = 0; i < 30; i++) for (const p of ports) if ((D.PORTS[p].heardAt || []).some((h) => found.has(h))) found.add(p);
  check('隠れ港はすべて噂をたどって発見できる', found.size === ports.length, ports.filter((p) => !found.has(p)).join(', '));
}

// ---------- 2. 地図と航路 ----------
function testRoutes(e) {
  console.log('■ 地図と航路');
  const D = e.D, g = e.g, ports = Object.keys(D.PORTS);
  const landPorts = ports.filter((p) => g.inLand(D.PORTS[p].pos));
  check('港がすべて海の上にある', !landPorts.length, landPorts.join(', '));
  const landNodes = Object.keys(D.MAP.SEA_NODES).filter((k) => g.inLand(D.MAP.SEA_NODES[k]));
  check('中継点がすべて海の上にある', !landNodes.length, landNodes.join(', '));
  check('陸を無視してつないだ港が無い', !g.graph.warnings.length, g.graph.warnings.join(', '));
  const lone = Object.keys(D.MAP.SEA_NODES).filter((k) => !g.graph.adj[g.graph.idx[k]].length);
  check('孤立した中継点が無い', !lone.length, lone.join(', '));
  let missing = [], crossing = [], worst = [], n = 0;
  for (const a of ports) for (const b of ports) {
    if (a === b) continue;
    const r = g.route(a, b); n++;
    if (!r) { missing.push(a + '>' + b); continue; }
    for (let i = 2; i < r.pts.length - 1; i++) if (!g.clearLine(r.pts[i - 1], r.pts[i])) { crossing.push(a + '>' + b); break; }
    const straight = g.nm(D.PORTS[a].pos, D.PORTS[b].pos);
    if (a < b && straight > 150) worst.push([r.total / straight, a, b, Math.round(r.total)]);
  }
  check(`全ての港の組（${n}通り）に航路がある`, !missing.length, missing.slice(0, 8).join(', '));
  check('航路が陸を横切らない', !crossing.length, crossing.slice(0, 8).join(', '));
  worst.sort((x, y) => y[0] - x[0]);
  console.log('  遠回りの大きい航路（直線距離との比）： ' + worst.slice(0, 6).map((w) => `${w[1]}-${w[2]} ×${w[0].toFixed(1)}`).join(' / '));
  const leg = (a, b) => Math.round(g.route(a, b).total);
  console.log(`  距離の例（海里）： リスボン→ロンドン ${leg('lisbon', 'london')} / リスボン→ヴェネツィア ${leg('lisbon', 'venice')} / ` +
    `ロンドン→ダンツィヒ ${leg('london', 'danzig')} / ヴェネツィア→カッファ ${leg('venice', 'caffa')} / リスボン→エルミナ ${leg('lisbon', 'elmina')} / ` +
    `リスボン→喜望峰 ${leg('lisbon', 'cape')} / 喜望峰→キルワ ${leg('cape', 'kilwa')}`);
  check('リスボン→ロンドンが 900〜1500 海里', leg('lisbon', 'london') > 900 && leg('lisbon', 'london') < 1500);
  check('リスボン→喜望峰が 5000〜7500 海里', leg('lisbon', 'cape') > 5000 && leg('lisbon', 'cape') < 7500);
}

// ---------- 3. 価格設計：もうかる航路がいくつもあるか ----------
function testPrices(e) {
  console.log('■ 価格設計');
  const D = e.D, g = e.g, ports = Object.keys(D.PORTS);
  // 元手 K・船倉 H・速さ nmDay の船で1品を運んだときの、1日あたりの利益（まとめ買い・まとめ売りの値動きこみ）
  function rank(K, H, nmDay) {
    const all = [];
    for (const a of ports) for (const gid in D.PORTS[a].sells) for (const b of ports) {
      if (a === b) continue;
      const G0 = D.GOODS[gid], pa = G0.base * g.baseMult(a, gid), pb = G0.base * g.baseMult(b, gid) * 0.9;
      if (pb <= pa) continue;
      const sa = 1 / (G0.depth * D.PORTS[a].size), sb = 1 / (G0.depth * D.PORTS[b].size);
      let n = 0, cost = 0, rev = 0;
      while (n < H) { const c = Math.ceil(pa * (1 + n * sa)); if (cost + c > K) break; cost += c; n++; }
      for (let i = 0; i < n; i++) rev += Math.floor(pb * Math.max(0.4, 1 - i * sb));
      const dist = g.route(a, b).total, days = dist / nmDay + 3;
      all.push({ a, b, gid, n, profit: rev - cost, perDay: (rev - cost) / days, ratio: pb / 0.9 / pa, dist });
    }
    return all.sort((x, y) => y.perDay - x.perDay);
  }
  const show = (t, arr) => console.log('  ' + t + '\n' + arr.map((r) =>
    `    ${D.PORTS[r.a].name}→${D.PORTS[r.b].name} ${D.GOODS[r.gid].name}×${r.n}  +${Math.round(r.profit)}G（${r.ratio.toFixed(1)}倍・${Math.round(r.dist)}海里・1日+${Math.round(r.perDay)}G）`).join('\n'));
  const early = rank(1000, 30, 48), mid = rank(6000, 60, 70), late = rank(30000, 170, 55);
  show('序盤（バルシャ・元手1000G）のもうかる航路', early.slice(0, 6));
  show('中盤（キャラベル・元手6000G）のもうかる航路', mid.slice(0, 6));
  show('終盤（キャラック・元手30000G）のもうかる航路', late.slice(0, 6));
  const fromLisbon = early.filter((r) => r.a === 'lisbon').slice(0, 3);
  show('序盤、リスボン発のもうかる航路', fromLisbon);
  check('序盤にリスボンから利益の出る航路がある', fromLisbon.length && fromLisbon[0].profit > 200);
  const top = mid.slice(0, 30).concat(late.slice(0, 30));
  check('序盤と終盤で、いちばんもうかる品が入れ替わる', early[0].gid !== late[0].gid, `${D.GOODS[early[0].gid].name} → ${D.GOODS[late[0].gid].name}`);
  const goodsTop = new Set(top.map((r) => r.gid)), regTop = new Set(top.map((r) => D.PORTS[r.a].region));
  check('中盤・終盤の上位航路に 8種以上の品が入る（一本道にならない）', goodsTop.size >= 8, goodsTop.size + '種');
  check('上位航路の出発地が 5地域以上に散らばる', regTop.size >= 5, regTop.size + '地域');
  // 産地の港で、最初の船でも買える品があるか
  const startCheap = Object.keys(D.PORTS.lisbon.sells).some((gid) => D.GOODS[gid].base * g.baseMult('lisbon', gid) * 30 < 1000);
  check('最初の所持金でリスボンの特産を仕入れられる', startCheap);
  // まとめ売りで値が下がり、日数で戻る
  const S = e.g.state, before = g.sellNow('london', 'wine');
  S.market.london.wine -= 0.4; const dropped = g.sellNow('london', 'wine');
  check('大量に売ると値が下がる', dropped < before, `${before}G → ${dropped}G`);
}

// ---------- 4. 通しで遊ぶ ----------
function testPlay(e, voyagesWanted) {
  console.log('■ 通しプレイ（自動の商人）');
  const D = e.D, g = e.g, S = () => g.state;
  e.closeAll();
  for (const t of ['trade', 'sail', 'dock', 'info']) e.act('tab', { id: t });
  check('4つの画面が描ける', e.els['#main'].innerHTML.length > 300);
  e.act('tab', { id: 'sail' }); e.drain();
  check('地図に他の船が出ている', g.npcs.length >= 30, g.npcs.length + '隻');
  const kinds = new Set(g.npcs.map((n) => n.kind));
  check('船の種類が5種ある', kinds.size === 5, [...kinds].join(','));
  const before = g.npcs.map((n) => n.d);
  e.drain();
  check('他の船が動いている', g.npcs.some((n, i) => n.d !== before[i]));
  e.act('zoom', { d: '1' }); e.act('world'); e.act('home'); e.act('book', { g: 'wine' });
  check('相場帳が開く', /相場帳/.test(e.modal.innerHTML)); e.closeAll();

  let voyages = 0, stuck = false, ships = [], maxGold = 0;
  const track = [];
  for (let n = 0; n < voyagesWanted && !stuck; n++) {
    const here = S().port, P = D.PORTS[here];
    for (const gid of Object.keys(S().cargo)) { e.act('sell', { g: gid }); e.press(1); }
    e.act('repair');
    if (S().gold < 100) e.act('aid');
    if (P.shipyard) for (const id of ['carrack', 'caravel']) {
      if (S().ship.type !== id && S().ship.type !== 'carrack' && S().gold > D.SHIPS[id].price * 1.6) {
        e.act('buyShip', { id });
        if (e.press(1)) { ships.push(id + '@' + S().day + '日'); }
      }
    }
    while (S().ship.crew < g.spec().minCrew && S().gold > 200) e.act('crew', { n: '1' });
    while (S().gold > 2500 && S().ship.guns < Math.min(10, D.SHIPS[S().ship.type].maxGuns)) e.act('gun', { n: '1' });
    if (n % 40 === 0) track.push(`${n}回:${Math.round(S().gold)}G`);
    // 知っている港の中で、1日あたりの見込み利益がいちばん大きい品と行き先を選ぶ（ときどき未訪問の港へ寄り道）
    const dests = S().found.filter((k) => k !== here);
    let best = null, bv = -1e9, bg = null;
    for (const gid of Object.keys(P.sells)) for (const d of dests) {
      const dist = g.route(here, d).total;
      let v = (D.GOODS[gid].base * g.mult(d, gid) * (1 + S().market[d][gid]) * 0.9 - g.buyNow(here, gid)) / (dist / 60 + 4);
      if (!S().known[d]) v += 6;
      if (dist > 2600 && S().ship.type === 'barca') v -= 50;
      if (v > bv) { bv = v; best = d; bg = gid; }
    }
    const days = g.route(here, best).total / (g.spec().speed * 12) * 1.4 + 4;
    const needFood = Math.ceil(days * S().ship.crew / 25);
    if (S().food < needFood) {
      e.act('foodBuy');
      if (e.modal.innerHTML) { e.press(0); S().gold -= Math.min(S().gold, (needFood - Math.floor(S().food)) * 3); S().food = Math.max(S().food, needFood); }
    }
    // 行き先で利益の出る特産を、もうかる順に買えるだけ買う（運転資金として3割は残す）
    const keep = S().gold * 0.3, picks = Object.keys(P.sells)
      .map((gid) => [D.GOODS[gid].base * g.mult(best, gid) * (1 + S().market[best][gid]) * 0.9 / g.buyNow(here, gid), gid])
      .filter((x) => x[0] > 1.08).sort((x, y) => y[0] - x[0]);
    S().gold -= keep;
    for (const pk of picks.length ? picks : [[0, bg]]) { e.act('buy', { g: pk[1] }); e.press(1); }
    S().gold += keep;
    e.act('tab', { id: 'sail' }); e.act('dest', { id: best }); e.act('depart');
    if (e.modal.innerHTML) e.press(1);
    let guard = 0;
    while (S().port === here && guard++ < 60) { e.drain(); if (S().port === here) e.press(); }
    if (S().port === here) { stuck = true; console.log('  !! 航海が終わらない: ' + e.modal.innerHTML.replace(/<[^>]+>/g, ' ').slice(0, 120)); break; }
    voyages++; maxGold = Math.max(maxGold, S().gold);
    e.closeAll();
  }
  check(`${voyagesWanted}回の航海が最後まで進む`, voyages === voyagesWanted && !stuck, voyages + '回');
  const st = S();
  console.log(`  結果： ${1497 + Math.floor(st.day / 365)}年 / 所持金 ${Math.round(st.gold)}G（最高 ${Math.round(maxGold)}G）/ 船 ${st.ship.type} / 買い替え ${ships.join(', ') || 'なし'}`);
  console.log(`  知っている港 ${st.found.length}/${Object.keys(D.PORTS).length} / 訪れた港 ${Object.keys(st.known).length} / 海賊に勝利 ${st.stats.wins}回 / 交易利益 ${Math.round(st.stats.profit)}G / 市況 ${st.trends.length}件`);
  console.log('  所持金の推移： ' + track.join(' → '));
  console.log('  押したボタン： ' + Object.keys(e.seen).join(' / '));
  check('交易で利益が出ている', st.stats.profit > 5000);
  check('市況の変化が起きている', st.trends.length > 0 && st.trends.length <= e.D.CONFIG.trendMax);
  check('海賊戦・逃走・貢ぎ物のどれかを通った', Object.keys(e.seen).some((k) => /戦う|逃げる|渡す/.test(k)));
  check('セーブに異常な値が無い', !/NaN|undefined/.test(e.store['kaze-to-ho-save-v1']) && !/"(gold|day|food)":null/.test(e.store['kaze-to-ho-save-v1']));
  check('セーブが読み直せる', JSON.parse(e.store['kaze-to-ho-save-v1']).v === 2);
}

// ---------- 5. 噂による港の発見 ----------
function testDiscovery() {
  console.log('■ 港の発見');
  const e = boot(); e.closeAll();
  const g = e.g, S = () => g.state;
  check('最初は隠れ港が海図に無い', !S().found.includes('elmina') && !S().found.includes('arguin'));
  const chain = ['laspalmas', 'arguin', 'gambia', 'sierraleone', 'elmina', 'saotome', 'mpinda', 'cape', 'sofala', 'mozambique', 'kilwa'];
  let ok = true, where = '';
  S().gold = 500000; S().ship.crew = 10;
  for (const dest of chain) {
    if (!S().found.includes(dest)) { ok = false; where = dest + ' が未発見'; break; }
    S().food = 38; S().ship.hp = 100; S().ship.crew = Math.max(S().ship.crew, 8);
    e.act('tab', { id: 'sail' }); e.act('dest', { id: dest }); e.act('depart');
    let guard = 0;
    while (S().port !== dest && guard++ < 80) { e.drain(); if (S().port !== dest) { if (!e.press(2)) e.press(); } S().food = Math.max(S().food, 10); }
    if (S().port !== dest) { ok = false; where = dest + ' に着けない'; break; }
    e.closeAll();
  }
  check('噂をたどってキルワまで行ける', ok, where);
  check('全ての港を発見できた', S().found.length === Object.keys(e.D.PORTS).length, S().found.length + '港');
}

// ---------- 6. 旧セーブ（版1）の移行 ----------
function testMigration() {
  console.log('■ 旧セーブの移行');
  const old = {
    v: 1, gold: 4321, day: 400, port: 'venice',
    ship: { type: 'caravel', sail: 'lateen', up: { sail: 1 }, hp: 77, guns: 3, crew: 20, invested: 696 },
    cargo: { spice: { qty: 12, cost: 2800 }, glass: { qty: 5, cost: 450 } }, food: 14.5,
    market: { lisbon: { grain: 0.1, salt: -0.2, wine: 0, olive: 0, wool: 0, cloth: 0, glass: 0, spice: 0.3 }, venice: { grain: 0, salt: 0, wine: 0, olive: 0, wool: 0, cloth: 0, glass: 0.2, spice: 0.25 } },
    known: { lisbon: { day: 300, prices: { grain: 20, salt: 8, wine: 27, olive: 32, wool: 45, cloth: 101, glass: 162, spice: 270 } }, venice: { day: 400, prices: { glass: 81, spice: 202 } } },
    erasSeen: [1], stats: { voyages: 31, wins: 2, profit: 9000 }
  };
  const raw = JSON.stringify(old);
  const e = boot(raw), S = e.g.state;
  check('版が 2 になる', S.v === 2);
  check('所持金・日付・現在地・船が引き継がれる', S.gold === 4321 && S.day === 400 && S.port === 'venice' && S.ship.type === 'caravel' && S.ship.up.sail === 1 && S.ship.guns === 3);
  check('積み荷が引き継がれる', S.cargo.spice.qty === 12 && S.cargo.glass.qty === 5);
  check('相場メモが引き継がれる', S.known.lisbon.prices.wine === 27 && typeof S.known.lisbon.buys === 'object');
  check('新しい港・品の相場が用意される', typeof S.market.danzig.amber === 'number' && typeof S.market.lisbon.gold === 'number' && S.market.lisbon.spice === 0.3);
  check('隠れていない港が海図に入り、隠れ港は入らない', S.found.includes('danzig') && S.found.includes('constantinople') && !S.found.includes('elmina'));
  check('移行前のセーブの控えが残る', e.store['kaze-to-ho-save-v1-backup-v1'] === raw);
  check('移行後のセーブが書き戻される', JSON.parse(e.store['kaze-to-ho-save-v1']).v === 2);
  check('最初の説明は出ない（続きから）', !/はじめる/.test(e.modal.innerHTML));
  for (const t of ['trade', 'sail', 'dock', 'info']) e.act('tab', { id: t });
  e.act('book', { g: 'gold' }); e.closeAll();
  e.act('sell', { g: 'spice' }); e.press(1);
  check('移行後に積み荷を売れる', !S.cargo.spice && S.gold > 4321);
  e.act('tab', { id: 'sail' }); e.act('dest', { id: 'ragusa' }); e.act('depart');
  let guard = 0;
  while (S.port !== 'ragusa' && guard++ < 40) { e.drain(); if (S.port !== 'ragusa') e.press(); }
  check('移行後に新しい港へ航海できる', e.g.state.port === 'ragusa');
  // 壊れたセーブでも止まらない
  const e2 = boot('{こわれたデータ');
  check('壊れたセーブなら新しく始まる', e2.g.state.day === 0 && e2.g.state.v === 2);
}

// ---------- 地図を文字で描く（目で確かめる用） ----------
function asciiMap(e, x0, x1, y0, y1, cols) {
  const D = e.D, g = e.g, rows = Math.round(cols * (y1 - y0) / ((x1 - x0) * 0.8) * 0.5);
  const grid = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) line += g.inLand([x0 + (c + 0.5) / cols * (x1 - x0), y1 - (r + 0.5) / rows * (y1 - y0)]) ? '#' : ' ';
    grid.push(line.split(''));
  }
  const put = (p, ch) => {
    const c = Math.floor((p[0] - x0) / (x1 - x0) * cols), r = Math.floor((y1 - p[1]) / (y1 - y0) * rows);
    if (r >= 0 && r < rows && c >= 0 && c < cols) grid[r][c] = ch;
  };
  for (const k in D.MAP.SEA_NODES) put(D.MAP.SEA_NODES[k], '+');
  for (const k in D.PORTS) put(D.PORTS[k].pos, 'o');
  console.log(grid.map((l) => l.join('')).join('\n'));
}

// ---------- 実行 ----------
const mode = process.argv[2];
const e = boot();
if (mode === 'map') {
  const a = process.argv.slice(3).map(Number);
  if (a.length >= 4) asciiMap(e, a[0], a[1], a[2], a[3], a[4] || 110);
  else asciiMap(e, -28, 44, -37, 62.5, 110);
} else {
  testData(e); testRoutes(e); testPrices(e); testPlay(boot(), 220); testDiscovery(); testMigration();
  console.log(fails ? `\n✗ 失敗 ${fails}件` : '\n✓ すべて合格');
  process.exit(fails ? 1 : 0);
}
