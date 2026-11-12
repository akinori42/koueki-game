// ゲーム全体の調整用の数値。難しさを変えたいときはここを触る。
window.SHOKAI = window.SHOKAI || {};

SHOKAI.CONFIG = {
  startGold: 60,
  startTown: 'hashibami',

  // 時間：1日 = 4刻（朝・昼・夕・夜）。移動は日単位、売買は1回ごとに tradeTime 刻かかる
  tradeTime: 1,

  // 相場
  sellRate: 0.85,         // 売値 = 相場 × この値
  devMin: -0.6, devMax: 1.5,
  devDecay: 0.97,         // 1日ごとに相場が元へ戻る割合
  devNoise: 0.012,
  trendMax: 4,            // 同時に起きる高騰・値崩れの数
  trendChance: 0.12,
  trendDays: [12, 30],
  trendUp: [1.3, 1.7], trendDown: [0.6, 0.8],

  // 毎日かかるお金
  living: 3,              // 自分の宿と食事
  guardWage: 4,           // 護衛1人の日給
  guardHire: 6,           // 護衛を雇うときの手付け
  laborPay: 5,            // 日雇い仕事の稼ぎ（1日つぶれる）

  // 借金
  interest: 0.012,        // 1日の利子
  debtBase: 100,          // 借りられる上限の基本
  borrowRate: 0.8,        // 自分から借りられるのは上限のこの割合まで（残りは利子とツケの余裕）

  // 道中
  rainStart: 0.2, rainStay: 0.5,   // 雨が降り出す確率／降り続く確率
  rainSlow: { road: 1.1, trail: 1.35, path: 1.3 },
  banditBase: [0.05, 0.14, 0.27, 0.42],   // 道の危険度 0〜3 ごとの山賊に遭う確率
  caravanSafety: 0.3,     // 隊商に加わったときの遭遇率の倍率
  caravanPower: 26,       // 隊商の護衛の強さ
  selfPower: 3,           // 自分ひとりの強さ
  guardPower: 7,          // 護衛1人の強さ
  bandits: {
    thief: { name: 'こそ泥', min: 4, max: 9, tollBase: 8, tollRate: 0.1, take: 0.3, loot: [5, 15] },
    gang: { name: '山賊団', min: 14, max: 28, tollBase: 25, tollRate: 0.25, take: 0.5, loot: [30, 80] }
  },
  hotChance: 0.08,        // 1日ごとに、どこかの道で山賊が活発になる確率

  // 関所と王都
  contrabandFind: 0.5,    // 関所で禁制品が見つかる確率
  contrabandFine: 30,
  gateFind: 0.7,          // 王都の門で禁制品が見つかる確率

  // 町
  rumorCost: 3,
  rumorFalse: 0.25,       // 酒場の噂が外れている確率
  mapLocal: 40, mapFull: 150,

  // 店
  shop: {
    1: { name: '露店', cost: 350, rep: 15, rent: 2, wage: 0, kinds: 3, units: 30, rate: 4, every: 3 },
    2: { name: '小さな店', cost: 1400, rep: 40, rent: 6, wage: 3, kinds: 5, units: 120, rate: 5, every: 1 }
  },
  shopPrice: 1.0,         // 店の売値 = 相場 × この値（自分で卸すより高く売れる）

  stepMs: 110             // 移動の演出の1コマ（ミリ秒）
};
