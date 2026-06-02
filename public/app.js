const socket = io();
let state = null;
let myId = null;
let lastDiceKey = '';
let diceJustChanged = false;
let localRollingCount = 0;
let rollingTimer = null;
let hostSkipArmed = false;
let roomOpsArmed = false;
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
  tryAutoReconnect();
});

socket.on('roomBackup', (snapshot) => {
  if (!snapshot?.code || !myId || snapshot.hostId !== myId) return;
  try {
    localStorage.setItem(`machikoroRoomBackup:${snapshot.code}`, JSON.stringify(snapshot));
    localStorage.setItem('machikoroLastBackupCode', snapshot.code);
  } catch (_err) {
    // localStorageの容量不足などでは、通常プレイを優先します。
  }
});

function tryAutoReconnect(attempt = 1) {
  const savedCode = localStorage.getItem('machikoroRoomCode');
  const savedPlayerId = localStorage.getItem('machikoroPlayerId');
  const savedName = localStorage.getItem('machikoroPlayerName') || $('nameInput')?.value.trim() || '';
  if (savedPlayerId) myId = savedPlayerId;
  if (!savedCode || !savedPlayerId) return;
  socket.emit('reconnectPlayer', { code: savedCode, playerId: savedPlayerId, name: savedName }, (res) => {
    if (res?.ok) {
      rememberSession(res.code, res.playerId, savedName);
      showMessage(res.message || '再接続しました。');
      return;
    }
    if (attempt < 3) {
      setTimeout(() => tryAutoReconnect(attempt + 1), 700);
      return;
    }
    if (isRoomMissing(res)) {
      return restoreRoomFromLocalBackup(savedCode, savedPlayerId, savedName, true);
    }
    const input = $('codeInput');
    if (input) input.value = savedCode;
    showMessage(res?.message || '前回のルームに自動復帰できませんでした。ルームコードを入れて参加を押すと復帰を再試行します。');
  });
}

function isRoomMissing(res) {
  return String(res?.message || '').includes('ルームが見つかりません');
}

function getLocalRoomBackup(code) {
  try {
    const raw = localStorage.getItem(`machikoroRoomBackup:${code}`);
    return raw ? JSON.parse(raw) : null;
  } catch (_err) {
    return null;
  }
}

function restoreRoomFromLocalBackup(code, playerId, name, fromAutoReconnect = false) {
  const backup = getLocalRoomBackup(code);
  if (!backup) {
    const input = $('codeInput');
    if (input) input.value = code || '';
    showMessage('サーバー側に部屋がありません。ホストが同じブラウザで入り直すと復元できる場合があります。');
    return false;
  }
  socket.emit('restoreRoomFromBackup', { snapshot: backup, playerId, name }, (restoreRes) => {
    if (restoreRes?.ok) {
      rememberSession(restoreRes.code, restoreRes.playerId, name);
      showMessage(restoreRes.message || 'ルームを復元しました。');
      return;
    }
    const input = $('codeInput');
    if (input) input.value = code || '';
    showMessage(restoreRes?.message || (fromAutoReconnect ? '自動復元できませんでした。ホストに入り直してもらってください。' : 'ルームを復元できませんでした。'));
  });
  return true;
}
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

function rememberSession(code, playerId, name) {
  if (!code || !playerId) return;
  myId = playerId;
  localStorage.setItem('machikoroRoomCode', code);
  localStorage.setItem('machikoroPlayerId', playerId);
  const cleanName = name || $('nameInput')?.value.trim();
  if (cleanName) localStorage.setItem('machikoroPlayerName', cleanName);
}

function clearSavedSession() {
  localStorage.removeItem('machikoroRoomCode');
  localStorage.removeItem('machikoroPlayerId');
  localStorage.removeItem('machikoroPlayerName');
}

function setRoomUrl(code) {
  if (!window.history?.replaceState || !code) return;
  const url = `${location.pathname}?room=${encodeURIComponent(code)}`;
  history.replaceState(null, '', url);
}

function createFreshRoom() {
  const name = $('nameInput')?.value.trim() || localStorage.getItem('machikoroPlayerName') || 'ゲスト';
  const deckMode = document.querySelector('input[name="deckMode"]:checked')?.value || 'base';
  clearSavedSession();
  myId = null;
  socket.emit('createRoom', { name, deckMode }, (res) => {
    if (!res?.ok) return showMessage(res?.message || '新しいルームを作成できませんでした。');
    rememberSession(res.code, res.playerId, name);
    setRoomUrl(res.code);
    const input = $('codeInput');
    if (input) input.value = res.code;
    showMessage('新しいルームを作成しました。');
  });
}

function backToLobbyForNewRoom() {
  clearSavedSession();
  myId = null;
  state = null;
  lastDiceKey = '';
  lastWinnerId = null;
  if (window.history?.replaceState) history.replaceState(null, '', location.pathname);
  $('game')?.classList.add('hidden');
  $('lobby')?.classList.remove('hidden');
  $('roomBadge')?.classList.add('hidden');
  const codeInput = $('codeInput');
  if (codeInput) codeInput.value = '';
  showMessage('新しい部屋を作成できます。');
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

function rollTunaDice() {
  if (localRollingCount) return;
  startLocalRoll(2, 'rollTunaDice', () => emitWithMessage('rollTunaDice'));
}

function currentTunaPending() {
  const pending = state?.pendingTuna;
  if (!pending || !Array.isArray(pending.queue)) return null;
  return pending.queue[pending.currentIndex || 0] || null;
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


function updateDeckModeHelp() {
  const mode = document.querySelector('input[name="deckMode"]:checked')?.value || 'base';
  const help = $('deckModeHelp');
  if (!help) return;
  if (mode === 'plus') {
    help.innerHTML = '<strong>街コロ＋：</strong>基本カードに拡張カードを混ぜて遊びます。';
  } else {
    help.innerHTML = '<strong>街コロ：</strong>基本カードのみ。通常プレイを壊さず、今まで通り遊べます。';
  }
}

document.querySelectorAll('input[name="deckMode"]').forEach((input) => {
  input.addEventListener('change', updateDeckModeHelp);
});
updateDeckModeHelp();

$('createBtn').onclick = () => createFreshRoom();
$('joinBtn').onclick = () => {
  const code = $('codeInput').value.trim().toUpperCase();
  if (!code) return showMessage('ルームコードを入力してください。');
  const name = $('nameInput').value.trim() || 'ゲスト';
  const savedCode = localStorage.getItem('machikoroRoomCode');
  const savedPlayerId = localStorage.getItem('machikoroPlayerId');
  const playerId = savedCode === code ? savedPlayerId : null;
  socket.emit('joinRoom', { code, name, playerId }, (res) => {
    if (!res?.ok) {
      if (isRoomMissing(res) && playerId && restoreRoomFromLocalBackup(code, playerId, name)) return;
      return showMessage(res?.message || '参加できませんでした。');
    }
    if (res.spectator) {
      // 別ルームを観戦する場合だけプレイヤー復帰情報を消す。同じルームの復帰情報は残す。
      myId = null;
      localStorage.setItem('machikoroRoomCode', res.code);
      if (savedCode && savedCode !== res.code) {
        localStorage.removeItem('machikoroPlayerId');
        localStorage.removeItem('machikoroPlayerName');
      }
      showMessage('観戦者として参加しました。');
    } else {
      rememberSession(res.code, res.playerId, name);
      showMessage(res.reconnected ? '元のプレイヤーとして復帰しました。' : '参加しました。');
    }
  });
};
if ($('startBtn')) $('startBtn').onclick = () => emitWithMessage('startGame');
$('copyRoomCodeBtn').onclick = copyRoomCode;
$('copyInviteBtn').onclick = copyInviteLink;
$('soundToggleBtn').onclick = toggleSound;
if ($('openRoomOpsBtn')) $('openRoomOpsBtn').onclick = openRoomOps;
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
    if (state.phase === 'portChoice') return `${cp?.name || 'プレイヤー'} が港効果を使うか選んでいます。`;
    if (state.phase === 'tunaRoll') {
      const tuna = currentTunaPending();
      return `${state.pendingTuna?.rollerName || '出目を出したプレイヤー'} が ${tuna?.playerName || 'プレイヤー'} のマグロ漁船追加ダイスを振るのを待っています。`;
    }
    if (state.phase === 'purple') return `${cp?.name || 'プレイヤー'} が紫カードの対象を選んでいます。`;
    if (state.phase === 'build') return `${cp?.name || 'プレイヤー'} が建設するか選んでいます。`;
    return `${cp?.name || 'プレイヤー'} の操作待ちです。`;
  }
  if (state.phase === 'roll') return 'ダイスを振ってください。駅が完成していれば2個も選べます。';
  if (state.phase === 'reroll') return '電波塔で振り直すか、この出目で進めるか選んでください。';
  if (state.phase === 'portChoice') return '港効果で出目に+2するか選んでください。';
  if (state.phase === 'tunaRoll') {
    const tuna = currentTunaPending();
    return state.pendingTuna?.rollerId === myId ? `${tuna?.playerName || 'プレイヤー'} のマグロ漁船追加ダイスを振ってください。` : `${state.pendingTuna?.rollerName || '出目を出したプレイヤー'} のマグロ漁船追加ダイス待ちです。`;
  }
  if (state.phase === 'purple') return '紫カードの対象を選んでください。';
  if (state.phase === 'build') return '施設を1つ建設するか、建設せず終了してください。';
  return '';
}

function isTriggeredCard(card, owner) {
  const roll = state?.lastRoll;
  if (!roll?.total || !card?.dice?.includes(roll.total)) return false;
  if (!['build', 'purple'].includes(state.phase)) return false;

  // Actual activation rules by card color:
  // blue: anyone's turn, red: other player's turn, green/purple: owner's turn only.
  if (card.color === 'blue') return true;
  if (card.color === 'red') return owner?.id && owner.id !== roll.playerId;
  if (card.color === 'green') return owner?.id && owner.id === roll.playerId;
  if (card.color === 'purple') return owner?.id && owner.id === roll.playerId;
  return false;
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
      return `<tr><td>${i + 1}</td><td>${escapeHtml(p.name)}</td><td>${lm}/${Object.keys(state.landmarks || {}).filter(id => !state.landmarks[id].displayOnly).length}</td><td>${p.coins}🪙</td><td>${built}</td></tr>`;
    }).join('');
  return `<div class="result-box"><h3>リザルト</h3><table class="result-table"><thead><tr><th>#</th><th>プレイヤー</th><th>ランドマーク</th><th>コイン</th><th>施設</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function diceStateKey(next) {
  const roll = next?.pendingRoll || next?.lastRoll;
  if (!roll) return '';
  return `${next.phase}:${roll.dice.join('-')}:${roll.total}:${roll.adjustedTotal || ''}`;
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
  const fresh = diceJustChanged ? ' result-roll' : '';
  const adjusted = roll.adjustedTotal ? ` <span class="deck-mode-chip">港なら ${roll.adjustedTotal}</span>` : '';
  const faces = roll.dice.map((value, i) => diceFace(value, `settled d${i + 1}`)).join('');
  return `<div class="dice-stage playable-roll${fresh}">
    <div class="dice-label">${label}</div>
    <div class="dice-row result-dice-row">${faces}</div>
    <div class="dice-total"><span>出目</span><strong>${escapeHtml(rollExpression(roll))}</strong>${adjusted}</div>
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
    business: '自分と相手の紫以外の施設を1件ずつ交換する。',
    sushi: '他人のターン。港が完成していれば、出した人から3コイン。モールで+1。',
    flower: '誰のターンでも銀行から1コイン。',
    flowerShop: '自分のターン。花畑1件につき1コイン。モールで+1。',
    pizza: '他人のターン。出した人から1コイン。モールで+1。',
    burger: '他人のターン。出した人から1コイン。モールで+1。',
    sauryBoat: '誰のターンでも、港が完成していれば銀行から3コイン。',
    foodWarehouse: '自分のターン。自分の飲食店1件につき2コイン。',
    tunaBoat: '誰のターンでも、港が完成していれば追加で2個ダイスを振り、その合計分コイン。追加ダイスには港+2なし。',
    publisher: '自分のターン。全員から、相手の飲食店・商店1件につき1コイン。',
    taxOffice: '自分のターン。10コイン以上持つ相手から半分のコインをもらう。'
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
  renderRoomOps();
  renderStickyHud();
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
  if (state.status === 'waiting') {
    $('statusTitle').textContent = '待機中';
    $('statusText').textContent = `1〜4人で開始できます。現在 ${state.players.length} 人。友人にルームコード ${state.code} を共有してください。${state.deckMode === 'plus' ? ' デッキ: 街コロ＋' : ' デッキ: 街コロ'}`;
    return;
  }
  if (state.status === 'finished') {
    const winner = state.players.find(p => p.id === state.winnerId);
    $('statusTitle').textContent = 'ゲーム終了';
    $('statusText').textContent = '同じメンバーで再戦するか、新しい部屋を作成できます。';
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
  const phaseText = state.phase === 'roll' ? 'ダイスを振るフェーズ' : state.phase === 'reroll' ? '振り直し選択フェーズ' : state.phase === 'portChoice' ? '港選択フェーズ' : state.phase === 'tunaRoll' ? 'マグロ漁船追加ダイス' : state.phase === 'purple' ? '紫カード選択フェーズ' : '建設フェーズ';
  const rollingText = state.rolling ? ` / ${state.rolling.playerName || 'プレイヤー'} がダイス中` : '';
  const rollText = state.lastRoll ? ` / 出目 ${rollExpression(state.lastRoll)}` : '';
  const marketText = ` / 場 ${Object.keys(state.market || {}).length} 種類 / 山札 ${state.deckCount ?? 0} 枚`;
  const selfText = m ? ` / あなた: ${m.coins ?? 0} コイン` : ' / 観戦中';
  const spectatorText = state.spectatorCount ? ` / 観戦 ${state.spectatorCount} 人` : '';
  const deckText = state.deckMode === 'plus' ? ' / デッキ 街コロ＋' : ' / デッキ 街コロ';
  $('statusText').innerHTML = `<strong>${escapeHtml(phaseGuideText())}</strong><br><span>${escapeHtml(`${phaseText}${rollingText}${rollText}${selfText}${marketText}${spectatorText}${deckText}`)}</span>`;
  const rollNoticeEl = $('rollNotice');
  if (rollNoticeEl) rollNoticeEl.classList.add('hidden');
  renderRecentNotice();
}


function rollExpression(roll) {
  if (!roll?.dice?.length) return '-';
  return String(roll.total);
}

function rollDiceValuesText(roll) {
  if (!roll?.dice?.length) return '-';
  return roll.dice.length === 1 ? String(roll.total) : roll.dice.join(' + ');
}

function rollOwnerName(roll) {
  if (!roll) return 'プレイヤー';
  if (roll.playerName) return roll.playerName;
  const p = state?.players?.find(player => player.id === roll.playerId);
  return p?.name || 'プレイヤー';
}

function renderRollNotice() {
  const el = $('rollNotice');
  if (!el || !state || state.status === 'waiting' || state.status === 'finished') return;
  if (state.rolling) {
    const mine = state.rolling.playerId === myId;
    el.className = `roll-notice rolling ${mine ? 'mine' : 'opponent'}`;
    el.innerHTML = `<strong>${mine ? 'あなたがダイスを振っています' : `${escapeHtml(state.rolling.playerName || 'プレイヤー')} がダイスを振っています`}</strong><span>結果待ち</span>`;
    return;
  }
  const roll = state.lastRoll || state.pendingRoll;
  if (!roll?.dice?.length) {
    el.classList.add('hidden');
    return;
  }
  const mine = roll.playerId === myId;
  const name = rollOwnerName(roll);
  const label = '現在の出目';
  const fresh = diceJustChanged ? ' fresh' : '';
  const adjusted = roll.adjustedTotal ? `<span class="roll-adjusted">港なら ${roll.adjustedTotal}</span>` : '';
  el.className = `roll-notice clean-roll ${mine ? 'mine' : 'opponent'}${fresh}`;
  const faces = roll.dice.map((value, i) => diceFace(value, `settled d${i + 1}`)).join('');
  el.innerHTML = `
    <div class="roll-notice-main">
      <strong>${label}</strong>
      <span>${escapeHtml(name)}さん</span>
    </div>
    <div class="roll-notice-result">
      <div class="roll-notice-dice">${faces}</div>
      <div class="roll-notice-total"><span>出目</span><b>${escapeHtml(rollExpression(roll))}</b>${adjusted}</div>
    </div>`;
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

function summarizeTurnEvents(events) {
  const items = [];
  for (const ev of events || []) {
    const type = String(ev.type || '');
    const label = String(ev.label || '').trim();
    if (!label) continue;
    let icon = '•';
    let kind = 'other';
    if (type.includes('income')) { icon = '🪙'; kind = 'income'; }
    else if (type.includes('steal')) { icon = '💸'; kind = 'steal'; }
    else if (type.includes('amusement')) { icon = '🎢'; kind = 'amusement'; }
    items.push({ icon, kind, label });
  }
  return items;
}


function renderTurnMoneySummary() {
  if (!state?.turnCoinStart || !state?.turnCoinEnd || !Array.isArray(state.players)) return '';
  const rows = state.players.map((p) => {
    const before = Number(state.turnCoinStart[p.id] ?? p.coins ?? 0);
    const after = Number(state.turnCoinEnd[p.id] ?? p.coins ?? 0);
    const diff = after - before;
    const cls = diff > 0 ? 'plus' : diff < 0 ? 'minus' : 'zero';
    const sign = diff > 0 ? '+' : '';
    return `<div class="money-summary-row ${cls}">
      <span class="money-summary-name">${escapeHtml(p.name)}</span>
      <span class="money-summary-flow">${before} → ${after}</span>
      <strong class="money-summary-diff">${sign}${diff}</strong>
    </div>`;
  }).join('');
  return `<div class="money-summary-box">
    <div class="money-summary-title">最終収支</div>
    <div class="money-summary-rows">${rows}</div>
  </div>`;
}

function renderRecentNotice() {
  const el = $('recentNotice');
  if (!el || !state || state.status === 'waiting') return;
  const events = state.turnSummary || [];
  const items = summarizeTurnEvents(events);
  const hasRoll = Boolean(state.lastRoll || state.pendingRoll);
  if (state.status === 'finished') {
    el.classList.add('hidden');
    return;
  }

  const roll = state.lastRoll || state.pendingRoll;
  const rollLine = roll?.dice?.length
    ? `<div class="turn-summary-roll"><span>出目</span><strong>${escapeHtml(rollExpression(roll))}</strong></div>`
    : '';

  if (!items.length && !hasRoll) {
    el.classList.add('hidden');
    return;
  }

  const body = items.length
    ? `<ul class="turn-summary-list">${items.map(item => `<li class="${item.kind}"><span class="turn-summary-icon">${item.icon}</span><span>${escapeHtml(item.label)}</span></li>`).join('')}</ul>`
    : `<p class="turn-summary-empty">このターンの施設効果はまだ発生していません。</p>`;
  const moneySummary = renderTurnMoneySummary();

  el.className = 'recent-notice turn-summary-panel';
  el.innerHTML = `
    <div class="turn-summary-head">
      <strong>このターンの処理</strong>
      <span>${escapeHtml(state.currentPlayer?.name || '')}</span>
    </div>
    ${rollLine}
    ${body}
    ${moneySummary}`;
}


function hostControlHtml() {
  return '';
}

function renderRoomOps() {
  const panel = $('roomOpsPanel');
  const body = $('roomOpsBody');
  if (!panel || !body) return;
  const visible = Boolean(state?.code);
  panel.classList.toggle('hidden', !visible);
  if (!visible) {
    roomOpsArmed = false;
    body.innerHTML = '';
    return;
  }
  const statusLabel = state.status === 'waiting' ? '待機中' : state.status === 'finished' ? 'ゲーム終了' : 'プレイ中';
  body.innerHTML = `
    <p class="small">ルームを抜ける操作は、手番アクションとは分けてここに置いています。</p>
    <div class="admin-status">現在の部屋: <strong>${escapeHtml(state.code)}</strong> / 状態: <strong>${escapeHtml(statusLabel)}</strong></div>
    ${roomOpsArmed ? `
      <div class="room-confirm admin-confirm">
        <p>この部屋から抜けて、新しい部屋を作りますか？</p>
        <div class="actions">
          <button class="accent" onclick="confirmCreateNewRoomFromRoom()">新しい部屋を作る</button>
          <button class="secondary" onclick="cancelCreateNewRoomFromRoom()">キャンセル</button>
        </div>
      </div>` : `
      <div class="actions wrap">
        <button onclick="armCreateNewRoomFromRoom()">この部屋を抜けて新しい部屋を作る</button>
        <button class="secondary" onclick="leaveRoomAndBackToLobby()">ロビーに戻る</button>
      </div>`}
  `;
}

function openRoomOps() {
  const panel = $('roomOpsPanel');
  if (!panel) return;
  panel.classList.remove('hidden');
  const details = panel.querySelector('details');
  if (details) details.open = true;
  panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function armCreateNewRoomFromRoom() {
  roomOpsArmed = true;
  renderRoomOps();
}

function cancelCreateNewRoomFromRoom() {
  roomOpsArmed = false;
  renderRoomOps();
}

function confirmCreateNewRoomFromRoom() {
  roomOpsArmed = false;
  socket.emit('leaveRoom', {}, () => createFreshRoom());
}

function leaveRoomAndBackToLobby() {
  roomOpsArmed = false;
  socket.emit('leaveRoom', {}, () => backToLobbyForNewRoom());
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
  const phaseName = state.rolling ? 'ダイス演出中' : { roll: 'ダイス選択', reroll: '電波塔', portChoice: '港', tunaRoll: 'マグロ漁船', purple: '紫カード選択', build: '建設' }[state.phase] || state.phase;
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


function stickyHudRollHtml() {
  const roll = state?.pendingRoll || state?.lastRoll;
  if (state?.rolling) {
    const who = state.rolling.playerName ? `${escapeHtml(state.rolling.playerName)}さん` : 'プレイヤー';
    return `<div class="hud-roll rolling"><span>現在の出目</span><strong>${who}が振っています...</strong></div>`;
  }
  if (!roll?.dice?.length) {
    return '';
  }
  const adjusted = roll.adjustedTotal ? `<em>港なら ${roll.adjustedTotal}</em>` : '';
  const who = escapeHtml(rollOwnerName(roll));
  return `<div class="hud-roll"><span>現在の出目</span><strong>${escapeHtml(rollExpression(roll))}</strong><small>${who}さん</small>${adjusted}</div>`;
}

function stickyHudActionHtml() {
  if (!state || state.status !== 'playing') return '';
  const mine = me();
  if (!mine) return '<span class="hud-wait">観戦中</span>';
  if (state.rolling || localRollingCount) return '<span class="hud-wait">ダイス中...</span>';
  if (!isMyTurn()) {
    const cp = currentPlayer();
    return `<span class="hud-wait">${escapeHtml(cp?.name || '相手')} の番</span>`;
  }
  if (state.phase === 'roll') {
    const canTwo = mine.landmarks.station;
    return `<button onclick="rollDice(1)">1個振る</button><button ${canTwo ? '' : 'disabled'} onclick="rollDice(2)">2個振る</button>`;
  }
  if (state.phase === 'reroll') {
    return `<button onclick="emitWithMessage('acceptRoll')">この出目で進める</button><button class="secondary" onclick="rerollDice()">振り直す</button>`;
  }
  if (state.phase === 'build') {
    return `<button class="secondary" onclick="emitWithMessage('skipBuild')">建設せず終了</button>`;
  }
  if (state.phase === 'portChoice') {
    return `<button onclick="emitWithMessage('usePortRoll')">港+2</button><button class="secondary" onclick="emitWithMessage('acceptPortRoll')">そのまま</button>`;
  }
  if (state.phase === 'tunaRoll') {
    const tuna = currentTunaPending();
    if (state.pendingTuna?.rollerId === myId) return `<button onclick="rollTunaDice()">追加ダイスを振る</button>`;
    return `<span class="hud-wait">${escapeHtml(state.pendingTuna?.rollerName || '相手')} の追加ダイス待ち</span>`;
  }
  if (state.phase === 'purple') {
    return '<span class="hud-wait">紫カードを選択中</span>';
  }
  return '';
}

function renderStickyHud() {
  const el = $('stickyHud');
  if (!el) return;
  const mine = me();
  const show = state && state.status === 'playing' && mine;
  el.classList.toggle('hidden', !show);
  if (!show) {
    el.innerHTML = '';
    return;
  }
  const cp = currentPlayer();
  const myTurnNow = isMyTurn();
  const phaseLabel = state.rolling
    ? 'ダイス中'
    : state.phase === 'roll'
      ? 'ダイス'
      : state.phase === 'reroll'
        ? '振り直し'
        : state.phase === 'portChoice'
          ? '港'
          : state.phase === 'tunaRoll'
          ? 'マグロ漁船'
          : state.phase === 'purple'
          ? '紫カード'
          : state.phase === 'build'
            ? '建設'
            : '進行中';
  el.className = `sticky-hud ${myTurnNow ? 'my-turn' : 'wait-turn'}`;
  el.innerHTML = `
    <div class="hud-info">
      <strong>あなた ${mine.coins}🪙</strong>
      <span>${myTurnNow ? 'あなたの番' : `${escapeHtml(cp?.name || '相手')} の番`} / ${phaseLabel}</span>
    </div>
    ${stickyHudRollHtml()}
    <div class="hud-actions">${stickyHudActionHtml()}</div>
  `;
}

function renderPlayers() {
  $('players').innerHTML = state.players.map((p, idx) => {
    const builtCards = Object.entries(p.cards)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => {
        const card = state.cards[id];
        const triggered = isTriggeredCard(card, p);
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
    const officeTag = state.landmarks?.office ? `<span class="tag landmark-tag complete" title="${escapeHtml(state.landmarks.office.text)}">常時 ${state.landmarks.office.name}</span>` : '';
    const landmarks = officeTag + Object.entries(p.landmarks)
      .map(([id, done]) => `<span class="tag landmark-tag ${done ? 'complete' : 'incomplete'}" title="${escapeHtml(state.landmarks[id]?.text || '')}">${done ? '✅' : '⬜'} ${state.landmarks[id]?.name || id}</span>`).join('');
    const playerClasses = ['player', idx === state.currentPlayerIndex ? 'current' : '', p.id === myId ? 'me-player' : ''].filter(Boolean).join(' ');
    const turnLabel = idx === state.currentPlayerIndex ? `<div class="turn-chip ${p.id === myId ? 'mine' : ''}">${p.id === myId ? 'あなたの番' : '現在の番'}</div>` : '';
    return `<div class="${playerClasses}">
      ${turnLabel}
      ${coinFxHtml(p.id)}
      <h3><span>${escapeHtml(p.name)} ${p.connected ? '' : '（切断）'}</span><span class="coins">${p.coins}🪙</span></h3>
      <div class="small">${idx + 1}番手</div>
      <div class="tags">${landmarks}</div>
      <div class="owned-cards-open">
        <div class="owned-cards-title">建築済み施設 <span>${Object.values(p.cards || {}).reduce((a, b) => a + b, 0)}枚</span></div>
        <div class="owned-cards">${builtCards}</div>
      </div>
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
    const startButton = state.hostId === myId ? '<button onclick="emitWithMessage(\'startGame\')">ゲーム開始</button>' : '';
    el.innerHTML = `<p>${escapeHtml(phaseGuideText())}</p><div class="actions"><button class="secondary" onclick="copyInviteLink()">招待リンクをコピー</button>${startButton}</div>`;
    return;
  }
  if (state.status === 'finished') {
    const hostActions = state.hostId === myId
      ? '<button onclick="emitWithMessage(\'resetRoom\')">同じメンバーでもう一度遊ぶ</button>'
      : '<span class="small">同じメンバーの再戦はホストが開始できます。</span>';
    el.innerHTML = `${resultTableHtml()}<div class="actions wrap">${hostActions}<button class="accent" onclick="createFreshRoom()">新しい部屋を作る</button><button class="secondary" onclick="backToLobbyForNewRoom()">ロビーに戻る</button></div>`;
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
  if (state.phase === 'portChoice') {
    const roll = state.pendingRoll;
    const dice = diceTray(roll, '港効果の出目');
    if (!me()) {
      const cp = currentPlayer();
      el.innerHTML = `<p>観戦中です。${escapeHtml(cp?.name || 'プレイヤー')} が港効果を使うか選んでいます。</p>`;
      return;
    }
    if (!isMyTurn()) {
      const cp = currentPlayer();
      el.innerHTML = `<p>${escapeHtml(cp?.name || 'プレイヤー')} が港効果を使うか選んでいます。</p>${hostControlHtml()}`;
      return;
    }
    el.innerHTML = `
      ${dice}
      <p>港効果で出目 ${roll?.total ?? ''} を ${roll?.adjustedTotal ?? ''} にできます。</p>
      <div class="actions">
        <button onclick="emitWithMessage('usePortRoll')">+2して進める</button>
        <button class="secondary" onclick="emitWithMessage('acceptPortRoll')">そのまま進める</button>
      </div>${hostControlHtml()}`;
    return;
  }
  if (state.phase === 'tunaRoll') {
    const tuna = currentTunaPending();
    if (!me()) {
      el.innerHTML = `<p>観戦中です。${escapeHtml(tuna?.playerName || 'プレイヤー')} がマグロ漁船の追加ダイスを振るのを待っています。</p>`;
      return;
    }
    if (state.pendingTuna?.rollerId !== myId) {
      el.innerHTML = `<p>${escapeHtml(state.pendingTuna?.rollerName || '出目を出したプレイヤー')} が、${escapeHtml(tuna?.playerName || 'プレイヤー')} のマグロ漁船追加ダイスを振るのを待っています。</p>${hostControlHtml()}`;
      return;
    }
    if (localRollingCount) {
      const previewDice = rollingPreviewValues.map((value, i) => diceFace(value, `rolling-loop d${i + 1}`, `data-rolling-die="${i}" data-roll-key="${rollingNonce}"`)).join('');
      el.innerHTML = `<div class="dice-stage rolling-live"><div class="dice-label">マグロ漁船</div><div class="dice-row rolling-row">${previewDice}</div></div>${hostControlHtml()}`;
      return;
    }
    el.innerHTML = `
      <div class="choice-panel">
        <h3>マグロ漁船：追加ダイス</h3>
        <p>${escapeHtml(tuna?.playerName || 'プレイヤー')} のマグロ漁船 ${tuna?.count || 1} 隻が発動しました。出目を出したあなたが2個の追加ダイスを振ってください。</p>
        <div class="actions"><button onclick="rollTunaDice()">追加ダイスを振る</button></div>
      </div>${hostControlHtml()}`;
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
    if (lm.displayOnly) {
      return `<article class="card landmark-card complete display-only">
        <h4>${lm.name}<span>常時</span></h4>
        <p>${lm.text}</p>
        <button disabled>常時有効</button>
      </article>`;
    }
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
