// 히든 워드 게임장. 'hiddenword' 장소에 들어온 사람만 대상으로 돌아간다.
// 이동·위치는 room.js/scene.js 가 그대로 처리하고, 이 모듈은 좌석·진행·점수만 맡는다.
//
// 흐름: 원형 좌석에 3명 이상 앉으면 3초 카운트다운 → 봉투(명사 5개)에서 히든 워드 고르기 →
// 무작위 순서로 한 사람씩 출제(힌트 최대 5개, 2분) → 나머지가 정답 쓰기(1분, 동시 공개) → 다음 출제자.
// 모두 한 번씩 출제하면 끝. 맞힌 사람은 1점, 아무도 못 맞히면 출제자가 1점.
//
// 메시지(모두 hw 접두사)
//   C→S  hwSeat{seat|null} · hwPick{word} · hwHint{word} · hwGuess{word}
//   S→C  hwState(공개 상태 전체) · hwEnvelope{words} · hwMine{word} · hwErr{text} · hwSys{text}
// 히든 워드와 제출한 답은 공개 시점 전에는 본인에게만 보낸다.
'use strict';

const { WORDS } = require('./words');

const FAST = process.env.HW_FAST === '1';
const MS = FAST
  ? { countdown: 3000, pick: 4000, hint: 20000, guess: 8000, reveal: 2500, end: 4000 }
  : { countdown: 3000, pick: 20000, hint: 120000, guess: 60000, reveal: 7000, end: 15000 };

const SEATS = 6;
const MIN_PLAYERS = 3;
const ENVELOPE = 5;
const MAX_HINTS = 5;
// 이 유사도 이상인 힌트가 나오면 힌트 내기를 바로 끝낸다
const STOP_SCORE = 95;
const WORD_RE = /^[가-힣]{1,8}$/;

// 좌석 자리(발 위치). public/js/places.js 의 HW.seats 와 같아야 한다. 탁자 둘레를 위에서부터 시계 방향으로.
const SEAT_POS = Array.from({ length: SEATS }, (_, i) => {
  const a = (-90 + i * 60) * Math.PI / 180;
  return { x: Math.round(160 + 58 * Math.cos(a)), y: Math.round(110 + 40 * Math.sin(a)) };
});
const SEAT_NEAR = 16;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const norm = s => String(s || '').replace(/\s+/g, '');

function createHiddenWord({ send, similarity }) {
  const members = new Map();          // 장소에 있는 사람 id → u
  const seats = new Array(SEATS).fill(null);
  let phase = 'lobby';
  let endsAt = 0;
  let timer = 0;
  // 한 판의 상태
  let players = new Map();            // id → { id, name, score, correct, hidden, envelope, gone }
  let order = [];
  let turn = -1;
  let hints = [];                     // { word, score }
  let key = null;                     // 공개할 핵심 힌트 번호
  let scoring = false;
  let guesses = new Map();            // id → 답
  let reveal = null;
  let results = null;

  // ---------- 보내기 ----------

  function bcast(msg) {
    for (const u of members.values()) send(u, msg);
  }
  function sys(text) {
    bcast({ t: 'hwSys', text });
  }
  function err(u, text) {
    send(u, { t: 'hwErr', text });
  }

  function setter() {
    return turn >= 0 ? players.get(order[turn]) : null;
  }

  function state() {
    const s = setter();
    return {
      t: 'hwState', phase, endsAt, seats,
      players: [...players.values()].map(p => ({ id: p.id, name: p.name, score: p.score, correct: p.correct, gone: p.gone, picked: !!p.hidden })),
      order, setter: s ? s.id : null, turnNo: turn + 1,
      hints, key, scoring,
      guessed: [...guesses.keys()],
      reveal, results
    };
  }
  function push() {
    bcast(state());
  }

  function setPhase(name, ms, onEnd) {
    clearTimeout(timer);
    phase = name;
    endsAt = ms ? Date.now() + ms : 0;
    if (ms) {
      timer = setTimeout(() => {
        try { onEnd(); } catch (e) { console.error('[hw]', e); }
      }, ms);
    }
    push();
  }

  // ---------- 좌석과 시작 ----------

  const seatedIds = () => seats.filter(Boolean);
  const inGame = () => phase !== 'lobby' && phase !== 'countdown';

  function checkCountdown() {
    if (inGame()) return;
    if (seatedIds().length >= MIN_PLAYERS) setPhase('countdown', MS.countdown, startGame);
    else if (phase === 'countdown') setPhase('lobby', 0);
    else push();
  }

  // x, y 는 화면이 함께 보낸 발 위치. 위치 소식보다 먼저 올 수 있어 u.x 대신 쓴다(위치는 원래 화면을 믿는다).
  function handleSeat(u, seat, x, y) {
    if (inGame()) return;
    const cur = seats.indexOf(u.id);
    if (seat === null) {
      if (cur < 0) return;
      seats[cur] = null;
      return checkCountdown();
    }
    if (!Number.isInteger(seat) || seat < 0 || seat >= SEATS || seats[seat]) return;
    const p = SEAT_POS[seat];
    const fx = Number.isFinite(x) ? x : u.x, fy = Number.isFinite(y) ? y : u.y;
    if (Math.hypot(fx - p.x, fy - p.y) > SEAT_NEAR) return;
    if (cur >= 0) seats[cur] = null;
    seats[seat] = u.id;
    checkCountdown();
  }

  function startGame() {
    const ids = seatedIds().filter(id => members.has(id));
    if (ids.length < MIN_PLAYERS) return setPhase('lobby', 0);
    const pool = shuffle(WORDS.slice());
    players = new Map();
    ids.forEach((id, i) => {
      const u = members.get(id);
      const envelope = pool.slice(i * ENVELOPE, (i + 1) * ENVELOPE);
      players.set(id, { id, name: u.name, score: 0, correct: 0, hidden: null, envelope, gone: false });
      send(u, { t: 'hwEnvelope', words: envelope });
    });
    order = shuffle(ids.slice());
    turn = -1;
    hints = [];
    key = null;
    guesses = new Map();
    reveal = null;
    results = null;
    sys(`게임 시작! ${ids.length}명 참가. 봉투에서 히든 워드를 하나 고르세요.`);
    setPhase('pick', MS.pick, afterPick);
  }

  function handlePick(u, word) {
    const p = players.get(u.id);
    if (phase !== 'pick' || !p || p.gone || !p.envelope.includes(word)) return;
    p.hidden = word;
    send(u, { t: 'hwMine', word });
    if ([...players.values()].every(q => q.gone || q.hidden)) afterPick();
    else push();
  }

  function afterPick() {
    if (phase !== 'pick') return;
    // 고르지 않은 사람은 봉투에서 아무거나 정해 준다
    for (const p of players.values()) {
      if (p.hidden || p.gone) continue;
      p.hidden = p.envelope[Math.floor(Math.random() * p.envelope.length)];
      const u = members.get(p.id);
      if (u) send(u, { t: 'hwMine', word: p.hidden });
    }
    nextTurn();
  }

  // ---------- 출제 ----------

  function activeCount() {
    return [...players.values()].filter(p => !p.gone).length;
  }

  function nextTurn() {
    if (activeCount() < 2) return endGame();
    do turn++; while (turn < order.length && players.get(order[turn]).gone);
    if (turn >= order.length) return endGame();
    hints = [];
    key = null;
    scoring = false;
    guesses = new Map();
    reveal = null;
    sys(`${setter().name} 님이 출제합니다. 힌트는 최대 ${MAX_HINTS}개입니다.`);
    setPhase('hint', MS.hint, endHints);
  }

  async function handleHint(u, raw) {
    const s = setter();
    if (phase !== 'hint' || !s || s.id !== u.id) return;
    const word = norm(raw);
    if (scoring) return err(u, '앞 힌트의 유사도를 계산하는 중입니다');
    if (hints.length >= MAX_HINTS) return;
    if (!WORD_RE.test(word)) return err(u, '힌트는 띄어쓰기 없는 한글 1~8자만 낼 수 있습니다');
    if (word.includes(s.hidden) || s.hidden.includes(word)) return err(u, '히든 워드나 그 일부가 들어간 힌트는 낼 수 없습니다');
    if (hints.some(h => h.word === word)) return err(u, '이미 낸 힌트입니다');

    scoring = true;
    push();
    const turnAt = turn;
    const r = await similarity.score(s.hidden, word);
    // 기다리는 사이 시간이 끝났거나 출제자가 나갔으면 버린다
    if (phase !== 'hint' || turn !== turnAt) return;
    scoring = false;
    if (r.error) { err(u, r.error); return push(); }
    if (!r.noun) { err(u, `'${word}' 은(는) 일반 명사가 아니라서 힌트로 쓸 수 없습니다`); return push(); }
    hints.push({ word, score: r.score });
    if (r.score >= STOP_SCORE || hints.length >= MAX_HINTS) return endHints();
    push();
  }

  function endHints() {
    if (phase !== 'hint') return;
    scoring = false;
    if (hints.length) {
      let best = 0;
      hints.forEach((h, i) => { if (h.score > hints[best].score) best = i; });
      key = best;
      sys(`핵심 힌트: ${hints[best].word} (${hints[best].score.toFixed(1)}%). 정답을 적으세요.`);
    } else {
      sys('힌트 없이 정답 쓰기로 넘어갑니다.');
    }
    setPhase('guess', MS.guess, endGuess);
  }

  function guessers() {
    const s = setter();
    return [...players.values()].filter(p => !p.gone && p !== s);
  }

  function handleGuess(u, raw) {
    const s = setter();
    const p = players.get(u.id);
    if (phase !== 'guess' || !p || p.gone || p === s) return;
    const word = norm(raw);
    if (!word || word.length > 12) return;
    guesses.set(u.id, word);
    // 다 냈으면 시간을 기다리지 않는다. 내기 전까지는 바꿀 수 있다.
    if (guessers().every(q => guesses.has(q.id))) return endGuess();
    push();
  }

  function endGuess() {
    if (phase !== 'guess') return;
    const s = setter();
    const list = guessers().map(p => {
      const word = guesses.get(p.id) || '';
      const correct = !!word && word === s.hidden;
      if (correct) { p.score += 1; p.correct += 1; }
      return { id: p.id, name: p.name, word, correct };
    });
    const anyone = list.some(g => g.correct);
    if (!anyone) s.score += 1;
    reveal = { setter: s.id, name: s.name, hidden: s.hidden, guesses: list, setterWins: !anyone };
    sys(anyone
      ? `정답은 '${s.hidden}'! ${list.filter(g => g.correct).map(g => g.name).join(', ')} 님 +1점`
      : `아무도 못 맞혔습니다. 정답은 '${s.hidden}'. 출제자 ${s.name} 님 +1점`);
    setPhase('reveal', MS.reveal, nextTurn);
  }

  // ---------- 끝 ----------

  function endGame() {
    clearTimeout(timer);
    const list = [...players.values()].sort((a, b) => b.score - a.score || b.correct - a.correct);
    // 점수와 맞힌 횟수가 모두 같으면 공동 순위
    let rank = 0;
    results = list.map((p, i) => {
      const prev = list[i - 1];
      if (!prev || prev.score !== p.score || prev.correct !== p.correct) rank = i + 1;
      return { id: p.id, name: p.name, score: p.score, correct: p.correct, rank, hidden: p.hidden, gone: p.gone };
    });
    turn = -1;
    reveal = null;
    hints = [];
    key = null;
    sys('게임이 끝났습니다. 자리에서 일어났다가 다시 앉으면 새 게임을 시작합니다.');
    setPhase('end', MS.end, toLobby);
  }

  function toLobby() {
    seats.fill(null);
    players = new Map();
    order = [];
    results = null;
    setPhase('lobby', 0);
  }

  // ---------- 들고 나기 ----------

  function enter(u) {
    members.set(u.id, u);
    send(u, state());
    const p = players.get(u.id);
    // 게임 도중 다시 들어온 참가자에게는 자기 봉투·히든 워드를 다시 준다
    if (p && !p.gone) {
      send(u, { t: 'hwEnvelope', words: p.envelope });
      if (p.hidden) send(u, { t: 'hwMine', word: p.hidden });
    }
  }

  function leave(u) {
    if (!members.has(u.id)) return;
    members.delete(u.id);
    const si = seats.indexOf(u.id);
    if (!inGame()) {
      if (si >= 0) seats[si] = null;
      return checkCountdown();
    }
    const p = players.get(u.id);
    if (!p || p.gone) return;
    p.gone = true;
    if (si >= 0) seats[si] = null;
    sys(`${p.name} 님이 나갔습니다.`);
    const s = setter();
    if (activeCount() < 2) return endGame();
    if (phase === 'pick') {
      if ([...players.values()].every(q => q.gone || q.hidden)) return afterPick();
    } else if (s && s.id === u.id && (phase === 'hint' || phase === 'guess')) {
      sys('출제자가 나가서 다음 차례로 넘어갑니다.');
      return nextTurn();
    } else if (phase === 'guess' && guessers().every(q => guesses.has(q.id))) {
      return endGuess();
    }
    push();
  }

  function handle(u, msg) {
    switch (msg.t) {
      case 'hwSeat': return handleSeat(u, msg.seat === null ? null : Number(msg.seat), Number(msg.x), Number(msg.y));
      case 'hwPick': return handlePick(u, String(msg.word || ''));
      case 'hwHint': return handleHint(u, msg.word);
      case 'hwGuess': return handleGuess(u, msg.word);
    }
  }

  return { enter, leave, handle };
}

module.exports = { createHiddenWord, SEAT_POS };
