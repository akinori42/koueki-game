// 荷車の一覧。
// cap    : 積める重さの合計（kg）。品物1つの重さは goods.js の w
// price  : 値段
// speed  : 道の種類ごとの、かかる日数の倍率（小さいほど速い）
// feed   : 1日の餌代
// guards : 連れて歩ける護衛の人数
// flee   : 山賊から逃げ切れる確率
// breakP : 1回の移動で壊れる確率（道の種類ごと）
// repair : 道中で壊れたときの修理代
// gate   : 王都の門で払う入市税（荷車の大きさで決まる定額）
// only   : 書いてあれば、その町の車屋でしか買えない（遠くの町にしかない品）
// 荷車を足すときは、ここに1つ足すだけで車屋に並ぶ。
window.SHOKAI = window.SHOKAI || {};

SHOKAI.CARTS = {
  basket: {
    name: '背負い籠', icon: '🧺', cap: 30, price: 0,
    speed: { road: 1.0, trail: 1.0, path: 1.0 }, feed: 0, guards: 0, flee: 0.55,
    breakP: { road: 0, trail: 0, path: 0 }, repair: 0, gate: 0,
    desc: '自分の背中だけが頼り。麦なら3袋、樽や鉄はひとつがやっと。護衛を連れる余裕もない。'
  },
  handcart: {
    name: '手押し車', icon: '🛒', cap: 120, price: 130,
    speed: { road: 1.0, trail: 1.4, path: 1.3 }, feed: 0, guards: 0, flee: 0.3,
    breakP: { road: 0.04, trail: 0.1, path: 0.08 }, repair: 15, gate: 2,
    desc: '籠の4倍積めて、餌がいらない。樽も6つ運べる。護衛を連れる余裕はまだない。山道では押すのがつらい。'
  },
  donkey: {
    name: 'ロバの荷車', icon: '🫏', cap: 350, price: 600,
    speed: { road: 0.9, trail: 1.1, path: 1.2 }, feed: 2, guards: 3, flee: 0.3,
    breakP: { road: 0.03, trail: 0.06, path: 0.07 }, repair: 40, gate: 5,
    desc: '鉄や樽も運べる。餌代が安く、山道にも強い。足は遅め。'
  },
  horse: {
    name: '一頭立て馬車', icon: '🐴', cap: 700, price: 1600,
    speed: { road: 0.6, trail: 1.5, path: 1.4 }, feed: 5, guards: 4, flee: 0.6,
    breakP: { road: 0.05, trail: 0.16, path: 0.14 }, repair: 90, gate: 10, only: ['oto', 'mirza'],
    desc: '街道ではとても速く、たくさん積める。悪路に弱く、餌代が高い。王都の車屋でしか買えない。'
  }
};
