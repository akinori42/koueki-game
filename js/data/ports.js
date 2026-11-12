// 地域と港の一覧。
//
// REGIONS : 地域ごとの値段の倍率（1.0 が基準。書いていない品は 1.0）
//           「その地域ではこの品が高い／安い」という大まかな傾向を決める。
// PORTS   : 港。
//   pos      : [経度, 緯度]
//   region   : 属する地域（REGIONS の id）
//   size     : 市場の大きさ。大きいほど値段が動きにくい
//   shipyard : true なら船の購入・改造ができる
//   sells    : この港で買える特産品と倍率（低いほど安い）
//   wants    : この港が特に欲しがる品と倍率（地域の倍率より優先）
//   hidden   : true なら最初は地図に出ない
//   heardAt  : ここに書いた港のどれかに入港すると、噂を聞いて発見する
window.DATA = window.DATA || {};

DATA.REGIONS = {
  baltic: { name: 'バルト海', prices: {
    grain: 0.75, timber: 0.7, fish: 0.85, amber: 0.7, fur: 0.8, wax: 0.8, iron: 0.85, copper: 0.85, linen: 0.85,
    salt: 1.5, wine: 1.6, olive: 1.5, cloth: 1.3, sugar: 1.6, spice: 1.55, malagueta: 1.5, silk: 1.5, carpet: 1.5,
    incense: 1.4, dates: 1.6, gold: 1.3, glass: 1.3, dye: 1.3, alum: 1.3, pottery: 1.3, cotton: 1.4, tin: 1.2, coral: 1.2, ivory: 1.3 } },
  north: { name: '北海', prices: {
    cloth: 0.9, wool: 0.9,
    grain: 1.15, salt: 1.35, timber: 1.2, wine: 1.5, olive: 1.45, iron: 1.2, wax: 1.3, hides: 1.25, sugar: 1.5, cotton: 1.5,
    alum: 1.5, dye: 1.4, coral: 1.2, amber: 1.15, fur: 1.2, glass: 1.35, carpet: 1.5, silk: 1.45, spice: 1.4, malagueta: 1.4,
    ivory: 1.35, gold: 1.25, incense: 1.4, dates: 1.5, pottery: 1.4, copper: 1.1 } },
  atlantic: { name: '大西洋岸', prices: {
    wine: 0.8, salt: 0.8, wool: 0.9,
    grain: 1.1, fish: 1.25, timber: 1.3, cloth: 1.2, linen: 1.2, copper: 1.2, wax: 1.25, sugar: 1.2, fur: 1.25, glass: 1.2,
    carpet: 1.4, silk: 1.4, spice: 1.25, malagueta: 1.25, ivory: 1.2, gold: 1.15, incense: 1.3, dates: 1.3, amber: 1.2, iron: 1.1, alum: 1.2 } },
  wmed: { name: '西地中海', prices: {
    wine: 0.85, olive: 0.85, coral: 0.9, pottery: 0.9,
    grain: 1.2, fish: 1.4, timber: 1.3, wool: 1.25, linen: 1.3, iron: 1.2, copper: 1.15, tin: 1.35, wax: 1.35, hides: 1.3,
    sugar: 1.15, cotton: 1.35, alum: 1.2, dye: 1.3, amber: 1.3, fur: 1.4, carpet: 1.35, silk: 1.25, spice: 1.1, malagueta: 1.2,
    ivory: 1.3, gold: 1.25, incense: 1.3, dates: 1.3, cloth: 1.1 } },
  adri: { name: 'アドリア海', prices: {
    grain: 1.25, fish: 1.35, wool: 1.3, tin: 1.35, hides: 1.3, cotton: 1.35, dye: 1.3, amber: 1.4, fur: 1.45, carpet: 1.3,
    silk: 1.2, ivory: 1.3, gold: 1.3, incense: 1.25, cloth: 1.2, timber: 1.2, sugar: 1.2, iron: 1.15, wax: 1.2, dates: 1.3 } },
  emed: { name: '東地中海', prices: {
    wine: 0.85, olive: 0.9, carpet: 0.9, cotton: 0.85, alum: 0.85, silk: 0.9,
    tin: 1.45, amber: 1.5, fur: 1.4, arms: 1.3, cloth: 1.35, glass: 1.25, ivory: 1.3, incense: 1.3, iron: 1.3, fish: 1.2,
    coral: 1.3, gold: 1.3, copper: 1.3, timber: 1.2, pottery: 1.2, linen: 1.2 } },
  levant: { name: 'レヴァント', prices: {
    spice: 0.7, cotton: 0.8, incense: 0.8, silk: 0.85, dye: 0.85, grain: 0.85, wine: 0.9,
    timber: 1.7, cloth: 1.45, iron: 1.4, copper: 1.5, tin: 1.6, coral: 1.6, amber: 1.7, fur: 1.3, glass: 1.4, arms: 1.35,
    ivory: 1.3, gold: 1.35, fish: 1.2, pottery: 1.3, linen: 1.3, wax: 1.2, olive: 1.1 } },
  black: { name: '黒海', prices: {
    grain: 0.75, fur: 0.85, wax: 0.85, silk: 0.85, hides: 0.85, fish: 0.85,
    salt: 1.1, wine: 1.2, olive: 1.2, cloth: 1.4, sugar: 1.3, coral: 1.3, glass: 1.3, arms: 1.4, spice: 1.1, incense: 1.2,
    tin: 1.3, iron: 1.2, dates: 1.3, pottery: 1.2, dye: 1.2 } },
  nafrica: { name: '北アフリカ', prices: {
    dates: 0.75, hides: 0.8, coral: 0.8, wax: 0.85, olive: 0.85, wine: 0.9,
    grain: 1.1, timber: 1.5, cloth: 1.4, iron: 1.4, amber: 1.4, glass: 1.3, arms: 1.5, spice: 1.1, linen: 1.3, tin: 1.3,
    copper: 1.3, silk: 1.2, sugar: 1.2, fish: 1.1 } },
  islands: { name: '大西洋の島々', prices: {
    sugar: 0.7, dye: 0.8,
    grain: 1.3, fish: 1.2, cloth: 1.3, linen: 1.3, arms: 1.2, iron: 1.3, olive: 1.2, pottery: 1.3, timber: 1.2, glass: 1.2, salt: 1.1 } },
  wafrica: { name: '西アフリカ', prices: {
    gold: 0.8, ivory: 0.75, malagueta: 0.7, hides: 0.8, wax: 0.8,
    grain: 1.2, salt: 1.9, wine: 1.3, cloth: 1.7, linen: 1.5, iron: 1.6, copper: 1.8, coral: 1.7, amber: 1.4, glass: 1.8,
    arms: 1.6, pottery: 1.4, tin: 1.4, dates: 1.3, carpet: 1.3, silk: 1.3 } },
  safrica: { name: '中部・南アフリカ', prices: {
    ivory: 0.6, hides: 0.7,
    cloth: 1.7, copper: 1.8, glass: 1.8, iron: 1.7, salt: 1.6, wine: 1.4, linen: 1.5, arms: 1.5, coral: 1.6, pottery: 1.4, grain: 1.3 } },
  eafrica: { name: '東アフリカ', prices: {
    gold: 0.65, ivory: 0.6, spice: 0.7, incense: 0.7,
    cloth: 1.9, iron: 1.5, copper: 1.6, coral: 1.6, glass: 2.0, arms: 1.5, linen: 1.6, wine: 1.2, pottery: 1.5, amber: 1.5, tin: 1.5, carpet: 1.3 } }
};

DATA.PORTS = {
  // ===== バルト海 =====
  lubeck: { name: 'リューベック', pos: [10.95, 54.1], region: 'baltic', size: 1.3, shipyard: true,
    desc: 'ハンザ同盟の盟主。ニシンと塩の取引で栄える。', sells: { fish: 0.6, salt: 0.75, copper: 0.75 } },
  copenhagen: { name: 'コペンハーゲン', pos: [12.6, 55.7], region: 'baltic', size: 1.0, shipyard: true,
    desc: '海峡を押さえる王の港。ニシン漁の拠点。', sells: { fish: 0.55, hides: 0.75 } },
  danzig: { name: 'ダンツィヒ', pos: [18.8, 54.5], region: 'baltic', size: 1.3, shipyard: true,
    desc: '大河の河口。内陸の穀物と木材が山と積まれる。', sells: { grain: 0.5, timber: 0.6, amber: 0.55 } },
  konigsberg: { name: 'ケーニヒスベルク', pos: [19.9, 55.1], region: 'baltic', size: 0.8,
    desc: '琥珀海岸の町。浜で拾われた琥珀が集まる。', sells: { amber: 0.45, wax: 0.7, timber: 0.65 } },
  visby: { name: 'ヴィスビュー', pos: [18.2, 57.65], region: 'baltic', size: 0.7,
    desc: 'バルト海の真ん中の島。古い交易の中継地。', sells: { fish: 0.7, iron: 0.75 } },
  stockholm: { name: 'ストックホルム', pos: [18.4, 59.25], region: 'baltic', size: 1.0, shipyard: true,
    desc: '北の鉱山から鉄と銅が運ばれてくる。', sells: { iron: 0.55, copper: 0.6 } },
  riga: { name: 'リガ', pos: [23.9, 57.15], region: 'baltic', size: 1.0,
    desc: '東の森の産物が川を下ってくる。', sells: { fur: 0.65, wax: 0.6, linen: 0.6, timber: 0.65 } },
  reval: { name: 'レヴァル', pos: [24.7, 59.6], region: 'baltic', size: 0.9,
    desc: '北東の果て。奥地の毛皮がもっとも安い。', sells: { fur: 0.55, wax: 0.65, linen: 0.65 } },

  // ===== 北海 =====
  bergen: { name: 'ベルゲン', pos: [5.1, 60.4], region: 'north', size: 0.9,
    desc: 'フィヨルドの港。干し鱈が倉にあふれる。', sells: { fish: 0.45, timber: 0.65, fur: 0.8 }, wants: { grain: 1.5 } },
  edinburgh: { name: 'エディンバラ', pos: [-2.7, 56.1], region: 'north', size: 0.8,
    desc: '北の王国の都。羊と牛の産物を出す。', sells: { wool: 0.7, hides: 0.65, fish: 0.65 } },
  hamburg: { name: 'ハンブルク', pos: [8.5, 53.95], region: 'north', size: 1.2, shipyard: true,
    desc: '大河の河口の自由都市。内陸の職人の品が集まる。', sells: { linen: 0.65, arms: 0.75, copper: 0.8 } },
  amsterdam: { name: 'アムステルダム', pos: [4.3, 52.5], region: 'north', size: 1.2, shipyard: true,
    desc: '運河の町。穀物と木材をいくらでも欲しがる。', sells: { fish: 0.65, cloth: 0.8, linen: 0.75 }, wants: { grain: 1.35, timber: 1.45 } },
  antwerp: { name: 'アントワープ', pos: [3.6, 51.6], region: 'north', size: 1.4, shipyard: true,
    desc: '北の大市場。高級品に金を惜しまない。', sells: { cloth: 0.65, linen: 0.7 }, wants: { spice: 1.5, sugar: 1.6, alum: 1.7, gold: 1.3 } },
  bruges: { name: 'ブルッヘ', pos: [3.0, 51.45], region: 'north', size: 1.1,
    desc: '織物の町。羊毛と染料と明礬がいつも足りない。', sells: { cloth: 0.7 }, wants: { wool: 1.4, alum: 1.65, dye: 1.55 } },
  london: { name: 'ロンドン', pos: [0.9, 51.5], region: 'north', size: 1.2, shipyard: true,
    desc: '羊毛の国の都。南の産物は何でも高く売れる。', sells: { wool: 0.6, cloth: 0.85, tin: 0.75 } },
  rouen: { name: 'ルーアン', pos: [0.1, 49.75], region: 'north', size: 1.0,
    desc: '川をさかのぼった先に都がある。亜麻布の産地。', sells: { linen: 0.7, grain: 0.85 } },

  // ===== 大西洋岸 =====
  bristol: { name: 'ブリストル', pos: [-3.3, 51.35], region: 'atlantic', size: 1.0, shipyard: true,
    desc: '西の海に向いた港。近くの鉱山の錫を出す。', sells: { tin: 0.6, cloth: 0.85 }, wants: { wine: 1.45 } },
  dublin: { name: 'ダブリン', pos: [-6.0, 53.35], region: 'atlantic', size: 0.8,
    desc: '緑の島の港。牛の皮が安い。', sells: { hides: 0.55, linen: 0.7, wool: 0.75 }, wants: { wine: 1.4, salt: 1.3 } },
  nantes: { name: 'ナント', pos: [-2.5, 47.15], region: 'atlantic', size: 0.9,
    desc: '大河の河口。塩田が広がる。', sells: { salt: 0.6, wine: 0.75 } },
  larochelle: { name: 'ラ・ロシェル', pos: [-1.5, 46.15], region: 'atlantic', size: 0.9,
    desc: '湾の塩で名高い。北の船が塩を買いに来る。', sells: { salt: 0.55, wine: 0.7 } },
  bordeaux: { name: 'ボルドー', pos: [-1.4, 45.4], region: 'atlantic', size: 1.2,
    desc: 'ぶどう畑に囲まれた港。ワインがもっとも安い。', sells: { wine: 0.5, dye: 0.7 } },
  bilbao: { name: 'ビルバオ', pos: [-3.0, 43.6], region: 'atlantic', size: 1.0, shipyard: true,
    desc: '鉄の山を背にした港。高原の羊毛もここから出る。', sells: { iron: 0.6, wool: 0.65, arms: 0.8 } },
  porto: { name: 'ポルト', pos: [-9.0, 41.15], region: 'atlantic', size: 0.9,
    desc: '川沿いの斜面にぶどう畑が続く。', sells: { wine: 0.65, olive: 0.8 } },
  lisbon: { name: 'リスボン', pos: [-9.7, 38.7], region: 'atlantic', size: 1.3, shipyard: true,
    desc: '大西洋に開けた港町。南の海へ向かう船の出発点。', sells: { salt: 0.6, wine: 0.75, olive: 0.8 } },
  seville: { name: 'セビリア', pos: [-6.6, 36.6], region: 'atlantic', size: 1.2, shipyard: true,
    desc: '川をさかのぼった先の商都。オリーブと羊毛の集散地。', sells: { olive: 0.6, wine: 0.7, wool: 0.7, pottery: 0.75 } },

  // ===== 西地中海 =====
  malaga: { name: 'マラガ', pos: [-4.4, 36.55], region: 'wmed', size: 0.9,
    desc: '南の王国の港。輝く陶器と絹を出す。', sells: { pottery: 0.65, silk: 0.8, sugar: 0.85 } },
  valencia: { name: 'バレンシア', pos: [-0.1, 39.45], region: 'wmed', size: 1.0,
    desc: '果樹園の町。陶器の窯が並ぶ。', sells: { pottery: 0.6, sugar: 0.8, silk: 0.85 } },
  palma: { name: 'パルマ', pos: [2.65, 39.3], region: 'wmed', size: 0.8,
    desc: '島の港。近くの島の塩田から塩が届く。', sells: { salt: 0.55, olive: 0.75 } },
  barcelona: { name: 'バルセロナ', pos: [2.4, 41.25], region: 'wmed', size: 1.2, shipyard: true,
    desc: '織物と珊瑚細工の町。', sells: { cloth: 0.85, coral: 0.7 }, wants: { cotton: 1.5, spice: 1.25 } },
  marseille: { name: 'マルセイユ', pos: [5.3, 43.1], region: 'wmed', size: 1.0,
    desc: '古くからの港。ワインと塩を積み出す。', sells: { wine: 0.65, salt: 0.7, coral: 0.72 } },
  genoa: { name: 'ジェノヴァ', pos: [8.9, 44.2], region: 'wmed', size: 1.3, shipyard: true,
    desc: '山に囲まれた海洋都市。食料はいつも不足ぎみ。', sells: { arms: 0.7, olive: 0.75 }, wants: { grain: 1.4, cotton: 1.45, alum: 1.35 } },
  pisa: { name: 'ピサ', pos: [10.0, 43.6], region: 'wmed', size: 1.0,
    desc: '奥の都の織物がここから出る。原料を高く買う。', sells: { cloth: 0.75, wine: 0.8 }, wants: { wool: 1.45, dye: 1.55, alum: 1.4 } },
  naples: { name: 'ナポリ', pos: [14.0, 40.7], region: 'wmed', size: 1.2, shipyard: true,
    desc: '火山のふもとの大都市。珊瑚漁が盛ん。', sells: { wine: 0.7, olive: 0.65, coral: 0.65, alum: 0.72 } },
  palermo: { name: 'パレルモ', pos: [13.35, 38.4], region: 'wmed', size: 1.0,
    desc: '島の都。小麦の大産地。', sells: { grain: 0.55, sugar: 0.75, salt: 0.65 } },
  messina: { name: 'メッシーナ', pos: [15.4, 38.45], region: 'wmed', size: 0.8,
    desc: '海峡の町。絹糸を紡ぐ。', sells: { silk: 0.75, wine: 0.75, olive: 0.7 } },

  // ===== アドリア海 =====
  venice: { name: 'ヴェネツィア', pos: [12.6, 45.3], region: 'adri', size: 1.5, shipyard: true,
    desc: '水の都。ガラス工房と、東方から届く胡椒で栄える。', sells: { glass: 0.6, spice: 0.78, salt: 0.8 } },
  ragusa: { name: 'ラグーザ', pos: [17.9, 42.5], region: 'adri', size: 0.9, shipyard: true,
    desc: '城壁の小さな共和国。山の向こうの産物を出す。', sells: { hides: 0.65, wax: 0.7, copper: 0.8 } },
  bari: { name: 'バーリ', pos: [17.0, 41.3], region: 'adri', size: 0.8,
    desc: 'オリーブの林が続く。油がとても安い。', sells: { olive: 0.55, grain: 0.7, wine: 0.75 } },

  // ===== 東地中海 =====
  modon: { name: 'モドン', pos: [21.5, 36.7], region: 'emed', size: 0.7,
    desc: '半島の先の寄港地。東へ向かう船が水を積む。', sells: { wine: 0.7, olive: 0.7, silk: 0.82 } },
  candia: { name: 'カンディア', pos: [25.1, 35.55], region: 'emed', size: 1.0,
    desc: '大きな島の港。甘いワインで知られる。', sells: { wine: 0.55, olive: 0.7 } },
  salonica: { name: 'テッサロニキ', pos: [23.0, 40.4], region: 'emed', size: 1.0,
    desc: '湾の奥の大きな町。平野の産物が集まる。', sells: { grain: 0.7, cotton: 0.7, hides: 0.7 } },
  constantinople: { name: 'コンスタンティノープル', pos: [28.9, 40.9], region: 'emed', size: 1.6, shipyard: true,
    desc: '二つの海をつなぐ大都。宮廷がぜいたく品を買い集める。', sells: { carpet: 0.7, silk: 0.72 },
    wants: { fur: 1.6, tin: 1.5, sugar: 1.3, incense: 1.4, amber: 1.55 } },
  smyrna: { name: 'スミルナ', pos: [26.6, 38.5], region: 'emed', size: 1.0,
    desc: '隊商の終点。絨毯と綿が届く。', sells: { carpet: 0.55, cotton: 0.65, dye: 0.7 } },
  chios: { name: 'キオス', pos: [26.2, 38.2], region: 'emed', size: 0.8,
    desc: '商人の島。対岸の鉱山の明礬を一手に扱う。', sells: { alum: 0.55, wine: 0.75 } },
  rhodes: { name: 'ロードス', pos: [28.3, 36.5], region: 'emed', size: 0.8,
    desc: '騎士団の島。戦に備えて鉄と武具を欲しがる。', sells: { wine: 0.75, olive: 0.75 }, wants: { arms: 1.6, iron: 1.5, grain: 1.4 } },
  famagusta: { name: 'ファマグスタ', pos: [34.2, 35.1], region: 'emed', size: 1.0,
    desc: '東の島の港。砂糖きびと綿の畑が広がる。', sells: { sugar: 0.65, cotton: 0.6, salt: 0.6 } },

  // ===== レヴァント =====
  beirut: { name: 'ベイルート', pos: [35.3, 33.9], region: 'levant', size: 1.2,
    desc: '隊商が東方の品を運んでくる港。', sells: { spice: 0.55, silk: 0.65, dye: 0.65 } },
  jaffa: { name: 'ヤッファ', pos: [34.6, 32.05], region: 'levant', size: 0.8,
    desc: '聖地への入口。綿と香が安い。', sells: { cotton: 0.6, incense: 0.7, olive: 0.75 } },
  alexandria: { name: 'アレクサンドリア', pos: [29.8, 31.35], region: 'levant', size: 1.5,
    desc: '東方交易の玄関口。胡椒が安いが、木も金属もない。', sells: { spice: 0.5, grain: 0.6, incense: 0.65, cotton: 0.7 },
    wants: { timber: 1.85, copper: 1.6 } },

  // ===== 黒海 =====
  varna: { name: 'ヴァルナ', pos: [28.1, 43.2], region: 'black', size: 0.8,
    desc: '黒海の西岸。平原の穀物を積む。', sells: { grain: 0.6, hides: 0.65, wax: 0.7 } },
  caffa: { name: 'カッファ', pos: [35.4, 44.85], region: 'black', size: 1.2,
    desc: '草原の道の終点。北と東の品が出会う。', sells: { grain: 0.55, fur: 0.7, wax: 0.65, fish: 0.6 } },
  tana: { name: 'ターナ', pos: [38.6, 46.9], region: 'black', size: 0.8,
    desc: '大河の河口、海の行き止まり。毛皮と絹が安い。', sells: { fur: 0.55, fish: 0.55, silk: 0.7 } },
  trebizond: { name: 'トレビゾンド', pos: [39.7, 41.15], region: 'black', size: 1.0,
    desc: '山を越えて東の国の絹が届く。', sells: { silk: 0.55, carpet: 0.6, spice: 0.72 } },

  // ===== 北アフリカ =====
  tripoli: { name: 'トリポリ', pos: [13.2, 33.1], region: 'nafrica', size: 0.9,
    desc: '砂漠の縁の港。なつめやしの林が続く。', sells: { dates: 0.5, olive: 0.7 } },
  tunis: { name: 'チュニス', pos: [10.5, 36.95], region: 'nafrica', size: 1.2,
    desc: '北アフリカ一の都。珊瑚とオリーブ油を出す。', sells: { coral: 0.55, olive: 0.6, dates: 0.65, hides: 0.7 } },
  algiers: { name: 'アルジェ', pos: [3.05, 37.0], region: 'nafrica', size: 1.0,
    desc: '白い町並みの港。山の民が皮と蝋を運ぶ。', sells: { hides: 0.65, wax: 0.7, coral: 0.7 } },
  oran: { name: 'オラン', pos: [-0.65, 35.9], region: 'nafrica', size: 0.8,
    desc: '隊商路の出口。高原の羊と小麦を出す。', sells: { grain: 0.7, hides: 0.65, wool: 0.7 } },
  ceuta: { name: 'セウタ', pos: [-5.3, 36.0], region: 'nafrica', size: 0.8,
    desc: '海峡を見張る砦の町。食料を外から買う。', sells: { wax: 0.7, hides: 0.7 }, wants: { grain: 1.45, wine: 1.3 } },
  safi: { name: 'サフィ', pos: [-9.45, 32.3], region: 'nafrica', size: 0.9,
    desc: '大西洋側の港。小麦と皮と蝋を出す。南の海の噂が聞ける。', sells: { grain: 0.65, wax: 0.65, hides: 0.6 } },

  // ===== 大西洋の島々 =====
  funchal: { name: 'フンシャル', pos: [-16.9, 32.5], region: 'islands', size: 1.0,
    desc: '森の島。砂糖きび畑が斜面を埋める。', sells: { sugar: 0.5, wine: 0.7 } },
  laspalmas: { name: 'ラス・パルマス', pos: [-15.2, 28.2], region: 'islands', size: 0.9,
    desc: '南へ向かう船の最後の寄港地。船乗りの噂が集まる。', sells: { sugar: 0.55, dye: 0.6 } },
  pontadelgada: { name: 'ポンタ・デルガダ', pos: [-25.6, 37.6], region: 'islands', size: 0.8,
    desc: '大洋の真ん中の島。青い染料の草を育てる。', sells: { dye: 0.55, grain: 0.65 } },
  ribeira: { name: 'リベイラ・グランデ', pos: [-23.6, 14.8], region: 'islands', size: 0.8, hidden: true, heardAt: ['laspalmas', 'arguin'],
    desc: '乾いた島の補給地。塩と綿が安い。', sells: { salt: 0.5, cotton: 0.65, hides: 0.65 }, wants: { wine: 1.5 } },

  // ===== 西アフリカ =====
  arguin: { name: 'アルギン', pos: [-16.9, 20.6], region: 'wafrica', size: 0.7, hidden: true, heardAt: ['laspalmas', 'safi'],
    desc: '砂漠の岸の小さな商館。隊商が砂金を持ってくる。', sells: { gold: 0.75, hides: 0.65 } },
  gambia: { name: 'ガンビア河口', pos: [-16.9, 13.45], region: 'wafrica', size: 0.8, hidden: true, heardAt: ['arguin', 'ribeira'],
    desc: '大河の河口の市。上流から金と蝋が下ってくる。', sells: { gold: 0.66, wax: 0.6, hides: 0.6, ivory: 0.7 } },
  sierraleone: { name: 'シエラレオネ', pos: [-13.5, 8.5], region: 'wafrica', size: 0.8, hidden: true, heardAt: ['gambia', 'ribeira'],
    desc: '獅子の山の入り江。ギニア胡椒の海岸が始まる。', sells: { malagueta: 0.45, ivory: 0.55 } },
  elmina: { name: 'エルミナ', pos: [-1.35, 4.9], region: 'wafrica', size: 1.2, hidden: true, heardAt: ['sierraleone'],
    desc: '黄金海岸の城。砂金がもっとも多く集まる。', sells: { gold: 0.55, ivory: 0.65, malagueta: 0.7 } },
  benin: { name: 'ベニン', pos: [5.0, 5.6], region: 'wafrica', size: 1.0, hidden: true, heardAt: ['elmina'],
    desc: '森の王国の川港。象牙と胡椒を商う。', sells: { ivory: 0.5, malagueta: 0.55, cotton: 0.7 } },
  saotome: { name: 'サントメ', pos: [6.75, 0.5], region: 'wafrica', size: 0.9, hidden: true, heardAt: ['elmina', 'benin'],
    desc: '赤道の島。砂糖がどこよりも安い。', sells: { sugar: 0.42 }, wants: { grain: 1.5, wine: 1.5, gold: 1.0, ivory: 1.0, malagueta: 1.0 } },

  // ===== 中部・南アフリカ =====
  mpinda: { name: 'ムピンダ', pos: [12.1, -6.1], region: 'safrica', size: 0.9, hidden: true, heardAt: ['saotome'],
    desc: '大河コンゴの河口。奥の王国から象牙と銅が届く。', sells: { ivory: 0.42, copper: 0.65, wax: 0.6 } },
  cape: { name: '喜望峰', pos: [18.2, -33.9], region: 'safrica', size: 0.5, hidden: true, heardAt: ['mpinda'],
    desc: '大陸の南の果ての入り江。牛飼いの民が鉄と銅を欲しがる。', sells: { hides: 0.4 }, wants: { iron: 2.0, copper: 2.0 } },

  // ===== 東アフリカ =====
  sofala: { name: 'ソファラ', pos: [35.1, -20.2], region: 'eafrica', size: 0.9, hidden: true, heardAt: ['cape'],
    desc: '奥地の金山への入口。砂金と象牙が驚くほど安い。', sells: { gold: 0.4, ivory: 0.4 } },
  mozambique: { name: 'モザンビーク', pos: [40.9, -15.0], region: 'eafrica', size: 0.8, hidden: true, heardAt: ['sofala'],
    desc: '珊瑚礁の小島の町。季節風を待つ船が集まる。', sells: { ivory: 0.42, gold: 0.6 } },
  kilwa: { name: 'キルワ', pos: [39.7, -8.95], region: 'eafrica', size: 1.0, hidden: true, heardAt: ['mozambique'],
    desc: '石造りの島の都。東の海の胡椒と香がここまで届く。', sells: { spice: 0.4, incense: 0.45, ivory: 0.5 } }
};
