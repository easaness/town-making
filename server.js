const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const machikoro2 = require('./machikoro2');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const BASE_CARD_DEFS = {
  wheat: { name: '麦畑', dice: [1], cost: 1, color: 'blue', kind: 'grain', industry: 'grain' },
  ranch: { name: '牧場', dice: [2], cost: 1, color: 'blue', kind: 'cow', industry: 'cow' },
  bakery: { name: 'パン屋', dice: [2, 3], cost: 1, color: 'green', kind: 'shop', industry: 'shop' },
  cafe: { name: 'カフェ', dice: [3], cost: 2, color: 'red', kind: 'restaurant', industry: 'restaurant' },
  convenience: { name: 'コンビニ', dice: [4], cost: 2, color: 'green', kind: 'shop', industry: 'shop' },
  forest: { name: '森林', dice: [5], cost: 3, color: 'blue', kind: 'gear', industry: 'resource' },
  stadium: { name: 'スタジアム', dice: [6], cost: 6, color: 'purple', kind: 'major', industry: 'major' },
  tv: { name: 'テレビ局', dice: [6], cost: 6, color: 'purple', kind: 'major', industry: 'major' },
  business: { name: 'ビジネスセンター', dice: [6], cost: 6, color: 'purple', kind: 'major', industry: 'major' },
  cheese: { name: 'チーズ工場', dice: [7], cost: 5, color: 'green', kind: 'factory', industry: 'factory' },
  furniture: { name: '家具工場', dice: [8], cost: 3, color: 'green', kind: 'factory', industry: 'factory' },
  mine: { name: '鉱山', dice: [9], cost: 6, color: 'blue', kind: 'gear', industry: 'resource' },
  family: { name: 'ファミレス', dice: [9, 10], cost: 3, color: 'red', kind: 'restaurant', industry: 'restaurant' },
  apple: { name: 'リンゴ園', dice: [10], cost: 3, color: 'blue', kind: 'grain', industry: 'grain' },
  market: { name: '青果市場', dice: [11, 12], cost: 2, color: 'green', kind: 'market', industry: 'market' }
};

const PLUS_CARD_DEFS = {
  sushi: { name: '寿司屋', dice: [1], cost: 1, color: 'red', kind: 'restaurant', industry: 'restaurant', plusOnly: true },
  flower: { name: '花畑', dice: [4], cost: 2, color: 'blue', kind: 'grain', industry: 'grain', plusOnly: true },
  flowerShop: { name: 'フラワーショップ', dice: [6], cost: 1, color: 'green', kind: 'shop', industry: 'shop', plusOnly: true },
  pizza: { name: 'ピザ屋', dice: [7], cost: 1, color: 'red', kind: 'restaurant', industry: 'restaurant', plusOnly: true },
  burger: { name: 'バーガーショップ', dice: [8], cost: 1, color: 'red', kind: 'restaurant', industry: 'restaurant', plusOnly: true },
  sauryBoat: { name: 'サンマ漁船', dice: [8], cost: 2, color: 'blue', kind: 'fish', industry: 'fish', plusOnly: true },
  foodWarehouse: { name: '食品倉庫', dice: [12, 13], cost: 2, color: 'green', kind: 'factory', industry: 'factory', plusOnly: true },
  tunaBoat: { name: 'マグロ漁船', dice: [12, 13, 14], cost: 5, color: 'blue', kind: 'fish', industry: 'fish', plusOnly: true },
  publisher: { name: '出版社', dice: [7], cost: 5, color: 'purple', kind: 'major', industry: 'major', plusOnly: true },
  taxOffice: { name: '税務署', dice: [8, 9], cost: 4, color: 'purple', kind: 'major', industry: 'major', plusOnly: true }
};

const SHARP_CARD_DEFS = {
  generalStore: { name: '雑貨屋', dice: [2], cost: 0, color: 'green', kind: 'shop', industry: 'shop', sharpOnly: true },
  corn: { name: 'コーン畑', dice: [3, 4], cost: 2, color: 'blue', kind: 'grain', industry: 'grain', sharpOnly: true },
  renovation: { name: '改装屋', dice: [4], cost: 2, color: 'green', kind: 'shop', industry: 'shop', sharpOnly: true, needsChoice: true },
  french: { name: '高級フレンチ', dice: [5], cost: 3, color: 'red', kind: 'restaurant', industry: 'restaurant', sharpOnly: true },
  loan: { name: '貸金業', dice: [5, 6], cost: 0, color: 'green', kind: 'finance', industry: 'finance', sharpOnly: true },
  grape: { name: 'ブドウ園', dice: [7], cost: 3, color: 'blue', kind: 'grain', industry: 'grain', sharpOnly: true },
  cleaning: { name: '清掃業', dice: [8], cost: 4, color: 'green', kind: 'service', industry: 'service', sharpOnly: true, needsChoice: true },
  winery: { name: 'ワイナリー', dice: [9], cost: 3, color: 'green', kind: 'factory', industry: 'factory', sharpOnly: true },
  moving: { name: '引っ越し屋', dice: [9, 10], cost: 2, color: 'green', kind: 'service', industry: 'service', sharpOnly: true, needsChoice: true },
  venture: { name: 'ベンチャー企業', dice: [10], cost: 1, color: 'green', kind: 'tech', industry: 'tech', sharpOnly: true, instanceManaged: true },
  drinkFactory: { name: 'ドリンク工場', dice: [11], cost: 5, color: 'green', kind: 'factory', industry: 'factory', sharpOnly: true },
  park: { name: '公園', dice: [11, 12, 13], cost: 3, color: 'green', kind: 'service', industry: 'service', sharpOnly: true },
  memberBar: { name: '会員制BAR', dice: [12, 13, 14], cost: 4, color: 'red', kind: 'restaurant', industry: 'restaurant', sharpOnly: true }
};

const CARD_DEFS = { ...BASE_CARD_DEFS, ...PLUS_CARD_DEFS, ...SHARP_CARD_DEFS };

const BASE_LANDMARKS = {
  station: { name: '駅', cost: 4, text: 'ダイスを2個振れる' },
  mall: { name: 'ショッピングモール', cost: 10, text: '商店・飲食店収入+1' },
  amusement: { name: '遊園地', cost: 16, text: 'ぞろ目なら追加ターン' },
  tower: { name: '電波塔', cost: 22, text: '毎ターン1回だけ振り直せる' }
};

const PLUS_LANDMARKS = {
  port: { name: '港', cost: 2, text: 'ダイス合計10以上なら+2できる。漁船・寿司屋も有効化' },
  airport: { name: '空港', cost: 30, text: '建設せずに手番を終えると10コインもらう' }
};

const OFFICE_DISPLAY = {
  office: { name: '役所', cost: 0, text: '施設購入前に所持金0なら1コインもらう。常時有効', displayOnly: true }
};

const LANDMARKS = { ...BASE_LANDMARKS, ...PLUS_LANDMARKS };

const DECK_MODE_LABELS = { base: '街コロ', plus: '街コロ＋', sharp: '街コロ#', all: '全部入り', two: '街コロ通' };

function normalizeDeckMode(mode) {
  return ['base', 'plus', 'sharp', 'all', 'two'].includes(mode) ? mode : 'base';
}

function deckModeLabel(mode) {
  return DECK_MODE_LABELS[normalizeDeckMode(mode)];
}

function isTwoMode(roomOrMode) {
  return normalizeDeckMode(typeof roomOrMode === 'string' ? roomOrMode : roomOrMode?.deckMode) === 'two';
}

function isPlusMode(roomOrMode) {
  const mode = normalizeDeckMode(typeof roomOrMode === 'string' ? roomOrMode : roomOrMode?.deckMode);
  return mode === 'plus' || mode === 'all';
}

function isSharpMode(roomOrMode) {
  const mode = normalizeDeckMode(typeof roomOrMode === 'string' ? roomOrMode : roomOrMode?.deckMode);
  return mode === 'sharp' || mode === 'all';
}

function getCardDefs(roomOrMode) {
  const mode = normalizeDeckMode(typeof roomOrMode === 'string' ? roomOrMode : roomOrMode?.deckMode);
  return {
    ...BASE_CARD_DEFS,
    ...(mode === 'plus' || mode === 'all' ? PLUS_CARD_DEFS : {}),
    ...(mode === 'sharp' || mode === 'all' ? SHARP_CARD_DEFS : {})
  };
}

function getLandmarkDefs(roomOrMode, includeDisplay = true) {
  if (!isPlusMode(roomOrMode)) return BASE_LANDMARKS;
  return includeDisplay ? { ...OFFICE_DISPLAY, ...BASE_LANDMARKS, ...PLUS_LANDMARKS } : { ...BASE_LANDMARKS, ...PLUS_LANDMARKS };
}

function initialLandmarks(deckMode = 'base') {
  return Object.fromEntries(Object.keys(getLandmarkDefs(deckMode, false)).map(id => [id, false]));
}

function createDiceStats() {
  const normalCounts = {};
  for (let i = 1; i <= 12; i++) normalCounts[i] = 0;
  const tunaCounts = {};
  for (let i = 2; i <= 12; i++) tunaCounts[i] = 0;
  return {
    normal: {
      totalRolls: 0,
      oneDie: 0,
      twoDice: 0,
      counts: normalCounts,
      byPlayer: {}
    },
    tuna: {
      totalRolls: 0,
      counts: tunaCounts,
      byRoller: {}
    }
  };
}

function normalizeDiceStats(stats) {
  const base = createDiceStats();
  if (!stats || typeof stats !== 'object') return base;
  const normal = stats.normal || {};
  const tuna = stats.tuna || {};
  base.normal.totalRolls = Number(normal.totalRolls || 0);
  base.normal.oneDie = Number(normal.oneDie || 0);
  base.normal.twoDice = Number(normal.twoDice || 0);
  base.normal.byPlayer = normal.byPlayer && typeof normal.byPlayer === 'object' ? normal.byPlayer : {};
  for (const key of Object.keys(base.normal.counts)) {
    base.normal.counts[key] = Number(normal.counts?.[key] || 0);
  }
  base.tuna.totalRolls = Number(tuna.totalRolls || 0);
  base.tuna.byRoller = tuna.byRoller && typeof tuna.byRoller === 'object' ? tuna.byRoller : {};
  for (const key of Object.keys(base.tuna.counts)) {
    base.tuna.counts[key] = Number(tuna.counts?.[key] || 0);
  }
  return base;
}

function recordNormalDiceStats(room, roll) {
  if (!room || !roll?.dice?.length) return;
  room.diceStats = normalizeDiceStats(room.diceStats);
  const stats = room.diceStats.normal;
  const total = Number(roll.rawTotal || roll.dice.reduce((a, b) => a + b, 0));
  stats.totalRolls += 1;
  if (roll.dice.length === 1) stats.oneDie += 1;
  if (roll.dice.length === 2) stats.twoDice += 1;
  if (stats.counts[total] === undefined) stats.counts[total] = 0;
  stats.counts[total] += 1;
  const id = roll.playerId || 'unknown';
  const name = roll.playerName || 'プレイヤー';
  const entry = stats.byPlayer[id] || { name, count: 0 };
  entry.name = name;
  entry.count += 1;
  stats.byPlayer[id] = entry;
}

function recordTunaDiceStats(room, roll) {
  if (!room || !roll?.dice?.length) return;
  room.diceStats = normalizeDiceStats(room.diceStats);
  const stats = room.diceStats.tuna;
  const total = Number(roll.rawTotal || roll.total || roll.dice.reduce((a, b) => a + b, 0));
  stats.totalRolls += 1;
  if (stats.counts[total] === undefined) stats.counts[total] = 0;
  stats.counts[total] += 1;
  const id = roll.playerId || 'unknown';
  const name = roll.playerName || 'プレイヤー';
  const entry = stats.byRoller[id] || { name, count: 0 };
  entry.name = name;
  entry.count += 1;
  stats.byRoller[id] = entry;
}


const rooms = new Map();

const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/var/data') ? '/var/data' : path.join(__dirname, 'data'));
const SNAPSHOT_FILE = path.join(DATA_DIR, 'rooms.json');
let saveTimer = null;

function normalizeLoadedRoom(room) {
  if (!room || !room.code || !Array.isArray(room.players)) return null;
  room.players.forEach((player) => {
    player.socketId = null;
    player.connected = false;
  });
  room.rolling = null;
  room.pendingTuna = null;
  room.tunaRollResult = null;
  room.deckMode = normalizeDeckMode(room.deckMode);
  room.logs = Array.isArray(room.logs) ? room.logs : [];
  room.players.forEach((player) => {
    player.cards = player.cards || {};
    player.closedCards = player.closedCards || {};
    player.ventureCards = Array.isArray(player.ventureCards) ? player.ventureCards : [];
    if (count(player, 'venture') > player.ventureCards.length) {
      for (let i = player.ventureCards.length; i < count(player, 'venture'); i++) {
        player.ventureCards.push({ id: randomUUID(), tokens: 0, closed: false });
      }
    }
    if (!isTwoMode(room)) player.landmarks = { ...initialLandmarks(room.deckMode), ...(player.landmarks || {}) };
  });
  room.coinEvents = Array.isArray(room.coinEvents) ? room.coinEvents : [];
  room.specialEvents = Array.isArray(room.specialEvents) ? room.specialEvents : [];
  room.turnSummary = Array.isArray(room.turnSummary) ? room.turnSummary : [];
  room.turnCoinStart = room.turnCoinStart || null;
  room.turnCoinEnd = room.turnCoinEnd || null;
  room.diceStats = normalizeDiceStats(room.diceStats);
  room.deck = Array.isArray(room.deck) ? room.deck : [];
  room.market = room.market || {};
  room.eventSeq = Number(room.eventSeq || 0);
  room.spectators = Array.isArray(room.spectators) ? room.spectators.map(sp => ({ ...sp, socketId: null, connected: false })) : [];
  if (isTwoMode(room)) machikoro2.normalizeRoom(room);
  room.lastUpdatedAt = room.lastUpdatedAt || Date.now();
  return room;
}

function loadRoomsFromDisk() {
  try {
    if (!fs.existsSync(SNAPSHOT_FILE)) return;
    const raw = fs.readFileSync(SNAPSHOT_FILE, 'utf8');
    const saved = JSON.parse(raw);
    const list = Array.isArray(saved?.rooms) ? saved.rooms : [];
    for (const item of list) {
      const room = normalizeLoadedRoom(item);
      if (room) rooms.set(room.code, room);
    }
    console.log(`Loaded ${rooms.size} room(s) from ${SNAPSHOT_FILE}`);
  } catch (err) {
    console.error('Could not load room snapshot:', err.message);
  }
}

function roomSnapshot(room) {
  return {
    ...room,
    players: room.players.map(player => ({ ...player, socketId: null, connected: false })),
    rolling: null
  };
}

function saveRoomsNow() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${SNAPSHOT_FILE}.tmp`;
    const payload = {
      savedAt: new Date().toISOString(),
      rooms: Array.from(rooms.values()).map(roomSnapshot)
    };
    fs.writeFileSync(tmp, JSON.stringify(payload));
    fs.renameSync(tmp, SNAPSHOT_FILE);
  } catch (err) {
    console.error('Could not save room snapshot:', err.message);
  }
}

function scheduleSaveRooms() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveRoomsNow, 150);
}


function roomCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function makeDeck(deckMode = 'base') {
  const deck = [];
  for (const [id, card] of Object.entries(getCardDefs(deckMode))) {
    const copies = card.color === 'purple' ? 4 : 6;
    for (let i = 0; i < copies; i++) deck.push(id);
  }
  return shuffle(deck);
}

function shuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function marketSize(room) {
  return Object.keys(room.market || {}).length;
}

function fillMarket(room) {
  if (!room.market) room.market = {};
  let drawn = 0;
  while (marketSize(room) < 10 && room.deck.length > 0) {
    const cardId = room.deck.shift();
    room.market[cardId] = (room.market[cardId] || 0) + 1;
    drawn++;
  }
  return drawn;
}

function makePlayer(playerId, name, socketId, deckMode = 'base') {
  const player = {
    id: playerId,
    socketId,
    name: (name || 'ゲスト').slice(0, 18),
    coins: 3,
    cards: { wheat: 1, bakery: 1 },
    closedCards: {},
    ventureCards: [],
    landmarks: initialLandmarks(deckMode),
    connected: true
  };
  if (isTwoMode(deckMode)) machikoro2.resetPlayer(player);
  return player;
}


function resetPlayerForNewGame(player, deckMode = 'base') {
  if (isTwoMode(deckMode)) { machikoro2.resetPlayer(player); return; }
  player.coins = 3;
  player.cards = { wheat: 1, bakery: 1 };
  player.closedCards = {};
  player.ventureCards = [];
  player.landmarks = initialLandmarks(deckMode);
}

function resetRoomToWaiting(room) {
  room.players.forEach(player => resetPlayerForNewGame(player, room.deckMode));
  room.status = 'waiting';
  room.currentPlayerIndex = 0;
  room.deck = [];
  room.market = {};
  room.phase = 'waiting';
  room.lastRoll = null;
  room.canReroll = true;
  room.pendingExtraTurn = false;
  room.pendingPurple = null;
  room.pendingSharp = null;
  room.pendingPurpleQueue = null;
  room.pendingVentureInvest = null;
  room.pendingRoll = null;
  room.pendingTuna = null;
  room.tunaRollResult = null;
  room.rolling = null;
  room.winnerId = null;
  room.coinEvents = [];
  room.specialEvents = [];
  room.turnSummary = [];
  room.turnCoinStart = null;
  room.turnCoinEnd = null;
  room.diceStats = createDiceStats();
  room.twoSupply = null;
  room.twoSetup = null;
  room.pendingTwoChoice = null;
  room.twoTurnIncome = {};
}


function publicRoom(room) {
  const twoPublic = isTwoMode(room) ? machikoro2.publicState(room) : null;
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    spectators: room.spectators || [],
    spectatorCount: (room.spectators || []).filter(sp => sp.connected).length,
    deckMode: room.deckMode || 'base',
    players: room.players.map(({ socketId, ...player }) => player),
    currentPlayerIndex: room.currentPlayerIndex,
    market: twoPublic?.market ?? room.market,
    deckCount: twoPublic?.deckCount ?? (room.deck?.length || 0),
    twoSupply: twoPublic?.twoSupply || null,
    twoSetup: twoPublic?.twoSetup || null,
    pendingTwoChoice: twoPublic?.pendingTwoChoice || null,
    phase: room.phase,
    lastRoll: room.lastRoll,
    pendingRoll: room.pendingRoll,
    pendingTuna: room.pendingTuna || null,
    tunaRollResult: room.tunaRollResult || null,
    rolling: room.rolling,
    canReroll: room.canReroll,
    pendingExtraTurn: room.pendingExtraTurn,
    pendingPurple: room.pendingPurple || null,
    pendingSharp: room.pendingSharp || null,
    pendingVentureInvest: room.pendingVentureInvest || null,
    winnerId: room.winnerId,
    logs: room.logs.slice(-60),
    coinEvents: (room.coinEvents || []).slice(-30),
    specialEvents: (room.specialEvents || []).slice(-20),
    turnSummary: (room.turnSummary || []).slice(-30),
    turnCoinStart: room.turnCoinStart || null,
    turnCoinEnd: room.turnCoinEnd || null,
    diceStats: normalizeDiceStats(room.diceStats),
    cards: twoPublic?.cards || getCardDefs(room),
    landmarks: twoPublic?.landmarks || getLandmarkDefs(room, true),
    lastUpdatedAt: room.lastUpdatedAt || Date.now()
  };
}

function emitRoom(room) {
  room.lastUpdatedAt = Date.now();
  scheduleSaveRooms();
  io.to(room.code).emit('state', publicRoom(room));
  const host = room.players.find(p => p.id === room.hostId && p.connected && p.socketId);
  if (host) io.to(host.socketId).emit('roomBackup', roomSnapshot(room));
}

function log(room, text) {
  room.logs.push({ at: new Date().toISOString(), text });
}

function specialEvent(room, type, player, label, extra = {}) {
  if (!room.specialEvents) room.specialEvents = [];
  if (!room.turnSummary) room.turnSummary = [];
  room.eventSeq = (room.eventSeq || 0) + 1;
  const ev = {
    id: room.eventSeq,
    ts: Date.now(),
    type,
    playerId: player?.id || null,
    playerName: player?.name || '',
    label,
    ...extra
  };
  room.specialEvents.push(ev);
  room.specialEvents = room.specialEvents.slice(-40);

  // 「このターンに起こった処理」用。市場補充・ホスト操作などの周辺通知は除外し、
  // 収入・支払い・奪取・遊園地・補助金など、ターン結果として見たいものだけ残す。
  const summaryTypes = ['effect-income', 'effect-steal', 'amusement-earned', 'amusement-start'];
  if (summaryTypes.includes(type)) {
    room.turnSummary.push(ev);
    room.turnSummary = room.turnSummary.slice(-30);
  }
}


function snapshotCoins(room) {
  return Object.fromEntries((room.players || []).map(p => [p.id, Number(p.coins || 0)]));
}

function beginTurnMoneySummary(room) {
  room.turnCoinStart = snapshotCoins(room);
  room.turnCoinEnd = null;
}

function finalizeTurnMoneySummary(room) {
  if (!room.turnCoinStart) room.turnCoinStart = snapshotCoins(room);
  room.turnCoinEnd = snapshotCoins(room);
}

function twoHelpers() {
  return { log, specialEvent, coinEvent, beginTurnMoneySummary, finalizeTurnMoneySummary, recordNormalDiceStats };
}

function coinEvent(room, player, amount, type, label) {
  if (!room.coinEvents) room.coinEvents = [];
  room.eventSeq = (room.eventSeq || 0) + 1;
  room.coinEvents.push({
    id: room.eventSeq,
    playerId: player.id,
    amount,
    type,
    label
  });
  room.coinEvents = room.coinEvents.slice(-40);
}

function bankIncome(room, player, amount, label) {
  gain(player, amount);
  coinEvent(room, player, amount, 'income', label || '収入');
}

function stealCoins(room, from, to, amount, label) {
  const paid = takeCoins(from, to, amount);
  if (paid > 0) {
    coinEvent(room, from, -paid, 'stolen', label || '支払い');
    coinEvent(room, to, paid, 'steal', label || '奪取');
  }
  return paid;
}

function getCurrentPlayer(room) {
  return room.players[room.currentPlayerIndex];
}

function count(player, cardId) {
  return player?.cards?.[cardId] || 0;
}

function closedCount(player, cardId) {
  return player?.closedCards?.[cardId] || 0;
}

function activeCount(player, cardId) {
  if (cardId === 'venture') return (player?.ventureCards || []).filter(v => !v.closed).length;
  return Math.max(0, count(player, cardId) - closedCount(player, cardId));
}

function setClosedCount(player, cardId, n) {
  if (!player.closedCards) player.closedCards = {};
  const total = count(player, cardId);
  const next = Math.max(0, Math.min(total, Number(n || 0)));
  if (next > 0) player.closedCards[cardId] = next;
  else delete player.closedCards[cardId];
}

function closeCards(player, cardId, n = 1) {
  if (cardId === 'venture') {
    let closed = 0;
    for (const v of player.ventureCards || []) {
      if (closed >= n) break;
      if (!v.closed) { v.closed = true; closed++; }
    }
    syncVentureClosedCount(player);
    return closed;
  }
  const closable = Math.min(activeCount(player, cardId), n);
  setClosedCount(player, cardId, closedCount(player, cardId) + closable);
  return closable;
}

function syncVentureClosedCount(player) {
  const n = (player.ventureCards || []).filter(v => v.closed).length;
  setClosedCount(player, 'venture', n);
}

function completedLandmarkCount(player) {
  return Object.values(player?.landmarks || {}).filter(Boolean).length;
}

function isMajorCard(cardId) {
  return CARD_DEFS[cardId]?.color === 'purple' || CARD_DEFS[cardId]?.kind === 'major';
}

function has(player, landmarkId) {
  return !!player.landmarks[landmarkId];
}

function takeCoins(from, to, amount) {
  const paid = Math.min(from.coins, amount);
  from.coins -= paid;
  to.coins += paid;
  return paid;
}

function gain(player, amount) {
  player.coins += amount;
}

function applyMallBonus(player, cardId, base) {
  const card = CARD_DEFS[cardId];
  if (!has(player, 'mall')) return base;
  if (card.industry === 'shop' || card.industry === 'restaurant') return base + 1;
  return base;
}

function countByIndustry(player, industry) {
  return Object.entries(player.cards || {}).reduce((sum, [cardId, n]) => {
    const card = CARD_DEFS[cardId];
    return sum + (card?.industry === industry ? activeCount(player, cardId) : 0);
  }, 0);
}

function countRestaurantAndShop(player, industry = null) {
  return Object.entries(player.cards || {}).reduce((sum, [cardId, n]) => {
    const card = CARD_DEFS[cardId];
    if (!card) return sum;
    if (industry) return sum + (card.industry === industry ? activeCount(player, cardId) : 0);
    return sum + (card.industry === 'restaurant' || card.industry === 'shop' ? activeCount(player, cardId) : 0);
  }, 0);
}

function reverseOrderFrom(room, rollerIndex) {
  const order = [];
  const n = room.players.length;
  for (let step = 1; step < n; step++) {
    order.push((rollerIndex - step + n) % n);
  }
  return order;
}


function reopenClosedCardsForTotal(room, total) {
  const reopened = {};
  if (!isSharpMode(room)) return reopened;
  for (const player of room.players || []) {
    for (const [cardId, card] of Object.entries(getCardDefs(room))) {
      if (!card?.dice?.includes(total)) continue;
      const key = `${player.id}:${cardId}`;
      if (cardId === 'venture') {
        const targets = (player.ventureCards || []).filter(v => v.closed);
        if (targets.length) {
          targets.forEach(v => { v.closed = false; });
          syncVentureClosedCount(player);
          reopened[key] = targets.length;
          const text = `${player.name} の${card.name} ${targets.length}枚が休業から復帰しました。（この出目では効果なし）`;
          log(room, text);
          specialEvent(room, 'sharp-reopen', player, text, { cardId, count: targets.length });
        }
        continue;
      }
      const c = closedCount(player, cardId);
      if (c > 0) {
        setClosedCount(player, cardId, 0);
        reopened[key] = c;
        const text = `${player.name} の${card.name} ${c}枚が休業から復帰しました。（この出目では効果なし）`;
        log(room, text);
        specialEvent(room, 'sharp-reopen', player, text, { cardId, count: c });
      }
    }
  }
  return reopened;
}

function effectCount(room, player, cardId) {
  const reopened = room.reopenedThisRoll?.[`${player.id}:${cardId}`] || 0;
  return Math.max(0, activeCount(player, cardId) - reopened);
}

function spendToBank(room, player, amount, label) {
  const paid = Math.min(player.coins, amount);
  if (paid > 0) {
    player.coins -= paid;
    coinEvent(room, player, -paid, 'payment', label || '支払い');
  }
  return paid;
}

function closeSpecificVenture(player, ventureId) {
  const v = (player.ventureCards || []).find(item => item.id === ventureId && !item.closed);
  if (!v) return false;
  v.closed = true;
  syncVentureClosedCount(player);
  return true;
}

function popSpecificVenture(player, ventureId) {
  const list = player.ventureCards || [];
  const idx = list.findIndex(v => v.id === ventureId);
  if (idx < 0) return null;
  const [item] = list.splice(idx, 1);
  syncVentureClosedCount(player);
  return item;
}

function addVentureInstance(player, instance = null) {
  if (!player.ventureCards) player.ventureCards = [];
  const item = instance || { id: randomUUID(), tokens: 0, closed: false };
  player.ventureCards.push(item);
  syncVentureClosedCount(player);
  return item;
}

function removeOneCardForTransfer(player, cardId, instanceId = null) {
  if (count(player, cardId) <= 0) return null;
  let instance = null;
  if (cardId === 'venture') {
    instance = instanceId ? popSpecificVenture(player, instanceId) : popSpecificVenture(player, player.ventureCards?.[0]?.id);
    if (!instance) return null;
  }
  const wasClosed = cardId === 'venture' ? !!instance.closed : closedCount(player, cardId) > 0;
  player.cards[cardId] -= 1;
  if (player.cards[cardId] <= 0) delete player.cards[cardId];
  if (cardId !== 'venture' && wasClosed) setClosedCount(player, cardId, closedCount(player, cardId) - 1);
  return { cardId, wasClosed, instance };
}

function addTransferredCard(player, moved) {
  const { cardId, wasClosed, instance } = moved;
  player.cards[cardId] = count(player, cardId) + 1;
  if (cardId === 'venture') addVentureInstance(player, instance || { id: randomUUID(), tokens: 0, closed: wasClosed });
  else if (wasClosed) setClosedCount(player, cardId, closedCount(player, cardId) + 1);
}

function transferOneCard(from, to, cardId, instanceId = null) {
  const moved = removeOneCardForTransfer(from, cardId, instanceId);
  if (!moved) return null;
  addTransferredCard(to, moved);
  return moved;
}

function movableCardIds(player) {
  return Object.entries(player.cards || {})
    .filter(([cardId, n]) => n > 0 && CARD_DEFS[cardId] && !isMajorCard(cardId))
    .map(([cardId]) => cardId);
}

function buildSharpChoiceQueue(room, roller, total) {
  if (!isSharpMode(room)) return [];
  const queue = [];
  const addMany = (cardId, fn) => {
    const c = effectCount(room, roller, cardId);
    if (!c || !CARD_DEFS[cardId].dice.includes(total)) return;
    for (let i = 0; i < c; i++) if (fn()) queue.push(cardId);
  };
  addMany('renovation', () => Object.entries(roller.landmarks || {}).some(([, done]) => done));
  addMany('cleaning', () => room.players.some(p => Object.entries(p.cards || {}).some(([id, n]) => n > 0 && !isMajorCard(id) && activeCount(p, id) > 0)));
  addMany('moving', () => room.players.length > 1 && movableCardIds(roller).length > 0);
  return queue;
}

function enterSharpChoice(room, queue) {
  const roller = getCurrentPlayer(room);
  room.pendingSharp = { playerId: roller.id, effects: queue, current: queue[0] };
  room.phase = 'sharpChoice';
  log(room, `${roller.name} は街コロ#カードの対象を選択します。`);
}

function finishCurrentSharp(room) {
  if (!room.pendingSharp) {
    continueAfterSharpChoices(room);
    return;
  }
  room.pendingSharp.effects.shift();
  if (room.pendingSharp.effects.length) {
    room.pendingSharp.current = room.pendingSharp.effects[0];
    room.phase = 'sharpChoice';
  } else {
    room.pendingSharp = null;
    continueAfterSharpChoices(room);
  }
}

function continueAfterSharpChoices(room) {
  const queue = room.pendingPurpleQueue || [];
  room.pendingPurpleQueue = null;
  if (queue.length) {
    const roller = getCurrentPlayer(room);
    room.pendingPurple = { playerId: roller.id, effects: queue, current: queue[0] };
    room.phase = 'purple';
    log(room, `${roller.name} は紫カードの対象を選択します。`);
  } else {
    room.pendingPurple = null;
    enterBuildPhase(room);
  }
}

function completeTurnOrVentureInvest(room) {
  const player = getCurrentPlayer(room);
  if (isSharpMode(room) && player && player.coins > 0 && (player.ventureCards || []).some(v => !v.closed)) {
    room.pendingVentureInvest = { playerId: player.id };
    room.phase = 'ventureInvest';
    log(room, `${player.name} はベンチャー企業に1コイン投資できます。`);
    return;
  }
  room.pendingVentureInvest = null;
  advanceTurn(room);
}

function resolveRoll(room, diceValues, overrideTotal = null) {
  const rawTotal = diceValues.reduce((a, b) => a + b, 0);
  const total = overrideTotal || rawTotal;
  room.turnSummary = [];
  room.tunaRollResult = null;
  beginTurnMoneySummary(room);
  const rollerIndex = room.currentPlayerIndex;
  const roller = room.players[rollerIndex];
  room.lastRoll = { dice: diceValues, total, rawTotal, playerId: roller.id, playerName: roller.name };
  room.reopenedThisRoll = reopenClosedCardsForTotal(room, total);
  recordNormalDiceStats(room, room.lastRoll);
  log(room, `${roller.name} が ${diceValues.join(' + ')} = ${rawTotal}${total !== rawTotal ? `（港で ${total}）` : ''} を出しました。`);

  // Red cards: payments to other players first, counterclockwise.
  for (const idx of reverseOrderFrom(room, rollerIndex)) {
    const owner = room.players[idx];
    const redCards = ['cafe', 'family', ...(isPlusMode(room) ? ['sushi', 'pizza', 'burger'] : []), ...(isSharpMode(room) ? ['french', 'memberBar'] : [])];
    for (const cardId of redCards) {
      const c = effectCount(room, owner, cardId);
      if (!c || !CARD_DEFS[cardId].dice.includes(total)) continue;
      if (cardId === 'sushi' && !has(owner, 'port')) continue;
      let base = 1;
      if (cardId === 'family') base = 2;
      if (cardId === 'sushi') base = 3;
      if (cardId === 'french' && completedLandmarkCount(roller) < 2) continue;
      if (cardId === 'memberBar' && completedLandmarkCount(roller) < 3) continue;
      if (cardId === 'french') base = 5;
      if (cardId === 'memberBar') base = roller.coins;
      const each = cardId === 'memberBar' ? base : applyMallBonus(owner, cardId, base);
      const paid = stealCoins(room, roller, owner, each * c, CARD_DEFS[cardId].name);
      if (paid > 0) {
        const text = `${owner.name} の${CARD_DEFS[cardId].name}：${roller.name} から ${paid} コイン。`;
        log(room, text);
        specialEvent(room, 'effect-steal', owner, text, { cardId, amount: paid, targetId: roller.id });
      }
      if (roller.coins === 0) break;
    }
  }

  const tunaQueue = [];

  // Blue cards: every player's income from bank.
  for (const p of room.players) {
    const incomes = [
      ['wheat', 1], ['ranch', 1], ['forest', 1], ['mine', 5], ['apple', 3],
      ...(isPlusMode(room) ? [['flower', 1], ['sauryBoat', 3], ['tunaBoat', 0]] : []),
      ...(isSharpMode(room) ? [['corn', 1], ['grape', 3]] : [])
    ];
    for (const [cardId, base] of incomes) {
      const c = effectCount(room, p, cardId);
      if (!c || !CARD_DEFS[cardId].dice.includes(total)) continue;
      if ((cardId === 'sauryBoat' || cardId === 'tunaBoat') && !has(p, 'port')) continue;
      if (cardId === 'corn' && completedLandmarkCount(p) > 1) continue;
      if (cardId === 'tunaBoat') {
        tunaQueue.push({ playerId: p.id, playerName: p.name, count: c });
        continue;
      }
      const amount = base * c;
      if (amount > 0) {
        bankIncome(room, p, amount, CARD_DEFS[cardId].name);
        const text = `${p.name} の${CARD_DEFS[cardId].name}：銀行から ${amount} コイン。`;
        log(room, text);
        specialEvent(room, 'effect-income', p, text, { cardId, amount });
      }
    }
  }

  if (tunaQueue.length) {
    room.pendingTuna = {
      queue: tunaQueue,
      currentIndex: 0,
      rollerId: roller.id,
      rollerName: roller.name,
      diceValues: [...diceValues],
      total,
      rawTotal
    };
    room.phase = 'tunaRoll';
    const holderNames = tunaQueue.map(t => t.playerName).join('、');
    log(room, `マグロ漁船発動：${holderNames} が対象です。${roller.name} が追加ダイスを1回振ってください。`);
    return;
  }

  continueRollAfterTuna(room, diceValues, total);
}

function continueRollAfterTuna(room, diceValues, total) {
  const rollerIndex = room.currentPlayerIndex;
  const roller = room.players[rollerIndex];
  // Green cards: roller only.
  const greenChecks = ['bakery', 'convenience', 'cheese', 'furniture', 'market', ...(isPlusMode(room) ? ['flowerShop', 'foodWarehouse'] : []), ...(isSharpMode(room) ? ['generalStore', 'loan', 'winery', 'venture', 'drinkFactory', 'park'] : [])];
  for (const cardId of greenChecks) {
    const c = effectCount(room, roller, cardId);
    if (!c || !CARD_DEFS[cardId].dice.includes(total)) continue;
    let amount = 0;
    if (cardId === 'bakery') amount = applyMallBonus(roller, cardId, 1) * c;
    if (cardId === 'convenience') amount = applyMallBonus(roller, cardId, 3) * c;
    if (cardId === 'flowerShop') amount = (count(roller, 'flower') + (has(roller, 'mall') ? 1 : 0)) * c;
    if (cardId === 'cheese') amount = 3 * count(roller, 'ranch') * c;
    if (cardId === 'furniture') amount = 3 * (count(roller, 'forest') + count(roller, 'mine')) * c;
    if (cardId === 'market') amount = 2 * (count(roller, 'wheat') + count(roller, 'apple')) * c;
    if (cardId === 'foodWarehouse') amount = 2 * countRestaurantAndShop(roller, 'restaurant') * c;
    if (cardId === 'generalStore' && completedLandmarkCount(roller) <= 1) amount = 2 * c;
    if (cardId === 'loan') {
      const paid = spendToBank(room, roller, 2 * c, CARD_DEFS[cardId].name);
      if (paid > 0) {
        const text = `${roller.name} の${CARD_DEFS[cardId].name}：銀行に ${paid} コイン支払いました。`;
        log(room, text);
        specialEvent(room, 'effect-payment', roller, text, { cardId, amount: -paid });
      }
      continue;
    }
    if (cardId === 'winery') {
      amount = 6 * activeCount(roller, 'grape') * c;
      const closed = closeCards(roller, 'winery', c);
      if (closed > 0) log(room, `${roller.name} のワイナリー ${closed}枚が休業しました。`);
    }
    if (cardId === 'venture') {
      for (const venture of (roller.ventureCards || []).filter(v => !v.closed && (v.tokens || 0) > 0)) {
        for (const other of room.players) {
          if (other.id === roller.id) continue;
          const paid = stealCoins(room, other, roller, venture.tokens, CARD_DEFS[cardId].name);
          if (paid > 0) {
            const text = `${roller.name} のベンチャー企業（投資${venture.tokens}）：${other.name} から ${paid} コイン。`;
            log(room, text);
            specialEvent(room, 'effect-steal', roller, text, { cardId, amount: paid, targetId: other.id, ventureId: venture.id });
          }
        }
      }
      continue;
    }
    if (cardId === 'drinkFactory') {
      const restaurants = room.players.reduce((sum, p) => sum + countRestaurantAndShop(p, 'restaurant'), 0);
      amount = restaurants * c;
    }
    if (cardId === 'park') {
      const totalCoins = room.players.reduce((sum, p) => sum + p.coins, 0);
      const each = Math.ceil(totalCoins / room.players.length);
      for (const p of room.players) { p.coins = each; }
      const text = `${roller.name} の公園：全員のコインを集め、銀行補充込みで全員 ${each} コインにしました。`;
      log(room, text);
      specialEvent(room, 'effect-income', roller, text, { cardId, amount: 0 });
      continue;
    }
    if (amount > 0) {
      bankIncome(room, roller, amount, CARD_DEFS[cardId].name);
      const text = `${roller.name} の${CARD_DEFS[cardId].name}：銀行から ${amount} コイン。`;
      log(room, text);
      specialEvent(room, 'effect-income', roller, text, { cardId, amount });
    }
  }

  // Purple cards: roller only. Stadium is automatic; TV and Business Center need a player choice.
  const purpleQueue = [];
  if (isPlusMode(room) && total === 7 && effectCount(room, roller, 'publisher')) {
    for (let i = 0; i < room.players.length; i++) {
      if (i === rollerIndex) continue;
      const other = room.players[i];
      const due = countRestaurantAndShop(other) * effectCount(room, roller, 'publisher');
      const paid = stealCoins(room, other, roller, due, '出版社');
      if (paid > 0) {
        const text = `${roller.name} の出版社：${other.name} から ${paid} コイン。`;
        log(room, text);
        specialEvent(room, 'effect-steal', roller, text, { cardId: 'publisher', amount: paid, targetId: other.id });
      }
    }
  }
  if (isPlusMode(room) && (total === 8 || total === 9) && effectCount(room, roller, 'taxOffice')) {
    for (let i = 0; i < room.players.length; i++) {
      if (i === rollerIndex) continue;
      const other = room.players[i];
      if (other.coins < 10) continue;
      const paid = stealCoins(room, other, roller, Math.floor(other.coins / 2), '税務署');
      if (paid > 0) {
        const text = `${roller.name} の税務署：${other.name} から ${paid} コイン。`;
        log(room, text);
        specialEvent(room, 'effect-steal', roller, text, { cardId: 'taxOffice', amount: paid, targetId: other.id });
      }
    }
  }
  if (total === 6) {
    if (effectCount(room, roller, 'stadium')) {
      for (let i = 0; i < room.players.length; i++) {
        if (i === rollerIndex) continue;
        const other = room.players[i];
        const paid = stealCoins(room, other, roller, 2, 'スタジアム');
        if (paid > 0) {
          const text = `${roller.name} のスタジアム：${other.name} から ${paid} コイン。`;
          log(room, text);
          specialEvent(room, 'effect-steal', roller, text, { cardId: 'stadium', amount: paid, targetId: other.id });
        }
      }
    }
    if (effectCount(room, roller, 'tv') && room.players.some((_, i) => i !== rollerIndex)) purpleQueue.push('tv');
    if (effectCount(room, roller, 'business') && canUseBusinessCenter(room, roller)) purpleQueue.push('business');
  }

  const amusementTriggered =
    Array.isArray(diceValues) &&
    diceValues.length === 2 &&
    diceValues[0] === diceValues[1] &&
    has(roller, 'amusement');
  room.pendingExtraTurn = amusementTriggered;
  if (amusementTriggered) {
    log(room, `${roller.name} は遊園地効果で追加ターンを得ます。`);
    specialEvent(room, 'amusement-earned', roller, '遊園地発動', {
      dice: [...diceValues],
      total,
      reason: 'two-dice-double'
    });
  }
  const sharpQueue = buildSharpChoiceQueue(room, roller, total);
  if (sharpQueue.length) {
    room.pendingPurpleQueue = purpleQueue;
    enterSharpChoice(room, sharpQueue);
  } else if (purpleQueue.length) {
    room.pendingPurple = { playerId: roller.id, effects: purpleQueue, current: purpleQueue[0] };
    room.phase = 'purple';
    log(room, `${roller.name} は紫カードの対象を選択します。`);
  } else {
    room.pendingPurple = null;
    enterBuildPhase(room);
  }

}

function nonPurpleCardIds(player) {
  return Object.entries(player.cards || {})
    .filter(([cardId, n]) => n > 0 && CARD_DEFS[cardId] && CARD_DEFS[cardId].color !== 'purple')
    .map(([cardId]) => cardId);
}

function canUseBusinessCenter(room, player) {
  if (!nonPurpleCardIds(player).length) return false;
  return room.players.some(p => p.id !== player.id && nonPurpleCardIds(p).length > 0);
}

function enterBuildPhase(room) {
  room.phase = 'build';
  const player = getCurrentPlayer(room);
  if (!player) return;
  if (player.coins === 0 && !room.buildSubsidyGiven) {
    room.buildSubsidyGiven = true;
    bankIncome(room, player, 1, '建設フェイズ補助');
    const text = `${player.name} は建設フェイズ開始時に所持金0のため、銀行から1コインを得ました。`;
    log(room, text);
    specialEvent(room, 'effect-income', player, text, { amount: 1, reason: 'build-subsidy' });
  }
  finalizeTurnMoneySummary(room);
}

function finishCurrentPurple(room) {
  if (!room.pendingPurple) {
    enterBuildPhase(room);
    return;
  }
  room.pendingPurple.effects.shift();
  if (room.pendingPurple.effects.length) {
    room.pendingPurple.current = room.pendingPurple.effects[0];
    room.phase = 'purple';
  } else {
    room.pendingPurple = null;
    enterBuildPhase(room);
  }
}

function advanceTurn(room) {
  if (room.pendingExtraTurn) {
    const player = room.players[room.currentPlayerIndex];
    if (player) specialEvent(room, 'amusement-start', player, '追加ターン開始');
    room.pendingExtraTurn = false;
  } else {
    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
  }
  room.phase = 'roll';
  room.buildSubsidyGiven = false;
  room.lastRoll = null;
  room.tunaRollResult = null;
  room.pendingRoll = null;
  room.turnCoinStart = null;
  room.turnCoinEnd = null;
  room.turnSummary = [];
  room.pendingTuna = null;
  room.pendingPurple = null;
  room.pendingSharp = null;
  room.pendingPurpleQueue = null;
  room.pendingVentureInvest = null;
  room.reopenedThisRoll = null;
  room.rolling = null;
  room.canReroll = true;
}

function checkWinner(room, player) {
  const done = Object.values(player.landmarks).every(Boolean);
  if (done) {
    room.status = 'finished';
    room.phase = 'finished';
    room.winnerId = player.id;
    log(room, `${player.name} がすべてのランドマークを完成させて勝利しました！`);
  }
}

function canUsePortAdjustment(player, diceValues) {
  const total = diceValues.reduce((a, b) => a + b, 0);
  return has(player, 'port') && diceValues.length === 2 && total >= 10;
}

function handleRolledDice(room, player, dice, diceCount) {
  if (isPlusMode(room) && canUsePortAdjustment(player, dice)) {
    const total = dice.reduce((a, b) => a + b, 0);
    room.pendingRoll = { dice, diceCount, playerId: player.id, playerName: player.name, total, rawTotal: total, adjustedTotal: total + 2, portChoice: true };
    room.phase = 'portChoice';
    room.canReroll = false;
    log(room, `${player.name} は港効果で出目 ${total} を ${total + 2} にできます。`);
    return;
  }
  resolveRoll(room, dice);
}


function reconnectPlayerToRoom(socket, room, player, cb, message = '再接続しました。') {
  player.connected = true;
  player.socketId = socket.id;
  socket.join(room.code);
  socket.data.roomCode = room.code;
  socket.data.playerId = player.id;
  socket.data.isSpectator = false;
  socket.data.spectatorId = null;
  log(room, `${player.name} が再接続しました。`);
  cb?.({ ok: true, code: room.code, playerId: player.id, reconnected: true, message });
  emitRoom(room);
}

function findRecoverablePlayer(room, name) {
  const cleanName = (name || '').trim();
  if (!cleanName) return null;
  const matches = room.players.filter(p => !p.connected && p.name === cleanName);
  return matches.length === 1 ? matches[0] : null;
}

function detachSocketFromCurrentRoom(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  if (room) {
    const player = room.players.find(p => p.id === socket.data.playerId);
    if (player && player.socketId === socket.id) {
      player.connected = false;
      player.socketId = null;
    }
    const spectator = (room.spectators || []).find(sp => sp.id === socket.data.spectatorId);
    if (spectator && spectator.socketId === socket.id) {
      spectator.connected = false;
      spectator.socketId = null;
    }
    socket.leave(code);
    emitRoom(room);
  }
  socket.data.roomCode = null;
  socket.data.playerId = null;
  socket.data.spectatorId = null;
  socket.data.isSpectator = false;
}

io.on('connection', (socket) => {
  socket.on('leaveRoom', (_payload, cb) => {
    detachSocketFromCurrentRoom(socket);
    cb?.({ ok: true });
  });

  socket.on('createRoom', ({ name, deckMode }, cb) => {
    detachSocketFromCurrentRoom(socket);
    let code = roomCode();
    while (rooms.has(code)) code = roomCode();
    const newPlayerId = randomUUID();
    const selectedDeckMode = normalizeDeckMode(deckMode);
    const player = makePlayer(newPlayerId, name, socket.id, selectedDeckMode);
    const room = {
      code,
      hostId: player.id,
      deckMode: selectedDeckMode,
      status: 'waiting',
      players: [player],
      currentPlayerIndex: 0,
      deck: [],
      market: {},
      phase: 'waiting',
      lastRoll: null,
      canReroll: true,
      pendingExtraTurn: false,
      buildSubsidyGiven: false,
      pendingPurple: null,
      pendingSharp: null,
      pendingVentureInvest: null,
      pendingRoll: null,
      rolling: null,
      winnerId: null,
      logs: [],
      coinEvents: [],
      specialEvents: [],
      eventSeq: 0,
      diceStats: createDiceStats(),
      spectators: [],
      lastUpdatedAt: Date.now()
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.playerId = player.id;
    log(room, `${player.name} がルームを作成しました。`);
    cb?.({ ok: true, code, playerId: player.id });
    emitRoom(room);
  });


  socket.on('restoreRoomFromBackup', ({ snapshot, playerId, name }, cb) => {
    const code = (snapshot?.code || '').toUpperCase();
    if (!code) return cb?.({ ok: false, message: '復元できるルーム情報がありません。' });

    const existing = rooms.get(code);
    if (existing) {
      let player = playerId ? existing.players.find(p => p.id === playerId) : null;
      if (!player) player = findRecoverablePlayer(existing, name);
      if (!player) return cb?.({ ok: false, message: 'ルームはありますが、元のプレイヤー情報が見つかりません。' });
      return reconnectPlayerToRoom(socket, existing, player, cb, '既存ルームに再接続しました。');
    }

    const restored = normalizeLoadedRoom(snapshot);
    if (!restored || restored.code !== code) {
      return cb?.({ ok: false, message: '保存されているルーム情報が壊れています。' });
    }

    const player = playerId ? restored.players.find(p => p.id === playerId) : null;
    if (!player || player.id !== restored.hostId) {
      return cb?.({ ok: false, message: 'サーバーから部屋が消えています。ホストが同じブラウザで入り直すと復元できます。' });
    }

    restored.code = code;
    restored.lastUpdatedAt = Date.now();
    rooms.set(code, restored);
    log(restored, 'ホストのブラウザ保存データからルームを復元しました。');
    reconnectPlayerToRoom(socket, restored, player, cb, 'ルームを復元して再接続しました。');
  });

  socket.on('reconnectPlayer', ({ code, playerId, name }, cb) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return cb?.({ ok: false, message: 'ルームが見つかりません。' });
    let player = playerId ? room.players.find(p => p.id === playerId) : null;
    if (!player) player = findRecoverablePlayer(room, name);
    if (!player) return cb?.({ ok: false, message: '元のプレイヤー情報が見つかりません。ルームコードと名前を確認してください。' });
    reconnectPlayerToRoom(socket, room, player, cb);
  });

  socket.on('joinRoom', ({ code, name, playerId }, cb) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return cb?.({ ok: false, message: 'ルームが見つかりません。' });

    // 途中で落ちたプレイヤーが「参加」ボタンを押しても、観戦者に落とさず元の席へ戻す。
    const savedPlayer = playerId ? room.players.find(p => p.id === playerId) : null;
    const nameRecoveredPlayer = !savedPlayer && room.status !== 'waiting' ? findRecoverablePlayer(room, name) : null;
    if (savedPlayer || nameRecoveredPlayer) {
      return reconnectPlayerToRoom(socket, room, savedPlayer || nameRecoveredPlayer, cb);
    }

    if (room.status !== 'waiting') {
      const spectatorId = randomUUID();
      const spectator = { id: spectatorId, socketId: socket.id, name: (name || '観戦者').slice(0, 18), connected: true };
      room.spectators = room.spectators || [];
      room.spectators.push(spectator);
      socket.join(room.code);
      socket.data.roomCode = room.code;
      socket.data.spectatorId = spectatorId;
      socket.data.isSpectator = true;
      log(room, `${spectator.name} が観戦に入りました。`);
      cb?.({ ok: true, code: room.code, spectator: true, spectatorId });
      emitRoom(room);
      return;
    }
    if (room.players.length >= (isTwoMode(room) ? 5 : 4)) return cb?.({ ok: false, message: 'このルームは満員です。' });
    const newPlayerId = randomUUID();
    const player = makePlayer(newPlayerId, name, socket.id, room.deckMode);
    room.players.push(player);
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    log(room, `${player.name} が参加しました。`);
    cb?.({ ok: true, code: room.code, playerId: player.id });
    emitRoom(room);
  });

  socket.on('startGame', (_payload, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    if (socket.data.playerId !== room.hostId) return cb?.({ ok: false, message: 'ホストのみ開始できます。' });
    if (room.players.length < 1) return cb?.({ ok: false, message: '1人以上で開始してください。' });
    if (isTwoMode(room) && room.players.length < 2) return cb?.({ ok: false, message: '街コロ通は2〜5人で開始してください。' });
    if (isTwoMode(room)) {
      machikoro2.startGame(room, twoHelpers());
      room.diceStats = createDiceStats();
      cb?.({ ok: true });
      emitRoom(room);
      return;
    }
    // 毎ゲーム開始時にプレイヤー順をシャッフルし、先手もランダムにする。
    room.players = shuffle(room.players);
    room.deck = makeDeck(room.deckMode);
    room.market = {};
    fillMarket(room);
    room.status = 'playing';
    room.phase = 'roll';
    room.currentPlayerIndex = 0;
    room.pendingExtraTurn = false;
    room.buildSubsidyGiven = false;
    room.pendingPurple = null;
    room.pendingSharp = null;
    room.pendingPurpleQueue = null;
    room.pendingVentureInvest = null;
    room.pendingRoll = null;
    room.pendingTuna = null;
    room.tunaRollResult = null;
    room.rolling = null;
    room.winnerId = null;
    room.coinEvents = [];
    room.specialEvents = [];
    room.turnSummary = [];
    room.diceStats = createDiceStats();
    log(room, `手番順をシャッフルしました：${room.players.map(player => player.name).join(' → ')}`);
    log(room, `ゲームを開始しました。山札から場を ${marketSize(room)} 種類まで作りました。山札残り ${room.deck.length} 枚。`);
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on('rollDice', ({ diceCount }, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || room.phase !== 'roll') return;
    if (room.rolling) return cb?.({ ok: false, message: 'ダイス処理中です。' });
    const player = getCurrentPlayer(room);
    if (player.id !== socket.data.playerId) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
    const countDice = Number(diceCount) === 2 && (isTwoMode(room) || has(player, 'station')) ? 2 : 1;
    room.rolling = { playerId: player.id, playerName: player.name, diceCount: countDice, mode: 'roll', nonce: Date.now() };
    cb?.({ ok: true });
    emitRoom(room);

    setTimeout(() => {
      const currentRoom = rooms.get(room.code);
      if (!currentRoom || currentRoom.status !== 'playing' || !currentRoom.rolling || currentRoom.rolling.nonce !== room.rolling?.nonce) return;
      const currentPlayer = getCurrentPlayer(currentRoom);
      if (!currentPlayer || currentPlayer.id !== player.id) return;
      const dice = Array.from({ length: countDice }, () => 1 + Math.floor(Math.random() * 6));
      currentRoom.rolling = null;
      if (isTwoMode(currentRoom)) {
        machikoro2.resolveRoll(currentRoom, dice, twoHelpers());
      } else if (has(currentPlayer, 'tower')) {
        currentRoom.pendingRoll = { dice, diceCount: countDice, playerId: currentPlayer.id, playerName: currentPlayer.name, total: dice.reduce((a, b) => a + b, 0), rawTotal: dice.reduce((a, b) => a + b, 0) };
        currentRoom.phase = 'reroll';
        currentRoom.canReroll = true;
        log(currentRoom, `${currentPlayer.name} が ${dice.join(' + ')} = ${dice.reduce((a, b) => a + b, 0)} を出しました。電波塔で振り直すか選べます。`);
      } else {
        handleRolledDice(currentRoom, currentPlayer, dice, countDice);
      }
      emitRoom(currentRoom);
    }, 1100);
  });

  socket.on('acceptRoll', (_payload, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || room.phase !== 'reroll' || !room.pendingRoll) return;
    const player = getCurrentPlayer(room);
    if (player.id !== socket.data.playerId) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
    const dice = room.pendingRoll.dice;
    room.pendingRoll = null;
    room.canReroll = false;
    handleRolledDice(room, player, dice, dice.length);
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on('rerollDice', (_payload, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || room.phase !== 'reroll' || !room.pendingRoll || !room.canReroll) return;
    if (room.rolling) return cb?.({ ok: false, message: 'ダイス処理中です。' });
    const player = getCurrentPlayer(room);
    if (player.id !== socket.data.playerId || !has(player, 'tower')) return cb?.({ ok: false, message: '振り直しできません。' });
    const countDice = room.pendingRoll.diceCount;
    room.rolling = { playerId: player.id, playerName: player.name, diceCount: countDice, mode: 'reroll', nonce: Date.now() };
    cb?.({ ok: true });
    emitRoom(room);

    setTimeout(() => {
      const currentRoom = rooms.get(room.code);
      if (!currentRoom || currentRoom.status !== 'playing' || !currentRoom.rolling || currentRoom.rolling.nonce !== room.rolling?.nonce) return;
      const currentPlayer = getCurrentPlayer(currentRoom);
      if (!currentPlayer || currentPlayer.id !== player.id) return;
      const dice = Array.from({ length: countDice }, () => 1 + Math.floor(Math.random() * 6));
      currentRoom.rolling = null;
      currentRoom.pendingRoll = null;
      currentRoom.canReroll = false;
      log(currentRoom, `${currentPlayer.name} が電波塔で振り直しました。`);
      handleRolledDice(currentRoom, currentPlayer, dice, countDice);
      emitRoom(currentRoom);
    }, 1100);
  });


  socket.on('acceptPortRoll', (_payload, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || room.phase !== 'portChoice' || !room.pendingRoll?.portChoice) return;
    const player = getCurrentPlayer(room);
    if (!player || player.id !== socket.data.playerId) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
    const dice = room.pendingRoll.dice;
    room.pendingRoll = null;
    resolveRoll(room, dice);
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on('usePortRoll', (_payload, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || room.phase !== 'portChoice' || !room.pendingRoll?.portChoice) return;
    const player = getCurrentPlayer(room);
    if (!player || player.id !== socket.data.playerId || !has(player, 'port')) return cb?.({ ok: false, message: '港を使えません。' });
    const dice = room.pendingRoll.dice;
    const adjustedTotal = room.pendingRoll.adjustedTotal;
    room.pendingRoll = null;
    resolveRoll(room, dice, adjustedTotal);
    cb?.({ ok: true });
    emitRoom(room);
  });
  socket.on('rollTunaDice', (_payload, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || room.phase !== 'tunaRoll' || !room.pendingTuna) return;
    if (room.rolling) return cb?.({ ok: false, message: 'ダイス処理中です。' });
    const targets = Array.isArray(room.pendingTuna.queue) ? room.pendingTuna.queue : [];
    if (!targets.length || room.pendingTuna.rollerId !== socket.data.playerId) return cb?.({ ok: false, message: '出目を出したプレイヤーが追加ダイスを振ります。' });
    const roller = room.players.find(p => p.id === room.pendingTuna.rollerId);
    if (!roller) return cb?.({ ok: false, message: 'プレイヤーが見つかりません。' });

    room.rolling = { playerId: roller.id, playerName: roller.name, diceCount: 2, mode: 'tuna', nonce: Date.now() };
    cb?.({ ok: true });
    emitRoom(room);

    setTimeout(() => {
      const currentRoom = rooms.get(room.code);
      if (!currentRoom || currentRoom.status !== 'playing' || currentRoom.phase !== 'tunaRoll' || !currentRoom.pendingTuna || !currentRoom.rolling || currentRoom.rolling.nonce !== room.rolling?.nonce) return;
      const saved = currentRoom.pendingTuna;
      const tunaDice = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
      const diceSum = tunaDice.reduce((a, b) => a + b, 0);
      const rollerName = saved.rollerName || '出目を出したプレイヤー';
      currentRoom.rolling = null;
      currentRoom.tunaRollResult = {
        dice: tunaDice,
        total: diceSum,
        rawTotal: diceSum,
        playerId: saved.rollerId,
        playerName: rollerName,
        note: 'マグロ漁船の追加ダイスです。カード効果・港+2・遊園地は発動しません。'
      };
      recordTunaDiceStats(currentRoom, currentRoom.tunaRollResult);

      for (const tuna of saved.queue || []) {
        const tunaPlayer = currentRoom.players.find(p => p.id === tuna?.playerId);
        if (!tuna || !tunaPlayer) continue;
        const amount = diceSum * tuna.count;
        if (amount <= 0) continue;
        bankIncome(currentRoom, tunaPlayer, amount, CARD_DEFS.tunaBoat.name);
        const text = `${tunaPlayer.name} のマグロ漁船：${rollerName} の追加ダイス ${tunaDice.join(' + ')} = ${diceSum}、${tuna.count}隻で ${amount} コイン。（カード効果・港+2・遊園地なし）`;
        log(currentRoom, text);
        specialEvent(currentRoom, 'effect-income', tunaPlayer, text, { cardId: 'tunaBoat', amount, dice: tunaDice, count: tuna.count, tunaExtra: true });
      }

      currentRoom.pendingTuna = null;
      continueRollAfterTuna(currentRoom, saved.diceValues, saved.total);
      emitRoom(currentRoom);
    }, 1100);
  });



  socket.on('sharpRenovation', ({ landmarkId }, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || room.phase !== 'sharpChoice' || room.pendingSharp?.current !== 'renovation') return;
    const player = getCurrentPlayer(room);
    if (!player || player.id !== socket.data.playerId || room.pendingSharp.playerId !== player.id) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
    const landmark = getLandmarkDefs(room, false)[landmarkId];
    if (!landmark || !player.landmarks[landmarkId]) return cb?.({ ok: false, message: '完成済みランドマークを選んでください。' });
    player.landmarks[landmarkId] = false;
    bankIncome(room, player, 8, '改装屋');
    const text = `${player.name} の改装屋：${landmark.name}を未完成に戻し、銀行から8コイン。`;
    log(room, text);
    specialEvent(room, 'effect-income', player, text, { cardId: 'renovation', landmarkId, amount: 8 });
    finishCurrentSharp(room);
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on('sharpCleaning', ({ cardId }, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || room.phase !== 'sharpChoice' || room.pendingSharp?.current !== 'cleaning') return;
    const player = getCurrentPlayer(room);
    if (!player || player.id !== socket.data.playerId || room.pendingSharp.playerId !== player.id) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
    const card = getCardDefs(room)[cardId];
    if (!card || isMajorCard(cardId)) return cb?.({ ok: false, message: '大施設以外の施設を選んでください。' });
    let closed = 0;
    for (const p of room.players) closed += closeCards(p, cardId, activeCount(p, cardId));
    if (closed > 0) {
      bankIncome(room, player, closed, '清掃業');
      const text = `${player.name} の清掃業：全員の${card.name}を合計${closed}枚休業にし、${closed}コイン。`;
      log(room, text);
      specialEvent(room, 'effect-income', player, text, { cardId: 'cleaning', targetCardId: cardId, amount: closed, closed });
    } else {
      log(room, `${player.name} の清掃業：${card.name}を選びましたが、新たに休業した施設はありません。`);
    }
    finishCurrentSharp(room);
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on('sharpMoving', ({ cardId, targetId, instanceId }, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || room.phase !== 'sharpChoice' || room.pendingSharp?.current !== 'moving') return;
    const player = getCurrentPlayer(room);
    if (!player || player.id !== socket.data.playerId || room.pendingSharp.playerId !== player.id) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
    const target = room.players.find(p => p.id === targetId && p.id !== player.id);
    const card = getCardDefs(room)[cardId];
    if (!target) return cb?.({ ok: false, message: '渡す相手を選んでください。' });
    if (!card || isMajorCard(cardId) || count(player, cardId) <= 0) return cb?.({ ok: false, message: '大施設以外の自分の施設を選んでください。' });
    const moved = transferOneCard(player, target, cardId, instanceId || null);
    if (!moved) return cb?.({ ok: false, message: 'その施設を渡せません。' });
    bankIncome(room, player, 4, '引っ越し屋');
    const extra = cardId === 'venture' && moved.instance ? `（投資${moved.instance.tokens || 0}コイン付き）` : '';
    const text = `${player.name} の引っ越し屋：${card.name}${extra}を ${target.name} に渡し、銀行から4コイン。`;
    log(room, text);
    specialEvent(room, 'effect-income', player, text, { cardId: 'moving', movedCardId: cardId, targetId: target.id, amount: 4 });
    finishCurrentSharp(room);
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on('ventureInvest', ({ ventureId }, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || room.phase !== 'ventureInvest' || !room.pendingVentureInvest) return;
    const player = getCurrentPlayer(room);
    if (!player || player.id !== socket.data.playerId || room.pendingVentureInvest.playerId !== player.id) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
    const venture = (player.ventureCards || []).find(v => v.id === ventureId && !v.closed);
    if (!venture) return cb?.({ ok: false, message: '投資するベンチャー企業を選んでください。' });
    if (player.coins <= 0) return cb?.({ ok: false, message: '投資するコインがありません。' });
    player.coins -= 1;
    venture.tokens = Number(venture.tokens || 0) + 1;
    coinEvent(room, player, -1, 'payment', 'ベンチャー企業投資');
    log(room, `${player.name} はベンチャー企業に1コイン投資しました。（このカード上: ${venture.tokens}）`);
    room.pendingVentureInvest = null;
    advanceTurn(room);
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on('skipVentureInvest', (_payload, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || room.phase !== 'ventureInvest' || !room.pendingVentureInvest) return;
    const player = getCurrentPlayer(room);
    if (!player || player.id !== socket.data.playerId || room.pendingVentureInvest.playerId !== player.id) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
    log(room, `${player.name} はベンチャー企業に投資しませんでした。`);
    room.pendingVentureInvest = null;
    advanceTurn(room);
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on('twoBusiness', ({ myCardId, targetId, targetCardId }, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !isTwoMode(room) || room.status !== 'playing' || room.phase !== 'twoBusiness') return;
    const player = getCurrentPlayer(room);
    if (!player || player.id !== socket.data.playerId) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
    const result = machikoro2.finishBusiness(room, { myCardId, targetId, targetCardId }, twoHelpers());
    cb?.(result);
    emitRoom(room);
  });

  socket.on('skipTwoBusiness', (_payload, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !isTwoMode(room) || room.status !== 'playing' || room.phase !== 'twoBusiness') return;
    const player = getCurrentPlayer(room);
    if (!player || player.id !== socket.data.playerId) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
    const result = machikoro2.skipBusiness(room, twoHelpers());
    cb?.(result);
    emitRoom(room);
  });

  socket.on('twoGiveEstablishment', ({ cardId }, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !isTwoMode(room) || room.status !== 'playing' || room.phase !== 'twoMoving') return;
    const player = getCurrentPlayer(room);
    if (!player || player.id !== socket.data.playerId) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
    const result = machikoro2.giveMovingCard(room, cardId, twoHelpers());
    cb?.(result);
    emitRoom(room);
  });

  socket.on('purpleTv', ({ targetId }, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || room.phase !== 'purple' || room.pendingPurple?.current !== 'tv') return;
    const player = getCurrentPlayer(room);
    if (!player || player.id !== socket.data.playerId || room.pendingPurple.playerId !== player.id) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
    const target = room.players.find(p => p.id === targetId && p.id !== player.id);
    if (!target) return cb?.({ ok: false, message: '対象プレイヤーを選んでください。' });
    const paid = stealCoins(room, target, player, 5, 'テレビ局');
    if (paid > 0) log(room, `${player.name} のテレビ局：${target.name} から ${paid} コイン。`);
    else log(room, `${player.name} のテレビ局：${target.name} からコインを得られませんでした。`);
    finishCurrentPurple(room);
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on('purpleBusiness', ({ myCardId, myInstanceId, targetId, targetCardId, targetInstanceId }, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || room.phase !== 'purple' || room.pendingPurple?.current !== 'business') return;
    const player = getCurrentPlayer(room);
    if (!player || player.id !== socket.data.playerId || room.pendingPurple.playerId !== player.id) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
    const target = room.players.find(p => p.id === targetId && p.id !== player.id);
    if (!target) return cb?.({ ok: false, message: '交換相手を選んでください。' });
    const myCard = CARD_DEFS[myCardId];
    const targetCard = CARD_DEFS[targetCardId];
    if (!myCard || !targetCard) return cb?.({ ok: false, message: '交換カードを選んでください。' });
    if (myCard.color === 'purple' || targetCard.color === 'purple') return cb?.({ ok: false, message: 'ビジネスセンターでは紫カード以外の施設を選んでください。' });
    if (count(player, myCardId) <= 0 || count(target, targetCardId) <= 0) return cb?.({ ok: false, message: '選んだ施設がありません。' });
    if (myCardId === 'venture' && !player.ventureCards?.some(v => v.id === myInstanceId)) return cb?.({ ok: false, message: '自分のベンチャー企業を1枚選んでください。' });
    if (targetCardId === 'venture' && !target.ventureCards?.some(v => v.id === targetInstanceId)) return cb?.({ ok: false, message: '相手のベンチャー企業を1枚選んでください。' });
    if (myCardId === targetCardId) return cb?.({ ok: false, message: '同じ施設同士は交換できません。' });

    const movedFromPlayer = removeOneCardForTransfer(player, myCardId, myInstanceId);
    const movedFromTarget = removeOneCardForTransfer(target, targetCardId, targetInstanceId);
    if (!movedFromPlayer || !movedFromTarget) {
      if (movedFromPlayer) addTransferredCard(player, movedFromPlayer);
      if (movedFromTarget) addTransferredCard(target, movedFromTarget);
      return cb?.({ ok: false, message: '交換できませんでした。' });
    }
    addTransferredCard(player, movedFromTarget);
    addTransferredCard(target, movedFromPlayer);
    const myExtra = movedFromPlayer.instance ? `（投資${movedFromPlayer.instance.tokens || 0}コイン付き）` : '';
    const targetExtra = movedFromTarget.instance ? `（投資${movedFromTarget.instance.tokens || 0}コイン付き）` : '';
    log(room, `${player.name} のビジネスセンター：${player.name} は ${myCard.name}${myExtra} を ${target.name} に渡し、${target.name} から ${targetCard.name}${targetExtra} を受け取りました。`);
    finishCurrentPurple(room);
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on('skipPurple', (_payload, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || room.phase !== 'purple') return;
    const player = getCurrentPlayer(room);
    if (!player || player.id !== socket.data.playerId || room.pendingPurple?.playerId !== player.id) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
    const label = room.pendingPurple.current === 'tv' ? 'テレビ局' : 'ビジネスセンター';
    log(room, `${player.name} は${label}の効果を使いませんでした。`);
    finishCurrentPurple(room);
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on('buildCard', ({ cardId }, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing') return;
    if (isTwoMode(room)) {
      if (!['initialBuild', 'build'].includes(room.phase)) return;
      const player = getCurrentPlayer(room);
      if (!player || player.id !== socket.data.playerId) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
      const result = machikoro2.buildCard(room, cardId, twoHelpers());
      cb?.(result);
      emitRoom(room);
      return;
    }
    if (room.phase !== 'build') return;
    const player = getCurrentPlayer(room);
    if (player.id !== socket.data.playerId) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
    const card = getCardDefs(room)[cardId];
    if (!card) return cb?.({ ok: false, message: 'カードがありません。' });
    if (!room.market || !room.market[cardId]) return cb?.({ ok: false, message: `${card.name} は現在の場にありません。` });
    if (player.coins < card.cost) return cb?.({ ok: false, message: 'コインが足りません。' });
    if (card.color === 'purple' && count(player, cardId) >= 1) return cb?.({ ok: false, message: '紫カードは各種類1件までです。' });
    player.coins -= card.cost;
    player.cards[cardId] = count(player, cardId) + 1;
    if (cardId === 'venture') addVentureInstance(player);
    if (cardId === 'loan') {
      bankIncome(room, player, 5, '貸金業');
      log(room, `${player.name} は貸金業の建設時効果で銀行から5コインを得ました。`);
    }
    room.market[cardId] -= 1;
    log(room, `${player.name} が ${card.name} を建設しました。場の残り ${room.market[cardId]} 枚。`);
    if (room.market[cardId] <= 0) {
      delete room.market[cardId];
      log(room, `${card.name} の山が場からなくなりました。`);
      const before = marketSize(room);
      const drawn = fillMarket(room);
      const after = marketSize(room);
      if (drawn > 0) {
        const text = `山札から補充しました。場 ${before} → ${after} 種類、山札残り ${room.deck.length} 枚。`;
        log(room, text);
        specialEvent(room, 'market-refill', null, text, { removedCardId: cardId, marketSize: after, deckCount: room.deck.length });
      }
      else if (after < 10) {
        const text = `山札がないため、場は ${after} 種類のままです。`;
        log(room, text);
        specialEvent(room, 'market-empty', null, text, { marketSize: after, deckCount: room.deck.length });
      }
    }
    completeTurnOrVentureInvest(room);
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on('buildLandmark', ({ landmarkId }, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || room.phase !== 'build') return;
    const player = getCurrentPlayer(room);
    if (isTwoMode(room)) {
      if (!player || player.id !== socket.data.playerId) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
      const result = machikoro2.buildLandmark(room, landmarkId, twoHelpers());
      cb?.(result);
      emitRoom(room);
      return;
    }
    if (player.id !== socket.data.playerId) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
    const landmark = getLandmarkDefs(room, false)[landmarkId];
    if (!landmark) return cb?.({ ok: false, message: 'ランドマークがありません。' });
    if (player.landmarks[landmarkId]) return cb?.({ ok: false, message: 'すでに完成済みです。' });
    if (player.coins < landmark.cost) return cb?.({ ok: false, message: 'コインが足りません。' });
    player.coins -= landmark.cost;
    player.landmarks[landmarkId] = true;
    log(room, `${player.name} が ${landmark.name} を完成させました。`);
    checkWinner(room, player);
    if (room.status !== 'finished') completeTurnOrVentureInvest(room);
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on('skipBuild', (_payload, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing') return;
    if (isTwoMode(room)) {
      if (!['initialBuild', 'build'].includes(room.phase)) return;
      const player = getCurrentPlayer(room);
      if (!player || player.id !== socket.data.playerId) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
      const result = machikoro2.skipBuild(room, twoHelpers());
      cb?.(result);
      emitRoom(room);
      return;
    }
    if (room.phase !== 'build') return;
    const player = getCurrentPlayer(room);
    if (player.id !== socket.data.playerId) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
    if (isPlusMode(room) && has(player, 'airport')) {
      bankIncome(room, player, 10, '空港');
      const text = `${player.name} は空港効果で銀行から10コインを得ました。`;
      log(room, text);
      specialEvent(room, 'effect-income', player, text, { landmarkId: 'airport', amount: 10 });
    }
    log(room, `${player.name} は建設せずに手番を終えました。`);
    completeTurnOrVentureInvest(room);
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on('resetRoom', (payload = {}, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    if (socket.data.playerId !== room.hostId) return cb?.({ ok: false, message: 'ホストのみ再戦できます。' });
    const selectedDeckMode = normalizeDeckMode(payload.deckMode || room.deckMode);
    room.deckMode = selectedDeckMode;
    resetRoomToWaiting(room);
    log(room, `同じメンバーで再戦準備に戻しました。デッキは ${deckModeLabel(selectedDeckMode)} です。`);
    cb?.({ ok: true, deckMode: selectedDeckMode });
    emitRoom(room);
  });



  socket.on('hostForceSkip', (_payload, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing') return cb?.({ ok: false, message: '進行中のゲームがありません。' });
    if (socket.data.playerId !== room.hostId) return cb?.({ ok: false, message: 'ホストのみ強制スキップできます。' });
    const skipped = getCurrentPlayer(room);
    if (isTwoMode(room)) {
      machikoro2.forceSkip(room, twoHelpers());
      specialEvent(room, 'host-skip', skipped || null, `${skipped?.name || 'プレイヤー'} の手番をホストがスキップしました。`);
      cb?.({ ok: true });
      emitRoom(room);
      return;
    }
    room.rolling = null;
    room.pendingRoll = null;
    room.pendingPurple = null;
    room.pendingSharp = null;
    room.pendingPurpleQueue = null;
    room.pendingVentureInvest = null;
    room.pendingExtraTurn = false;
    room.buildSubsidyGiven = false;
    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
    room.phase = 'roll';
    room.canReroll = true;
    room.lastRoll = null;
    const text = `${skipped?.name || 'プレイヤー'} の手番をホストがスキップしました。`;
    log(room, text);
    specialEvent(room, 'host-skip', skipped || null, text);
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.data.playerId);
    if (player && player.socketId === socket.id) {
      player.connected = false;
      log(room, `${player.name} の接続が切れました。`);
      emitRoom(room);
      return;
    }
    const spectator = (room.spectators || []).find(sp => sp.id === socket.data.spectatorId);
    if (spectator && spectator.socketId === socket.id) {
      spectator.connected = false;
      emitRoom(room);
    }
  });
});

loadRoomsFromDisk();

process.on('SIGTERM', () => {
  saveRoomsNow();
  process.exit(0);
});
process.on('SIGINT', () => {
  saveRoomsNow();
  process.exit(0);
});

server.listen(PORT, () => console.log(`Server running on ${PORT}`));
