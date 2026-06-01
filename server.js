const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const CARD_DEFS = {
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

const LANDMARKS = {
  station: { name: '駅', cost: 4, text: 'ダイスを2個振れる' },
  mall: { name: 'ショッピングモール', cost: 10, text: '商店・飲食店収入+1' },
  amusement: { name: '遊園地', cost: 16, text: 'ぞろ目なら追加ターン' },
  tower: { name: '電波塔', cost: 22, text: '毎ターン1回だけ振り直せる' }
};

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
  room.logs = Array.isArray(room.logs) ? room.logs : [];
  room.coinEvents = Array.isArray(room.coinEvents) ? room.coinEvents : [];
  room.specialEvents = Array.isArray(room.specialEvents) ? room.specialEvents : [];
  room.deck = Array.isArray(room.deck) ? room.deck : [];
  room.market = room.market || {};
  room.eventSeq = Number(room.eventSeq || 0);
  room.spectators = Array.isArray(room.spectators) ? room.spectators.map(sp => ({ ...sp, socketId: null, connected: false })) : [];
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

function makeDeck() {
  const deck = [];
  for (const [id, card] of Object.entries(CARD_DEFS)) {
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

function makePlayer(playerId, name, socketId) {
  return {
    id: playerId,
    socketId,
    name: (name || 'ゲスト').slice(0, 18),
    coins: 3,
    cards: { wheat: 1, bakery: 1 },
    landmarks: { station: false, mall: false, amusement: false, tower: false },
    connected: true
  };
}


function resetPlayerForNewGame(player) {
  player.coins = 3;
  player.cards = { wheat: 1, bakery: 1 };
  player.landmarks = { station: false, mall: false, amusement: false, tower: false };
}

function resetRoomToWaiting(room) {
  room.players.forEach(resetPlayerForNewGame);
  room.status = 'waiting';
  room.currentPlayerIndex = 0;
  room.deck = [];
  room.market = {};
  room.phase = 'waiting';
  room.lastRoll = null;
  room.canReroll = true;
  room.pendingExtraTurn = false;
  room.pendingPurple = null;
  room.pendingRoll = null;
  room.rolling = null;
  room.winnerId = null;
  room.coinEvents = [];
  room.specialEvents = [];
}

function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    spectators: room.spectators || [],
    spectatorCount: (room.spectators || []).filter(sp => sp.connected).length,
    players: room.players.map(({ socketId, ...player }) => player),
    currentPlayerIndex: room.currentPlayerIndex,
    market: room.market,
    deckCount: room.deck?.length || 0,
    phase: room.phase,
    lastRoll: room.lastRoll,
    pendingRoll: room.pendingRoll,
    rolling: room.rolling,
    canReroll: room.canReroll,
    pendingExtraTurn: room.pendingExtraTurn,
    pendingPurple: room.pendingPurple || null,
    winnerId: room.winnerId,
    logs: room.logs.slice(-60),
    coinEvents: (room.coinEvents || []).slice(-30),
    specialEvents: (room.specialEvents || []).slice(-20),
    cards: CARD_DEFS,
    landmarks: LANDMARKS,
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
  room.eventSeq = (room.eventSeq || 0) + 1;
  room.specialEvents.push({
    id: room.eventSeq,
    ts: Date.now(),
    type,
    playerId: player?.id || null,
    playerName: player?.name || '',
    label,
    ...extra
  });
  room.specialEvents = room.specialEvents.slice(-40);
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
  return player.cards[cardId] || 0;
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

function reverseOrderFrom(room, rollerIndex) {
  const order = [];
  const n = room.players.length;
  for (let step = 1; step < n; step++) {
    order.push((rollerIndex - step + n) % n);
  }
  return order;
}

function resolveRoll(room, diceValues) {
  const total = diceValues.reduce((a, b) => a + b, 0);
  const rollerIndex = room.currentPlayerIndex;
  const roller = room.players[rollerIndex];
  room.lastRoll = { dice: diceValues, total, playerId: roller.id, playerName: roller.name };
  log(room, `${roller.name} が ${diceValues.join(' + ')} = ${total} を出しました。`);

  // Red cards: payments to other players first, counterclockwise.
  for (const idx of reverseOrderFrom(room, rollerIndex)) {
    const owner = room.players[idx];
    for (const cardId of ['cafe', 'family']) {
      const c = count(owner, cardId);
      if (!c || !CARD_DEFS[cardId].dice.includes(total)) continue;
      const base = cardId === 'cafe' ? 1 : 2;
      const each = applyMallBonus(owner, cardId, base);
      const paid = stealCoins(room, roller, owner, each * c, CARD_DEFS[cardId].name);
      if (paid > 0) {
        const text = `${owner.name} の${CARD_DEFS[cardId].name}：${roller.name} から ${paid} コイン。`;
        log(room, text);
        specialEvent(room, 'effect-steal', owner, text, { cardId, amount: paid, targetId: roller.id });
      }
      if (roller.coins === 0) break;
    }
  }

  // Blue cards: every player's income from bank.
  for (const p of room.players) {
    const incomes = [
      ['wheat', 1], ['ranch', 1], ['forest', 1], ['mine', 5], ['apple', 3]
    ];
    for (const [cardId, base] of incomes) {
      const c = count(p, cardId);
      if (c && CARD_DEFS[cardId].dice.includes(total)) {
        const amount = base * c;
        bankIncome(room, p, amount, CARD_DEFS[cardId].name);
        const text = `${p.name} の${CARD_DEFS[cardId].name}：銀行から ${amount} コイン。`;
        log(room, text);
        specialEvent(room, 'effect-income', p, text, { cardId, amount });
      }
    }
  }

  // Green cards: roller only.
  const greenChecks = ['bakery', 'convenience', 'cheese', 'furniture', 'market'];
  for (const cardId of greenChecks) {
    const c = count(roller, cardId);
    if (!c || !CARD_DEFS[cardId].dice.includes(total)) continue;
    let amount = 0;
    if (cardId === 'bakery') amount = applyMallBonus(roller, cardId, 1) * c;
    if (cardId === 'convenience') amount = applyMallBonus(roller, cardId, 3) * c;
    if (cardId === 'cheese') amount = 3 * count(roller, 'ranch') * c;
    if (cardId === 'furniture') amount = 3 * (count(roller, 'forest') + count(roller, 'mine')) * c;
    if (cardId === 'market') amount = 2 * (count(roller, 'wheat') + count(roller, 'apple')) * c;
    if (amount > 0) {
      bankIncome(room, roller, amount, CARD_DEFS[cardId].name);
      const text = `${roller.name} の${CARD_DEFS[cardId].name}：銀行から ${amount} コイン。`;
      log(room, text);
      specialEvent(room, 'effect-income', roller, text, { cardId, amount });
    }
  }

  // Purple cards: roller only. Stadium is automatic; TV and Business Center need a player choice.
  const purpleQueue = [];
  if (total === 6) {
    if (count(roller, 'stadium')) {
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
    if (count(roller, 'tv') && room.players.some((_, i) => i !== rollerIndex)) purpleQueue.push('tv');
    if (count(roller, 'business') && canUseBusinessCenter(room, roller)) purpleQueue.push('business');
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
  if (purpleQueue.length) {
    room.pendingPurple = { playerId: roller.id, effects: purpleQueue, current: purpleQueue[0] };
    room.phase = 'purple';
    log(room, `${roller.name} は紫カードの対象を選択します。`);
  } else {
    room.pendingPurple = null;
    room.phase = 'build';
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

function finishCurrentPurple(room) {
  if (!room.pendingPurple) {
    room.phase = 'build';
    return;
  }
  room.pendingPurple.effects.shift();
  if (room.pendingPurple.effects.length) {
    room.pendingPurple.current = room.pendingPurple.effects[0];
    room.phase = 'purple';
  } else {
    room.pendingPurple = null;
    room.phase = 'build';
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
  room.lastRoll = null;
  room.pendingRoll = null;
  room.pendingPurple = null;
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

io.on('connection', (socket) => {
  socket.on('createRoom', ({ name }, cb) => {
    let code = roomCode();
    while (rooms.has(code)) code = roomCode();
    const newPlayerId = randomUUID();
    const player = makePlayer(newPlayerId, name, socket.id);
    const room = {
      code,
      hostId: player.id,
      status: 'waiting',
      players: [player],
      currentPlayerIndex: 0,
      deck: [],
      market: {},
      phase: 'waiting',
      lastRoll: null,
      canReroll: true,
      pendingExtraTurn: false,
      pendingPurple: null,
      pendingRoll: null,
      rolling: null,
      winnerId: null,
      logs: [],
      coinEvents: [],
      specialEvents: [],
      eventSeq: 0,
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
    if (room.players.length >= 4) return cb?.({ ok: false, message: 'このルームは満員です。' });
    const newPlayerId = randomUUID();
    const player = makePlayer(newPlayerId, name, socket.id);
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
    room.deck = makeDeck();
    room.market = {};
    fillMarket(room);
    room.status = 'playing';
    room.phase = 'roll';
    room.currentPlayerIndex = 0;
    room.pendingExtraTurn = false;
    room.pendingPurple = null;
    room.pendingRoll = null;
    room.rolling = null;
    room.winnerId = null;
    room.coinEvents = [];
    room.specialEvents = [];
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
    const countDice = Number(diceCount) === 2 && has(player, 'station') ? 2 : 1;
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
      if (has(currentPlayer, 'tower')) {
        currentRoom.pendingRoll = { dice, diceCount: countDice };
        currentRoom.phase = 'reroll';
        currentRoom.canReroll = true;
        log(currentRoom, `${currentPlayer.name} が ${dice.join(' + ')} = ${dice.reduce((a, b) => a + b, 0)} を出しました。電波塔で振り直すか選べます。`);
      } else {
        resolveRoll(currentRoom, dice);
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
    resolveRoll(room, dice);
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
      resolveRoll(currentRoom, dice);
      emitRoom(currentRoom);
    }, 1100);
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

  socket.on('purpleBusiness', ({ myCardId, targetId, targetCardId }, cb) => {
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
    if (myCardId === targetCardId) return cb?.({ ok: false, message: '同じ施設同士は交換できません。' });

    player.cards[myCardId] -= 1;
    if (player.cards[myCardId] <= 0) delete player.cards[myCardId];
    target.cards[targetCardId] -= 1;
    if (target.cards[targetCardId] <= 0) delete target.cards[targetCardId];
    player.cards[targetCardId] = count(player, targetCardId) + 1;
    target.cards[myCardId] = count(target, myCardId) + 1;
    log(room, `${player.name} のビジネスセンター：${player.name} の${myCard.name}と ${target.name} の${targetCard.name}を交換しました。`);
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
    if (!room || room.status !== 'playing' || room.phase !== 'build') return;
    const player = getCurrentPlayer(room);
    if (player.id !== socket.data.playerId) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
    const card = CARD_DEFS[cardId];
    if (!card) return cb?.({ ok: false, message: 'カードがありません。' });
    if (!room.market || !room.market[cardId]) return cb?.({ ok: false, message: `${card.name} は現在の場にありません。` });
    if (player.coins < card.cost) return cb?.({ ok: false, message: 'コインが足りません。' });
    if (card.color === 'purple' && count(player, cardId) >= 1) return cb?.({ ok: false, message: '紫カードは各種類1件までです。' });
    player.coins -= card.cost;
    player.cards[cardId] = count(player, cardId) + 1;
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
    advanceTurn(room);
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on('buildLandmark', ({ landmarkId }, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || room.phase !== 'build') return;
    const player = getCurrentPlayer(room);
    if (player.id !== socket.data.playerId) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
    const landmark = LANDMARKS[landmarkId];
    if (!landmark) return cb?.({ ok: false, message: 'ランドマークがありません。' });
    if (player.landmarks[landmarkId]) return cb?.({ ok: false, message: 'すでに完成済みです。' });
    if (player.coins < landmark.cost) return cb?.({ ok: false, message: 'コインが足りません。' });
    player.coins -= landmark.cost;
    player.landmarks[landmarkId] = true;
    log(room, `${player.name} が ${landmark.name} を完成させました。`);
    checkWinner(room, player);
    if (room.status !== 'finished') advanceTurn(room);
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on('skipBuild', (_payload, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || room.phase !== 'build') return;
    const player = getCurrentPlayer(room);
    if (player.id !== socket.data.playerId) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
    log(room, `${player.name} は建設せずに手番を終えました。`);
    advanceTurn(room);
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on('resetRoom', (_payload, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    if (socket.data.playerId !== room.hostId) return cb?.({ ok: false, message: 'ホストのみ再戦できます。' });
    resetRoomToWaiting(room);
    log(room, '同じメンバーで再戦準備に戻しました。');
    cb?.({ ok: true });
    emitRoom(room);
  });



  socket.on('hostForceSkip', (_payload, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing') return cb?.({ ok: false, message: '進行中のゲームがありません。' });
    if (socket.data.playerId !== room.hostId) return cb?.({ ok: false, message: 'ホストのみ強制スキップできます。' });
    const skipped = getCurrentPlayer(room);
    room.rolling = null;
    room.pendingRoll = null;
    room.pendingPurple = null;
    room.pendingExtraTurn = false;
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
