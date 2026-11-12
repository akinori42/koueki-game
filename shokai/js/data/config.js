// ゲーム全体の調整用の数値。難しさを変えたいときはここを触る。
window.SHOKAI = window.SHOKAI || {};

SHOKAI.CONFIG = {
  startGold: 60,
  startTown: 'hashibami',

  // 時間：1日 = 4刻（朝・昼・夕・夜）。移動は日単位。町で売り買いを始めると tradeTime 刻進む（同じ刻のうちは何度でも）
  tradeTime: 1,

  // 親の借金：every 日ごとに dues の額を順に納める。すべて納めれば完済
  loan: { every: 30, dues: [50, 130, 300, 500, 800, 1200, 1800, 2500] },
  // 追加の借り（ツケ）：次の返済日にまとめて取り立てられる
  tabInterest: 0.015,     // 1日の利子
  tabLimit: 150,          // 自分から借りられる上限

  // 相場
  sellRate: 0.8,          // 売値 = 相場 × この値
  devMin: -0.6, devMax: 1.5,
  devDecayUp: 0.85,       // 買われて上がった値が1日で戻る割合（数日で戻る）
  devDecayDown: 0.955,    // 売りこまれて下がった値が1日で戻る割合（半分戻るのに半月かかる）
  driftStep: 0.045,       // 値が日々ゆれる大きさ
  driftPull: 0.1,         // ゆれが元へ戻る強さ
  driftMax: 0.3,
  trendMax: 4, trendChance: 0.12, trendDays: [12, 30], trendUp: [1.3, 1.7], trendDown: [0.6, 0.8],
  stockDays: 4,           // 特産の在庫が空から満杯まで戻る日数
  histDays: 8,            // 町ごとに覚えておく過去の相場の日数（となり町で「◯日前の値」として聞ける）

  // 毎日かかるお金
  living: 4,              // 自分の宿と食事
  guardWage: 4,           // 護衛1人の日給
  guardHire: 8,           // 護衛を雇うときの手付け
  laborPay: 6,            // 日雇い仕事の稼ぎ（1日つぶれる）

  // 道中
  rainStart: 0.2, rainStay: 0.5,
  rainSlow: { road: 1.1, trail: 1.35, path: 1.3 },
  banditBase: [0.03, 0.13, 0.25, 0.4],    // 道の危険度 0〜3 ごとの、山賊に遭う基本の確率
  banditValueRef: 500,    // 積み荷の値打ちがこの額のとき、遭遇率が基本の1.5倍になる
  banditValueMax: 2.5,    // 値打ちによる倍率の上限
  banditGuardCut: 0.15,   // 護衛1人につき遭遇率が下がる割合
  caravanSafety: 0.3,     // 隊商に加わったときの遭遇率の倍率
  caravanPower: 26,
  selfPower: 3,
  guardPower: 7,
  bandits: {
    // 要求額 = tollBase + 積み荷の値打ち × tollRate
    thief: { name: 'こそ泥', min: 4, max: 9, tollBase: 5, tollRate: 0.12, take: 0.3, loot: [5, 15] },
    gang: { name: '山賊団', min: 12, max: 24, tollBase: 15, tollRate: 0.2, take: 0.4, loot: [30, 80] }
  },
  hotChance: 0.08,

  // 関所
  gateTax: 0.08,          // 通行税 = 荷の値打ち × この割合
  passRep: 25,            // 関所を預かる町の評判がこれ以上で、通行手形がもらえる（税が免除）
  gateFind: 0.5,          // 禁制品が見つかる確率
  gateFindPass: 0.3,      // 通行手形があるときの確率
  bribeRate: 0.15,        // 袖の下 = 禁制品の値打ち × この割合 + bribeBase
  bribeBase: 5,
  bribeFind: 0.08,        // 袖の下を渡しても見つかる確率
  fineRate: 0.3,          // 罰金 = 禁制品の値打ち × この割合
  cityFind: 0.7,          // 王都の門で禁制品が見つかる確率

  // 依頼
  orderMax: 2,            // 同時に受けられる数
  orderRefresh: 6,        // 町の依頼が入れ替わる日数
  orderRep: 6,            // 成功したときの評判
  orderFailRep: 8,        // 失敗したときに下がる評判

  // 町
  rumorCost: 3,
  rumorFalse: 0.25,
  mapLocal: 40, mapFull: 150,

  // 店
  shop: {
    1: { name: '露店', cost: 400, rep: 15, rent: 3, wage: 0, kinds: 3, units: 30, rate: 4, every: 3 },
    2: { name: '小さな店', cost: 1600, rep: 40, rent: 7, wage: 4, kinds: 5, units: 120, rate: 5, every: 1 }
  },
  shopPrice: 1.0,

  stepMs: 110
};
