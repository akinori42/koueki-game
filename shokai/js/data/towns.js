// 町と道の一覧。
//
// TOWNS
//   pos    : 地図上の位置 [横, 縦]
//   kind   : village（村）/ town（町）/ capital（王都）/ port（港町）
//   size   : 市場の大きさ。大きいほど値段が動きにくい（村は小さく、町・港・王都は荷車ぶんの量をさばける）
//   stock  : 特産と、その在庫の上限（個）。買うと減り、数日かけて戻る
//   prices : 品ごとの値段の倍率（1.0 が基準。書いていない品は 1.0）
//   ban    : この町では売れない禁制品
//   cityTax: 町に入るとき、荷の値打ちに対してかかる税の割合（王都）
//   has    : 町にある施設  cart=車屋 / lender=金貸しの出店 / map=地図屋 / caravan=隊商 / guard=口入れ屋
//   who    : その町の顔役（依頼を出したり、物語に出てきたりする）
//
// ROADS
//   len    : 歩いたときの日数
//   type   : road（街道）/ trail（山道）/ path（抜け道）
//   danger : 山賊の出やすさ 0〜3
//   gate   : 関所を預かる町（あれば関所がある）。その町の評判が高いと通行手形がもらえる
window.SHOKAI = window.SHOKAI || {};

SHOKAI.TOWNS = {
  hashibami: {
    name: 'ハシバミ村', pos: [20, 104], kind: 'village', size: 0.8, has: {},
    who: { name: 'ミナ', role: '幼なじみ' },
    desc: '麦畑と羊の、生まれ育った村。',
    stock: { grain: 40, wool: 24 },
    prices: { grain: 0.6, wool: 0.65, fish: 1.2, linen: 1.05, iron: 1.3, salt: 1.3, wine: 1.1, cloth: 1.15, spice: 1.05, liquor: 1.2, tobacco: 1.2 }
  },
  mizunara: {
    name: 'ミズナラ村', pos: [10, 74], kind: 'village', size: 0.8, has: {},
    who: { name: 'クヌギ爺', role: '蜂飼い' },
    desc: '森のふちの村。蜂を飼い、果樹を育てる。森番の目を盗む猟師もいる。',
    stock: { honey: 16, fruit: 20, pelt: 4 },
    prices: { honey: 0.6, fruit: 0.6, pelt: 0.6, grain: 1.1, wool: 0.9, fish: 1.3, linen: 1.15, iron: 1.3, salt: 1.4, wine: 1.15, cloth: 1.2, spice: 1.05, liquor: 1.3 }
  },
  budou: {
    name: 'ブドウ丘', pos: [40, 120], kind: 'village', size: 0.9, has: {},
    who: { name: 'マルコ', role: '蔵元' },
    desc: '日当たりのいい丘の村。ワインの蔵が並ぶ。',
    stock: { wine: 20, fruit: 20 },
    prices: { wine: 0.55, fruit: 0.65, grain: 1.15, honey: 1.1, fish: 1.3, linen: 1.1, iron: 1.3, salt: 1.3, cloth: 1.15, spice: 1.05 }
  },
  kawabe: {
    name: 'カワベの町', pos: [44, 90], kind: 'town', size: 2.0, has: { cart: true, lender: true, map: true, caravan: true, guard: true },
    who: { name: 'ゴンゾ', role: '車屋の親方' },
    desc: '川沿いの市場町。金貸しバルドの店がある。',
    stock: { fish: 28, linen: 20 },
    prices: { fish: 0.55, linen: 0.7, grain: 1.2, wool: 1.1, honey: 1.25, fruit: 1.2, iron: 1.2, salt: 1.2, wine: 1.1, cloth: 1.1, spice: 1.1, liquor: 1.2, pelt: 1.2, tobacco: 1.3 }
  },
  iwaya: {
    name: 'イワヤ鉱山町', pos: [14, 40], kind: 'town', size: 1.6, has: { cart: true, guard: true },
    who: { name: 'ドルガ', role: '鉱夫頭' },
    desc: '山あいの鉱山町。食べ物は何でも高い。強い火酒を造る。',
    stock: { iron: 20, liquor: 8 },
    prices: { iron: 0.55, liquor: 0.6, grain: 1.5, wool: 1.2, honey: 1.3, fish: 1.5, fruit: 1.6, linen: 1.2, salt: 1.1, wine: 1.4, cloth: 1.3, spice: 1.2, tobacco: 1.5 }
  },
  tsuno: {
    name: 'ツノ峠の宿場', pos: [46, 58], kind: 'village', size: 0.8, has: { caravan: true, guard: true },
    who: { name: 'トワ', role: '宿の女将' },
    desc: '峠の手前の宿場。岩塩を掘る。王都へ向かう者が足を休める。',
    stock: { salt: 30 },
    prices: { salt: 0.6, grain: 1.3, honey: 1.2, fish: 1.4, fruit: 1.4, linen: 1.1, wine: 1.3, cloth: 1.2, spice: 1.1, liquor: 1.3, tobacco: 1.2 }
  },
  hataori: {
    name: 'ハタオリの町', pos: [70, 80], kind: 'town', size: 2.0, has: { cart: true, lender: true, caravan: true, guard: true },
    who: { name: 'セリナ', role: '織元の女主人' },
    desc: '機の音が絶えない織物の町。羊毛を高く買う。',
    stock: { cloth: 14, linen: 18 },
    prices: { cloth: 0.7, linen: 0.75, wool: 1.5, grain: 1.2, honey: 1.2, fish: 1.2, fruit: 1.2, iron: 1.2, salt: 1.2, wine: 1.2, liquor: 1.3, pelt: 1.5 }
  },
  oto: {
    name: '王都グランヴェル', pos: [76, 34], kind: 'capital', size: 5.0, cityTax: 0.05, ban: ['liquor', 'pelt', 'tobacco'],
    has: { cart: true, lender: true, map: true, caravan: true, guard: true },
    who: { name: 'ロイス', role: '商人組合の書記' },
    desc: '白い城壁の都。何でも高く売れるが、門で税を取られる。',
    stock: { spice: 5 },
    prices: { spice: 0.9, grain: 1.4, wool: 1.2, honey: 1.6, fish: 1.6, fruit: 1.7, linen: 1.4, iron: 1.4, salt: 1.4, wine: 1.6, cloth: 1.4 }
  },
  shiokaze: {
    name: '港町シオカゼ', pos: [92, 106], kind: 'port', size: 3.0, has: { lender: true, caravan: true, guard: true },
    who: { name: 'ナギ', role: '船問屋' },
    desc: '潮の香りの港町。海の向こうの品が届く。船乗りは火酒に目がない。',
    stock: { salt: 40, spice: 6, fish: 28, tobacco: 4 },
    prices: { salt: 0.5, spice: 0.7, fish: 0.7, tobacco: 0.7, grain: 1.3, wool: 1.2, honey: 1.4, fruit: 1.4, linen: 1.3, iron: 1.4, wine: 1.4, cloth: 1.2, liquor: 1.5, pelt: 1.4 }
  }
};

SHOKAI.ROADS = {
  r1:  { a: 'hashibami', b: 'kawabe',   len: 2, type: 'road',  danger: 0 },
  r2:  { a: 'hashibami', b: 'mizunara', len: 2, type: 'trail', danger: 1 },
  r3:  { a: 'hashibami', b: 'budou',    len: 2, type: 'road',  danger: 0 },
  r4:  { a: 'budou',     b: 'kawabe',   len: 2, type: 'road',  danger: 0 },
  r5:  { a: 'mizunara',  b: 'iwaya',    len: 3, type: 'trail', danger: 2 },
  r6:  { a: 'kawabe',    b: 'tsuno',    len: 3, type: 'road',  danger: 1, gate: 'kawabe' },
  r6b: { a: 'kawabe',    b: 'tsuno',    len: 4, type: 'path',  danger: 3 },
  r7:  { a: 'iwaya',     b: 'tsuno',    len: 3, type: 'trail', danger: 2 },
  r8:  { a: 'kawabe',    b: 'hataori',  len: 3, type: 'road',  danger: 1, gate: 'hataori' },
  r8b: { a: 'kawabe',    b: 'hataori',  len: 4, type: 'path',  danger: 3 },
  r9:  { a: 'tsuno',     b: 'oto',      len: 3, type: 'road',  danger: 1, gate: 'oto' },
  r9b: { a: 'tsuno',     b: 'oto',      len: 4, type: 'path',  danger: 3 },
  r10: { a: 'hataori',   b: 'oto',      len: 4, type: 'road',  danger: 1, gate: 'oto' },
  r11: { a: 'hataori',   b: 'shiokaze', len: 3, type: 'road',  danger: 1 },
  r12: { a: 'budou',     b: 'shiokaze', len: 5, type: 'path',  danger: 2 },
  r13: { a: 'iwaya',     b: 'oto',      len: 5, type: 'trail', danger: 3 }
};

SHOKAI.ROAD_TYPES = {
  road:  { name: '街道' },
  trail: { name: '山道' },
  path:  { name: '抜け道' }
};
