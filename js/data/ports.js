// 港の一覧。
// pos      : [経度, 緯度]（地図上の位置）
// link     : つながる海上の中継点（map.js の SEA_NODES の id）
// size     : 市場の大きさ。大きいほど値段が動きにくい
// shipyard : true なら船の購入・改造ができる
// sells    : この港で買える品（特産品）
// prices   : 品ごとの値段の倍率（1.0 が基準。低い = 安い、高い = 高く売れる）
// label    : 地図上の名前の位置 [横ずれ, 縦ずれ, 揃え]
window.DATA = window.DATA || {};

DATA.PORTS = {
  lisbon: {
    name: 'リスボン', pos: [-9.4, 38.7], link: 'offLis', size: 1.2, shipyard: true,
    desc: '大西洋に開けた港町。塩田とぶどう畑が広がる。',
    sells: ['salt', 'wine', 'olive'],
    prices: { grain: 1.15, salt: 0.6, wine: 0.75, olive: 0.8, wool: 1.0, cloth: 1.25, glass: 1.2, spice: 1.0 },
    label: [-6, -8, 'right']
  },
  seville: {
    name: 'セビリア', pos: [-6.4, 36.8], link: 'cadiz', size: 1.1, shipyard: true,
    desc: '川をさかのぼった先の商都。オリーブと羊毛の集散地。',
    sells: ['olive', 'wine', 'wool'],
    prices: { grain: 1.2, salt: 0.9, wine: 0.7, olive: 0.6, wool: 0.7, cloth: 1.2, glass: 1.25, spice: 1.05 },
    label: [4, 14, 'left']
  },
  london: {
    name: 'ロンドン', pos: [0.6, 51.5], link: 'nsea', size: 1.2, shipyard: true,
    desc: '羊毛の国の都。南の産物は何でも高く売れる。',
    sells: ['wool', 'cloth'],
    prices: { grain: 1.0, salt: 1.3, wine: 1.5, olive: 1.5, wool: 0.6, cloth: 0.85, glass: 1.4, spice: 1.4 },
    label: [-7, -6, 'right']
  },
  antwerp: {
    name: 'アントワープ', pos: [3.7, 51.5], link: 'nsea', size: 1.4, shipyard: true,
    desc: '北の大市場。織物工房が並び、穀物が集まる。',
    sells: ['cloth', 'grain'],
    prices: { grain: 0.8, salt: 1.4, wine: 1.4, olive: 1.4, wool: 1.3, cloth: 0.65, glass: 1.3, spice: 1.35 },
    label: [7, -6, 'left']
  },
  marseille: {
    name: 'マルセイユ', pos: [5.4, 43.25], link: 'lion', size: 1.0, shipyard: false,
    desc: '古くからの港。ワインと塩を積み出す。',
    sells: ['wine', 'salt'],
    prices: { grain: 1.2, salt: 0.7, wine: 0.65, olive: 0.95, wool: 1.15, cloth: 1.15, glass: 1.1, spice: 1.1 },
    label: [-6, -8, 'right']
  },
  genoa: {
    name: 'ジェノヴァ', pos: [8.9, 44.35], link: 'lig', size: 1.2, shipyard: true,
    desc: '山に囲まれた海洋都市。食料はいつも不足ぎみ。',
    sells: ['olive', 'wine'],
    prices: { grain: 1.35, salt: 1.2, wine: 0.85, olive: 0.7, wool: 1.3, cloth: 1.1, glass: 1.0, spice: 0.95 },
    label: [0, -10, 'center']
  },
  venice: {
    name: 'ヴェネツィア', pos: [12.4, 45.35], link: 'nadr', size: 1.4, shipyard: true,
    desc: '水の都。ガラス工房と、東方から届く香辛料で栄える。',
    sells: ['glass', 'spice', 'salt'],
    prices: { grain: 1.3, salt: 0.8, wine: 1.0, olive: 1.1, wool: 1.35, cloth: 1.25, glass: 0.6, spice: 0.75 },
    label: [8, -6, 'left']
  },
  alexandria: {
    name: 'アレクサンドリア', pos: [29.9, 31.25], link: 'alexN', size: 1.5, shipyard: false,
    desc: '東方交易の玄関口。香辛料が安いが、道のりは遠い。',
    sells: ['spice', 'grain'],
    prices: { grain: 0.6, salt: 1.0, wine: 1.2, olive: 1.25, wool: 1.2, cloth: 1.5, glass: 1.4, spice: 0.5 },
    label: [-4, -10, 'right']
  }
};
