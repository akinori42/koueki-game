// 品物の一覧。
// unit  : 売り買いの単位（袋・樽・反など、現実の荷姿）
// w     : その1つの重さ（kg）。荷車に積めるのは「重さの合計」が積載量まで
//         （背負い籠は30kg。麦なら3袋、ワインや鉄は1つしか運べない）
// base  : 1つあたりの基準の値段
// depth : 市場の厚み。大きいほど、まとめて売買しても値段が動きにくい
// shelf : 傷むまでの日数（無ければ傷まない）
// lux   : true なら高級品（軽くて高い）。町による値段の差は小さく、在庫も少ない。
//         値打ちが大きいので、山賊と国境の関税に狙われやすい
// abroad: true なら隣国の品。隣国への道が開くまでは、噂にも頼みごとにも出ない
//
// 値段の考え方：町ごとの値段の差は「運び賃」。重くて安い品ほど、産地を離れると値が大きく上がる。
// 軽くて高い品は1〜3割しか変わらない。だから稼ぎは、運んだ重さにほぼ比例する。
// 品物を足すときは、towns.js の各町の prices（倍率）と、産地の stock（在庫）にも書く。
window.SHOKAI = window.SHOKAI || {};

SHOKAI.GOODS = {
  // --- 重くて安い品（1kgあたり1〜4枚）---
  grain:   { name: '麦',         icon: '🌾', unit: '袋', w: 10, base: 10,  depth: 400 },
  salt:    { name: '塩',         icon: '🧂', unit: '袋', w: 10, base: 20,  depth: 300 },
  wine:    { name: 'ワイン',     icon: '🍷', unit: '樽', w: 20, base: 46,  depth: 160 },
  iron:    { name: '鉄',         icon: '⛓️', unit: '束', w: 20, base: 60,  depth: 150 },
  fruit:   { name: '果物',       icon: '🍎', unit: '籠', w: 5,  base: 16,  depth: 200, shelf: 6 },
  wool:    { name: '羊毛',       icon: '🐑', unit: '俵', w: 8,  base: 26,  depth: 220 },
  fish:    { name: '魚',         icon: '🐟', unit: '籠', w: 5,  base: 18,  depth: 220, shelf: 5 },
  // --- 中ぐらいの品（1kgあたり7〜8枚）---
  honey:   { name: '蜂蜜',       icon: '🍯', unit: '壺', w: 5,  base: 40,  depth: 150 },
  liquor:  { name: '火酒',       icon: '🔥', unit: '樽', w: 10, base: 70,  depth: 70 },    // 禁制品
  sugar:   { name: '砂糖',       icon: '🍬', unit: '袋', w: 10, base: 80,  depth: 120, abroad: true },
  // --- 軽くて高い品（1kgあたり17〜200枚）---
  linen:   { name: '亜麻布',     icon: '🧶', unit: '反', w: 3,  base: 50,  depth: 160, lux: true },
  cloth:   { name: '毛織物',     icon: '🧵', unit: '反', w: 4,  base: 90,  depth: 100, lux: true },
  carpet:  { name: '絨毯',       icon: '🧿', unit: '枚', w: 6,  base: 300, depth: 40,  lux: true, abroad: true },
  pelt:    { name: '密猟の毛皮', icon: '🦌', unit: '枚', w: 2,  base: 110, depth: 50,  lux: true },  // 禁制品
  tobacco: { name: '異国の煙草', icon: '🍂', unit: '包', w: 1,  base: 150, depth: 40,  lux: true },  // 禁制品
  spice:   { name: '香辛料',     icon: '🌶️', unit: '袋', w: 1,  base: 200, depth: 50,  lux: true }
};

// 王都の門と国境で取り締まられ、王都では売れない品
SHOKAI.CONTRABAND = ['liquor', 'pelt', 'tobacco'];
