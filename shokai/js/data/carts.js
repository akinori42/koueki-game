// 荷車の一覧。
// cap    : 積める量
// price  : 値段
// speed  : 道の種類ごとの、かかる日数の倍率（小さいほど速い）
// feed   : 1日の餌代
// guards : 連れて歩ける護衛の人数
// flee   : 山賊から逃げ切れる確率
// breakP : 1回の移動で壊れる確率（道の種類ごと）
// repair : 道中で壊れたときの修理代
// toll   : 関所で上乗せされる通行税
// 荷車を足すときは、ここに1つ足すだけで車屋に並ぶ。
window.SHOKAI = window.SHOKAI || {};

SHOKAI.CARTS = {
  basket: {
    name: '背負い籠', icon: '🧺', cap: 12, price: 0,
    speed: { road: 1.0, trail: 1.0, path: 1.0 }, feed: 0, guards: 1, flee: 0.55,
    breakP: { road: 0, trail: 0, path: 0 }, repair: 0, toll: 0,
    desc: '自分の背中だけが頼り。どんな道でも通れる。'
  },
  handcart: {
    name: '手押し車', icon: '🛒', cap: 30, price: 150,
    speed: { road: 1.0, trail: 1.4, path: 1.3 }, feed: 0, guards: 2, flee: 0.3,
    breakP: { road: 0.04, trail: 0.1, path: 0.08 }, repair: 15, toll: 2,
    desc: '安くて餌がいらない。山道では押すのがつらい。'
  },
  donkey: {
    name: 'ロバの荷車', icon: '🫏', cap: 60, price: 520,
    speed: { road: 0.9, trail: 1.1, path: 1.2 }, feed: 2, guards: 3, flee: 0.3,
    breakP: { road: 0.03, trail: 0.06, path: 0.07 }, repair: 40, toll: 5,
    desc: '餌代が安く、山道にも強い。足は遅め。'
  },
  horse: {
    name: '一頭立て馬車', icon: '🐴', cap: 95, price: 1500,
    speed: { road: 0.6, trail: 1.5, path: 1.4 }, feed: 5, guards: 4, flee: 0.6,
    breakP: { road: 0.05, trail: 0.16, path: 0.14 }, repair: 90, toll: 9,
    desc: '街道ではとても速く、傷む品に向く。悪路に弱く、餌代が高い。'
  }
};
