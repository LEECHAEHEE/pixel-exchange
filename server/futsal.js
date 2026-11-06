// 풋살장 경기 매니저. 'futsal' 장소에 들어온 사람들만 대상으로 돌아간다.
// 사람 위치·걸음은 기존 월드(room.js/scene.js)가 그대로 처리하고(화면이 보낸 move 를 믿는다),
// 이 모듈은 팀·킥오프·공 움직임·득점·승패만 맡는다. 공은 모두에게 같게 보이도록 서버가 굴린다.
//
// 흐름: lobby(팀 고르기) → countdown(3·2·1, 제자리 배치) → play ⇄ goal(세리머니) → … → end(결과) → lobby
//   5골 먼저 넣으면 승리. 시간(기본 6분)이 다 되면 많이 넣은 팀 승리, 같으면 골든골.
//   경기 중 한 팀이 모두 나가면 남은 팀의 기권승.
//
// 메시지 타입은 기존 것과 겹치지 않게 모두 fs* 접두사를 쓴다.
//   C→S: fsTeam{team} · fsStart · fsPass · fsShoot{p} · fsTackle
//   S→C: fsState fsB fsKick fsGoal fsEnd fsSys fsTk
'use strict';

// 경기 시간은 시험할 때 환경변수로 줄인다
const MATCH_MS = (Number(process.env.FUTSAL_MATCH_SEC) || 360) * 1000;
const WIN_GOALS = 5;
const TEAM_MAX = 5;
const DUR = { countdown: 3000, kickoff: 1500, goal: 2500, end: 10000 };
const TICK_MS = 33;       // 공 계산 약 30Hz
const SEND_EVERY = 2;     // 굴러가는 공은 2틱(약 15Hz)마다 보낸다

// public/js/places.js 의 풋살장 그림(FS)과 맞춰야 한다
const FIELD = { x0: 24, x1: 296, y0: 40, y1: 166 };
const GOAL = { y0: 85, y1: 121 };
const CENTER = { x: 160, y: 103 };
const BALL_R = 2;

// 공 물리. public/js/futsal.js 의 예측(FRICTION)과 맞춰야 한다
const FRICTION = 1.4;     // 초당 비율 감속
const DECEL = 18;         // 고정 감속(px/s²). 끝에 질질 끌며 구르지 않게 한다
const BOUNCE = 0.65;      // 벽에 맞으면 남는 속도
const GRAB_R = 7;         // 발과 공이 이만큼 가까우면 공이 붙는다
const STEAL_R = 7;        // 상대 드리블 공에 이만큼 닿으면 뺏는다
const TACKLE_R = 13;      // 공 없이 S·D(태클)로 뺏을 수 있는 거리
const LOSE_R = 12;        // 드리블하던 사람이 경기장 밖으로 너무 나가면 공을 놓친다
const TRAP_MAX = 200;     // 이보다 빠른 공(센 슛·긴 패스 초반)은 발에 안 붙는다. 센 슛은 약 90px 가야 이만큼 느려진다
const KICK_LOCK_MS = 300, STEAL_GAP_MS = 800, STOLEN_LOCK_MS = 450, TACKLE_GAP_MS = 900;
const PASS_MIN = 90, PASS_MAX = 230, PASS_FORWARD = 150;
const SHOT_MIN = 140, SHOT_MAX = 340;
// 드리블 중 공 자리(발 기준). public/js/futsal.js 와 맞춰야 한다
const DRIBBLE = { right: [6, 0], left: [-6, 0], up: [0, -5], down: [0, 4] };
const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const TEAMS = ['red', 'blue'];
const TEAM_KO = { red: '레드', blue: '블루' };

// 킥오프 대형(레드 기준, 오른쪽을 본다). 블루는 좌우를 뒤집는다.
// 차는 팀 1번은 공 바로 뒤(곧장 공이 붙는다), 받는 팀은 센터서클(반지름 20) 밖에 선다.
const SLOTS_KICK = [[154, 103], [128, 74], [128, 132], [92, 103], [58, 103]];
const SLOTS_WAIT = [[134, 103], [118, 70], [118, 136], [84, 103], [52, 103]];

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function r1(v) { return Math.round(v * 10) / 10; }
function other(team) { return team === 'red' ? 'blue' : 'red'; }
function inMouth(y) { return y > GOAL.y0 + 1 && y < GOAL.y1 - 1; }

function createFutsal({ send, sendMap, place }) {
  const members = new Map();   // 풋살장에 있는 사람. 팀 정보는 u.fs 에 둔다.
  let phase = 'lobby';
  let phaseEndsAt = 0;
  let timer = null;
  let ticker = null;
  let lastTick = 0;
  let tickNo = 0;
  let clock = MATCH_MS;        // 남은 경기 시간(play 중에만 줄어든다)
  let golden = false;
  let score = { red: 0, blue: 0 };
  let kickTeam = 'red';
  let goals = [];              // 득점 기록 [{ team, name, own, assist }]
  let stats = new Map();       // id → { name, team, goals, assists }

  const ball = {
    x: CENTER.x, y: CENTER.y, vx: 0, vy: 0, owner: null,
    lock: new Map(),           // id → 이 시각까지 공이 안 붙는다(찬 직후·뺏긴 직후)
    stealOkAt: 0,
    touch: null,               // 마지막으로 공을 만진 사람 { id, name, team }
    kick: null,                // 마지막으로 공을 찬 사람(도움 판정) { id, name, team }
    assist: null,              // 지금 공을 가진 사람에게 패스한 같은 팀 사람
    dirty: true,
    moving: false
  };

  // ---------- 명단 ----------

  function teamList(team) {
    const list = [];
    for (const u of members.values()) if (u.fs.team === team) list.push(u);
    return list;
  }
  function roster(team) { return teamList(team).map(u => [u.id, u.name]); }
  function inMatch() { return phase === 'countdown' || phase === 'play' || phase === 'goal'; }

  // ---------- 송신 ----------

  function bcast(msg) {
    for (const u of members.values()) send(u, msg);
  }
  function sys(text, to) {
    const msg = { t: 'fsSys', text };
    if (to) send(to, msg); else bcast(msg);
  }

  function stateMsg() {
    return {
      t: 'fsState', phase,
      left: phaseEndsAt ? Math.max(0, phaseEndsAt - Date.now()) : 0,
      clock: Math.max(0, Math.round(clock)), golden,
      score: [score.red, score.blue], kick: kickTeam,
      red: roster('red'), blue: roster('blue')
    };
  }
  function broadcastState() { bcast(stateMsg()); }

  // 공 상태. 드리블 중이면 화면이 주인 자리에 붙여 그리므로 위치는 참고용이다.
  function ballMsg() {
    return { t: 'fsB', b: [r1(ball.x), r1(ball.y), Math.round(ball.vx), Math.round(ball.vy)], o: ball.owner };
  }

  // sync(장소 입장·다시 보기)에 실어 보내는 현재 모습
  function snapshot() {
    const s = stateMsg();
    delete s.t;
    s.ball = ballMsg();
    delete s.ball.t;
    return s;
  }

  // ---------- 단계 ----------

  function setPhase(name, duration, onEnd) {
    clearTimeout(timer);
    timer = null;
    phase = name;
    phaseEndsAt = duration ? Date.now() + duration : 0;
    if (duration) timer = setTimeout(() => { try { onEnd(); } catch (e) { console.error('[futsal]', e); } }, duration);
    broadcastState();
  }

  function startTicker() {
    if (ticker) return;
    lastTick = Date.now();
    ticker = setInterval(() => { try { tick(); } catch (e) { console.error('[futsal]', e); } }, TICK_MS);
  }
  function stopTicker() {
    clearInterval(ticker);
    ticker = null;
  }

  function resetBall(x, y) {
    Object.assign(ball, { x, y, vx: 0, vy: 0, owner: null, touch: null, kick: null, assist: null, stealOkAt: 0, dirty: true });
    ball.lock.clear();
  }

  function beginMatch() {
    score = { red: 0, blue: 0 };
    clock = MATCH_MS;
    golden = false;
    goals = [];
    stats = new Map();
    kickTeam = Math.random() < 0.5 ? 'red' : 'blue';
    sys(`경기 시작! ${WIN_GOALS}골 먼저 넣는 팀이 이깁니다. ${TEAM_KO[kickTeam]} 팀 킥오프.`);
    kickoff(DUR.countdown);
  }

  // 모두 제자리에 세우고 공을 가운데에 둔다. 각자 화면에 자기 자리를 알려 순간이동시킨다.
  function kickoff(ms) {
    resetBall(CENTER.x, CENTER.y);
    for (const team of TEAMS) {
      const slots = team === kickTeam ? SLOTS_KICK : SLOTS_WAIT;
      teamList(team).forEach((u, i) => {
        const [sx, sy] = slots[i % slots.length];
        const x = team === 'red' ? sx : 320 - sx;
        const dir = team === 'red' ? 'right' : 'left';
        place(u, x, sy, dir);
        send(u, { t: 'fsKick', x, y: sy, dir });
      });
    }
    startTicker();
    setPhase('countdown', ms, () => {
      setPhase('play', 0, null);
      ball.dirty = true;
    });
    sendBall();
  }

  function end(winner, forfeit) {
    stopTicker();
    resetBall(CENTER.x, CENTER.y);
    const table = [...stats.values()].sort((a, b) => b.goals - a.goals || b.assists - a.assists);
    // MVP: 골 2점·도움 1점. 같으면 이긴 팀 사람
    let mvp = null, best = 0;
    for (const s of table) {
      const pts = s.goals * 2 + s.assists;
      if (pts > best || (pts === best && pts > 0 && mvp && s.team === winner && mvp.team !== winner)) { best = pts; mvp = s; }
    }
    setPhase('end', DUR.end, toLobby);
    bcast({
      t: 'fsEnd', winner, forfeit: !!forfeit, score: [score.red, score.blue],
      goals, stats: table, mvp: mvp ? mvp.name : null
    });
    sendBall();
  }

  // 팀은 그대로 두어 바로 다시 붙을 수 있게 한다
  function toLobby() {
    stopTicker();
    score = { red: 0, blue: 0 };
    clock = MATCH_MS;
    golden = false;
    resetBall(CENTER.x, CENTER.y);
    setPhase('lobby', 0, null);
    sendBall();
  }

  // 경기 중 한 팀이 비면 남은 팀의 기권승. 둘 다 비면 그냥 로비로.
  function checkForfeit() {
    if (!inMatch()) return;
    const r = teamList('red').length, b = teamList('blue').length;
    if (r && b) return;
    if (!r && !b) { toLobby(); return; }
    const winner = r ? 'red' : 'blue';
    sys(`${TEAM_KO[other(winner)]} 팀이 모두 나가 ${TEAM_KO[winner]} 팀의 기권승입니다.`);
    end(winner, true);
  }

  // ---------- 득점 ----------

  // side: 공이 들어간 골대 쪽. 왼쪽 골대는 레드가 지키므로 블루 득점.
  function goal(side) {
    const team = side === 'left' ? 'blue' : 'red';
    score[team]++;
    const t = ball.touch;
    const own = !!(t && t.team !== team);
    const assist = !own && t && ball.assist && ball.assist.id !== t.id ? ball.assist : null;
    const rec = { team, name: t ? t.name : null, own, assist: assist ? assist.name : null };
    goals.push(rec);
    if (t && !own) statOf(t).goals++;
    if (assist) statOf(assist).assists++;

    // 공은 골망 안에 멈춰 둔다
    ball.owner = null;
    ball.vx = ball.vy = 0;
    ball.x = side === 'left' ? FIELD.x0 - 7 : FIELD.x1 + 7;
    ball.y = clamp(ball.y, GOAL.y0 + 3, GOAL.y1 - 3);
    ball.dirty = true;
    sendBall();

    bcast({ t: 'fsGoal', team, name: rec.name, own, assist: rec.assist, score: [score.red, score.blue], golden });
    const over = score[team] >= WIN_GOALS || golden;
    setPhase('goal', DUR.goal, () => {
      if (over) { end(team, false); return; }
      kickTeam = other(team);
      kickoff(DUR.kickoff);
    });
  }

  function statOf(t) {
    let s = stats.get(t.id);
    if (!s) { s = { name: t.name, team: t.team, goals: 0, assists: 0 }; stats.set(t.id, s); }
    return s;
  }

  function touchOf(u) { return { id: u.id, name: u.name, team: u.fs.team }; }

  // ---------- 공 움직임 ----------

  function sendBall() {
    ball.dirty = false;
    sendMap('futsal', ballMsg());
  }

  // 골대 입구 쪽이면 골라인 너머까지 허용하고, 아니면 경기장 안으로 가둔다
  function clampToField(x, y) {
    const mouth = inMouth(y);
    const lo = mouth ? FIELD.x0 - BALL_R - 1 : FIELD.x0 + BALL_R;
    const hi = mouth ? FIELD.x1 + BALL_R + 1 : FIELD.x1 - BALL_R;
    return [clamp(x, lo, hi), clamp(y, FIELD.y0 + BALL_R, FIELD.y1 - BALL_R)];
  }

  // 공 전체가 골라인을 넘으면 골
  function goalSide() {
    if (!inMouth(ball.y)) return null;
    if (ball.x < FIELD.x0 - BALL_R) return 'left';
    if (ball.x > FIELD.x1 + BALL_R) return 'right';
    return null;
  }

  function onTeam(u) { return u && u.fs && u.fs.team && u.map === 'futsal'; }

  function tick() {
    const now = Date.now();
    const dt = Math.min(0.1, (now - lastTick) / 1000);
    lastTick = now;
    if (phase !== 'play') return;
    tickNo++;

    // 경기 시간. 다 되면 많이 넣은 팀 승리, 같으면 골든골.
    if (!golden) {
      clock -= dt * 1000;
      if (clock <= 0) {
        clock = 0;
        if (score.red !== score.blue) { end(score.red > score.blue ? 'red' : 'blue', false); return; }
        golden = true;
        sys('시간 종료! 동점이라 골든골 — 다음 골을 넣는 팀이 이깁니다.');
        broadcastState();
      }
    }

    const wasMoving = ball.moving;
    if (ball.owner) dribble(now);
    else roll(dt);
    if (phase !== 'play') return;
    const side = goalSide();
    if (side) { goal(side); return; }
    possession(now);

    ball.moving = !ball.owner && (ball.vx !== 0 || ball.vy !== 0);
    // 굴러가는 동안만 15Hz 로, 멈추거나 주인이 바뀐 순간은 바로 보낸다
    if (ball.dirty || (wasMoving && !ball.moving) || (ball.moving && tickNo % SEND_EVERY === 0)) sendBall();
  }

  function dribble() {
    const u = members.get(ball.owner);
    if (!onTeam(u)) { ball.owner = null; ball.dirty = true; return; }
    const [ox, oy] = DRIBBLE[u.dir] || [0, 0];
    const [x, y] = clampToField(u.x + ox, u.y + oy);
    // 경기장 밖으로 멀리 나가면 공은 그 자리에 남는다
    if (Math.hypot(u.x - x, u.y - y) > LOSE_R) {
      ball.owner = null;
      ball.vx = ball.vy = 0;
      ball.dirty = true;
      return;
    }
    ball.x = x;
    ball.y = y;
    ball.vx = ball.vy = 0;
  }

  function roll(dt) {
    const sp = Math.hypot(ball.vx, ball.vy);
    if (sp === 0) return;
    const ns = sp * Math.exp(-FRICTION * dt) - DECEL * dt;
    if (ns < 3) { ball.vx = ball.vy = 0; return; }
    ball.vx *= ns / sp;
    ball.vy *= ns / sp;
    // 센 슛이 한 틱에 벽을 뚫지 않게 두 번에 나눠 움직인다
    for (let k = 0; k < 2; k++) {
      ball.x += ball.vx * dt / 2;
      ball.y += ball.vy * dt / 2;
      if (goalSide()) return;
      bounce();
    }
  }

  function bounce() {
    const F = FIELD, R = BALL_R;
    if (ball.y < F.y0 + R) { ball.y = F.y0 + R; ball.vy = Math.abs(ball.vy) * BOUNCE; }
    if (ball.y > F.y1 - R) { ball.y = F.y1 - R; ball.vy = -Math.abs(ball.vy) * BOUNCE; }
    const inLine = ball.x < F.x0 + R || ball.x > F.x1 - R;
    if (inLine && inMouth(ball.y)) {
      // 골대 입구 안에서는 골대 기둥 사이로만 움직인다
      if (ball.y < GOAL.y0 + 2) { ball.y = GOAL.y0 + 2; ball.vy = Math.abs(ball.vy) * BOUNCE; }
      if (ball.y > GOAL.y1 - 2) { ball.y = GOAL.y1 - 2; ball.vy = -Math.abs(ball.vy) * BOUNCE; }
      return;
    }
    if (ball.x < F.x0 + R) { ball.x = F.x0 + R; ball.vx = Math.abs(ball.vx) * BOUNCE; }
    if (ball.x > F.x1 - R) { ball.x = F.x1 - R; ball.vx = -Math.abs(ball.vx) * BOUNCE; }
  }

  function locked(id, now) {
    const until = ball.lock.get(id);
    return until !== undefined && now < until;
  }

  function giveBall(u, now) {
    const prevOwner = ball.owner;
    // 같은 팀이 찬 공을 받으면 그 사람이 도움 후보
    const k = ball.kick;
    ball.assist = !prevOwner && k && k.team === u.fs.team && k.id !== u.id ? k : null;
    ball.owner = u.id;
    ball.touch = touchOf(u);
    ball.kick = null;
    ball.vx = ball.vy = 0;
    ball.stealOkAt = now + STEAL_GAP_MS;
    ball.dirty = true;
  }

  function possession(now) {
    const owner = ball.owner ? members.get(ball.owner) : null;
    let best = null, bestD = Infinity;
    const sp = Math.hypot(ball.vx, ball.vy);
    for (const u of members.values()) {
      if (!onTeam(u) || u === owner || locked(u.id, now)) continue;
      const d = Math.hypot(u.x - ball.x, u.y - ball.y);
      if (owner) {
        // 드리블 중인 공은 상대만 뺏을 수 있고, 방금 주인이 바뀌었으면 잠깐 못 뺏는다
        if (u.fs.team === owner.fs.team || d > STEAL_R || now < ball.stealOkAt) continue;
      } else if (d > GRAB_R || sp > TRAP_MAX) {
        continue;
      }
      if (d < bestD) { best = u; bestD = d; }
    }
    if (!best) return;
    if (owner) ball.lock.set(owner.id, now + STOLEN_LOCK_MS);
    giveBall(best, now);
  }

  // ---------- 차기 ----------

  function kick(u, vx, vy) {
    const now = Date.now();
    ball.owner = null;
    ball.vx = vx;
    ball.vy = vy;
    ball.lock.set(u.id, now + KICK_LOCK_MS);
    ball.kick = touchOf(u);
    ball.touch = touchOf(u);
    ball.assist = null;
    ball.dirty = true;
    sendBall();
  }

  function canAct(u) {
    return phase === 'play' && onTeam(u);
  }

  // 바라보는 쪽에 있는 같은 팀 사람에게 자동으로 조준. 없으면 앞으로 적당히 찬다.
  function pass(u) {
    if (!canAct(u) || ball.owner !== u.id) return;
    const [fx, fy] = DIRV[u.dir] || [1, 0];
    let best = null, bestScore = Infinity;
    for (const m of teamList(u.fs.team)) {
      if (m === u || m.map !== 'futsal') continue;
      const dx = m.x - ball.x, dy = m.y - ball.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 10) continue;
      const cos = (dx * fx + dy * fy) / dist;
      if (cos < 0.42) continue;              // 바라보는 방향 ±65° 안
      const s = (1 - cos) * 120 + dist * 0.25;
      if (s < bestScore) { best = m; bestScore = s; }
    }
    if (!best) { kick(u, fx * PASS_FORWARD, fy * PASS_FORWARD); return; }
    // 걷고 있는 사람에게는 가는 쪽으로 조금 앞을 보고 찬다
    const [lx, ly] = best.moving ? (DIRV[best.dir] || [0, 0]) : [0, 0];
    const tx = best.x + lx * 10, ty = best.y + ly * 10;
    const dx = tx - ball.x, dy = ty - ball.y;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = clamp(dist * FRICTION * 1.15 + 40, PASS_MIN, PASS_MAX);
    kick(u, dx / dist * speed, dy / dist * speed);
  }

  // p: 모은 힘 0~1. 바라보는 방향에 상대 골대 쪽으로 보정을 더하고, 아주 세게 차면 조금 빗나간다.
  function shoot(u, p) {
    if (!canAct(u) || ball.owner !== u.id) return;
    p = clamp(Number(p) || 0, 0, 1);
    const speed = SHOT_MIN + (SHOT_MAX - SHOT_MIN) * p;
    const [fx, fy] = DIRV[u.dir] || [1, 0];
    const gx = u.fs.team === 'red' ? FIELD.x1 + 4 : FIELD.x0 - 4;
    const gy = clamp(ball.y + fy * 24, GOAL.y0 + 5, GOAL.y1 - 5);
    let tx = gx - ball.x, ty = gy - ball.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    let dx = fx, dy = fy;
    // 골대 반대쪽을 보고 차면 보정 없이 그대로(걷어내기)
    if (fx * tx + fy * ty > -0.2) { dx = fx * 0.3 + tx * 0.7; dy = fy * 0.3 + ty * 0.7; }
    const noise = (Math.random() * 2 - 1) * (0.03 + Math.max(0, p - 0.6) * 0.35);
    const a = Math.atan2(dy, dx) + noise;
    kick(u, Math.cos(a) * speed, Math.sin(a) * speed);
  }

  // 공 없이 S·D: 가까운 상대의 공을 뺏는다(쿨다운 있음)
  function tackle(u) {
    if (!canAct(u) || ball.owner === u.id) return;
    const now = Date.now();
    if (now < (u.fs.tackleOkAt || 0)) return;
    u.fs.tackleOkAt = now + TACKLE_GAP_MS;
    sendMap('futsal', { t: 'fsTk', id: u.id });
    const owner = ball.owner ? members.get(ball.owner) : null;
    if (!owner || owner.fs.team === u.fs.team) return;
    if (Math.hypot(u.x - ball.x, u.y - ball.y) > TACKLE_R) return;
    ball.lock.set(owner.id, now + STOLEN_LOCK_MS);
    giveBall(u, now);
    sendBall();
  }

  // ---------- 팀 / 시작 ----------

  function setTeam(u, want) {
    if (!members.has(u.id)) return;
    if (phase !== 'lobby') { sys('경기 중에는 팀을 바꿀 수 없어요. 경기가 끝나면 고를 수 있습니다.', u); return; }
    if (want === null || want === 'none') {
      if (!u.fs.team) return;
      u.fs.team = null;
      broadcastState();
      return;
    }
    if (u.mount != null) { sys('말을 탄 채로는 경기에 나갈 수 없어요. 경마장 마굿간에 말을 돌려놓고 오세요.', u); return; }
    let team = want;
    if (want === 'auto') {
      const r = teamList('red').filter(x => x !== u).length, b = teamList('blue').filter(x => x !== u).length;
      team = r < b ? 'red' : b < r ? 'blue' : (u.fs.team || (Math.random() < 0.5 ? 'red' : 'blue'));
    }
    if (!TEAMS.includes(team) || team === u.fs.team) return;
    if (teamList(team).length >= TEAM_MAX) { sys(`${TEAM_KO[team]} 팀은 가득 찼어요(최대 ${TEAM_MAX}명).`, u); return; }
    u.fs.team = team;
    broadcastState();
  }

  function start(u) {
    if (phase !== 'lobby' || !members.has(u.id)) return;
    if (!u.fs.team) { sys('팀에 참가한 사람만 경기를 시작할 수 있어요.', u); return; }
    if (!teamList('red').length || !teamList('blue').length) { sys('레드·블루 팀에 각각 1명 이상 있어야 시작할 수 있어요.', u); return; }
    beginMatch();
  }

  // ---------- 입장 / 퇴장 ----------

  function enter(u) {
    u.fs = { team: null, tackleOkAt: 0 };
    members.set(u.id, u);
  }

  function leave(u) {
    if (!members.has(u.id)) return;
    const wasPlayer = !!u.fs.team;
    members.delete(u.id);
    delete u.fs;
    ball.lock.delete(u.id);
    if (ball.owner === u.id) {
      ball.owner = null;
      ball.vx = ball.vy = 0;
      sendBall();
    }
    if (!wasPlayer) return;
    broadcastState();
    checkForfeit();
  }

  function handle(u, msg) {
    if (!members.has(u.id)) return;
    switch (msg.t) {
      case 'fsTeam': return setTeam(u, msg.team);
      case 'fsStart': return start(u);
      case 'fsPass': return pass(u);
      case 'fsShoot': return shoot(u, msg.p);
      case 'fsTackle': return tackle(u);
    }
  }

  return { enter, leave, handle, snapshot };
}

module.exports = { createFutsal, FIELD, GOAL, CENTER };
