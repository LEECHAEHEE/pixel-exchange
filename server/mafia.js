// 마피아존 게임 매니저. 'mafiazone' 장소에 들어온 사람들만 대상으로 돌아간다.
// 이동·위치·아바타는 기존 객장 월드(room.js/scene.js)가 그대로 처리하고,
// 이 모듈은 역할·밤/낮·투표·건너뛰기·승패와 '존 안 채팅 격리'만 맡는다.
//
// 메시지 타입은 기존(room/race)과 겹치지 않게 모두 mz* 접두사를 쓴다.
//   C→S: mzReady · mzNight{action,target} · mzVote{target} · mzConfirm{yes} · mzSkip
//   S→C: mzWelcome mzPlayers mzPhase mzRole mzSys mzChat mzMorning mzInvestigate
//        mzMafiaPick mzHeal mzVoteUpd mzConfirmUpd mzNightProg mzSkipUpd
//        mzDefense mzConfirmStart mzExecuted mzGameover
//
// 채팅 채널: public(산 사람→존 전원) · dead(죽은 사람→죽은 사람끼리) · mafia(밤, 마피아끼리)
'use strict';

const FAST = !!process.env.MAFIA_FAST;
const DURATIONS = FAST
  ? { night: 1500, morning: 800, day_discuss: 1500, day_vote: 1500, day_defense: 800, day_confirm: 1500, gameover: 1500 }
  : { night: 30000, morning: 5000, day_discuss: 90000, day_vote: 30000, day_defense: 20000, day_confirm: 15000, gameover: 12000 };

const MIN_PLAYERS = 4;
const ALLOW_SELF_HEAL = true;
const NO_REPEAT_HEAL = true;
const ROLE_REVEAL = 'role'; // 'role' | 'team' | 'none'

const TEAM = { mafia: 'mafia', police: 'citizen', doctor: 'citizen', citizen: 'citizen' };
const ROLE_KO = { mafia: '마피아', police: '경찰', doctor: '의사', citizen: '시민' };

function roleTable(n) {
  if (n < 4) return null;
  const t = { mafia: 0, police: 1, doctor: 1, citizen: 0 };
  if (n <= 6) t.mafia = 1;
  else if (n <= 10) t.mafia = 2;
  else t.mafia = 3;
  t.citizen = n - t.mafia - t.police - t.doctor;
  return t;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createMafia({ send }) {
  const members = new Map(); // id -> user(u). mafia 상태는 u.mz 에 둔다.
  let phase = 'lobby';
  let day = 0;
  let phaseEndsAt = 0;
  let timer = null;
  let night = null, vote = null, confirm = null, discuss = null, accused = null, lastHeal = null;

  // ---------- 멤버십 ----------

  function enter(u) {
    const mid = !inLobby();                 // 게임 도중 입장 → 관전자
    u.mz = { role: null, alive: !mid, ready: false, spectator: mid };
    members.set(u.id, u);
    send(u, {
      t: 'mzWelcome', me: { id: u.id }, players: list(), phase, day, endsAt: phaseEndsAt,
    });
    if (mid) send(u, { t: 'mzSys', text: '게임이 진행 중입니다. 다음 판부터 참여할 수 있어요(관전 중).' });
    broadcastPlayers();
    checkStart();
  }

  function leave(u) {
    if (!members.has(u.id)) return;
    const wasAlive = u.mz && u.mz.alive && !u.mz.spectator;
    members.delete(u.id);
    delete u.mz;
    if (phase === 'lobby') { broadcastPlayers(); checkStart(); return; }
    broadcastPlayers();
    if (wasAlive) { const w = checkWin(); if (w) toGameover(w); }
  }

  function isMember(u) { return members.has(u.id); }
  function inLobby() { return phase === 'lobby'; }
  function all() { return [...members.values()]; }
  function players() { return all().filter(u => !u.mz.spectator); }
  function alivePlayers() { return all().filter(u => u.mz.alive && !u.mz.spectator); }
  function aliveOf(role) { return alivePlayers().filter(u => u.mz.role === role); }

  function pub(u) {
    return { id: u.id, name: u.name, look: u.look, alive: u.mz.alive, ready: u.mz.ready, spectator: !!u.mz.spectator };
  }
  function list() { return all().map(pub); }

  // ---------- 송신 ----------

  function bcast(msg, filter) {
    for (const u of members.values()) {
      if (filter && !filter(u)) continue;
      send(u, msg);
    }
  }
  function sys(text) { bcast({ t: 'mzSys', text }); }
  function broadcastPlayers() { bcast({ t: 'mzPlayers', players: list() }); }

  function setPhase(name, duration, onEnd) {
    clearTimeout(timer);
    phase = name;
    phaseEndsAt = duration ? Date.now() + duration : 0;
    bcast({ t: 'mzPhase', phase: name, day, endsAt: phaseEndsAt });
    if (duration) timer = setTimeout(() => { try { onEnd && onEnd(); } catch (e) { console.error('[mafia]', e); } }, duration);
  }

  // ---------- 시작(READY) ----------

  function handleReady(u) {
    if (phase !== 'lobby' || !members.has(u.id)) return;
    u.mz.ready = !u.mz.ready;
    broadcastPlayers();
    const n = players().length;
    const readyN = players().filter(x => x.mz.ready).length;
    sys(`준비 ${readyN}/${n}` + (n < MIN_PLAYERS ? ` — 최소 ${MIN_PLAYERS}명 필요` : ''));
    checkStart();
  }

  function checkStart() {
    if (phase !== 'lobby') return;
    const ps = players();
    if (ps.length >= MIN_PLAYERS && ps.every(x => x.mz.ready)) startGame();
  }

  function startGame() {
    const roster = players();
    const table = roleTable(roster.length);
    if (!table) { setPhase('lobby', 0, null); return; }
    const pool = [];
    for (const r of ['mafia', 'police', 'doctor', 'citizen']) for (let i = 0; i < table[r]; i++) pool.push(r);
    shuffle(pool); shuffle(roster);
    roster.forEach((u, i) => { u.mz.role = pool[i]; u.mz.alive = true; });
    day = 0; lastHeal = null;
    for (const u of players()) sendRole(u);
    broadcastPlayers();
    sys('게임이 시작되었습니다. 첫 번째 밤이 찾아옵니다…');
    toNight();
  }

  function sendRole(u) {
    const msg = { t: 'mzRole', role: u.mz.role, roleKo: ROLE_KO[u.mz.role], team: TEAM[u.mz.role] };
    if (u.mz.role === 'mafia') {
      msg.mates = players().filter(q => q.mz.role === 'mafia' && q.id !== u.id).map(q => ({ id: q.id, name: q.name }));
    }
    send(u, msg);
  }

  // ---------- 밤 ----------

  function toNight() {
    day += 1;
    night = { mafiaVotes: new Map(), investigate: new Map(), heal: new Map(), skips: new Set(), acted: new Set() };
    setPhase('night', DURATIONS.night, resolveNight);
    sys(`${day}일차 밤 — 모두 눈을 감습니다.`);
    bcast({ t: 'mzNightProg', acted: 0, total: nightActors().length });
  }

  function nightActors() {
    return alivePlayers().filter(u => u.mz.role === 'mafia' || u.mz.role === 'police' || u.mz.role === 'doctor');
  }

  function handleNight(u, msg) {
    if (phase !== 'night' || !u.mz || !u.mz.alive || !night) return;
    if (night.acted.has(u.id)) return; // 1회 확정 후 변경 불가
    const target = members.get(String(msg.target));
    const ok = target && target.mz && target.mz.alive && !target.mz.spectator;
    const role = u.mz.role;
    let done = false;
    if (msg.action === 'kill' && role === 'mafia') {
      if (!ok || target.mz.role === 'mafia') return;
      night.mafiaVotes.set(u.id, target.id);
      bcast({ t: 'mzMafiaPick', by: u.name, targetId: target.id, targetName: target.name }, q => q.mz.alive && q.mz.role === 'mafia');
      done = true;
    } else if (msg.action === 'investigate' && role === 'police') {
      if (!ok || target.id === u.id) return;
      night.investigate.set(u.id, target.id);
      send(u, { t: 'mzInvestigate', targetId: target.id, targetName: target.name, isMafia: target.mz.role === 'mafia' });
      done = true;
    } else if (msg.action === 'heal' && role === 'doctor') {
      if (!ok) return;
      if (!ALLOW_SELF_HEAL && target.id === u.id) return;
      if (NO_REPEAT_HEAL && lastHeal === target.id) { send(u, { t: 'mzSys', text: '같은 사람을 연속으로 치료할 수 없습니다.' }); return; }
      night.heal.set(u.id, target.id);
      send(u, { t: 'mzHeal', targetId: target.id, targetName: target.name });
      done = true;
    }
    if (!done) return;
    night.acted.add(u.id);
    bcast({ t: 'mzNightProg', acted: night.acted.size, total: nightActors().length });
    if (night.acted.size >= nightActors().length) resolveNight();
  }

  function resolveNight() {
    if (!night) return;
    const tally = new Map();
    for (const tid of night.mafiaVotes.values()) tally.set(tid, (tally.get(tid) || 0) + 1);
    let killId = null, best = 0, tops = [];
    for (const [tid, c] of tally) { if (c > best) { best = c; tops = [tid]; } else if (c === best) tops.push(tid); }
    if (tops.length) killId = tops[Math.floor(Math.random() * tops.length)];
    const healed = new Set(night.heal.values());
    lastHeal = [...night.heal.values()][0] || null;
    const deaths = [];
    if (killId && !healed.has(killId)) {
      const victim = members.get(killId);
      if (victim && victim.mz.alive) { victim.mz.alive = false; deaths.push(deathInfo(victim)); }
    }
    night = null;
    broadcastPlayers();
    setPhase('morning', DURATIONS.morning, afterMorning);
    bcast({ t: 'mzMorning', day, deaths });
  }

  function afterMorning() { const w = checkWin(); if (w) return toGameover(w); toDiscuss(); }

  function deathInfo(u) {
    const info = { id: u.id, name: u.name };
    if (ROLE_REVEAL === 'role') { info.role = u.mz.role; info.roleKo = ROLE_KO[u.mz.role]; }
    else if (ROLE_REVEAL === 'team') info.team = TEAM[u.mz.role];
    return info;
  }

  // ---------- 낮 ----------

  function toDiscuss() {
    discuss = { skips: new Set() };
    setPhase('day_discuss', DURATIONS.day_discuss, toVote);
    sys(`${day}일차 낮 — 토론을 시작하세요.`);
  }
  function toVote() {
    vote = { votes: new Map() };
    setPhase('day_vote', DURATIONS.day_vote, tallyVote);
    sys('투표 — 처형할 용의자를 지목하세요.');
  }
  function handleVote(u, msg) {
    if (phase !== 'day_vote' || !u.mz || !u.mz.alive) return;
    const target = members.get(String(msg.target));
    if (!target || !target.mz || !target.mz.alive) return;
    vote.votes.set(u.id, target.id);
    bcast({ t: 'mzVoteUpd', tally: voteTally(), voted: vote.votes.size, total: alivePlayers().length });
  }
  function voteTally() { const t = {}; for (const tid of vote.votes.values()) t[tid] = (t[tid] || 0) + 1; return t; }
  function tallyVote() {
    const tally = voteTally();
    let best = 0, tops = [];
    for (const tid in tally) { if (tally[tid] > best) { best = tally[tid]; tops = [tid]; } else if (tally[tid] === best) tops.push(tid); }
    vote = null;
    if (tops.length !== 1 || best === 0) {
      sys('의견이 모이지 않아 아무도 처형되지 않았습니다.');
      const w = checkWin(); if (w) return toGameover(w); return toNight();
    }
    accused = members.get(tops[0]);
    setPhase('day_defense', DURATIONS.day_defense, toConfirm);
    bcast({ t: 'mzDefense', id: accused.id, name: accused.name });
    sys(`${accused.name} 님의 최후 변론 시간입니다.`);
  }
  function toConfirm() {
    if (!accused || !accused.mz.alive) return toNight();
    confirm = { votes: new Map() };
    setPhase('day_confirm', DURATIONS.day_confirm, tallyConfirm);
    bcast({ t: 'mzConfirmStart', id: accused.id, name: accused.name });
    sys(`${accused.name} 님을 처형할까요? 찬성/반대 투표.`);
  }
  function handleConfirm(u, msg) {
    if (phase !== 'day_confirm' || !u.mz || !u.mz.alive) return;
    if (accused && u.id === accused.id) return;
    confirm.votes.set(u.id, !!msg.yes);
    let yes = 0, no = 0; for (const v of confirm.votes.values()) v ? yes++ : no++;
    const total = Math.max(1, alivePlayers().length - 1);
    bcast({ t: 'mzConfirmUpd', yes, no, total });
  }
  function tallyConfirm() {
    let yes = 0, no = 0; for (const v of confirm.votes.values()) v ? yes++ : no++;
    const acc = accused; confirm = null; accused = null;
    if (acc && acc.mz.alive && yes > no) { acc.mz.alive = false; broadcastPlayers(); bcast({ t: 'mzExecuted', ...deathInfo(acc) }); }
    else sys('처형이 부결되었습니다.');
    const w = checkWin(); if (w) return toGameover(w); toNight();
  }

  // ---------- 건너뛰기 ----------

  function handleSkip(u) {
    if (!u.mz || !u.mz.alive) return;
    if (phase === 'night' && night) trySkip(u, night.skips, '밤', resolveNight);
    else if (phase === 'day_discuss' && discuss) trySkip(u, discuss.skips, '토론', toVote);
  }
  function trySkip(u, set, label, advance) {
    set.add(u.id);
    const total = alivePlayers().length;
    const need = Math.floor(total / 2) + 1;
    bcast({ t: 'mzSkipUpd', count: set.size, need, total });
    if (set.size >= need) { sys(`다수가 동의해 ${label}을 건너뜁니다.`); advance(); }
  }

  // ---------- 승패 ----------

  function checkWin() {
    const m = aliveOf('mafia').length;
    const non = alivePlayers().length - m;
    if (m === 0) return 'citizen';
    if (m >= non) return 'mafia';
    return null;
  }
  function toGameover(winner) {
    const roles = players().map(u => ({ id: u.id, name: u.name, role: u.mz.role, roleKo: ROLE_KO[u.mz.role], alive: u.mz.alive }));
    setPhase('gameover', DURATIONS.gameover, toLobby);
    bcast({ t: 'mzGameover', winner, winnerKo: winner === 'mafia' ? '마피아' : '시민', roles });
  }
  function toLobby() {
    for (const u of members.values()) u.mz = { role: null, alive: true, ready: false, spectator: false };
    day = 0; night = null; vote = null; confirm = null; discuss = null; accused = null;
    setPhase('lobby', 0, null);
    broadcastPlayers();
    sys('로비로 돌아왔습니다. START를 눌러 준비하세요.');
  }

  // ---------- 채팅 (존 안 격리) ----------
  // room.js 가 u.map==='mafiazone' 인 사람의 chat 을 여기로 넘긴다. 반환 true면 처리함.

  function handleChat(u, text) {
    if (!u.mz) return false;
    if (u.mz.spectator) { send(u, { t: 'mzSys', text: '관전 중에는 발언할 수 없습니다.' }); return true; }
    // 밤에는 마피아 포함 '모두' 말할 수 없다
    if (phase === 'night') { send(u, { t: 'mzSys', text: '🌙 밤에는 아무도 말할 수 없습니다.' }); return true; }
    if (!u.mz.alive) { bcast({ t: 'mzChat', channel: 'dead', id: u.id, name: u.name, text }, q => !q.mz.alive); return true; }
    bcast({ t: 'mzChat', channel: 'public', id: u.id, name: u.name, text });
    return true;
  }

  // ---------- 디스패치 ----------

  function handle(u, msg) {
    switch (msg.t) {
      case 'mzReady': return handleReady(u);
      case 'mzNight': return handleNight(u, msg);
      case 'mzVote': return handleVote(u, msg);
      case 'mzConfirm': return handleConfirm(u, msg);
      case 'mzSkip': return handleSkip(u);
    }
  }

  return { enter, leave, isMember, handle, handleChat };
}

module.exports = { createMafia };
