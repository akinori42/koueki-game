// 季節と暦。1年 = 120日（春・夏・秋・冬が30日ずつ）。季節の終わりが、借金の返済日になる。
//
// seasons : 季節の並び
// mods    : 季節ごとの値段と在庫の変化
//   where: 'src' = その品の産地だけ ／ 'all' = どの町でも
//   price = 値段の倍率、stock = 産地の在庫の倍率
// closed  : その季節に通れなくなる道（冬の峠）
// events  : 毎年きまって起きる行事。誰でも知っている（暦に載る）。
//   from, to = その季節の何日目から何日目まで（0 が初日）
//   t = 起きる町（無ければ国じゅう）、goods = 品ごとの倍率、all = すべての品の倍率
// 行事を足すときは events に1つ足すだけでよい。
window.SHOKAI = window.SHOKAI || {};

SHOKAI.CALENDAR = {
  yearDays: 120,
  seasons: [
    { id: 'spring', name: '春', icon: '🌸', desc: '雪がとけ、峠が開く。王都では春祭り。' },
    { id: 'summer', name: '夏', icon: '☀️', desc: '果物がよく実る。暑さで魚と果物は傷みやすい。' },
    { id: 'autumn', name: '秋', icon: '🍂', desc: '麦とぶどうの収穫。産地では安く、たくさん出まわる。' },
    { id: 'winter', name: '冬', icon: '❄️', desc: '山の峠が雪で閉じる。麦・塩・羊毛がどこでも高くなる。' }
  ],
  mods: [
    { season: 'summer', g: 'fruit', where: 'src', price: 0.8, stock: 1.5 },
    { season: 'autumn', g: 'grain', where: 'src', price: 0.75, stock: 1.6 },
    { season: 'autumn', g: 'wine',  where: 'src', price: 0.85, stock: 1.4 },
    { season: 'autumn', g: 'honey', where: 'src', price: 0.9,  stock: 1.3 },
    { season: 'winter', g: 'grain', where: 'all', price: 1.25 },
    { season: 'winter', g: 'salt',  where: 'all', price: 1.25 },
    { season: 'winter', g: 'wool',  where: 'all', price: 1.2 },
    { season: 'winter', g: 'fruit', where: 'src', stock: 0.4 },
    { season: 'spring', g: 'wool',  where: 'src', price: 0.85, stock: 1.4 }
  ],
  // 夏は傷む品の足が早い（傷みの進み方の倍率）
  spoil: { summer: 1.3 },
  closed: [
    { season: 'winter', roads: ['r7', 'r13'] }
  ],
  events: [
    { id: 'fest',    name: '王都の春祭り',     season: 'spring', from: 17, to: 23, t: 'oto',
      goods: { wine: 2.0, honey: 1.8, fruit: 1.6, cloth: 1.4 }, desc: '王都で酒と甘いものが、ふだんの倍の値で売れる' },
    { id: 'regatta', name: '港の夏市',         season: 'summer', from: 12, to: 17, t: 'shiokaze',
      goods: { wine: 1.8, fruit: 1.7, iron: 1.4, linen: 1.3 }, desc: '船が集まり、港町で酒・果物・鉄が高い' },
    { id: 'fair',    name: 'カワベの秋の大市', season: 'autumn', from: 12, to: 17, t: 'kawabe',
      all: 1.25, desc: 'カワベで何でも高く売れる' },
    { id: 'hoard',   name: '冬ごもりの買いだめ', season: 'winter', from: 0, to: 8,
      goods: { grain: 1.2, salt: 1.3, wine: 1.2 }, desc: '国じゅうで麦・塩・酒が高い' }
  ]
};
