// 시세 공급원(feed) 어댑터. 실제 API 연동은 createWebSocketFeed 의 parse 만 채우면 된다.
// 어떤 feed 든 { start(), stop() } 모양을 지키고, 받은 데이터는 board.push 로만 넘긴다.
(function () {

  // 웹소켓 템플릿. 끊기면 지수 백오프로 재접속한다.
  //   url        접속 주소
  //   subscribe  (ws) => void    접속 직후 구독 메시지 전송
  //   parse      (data) => { ticks?, indices?, ticker? } | null
  function createWebSocketFeed(board, { url, subscribe, parse }) {
    let ws = null;
    let retry = 0;
    let timer = null;
    let stopped = true;

    function connect() {
      board.setStatus('연결 중', false);
      ws = new WebSocket(url);

      ws.onopen = () => {
        retry = 0;
        board.setStatus('LIVE', true);
        if (subscribe) subscribe(ws);
      };

      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = parse(ev.data);
        } catch (e) {
          console.warn('[feed] parse failed', e);
          return;
        }
        if (!msg) return;
        if (msg.ticks) board.push(msg.ticks);
        if (msg.indices) board.setIndices(msg.indices);
        if (msg.ticker) board.setTicker(msg.ticker);
      };

      ws.onclose = () => {
        ws = null;
        if (stopped) return;
        const delay = Math.min(30000, 1000 * 2 ** retry++);
        board.setStatus('재연결 대기', false);
        console.warn('[feed] closed, retry in', delay, 'ms');
        timer = setTimeout(connect, delay);
      };

      ws.onerror = () => ws && ws.close();
    }

    return {
      start() { stopped = false; connect(); },
      stop() {
        stopped = true;
        clearTimeout(timer);
        if (ws) ws.close();
        board.setStatus('API 대기', false);
      }
    };
  }

  // REST 폴링 템플릿. 웹소켓을 제공하지 않는 API 용.
  //   fetchOnce  () => Promise<{ ticks?, indices?, ticker? }>
  function createPollingFeed(board, { fetchOnce, intervalMs = 3000 }) {
    let timer = null;
    let stopped = true;

    async function run() {
      try {
        const msg = await fetchOnce();
        if (msg) {
          if (msg.ticks) board.push(msg.ticks);
          if (msg.indices) board.setIndices(msg.indices);
          if (msg.ticker) board.setTicker(msg.ticker);
        }
        board.setStatus('LIVE', true);
      } catch (e) {
        console.warn('[feed] poll failed', e);
        board.setStatus('응답 없음', false);
      }
      // 응답이 늦으면 요청이 겹치지 않도록 끝난 뒤에 다음 회차를 잡는다
      if (!stopped) timer = setTimeout(run, intervalMs);
    }

    return {
      start() { stopped = false; run(); },
      stop() { stopped = true; clearTimeout(timer); board.setStatus('API 대기', false); }
    };
  }

  // 화면 확인용 가짜 시세. index.html?demo 로 열었을 때만 쓴다.
  function createDemoFeed(board) {
    const names = ['삼성전자', 'SK하이닉스', 'LG에너지솔루션', '삼성바이오', '현대차', '기아', '셀트리온', 'KB금융',
      'NAVER', '카카오', 'POSCO홀딩스', '신한지주', '삼성물산', 'LG화학', '현대모비스', '삼성SDI',
      '하나금융', '한국전력', 'KT&G', 'SK텔레콤', '포스코퓨처엠', 'HMM', '삼성생명', '고려아연',
      '대한항공', 'LG전자', '크래프톤', '한화오션', '두산에너빌', '에코프로', '알테오젠', '엔씨소프트',
      '삼성전기', 'SK이노베이션', 'S-Oil', '한미반도체', 'LIG넥스원', '한화에어로', 'HD현대중공업', '현대건설'];
    // 칸 수가 화면 크기에 따라 달라지므로 가장 큰 전광판도 채울 만큼 만든다
    const DEMO_COUNT = 200;
    const stocks = [];
    for (let i = 0; i < DEMO_COUNT; i++) {
      const base = Math.round((5000 + Math.random() * 300000) / 50) * 50;
      const name = names[i] || '데모종목' + String(i + 1).padStart(3, '0');
      stocks.push({ code: 'D' + String(i).padStart(5, '0'), name, base, price: base });
    }
    const idx = [
      { name: 'KOSPI', base: 2650, value: 2650, volume: 33000, amount: 49000 },
      { name: 'KOSDAQ', base: 850, value: 850, volume: 48000, amount: 31000 }
    ];
    let timer = null;

    function step() {
      // 초당 수십 건이 오는 실서비스와 비슷하게 매 회차 일부 종목만 바꾼다
      const ticks = [];
      for (const s of stocks) {
        if (Math.random() > 0.3) continue;
        s.price = Math.max(50, Math.round(s.price * (1 + (Math.random() - 0.5) * 0.01) / 50) * 50);
        const change = s.price - s.base;
        ticks.push({ code: s.code, price: s.price, change, rate: change / s.base * 100 });
      }
      board.push(ticks);
      board.setIndices(idx.map(it => {
        it.value = Math.round(it.value * (1 + (Math.random() - 0.5) * 0.001) * 100) / 100;
        const change = it.value - it.base;
        // 거래량·대금은 장중 누적이라 줄지 않고 조금씩 늘기만 한다
        it.volume += Math.random() * 3;
        it.amount += Math.random() * 4;
        return { name: it.name, value: it.value, change, rate: change / it.base * 100, volume: it.volume, amount: it.amount };
      }));
    }

    return {
      start() {
        board.setSymbols(stocks);
        board.setStatus('DEMO', true);
        board.setTicker('데모 모드 · 가짜 시세입니다 · 실제 API 연동 전 화면 확인용');
        timer = setInterval(step, 250);
      },
      stop() {
        clearInterval(timer);
        board.clear();
        board.setTicker('');
        board.setStatus('API 대기', false);
      }
    };
  }

  PX.feeds = { createWebSocketFeed, createPollingFeed, createDemoFeed };
})();
