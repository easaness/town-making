const socket = io();
let state = null;
let myId = null;
let lastDiceKey = '';
let diceJustChanged = false;
let localRollingCount = 0;
let rollingTimer = null;
let hostSkipArmed = false;
let rollingPreviewValues = [];
let rollingNonce = 0;
let lastCoinEventId = null;
let activeCoinFx = [];
let lastSpecialEventId = null;
let activeSpecialFx = [];
let lastRollingNonce = null;
let lastWinnerId = null;
let lastTurnPlayerId = null;
let audioCtx = null;
let soundEnabled = true;
let masterVolume = Number(localStorage.getItem('machikoroVolume') || 70) / 100;

const $ = (id) => document.getElementById(id);
const colorText = { blue: '青', green: '緑', red: '赤', purple: '紫' };

const initialRoomFromUrl = new URLSearchParams(location.search).get('room');
if (initialRoomFromUrl) {
  const input = $('codeInput');
  if (input) input.value = initialRoomFromUrl.toUpperCase();
}

socket.on('connect', () => {
  const savedCode = localStorage.getItem('machikoroRoomCode');
  const savedPlayerId = localStorage.getItem('machikoroPlayerId');
  if (savedPlayerId) myId = savedPlayerId;
  if (savedCode && savedPlayerId) {
    socket.emit('reconnectPlayer', { code: savedCode, playerId: savedPlayerId }, (res) => {
      if (res?.ok) {
        rememberSession(res.code, res.playerId);
        showMessage('再接続しました。');
      } else {
        showMessage('前回のルームに自動復帰できませんでした。サーバー側の保存がない場合は新しいルームを作成してください。');
      }
    });
  }
});
socket.on('state', (next) => {
  syncCoinEvents(next);
  syncSpecialEvents(next);
  const nextKey = diceStateKey(next);
  diceJustChanged = Boolean(nextKey && nextKey !== lastDiceKey);
  lastDiceKey = nextKey;
  handleStateEffects(next);
  state = next;
  if (state?.rolling) {
    startRollingPreview(state.rolling.diceCount);
  } else {
    stopLocalRoll();
  }
  render();
  if (diceJustChanged) playSound('result');
  if (diceJustChanged) setTimeout(() => { diceJustChanged = false; renderActions(); renderStatus(); }, 900);
});


function syncCoinEvents(next) {
  const events = next?.coinEvents || [];
  const maxId = events.reduce((max, ev) => Math.max(max, ev.id || 0), 0);
  if (lastCoinEventId === null) {
    lastCoinEventId = maxId;
    return;
  }
  const fresh = events.filter(ev => (ev.id || 0) > lastCoinEventId);
  if (!fresh.length) {
    lastCoinEventId = Math.max(lastCoinEventId, maxId);
    return;
  }
  const now = Date.now();
  if (fresh.some(ev => ev.type === 'steal' || ev.type === 'stolen')) playSound('steal');
  else if (fresh.length) playSound('income');
  activeCoinFx.push(...fresh.map((ev, index) => ({
    ...ev,
    uid: `${ev.id}-${index}-${now}`,
    createdAt: now,
    expiresAt: now + 1500
  })));
  lastCoinEventId = Math.max(lastCoinEventId, maxId);
  setTimeout(() => {
    const t = Date.now();
    activeCoinFx = activeCoinFx.filter(fx => fx.expiresAt > t);
    if (state) renderPlayers();
  }, 1600);
}

function coinFxHtml(playerId) {
  const now = Date.now();
  const items = activeCoinFx.filter(fx => fx.playerId === playerId && fx.expiresAt > now);
  if (!items.length) return '';
  return `<div class="coin-fx-layer">${items.map((fx, i) => {
    const positive = Number(fx.amount) > 0;
    const cls = positive ? (fx.type === 'steal' ? 'steal-gain' : 'income-gain') : 'steal-loss';
    const sign = positive ? '+' : '';
    const label = fx.label ? `<small>${escapeHtml(fx.label)}</small>` : '';
    return `<span class="coin-fx ${cls}" style="--fx-offset:${i}">${sign}${fx.amount}🪙${label}</span>`;
  }).join('')}</div>`;
}

function syncSpecialEvents(next) {
  const events = next?.specialEvents || [];
  const maxId = events.reduce((max, ev) => Math.max(max, ev.id || 0), 0);
  if (lastSpecialEventId === null) {
    lastSpecialEventId = maxId;
    return;
  }
  const fresh = events.filter(ev => (ev.id || 0) > lastSpecialEventId);
  if (!fresh.length) {
    lastSpecialEventId = Math.max(lastSpecialEventId, maxId);
    return;
  }
  const now = Date.now();
  if (fresh.some(ev => String(ev.type || '').startsWith('amusement'))) playSound('amusement');
  else if (fresh.some(ev => String(ev.type || '').includes('steal'))) playSound('steal');
  else if (fresh.some(ev => String(ev.type || '').includes('income') || String(ev.type || '').includes('market'))) playSound('income');
  activeSpecialFx.push(...fresh.map((ev, index) => ({
    ...ev,
    uid: `special-${ev.id}-${index}-${now}`,
    createdAt: now,
    expiresAt: now + 3600
  })));
  lastSpecialEventId = Math.max(lastSpecialEventId, maxId);
  setTimeout(() => {
    const t = Date.now();
    activeSpecialFx = activeSpecialFx.filter(fx => fx.expiresAt > t);
    if (state) { renderStatus(); renderRecentNotice(); }
  }, 3700);
}

function activeSpecialNotice() {
  const now = Date.now();
  const items = activeSpecialFx.filter(fx =>
    fx.expiresAt > now && String(fx.type || '').startsWith('amusement')
  );
  return items.length ? items[items.length - 1] : null;
}


function unlockAudio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
}

document.addEventListener('pointerdown', unlockAudio, { passive: true });

function playTone(freq, start, duration, type = 'sine', gain = 0.045) {
  if (!soundEnabled || !audioCtx) return;
  const t0 = audioCtx.currentTime + start;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain * masterVolume, t0 + 0.018);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.03);
}

function playSound(kind) {
  if (!soundEnabled) return;
  unlockAudio();
  if (!audioCtx) return;
  if (kind === 'roll') {
    [160, 210, 180, 260, 220].forEach((f, i) => playTone(f, i * 0.055, 0.07, 'triangle', 0.035));
  } else if (kind === 'result') {
    playTone(520, 0, 0.08, 'triangle', 0.04);
    playTone(720, 0.08, 0.11, 'sine', 0.04);
  } else if (kind === 'income') {
    playTone(660, 0, 0.08, 'sine', 0.035);
    playTone(880, 0.08, 0.12, 'sine', 0.035);
  } else if (kind === 'steal') {
    playTone(300, 0, 0.08, 'sawtooth', 0.025);
    playTone(520, 0.07, 0.12, 'triangle', 0.035);
  } else if (kind === 'turn') {
    playTone(440, 0, 0.08, 'triangle', 0.032);
    playTone(660, 0.09, 0.12, 'triangle', 0.032);
  } else if (kind === 'win') {
    [523, 659, 784, 1046].forEach((f, i) => playTone(f, i * 0.105, 0.16, 'triangle', 0.04));
  } else if (kind === 'amusement') {
    [392, 523, 659, 784].forEach((f, i) => playTone(f, i * 0.075, 0.12, 'square', 0.025));
  } else if (kind === 'click') {
    playTone(420, 0, 0.04, 'triangle', 0.025);
  }
}

function toggleSound() {
  unlockAudio();
  soundEnabled = !soundEnabled;
  const btn = $('soundToggleBtn');
  if (btn) btn.textContent = soundEnabled ? '効果音 ON' : '効果音 OFF';
  showMessage(soundEnabled ? '効果音をONにしました。' : '効果音をOFFにしました。');
  if (soundEnabled) playSound('click');
}

function handleStateEffects(next) {
  if (next?.rolling?.nonce && next.rolling.nonce !== lastRollingNonce) {
    lastRollingNonce = next.rolling.nonce;
    playSound('roll');
  }
  if (!next?.rolling) lastRollingNonce = null;

  if (next?.status === 'finished' && next.winnerId && next.winnerId !== lastWinnerId) {
    lastWinnerId = next.winnerId;
    playSound('win');
  }

  const current = next?.players?.[next.currentPlayerIndex];
  if (next?.status === 'playing' && current?.id !== lastTurnPlayerId) {
    const wasInitialized = lastTurnPlayerId !== null;
    lastTurnPlayerId = current?.id || null;
    if (wasInitialized && current?.id === myId) playSound('turn');
  }
}

function emitWithMessage(event, payload = {}) {
  socket.emit(event, payload, (res) => {
    if (res && !res.ok) showMessage(res.message || '操作できませんでした。');
  });
}

function rememberSession(code, playerId) {
  if (!code || !playerId) return;
  myId = playerId;
  localStorage.setItem('machikoroRoomCode', code);
  localStorage.setItem('machikoroPlayerId', playerId);
}

function clearSavedSession() {
  localStorage.removeItem('machikoroRoomCode');
  localStorage.removeItem('machikoroPlayerId');
}


function rollDice(count) {
  if (localRollingCount) return;
  startLocalRoll(count, 'rollDice', () => emitWithMessage('rollDice', { diceCount: count }));
}

function rerollDice() {
  if (localRollingCount) return;
  const count = state?.pendingRoll?.dice?.length || 1;
  startLocalRoll(count, 'rerollDice', () => emitWithMessage('rerollDice'));
}

function startLocalRoll(count, key, send) {
  startRollingPreview(count);
  renderActions();
  send();
}

function startRollingPreview(count) {
  if (localRollingCount === count && rollingTimer) return;
  localRollingCount = count;
  rollingNonce += 1;
  rollingPreviewValues = Array.from({ length: count }, () => randomDie());
  updateRollingDiceFaces();
  clearInterval(rollingTimer);
  rollingTimer = setInterval(() => {
    rollingPreviewValues = rollingPreviewValues.map(() => randomDie());
    updateRollingDiceFaces();
  }, 95);
}

function stopLocalRoll() {
  localRollingCount = 0;
  rollingPreviewValues = [];
  clearInterval(rollingTimer);
  rollingTimer = null;
}

function randomDie() {
  return Math.floor(Math.random() * 6) + 1;
}

function updateRollingDiceFaces() {
  rollingPreviewValues.forEach((value, i) => {
    const target = document.querySelector(`[data-rolling-die="${i}"]`);
    if (target) target.innerHTML = dicePips(value);
  });
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
  socket.emit('createRoom', { name: $('nameInput').value.trim() || 'ゲスト' }, (res) => {
    if (!res?.ok) return showMessage(res?.message || 'ルームを作成できませんでした。');
    rememberSession(res.code, res.playerId);
  });
};
$('joinBtn').onclick = () => {
  const code = $('codeInput').value.trim().toUpperCase();
  if (!code) return showMessage('ルームコードを入力してください。');
  socket.emit('joinRoom', { code, name: $('nameInput').value.trim() || 'ゲスト' }, (res) => {
    if (!res?.ok) return showMessage(res?.message || '参加できませんでした。');
    if (res.spectator) {
      myId = null;
      localStorage.setItem('machikoroRoomCode', res.code);
      localStorage.removeItem('machikoroPlayerId');
      showMessage('観戦者として参加しました。');
    } else {
      rememberSession(res.code, res.playerId);
    }
  });
};
$('startBtn').onclick = () => emitWithMessage('startGame');
$('copyRoomCodeBtn').onclick = copyRoomCode;
$('copyInviteBtn').onclick = copyInviteLink;
$('soundToggleBtn').onclick = toggleSound;
if ($('volumeSlider')) {
  $('volumeSlider').value = Math.round(masterVolume * 100);
  $('volumeSlider').oninput = (e) => {
    masterVolume = Number(e.target.value || 70) / 100;
    localStorage.setItem('machikoroVolume', String(Math.round(masterVolume * 100)));
  };
}

async function copyRoomCode() {
  if (!state?.code) return showMessage('コピーできるルームコードがありません。');
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(state.code);
    } else {
      const input = document.createElement('input');
      input.value = state.code;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    showMessage(`ルームコード ${state.code} をコピーしました。`);
  } catch (err) {
    showMessage(`コピーできませんでした。コード: ${state.code}`);
  }
}


async function copyInviteLink() {
  if (!state?.code) return showMessage('コピーできるルームコードがありません。');
  const url = `${location.origin}${location.pathname}?room=${encodeURIComponent(state.code)}`;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    showMessage('招待リンクをコピーしました。');
  } catch (err) {
    showMessage(`コピーできませんでした。リンク: ${url}`);
  }
}

function phaseGuideText() {
  if (!state) return '';
  const cp = currentPlayer();
  const mine = isMyTurn();
  if (!me() && state.status === 'playing') return `${cp?.name || 'プレイヤー'} の番です。観戦中です。`;
  if (state.status === 'waiting') return state.hostId === myId ? 'ゲーム開始を押してください。友人を待つ場合はルームコードか招待リンクを共有してください。' : 'ホストがゲームを開始するまで待機してください。';
  if (state.status === 'finished') return state.winnerId === myId ? 'あなたの勝利です。ホストは同じメンバーでもう一度遊べます。' : 'ゲーム終了です。ホストがもう一度遊ぶを押すと同じ部屋で再戦できます。';
  if (state.rolling) return `${state.rolling.playerName || 'プレイヤー'} がダイスを振っています。結果を待ってください。`;
  if (!mine) {
    if (state.phase === 'purple') return `${cp?.name || 'プレイヤー'} が紫カードの対象を選んでいます。`;
    if (state.phase === 'build') return `${cp?.name || 'プレイヤー'} が建設するか選んでいます。`;
    return `${cp?.name || 'プレイヤー'} の操作待ちです。`;
  }
  if (state.phase === 'roll') return 'ダイスを振ってください。駅が完成していれば2個も選べます。';
  if (state.phase === 'reroll') return '電波塔で振り直すか、この出目で進めるか選んでください。';
  if (state.phase === 'purple') return '紫カードの対象を選んでください。';
  if (state.phase === 'build') return '施設を1つ建設するか、建設せず終了してください。';
  return '';
}

function isTriggeredCard(card) {
  return Boolean(state?.lastRoll?.total && card?.dice?.includes(state.lastRoll.total) && ['build', 'purple', 'reroll'].includes(state.phase));
}

function buildDisableReason(card, owned, affordable, canBuild) {
  if (!canBuild) return '今は建設不可';
  if (!affordable) return 'コイン不足';
  if (card.color === 'purple' && owned >= 1) return '所持済み';
  return '';
}

function resultTableHtml() {
  if (!state?.players?.length) return '';
  const rows = [...state.players]
    .sort((a, b) => Object.values(b.landmarks).filter(Boolean).length - Object.values(a.landmarks).filter(Boolean).length || b.coins - a.coins)
    .map((p, i) => {
      const lm = Object.values(p.landmarks || {}).filter(Boolean).length;
      const built = Object.values(p.cards || {}).reduce((a, b) => a + b, 0);
      return `<tr><td>${i + 1}</td><td>${escapeHtml(p.name)}</td><td>${lm}/4</td><td>${p.coins}🪙</td><td>${built}</td></tr>`;
    }).join('');
  return `<div class="result-box"><h3>リザルト</h3><table class="result-table"><thead><tr><th>#</th><th>プレイヤー</th><th>ランドマーク</th><th>コイン</th><th>施設</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function diceStateKey(next) {
  const roll = next?.pendingRoll || next?.lastRoll;
  if (!roll) return '';
  return `${next.phase}:${roll.dice.join('-')}:${roll.total}`;
}

function dicePips(value) {
  const pipMap = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9]
  };
  return Array.from({ length: 9 }, (_, i) => {
    const pos = i + 1;
    return `<i class="${pipMap[value]?.includes(pos) ? 'on' : ''}"></i>`;
  }).join('');
}

function diceFace(value, extraClass = '', attrs = '') {
  return `<span class="dice-face ${extraClass}" ${attrs} aria-label="${value}">${dicePips(value)}</span>`;
}

function diceTray(roll, label = '出目') {
  if (!roll) return '<div class="dice-stage idle"><span>ダイス待ち</span></div>';
  const rolling = diceJustChanged ? 'result-roll' : 'settled';
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
function diceBadges(card) {
  return `<div class="trigger-badges" aria-label="発動出目 ${diceRange(card)}">${card.dice.map(n => `<span>${n}</span>`).join('')}</div>`;
}
function smallCardMeta(card) {
  return `<span class="card-kind-label">${colorText[card.color]}</span>`;
}
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
    tv: '自分のターンに相手1人を選び、最大5コインもらう。',
    business: '自分と相手の紫以外の施設を1件ずつ交換する。'
  };
  return map[id] || card.name;
}

function render() {
  if (!state) return;
  $('lobby').classList.add('hidden');
  $('game').classList.remove('hidden');
  $('roomBadge').classList.remove('hidden');
  $('roomCodeText').textContent = `Room ${state.code}`;

  renderStatus();
  renderPlayers();
  renderActions();
  renderBuilds();
  renderLogs();
  renderHostAdmin();
}

function renderStatus() {
  const cp = currentPlayer();
  const m = me();
  const turnBanner = $('turnBanner');
  const victoryBanner = $('victoryBanner');
  if (turnBanner) {
    turnBanner.classList.add('hidden');
    turnBanner.classList.remove('amusement');
  }
  if (victoryBanner) victoryBanner.classList.add('hidden');
  $('startBtn').classList.toggle('hidden', !(state.status === 'waiting' && state.hostId === myId));
  if (state.status === 'waiting') {
    $('statusTitle').textContent = '待機中';
    $('statusText').textContent = `1〜4人で開始できます。現在 ${state.players.length} 人。友人にルームコード ${state.code} を共有してください。`;
    return;
  }
  if (state.status === 'finished') {
    const winner = state.players.find(p => p.id === state.winnerId);
    $('statusTitle').textContent = 'ゲーム終了';
    $('statusText').textContent = 'もう一度遊ぶ場合は新しいルームを作成してください。';
    if (victoryBanner) {
      victoryBanner.classList.remove('hidden');
      victoryBanner.innerHTML = `<div class="winner-crown">🏆</div><div><strong>${escapeHtml(winner?.name || '不明')} の勝利！</strong><span>すべてのランドマークを完成させました</span></div>`;
    }
    return;
  }
  const myTurnNow = isMyTurn();
  $('statusTitle').textContent = myTurnNow ? 'あなたの番です' : `${cp?.name} の番です`;
  const special = activeSpecialNotice();
  if (turnBanner && special) {
    const isMine = special.playerId === myId;
    turnBanner.classList.remove('hidden');
    turnBanner.classList.add('amusement');
    const title = special.type === 'amusement-start'
      ? (isMine ? '🎢 遊園地発動！もう一度あなたの番です' : `🎢 ${escapeHtml(special.playerName || 'プレイヤー')} が追加ターンです`)
      : (isMine ? '🎢 遊園地発動！追加ターン獲得' : `🎢 ${escapeHtml(special.playerName || 'プレイヤー')} が追加ターンを獲得`);
    const body = special.type === 'amusement-start' ? '続けてダイスを振れます。' : '建設またはスキップ後、同じプレイヤーがもう一度行動します。';
    turnBanner.innerHTML = `<strong>${title}</strong><span>${body}</span>`;
  } else if (turnBanner && state.pendingExtraTurn) {
    turnBanner.classList.remove('hidden');
    turnBanner.classList.add('amusement');
    turnBanner.innerHTML = myTurnNow
      ? '<strong>🎢 遊園地発動中</strong><span>建設またはスキップ後、もう一度あなたの番です。</span>'
      : `<strong>🎢 遊園地発動中</strong><span>${escapeHtml(cp?.name || 'プレイヤー')} が建設後に追加ターンを行います。</span>`;
  }
  const phaseText = state.phase === 'roll' ? 'ダイスを振るフェーズ' : state.phase === 'reroll' ? '振り直し選択フェーズ' : state.phase === 'purple' ? '紫カード選択フェーズ' : '建設フェーズ';
  const rollingText = state.rolling ? ` / ${state.rolling.playerName || 'プレイヤー'} がダイス中` : '';
  const rollText = state.lastRoll ? ` / 出目 ${state.lastRoll.dice.join('+')}=${state.lastRoll.total}` : '';
  const marketText = ` / 場 ${Object.keys(state.market || {}).length} 種類 / 山札 ${state.deckCount ?? 0} 枚`;
  const selfText = m ? ` / あなた: ${m.coins ?? 0} コイン` : ' / 観戦中';
  const spectatorText = state.spectatorCount ? ` / 観戦 ${state.spectatorCount} 人` : '';
  $('statusText').innerHTML = `<strong>${escapeHtml(phaseGuideText())}</strong><br><span>${escapeHtml(`${phaseText}${rollingText}${rollText}${selfText}${marketText}${spectatorText}`)}</span>`;
  renderRecentNotice();
}


function latestNoticeEvent() {
  const now = Date.now();
  const live = activeSpecialFx.filter(fx => fx.expiresAt > now);
  if (live.length) return live[live.length - 1];
  const events = state?.specialEvents || [];
  if (!events.length) return null;

  // 遊園地の通知は古いまま残ると「1個振りで発動した」ように見えるため、
  // ライブ表示中だけ直近通知として扱う。
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (String(ev.type || '').startsWith('amusement')) continue;
    return ev;
  }
  return null;
}

function renderRecentNotice() {
  const el = $('recentNotice');
  if (!el || !state || state.status === 'waiting') return;
  const ev = latestNoticeEvent();
  if (!ev?.label || state.status === 'finished') {
    el.classList.add('hidden');
    return;
  }
  const type = String(ev.type || '');
  const icon = type.includes('market') ? '🃏' : type.includes('steal') ? '💸' : type.includes('income') ? '🪙' : type.includes('host') ? '⏭️' : type.includes('amusement') ? '🎢' : '✨';
  const title = type.includes('market') ? '市場補充' : type.includes('host') ? 'ホスト操作' : type.includes('amusement') ? '遊園地' : '直近の効果';
  el.className = `recent-notice ${type.includes('market') ? 'market' : type.includes('host') ? 'host' : ''}`;
  el.innerHTML = `<strong>${icon} ${title}</strong><span>${escapeHtml(ev.label)}</span>`;
}

function hostControlHtml() {
  return '';
}

function renderHostAdmin() {
  const panel = $('hostAdminPanel');
  const body = $('hostAdminBody');
  if (!panel || !body) return;
  const visible = state?.hostId === myId && state.status === 'playing';
  panel.classList.toggle('hidden', !visible);
  if (!visible) {
    hostSkipArmed = false;
    body.innerHTML = '';
    return;
  }
  const cp = currentPlayer();
  const phaseName = state.rolling ? 'ダイス演出中' : { roll: 'ダイス選択', reroll: '電波塔', purple: '紫カード選択', build: '建設' }[state.phase] || state.phase;
  body.innerHTML = `
    <p class="small">通常操作と誤って押さないよう、管理メニュー内に隔離しています。</p>
    <div class="admin-status">現在の手番: <strong>${escapeHtml(cp?.name || 'プレイヤー')}</strong> / 状態: <strong>${escapeHtml(phaseName)}</strong></div>
    ${hostSkipArmed ? `
      <div class="admin-confirm">
        <p>本当に現在の手番をスキップしますか？</p>
        <div class="actions">
          <button class="danger" onclick="confirmHostForceSkip()">スキップを実行</button>
          <button class="secondary" onclick="cancelHostForceSkip()">キャンセル</button>
        </div>
      </div>` : `
      <button class="secondary danger outline-danger" onclick="armHostForceSkip()">強制スキップを開く</button>`}
  `;
}

function armHostForceSkip() {
  hostSkipArmed = true;
  renderHostAdmin();
}

function cancelHostForceSkip() {
  hostSkipArmed = false;
  renderHostAdmin();
}

function confirmHostForceSkip() {
  hostSkipArmed = false;
  emitWithMessage('hostForceSkip');
}

function renderPlayers() {
  $('players').innerHTML = state.players.map((p, idx) => {
    const builtCards = Object.entries(p.cards)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => {
        const card = state.cards[id];
        const triggered = isTriggeredCard(card);
        return `<div class="owned-card ${card.color} ${triggered ? 'triggered' : ''}">
          <div class="owned-card-head">
            <strong>${card.name}×${n}</strong>
            ${smallCardMeta(card)}
          </div>
          <div class="owned-trigger-row"><span>発動</span>${diceBadges(card)}</div>
          ${triggered ? '<div class="triggered-label">今回発動</div>' : ''}
          <div class="owned-card-effect">${cardDescription(id, card)}</div>
        </div>`;
      }).join('') || '<div class="small empty-owned">建築済み施設はまだありません。</div>';
    const landmarks = Object.entries(p.landmarks)
      .map(([id, done]) => `<span class="tag landmark-tag ${done ? 'complete' : 'incomplete'}" title="${escapeHtml(state.landmarks[id].text)}">${done ? '✅' : '⬜'} ${state.landmarks[id].name}</span>`).join('');
    const playerClasses = ['player', idx === state.currentPlayerIndex ? 'current' : '', p.id === myId ? 'me-player' : ''].filter(Boolean).join(' ');
    const turnLabel = idx === state.currentPlayerIndex ? `<div class="turn-chip ${p.id === myId ? 'mine' : ''}">${p.id === myId ? 'あなたの番' : '現在の番'}</div>` : '';
    return `<div class="${playerClasses}">
      ${turnLabel}
      ${coinFxHtml(p.id)}
      <h3><span>${escapeHtml(p.name)} ${p.connected ? '' : '（切断）'}</span><span class="coins">${p.coins}🪙</span></h3>
      <div class="small">${idx + 1}番手</div>
      <div class="tags">${landmarks}</div>
      <div class="owned-cards">${builtCards}</div>
    </div>`;
  }).join('');
}


function nonPurpleOwnedOptions(player, selected = '') {
  if (!player) return '';
  return Object.entries(player.cards || {})
    .filter(([id, n]) => n > 0 && state.cards[id] && state.cards[id].color !== 'purple')
    .sort(([a], [b]) => state.cards[a].name.localeCompare(state.cards[b].name, 'ja'))
    .map(([id, n]) => `<option value="${id}" ${id === selected ? 'selected' : ''}>${state.cards[id].name}×${n}</option>`)
    .join('');
}

function businessChoiceHtml() {
  const mine = me();
  const targets = state.players.filter(p => p.id !== myId && Object.entries(p.cards || {}).some(([id, n]) => n > 0 && state.cards[id]?.color !== 'purple'));
  const firstTarget = targets[0];
  if (!mine || !nonPurpleOwnedOptions(mine) || !firstTarget) {
    return `<div class="choice-panel"><h3>ビジネスセンター</h3><p>交換できる施設がありません。</p><button class="secondary" onclick="emitWithMessage('skipPurple')">進む</button></div>`;
  }
  return `
    <div class="choice-panel">
      <h3>ビジネスセンター：施設を1件ずつ交換</h3>
      <p class="small">紫カード以外の施設から選びます。</p>
      <label>自分の施設<select id="businessMyCard">${nonPurpleOwnedOptions(mine)}</select></label>
      <label>相手<select id="businessTarget" onchange="updateBusinessTargetCards()">${targets.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select></label>
      <label>相手の施設<select id="businessTargetCard">${nonPurpleOwnedOptions(firstTarget)}</select></label>
      <div class="actions">
        <button onclick="submitBusiness()">交換する</button>
        <button class="secondary" onclick="emitWithMessage('skipPurple')">使わない</button>
      </div>
    </div>`;
}

function updateBusinessTargetCards() {
  const select = $('businessTarget');
  const target = state.players.find(p => p.id === select?.value);
  const cardSelect = $('businessTargetCard');
  if (cardSelect) cardSelect.innerHTML = nonPurpleOwnedOptions(target);
}

function submitBusiness() {
  const myCardId = $('businessMyCard')?.value;
  const targetId = $('businessTarget')?.value;
  const targetCardId = $('businessTargetCard')?.value;
  emitWithMessage('purpleBusiness', { myCardId, targetId, targetCardId });
}

function renderActions() {
  const el = $('turnActions');
  if (state.status === 'waiting') {
    el.innerHTML = `<p>${escapeHtml(phaseGuideText())}</p><div class="actions"><button class="secondary" onclick="copyInviteLink()">招待リンクをコピー</button>${state.hostId === myId ? '<button onclick="emitWithMessage(\'startGame\')">ゲーム開始</button>' : ''}</div>`;
    return;
  }
  if (state.status === 'finished') {
    const hostActions = state.hostId === myId ? '<div class="actions"><button onclick="emitWithMessage(\'resetRoom\')">同じメンバーでもう一度遊ぶ</button></div>' : '<p>ホストが再戦を開始できます。</p>';
    el.innerHTML = `${resultTableHtml()}${hostActions}`;
    return;
  }
  if (state.rolling) {
    const count = state.rolling.diceCount || localRollingCount || 1;
    if (!localRollingCount) startRollingPreview(count);
    const previewDice = rollingPreviewValues.map((value, i) => diceFace(value, `rolling-loop d${i + 1}`, `data-rolling-die="${i}" data-roll-key="${rollingNonce}"`)).join('');
    const name = escapeHtml(state.rolling.playerName || 'プレイヤー');
    const label = state.rolling.mode === 'reroll' ? '振り直し中' : 'ダイス';
    el.innerHTML = `
      <div class="dice-stage rolling-live"><div class="dice-label">${label}</div><div class="dice-row rolling-row">${previewDice}</div></div>
      <p>${name} がダイスを振っています。</p>${hostControlHtml()}`;
    return;
  }
  if (state.phase === 'purple') {
    const effect = state.pendingPurple?.current;
    if (!me()) {
      const cp = currentPlayer();
      el.innerHTML = `<p>観戦中です。${escapeHtml(cp?.name || 'プレイヤー')} が紫カードの対象を選んでいます。</p>`;
      return;
    }
    if (!isMyTurn()) {
      const cp = currentPlayer();
      el.innerHTML = `<p>${escapeHtml(cp?.name || 'プレイヤー')} が紫カードの対象を選んでいます。</p>${hostControlHtml()}`;
      return;
    }
    if (effect === 'tv') {
      const targets = state.players.filter(p => p.id !== myId);
      el.innerHTML = `
        <div class="choice-panel">
          <h3>テレビ局：誰から最大5コインもらいますか？</h3>
          <div class="choice-buttons">
            ${targets.map(p => `<button onclick="emitWithMessage('purpleTv', { targetId: '${p.id}' })">${escapeHtml(p.name)}（${p.coins}🪙）</button>`).join('')}
            <button class="secondary" onclick="emitWithMessage('skipPurple')">使わない</button>
          </div>
        </div>${hostControlHtml()}`;
      return;
    }
    if (effect === 'business') {
      el.innerHTML = businessChoiceHtml() + hostControlHtml();
      return;
    }
  }
  if (!me()) {
    el.innerHTML = `<p>観戦中です。プレイヤーの操作を見守っています。</p>`;
    return;
  }
  if (!isMyTurn()) {
    el.innerHTML = `<p>他のプレイヤーの操作を待っています。</p>${hostControlHtml()}`;
    return;
  }
  const m = me();
  if (state.phase === 'roll') {
    const canTwo = m.landmarks.station;
    if (localRollingCount) {
      const previewDice = rollingPreviewValues.map((value, i) => diceFace(value, `rolling-loop d${i + 1}`, `data-rolling-die="${i}" data-roll-key="${rollingNonce}"`)).join('');
      el.innerHTML = `
        <div class="dice-stage rolling-live"><div class="dice-label">ダイス</div><div class="dice-row rolling-row">${previewDice}</div></div>${hostControlHtml()}`;
      return;
    }
    el.innerHTML = `
      <div class="dice-stage ready"><div class="dice-label">ダイス</div><div class="dice-row">${diceFace(1, 'ready')}</div></div>
      <p>振るダイスを選んでください。</p>
      <div class="actions">
        <button onclick="rollDice(1)">1個振る</button>
        <button ${canTwo ? '' : 'disabled'} onclick="rollDice(2)">2個振る（駅）</button>
      </div>${hostControlHtml()}`;
    return;
  }
  if (state.phase === 'reroll') {
    if (localRollingCount) {
      const previewDice = rollingPreviewValues.map((value, i) => diceFace(value, `rolling-loop d${i + 1}`, `data-rolling-die="${i}" data-roll-key="${rollingNonce}"`)).join('');
      el.innerHTML = `
        <div class="dice-stage rolling-live"><div class="dice-label">振り直し中</div><div class="dice-row rolling-row">${previewDice}</div></div>${hostControlHtml()}`;
      return;
    }
    const dice = diceTray(state.pendingRoll, '電波塔の出目');
    el.innerHTML = `
      ${dice}
      <p>電波塔効果で、この出目を採用するか1回だけ振り直せます。</p>
      <div class="actions">
        <button onclick="emitWithMessage('acceptRoll')">この出目で進める</button>
        <button class="secondary" onclick="rerollDice()">振り直す</button>
      </div>${hostControlHtml()}`;
    return;
  }
  const dice = diceTray(state.lastRoll, '今回の出目');
  el.innerHTML = `
    ${dice}
    <p>1件だけ建設するか、建設せずに終了できます。</p>
    <div class="actions">
      <button class="secondary" onclick="emitWithMessage('skipBuild')">建設せず終了</button>
    </div>${hostControlHtml()}`;
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

  const marketEntries = Object.entries(state.market || {})
    .filter(([, pile]) => pile > 0)
    .sort(([a], [b]) => {
      const ca = state.cards[a];
      const cb = state.cards[b];
      return Math.min(...ca.dice) - Math.min(...cb.dice) || ca.cost - cb.cost || ca.name.localeCompare(cb.name, 'ja');
    });
  if (!marketEntries.length) {
    $('cards').innerHTML = '<p class="small">場に施設カードがありません。山札も残っていない可能性があります。</p>';
    return;
  }
  $('cards').innerHTML = marketEntries.map(([id, pile]) => {
    const card = state.cards[id];
    const owned = m?.cards[id] || 0;
    const affordable = (m?.coins || 0) >= card.cost;
    const reason = buildDisableReason(card, owned, affordable, canBuild);
    const buildDisabled = Boolean(reason);
    const buttonText = reason || '建設';
    return `<article class="card ${card.color}">
      <h4>${card.name}<span>${card.cost}🪙</span></h4>
      <div class="market-trigger"><span>発動出目</span>${diceBadges(card)}</div>
      <p>${cardDescription(id, card)}</p>
      <p class="stock-line">場の山 ${pile}枚<span>所持 ${owned} / ${colorText[card.color]}</span></p>
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
