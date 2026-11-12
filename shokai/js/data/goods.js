// 品物の一覧。
// base  : 基準の値段
// w     : 1個の重さ。荷車に積めるのは「重さの合計」が積載量まで
//         （背負い籠は8。麦なら2個、鉄や毛織物なら1個しか運べない）
// depth : 市場の厚み。大きいほど、まとめて売買しても値段が動きにくい
// shelf : 傷むまでの日数（無ければ傷まない）
// 品物を足すときは、towns.js の各町の prices（倍率）と、産地の stock（在庫）にも書く。
window.SHOKAI = window.SHOKAI || {};

SHOKAI.GOODS = {
  grain:   { name: '麦',         icon: '🌾', base: 10,  w: 3, depth: 400 },
  fruit:   { name: '果物',       icon: '🍎', base: 16,  w: 2, depth: 200, shelf: 6 },
  fish:    { name: '魚',         icon: '🐟', base: 18,  w: 2, depth: 220, shelf: 5 },
  salt:    { name: '塩',         icon: '🧂', base: 20,  w: 3, depth: 300 },
  wool:    { name: '羊毛',       icon: '🐑', base: 26,  w: 2, depth: 220 },
  honey:   { name: '蜂蜜',       icon: '🍯', base: 40,  w: 2, depth: 150 },
  wine:    { name: 'ワイン',     icon: '🍷', base: 46,  w: 4, depth: 160 },
  linen:   { name: '亜麻布',     icon: '🧶', base: 50,  w: 2, depth: 160 },
  iron:    { name: '鉄',         icon: '⛓️', base: 60,  w: 5, depth: 150 },
  cloth:   { name: '毛織物',     icon: '🧵', base: 90,  w: 5, depth: 100 },
  spice:   { name: '香辛料',     icon: '🌶️', base: 200, w: 3, depth: 50 },
  // --- 禁制品（関所で取り締まられ、王都では売れない） ---
  liquor:  { name: '火酒',       icon: '🔥', base: 70,  w: 3, depth: 70 },
  pelt:    { name: '密猟の毛皮', icon: '🦌', base: 110, w: 3, depth: 50 },
  tobacco: { name: '異国の煙草', icon: '🍂', base: 150, w: 2, depth: 40 }
};

SHOKAI.CONTRABAND = ['liquor', 'pelt', 'tobacco'];
