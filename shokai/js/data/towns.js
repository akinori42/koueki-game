// 町と道の一覧。
//
// TOWNS
//   pos    : 地図上の位置 [横, 縦]
//   kind   : village（村）/ town（町）/ capital（王都）/ port（港町）
//   size   : 市場の大きさ。大きいほど値段が動きにくい（村は小さく、町・港・王都は荷車ぶんの量をさばける）
//   stock  : 特産と、その在庫の上限（袋・樽などの数）。買うと減り、数日かけて戻る。高級品は少ない
//   prices : 特産（その町で買える品）の値段の倍率。産地なので安い。
//            ※ 産地でない町の値段は書かない。いちばん近い産地からの道のりで自動的に決まる
//              （config.js の priceCurve。遠いほど高い）。
//   wants  : その町が特に欲しがる品と、上乗せの倍率。品ごとの「いちばん高く買う町」は、産地から遠くに置いてある
//   ban    : この町では売れない禁制品
//   has    : 町にある施設  cart=車屋 / lender=金貸しの出店（荷の保険も扱う）/ map=地図屋 / caravan=隊商 /
//            guard=口入れ屋 / info=情報屋 / store=貸し倉庫
//   who    : その町の顔役。頼みごとを出し、何度か果たすと得意先になる。want = 得意先として納める品と数
//   abroad : true なら隣国の町。商会が大きくなって道が開くまで、地図にも噂にも出ない
//
// ROADS
//   len    : 歩いたときの日数
//   type   : road（街道）/ trail（山道）/ path（近道：街道より早いが、山賊が多い）
//   danger : 山賊の出やすさ 0〜3
//   border : true なら国境の関所がある（関税と、禁制品の検査）
//   abroad : true なら隣国へ通じる道（開くまで使えない）
window.SHOKAI = window.SHOKAI || {};

SHOKAI.TOWNS = {
  hashibami: {
    name: 'ハシバミ村', pos: [20, 104], kind: 'village', size: 0.8, has: {},
    who: { name: 'ミナ', role: '幼なじみ', want: { g: 'salt', n: 4 } },
    desc: '麦畑と羊の、生まれ育った村。',
    stock: { grain: 60, wool: 24 }, prices: { grain: 0.5, wool: 0.6 },
    wants: { iron: 1.1, salt: 1.1 }
  },
  mizunara: {
    name: 'ミズナラ村', pos: [10, 74], kind: 'village', size: 0.8, has: {},
    who: { name: 'クヌギ爺', role: '蜂飼い', want: { g: 'grain', n: 6 } },
    desc: '森のふちの村。蜂を飼い、果樹を育てる。森番の目を盗む猟師もいる。',
    stock: { honey: 12, fruit: 30, pelt: 3 }, prices: { honey: 0.7, fruit: 0.55, pelt: 0.7 },
    wants: { salt: 1.2 }
  },
  budou: {
    name: 'ブドウ丘', pos: [40, 120], kind: 'village', size: 0.9, has: {},
    who: { name: 'マルコ', role: '蔵元', want: { g: 'iron', n: 2 } },
    desc: '日当たりのいい丘の村。ワインの蔵が並ぶ。',
    stock: { wine: 30, fruit: 30 }, prices: { wine: 0.5, fruit: 0.6 },
    wants: { iron: 1.15 }
  },
  kawabe: {
    name: 'カワベの町', pos: [44, 90], kind: 'town', size: 1.5, has: { cart: true, lender: true, map: true, caravan: true, guard: true, info: true, store: true },
    who: { name: 'ゴンゾ', role: '車屋の親方', want: { g: 'iron', n: 4 } },
    desc: '川沿いの市場町。金貸しバルドの店がある。',
    stock: { fish: 60, linen: 14 }, prices: { fish: 0.5, linen: 0.8 },
    wants: {}
  },
  iwaya: {
    name: 'イワヤ鉱山町', pos: [14, 40], kind: 'town', size: 1.6, has: { cart: true, guard: true },
    who: { name: 'ドルガ', role: '鉱夫頭', want: { g: 'grain', n: 12 } },
    desc: '山あいの鉱山町。食べ物は何でも高い。強い火酒を造る。',
    stock: { iron: 30, liquor: 6 }, prices: { iron: 0.5, liquor: 0.7 },
    wants: { grain: 1.3, fruit: 1.25, wine: 1.15, spice: 1.1 }
  },
  tsuno: {
    name: 'ツノ峠の宿場', pos: [46, 58], kind: 'village', size: 0.8, has: { caravan: true, guard: true },
    who: { name: 'トワ', role: '宿の女将', want: { g: 'wine', n: 3 } },
    desc: '峠の手前の宿場。岩塩を掘る。王都へ向かう者が足を休める。',
    stock: { salt: 50 }, prices: { salt: 0.55 },
    wants: { wine: 1.15, fish: 1.1 }
  },
  hataori: {
    name: 'ハタオリの町', pos: [66, 82], kind: 'town', size: 2.0, has: { cart: true, lender: true, caravan: true, guard: true, info: true, store: true },
    who: { name: 'セリナ', role: '織元の女主人', want: { g: 'wool', n: 12 } },
    desc: '機の音が絶えない織物の町。羊毛をどこよりも高く買う。',
    stock: { cloth: 8, linen: 12 }, prices: { cloth: 0.78, linen: 0.82 },
    wants: { wool: 1.3, pelt: 1.2 }
  },
  oto: {
    name: '王都グランヴェル', pos: [72, 34], kind: 'capital', size: 5.0, ban: ['liquor', 'pelt', 'tobacco'],
    has: { cart: true, lender: true, map: true, caravan: true, guard: true, info: true, store: true },
    who: { name: 'ロイス', role: '商人組合の書記', want: { g: 'honey', n: 8 } },
    desc: '白い城壁の都。酒も蜜も布も、どこよりも高く売れる。門で禁制品をあらためられる。馬車はここの車屋でしか買えない。',
    stock: { spice: 3 }, prices: { spice: 0.9 },
    wants: { wine: 1.2, honey: 1.25, fruit: 1.15, cloth: 1.1, linen: 1.1, sugar: 1.2, carpet: 1.1 }
  },
  shiokaze: {
    name: '港町シオカゼ', pos: [84, 112], kind: 'port', size: 3.0, has: { lender: true, caravan: true, guard: true, info: true, store: true },
    who: { name: 'ナギ', role: '船問屋', want: { g: 'wine', n: 6 } },
    desc: '潮の香りの港町。海の向こうの品が届く。船は鉄を欲しがり、船乗りは火酒に目がない。',
    stock: { salt: 60, fish: 60, spice: 4, tobacco: 3 }, prices: { salt: 0.45, fish: 0.6, spice: 0.8, tobacco: 0.75 },
    wants: { iron: 1.15, liquor: 1.25, wine: 1.1 }
  },

  // ===== 隣国（商会が大きくなると道が開く）=====
  karune: {
    name: '国境の町カルネ', pos: [94, 74], kind: 'town', size: 2.0, abroad: true, has: { caravan: true, guard: true, lender: true, info: true, store: true },
    who: { name: 'ハディ', role: '両替商', want: { g: 'iron', n: 8 } },
    desc: '国境を越えた先の、砂色の町。言葉も、秤も、値段もちがう。',
    stock: { sugar: 30, spice: 8, tobacco: 5 }, prices: { sugar: 0.6, spice: 0.62, tobacco: 0.6 },
    wants: { iron: 1.1 }
  },
  mirza: {
    name: '砂の都ミルザ', pos: [94, 44], kind: 'capital', size: 4.0, abroad: true, has: { cart: true, caravan: true, guard: true, info: true, store: true },
    who: { name: 'サフィヤ', role: '絨毯商', want: { g: 'cloth', n: 6 } },
    desc: '青い丸屋根の都。絨毯と香辛料の市が立つ。鉄と酒は、いくらあっても足りない。',
    stock: { carpet: 6, spice: 10, sugar: 40 }, prices: { carpet: 0.72, spice: 0.5, sugar: 0.5 },
    wants: { iron: 1.1, wine: 1.15, cloth: 1.15, honey: 1.2 }
  }
};

SHOKAI.ROADS = {
  r1:  { a: 'hashibami', b: 'kawabe',   len: 2, type: 'road',  danger: 0 },
  r2:  { a: 'hashibami', b: 'mizunara', len: 2, type: 'trail', danger: 1 },
  r3:  { a: 'hashibami', b: 'budou',    len: 2, type: 'road',  danger: 0 },
  r4:  { a: 'budou',     b: 'kawabe',   len: 2, type: 'road',  danger: 0 },
  r5:  { a: 'mizunara',  b: 'iwaya',    len: 3, type: 'trail', danger: 2 },
  r6:  { a: 'kawabe',    b: 'tsuno',    len: 3, type: 'road',  danger: 1 },
  r6b: { a: 'kawabe',    b: 'tsuno',    len: 2, type: 'path',  danger: 3 },
  r7:  { a: 'iwaya',     b: 'tsuno',    len: 3, type: 'trail', danger: 2 },
  r8:  { a: 'kawabe',    b: 'hataori',  len: 3, type: 'road',  danger: 1 },
  r8b: { a: 'kawabe',    b: 'hataori',  len: 2, type: 'path',  danger: 3 },
  r9:  { a: 'tsuno',     b: 'oto',      len: 3, type: 'road',  danger: 1 },
  r9b: { a: 'tsuno',     b: 'oto',      len: 2, type: 'path',  danger: 3 },
  r10: { a: 'hataori',   b: 'oto',      len: 4, type: 'road',  danger: 1 },
  r11: { a: 'hataori',   b: 'shiokaze', len: 3, type: 'road',  danger: 1 },
  r12: { a: 'budou',     b: 'shiokaze', len: 4, type: 'path',  danger: 2 },
  r13: { a: 'iwaya',     b: 'oto',      len: 5, type: 'trail', danger: 3 },
  // 隣国へ
  r14:  { a: 'hataori',  b: 'karune',   len: 4, type: 'road',  danger: 1, border: true, abroad: true },
  r14b: { a: 'hataori',  b: 'karune',   len: 6, type: 'trail', danger: 3, abroad: true },   // 山越えの密輸路（関所なし）
  r15:  { a: 'karune',   b: 'mirza',    len: 3, type: 'road',  danger: 1, abroad: true }
};

SHOKAI.ROAD_TYPES = {
  road:  { name: '街道' },
  trail: { name: '山道' },
  path:  { name: '近道' }
};
