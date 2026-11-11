// 코인 거래소 전광판 시세. 업비트 공개 웹소켓(키 없음)으로 원화(KRW) 마켓 체결 시세를 받는다.
// https://docs.upbit.com/kr/reference/websocket-ticker
//
//   const coins = createCoins(env)
//   coins.attach(fn)        fn({ t: 'coins', list }) 를 바뀐 코인이 있을 때 0.5초에 한 번씩 부른다
//   coins.snapshot()        { list, status } 코인 거래소에 들어온 사람에게 한 번 보낼 현재 모습
//   coins.setWatched(bool)  코인 거래소를 보는 사람이 있는지. 아무도 안 보면 업비트 연결을 끊는다.
//
// 등락은 업비트 기준(전일 종가 = 매일 09:00 KST 대비)이다.
//
// 환경변수
//   COINS_OFF=1   업비트 연결 끄기(전광판은 이름만 보인다)
'use strict';

const WebSocket = require('ws');

const URL = 'wss://api.upbit.com/websocket/v1';
// 화면 config.js 의 coins 와 같은 순서·기호. 이름은 화면이 갖고 있다.
const SYMBOLS = [
  'BTC', 'ETH', 'XRP', 'SOL', 'DOGE', 'ADA', 'TRX', 'LINK', 'AVAX', 'DOT',
  'SUI', 'BCH', 'ETC', 'XLM', 'HBAR', 'SHIB', 'NEAR', 'APT', 'ARB', 'ATOM',
  'AAVE', 'EOS', 'ALGO', 'SAND', 'MANA', 'AXS', 'STX', 'SEI', 'PEPE', 'IMX'
];
const FLUSH_MS = 500;
// 아무도 안 보게 된 뒤 이만큼 지나면 끊는다(잠깐 객장에 다녀오는 동안 다시 붙는 일을 줄인다)
const IDLE_CLOSE_MS = 60000;
const PING_MS = 60000;

function createCoins(env = {}) {
  const off = env.COINS_OFF === '1';
  const latest = new Map();     // 기호 → { sym, price, change, rate }
  const pending = new Map();
  let status = off ? '꺼짐' : '대기';
  let publish = () => {};
  let ws = null;
  let watched = false;
  let retry = 0;
  let idleTimer = 0;
  let retryTimer = 0;
  let pingTimer = 0;

  setInterval(() => {
    if (pending.size === 0) return;
    const list = [...pending.values()];
    pending.clear();
    publish({ t: 'coins', list });
  }, FLUSH_MS);

  function setStatus(s) {
    if (s === status) return;
    status = s;
    publish({ t: 'coins', status });
  }

  function connect() {
    if (off || ws) return;
    clearTimeout(retryTimer);
    setStatus('연결 중');
    const sock = new WebSocket(URL);
    ws = sock;
    sock.on('open', () => {
      retry = 0;
      // SIMPLE 형식은 필드 이름이 짧아 받는 양이 적다: cd 마켓, tp 현재가, scp 전일 대비, scr 전일 대비율
      sock.send(JSON.stringify([
        { ticket: 'pixel-exchange-' + Date.now() },
        { type: 'ticker', codes: SYMBOLS.map(s => 'KRW-' + s) },
        { format: 'SIMPLE' }
      ]));
      setStatus('LIVE');
      // 업비트는 120초 동안 아무 것도 안 보내면 끊으므로 ping 을 보낸다
      pingTimer = setInterval(() => { if (sock.readyState === 1) sock.ping(); }, PING_MS);
    });
    sock.on('message', (data) => {
      let j;
      try { j = JSON.parse(data.toString()); } catch { return; }
      if (!j || typeof j.cd !== 'string' || !j.cd.startsWith('KRW-')) return;
      const sym = j.cd.slice(4);
      const tick = { sym, price: j.tp, change: j.scp, rate: j.scr * 100 };
      const prev = latest.get(sym);
      if (prev && prev.price === tick.price && prev.change === tick.change) return;
      latest.set(sym, tick);
      pending.set(sym, tick);
    });
    sock.on('close', () => {
      clearInterval(pingTimer);
      if (ws === sock) ws = null;
      if (!watched) { setStatus('대기'); return; }
      const delay = Math.min(30000, 1000 * 2 ** retry++) + Math.random() * 500;
      setStatus('재연결 대기');
      console.warn(`[coins] upbit closed, retry in ${Math.round(delay)}ms`);
      retryTimer = setTimeout(connect, delay);
    });
    sock.on('error', (e) => console.warn('[coins] upbit error', e.message));
  }

  function disconnect() {
    clearTimeout(retryTimer);
    if (ws) {
      const sock = ws;
      ws = null;
      sock.close();
    }
  }

  return {
    attach(fn) { publish = fn; },

    snapshot() {
      return { list: [...latest.values()], status };
    },

    setWatched(v) {
      if (v === watched) return;
      watched = v;
      clearTimeout(idleTimer);
      if (watched) connect();
      else idleTimer = setTimeout(() => { if (!watched) disconnect(); }, IDLE_CLOSE_MS);
    }
  };
}

module.exports = { createCoins, SYMBOLS };
