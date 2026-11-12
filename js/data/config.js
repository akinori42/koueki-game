// ゲーム全体の調整用の数値。バランスを変えたいときはここを触る。
window.DATA = window.DATA || {};

DATA.CONFIG = {
  startYear: 1497,        // 開始年（1500年に第2期の船が解放される）
  startGold: 1000,
  startPort: 'lisbon',
  startShip: 'barca',
  startCrew: 8,
  startFood: 20,

  nmPerSpeed: 12,         // 速度1あたり1日に進む海里
  tickMs: 150,            // 航海中、1日ぶんの表示時間（ミリ秒）

  sellRate: 0.9,          // 売値 = 相場 × この値
  devMin: -0.6,           // 相場の下がり幅の限界
  devMax: 1.5,            // 相場の上がり幅の限界
  devDecay: 0.98,         // 1日ごとに相場が元へ戻る割合（1に近いほど戻りが遅い＝同じ航路の繰り返しが効かなくなる）
  devNoise: 0.01,         // 1日ごとの相場のゆらぎ

  // 産地に近い港での値段の上限：産地の倍率 ×（nearCapBase + 産地からの海里 ÷ nearCapDist）
  // nearCapDist を小さくすると、近場の交易でももうかりやすくなる
  nearCapBase: 1.15,
  nearCapDist: 1100,

  // 市況の変化（ある港である品が一時的に高騰／値崩れする）
  trendMax: 14,           // 同時に起きている数の上限
  trendChance: 0.2,       // 1日に新しく起きる確率
  trendDays: [50, 140],   // 続く日数の幅
  trendUp: [1.35, 1.8],   // 高騰の倍率の幅
  trendDown: [0.6, 0.8],  // 値崩れの倍率の幅

  // 地図
  maxLeg: 1500,           // 中継点どうしを直線で結ぶ最大距離（海里）
  zoomMin: 3.2,           // 縮小の限界（緯度1度あたりのピクセル）
  zoomMax: 44,            // 拡大の限界
  zoomStart: 12,

  // 地図上を動く他の船（見た目だけ。数を減らすと軽くなる）
  npc: { merchant: 26, galley: 6, fisher: 10, pirate: 8, warship: 4, speed: 22 },

  foodPrice: 3,           // 食料1樽の買値
  foodSell: 1,            // 食料1樽の売値
  crewPerFood: 25,        // 1樽で1日まかなえる船員数
  wagePerDay: 0.3,        // 船員1人の1日の給料
  hireCost: 10,           // 船員1人の雇用費
  minCrewAbs: 3,          // 船員の最低人数

  gunPrice: 80,           // 大砲1門の値段（1門で船倉1を使う）
  repairPerPoint: 4,     // 船体1%の修理費（× 船の頑丈さ）
  tradeInRate: 0.5,       // 船を買い替えるときの下取り率
  refitRate: 0.1,         // 帆装の張り替え費用（船の値段に対する割合）

  aidGold: 300,           // 破産時にギルドがくれる援助金

  // 航海中のできごとが1日に起きる確率
  ev: { storm: 0.02, calm: 0.03, pirate: 0.012, flotsam: 0.01 },

  // 海賊の強さ（weight は出やすさ）
  pirates: [
    { name: '小型の海賊船', min: 10, max: 18, loot: 1, weight: 55 },
    { name: '中型の海賊船', min: 20, max: 32, loot: 2, weight: 33 },
    { name: '大型の海賊船', min: 36, max: 55, loot: 4, weight: 12 }
  ]
};
