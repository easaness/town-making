const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

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

function roomCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function initialSupply() {
  const supply = {};
  for (const id of Object.keys(CARD_DEFS)) supply[id] = CARD_DEFS[id].color === 'purple' ? 4 : 6;
  return supply;
}


function makePlayer(socketId, name) {
  return {
    id: socketId,
    name: (name || 'Player').slice(0, 18),
    coins: 3,
    cards: { wheat: 1, bakery: 1 },
    landmarks: { station: false, mall: false, amusement: false, tower: false },
    connected: true
  };
}

function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    players: room.players,
    currentPlayerIndex: room.currentPlayerIndex,
    supply: room.supply,
    phase: room.phase,
    lastRoll: room.lastRoll,
    pendingRoll: room.pendingRoll,
    canReroll: room.canReroll,
    pendingExtraTurn: room.pendingExtraTurn,
    winnerId: room.winnerId,
    logs: room.logs.slice(-60),
    cards: CARD_DEFS,
    landmarks: LANDMARKS
  };
}

function emitRoom(room) {
  io.to(room.code).emit('state', publicRoom(room));
}

function log(room, text) {
  room.logs.push({ at: new Date().toISOString(), text });
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
  room.lastRoll = { dice: diceValues, total, playerId: roller.id };
  log(room, `${roller.name} が ${diceValues.join(' + ')} = ${total} を出しました。`);

  // Red cards: payments to other players first, counterclockwise.
  for (const idx of reverseOrderFrom(room, rollerIndex)) {
    const owner = room.players[idx];
    for (const cardId of ['cafe', 'family']) {
      const c = count(owner, cardId);
      if (!c || !CARD_DEFS[cardId].dice.includes(total)) continue;
      const base = cardId === 'cafe' ? 1 : 2;
      const each = applyMallBonus(owner, cardId, base);
      const paid = takeCoins(roller, owner, each * c);
      if (paid > 0) log(room, `${owner.name} の${CARD_DEFS[cardId].name}：${roller.name} から ${paid} コイン。`);
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
        gain(p, amount);
        log(room, `${p.name} の${CARD_DEFS[cardId].name}：銀行から ${amount} コイン。`);
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
      gain(roller, amount);
      log(room, `${roller.name} の${CARD_DEFS[cardId].name}：銀行から ${amount} コイン。`);
    }
  }

  // Purple cards: roller only.
  if (total === 6) {
    if (count(roller, 'stadium')) {
      for (let i = 0; i < room.players.length; i++) {
        if (i === rollerIndex) continue;
        const other = room.players[i];
        const paid = takeCoins(other, roller, 2);
        if (paid > 0) log(room, `${roller.name} のスタジアム：${other.name} から ${paid} コイン。`);
      }
    }
    if (count(roller, 'tv')) {
      const targets = room.players.filter((_, i) => i !== rollerIndex).sort((a, b) => b.coins - a.coins);
      const target = targets[0];
      if (target) {
        const paid = takeCoins(target, roller, 5);
        if (paid > 0) log(room, `${roller.name} のテレビ局：${target.name} から ${paid} コイン。`);
      }
    }
    if (count(roller, 'business')) {
      log(room, 'ビジネスセンターの交換効果は、このプロトタイプでは未実装です。');
    }
  }

  room.pendingExtraTurn = diceValues.length === 2 && diceValues[0] === diceValues[1] && has(roller, 'amusement');
  if (room.pendingExtraTurn) log(room, `${roller.name} は遊園地効果で追加ターンを得ます。`);
  room.phase = 'build';
}

function advanceTurn(room) {
  if (room.pendingExtraTurn) {
    room.pendingExtraTurn = false;
  } else {
    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
  }
  room.phase = 'roll';
  room.lastRoll = null;
  room.pendingRoll = null;
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

io.on('connection', (socket) => {
  socket.on('createRoom', ({ name }, cb) => {
    let code = roomCode();
    while (rooms.has(code)) code = roomCode();
    const player = makePlayer(socket.id, name);
    const room = {
      code,
      hostId: socket.id,
      status: 'waiting',
      players: [player],
      currentPlayerIndex: 0,
      supply: initialSupply(),
      phase: 'waiting',
      lastRoll: null,
      canReroll: true,
      pendingExtraTurn: false,
      pendingRoll: null,
      winnerId: null,
      logs: []
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    log(room, `${player.name} がルームを作成しました。`);
    cb?.({ ok: true, code });
    emitRoom(room);
  });

  socket.on('joinRoom', ({ code, name }, cb) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return cb?.({ ok: false, message: 'ルームが見つかりません。' });
    if (room.status !== 'waiting') return cb?.({ ok: false, message: '開始済みのルームです。' });
    if (room.players.length >= 4) return cb?.({ ok: false, message: 'このルームは満員です。' });
    const player = makePlayer(socket.id, name);
    room.players.push(player);
    socket.join(room.code);
    socket.data.roomCode = room.code;
    log(room, `${player.name} が参加しました。`);
    cb?.({ ok: true, code: room.code });
    emitRoom(room);
  });

  socket.on('startGame', (_payload, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    if (socket.id !== room.hostId) return cb?.({ ok: false, message: 'ホストのみ開始できます。' });
    if (room.players.length < 1) return cb?.({ ok: false, message: '1人以上で開始してください。' });
    room.status = 'playing';
    room.phase = 'roll';
    room.currentPlayerIndex = 0;
    log(room, 'ゲームを開始しました。');
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on('rollDice', ({ diceCount }, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || room.phase !== 'roll') return;
    const player = getCurrentPlayer(room);
    if (player.id !== socket.id) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
    const countDice = Number(diceCount) === 2 && has(player, 'station') ? 2 : 1;
    const dice = Array.from({ length: countDice }, () => 1 + Math.floor(Math.random() * 6));
    if (has(player, 'tower')) {
      room.pendingRoll = { dice, diceCount: countDice };
      room.phase = 'reroll';
      room.canReroll = true;
      log(room, `${player.name} が ${dice.join(' + ')} = ${dice.reduce((a, b) => a + b, 0)} を出しました。電波塔で振り直すか選べます。`);
    } else {
      resolveRoll(room, dice);
    }
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on('acceptRoll', (_payload, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || room.phase !== 'reroll' || !room.pendingRoll) return;
    const player = getCurrentPlayer(room);
    if (player.id !== socket.id) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
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
    const player = getCurrentPlayer(room);
    if (player.id !== socket.id || !has(player, 'tower')) return cb?.({ ok: false, message: '振り直しできません。' });
    const dice = Array.from({ length: room.pendingRoll.diceCount }, () => 1 + Math.floor(Math.random() * 6));
    room.pendingRoll = null;
    room.canReroll = false;
    log(room, `${player.name} が電波塔で振り直しました。`);
    resolveRoll(room, dice);
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on('buildCard', ({ cardId }, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || room.phase !== 'build') return;
    const player = getCurrentPlayer(room);
    if (player.id !== socket.id) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
    const card = CARD_DEFS[cardId];
    if (!card) return cb?.({ ok: false, message: 'カードがありません。' });
    if ((room.supply[cardId] || 0) <= 0) return cb?.({ ok: false, message: `${card.name} は売り切れです。` });
    if (player.coins < card.cost) return cb?.({ ok: false, message: 'コインが足りません。' });
    if (card.color === 'purple' && count(player, cardId) >= 1) return cb?.({ ok: false, message: '紫カードは各種類1件までです。' });
    player.coins -= card.cost;
    player.cards[cardId] = count(player, cardId) + 1;
    room.supply[cardId] -= 1;
    log(room, `${player.name} が ${card.name} を建設しました。残り在庫 ${room.supply[cardId]} 枚。`);
    if (room.supply[cardId] === 0) log(room, `${card.name} は売り切れました。`);
    advanceTurn(room);
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on('buildLandmark', ({ landmarkId }, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || room.phase !== 'build') return;
    const player = getCurrentPlayer(room);
    if (player.id !== socket.id) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
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
    if (player.id !== socket.id) return cb?.({ ok: false, message: 'あなたの手番ではありません。' });
    log(room, `${player.name} は建設せずに手番を終えました。`);
    advanceTurn(room);
    cb?.({ ok: true });
    emitRoom(room);
  });

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.connected = false;
      log(room, `${player.name} の接続が切れました。`);
      emitRoom(room);
    }
  });
});

server.listen(PORT, () => console.log(`Server running on ${PORT}`));
