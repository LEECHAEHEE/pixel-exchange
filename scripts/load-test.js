// 부하 측정: 자체 서버(5199)를 띄우고 봇 N개를 붙여 서버 CPU·메모리와 송수신량을 잰다.
//   node scripts/load-test.js [봇 수=30] [초=60] [--json out.json]
// 운영 포트(5178)는 건드리지 않는다. 끝나면 띄운 서버를 반드시 끈다.
'use strict';

const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const args = process.argv.slice(2);
let jsonOut = null;
const pos = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') jsonOut = args[++i];
  else pos.push(args[i]);
}
const N = Number(pos[0]) || 30;
const DURATION = Number(pos[1]) || 60;
const PORT = 5199;
if (PORT === 5178) throw new Error('운영 포트 사용 금지');

// 장소별 걸을 수 있는 영역 (사각형 목록)
const AREAS = {
  exchange: [{ x0: 4, x1: 316, y0: 120, y1: 179 }],
  crossroad: [{ x0: 140, x1: 180, y0: 0, y1: 179 }, { x0: 0, x1: 319, y0: 80, y1: 116 }],
  racetrack: [{ x0: 22, x1: 298, y0: 28, y1: 52 }]
};
const SPEED = 40; // px/s (0.1초에 4px)
const CHATS = ['안녕하세요', '오늘 장 어때요?', '떡상 가즈아', 'ㅋㅋㅋ', '몇 번 말이 이길까', 'hello'];

const rnd = (a, b) => a + Math.random() * (b - a);
const r1 = v => Math.round(v * 10) / 10;

// ---- 서버 자식 프로세스 ----
const env = Object.assign({}, process.env, { PORT: String(PORT), RACE_CYCLE_SEC: '150' });
delete env.MARKET_WS_URL; // 외부 시세 연결 없이 내장 시뮬레이션으로 고정
const child = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
  env, stdio: ['ignore', 'pipe', 'pipe']
});
let childExited = false;
child.on('exit', () => { childExited = true; });
child.stderr.on('data', d => process.stderr.write('[server] ' + d));
let serverReady;
const ready = new Promise(res => { serverReady = res; });
child.stdout.on('data', d => { if (String(d).includes('[server]')) serverReady(); });

function killChild() {
  if (!childExited) {
    try { child.kill('SIGTERM'); } catch {}
  }
}
process.on('exit', killChild);
process.on('SIGINT', () => { killChild(); process.exit(130); });
process.on('uncaughtException', e => { console.error(e); killChild(); process.exit(1); });

// ---- 집계 ----
const recv = { bytes: 0, count: 0, byType: new Map() };
let sentBytes = 0, sentCount = 0;
let measuring = false;
const cpu = [];
let maxRss = 0;

function onRecv(data) {
  if (!measuring) return;
  const s = data.toString();
  recv.bytes += Buffer.byteLength(s);
  recv.count++;
  let t = '?';
  try { t = JSON.parse(s).t || '?'; } catch {}
  const e = recv.byType.get(t) || { count: 0, bytes: 0 };
  e.count++; e.bytes += Buffer.byteLength(s);
  recv.byType.set(t, e);
}

// ---- 봇 ----
function makeBot(i) {
  const r = i / N;
  const map = r < 0.5 ? 'exchange' : r < 0.75 ? 'crossroad' : 'racetrack';
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const bot = { ws, map, x: 0, y: 0, dir: 'down', moving: false, target: null, pauseUntil: 0, voted: false, timers: [] };

  function send(msg) {
    if (ws.readyState !== WebSocket.OPEN) return;
    const s = JSON.stringify(msg);
    ws.send(s);
    if (measuring) { sentBytes += Buffer.byteLength(s); sentCount++; }
  }
  function randPoint() {
    const as = AREAS[map];
    const a = as[Math.floor(Math.random() * as.length)];
    return { x: rnd(a.x0, a.x1), y: rnd(a.y0, a.y1), a };
  }
  function tryVote() {
    if (map === 'racetrack' && !bot.voted) { bot.voted = true; send({ t: 'vote', horse: 1 + Math.floor(Math.random() * 5) }); }
  }

  ws.on('message', (data) => {
    onRecv(data);
    // 경마 상태가 betting 일 때 한 번만 투표
    if (map === 'racetrack' && !bot.voted) {
      try {
        const m = JSON.parse(data.toString());
        const phase = m.t === 'welcome' ? m.race && m.race.phase : m.t === 'race' ? (m.phase || (m.race && m.race.phase)) : null;
        if (phase === 'betting') setTimeout(tryVote, rnd(500, 5000));
      } catch {}
    }
  });
  ws.on('error', e => console.warn('[bot]', i, e.message));

  ws.on('open', () => {
    send({ t: 'join', name: 'bot' + i });
    const p = randPoint();
    bot.x = p.x; bot.y = p.y;
    if (map !== 'exchange') send({ t: 'go', map, x: r1(bot.x), y: r1(bot.y), dir: 'down' });

    // 이동: 0.1초마다, 걷는 중에만 보냄 (멈출 때 moving=false 한 번)
    bot.timers.push(setInterval(() => {
      const now = Date.now();
      if (now < bot.pauseUntil) return;
      if (!bot.target) {
        // 같은 사각형 안에서 목표를 정해 경계를 넘지 않게 한다
        const as = AREAS[map];
        const a = as.find(q => bot.x >= q.x0 && bot.x <= q.x1 && bot.y >= q.y0 && bot.y <= q.y1) || as[0];
        bot.target = { x: rnd(a.x0, a.x1), y: rnd(a.y0, a.y1) };
      }
      const dx = bot.target.x - bot.x, dy = bot.target.y - bot.y;
      const d = Math.hypot(dx, dy), step = SPEED * 0.1;
      if (d <= step) {
        bot.x = bot.target.x; bot.y = bot.target.y; bot.target = null;
        bot.moving = false;
        send({ t: 'move', x: r1(bot.x), y: r1(bot.y), dir: bot.dir, moving: false });
        // 가끔 멈춰 선다
        if (Math.random() < 0.5) bot.pauseUntil = now + rnd(1000, 5000);
        return;
      }
      bot.x += dx / d * step; bot.y += dy / d * step;
      bot.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      bot.moving = true;
      send({ t: 'move', x: r1(bot.x), y: r1(bot.y), dir: bot.dir, moving: true });
    }, 100));

    // 채팅 ~20초에 한 번, 감정표현 ~30초에 한 번 (평균)
    bot.timers.push(setInterval(() => {
      if (Math.random() < 1 / 20) send({ t: 'chat', text: CHATS[Math.floor(Math.random() * CHATS.length)] });
      if (Math.random() < 1 / 30) send({ t: 'emote', emote: 'bow' });
    }, 1000));
  });
  return bot;
}

function psSample(pid) {
  return new Promise(res => {
    execFile('ps', ['-o', '%cpu=,rss=', '-p', String(pid)], (err, out) => {
      if (err) return res(null);
      const [c, r] = out.trim().split(/\s+/).map(Number);
      res({ cpu: c, rss: r });
    });
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  await Promise.race([ready, sleep(5000)]);
  if (childExited) throw new Error('서버가 뜨지 않음');
  const bots = [];
  for (let i = 0; i < N; i++) { bots.push(makeBot(i)); await sleep(20); }
  await sleep(2000); // 입장(welcome) 폭주는 측정에서 뺀다

  measuring = true;
  const t0 = Date.now();
  const sampler = setInterval(async () => {
    const s = await psSample(child.pid);
    if (s) { cpu.push(s.cpu); maxRss = Math.max(maxRss, s.rss); }
  }, 1000);
  await sleep(DURATION * 1000);
  measuring = false;
  clearInterval(sampler);
  const secs = (Date.now() - t0) / 1000;

  const open = bots.filter(b => b.ws.readyState === WebSocket.OPEN).length;
  for (const b of bots) { b.timers.forEach(clearInterval); b.ws.terminate(); }

  const avgCpu = cpu.length ? cpu.reduce((a, b) => a + b, 0) / cpu.length : 0;
  const types = [...recv.byType.entries()]
    .map(([t, e]) => ({ t, countPerSec: e.count / secs, bytesPerSec: e.bytes / secs }))
    .sort((a, b) => b.bytesPerSec - a.bytesPerSec);
  const summary = {
    at: new Date().toISOString(), bots: N, openAtEnd: open, seconds: Math.round(secs * 10) / 10,
    server: { avgCpu: +avgCpu.toFixed(1), maxCpu: Math.max(0, ...cpu), maxRssMB: +(maxRss / 1024).toFixed(1), samples: cpu.length },
    down: {
      bytesPerSec: Math.round(recv.bytes / secs), msgsPerSec: +(recv.count / secs).toFixed(1),
      bytesPerSecPerBot: Math.round(recv.bytes / secs / N), msgsPerSecPerBot: +(recv.count / secs / N).toFixed(1)
    },
    up: { bytesPerSec: Math.round(sentBytes / secs), msgsPerSec: +(sentCount / secs).toFixed(1) },
    byType: types.map(x => ({ t: x.t, countPerSec: +x.countPerSec.toFixed(2), bytesPerSec: Math.round(x.bytesPerSec) }))
  };

  const kb = v => (v / 1024).toFixed(1) + ' KB/s';
  console.log(`\n== load-test: ${N} bots, ${summary.seconds}s (open at end ${open}/${N}) ==`);
  console.log(`server CPU avg ${summary.server.avgCpu}%  max ${summary.server.maxCpu}%  max RSS ${summary.server.maxRssMB} MB  (${cpu.length} samples)`);
  console.log(`down total ${kb(summary.down.bytesPerSec)}  ${summary.down.msgsPerSec} msg/s | per bot ${kb(summary.down.bytesPerSecPerBot)}  ${summary.down.msgsPerSecPerBot} msg/s`);
  console.log(`up   total ${kb(summary.up.bytesPerSec)}  ${summary.up.msgsPerSec} msg/s`);
  console.log('by type (down, all bots):');
  for (const x of summary.byType) {
    console.log(`  ${x.t.padEnd(10)} ${String(x.countPerSec).padStart(9)} msg/s  ${kb(x.bytesPerSec).padStart(12)}`);
  }
  if (jsonOut) { fs.writeFileSync(jsonOut, JSON.stringify(summary, null, 2)); console.log('json →', jsonOut); }

  killChild();
  await sleep(300);
  process.exit(0);
}

main().catch(e => { console.error(e); killChild(); process.exit(1); });
