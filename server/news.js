// 경제 뉴스 헤드라인. 언론사 RSS 를 주기적으로 읽어 최신 제목만 전광판 아래 띠에 흘린다.
// 저작권 때문에 본문·요약은 쓰지 않고 [출처] 제목 만 보여 준다.
//
//   startNews(onHeadlines, env)   onHeadlines([{ src, title, link, time }]) 를 새 목록이 생길 때마다 부른다
//
// 환경변수
//   NEWS_OFF=1          뉴스 끄기
//   NEWS_COUNT          띠에 올릴 헤드라인 수 (기본 15)
//   NEWS_POLL_MS        RSS 다시 읽는 간격 (기본 2분, 최소 1분)
//   NEWS_MAX_AGE_H      이보다 오래된 기사는 뺀다 (기본 12시간)
'use strict';

// 일반 경제 피드는 인사·정책 기사가 많아 빼고 증권·마켓 피드만 읽는다
const FEEDS = [
  { src: '연합', url: 'https://www.yna.co.kr/rss/market.xml' },
  { src: '한경', url: 'https://www.hankyung.com/feed/finance' },
  { src: '매경', url: 'https://www.mk.co.kr/rss/50200011/' }
];

// 종목이 없어도 투자자가 볼 만한 시장 기사로 치는 낱말
const MARKET_KEYWORDS = [
  '코스피', '코스닥', '증시', '주가', '주식', '상장', '공모', '공매도', '순매수', '순매도', '외국인',
  '목표가', '실적', '영업이익', '영업익', '순이익', '순익', '어닝', '특징주', '증권가', '개미', '전환사채', '배당', '자사주', '유상증자', '무상증자', '액면분할', '시가총액', '시총',
  '반도체', '2차전지', '금리', '환율', '연준', 'FOMC', '나스닥', '다우', 'S&P', '밸류업', 'ETF', 'IPO'
];

// 기사 제목에서 자주 쓰는 종목 줄임말. 그 종목이 전광판에 있을 때만 쓴다.
const ALIASES = {
  'LG에너지솔루션': ['LG엔솔'],
  '삼성바이오로직스': ['삼성바이오'],
  '한화에어로스페이스': ['한화에어로'],
  'SK하이닉스': ['하이닉스'],
  '두산에너빌리티': ['두산에너빌'],
  'HD현대중공업': ['현대중공업'],
  'POSCO홀딩스': ['포스코홀딩스'],
  '포스코퓨처엠': ['포스코퓨처'],
  '삼성SDI': ['SDI'],
  '한국전력': ['한전'],
  '카카오뱅크': ['카뱅'],
  'LG디스플레이': ['LGD'],
  '삼성중공업': ['삼중공'],
  '신한지주': ['신한금융']
};

// 2글자지만 그룹 이름이 아니라 한 종목만 가리키는 이름
const SHORT_OK = new Set(['기아']);

// 전광판 종목 이름으로 제목을 찾는 규칙을 만든다.
// - 2글자 이하 이름(LG·SK·KT 등)은 그룹 기사와 구분이 안 돼 쓰지 않는다
// - 7글자 이상 긴 이름은 앞 5글자로도 찾는다(삼성바이오로직스 → 삼성바이오)
function buildMatchers(names) {
  const out = [];
  for (const name of names) {
    if (!name) continue;
    const keys = new Set();
    if (name.length >= 3 || SHORT_OK.has(name)) keys.add(name);
    if (name.length >= 7) keys.add(name.slice(0, 5));
    // 'OO금융지주' 는 기사에서 'OO금융' 으로 쓴다
    if (name.endsWith('지주') && name.length >= 6) keys.add(name.slice(0, -2));
    for (const a of ALIASES[name] || []) keys.add(a);
    if (keys.size) out.push({ name, keys: [...keys] });
  }
  // 긴 이름부터 맞춰 봐야 'SK하이닉스' 기사가 'SK스퀘어' 같은 짧은 규칙에 먼저 걸리지 않는다
  return out.sort((a, b) => b.name.length - a.name.length);
}

function classify(title, matchers) {
  for (const m of matchers) {
    if (m.keys.some(k => title.includes(k))) return { kind: 'stock', stock: m.name };
  }
  if (MARKET_KEYWORDS.some(k => title.includes(k))) return { kind: 'market' };
  return null;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : '';
}

// RSS 2.0 의 <item> 만 읽는다. 위 언론사들은 모두 이 형식이다.
function parseRss(xml, src) {
  const out = [];
  const re = /<item[\s>][\s\S]*?<\/item>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const title = tag(m[0], 'title');
    if (!title) continue;
    const time = Date.parse(tag(m[0], 'pubDate')) || 0;
    out.push({ src, title, link: tag(m[0], 'link'), time });
  }
  return out;
}

// 같은 기사가 여러 피드·언론사에 실리므로 공백·문장부호를 뺀 제목으로 겹침을 거른다
function titleKey(t) {
  return t.replace(/[\s\p{P}\p{S}]/gu, '');
}

async function fetchFeed(feed) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(feed.url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'pixel-exchange/0.2 (RSS reader)', Accept: 'application/rss+xml, application/xml, text/xml' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return parseRss(await res.text(), feed.src);
  } finally {
    clearTimeout(timer);
  }
}

// getNames(): 지금 전광판에 올라 있는 종목 이름 목록
function startNews(onHeadlines, env = {}, getNames = () => []) {
  if (env.NEWS_OFF === '1') return;
  const count = Math.max(1, Math.min(50, Number(env.NEWS_COUNT) || 15));
  const pollMs = Math.max(60000, Number(env.NEWS_POLL_MS) || 120000);
  const maxAge = (Number(env.NEWS_MAX_AGE_H) || 12) * 3600e3;
  let lastKey = '';

  async function poll() {
    const results = await Promise.allSettled(FEEDS.map(fetchFeed));
    const items = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') items.push(...r.value);
      else console.warn(`[news] ${FEEDS[i].url} failed: ${r.reason && r.reason.message}`);
    });
    if (!items.length) return;

    const now = Date.now();
    const seen = new Set();
    const fresh = items
      .filter(it => it.time && now - it.time < maxAge && it.time <= now + 600e3)
      .sort((a, b) => b.time - a.time)
      .filter(it => {
        const k = titleKey(it.title);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

    // 전광판 종목이 나오는 기사를 앞에, 시장 키워드 기사를 뒤에 둔다. 둘 다 아니면 뺀다.
    const matchers = buildMatchers(getNames());
    // 실적 발표 날엔 한 종목 기사가 여러 개 나오므로 종목당 가장 최신 기사 하나만 둔다
    const stockNews = [];
    const marketNews = [];
    const usedStocks = new Set();
    for (const it of fresh) {
      const c = classify(it.title, matchers);
      if (!c) continue;
      if (c.kind === 'market') { marketNews.push(it); continue; }
      if (usedStocks.has(c.stock)) continue;
      usedStocks.add(c.stock);
      stockNews.push({ ...it, stock: c.stock });
    }
    const list = stockNews.concat(marketNews).slice(0, count);
    console.log(`[news] ${fresh.length}건 중 종목 ${stockNews.length} · 시장 ${marketNews.length} → ${list.length}건`);

    // 목록이 그대로면 띠를 건드리지 않는다
    const key = list.map(it => titleKey(it.title)).join('|');
    if (!list.length || key === lastKey) return;
    lastKey = key;
    onHeadlines(list);
  }

  // 서버가 막 떠서 종목 목록이 아직 없으면 종목 기사를 못 고르므로 30초 뒤에 다시 읽는다
  const loop = () => poll()
    .catch(e => console.warn('[news] poll failed', e.message))
    .finally(() => setTimeout(loop, getNames().length ? pollMs : 30000));
  loop();
}

module.exports = { startNews, parseRss, buildMatchers, classify };
