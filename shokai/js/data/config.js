// ゲーム全体の調整用の数値。難しさを変えたいときはここを触る。
window.SHOKAI = window.SHOKAI || {};

SHOKAI.CONFIG = {
  startGold: 60,
  startTown: 'hashibami',

  // 時間：1日 = 4刻（朝・昼・夕・夜）。旅は「日数ちょうど」かかるので、昼に出れば昼に着く。
  // 町で売り買いを始めると tradeTime 刻進む（同じ刻のうちは何度でも）。夜は市場も酒場も閉まり、出発もできない。
  tradeTime: 1,

  // 難しさ（はじめに選ぶ）。dues = 返済額の倍率、bandit = 山賊に遭う確率の倍率
  diff: {
    normal: { name: 'ふつう',   dues: 1.0,  bandit: 1.0,  desc: '腕のいい商人でも、ときどき破産する。' },
    easy:   { name: 'やさしい', dues: 0.75, bandit: 0.8,  desc: '返済額が4分の3。山賊も少なめ。まずは物語を楽しみたい人に。' },
    hard:   { name: 'きびしい', dues: 1.3,  bandit: 1.15, desc: '返済額が3割増し。山賊も多い。' }
  },

  // 親の借金：every 日ごと（＝季節の終わりごと）に dues の額を順に納める。すべて納めれば完済
  loan: { every: 30, dues: [50, 120, 300, 700, 1300, 1900, 2600, 3300] },
  warnDays: 3,            // 返済日の何日前から、足りないときの見込み（何を売られ、何を取られるか）を知らせるか
  // 追加の借り（ツケ）：次の返済日にまとめて取り立てられる
  tabInterest: 0.015,     // 1日の利子
  tabLimit: 150,          // 自分から借りられる上限の基本
  tabDueRate: 0.3,        // ＋ 次の返済額のこの割合まで借りられる（返済が重くなるほど、借りられる額も増える）

  // 相場
  sellRate: 0.85,         // 売値 = 相場 × この値
  devMin: -0.6, devMax: 1.5,
  devDecayUp: 0.85,       // 買われて上がった値が1日で戻る割合（数日で戻る）
  devDecayDown: 0.955,    // 売りこまれて下がった値が1日で戻る割合（半分戻るのに半月かかる）
  driftStep: 0.045,       // 値が日々ゆれる大きさ
  driftPull: 0.1,         // ゆれが元へ戻る強さ
  driftMax: 0.3,
  // 産地でない町の値段は、いちばん近い産地からの道のり（街道と山道を歩く日数）で決まる。
  //   倍率 = near（2日以内の町）＋ per ×（日数 − 2）。上限 cap。産地の倍率は towns.js の prices に書く。
  //   bulk = 重くて安い品 ／ mid = 中ぐらい ／ lux = 軽くて高い品 ／ contra = 禁制品
  priceCurve: {
    bulk:   { near: 0.95, per: 0.2,  cap: 2.6 },
    mid:    { near: 0.98, per: 0.1,  cap: 1.9 },
    lux:    { near: 1.0,  per: 0.04, cap: 1.35 },
    contra: { near: 1.0,  per: 0.09, cap: 1.7 }
  },
  // 産地に近い町ほど、その品の市場が薄い（少し売りこむだけで値が崩れる）。[日数まで, 厚みの倍率]
  nearDepth: [[2, 0.35], [4, 0.7]],
  // 予定外の高騰・値崩れ（兆しの噂の種）。起きる lead 日前から噂になる
  trendMax: 4, trendChance: 0.14, trendLead: [4, 9], trendDays: [10, 24], trendUp: [1.3, 1.7], trendDown: [0.6, 0.8],
  stockDays: 4,           // 特産の在庫が空から満杯まで戻る日数
  histDays: 14,           // 町ごとに覚えておく過去の相場の日数（噂は、道のりの日数ぶん古い値をもとに作る）

  // 噂
  rumorErr: [0.15, 0.25, 0.35],   // 値の噂の誤差の幅：となり町 ／ 2つ先あたり ／ それより遠い町
  rumorErrDays: [3, 6],           // その境目（歩いた日数）
  rumorKeep: 12,                  // 噂帳に残る日数
  rumorRel: { street: 0.6, tavern: 0.7, traveler: 0.85, patron: 0.9, broker: 0.9 },   // 聞く相手ごとの、当たる割合
  streetCount: [2, 3],            // 町に着いたとき、ただで耳に入る噂の数
  rumorCost: 3,                   // 酒場
  brokerCost: 15,                 // 情報屋（町を指定して聞く／あいまいな噂の伏せた部分を聞く）
  brokerGoods: 4,                 // 情報屋が一度に教えてくれる品の数

  // 毎日かかるお金
  living: 4,              // 自分の宿と食事
  guardWage: 4,           // 護衛1人の日給
  guardHire: 8,           // 護衛を雇うときの手付け
  laborPay: 6,            // 日雇い仕事の稼ぎ（1日つぶれる）
  buddyWage: 3,           // 道連れの日給
  buddyHire: 20,          // 道連れを誘うときの手付け
  buddyBonus: 2,          // 道連れが補ってくれる能力の段階

  // 商人の能力（各1〜5、合計15。3が基準）。1段階ごとの効き目
  stat: {
    eyeErr: 0.1,          // 目利き：値の噂の幅が1割ずつ狭く（広く）なる
    eyeRel: 0.03,         //         噂の当たる割合
    talkPrice: 0.02,      // 話術：買値 −2%・売値 +2%
    talkRep: 0.1,         //       評判の上がり方 +10%
    talkToll: 0.08,       //       山賊の通行料 −8%
    edgeMax: 0.1,         //       話術と得意先の優遇を合わせた、値段の有利さの上限
    bodyKg: 3,            // 体力：背負い籠に入る重さ ±3kg
    bodyRiver: 0.05,      //       川を渡るときの失敗 ∓5%
    armPower: 2,          // 腕っぷし：自分の戦う力 ±2
    armFlee: 0.04,        //           逃げ切る確率 ±4%
    senseScout: 0.08,     // 勘：山賊に先に気づく確率 ±8%
    senseHide: 0.05       //     身をひそめる成功率 ±5%
  },
  // 能力が +1 伸びるまでの回数（それぞれ1回だけ伸びる）
  grow: { eye: 20, talk: 40, body: 60, arm: 5, sense: 8 },

  // 道中
  rainStart: 0.2, rainStay: 0.5,
  rainSlow: { road: 1.1, trail: 1.35, path: 1.3 },
  banditBase: [0.03, 0.13, 0.25, 0.4],    // 道の危険度 0〜3 ごとの、山賊に遭う基本の確率
  banditValueRef: 500,    // 積み荷の値打ちがこの額のとき、遭遇率が基本の1.5倍になる
  banditValueMax: 2.5,    // 値打ちによる倍率の上限
  banditGuardCut: 0.15,   // 護衛1人につき遭遇率が下がる割合
  safeDays: 30,           // はじめの季節のあいだは、安全な街道（危険度0）に山賊が出ず、山賊団も現れない
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
  // 山賊の頭：近道や山道に居座る。倒すと懸賞金が出て、その道がしばらく安全になる
  boss: {
    first: 25,            // 最初の頭が現れる日
    power: [26, 34],      // 強さ（護衛4人と自分で 31）
    bounty: [350, 600],   // 懸賞金
    tollBase: 40, tollRate: 0.3,   // 通してもらうための通行料 = tollBase + 荷の値打ち × tollRate
    loseCargo: 0.6, loseGold: 0.35,
    safeDays: 40,         // 倒したあと、その道が安全になる日数（危険度が2下がる）
    respawn: [30, 50]     // 次の頭が、別の道に現れるまでの日数
  },
  // 街道の見回り：禁制品を積んで街道を行くと、役人に荷をあらためられることがある（山道・近道にはいない）
  patrol: { chance: 0.25, find: 0.5 },
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
  // 荷の保険（金貸しのいる町で、出発前にかけられる）
  insure: { rate: 0.06, cover: 0.6 },   // 掛け金 = 仕入れ値 × rate。山賊・川・故障で失った荷の仕入れ値 × cover が戻る

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
  orderFarDays: 5,        // 産地までこの日数以上かかる頼みごとは「遠方の頼み」
  orderFarMult: 2,        // 遠方の頼みは、運び賃がこの倍
  // 得意先（続く約束）
  patronAfter: 2,         // その町の頼みごとをこの回数果たすと、得意先の話が来る
  patronEvery: 20,        // 何日ごとに納めるか
  patronMax: 3,           // 同時に持てる得意先の数
  patronPay: 1.3,         // 納めたときの代金 = 品の値打ち × この値
  patronRep: 3,           // 納めるたびの評判
  patronMissRep: 6,       // すっぽかしたときに下がる評判
  patronTrust: 2,         // この回数つづけて守ると、その町での売り買いが有利になる
  patronEdge: 0.05,       // そのときの有利さ（買値 −5%、売値 +5%）
  patronGrow: 3,          // この回数つづけて守るたびに、注文が大きくなる
  patronLv: [1, 1.5, 2.5, 4],   // 注文の大きさの倍率（段階ごと）

  // 故郷の村への投資（ハシバミ村で建てられる。建てるほど村の特産の在庫が増える）
  home: {
    well:   { name: '井戸',   cost: 150, stock: 0.2, rep: 8,  desc: '村の暮らしが楽になる。特産の在庫 +20%' },
    bridge: { name: '石の橋', cost: 450, stock: 0.3, rep: 10, desc: '畑への行き来が楽になる。特産の在庫 +30%' },
    mill:   { name: '水車',   cost: 900, stock: 0.5, rep: 12, desc: '粉ひきと糸つむぎが進む。特産の在庫 +50%' }
  },

  // 町
  mapLocal: 40, mapFull: 150,
  // 倉庫（大きな町で借りられる。荷を寝かせて、祭りや冬の値上がりを待てる）
  store: { rent: 2, cap: 500 },   // 荷を預けている町ごとに1日 rent 枚。1つの町に cap kg まで

  // 店：預けた品を、留守のあいだも売ってくれる。自分で卸すより高く、値崩れもしにくい
  shop: {
    1: { name: '露店', cost: 400, rep: 15, rent: 3, wage: 0, kinds: 3, units: 60, rate: 8, every: 2 },
    2: { name: '小さな店', cost: 1600, rep: 40, rent: 7, wage: 4, kinds: 5, units: 250, rate: 8, every: 1 }
  },
  shopPrice: 1.0,         // 店の売値 = 相場 × この値（自分で卸すと × sellRate）

  stepMs: 110
};
