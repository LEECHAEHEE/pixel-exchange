// 경마. 5분마다(시계 기준 :00, :05, ...) 한 경주, 말 5마리, 5바퀴.
//
//   투표(betting) → 경주(racing) → 결과(result) → 다음 경주 투표 ...
//
// 경주는 출발 순간 서버가 끝까지 한 번에 계산해 두고, 말마다 0.25초 간격 위치(바퀴 수)를 모두에게 보낸다.
// 화면은 그 사이를 이어 그리기만 하므로 모두가 같은 경주를 보고, 경주 중에 들어온 사람도 같은 장면에 합류한다.
// 투표는 출발 전에 마감되므로 출발과 함께 결과가 담긴 계획을 보내도 문제없다.
'use strict';

const HORSES = 5;
const LAPS = 5;
const CYCLE_MS = 5 * 60 * 1000;
// 시험용으로 주기를 줄일 때도 경주(약 1분 30초)·결과·투표가 들어가야 한다
const MIN_CYCLE_MS = 150 * 1000;
// 서버를 막 켰을 때 다음 경주까지 이보다 짧으면 한 판 건너뛴다(주기의 1/5, 최대 1분)
const MIN_BETTING_MS = 60 * 1000;
const RESULT_MS = 20 * 1000;
const VOTES_BROADCAST_MS = 500;

// ---------- 경주 계산 ----------

const DT = 0.05;          // 계산 간격(초)
const FRAME_S = 0.25;     // 화면에 보내는 위치 간격(초)
const PACE_S = 90;        // 5바퀴 평균 소요 시간(초)
const COOLDOWN_S = 3;     // 결승선을 지나 멈추기까지

// 시드를 넣으면 같은 경주가 다시 나온다(시험용)
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// 균등분포 넷을 더한 근사 정규분포(평균 0, 표준편차 1)
function gauss(r) {
  return (r() + r() + r() + r() - 2) / 0.5774;
}

const round4 = v => Math.round(v * 1e4) / 1e4;

// 모든 말이 같은 규칙을 따르므로 번호에 따른 유불리는 없다. 승부를 가르는 건 운뿐이다.
//   - 속도는 1~3초마다 조금씩 오르내린다(평균 ±6%)
//   - 뒤처진 말은 따라붙는 힘을 받고, 혼자 앞서 나간 말은 살짝 힘이 빠진다 → 무리가 흩어지지 않는다
//   - 마지막 바퀴에서 말마다 정해진 시점에 막판 스퍼트. 너무 일찍 시작하면 결승 전에 힘이 빠진다
//   - 마지막 바퀴에서는 따라붙는 힘을 줄여 스퍼트가 승부를 가른다
function simulate(r) {
  const base = LAPS / PACE_S;
  const horses = [];
  for (let i = 0; i < HORSES; i++) {
    horses.push({
      pos: 0, v: 0, target: base, next: 0,
      spurtAt: LAPS - 1 + 0.1 + r() * 0.65,
      spurtPow: 0.05 + r() * 0.1,
      spurtLen: 3 + r() * 7,
      spurtT: null,
      finish: null
    });
  }

  const frames = [horses.map(() => 0)];
  let t = 0;
  let nextFrame = FRAME_S;
  // 마지막 말까지 들어온 시각. 그 뒤 COOLDOWN_S 만큼 더 계산해 멈추는 모습까지 담는다.
  let allDone = null;

  while (allDone === null || t < allDone + COOLDOWN_S) {
    t += DT;
    let leader = 0;
    let second = 0;
    for (const h of horses) {
      if (h.pos > leader) { second = leader; leader = h.pos; } else if (h.pos > second) second = h.pos;
    }

    for (const h of horses) {
      if (h.finish !== null) {
        // 결승선을 지나면 천천히 멈춘다
        h.v *= 1 - DT * 0.8;
        h.pos += h.v * DT;
        continue;
      }
      if (t >= h.next) {
        h.target = base * (1 + gauss(r) * 0.06);
        h.next = t + 1 + r() * 2;
      }

      const finalLap = h.pos >= LAPS - 1;
      let mult = 1 + Math.min(leader - h.pos, 0.3) * (finalLap ? 0.25 : 0.7);
      if (h.pos === leader && leader - second > 0.03) mult *= 0.985;

      if (h.spurtT === null && h.pos >= h.spurtAt) h.spurtT = t;
      if (h.spurtT !== null) mult *= t - h.spurtT < h.spurtLen ? 1 + h.spurtPow : 1 - h.spurtPow * 0.5;

      h.v += (h.target * mult - h.v) * Math.min(1, DT * 1.2);
      const prev = h.pos;
      h.pos += h.v * DT;
      if (h.pos >= LAPS) {
        // 계산 간격 사이 어디서 선을 넘었는지 비례로 나눠 기록한다(사진 판정)
        h.finish = t - DT + (LAPS - prev) / (h.pos - prev) * DT;
      }
    }
    if (allDone === null && horses.every(h => h.finish !== null)) allDone = t;
    if (t >= nextFrame - 1e-9) {
      frames.push(horses.map(h => round4(h.pos)));
      nextFrame += FRAME_S;
    }
  }

  const order = horses.map((h, i) => i).sort((a, b) => horses[a].finish - horses[b].finish).map(i => i + 1);
  return {
    frameS: FRAME_S,
    frames,
    finish: horses.map(h => Math.round(h.finish * 1000) / 1000),
    order,
    duration: frames.length * FRAME_S
  };
}

// ---------- 일정·투표 ----------

function nextStart(now, cycle) {
  let s = Math.ceil((now + 1) / cycle) * cycle;
  if (s - now < Math.min(MIN_BETTING_MS, cycle / 5)) s += cycle;
  return s;
}

// cycleMs 는 시험용(RACE_CYCLE_SEC). 평소에는 5분.
function createRace({ broadcast, cycleMs = CYCLE_MS }) {
  const cycle = Math.max(MIN_CYCLE_MS, cycleMs);
  let round = 0;
  let phase = 'betting';
  let startAt = 0;
  let endAt = 0;
  let plan = null;
  let result = null;
  const votes = new Map();
  let votesDirty = false;

  function counts() {
    const c = new Array(HORSES).fill(0);
    for (const h of votes.values()) c[h - 1]++;
    return c;
  }

  // 접속 직후(welcome)와 단계가 바뀔 때 보내는 전체 상태. now 로 화면이 시계 차이를 맞춘다.
  function snapshot() {
    const s = { now: Date.now(), round, phase, startAt, endAt, horses: HORSES, laps: LAPS, counts: counts() };
    if (phase === 'racing') s.plan = plan;
    if (phase === 'result') {
      s.final = plan.frames[plan.frames.length - 1];
      s.result = result;
    }
    return s;
  }

  function announce() {
    broadcast(Object.assign({ t: 'race' }, snapshot()));
  }

  function openBetting() {
    round++;
    phase = 'betting';
    plan = null;
    result = null;
    votes.clear();
    startAt = nextStart(Date.now(), cycle);
    endAt = 0;
    announce();
    console.log(`[race] #${round} betting until ${new Date(startAt).toISOString()}`);
    setTimeout(start, startAt - Date.now());
  }

  function start() {
    phase = 'racing';
    plan = simulate(mulberry32((Math.random() * 2 ** 32) >>> 0));
    endAt = startAt + Math.ceil(plan.duration * 1000);
    announce();
    console.log(`[race] #${round} start votes=${votes.size} order=${plan.order.join('-')}`);
    setTimeout(finish, endAt - Date.now());
  }

  function finish() {
    const winner = plan.order[0];
    let hits = 0;
    for (const h of votes.values()) if (h === winner) hits++;
    result = { order: plan.order, finish: plan.finish, winner, hits };
    phase = 'result';
    announce();
    console.log(`[race] #${round} result winner=${winner} hits=${hits}/${votes.size}`);
    setTimeout(openBetting, RESULT_MS);
  }

  // 투표는 출발 전, 경마장 안에서만. 다시 하면 바뀐다.
  function vote(u, horse) {
    if (phase !== 'betting') return { ok: false, reason: '투표가 마감됐습니다' };
    if (u.map !== 'racetrack') return { ok: false, reason: '경마장에서만 투표할 수 있습니다' };
    if (!Number.isInteger(horse) || horse < 1 || horse > HORSES) return { ok: false, reason: '없는 말입니다' };
    votes.set(u.id, horse);
    votesDirty = true;
    return { ok: true, horse };
  }

  function myVote(id) {
    return votes.get(id) || null;
  }

  // 나간 사람 표는 뺀다(다시 들어오면 새로 투표)
  function leave(id) {
    if (phase === 'betting' && votes.delete(id)) votesDirty = true;
  }

  // 표가 몰려도 집계는 0.5초에 한 번만 뿌린다
  setInterval(() => {
    if (!votesDirty) return;
    votesDirty = false;
    broadcast({ t: 'raceVotes', counts: counts() });
  }, VOTES_BROADCAST_MS);

  openBetting();

  return { snapshot, vote, myVote, leave };
}

module.exports = { createRace, simulate, mulberry32, HORSES, LAPS, CYCLE_MS, RESULT_MS, MIN_BETTING_MS };
