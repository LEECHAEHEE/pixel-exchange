// 시세 중계. 서버가 시세 공급원에 한 번만 연결하고, 받은 값을 모든 접속자에게 나눠 준다.
// 새로 들어온 사람에게는 snapshot() 으로 지금까지의 마지막 값을 한 번에 보낸다.
//
// 공급원은 아래 메서드로만 값을 넣는다(화면의 board 메서드와 모양이 같다).
//   market.setSymbols([{ code, name }])
//   market.push(tick | tick[])           { code, price, change, rate, name? }
//   market.setIndices([{ name, value, change, rate, volume?, amount? }])
//   market.setTicker(text)               공급원 안내 문구. 뉴스 헤드라인 뒤에 붙는다
//   market.setNews([{ src, title, time }])  경제 뉴스 헤드라인 (server/news.js)
//   market.setStatus(text, live)
'use strict';

const WebSocket = require('ws');
const { tossSource, readKeys } = require('./toss');

const FLUSH_MS = 200;

// 'HH:MM' (KST)
function kstTime(ms) {
  return new Date(ms + 9 * 3600e3).toISOString().slice(11, 16);
}

function createMarket() {
  let symbols = [];
  const latest = new Map();
  const indices = new Map();
  let ticker = '';
  // 띠 문구 = 뉴스 헤드라인 + 시세 공급원 안내. 둘 중 하나만 바뀌어도 합쳐서 다시 보낸다.
  let sourceNote = '';
  let headlines = [];
  let status = { text: '시세 대기', live: false };

  function composeTicker() {
    const sep = '   ◆   ';
    const parts = headlines.map(h => `[${h.src} ${kstTime(h.time)}] ${h.title}`);
    if (sourceNote) parts.push(sourceNote);
    const text = parts.join(sep);
    if (text === ticker) return;
    ticker = text;
    publish({ t: 'ticker', text: ticker });
  }

  const pending = new Map();
  let publish = () => {};
  // 객장을 보는 사람이 있는지. 데모 공급원은 아무도 안 볼 때 쉰다.
  let watched = false;
  const watchers = [];

  // 같은 종목 틱이 0.2초 안에 여러 번 오면 마지막 값만 보낸다
  setInterval(() => {
    if (pending.size === 0) return;
    const ticks = [...pending.values()];
    pending.clear();
    publish({ t: 'ticks', ticks });
  }, FLUSH_MS);

  return {
    // room 이 만들어진 뒤 '객장을 보는 사람에게 보내기' 를 연결한다
    attach(fn) { publish = fn; },

    // room 이 객장을 보는 사람이 생기고 없어질 때 알린다
    setWatched(v) {
      if (v === watched) return;
      watched = v;
      for (const fn of watchers) fn(watched);
    },
    // 공급원이 쉬고 다시 시작하는 데 쓴다. 등록할 때 지금 상태로 한 번 부른다.
    onWatch(fn) {
      watchers.push(fn);
      fn(watched);
    },

    snapshot() {
      return { symbols, ticks: [...latest.values()], indices: [...indices.values()], ticker, status };
    },

    setSymbols(list) {
      symbols = list.map(s => ({ code: s.code, name: s.name }));
      publish({ t: 'symbols', symbols });
    },

    push(ticks) {
      if (!Array.isArray(ticks)) ticks = [ticks];
      for (const t of ticks) {
        if (!t || t.code == null) continue;
        latest.set(t.code, t);
        pending.set(t.code, t);
      }
    },

    setIndices(list) {
      for (const it of list) indices.set(it.name, it);
      publish({ t: 'indices', indices: list });
    },

    // 시세 공급원 안내 문구(데모·토스 등)
    setTicker(text) {
      sourceNote = text || '';
      composeTicker();
    },

    // 경제 뉴스 헤드라인 [{ src, title, time }]
    setNews(list) {
      headlines = list || [];
      composeTicker();
    },

    setStatus(text, live) {
      status = { text, live: !!live };
      publish({ t: 'status', ...status });
    }
  };
}

// ---------- 공급원 ----------

// 화면 확인용 가짜 시세
function demoSource(market) {
  const names = ['삼성전자', 'SK하이닉스', 'LG에너지솔루션', '삼성바이오', '현대차', '기아', '셀트리온', 'KB금융',
    'NAVER', '카카오', 'POSCO홀딩스', '신한지주', '삼성물산', 'LG화학', '현대모비스', '삼성SDI',
    '하나금융', '한국전력', 'KT&G', 'SK텔레콤', '포스코퓨처엠', 'HMM', '삼성생명', '고려아연',
    '대한항공', 'LG전자', '크래프톤', '한화오션', '두산에너빌', '에코프로', '알테오젠', '엔씨소프트',
    '삼성전기', 'SK이노베이션', 'S-Oil', '한미반도체', 'LIG넥스원', '한화에어로', 'HD현대중공업', '현대건설'];
  // 칸 수가 화면 크기에 따라 달라지므로 가장 큰 전광판도 채울 만큼 만든다
  const COUNT = 200;
  const stocks = [];
  for (let i = 0; i < COUNT; i++) {
    const base = Math.round((5000 + Math.random() * 300000) / 50) * 50;
    const name = names[i] || '데모종목' + String(i + 1).padStart(3, '0');
    stocks.push({ code: 'D' + String(i).padStart(5, '0'), name, base, price: base });
  }
  const idx = [
    { name: 'KOSPI', base: 2650, value: 2650, volume: 33000, amount: 49000 },
    { name: 'KOSDAQ', base: 850, value: 850, volume: 48000, amount: 31000 }
  ];

  market.setSymbols(stocks);
  market.setStatus('DEMO', true);
  market.setTicker('데모 모드 · 가짜 시세입니다 · 서버에서 모든 접속자에게 같은 시세를 보냅니다');

  function step() {
    const ticks = [];
    for (const s of stocks) {
      if (Math.random() > 0.3) continue;
      s.price = Math.max(50, Math.round(s.price * (1 + (Math.random() - 0.5) * 0.01) / 50) * 50);
      const change = s.price - s.base;
      ticks.push({ code: s.code, price: s.price, change, rate: change / s.base * 100 });
    }
    market.push(ticks);
    market.setIndices(idx.map(it => {
      it.value = Math.round(it.value * (1 + (Math.random() - 0.5) * 0.001) * 100) / 100;
      const change = it.value - it.base;
      // 거래량·대금은 장중 누적이라 줄지 않고 조금씩 늘기만 한다
      it.volume += Math.random() * 3;
      it.amount += Math.random() * 4;
      return { name: it.name, value: it.value, change, rate: change / it.base * 100, volume: it.volume, amount: it.amount };
    }));
  }

  // 객장을 보는 사람이 없으면 가짜 시세를 만들지 않는다. 돌아오면 바로 한 번 움직이고 다시 돈다.
  let timer = null;
  market.onWatch((watched) => {
    if (watched && !timer) {
      step();
      timer = setInterval(step, 250);
    } else if (!watched && timer) {
      clearInterval(timer);
      timer = null;
    }
  });
}

// 실제 증권사 API 자리. MARKET_WS_URL 을 주면 이 공급원을 쓴다.
// API 키는 코드에 쓰지 말고 환경변수(MARKET_API_KEY)로 넘긴다.
// TODO: 증권사 메시지 형식에 맞춰 subscribe 와 parse 를 채운다.
function apiSource(market, { url, apiKey }) {
  let retry = 0;

  function subscribe(ws) {
    // 예: ws.send(JSON.stringify({ type: 'subscribe', key: apiKey, codes: ['005930', '000660'] }));
  }

  // 반환 형식: { ticks?, indices?, ticker? } 또는 null
  function parse(data) {
    return null;
  }

  function connect() {
    market.setStatus('연결 중', false);
    const ws = new WebSocket(url);
    ws.on('open', () => {
      retry = 0;
      market.setStatus('LIVE', true);
      subscribe(ws);
    });
    ws.on('message', (data) => {
      let msg;
      try {
        msg = parse(data.toString());
      } catch (e) {
        console.warn('[market] parse failed', e.message);
        return;
      }
      if (!msg) return;
      if (msg.ticks) market.push(msg.ticks);
      if (msg.indices) market.setIndices(msg.indices);
      if (msg.ticker) market.setTicker(msg.ticker);
    });
    ws.on('close', () => {
      const delay = Math.min(30000, 1000 * 2 ** retry++);
      market.setStatus('재연결 대기', false);
      console.warn(`[market] upstream closed, retry in ${delay}ms`);
      setTimeout(connect, delay);
    });
    ws.on('error', (e) => console.warn('[market] upstream error', e.message));
  }

  connect();
}

// us 는 미국 증시 전광판 보관소(us.js). 토스로 받을 때만 채운다.
function startSource(market, env, us) {
  const tossKeys = readKeys(env);
  if (tossKeys) {
    console.log('[market] source=toss');
    tossSource(market, env, tossKeys, us);
  } else if (env.MARKET_WS_URL) {
    console.log('[market] source=api');
    apiSource(market, { url: env.MARKET_WS_URL, apiKey: env.MARKET_API_KEY });
  } else {
    console.log('[market] source=demo');
    demoSource(market);
  }
}

module.exports = { createMarket, startSource };
