const socket = io();
let state = null;
let myId = null;
let lastDiceKey = '';
let diceJustChanged = false;
let localRollingCount = 0;

const $ = (id) => document.getElementById(id);
const colorText = { blue: '青', green: '緑', red: '赤', purple: '紫' };

socket.on('connect', () => { myId = socket.id; });
socket.on('state', (next) => {
  const nextKey = diceStateKey(next);
  diceJustChanged = Boolean(nextKey && nextKey !== lastDiceKey);
  lastDiceKey = nextKey;
  state = next;
  localRollingCount = 0;
  render();
  if (diceJustChanged) setTimeout(() => { diceJustChanged = false; renderActions(); renderStatus(); }, 900);
});

function emitWithMessage(event, payload = {}) {
  socket.emit(event, payload, (res) => {
    if (res && !res.ok) showMessage(res.message || '操作できませんでした。');
  });
}


function rollDice(count) {
  if (localRollingCount) return;
  localRollingCount = count;
  renderActions();
  setTimeout(() => emitWithMessage('rollDice', { diceCount: count }), 720);
}

function rerollDice() {
  if (localRollingCount) return;
  localRollingCount = state?.pendingRoll?.dice?.length || 1;
  renderActions();
  setTimeout(() => emitWithMessage('rerollDice'), 720);
}

function showMessage(text) {
  const lobbyEl = $('lobbyMsg');
  const gameEl = $('gameMsg');
  [lobbyEl, gameEl].filter(Boolean).forEach((el) => {
    el.textContent = text;
    setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 3500);
  });
}

$('createBtn').onclick = () => {
  emitWithMessage('createRoom', { name: $('nameInput').value.trim() || 'Player' });
};
$('joinBtn').onclick = () => {
  const code = $('codeInput').value.trim().toUpperCase();
  if (!code) return showMessage('ルームコードを入力してください。');
  emitWithMessage('joinRoom', { code, name: $('nameInput').value.trim() || 'Player' });
};
$('startBtn').onclick = () => emitWithMessage('startGame');


function diceStateKey(next) {
  const roll = next?.pendingRoll || next?.lastRoll;
  if (!roll) return '';
  return `${next.phase}:${roll.dice.join('-')}:${roll.total}`;
}

function diceFace(value, extraClass = '') {
  const pipMap = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9]
  };
  const pips = Array.from({ length: 9 }, (_, i) => {
    const pos = i + 1;
    return `<i class="${pipMap[value]?.includes(pos) ? 'on' : ''}"></i>`;
  }).join('');
  return `<span class="dice-face ${extraClass}" aria-label="${value}">${pips}</span>`;
}

function diceTray(roll, label = '出目') {
  if (!roll) return '<div class="dice-stage idle"><span>ダイス待ち</span></div>';
  const rolling = diceJustChanged ? 'rolling-live' : 'settled';
  const dice = roll.dice.map((d, i) => diceFace(d, `${rolling} d${i + 1}`)).join('');
  return `<div class="dice-stage ${rolling}">
    <div class="dice-label">${label}</div>
    <div class="dice-row">${dice}</div>
    <div class="dice-total">合計 <strong>${roll.total}</strong></div>
  </div>`;
}

function currentPlayer() {
  if (!state) return null;
  return state.players[state.currentPlayerIndex];
}
function me() {
  return state?.players.find(p => p.id === myId);
}
function isMyTurn() {
  return currentPlayer()?.id === myId;
}
function yen(n) { return `${n} コイン`; }
function diceRange(card) { return card.dice.join('/'); }
function cardDescription(id, card) {
  const map = {
    wheat: '誰のターンでも銀行から1コイン。',
    ranch: '誰のターンでも銀行から1コイン。',
    bakery: '自分のターンに銀行から1コイン。モールで+1。',
    cafe: '他人のターンに出した人から1コイン。モールで+1。',
    convenience: '自分のターンに銀行から3コイン。モールで+1。',
    forest: '誰のターンでも銀行から1コイン。',
    cheese: '自分のターンに牧場1件につき3コイン。',
    furniture: '自分のターンに森林・鉱山1件につき3コイン。',
    mine: '誰のターンでも銀行から5コイン。',
    family: '他人のターンに出した人から2コイン。モールで+1。',
    apple: '誰のターンでも銀行から3コイン。',
    market: '自分のターンに麦畑・リンゴ園1件につき2コイン。',
    stadium: '自分のターンに全員から2コイン。',
    tv: '自分のターンに最もコインが多い相手から最大5コイン。',
    business: '交換効果。現バージョンでは未実装。'
  };
  return map[id] || card.name;
}

function render() {
  if (!state) return;
  $('lobby').classList.add('hidden');
  $('game').classList.remove('hidden');
  $('roomBadge').classList.remove('hidden');
  $('roomBadge').textContent = `Room ${state.code}`;

  renderStatus();
  renderPlayers();
  renderActions();
  renderBuilds();
  renderLogs();
}

function renderStatus() {
  const cp = currentPlayer();
  const m = me();
  $('startBtn').classList.toggle('hidden', !(state.status === 'waiting' && state.hostId === myId));
  if (state.status === 'waiting') {
    $('statusTitle').textContent = '待機中';
    $('statusText').textContent = `1〜4人で開始できます。現在 ${state.players.length} 人。友人にルームコード ${state.code} を共有してください。`;
    return;
  }
  if (state.status === 'finished') {
    const winner = state.players.find(p => p.id === state.winnerId);
    $('statusTitle').textContent = `勝者: ${winner?.name || '不明'}`;
    $('statusText').textContent = 'ゲーム終了です。もう一度遊ぶ場合は新しいルームを作成してください。';
    return;
  }
  $('statusTitle').textContent = isMyTurn() ? 'あなたの手番です' : `${cp?.name} の手番`;
  const phaseText = state.phase === 'roll' ? 'ダイスを振るフェーズ' : state.phase === 'reroll' ? '振り直し選択フェーズ' : '建設フェーズ';
  const rollText = state.lastRoll ? ` / 出目 ${state.lastRoll.dice.join('+')}=${state.lastRoll.total}` : '';
  $('statusText').textContent = `${phaseText}${rollText} / あなた: ${m?.coins ?? 0} コイン`;
}

function renderPlayers() {
  $('players').innerHTML = state.players.map((p, idx) => {
    const builtCards = Object.entries(p.cards)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => {
        const card = state.cards[id];
        return `<div class="owned-card ${card.color}">
          <div class="owned-card-head">
            <strong>${card.name}×${n}</strong>
            <span>${diceRange(card)} / ${colorText[card.color]}</span>
          </div>
          <div class="owned-card-effect">${cardDescription(id, card)}</div>
        </div>`;
      }).join('') || '<div class="small empty-owned">建築済み施設はまだありません。</div>';
    const landmarks = Object.entries(p.landmarks)
      .map(([id, done]) => `<span class="tag landmark-tag ${done ? 'complete' : 'incomplete'}" title="${escapeHtml(state.landmarks[id].text)}">${done ? '✅' : '⬜'} ${state.landmarks[id].name}</span>`).join('');
    return `<div class="player ${idx === state.currentPlayerIndex ? 'current' : ''}">
      <h3><span>${escapeHtml(p.name)} ${p.connected ? '' : '（切断）'}</span><span class="coins">${p.coins}🪙</span></h3>
      <div class="small">${idx + 1}番手</div>
      <div class="tags">${landmarks}</div>
      <div class="owned-cards">${builtCards}</div>
    </div>`;
  }).join('');
}

function renderActions() {
  const el = $('turnActions');
  if (state.status === 'waiting') {
    el.innerHTML = '<p>ホストがゲームを開始するまで待機してください。</p>';
    return;
  }
  if (state.status === 'finished') {
    el.innerHTML = '<p>ゲームは終了しました。</p>';
    return;
  }
  if (!isMyTurn()) {
    el.innerHTML = '<p>他のプレイヤーの操作を待っています。</p>';
    return;
  }
  const m = me();
  if (state.phase === 'roll') {
    const canTwo = m.landmarks.station;
    if (localRollingCount) {
      const previewDice = Array.from({ length: localRollingCount }, (_, i) => diceFace(((i * 2) % 6) + 1, `rolling-live d${i + 1}`)).join('');
      el.innerHTML = `
        <div class="dice-stage rolling-live"><div class="dice-label">ダイス</div><div class="dice-row">${previewDice}</div><div class="dice-total">判定中</div></div>`;
      return;
    }
    el.innerHTML = `
      <div class="dice-stage ready"><div class="dice-label">ダイス</div><div class="dice-row">${diceFace(1, 'ready')}</div></div>
      <p>振るダイスを選んでください。</p>
      <div class="actions">
        <button onclick="rollDice(1)">1個振る</button>
        <button ${canTwo ? '' : 'disabled'} onclick="rollDice(2)">2個振る（駅）</button>
      </div>`;
    return;
  }
  if (state.phase === 'reroll') {
    if (localRollingCount) {
      const previewDice = Array.from({ length: localRollingCount }, (_, i) => diceFace(((i * 3) % 6) + 1, `rolling-live d${i + 1}`)).join('');
      el.innerHTML = `
        <div class="dice-stage rolling-live"><div class="dice-label">振り直し中</div><div class="dice-row">${previewDice}</div><div class="dice-total">判定中</div></div>`;
      return;
    }
    const dice = diceTray(state.pendingRoll, '電波塔の出目');
    el.innerHTML = `
      ${dice}
      <p>電波塔効果で、この出目を採用するか1回だけ振り直せます。</p>
      <div class="actions">
        <button onclick="emitWithMessage('acceptRoll')">この出目で進める</button>
        <button class="secondary" onclick="rerollDice()">振り直す</button>
      </div>`;
    return;
  }
  const dice = diceTray(state.lastRoll, '今回の出目');
  el.innerHTML = `
    ${dice}
    <p>1件だけ建設するか、建設せずに終了できます。</p>
    <div class="actions">
      <button class="secondary" onclick="emitWithMessage('skipBuild')">建設せず終了</button>
    </div>`;
}

function renderBuilds() {
  const canBuild = state.status === 'playing' && state.phase === 'build' && isMyTurn();
  const m = me();
  $('landmarks').innerHTML = Object.entries(state.landmarks).map(([id, lm]) => {
    const done = m?.landmarks[id];
    const affordable = (m?.coins || 0) >= lm.cost;
    return `<article class="card landmark-card ${done ? 'complete' : 'incomplete'}">
      <h4>${lm.name}<span>${lm.cost}🪙</span></h4>
      <p>${lm.text}</p>
      <button ${canBuild && !done && affordable ? '' : 'disabled'} onclick="emitWithMessage('buildLandmark', { landmarkId: '${id}' })">${done ? '完成済み' : '完成させる'}</button>
    </article>`;
  }).join('');

  $('cards').innerHTML = Object.entries(state.cards).map(([id, card]) => {
    const supply = state.supply[id] || 0;
    const owned = m?.cards[id] || 0;
    const affordable = (m?.coins || 0) >= card.cost;
    const purpleLimit = card.color === 'purple' && owned >= 1;
    const soldOut = supply <= 0;
    const buildDisabled = !canBuild || soldOut || !affordable || purpleLimit;
    const stockText = soldOut ? '売り切れ' : `残り${supply}枚`;
    const buttonText = soldOut ? '売り切れ' : '建設';
    return `<article class="card ${card.color} ${soldOut ? 'soldout' : ''}">
      <h4>${card.name}<span>${card.cost}🪙</span></h4>
      <p><strong>出目:</strong> ${diceRange(card)} / ${colorText[card.color]}</p>
      <p>${cardDescription(id, card)}</p>
      <p class="stock-line ${soldOut ? 'soldout-text' : ''}">${stockText}<span>所持 ${owned}</span></p>
      <button ${buildDisabled ? 'disabled' : ''} onclick="emitWithMessage('buildCard', { cardId: '${id}' })">${buttonText}</button>
    </article>`;
  }).join('');
}

function renderLogs() {
  $('logs').innerHTML = state.logs.map(l => `<div class="log">${escapeHtml(l.text)}</div>`).join('');
}

function escapeHtml(text) {
  return String(text).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}
