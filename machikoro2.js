'use strict';

const CARD_DEFS = {
  mk2_wheat: { name: '麦畑', dice: [1, 2], cost: 1, color: 'blue', category: 'agriculture', supplyDeck: 'low', copies: 5, text: '誰のターンでも、銀行から1コイン。' },
  mk2_sushi: { name: '寿司屋', dice: [1], cost: 2, color: 'red', category: 'food', supplyDeck: 'low', copies: 5, text: '他人のターン。出目を出した人から3コイン。' },
  mk2_business: { name: 'トレードセンター', dice: [6], cost: 3, color: 'purple', category: 'major', supplyDeck: 'low', copies: 3, text: '自分のターン。任意で、誰かと施設を1件ずつ交換する（このカード自身も選択可）。' },
  mk2_flowerShop: { name: 'フラワーショップ', dice: [6], cost: 1, color: 'green', category: 'combo', comboTarget: 'flower', supplyDeck: 'low', copies: 3, text: '自分のターン。自分の花マークの施設1件につき3コイン。' },
  mk2_cafe: { name: 'カフェ', dice: [3], cost: 1, color: 'red', category: 'food', supplyDeck: 'low', copies: 5, text: '他人のターン。出目を出した人から2コイン。' },
  mk2_bakery: { name: 'パン屋', dice: [2, 3], cost: 1, color: 'green', category: 'shop', supplyDeck: 'low', copies: 5, text: '自分のターン。銀行から2コイン。' },
  mk2_flower: { name: '花畑', dice: [4], cost: 2, color: 'blue', category: 'flower', supplyDeck: 'low', copies: 5, text: '誰のターンでも、銀行から2コイン。' },
  mk2_vineyard: { name: 'ブドウ園', dice: [2], cost: 1, color: 'blue', category: 'fruit', supplyDeck: 'low', copies: 5, text: '誰のターンでも、銀行から2コイン。' },
  mk2_forest: { name: '森林', dice: [5], cost: 3, color: 'blue', category: 'gear', supplyDeck: 'low', copies: 5, text: '誰のターンでも、銀行から2コイン。' },
  mk2_convenience: { name: 'コンビニ', dice: [4], cost: 1, color: 'green', category: 'shop', supplyDeck: 'low', copies: 5, text: '自分のターン。銀行から3コイン。' },

  mk2_corn: { name: 'コーン畑', dice: [7], cost: 2, color: 'blue', category: 'agriculture', supplyDeck: 'high', copies: 5, text: '誰のターンでも、銀行から3コイン。' },
  mk2_foodWarehouse: { name: '食品倉庫', dice: [10, 11], cost: 2, color: 'green', category: 'combo', comboTarget: 'food', supplyDeck: 'high', copies: 3, text: '自分のターン。自分の飲食店マークの施設1件につき2コイン。' },
  mk2_family: { name: 'ファミレス', dice: [9, 10], cost: 2, color: 'red', category: 'food', supplyDeck: 'high', copies: 5, text: '他人のターン。出目を出した人から2コイン。' },
  mk2_shoppingDistrict: { name: 'ブランドモール', dice: [8, 9], cost: 3, color: 'purple', category: 'major', supplyDeck: 'high', copies: 3, text: '自分のターン。11コイン以上持つ他の全員から、所持金の半分（端数切捨て）をもらう。' },
  mk2_hamburger: { name: 'バーガーショップ', dice: [8], cost: 1, color: 'red', category: 'food', supplyDeck: 'high', copies: 5, text: '他人のターン。出目を出した人から2コイン。' },
  mk2_furniture: { name: '家具工場', dice: [8], cost: 4, color: 'green', category: 'combo', comboTarget: 'gear', supplyDeck: 'high', copies: 3, text: '自分のターン。自分の歯車マークの施設1件につき4コイン。' },
  mk2_stadium: { name: 'スタジアム', dice: [7], cost: 3, color: 'purple', category: 'major', supplyDeck: 'high', copies: 3, text: '自分のターン。他の全員から3コインずつ。' },
  mk2_winery: { name: 'ワイナリー', dice: [9], cost: 3, color: 'green', category: 'combo', comboTarget: 'fruit', supplyDeck: 'high', copies: 3, text: '自分のターン。自分の果物マークの施設1件につき3コイン。' },
  mk2_apple: { name: 'リンゴ園', dice: [10], cost: 1, color: 'blue', category: 'fruit', supplyDeck: 'high', copies: 5, text: '誰のターンでも、銀行から3コイン。' },
  mk2_mine: { name: '鉱山', dice: [11, 12], cost: 4, color: 'blue', category: 'gear', supplyDeck: 'high', copies: 5, text: '誰のターンでも、銀行から6コイン。' }
};

const LANDMARK_DEFS = {
  mk2_lm_publisher: { name: '出版社', costs: [10, 14, 22], text: '建設時：他の全員から、その人の商店マーク1件につき1コイン。', timing: 'immediate' },
  mk2_lm_airport: { name: '空港', costs: [12, 16, 22], text: '全員：建設しないで手番を終えた人は、銀行から5コイン。', timing: 'ongoing', global: true },
  mk2_lm_museum: { name: '博物館', costs: [10, 14, 22], text: '建設時：他の全員から、その人のランドマーク1件につき3コイン。', timing: 'immediate' },
  mk2_lm_exhibitHall: { name: '展示場', costs: [12, 16, 22], text: '建設時：11コイン以上持つ他の全員から、所持金の半分（端数切捨て）をもらう。', timing: 'immediate' },
  mk2_lm_temple: { name: '神殿', costs: [12, 16, 22], text: '全員：ぞろ目を出した人は、他の全員から2コインずつ。', timing: 'ongoing', global: true },
  mk2_lm_tvStation: { name: 'テレビ局', costs: [12, 16, 22], text: '建設時：他の全員から、その人の飲食店マーク1件につき1コイン。', timing: 'immediate' },
  mk2_lm_loanOffice: { name: '貸金業', costs: [10, null, null], text: '自分だけランドマークが0件のときだけ建設可。以後、自分のランドマーク価格-2。', timing: 'ongoing', builderOnly: true },
  mk2_lm_park: { name: '公園', costs: [12, 16, 22], text: '建設時：全員のコインを集め、全員が同額になるよう銀行が補って分配する。', timing: 'immediate' },
  mk2_lm_techStartup: { name: 'ベンチャー企業', costs: [10, 14, 22], text: '全員：出目12なら、出した人は銀行から8コイン。', timing: 'ongoing', global: true },
  mk2_lm_french: { name: '高級フレンチ', costs: [10, 14, 22], text: '建設時：他の全員から2コインずつ。', timing: 'immediate' },
  mk2_lm_shoppingMall: { name: 'ショッピングモール', costs: [10, 14, 22], text: '全員：商店マーク施設の収入が1件につき+1。', timing: 'ongoing', global: true },
  mk2_lm_launchPad: { name: 'ロケット基地', costs: [45, 38, 25], text: '建設したら、ランドマーク数に関係なくただちに勝利。', timing: 'immediate' },
  mk2_lm_sodaPlant: { name: 'ドリンク工場', costs: [12, 16, 22], text: '全員：飲食店マーク施設の収入が1件につき+1。', timing: 'ongoing', global: true },
  mk2_lm_charterhouse: { name: 'チャーターハウス', costs: [12, 16, 22], text: '全員：ダイス2個を振り、どこからも収入を得なかった人は銀行から3コイン。', timing: 'ongoing', global: true },
  mk2_lm_radioTower: { name: '電波塔', costs: [12, 16, 22], text: '建設時：追加ターンを1回得る。', timing: 'immediate' },
  mk2_lm_amusementPark: { name: '遊園地', costs: [12, 16, 22], text: '全員：ぞろ目を出した人は追加ターンを1回得る。', timing: 'ongoing', global: true },
  mk2_lm_forge: { name: '鍛冶工場', costs: [12, 16, 22], text: '全員：歯車マーク施設の収入が1件につき+1。', timing: 'ongoing', global: true },
  mk2_lm_farmersMarket: { name: 'ファーマーズマーケット', costs: [10, 14, 22], text: '全員：農産物マーク施設の収入が1件につき+1。', timing: 'ongoing', global: true },
  mk2_lm_movingCompany: { name: '引っ越し屋', costs: [10, 14, 22], text: '全員：ぞろ目を出した人は、全効果解決後、自分の施設1件を右隣へ渡す。', timing: 'ongoing', global: true },
  mk2_lm_observatory: { name: '天文台', costs: [12, 16, 22], text: '全員：ロケット基地の建設価格-5。', timing: 'ongoing', global: true }
};

function shuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function count(player, cardId) {
  return Number(player?.cards?.[cardId] || 0);
}

function resetPlayer(player) {
  player.coins = 5;
  player.cards = {};
  player.closedCards = {};
  player.ventureCards = [];
  player.landmarks = [];
}

function makeDeck(row) {
  const ids = [];
  for (const [id, card] of Object.entries(CARD_DEFS)) {
    if (card.supplyDeck !== row) continue;
    for (let i = 0; i < card.copies; i++) ids.push(id);
  }
  return shuffle(ids);
}

function makeLandmarkDeck() {
  return shuffle(Object.keys(LANDMARK_DEFS));
}

function refillRow(room, row) {
  const supply = room.twoSupply?.[row];
  if (!supply) return 0;
  let drawn = 0;
  while (Object.keys(supply.market).length < 5 && supply.deck.length) {
    const id = supply.deck.shift();
    supply.market[id] = (supply.market[id] || 0) + 1;
    drawn++;
  }
  return drawn;
}

function startGame(room, helpers = {}) {
  room.players = shuffle(room.players);
  room.players.forEach(resetPlayer);
  room.twoSupply = {
    low: { deck: makeDeck('low'), market: {} },
    high: { deck: makeDeck('high'), market: {} },
    landmark: { deck: makeLandmarkDeck(), market: {} }
  };
  refillRow(room, 'low');
  refillRow(room, 'high');
  refillRow(room, 'landmark');
  room.status = 'playing';
  room.phase = 'initialBuild';
  room.currentPlayerIndex = 0;
  room.twoSetup = { round: 1 };
  room.pendingTwoChoice = null;
  room.pendingExtraTurn = false;
  room.buildSubsidyGiven = false;
  room.lastRoll = null;
  room.pendingRoll = null;
  room.rolling = null;
  room.winnerId = null;
  room.coinEvents = [];
  room.specialEvents = [];
  room.turnSummary = [];
  if (helpers.log) {
    helpers.log(room, `手番順をシャッフルしました：${room.players.map(p => p.name).join(' → ')}`);
    helpers.log(room, '街コロ通を開始しました。各プレイヤーは5コインを持ち、3周の初期建設を行います。');
  }
}

function normalizeRoom(room) {
  room.twoSupply = room.twoSupply || {
    low: { deck: [], market: {} },
    high: { deck: [], market: {} },
    landmark: { deck: [], market: {} }
  };
  for (const row of ['low', 'high', 'landmark']) {
    room.twoSupply[row] = room.twoSupply[row] || { deck: [], market: {} };
    room.twoSupply[row].deck = Array.isArray(room.twoSupply[row].deck) ? room.twoSupply[row].deck : [];
    room.twoSupply[row].market = room.twoSupply[row].market || {};
  }
  room.twoSetup = room.twoSetup || { round: 1 };
  room.pendingTwoChoice = room.pendingTwoChoice || null;
  room.players.forEach(player => {
    player.cards = player.cards || {};
    player.landmarks = Array.isArray(player.landmarks) ? player.landmarks : [];
    player.closedCards = {};
    player.ventureCards = [];
  });
  return room;
}

function publicState(room) {
  const rows = ['low', 'high', 'landmark'];
  const totalDeck = rows.reduce((n, row) => n + Number(room.twoSupply?.[row]?.deck?.length || 0), 0);
  const twoSupply = Object.fromEntries(rows.map(row => [row, {
    market: { ...(room.twoSupply?.[row]?.market || {}) },
    deckCount: Number(room.twoSupply?.[row]?.deck?.length || 0)
  }]));
  return {
    market: {},
    deckCount: totalDeck,
    twoSupply,
    twoSetup: room.twoSetup ? { ...room.twoSetup } : null,
    pendingTwoChoice: room.pendingTwoChoice ? { ...room.pendingTwoChoice } : null,
    cards: CARD_DEFS,
    landmarks: LANDMARK_DEFS
  };
}

function globalLandmark(room, id) {
  return room.players.some(p => Array.isArray(p.landmarks) && p.landmarks.includes(id));
}

function categoryCount(player, category) {
  return Object.entries(player.cards || {}).reduce((sum, [id, qty]) => sum + (CARD_DEFS[id]?.category === category ? Number(qty || 0) : 0), 0);
}

function landmarkCost(room, player, id) {
  const lm = LANDMARK_DEFS[id];
  if (!lm) return null;
  const index = player.landmarks.length;
  let base = lm.costs[index];
  if (base === null || base === undefined) return null;
  if (player.landmarks.includes('mk2_lm_loanOffice')) base -= 2;
  if (id === 'mk2_lm_launchPad' && globalLandmark(room, 'mk2_lm_observatory')) base -= 5;
  return Math.max(0, base);
}

function canBuildLoanOffice(room, player) {
  if (player.landmarks.length !== 0) return false;
  return room.players.every(other => other.id === player.id || other.landmarks.length > 0);
}

function bankIncome(room, player, amount, label, helpers, meta = {}) {
  const value = Math.max(0, Number(amount || 0));
  if (!value) return 0;
  player.coins += value;
  room.twoTurnIncome = room.twoTurnIncome || {};
  room.twoTurnIncome[player.id] = (room.twoTurnIncome[player.id] || 0) + value;
  helpers.coinEvent?.(room, player, value, 'income', label);
  const text = `${player.name}：${label}で銀行から${value}コイン。`;
  helpers.log?.(room, text);
  helpers.specialEvent?.(room, 'effect-income', player, text, { amount: value, ...meta });
  return value;
}

function payToPlayer(room, from, to, amount, label, helpers, meta = {}) {
  const paid = Math.min(Math.max(0, Number(amount || 0)), Math.max(0, Number(from.coins || 0)));
  if (!paid) return 0;
  from.coins -= paid;
  to.coins += paid;
  room.twoTurnIncome = room.twoTurnIncome || {};
  room.twoTurnIncome[to.id] = (room.twoTurnIncome[to.id] || 0) + paid;
  helpers.coinEvent?.(room, from, -paid, 'stolen', label);
  helpers.coinEvent?.(room, to, paid, 'steal', label);
  const text = `${to.name}：${label}で${from.name}から${paid}コイン。`;
  helpers.log?.(room, text);
  helpers.specialEvent?.(room, 'effect-steal', to, text, { amount: paid, targetId: from.id, ...meta });
  return paid;
}

function payToBank(room, player, amount, label, helpers) {
  const paid = Math.min(Math.max(0, Number(amount || 0)), Math.max(0, Number(player.coins || 0)));
  if (!paid) return 0;
  player.coins -= paid;
  helpers.coinEvent?.(room, player, -paid, 'payment', label);
  helpers.log?.(room, `${player.name}：${label}で銀行へ${paid}コイン。`);
  return paid;
}

function reverseOrder(room, rollerIndex) {
  const result = [];
  for (let step = 1; step < room.players.length; step++) {
    result.push((rollerIndex - step + room.players.length) % room.players.length);
  }
  return result;
}

function yieldBonus(room, card) {
  let bonus = 0;
  if (card.category === 'shop' && globalLandmark(room, 'mk2_lm_shoppingMall')) bonus++;
  if (card.category === 'food' && globalLandmark(room, 'mk2_lm_sodaPlant')) bonus++;
  if (card.category === 'gear' && globalLandmark(room, 'mk2_lm_forge')) bonus++;
  if (card.category === 'agriculture' && globalLandmark(room, 'mk2_lm_farmersMarket')) bonus++;
  return bonus;
}

function addCardIncome(room, owner, id, basePerCard, helpers) {
  const card = CARD_DEFS[id];
  const qty = count(owner, id);
  if (!qty) return;
  const amount = (basePerCard + yieldBonus(room, card)) * qty;
  bankIncome(room, owner, amount, card.name, helpers, { cardId: id });
}

function applyRed(room, rollerIndex, total, helpers) {
  const roller = room.players[rollerIndex];
  for (const idx of reverseOrder(room, rollerIndex)) {
    const owner = room.players[idx];
    for (const [id, card] of Object.entries(CARD_DEFS)) {
      if (card.color !== 'red' || !card.dice.includes(total)) continue;
      const qty = count(owner, id);
      if (!qty) continue;
      const base = id === 'mk2_sushi' ? 3 : 2;
      const perCard = base + yieldBonus(room, card);
      payToPlayer(room, roller, owner, perCard * qty, card.name, helpers, { cardId: id });
      if (roller.coins <= 0) break;
    }
  }
}

function applyBlue(room, total, helpers) {
  const bases = { mk2_wheat: 1, mk2_flower: 2, mk2_vineyard: 2, mk2_forest: 2, mk2_corn: 3, mk2_apple: 3, mk2_mine: 6 };
  for (const owner of room.players) {
    for (const [id, base] of Object.entries(bases)) {
      const card = CARD_DEFS[id];
      if (card.dice.includes(total)) addCardIncome(room, owner, id, base, helpers);
    }
  }
}

function applyGreen(room, roller, total, helpers) {
  const simple = { mk2_bakery: 2, mk2_convenience: 3 };
  for (const [id, base] of Object.entries(simple)) {
    if (CARD_DEFS[id].dice.includes(total)) addCardIncome(room, roller, id, base, helpers);
  }
  const combos = [
    ['mk2_flowerShop', 'flower', 3],
    ['mk2_foodWarehouse', 'food', 2],
    ['mk2_furniture', 'gear', 4],
    ['mk2_winery', 'fruit', 3]
  ];
  for (const [id, category, perSymbol] of combos) {
    const qty = count(roller, id);
    if (!qty || !CARD_DEFS[id].dice.includes(total)) continue;
    const amount = qty * categoryCount(roller, category) * perSymbol;
    if (amount) bankIncome(room, roller, amount, CARD_DEFS[id].name, helpers, { cardId: id });
  }
}

function applyPurpleAutomatic(room, roller, total, helpers) {
  const purpleCount = id => count(roller, id);
  if (CARD_DEFS.mk2_stadium.dice.includes(total) && purpleCount('mk2_stadium')) {
    for (const other of room.players) {
      if (other.id !== roller.id) payToPlayer(room, other, roller, 3 * purpleCount('mk2_stadium'), 'スタジアム', helpers, { cardId: 'mk2_stadium' });
    }
  }
  if (CARD_DEFS.mk2_shoppingDistrict.dice.includes(total) && purpleCount('mk2_shoppingDistrict')) {
    for (let copy = 0; copy < purpleCount('mk2_shoppingDistrict'); copy++) {
      for (const other of room.players) {
        if (other.id === roller.id || other.coins < 11) continue;
        payToPlayer(room, other, roller, Math.floor(other.coins / 2), 'ブランドモール', helpers, { cardId: 'mk2_shoppingDistrict' });
      }
    }
  }
}

function canUseBusiness(room, roller) {
  if (!Object.values(roller.cards || {}).some(n => n > 0)) return false;
  return room.players.some(p => p.id !== roller.id && Object.values(p.cards || {}).some(n => n > 0));
}

function resolveRoll(room, diceValues, helpers = {}) {
  const rollerIndex = room.currentPlayerIndex;
  const roller = room.players[rollerIndex];
  const total = diceValues.reduce((a, b) => a + b, 0);
  room.twoTurnIncome = {};
  room.turnSummary = [];
  helpers.beginTurnMoneySummary?.(room);
  room.lastRoll = { dice: [...diceValues], total, rawTotal: total, playerId: roller.id, playerName: roller.name };
  helpers.recordNormalDiceStats?.(room, room.lastRoll);
  helpers.log?.(room, `${roller.name} が ${diceValues.join(' + ')} = ${total} を出しました。`);

  applyRed(room, rollerIndex, total, helpers);
  applyBlue(room, total, helpers);
  applyGreen(room, roller, total, helpers);
  applyPurpleAutomatic(room, roller, total, helpers);

  const businessActive = CARD_DEFS.mk2_business.dice.includes(total) && count(roller, 'mk2_business') > 0 && canUseBusiness(room, roller);
  const resume = { diceValues: [...diceValues], total };
  if (businessActive) {
    room.pendingTwoChoice = { kind: 'business', playerId: roller.id, remaining: count(roller, 'mk2_business'), resume };
    room.phase = 'twoBusiness';
    helpers.log?.(room, `${roller.name} はトレードセンターの効果を使うか選びます。`);
    return;
  }
  finishLandmarkEffects(room, resume, helpers);
}

function finishLandmarkEffects(room, resume, helpers = {}) {
  const roller = room.players[room.currentPlayerIndex];
  const { diceValues, total } = resume;
  const doubles = diceValues.length === 2 && diceValues[0] === diceValues[1];

  if (globalLandmark(room, 'mk2_lm_techStartup') && total === 12) {
    bankIncome(room, roller, 8, 'ベンチャー企業', helpers, { landmarkId: 'mk2_lm_techStartup' });
  }
  if (globalLandmark(room, 'mk2_lm_temple') && doubles) {
    for (const other of room.players) {
      if (other.id !== roller.id) payToPlayer(room, other, roller, 2, '神殿', helpers, { landmarkId: 'mk2_lm_temple' });
    }
  }
  if (globalLandmark(room, 'mk2_lm_charterhouse') && diceValues.length === 2 && !(room.twoTurnIncome?.[roller.id] > 0)) {
    bankIncome(room, roller, 3, 'チャーターハウス', helpers, { landmarkId: 'mk2_lm_charterhouse' });
  }
  if (globalLandmark(room, 'mk2_lm_amusementPark') && doubles) {
    room.pendingExtraTurn = true;
    const text = `${roller.name} は遊園地効果で追加ターンを得ます。`;
    helpers.log?.(room, text);
    helpers.specialEvent?.(room, 'amusement-earned', roller, '遊園地発動', { dice: [...diceValues], total });
  }
  if (globalLandmark(room, 'mk2_lm_movingCompany') && doubles && Object.values(roller.cards || {}).some(n => n > 0)) {
    const target = room.players[(room.currentPlayerIndex - 1 + room.players.length) % room.players.length];
    room.pendingTwoChoice = { kind: 'moving', playerId: roller.id, targetId: target.id, targetName: target.name };
    room.phase = 'twoMoving';
    helpers.log?.(room, `${roller.name} は引っ越し屋の効果で、施設1件を右隣の${target.name}へ渡します。`);
    helpers.finalizeTurnMoneySummary?.(room);
    return;
  }
  enterBuild(room, helpers);
}

function enterBuild(room, helpers = {}) {
  room.pendingTwoChoice = null;
  room.phase = 'build';
  const player = room.players[room.currentPlayerIndex];
  if (player.coins === 0 && !room.buildSubsidyGiven) {
    room.buildSubsidyGiven = true;
    bankIncome(room, player, 1, '建設フェイズ補助', helpers, { reason: 'build-subsidy' });
  }
  helpers.finalizeTurnMoneySummary?.(room);
}

function finishBusiness(room, payload, helpers = {}) {
  const pending = room.pendingTwoChoice;
  const roller = room.players[room.currentPlayerIndex];
  if (!pending || pending.kind !== 'business' || pending.playerId !== roller.id) return { ok: false, message: 'トレードセンターの選択中ではありません。' };
  const target = room.players.find(p => p.id === payload.targetId && p.id !== roller.id);
  if (!target) return { ok: false, message: '交換相手を選んでください。' };
  const myCard = CARD_DEFS[payload.myCardId];
  const targetCard = CARD_DEFS[payload.targetCardId];
  if (!myCard || !targetCard || count(roller, payload.myCardId) < 1 || count(target, payload.targetCardId) < 1) return { ok: false, message: '交換する施設を選んでください。' };
  roller.cards[payload.myCardId] -= 1;
  target.cards[payload.targetCardId] -= 1;
  roller.cards[payload.targetCardId] = count(roller, payload.targetCardId) + 1;
  target.cards[payload.myCardId] = count(target, payload.myCardId) + 1;
  helpers.log?.(room, `${roller.name} はトレードセンターで、${myCard.name}を${target.name}へ渡し、${targetCard.name}を受け取りました。`);
  pending.remaining = Math.max(0, Number(pending.remaining || 1) - 1);
  if (pending.remaining > 0 && canUseBusiness(room, roller)) {
    room.pendingTwoChoice = pending;
    room.phase = 'twoBusiness';
    helpers.log?.(room, `${roller.name} は残り${pending.remaining}回、トレードセンターを使えます。`);
  } else {
    const resume = pending.resume;
    room.pendingTwoChoice = null;
    finishLandmarkEffects(room, resume, helpers);
  }
  return { ok: true };
}

function skipBusiness(room, helpers = {}) {
  const pending = room.pendingTwoChoice;
  const roller = room.players[room.currentPlayerIndex];
  if (!pending || pending.kind !== 'business' || pending.playerId !== roller.id) return { ok: false, message: 'トレードセンターの選択中ではありません。' };
  helpers.log?.(room, `${roller.name} はトレードセンターの効果を使いませんでした。`);
  const resume = pending.resume;
  room.pendingTwoChoice = null;
  finishLandmarkEffects(room, resume, helpers);
  return { ok: true };
}

function giveMovingCard(room, cardId, helpers = {}) {
  const pending = room.pendingTwoChoice;
  const roller = room.players[room.currentPlayerIndex];
  if (!pending || pending.kind !== 'moving' || pending.playerId !== roller.id) return { ok: false, message: '引っ越し屋の選択中ではありません。' };
  const card = CARD_DEFS[cardId];
  const target = room.players.find(p => p.id === pending.targetId);
  if (!card || !target || count(roller, cardId) < 1) return { ok: false, message: '渡す施設を選んでください。' };
  roller.cards[cardId] -= 1;
  target.cards[cardId] = count(target, cardId) + 1;
  helpers.log?.(room, `${roller.name} は引っ越し屋で${card.name}を右隣の${target.name}へ渡しました。`);
  room.pendingTwoChoice = null;
  enterBuild(room, helpers);
  return { ok: true };
}

function finishInitialBuildAction(room, helpers = {}) {
  room.currentPlayerIndex += 1;
  if (room.currentPlayerIndex >= room.players.length) {
    room.currentPlayerIndex = 0;
    room.twoSetup.round += 1;
  }
  if (room.twoSetup.round > 3) {
    room.phase = 'roll';
    room.twoSetup.round = 3;
    helpers.log?.(room, '初期建設が終了しました。通常手番を開始します。');
  }
}

function buildCard(room, cardId, helpers = {}) {
  const player = room.players[room.currentPlayerIndex];
  const card = CARD_DEFS[cardId];
  const phase = room.phase;
  if (!['initialBuild', 'build'].includes(phase)) return { ok: false, message: '現在は施設を建設できません。' };
  if (!card) return { ok: false, message: '施設がありません。' };
  const row = card.supplyDeck;
  const pile = room.twoSupply?.[row]?.market?.[cardId] || 0;
  if (!pile) return { ok: false, message: `${card.name}は現在の市場にありません。` };
  if (player.coins < card.cost) return { ok: false, message: 'コインが足りません。' };
  player.coins -= card.cost;
  helpers.coinEvent?.(room, player, -card.cost, 'payment', `${card.name}建設`);
  player.cards[cardId] = count(player, cardId) + 1;
  room.twoSupply[row].market[cardId] -= 1;
  if (room.twoSupply[row].market[cardId] <= 0) {
    delete room.twoSupply[row].market[cardId];
    refillRow(room, row);
  }
  helpers.log?.(room, `${player.name} が${card.name}を${card.cost}コインで建設しました。`);
  if (phase === 'initialBuild') finishInitialBuildAction(room, helpers);
  else advanceTurn(room, helpers);
  return { ok: true };
}

function immediateLandmark(room, player, id, helpers = {}) {
  if (id === 'mk2_lm_publisher') {
    for (const other of room.players) if (other.id !== player.id) payToPlayer(room, other, player, categoryCount(other, 'shop'), '出版社', helpers, { landmarkId: id });
  } else if (id === 'mk2_lm_museum') {
    for (const other of room.players) if (other.id !== player.id) payToPlayer(room, other, player, other.landmarks.length * 3, '博物館', helpers, { landmarkId: id });
  } else if (id === 'mk2_lm_exhibitHall') {
    for (const other of room.players) if (other.id !== player.id && other.coins >= 11) payToPlayer(room, other, player, Math.floor(other.coins / 2), '展示場', helpers, { landmarkId: id });
  } else if (id === 'mk2_lm_tvStation') {
    for (const other of room.players) if (other.id !== player.id) payToPlayer(room, other, player, categoryCount(other, 'food'), 'テレビ局', helpers, { landmarkId: id });
  } else if (id === 'mk2_lm_park') {
    const total = room.players.reduce((sum, p) => sum + p.coins, 0);
    const each = Math.ceil(total / room.players.length);
    for (const p of room.players) {
      const delta = each - p.coins;
      p.coins = each;
      if (delta) helpers.coinEvent?.(room, p, delta, delta > 0 ? 'income' : 'payment', '公園');
    }
    helpers.log?.(room, `${player.name} の公園：全員の所持金を${each}コインにそろえました。`);
  } else if (id === 'mk2_lm_french') {
    for (const other of room.players) if (other.id !== player.id) payToPlayer(room, other, player, 2, '高級フレンチ', helpers, { landmarkId: id });
  } else if (id === 'mk2_lm_radioTower') {
    room.pendingExtraTurn = true;
    helpers.log?.(room, `${player.name} は電波塔の建設効果で追加ターンを得ます。`);
    helpers.specialEvent?.(room, 'amusement-earned', player, '電波塔：追加ターン', { landmarkId: id });
  }
}

function buildLandmark(room, id, helpers = {}) {
  if (room.phase !== 'build') return { ok: false, message: '現在はランドマークを建設できません。' };
  const player = room.players[room.currentPlayerIndex];
  const lm = LANDMARK_DEFS[id];
  if (!lm || !(room.twoSupply?.landmark?.market?.[id] > 0)) return { ok: false, message: 'そのランドマークは市場にありません。' };
  if (id === 'mk2_lm_loanOffice' && !canBuildLoanOffice(room, player)) return { ok: false, message: '貸金業は、自分だけランドマークが0件のときだけ建設できます。' };
  const cost = landmarkCost(room, player, id);
  if (cost === null) return { ok: false, message: 'この順番では建設できません。' };
  if (player.coins < cost) return { ok: false, message: 'コインが足りません。' };
  player.coins -= cost;
  helpers.coinEvent?.(room, player, -cost, 'payment', `${lm.name}建設`);
  player.landmarks.push(id);
  room.twoSupply.landmark.market[id] -= 1;
  if (room.twoSupply.landmark.market[id] <= 0) {
    delete room.twoSupply.landmark.market[id];
    refillRow(room, 'landmark');
  }
  helpers.log?.(room, `${player.name} が${lm.name}を${cost}コインで建設しました。`);
  immediateLandmark(room, player, id, helpers);
  if (id === 'mk2_lm_launchPad' || player.landmarks.length >= 3) {
    room.status = 'finished';
    room.phase = 'finished';
    room.winnerId = player.id;
    helpers.log?.(room, `${player.name} が街コロ通に勝利しました！`);
  } else {
    advanceTurn(room, helpers);
  }
  return { ok: true };
}

function skipBuild(room, helpers = {}) {
  const player = room.players[room.currentPlayerIndex];
  if (room.phase === 'initialBuild') {
    helpers.log?.(room, `${player.name} はこの初期建設ラウンドで建設しませんでした。`);
    finishInitialBuildAction(room, helpers);
    return { ok: true };
  }
  if (room.phase !== 'build') return { ok: false, message: '現在は建設フェイズではありません。' };
  if (globalLandmark(room, 'mk2_lm_airport')) bankIncome(room, player, 5, '空港', helpers, { landmarkId: 'mk2_lm_airport' });
  helpers.log?.(room, `${player.name} は建設せずに手番を終えました。`);
  advanceTurn(room, helpers);
  return { ok: true };
}

function advanceTurn(room, helpers = {}) {
  if (room.pendingExtraTurn) {
    const player = room.players[room.currentPlayerIndex];
    room.pendingExtraTurn = false;
    helpers.specialEvent?.(room, 'amusement-start', player, '追加ターン開始');
  } else {
    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
  }
  room.phase = 'roll';
  room.buildSubsidyGiven = false;
  room.lastRoll = null;
  room.pendingRoll = null;
  room.pendingTwoChoice = null;
  room.twoTurnIncome = {};
  room.turnCoinStart = null;
  room.turnCoinEnd = null;
  room.turnSummary = [];
  room.rolling = null;
}

function forceSkip(room, helpers = {}) {
  const skipped = room.players[room.currentPlayerIndex];
  room.pendingExtraTurn = false;
  room.pendingTwoChoice = null;
  room.rolling = null;
  if (room.phase === 'initialBuild') finishInitialBuildAction(room, helpers);
  else {
    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
    room.phase = 'roll';
  }
  room.lastRoll = null;
  helpers.log?.(room, `${skipped?.name || 'プレイヤー'} の手番をホストがスキップしました。`);
}

module.exports = {
  CARD_DEFS,
  LANDMARK_DEFS,
  resetPlayer,
  startGame,
  normalizeRoom,
  publicState,
  resolveRoll,
  buildCard,
  buildLandmark,
  skipBuild,
  finishBusiness,
  skipBusiness,
  giveMovingCard,
  forceSkip,
  landmarkCost,
  canBuildLoanOffice,
  refillRow
};
