// 토스증권 Open API 시세 공급원 (https://developers.tossinvest.com/docs)
//
// - 종목: 섹터 API 가 주는 시가총액으로 국내 상위 N 종목을 골라 전광판에 시가총액 순으로 깐다.
//         시가총액은 하루 한 번 갱신되는 값이라 순위는 TOSS_RANK_MS(기본 1시간)마다만 다시 잡는다.
// - 시세: 현재가 API 를 TOSS_POLL_MS(기본 2초)마다 200종목씩 한 번에 조회한다.
//         현재가 API 에는 전일 대비가 없어서, 일봉의 전일 종가를 기준가로 잡고 등락을 계산한다.
// - 지수: KOSPI·KOSDAQ 도 같은 방식(현재가 + 일봉 전일 종가).
//
// 키는 코드에 쓰지 않는다. 환경변수 TOSS_CLIENT_ID·TOSS_CLIENT_SECRET, 또는 두 줄짜리 파일 경로
// TOSS_KEY_FILE(첫 줄 client_id tsck_…, 둘째 줄 client_secret tssk_…)로 넘긴다.
// 토스증권 WTS > 설정 > Open API > 허용 IP 관리 에 서버의 공인 IP 가 등록돼 있어야 한다(아니면 403).
// 토큰은 client 당 1개만 유효하다. 같은 키로 서버 두 개(예: 내 PC + Render)를 띄우면 서로의 토큰을 무효화한다.
'use strict';

const fs = require('fs');

const BASE = 'https://openapi.tossinvest.com';

// 문서의 그룹별 초당 한도보다 조금 느리게 부른다
const GROUP_TPS = {
  AUTH: 2,
  SECTOR: 4,
  MARKET_DATA: 10,
  MARKET_DATA_CHART: 15,
  MARKET_INDICATOR: 8,
  MARKET_INDICATOR_CHART: 4
};

const PRICE_CHUNK = 200;

function readKeys(env) {
  let id = env.TOSS_CLIENT_ID;
  let secret = env.TOSS_CLIENT_SECRET;
  if ((!id || !secret) && env.TOSS_KEY_FILE) {
    const lines = fs.readFileSync(env.TOSS_KEY_FILE, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    id = id || lines.find(l => l.startsWith('tsck_')) || lines[0];
    secret = secret || lines.find(l => l.startsWith('tssk_')) || lines[1];
  }
  return id && secret ? { id, secret } : null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// KST 날짜 'YYYY-MM-DD'
function kstDate(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
}

// 평일 07:50~20:10 KST 만 자주 조회한다(NXT 프리마켓 08:00 ~ 애프터마켓 20:00)
function isTradingWindow(d = new Date()) {
  const k = new Date(d.getTime() + 9 * 3600e3);
  const day = k.getUTCDay();
  if (day === 0 || day === 6) return false;
  const min = k.getUTCHours() * 60 + k.getUTCMinutes();
  return min >= 7 * 60 + 50 && min <= 20 * 60 + 10;
}

function createClient({ id, secret }) {
  let token = null;
  let tokenUntil = 0;
  let tokenPromise = null;
  const nextAt = new Map();

  // 그룹별로 호출 간격을 벌린다. 예약 시각을 먼저 잡아 두므로 동시에 불러도 순서대로 나간다.
  async function throttle(group) {
    const gap = 1000 / (GROUP_TPS[group] || 2);
    const now = Date.now();
    const at = Math.max(now, nextAt.get(group) || 0);
    nextAt.set(group, at + gap);
    if (at > now) await sleep(at - now);
  }

  async function issueToken() {
    await throttle('AUTH');
    const res = await fetch(BASE + '/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
      const err = new Error(`token ${res.status} ${body.error || ''} ${body.error_description || ''}`.trim());
      err.status = res.status;
      throw err;
    }
    token = body.access_token;
    // 만료 5분 전에 새로 받는다
    tokenUntil = Date.now() + Math.max(60, (body.expires_in || 3600) - 300) * 1000;
  }

  async function ensureToken(force) {
    if (!force && token && Date.now() < tokenUntil) return;
    if (!tokenPromise) tokenPromise = issueToken().finally(() => { tokenPromise = null; });
    await tokenPromise;
  }

  async function get(path, group, attempt = 0) {
    await ensureToken(false);
    await throttle(group);
    const res = await fetch(BASE + path, { headers: { Authorization: 'Bearer ' + token } });
    const body = await res.json().catch(() => null);
    if (res.ok) return body && body.result;

    const code = body && body.error && body.error.code;
    if (res.status === 401 && attempt < 1) {
      // 만료·재발급으로 무효가 된 토큰이면 새로 받아 한 번만 다시 시도
      await ensureToken(true);
      return get(path, group, attempt + 1);
    }
    if (res.status === 429 && attempt < 3) {
      const wait = Number(res.headers.get('retry-after')) || 2 ** attempt;
      await sleep(wait * 1000 + Math.random() * 300);
      return get(path, group, attempt + 1);
    }
    const err = new Error(`${path.split('?')[0]} ${res.status} ${code || ''}`.trim());
    err.status = res.status;
    err.code = code;
    throw err;
  }

  return { get };
}

// 일봉 두 개에서 전일 종가를 고른다. 맨 앞 봉이 오늘 것이면 그다음 봉, 아니면(장 시작 전) 맨 앞 봉.
function prevClose(candles, today) {
  if (!Array.isArray(candles) || candles.length === 0) return null;
  const first = candles[0];
  const pick = String(first.timestamp).slice(0, 10) === today ? candles[1] : first;
  return pick ? Number(pick.closePrice) : null;
}

function tossSource(market, env, keys) {
  const api = createClient(keys);
  const topN = Math.max(1, Math.min(1000, Number(env.TOSS_TOP) || 192));
  const pollMs = Math.max(1000, Number(env.TOSS_POLL_MS) || 2000);
  const idlePollMs = 60000;
  const rankMs = Math.max(10 * 60e3, Number(env.TOSS_RANK_MS) || 3600e3);
  const INDEX_NAMES = ['KOSPI', 'KOSDAQ'];

  let stocks = [];               // [{ code, name, cap }] 시가총액 순
  const base = new Map();        // code → 전일 종가
  const lastPrice = new Map();   // code → 마지막으로 보낸 현재가
  const indexBase = new Map();   // KOSPI/KOSDAQ → 전일 종가
  let baseDay = '';
  let failing = false;

  function fail(where, e) {
    console.warn(`[toss] ${where} failed: ${e.message}`);
    if (!failing) {
      failing = true;
      const hint = e.status === 403 ? '허용 IP 미등록' : '연결 오류';
      market.setStatus(hint, false);
    }
  }

  function ok() {
    if (failing || !stocks.length) return;
    market.setStatus('LIVE', true);
  }

  async function loadRanking() {
    const res = await api.get('/api/v1/sectors', 'SECTOR');
    const roots = (res && res.sectors || []).filter(s => s.depth === 0);
    const caps = new Map();
    for (const s of roots) {
      const r = await api.get(`/api/v1/sectors/${encodeURIComponent(s.sectorId)}/stocks?marketCountry=KR`, 'SECTOR');
      for (const st of (r && r.stocks) || []) {
        if (st.marketCapitalization == null) continue;
        const cap = Number(st.marketCapitalization);
        const prev = caps.get(st.symbol);
        if (!prev || cap > prev.cap) caps.set(st.symbol, { code: st.symbol, name: st.name, cap });
      }
    }
    const list = [...caps.values()].sort((a, b) => b.cap - a.cap).slice(0, topN);
    if (!list.length) throw new Error('섹터 API 에서 시가총액 종목을 하나도 받지 못함');
    return list;
  }

  async function loadBases(list, today) {
    for (const s of list) {
      if (baseDay === today && base.has(s.code)) continue;
      try {
        const r = await api.get(`/api/v1/candles?symbol=${encodeURIComponent(s.code)}&interval=1d&count=2`, 'MARKET_DATA_CHART');
        const p = prevClose(r && r.candles, today);
        if (p) base.set(s.code, p);
      } catch (e) {
        console.warn(`[toss] base ${s.code} failed: ${e.message}`);
      }
    }
    for (const name of INDEX_NAMES) {
      try {
        const r = await api.get(`/api/v1/market-indicators/${name}/candles?interval=1d&count=2`, 'MARKET_INDICATOR_CHART');
        const p = prevClose(r && r.candles, today);
        if (p) indexBase.set(name, p);
      } catch (e) {
        console.warn(`[toss] index base ${name} failed: ${e.message}`);
      }
    }
    baseDay = today;
  }

  async function refreshRanking() {
    try {
      const list = await loadRanking();
      const today = kstDate();
      if (today !== baseDay) { base.clear(); indexBase.clear(); }
      await loadBases(list, today);
      const changed = list.map(s => s.code).join() !== stocks.map(s => s.code).join();
      stocks = list;
      if (changed) {
        market.setSymbols(stocks);
        lastPrice.clear();
        console.log(`[toss] 시가총액 상위 ${stocks.length}종목: ${stocks.slice(0, 5).map(s => s.name).join(', ')} …`);
      }
      market.setTicker(`시세: 토스증권 Open API · 시가총액 상위 ${stocks.length}종목`);
      failing = false;
      ok();
    } catch (e) {
      fail('ranking', e);
    }
  }

  async function pollPrices() {
    if (!stocks.length) return;
    const ticks = [];
    for (let i = 0; i < stocks.length; i += PRICE_CHUNK) {
      const codes = stocks.slice(i, i + PRICE_CHUNK).map(s => s.code);
      const list = await api.get('/api/v1/prices?symbols=' + codes.join(','), 'MARKET_DATA');
      for (const p of list || []) {
        const price = Number(p.lastPrice);
        if (!Number.isFinite(price) || lastPrice.get(p.symbol) === price) continue;
        lastPrice.set(p.symbol, price);
        const b = base.get(p.symbol);
        const change = b ? price - b : null;
        ticks.push({ code: p.symbol, price, change, rate: b ? change / b * 100 : null });
      }
    }
    if (ticks.length) market.push(ticks);

    const idx = await api.get('/api/v1/market-indicators/prices?symbols=' + INDEX_NAMES.join(','), 'MARKET_INDICATOR');
    const out = [];
    for (const it of idx || []) {
      const value = Number(it.lastPrice);
      if (!Number.isFinite(value)) continue;
      const b = indexBase.get(it.symbol);
      const change = b ? value - b : null;
      out.push({ name: it.symbol, value, change, rate: b ? change / b * 100 : null });
    }
    if (out.length) market.setIndices(out);
  }

  async function pollLoop() {
    for (;;) {
      const started = Date.now();
      try {
        // 날짜가 바뀌면 전일 종가를 새로 잡는다
        if (stocks.length && kstDate() !== baseDay) await refreshRanking();
        await pollPrices();
        if (failing) { failing = false; }
        ok();
      } catch (e) {
        fail('prices', e);
      }
      const wait = (isTradingWindow() ? pollMs : idlePollMs) - (Date.now() - started);
      // 실패가 이어지면 조금 더 쉬었다가 다시 부른다
      await sleep(Math.max(failing ? 10000 : 200, wait));
    }
  }

  market.setStatus('연결 중', false);
  market.setTicker('토스증권 시세 불러오는 중');

  (async () => {
    // 첫 순위를 받을 때까지 1분 간격으로 다시 시도한다(허용 IP 미등록 등)
    while (!stocks.length) {
      await refreshRanking();
      if (!stocks.length) await sleep(60000);
    }
    setInterval(refreshRanking, rankMs);
    pollLoop();
  })();
}

module.exports = { tossSource, readKeys };
