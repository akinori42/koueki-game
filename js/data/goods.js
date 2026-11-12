// 交易品の一覧。
// base  : 基準の値段
// depth : 市場の厚み。大きいほど、まとめて売買しても値段が動きにくい
// 品物を足すときは、ports.js の各港の prices にも同じ id を足す（無ければ 1.0 扱い）。
window.DATA = window.DATA || {};

DATA.GOODS = {
  grain: { name: '小麦',       icon: '🌾', base: 20,  depth: 500 },
  salt:  { name: '塩',         icon: '🧂', base: 15,  depth: 500 },
  wine:  { name: 'ワイン',     icon: '🍷', base: 40,  depth: 300 },
  olive: { name: 'オリーブ油', icon: '🫒', base: 45,  depth: 300 },
  wool:  { name: '羊毛',       icon: '🐑', base: 50,  depth: 250 },
  cloth: { name: '毛織物',     icon: '🧵', base: 90,  depth: 200 },
  glass: { name: 'ガラス細工', icon: '🏺', base: 150, depth: 150 },
  spice: { name: '香辛料',     icon: '🌶️', base: 300, depth: 120 }
};
