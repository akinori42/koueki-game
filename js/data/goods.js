// 交易品の一覧。
// base  : 基準の値段
// depth : 市場の厚み。大きいほど、まとめて売買しても値段が動きにくい
//
// 値段の決まり方（game.js の baseMult）：
//   1. 港の sells に書いてあれば、その倍率（産地なので安い）
//   2. 港の wants に書いてあれば、その倍率（特に欲しがるので高い）
//   3. どちらにも無ければ、港が属する地域（ports.js の REGIONS）の倍率
//   4. それも無ければ 1.0
// 品物を足すときは、ここに1行足し、産地の港の sells と、欲しがる地域の prices に書く。
window.DATA = window.DATA || {};

DATA.GOODS = {
  // --- かさばる安い品 ---
  grain:     { name: '小麦',         icon: '🌾', base: 20,  depth: 500 },
  salt:      { name: '塩',           icon: '🧂', base: 15,  depth: 500 },
  fish:      { name: '干し魚',       icon: '🐟', base: 24,  depth: 450 },
  timber:    { name: '木材',         icon: '🪵', base: 22,  depth: 450 },
  dates:     { name: 'なつめやし',   icon: '🌴', base: 34,  depth: 350 },
  wine:      { name: 'ワイン',       icon: '🍷', base: 40,  depth: 300 },
  olive:     { name: 'オリーブ油',   icon: '🫒', base: 45,  depth: 300 },
  hides:     { name: '皮革',         icon: '🐂', base: 48,  depth: 300 },
  // --- 原料・金属 ---
  wool:      { name: '羊毛',         icon: '🐑', base: 50,  depth: 250 },
  iron:      { name: '鉄',           icon: '⛓️', base: 55,  depth: 250 },
  linen:     { name: '亜麻布',       icon: '🧶', base: 60,  depth: 250 },
  pottery:   { name: '陶器',         icon: '🏺', base: 65,  depth: 220 },
  wax:       { name: '蜜蝋',         icon: '🕯️', base: 70,  depth: 220 },
  cotton:    { name: '綿花',         icon: '☁️', base: 75,  depth: 220 },
  copper:    { name: '銅',           icon: '🟠', base: 85,  depth: 200 },
  cloth:     { name: '毛織物',       icon: '🧵', base: 90,  depth: 200 },
  tin:       { name: '錫',           icon: '🔘', base: 95,  depth: 180 },
  alum:      { name: '明礬',         icon: '🧪', base: 110, depth: 170 },
  // --- 高級品 ---
  sugar:     { name: '砂糖',         icon: '🍬', base: 130, depth: 170 },
  malagueta: { name: 'ギニア胡椒',   icon: '🌰', base: 140, depth: 150 },
  glass:     { name: 'ガラス細工',   icon: '🔮', base: 150, depth: 150 },
  dye:       { name: '染料',         icon: '🎨', base: 160, depth: 140 },
  arms:      { name: '武具',         icon: '⚔️', base: 170, depth: 130 },
  coral:     { name: '珊瑚',         icon: '🪸', base: 180, depth: 110 },
  amber:     { name: '琥珀',         icon: '🟡', base: 190, depth: 100 },
  fur:       { name: '毛皮',         icon: '🦊', base: 200, depth: 110 },
  carpet:    { name: '絨毯',         icon: '🧿', base: 240, depth: 100 },
  incense:   { name: '乳香',         icon: '💨', base: 260, depth: 100 },
  ivory:     { name: '象牙',         icon: '🐘', base: 280, depth: 90 },
  spice:     { name: '胡椒',         icon: '🌶️', base: 300, depth: 120 },
  silk:      { name: '絹',           icon: '🎀', base: 320, depth: 90 },
  gold:      { name: '砂金',         icon: '✨', base: 420, depth: 70 }
};
