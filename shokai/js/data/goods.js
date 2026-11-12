// 品物の一覧。
// base  : 基準の値段
// depth : 市場の厚み。大きいほど、まとめて売買しても値段が動きにくい
// shelf : 傷むまでの日数（無ければ傷まない）。4割を過ぎると値が落ちはじめ、過ぎると腐って捨てる
// 品物を足すときは、towns.js の各町の prices にも倍率を書く（無ければ 1.0）。
window.SHOKAI = window.SHOKAI || {};

SHOKAI.GOODS = {
  grain:  { name: '麦',     icon: '🌾', base: 10,  depth: 120 },
  fruit:  { name: '果物',   icon: '🍎', base: 16,  depth: 60, shelf: 6 },
  fish:   { name: '魚',     icon: '🐟', base: 18,  depth: 60, shelf: 5 },
  salt:   { name: '塩',     icon: '🧂', base: 20,  depth: 90 },
  wool:   { name: '羊毛',   icon: '🐑', base: 26,  depth: 70 },
  honey:  { name: '蜂蜜',   icon: '🍯', base: 40,  depth: 50 },
  wine:   { name: 'ワイン', icon: '🍷', base: 46,  depth: 50 },
  linen:  { name: '亜麻布', icon: '🧶', base: 50,  depth: 50 },
  iron:   { name: '鉄',     icon: '⛓️', base: 60,  depth: 50 },
  liquor: { name: '火酒',   icon: '🔥', base: 70,  depth: 30 },   // 関所と王都では禁制品
  cloth:  { name: '毛織物', icon: '🧵', base: 90,  depth: 35 },
  spice:  { name: '香辛料', icon: '🌶️', base: 200, depth: 20 }
};

// 関所で取り締まられる品
SHOKAI.CONTRABAND = ['liquor'];
