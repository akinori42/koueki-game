// ゲーム全体の調整用の数値。難しさを変えたいときはここを触る。
window.SHOKAI = window.SHOKAI || {};

SHOKAI.CONFIG = {
  startGold: 60,
  startTown: 'hashibami',

  // 時間：1日 = 4刻（朝・昼・夕・夜）。移動は日単位。町で売り買いを始めると tradeTime 刻進む（同じ刻のうちは何度でも）
  tradeTime: 1,

  // 親の借金：every 日ごと（＝季節の終わりごと）に dues の額を順に納める。すべて納めれば完済
  loan: { every: 30, dues: [50, 120, 300, 700, 1300, 1900, 2600, 3300] },
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
  // 予定外の高騰・値崩れ（兆しの噂の種）。起きる lead 日前から噂になる
  trendMax: 4, trendChance: 0.14, trendLead: [4, 9], trendDays: [10, 24], trendUp: [1.3, 1.7], trendDown: [0.6, 0.8],
  stockDays: 4,           // 特産の在庫が空から満杯まで戻る日数
  histDays: 14,           // 町ごとに覚えておく過去の相場の日数（噂は、道のりの日数ぶん古い値をもとに作る）

  // 噂
  rumorErr: [0.15, 0.25, 0.35],   // 値の噂の誤差の幅：となり町 ／ 2つ先あたり ／ それより遠い町
  rumorErrDays: [3, 6],           // その境目（歩いた日数）。3日までは「となり」、6日までは「2つ先」
  rumorKeep: 12,                  // 噂帳に残る日数
  rumorRel: { street: 0.6, tavern: 0.7, traveler: 0.85, patron: 0.9, broker: 0.9 },   // 聞く相手ごとの、当たる割合
  streetCount: [2, 3],            // 町に着いたとき、ただで耳に入る噂の数
  rumorCost: 3,                   // 酒場
  brokerCost: 15,                 // 情報屋（町を指定して聞く／あいまいな噂を確かめる）
  brokerGoods: 4,                 // 情報屋が一度に教えてくれる品の数

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
    // 要求額 = tollBase + 積み荷の値打ち × tollRate。take = 荷を渡して通してもらうときの割合。
    // loseCargo・loseGold = 戦って負けたときに奪われる荷と金の割合
    thief: { name: 'こそ泥', min: 4, max: 9, tollBase: 5, tollRate: 0.12, take: 0.3, loseCargo: 0.4, loseGold: 0.2, loot: [5, 15] },
    gang: { name: '山賊団', min: 12, max: 24, tollBase: 15, tollRate: 0.2, take: 0.4, loseCargo: 0.6, loseGold: 0.35, loot: [30, 80] }
  },
  hotChance: 0.08,
  // 道中の出来事（自分で決める場面）
  scout: 0.6,             // 山賊に、先に気づける確率（護衛1人につき +0.1）
  detourMeet: 0.15,       // 迂回しても鉢合わせる確率
  hideOk: 0.7,            // 身をひそめて、やり過ごせる確率
  riverChance: 0.35,      // 雨の日に、川が増水している確率
  riverFail: 0.35,        // 無理に渡って、荷を流される確率
  riverLoss: 0.3,         // そのとき流される荷の割合
  nightChance: 0.35,      // 3日以上の道のりで、夜通し歩くか迷う場面が出る確率
  nightBandit: 0.6,       // 夜通し歩いたとき、追加で山賊に遭う確率（ふだんの確率 × この値）
  hurryDump: 0.2,         // 急ぐために捨てる荷の割合
  sideChance: 0.12,       // 道ばたで人に出会う確率
  maxChoices: 2,          // 1回の旅で出る「迷う場面」の上限（山賊と故障は別）
  bigBet: 0.3,            // 手持ちのこの割合以上を荷につぎこんだ旅は、着いたとき1品ずつ札をめくる

  // 王都の門・国境
  bribeRate: 0.15,        // 袖の下 = 禁制品の値打ち × この割合 + bribeBase
  bribeBase: 5,
  bribeFind: 0.08,        // 袖の下を渡しても見つかる確率
  fineRate: 0.3,          // 罰金 = 禁制品の値打ち × この割合
  cityFind: 0.7,          // 王都の門で禁制品が見つかる確率
  abroad: {
    shopLv: 2, rep: 30,   // 隣国への道が開く条件：小さな店を持ち、王都の評判がこの値以上
    tariff: 0.10,         // 国境の関税 = 荷の値打ち × この割合
    passRep: 45,          // 王都の評判がこの値で、国境の通行手形（関税が tariffPass に下がる）
    tariffPass: 0.05,
    find: 0.5, findPass: 0.3   // 国境で禁制品が見つかる確率
  },

  // 依頼（一回きりの頼みごと）
  orderMax: 2,            // 同時に受けられる数
  orderRefresh: 6,        // 町の依頼が入れ替わる日数
  orderRep: 6,            // 成功したときの評判
  orderFailRep: 8,        // 失敗したときに下がる評判
  orderFee: 0.25,         // 運び賃：報酬 = 品の値打ちの8割 + kg × orderFee ×（1 + 産地までの日数）
  // 得意先（続く約束）
  patronAfter: 2,         // その町の頼みごとをこの回数果たすと、得意先の話が来る
  patronEvery: 20,        // 何日ごとに納めるか
  patronMax: 3,           // 同時に持てる得意先の数
  patronPay: 1.3,         // 納めたときの代金 = 品の値打ち × この値
  patronRep: 3,           // 納めるたびの評判
  patronMissRep: 6,       // すっぽかしたときに下がる評判
  patronTrust: 2,         // この回数つづけて守ると、その町での売り買いが有利になる
  patronEdge: 0.05,       // そのときの有利さ（買値 −5%、売値 +5%）

  // 故郷の村への投資（ハシバミ村で建てられる。建てるほど村の特産の在庫が増える）
  home: {
    well:   { name: '井戸',   cost: 150, stock: 0.2, rep: 8,  desc: '村の暮らしが楽になる。特産の在庫 +20%' },
    bridge: { name: '石の橋', cost: 450, stock: 0.3, rep: 10, desc: '畑への行き来が楽になる。特産の在庫 +30%' },
    mill:   { name: '水車',   cost: 900, stock: 0.5, rep: 12, desc: '粉ひきと糸つむぎが進む。特産の在庫 +50%' }
  },

  // 町
  mapLocal: 40, mapFull: 150,

  // 店
  shop: {
    1: { name: '露店', cost: 400, rep: 15, rent: 3, wage: 0, kinds: 3, units: 30, rate: 4, every: 3 },
    2: { name: '小さな店', cost: 1600, rep: 40, rent: 7, wage: 4, kinds: 5, units: 120, rate: 5, every: 1 }
  },
  shopPrice: 1.0,

  stepMs: 110
};
