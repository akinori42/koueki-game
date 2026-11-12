// 時代・船・帆装・改造の一覧。
// 新しい時代を足す : ERAS に1行足す（year になると解放される）
// 新しい船を足す   : SHIPS に1つ足して era に時代の id を書く
window.DATA = window.DATA || {};

DATA.ERAS = [
  { id: 1, year: 1450, name: '沿岸交易の時代', desc: '小型船で岸づたいに港を結ぶ。' },
  { id: 2, year: 1500, name: '外洋航海の時代', desc: '大型のキャラックが登場し、一度に運べる荷が大きく増える。' }
  // 例）{ id: 3, year: 1560, name: 'ガレオンの時代', desc: '...' },
];

// 帆装。wind は風向きごとの速度倍率（tail=追い風 / side=横風 / head=向かい風）
DATA.SAILS = {
  square: { name: '横帆',   desc: '追い風に強く、向かい風に弱い', wind: { tail: 1.25, side: 1.0, head: 0.6 } },
  lateen: { name: '三角帆', desc: 'どの風でも安定して進む',       wind: { tail: 1.05, side: 1.0, head: 0.9 } }
};

// 改造。perLevel は1段階ごとに掛かる倍率（speed / hold / minCrew が使える）
// costRate は船の値段に対する1段階の費用の割合
DATA.UPGRADES = {
  sail: { name: '帆の増設',   desc: '速度+8%、必要船員+10%', maxLevel: 2, costRate: 0.12, perLevel: { speed: 1.08, minCrew: 1.10 } },
  hold: { name: '船倉の拡張', desc: '積載+15%、速度−4%',     maxLevel: 2, costRate: 0.15, perLevel: { hold: 1.15, speed: 0.96 } }
};

// 船。
// speed   : 速さ（1 につき1日 約12海里）
// hold    : 船倉（貨物・食料・大砲が共用する）
// minCrew : これより少ないと速度が落ちる
// tough   : 頑丈さ（大きいほど嵐や砲撃で傷みにくい）
// sail    : 最初の帆装（SAILS の id）
// oars    : true なら櫂つき（風の影響が半分、凪で止まらない）
DATA.SHIPS = {
  barca: {
    name: 'バルシャ', era: 1, price: 800, speed: 4.0, hold: 40,
    minCrew: 6, maxCrew: 15, maxGuns: 4, tough: 1.0, sail: 'lateen',
    desc: '沿岸用の小舟。安いが荷は少ない。'
  },
  cog: {
    name: 'コグ', era: 1, price: 2600, speed: 3.6, hold: 95,
    minCrew: 12, maxCrew: 25, maxGuns: 6, tough: 1.3, sail: 'square',
    desc: '北海生まれのずんぐりした商船。遅いがよく積める。'
  },
  caravel: {
    name: 'キャラベル', era: 1, price: 3800, speed: 5.8, hold: 60,
    minCrew: 12, maxCrew: 30, maxGuns: 8, tough: 1.2, sail: 'lateen',
    desc: '軽快な三角帆の船。逆風に強く、海賊から逃げやすい。'
  },
  galley: {
    name: 'ガレー', era: 1, price: 4500, speed: 5.4, hold: 55,
    minCrew: 30, maxCrew: 70, maxGuns: 6, tough: 1.1, sail: 'lateen', oars: true,
    desc: '櫂で進む地中海の船。風に左右されないが、船員が多く食料を食う。'
  },
  carrack: {
    name: 'キャラック', era: 2, price: 12000, speed: 4.6, hold: 190,
    minCrew: 35, maxCrew: 80, maxGuns: 16, tough: 2.0, sail: 'square',
    desc: '外洋向けの大型帆船。積載も頑丈さも段違い。'
  },
  caravelR: {
    name: '横帆キャラベル', era: 2, price: 6500, speed: 6.4, hold: 85,
    minCrew: 16, maxCrew: 40, maxGuns: 10, tough: 1.4, sail: 'square',
    desc: '横帆を張った改良型キャラベル。追い風ならとにかく速い。'
  },
  galleass: {
    name: 'ガレアス', era: 2, price: 16000, speed: 5.0, hold: 130,
    minCrew: 60, maxCrew: 140, maxGuns: 24, tough: 2.2, sail: 'lateen', oars: true,
    desc: '櫂と帆と大砲を備えた大型船。海賊を返り討ちにできる。'
  }
};
