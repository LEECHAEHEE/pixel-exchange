// 화면·전광판 설정. 좌표는 모두 논리 픽셀(320x180) 기준이다.
window.PX = window.PX || {};

PX.config = {
  width: 320,
  height: 180,
  renderFps: 30,

  // 전광판 안쪽 영역(프레임 제외). scene.js 의 프레임 그림과 CSS 오버레이가 함께 쓴다.
  // k 는 전광판 글자 배율. 앉으면 전광판이 화면 높이의 약 90% 를 차지하고 글자도 커진다.
  board: { x: 8, y: 19, w: 304, h: 82, k: 1 },
  boardSeated: { x: 6, y: 4, w: 308, h: 150, k: 1.5 },
  // 착석 화면 아래쪽 뒤통수 띠(논리 픽셀). 2배로 확대해 그린다.
  seatedStrip: { y: 158, h: 22, zoom: 2 },
  sign:  { x: 118, y: 5, w: 84, h: 10 },

  // 장소별 안내 글씨(DOM). map 이 지금 장소일 때만 보인다. cls 로 모양을 고른다.
  labels: [
    { map: 'crossroad', x: 180, y: 8, w: 70, h: 9, text: '↑ 도트증권 객장' },
    { map: 'crossroad', x: 188, y: 160, w: 52, h: 9, text: '경마장 ↓' },
    { map: 'crossroad', x: 6, y: 120, w: 46, h: 9, text: '← 풋살장' },
    { map: 'crossroad', x: 250, y: 120, w: 64, h: 9, text: '마피아존 →' },
    { map: 'racetrack', x: 120, y: 2, w: 80, h: 9, text: '도트 경마장', cls: 'gate' },
    { map: 'racetrack', x: 178, y: 20, w: 40, h: 8, text: '↑ 사거리' },
    { map: 'mafiazone', x: 110, y: 9, w: 100, h: 9, text: '마피아 게임장', cls: 'gate' },
    { map: 'mafiazone', x: 116, y: 62, w: 88, h: 8, text: '사회자(Claude)' },
    { map: 'mafiazone', x: 14, y: 74, w: 44, h: 8, text: '← 통로' },
    // 풋살장 점수판은 futsal.js 가 관중석 가운데(places.js FS.board)에 띄운다
    { map: 'futsal', x: 10, y: 7, w: 80, h: 10, text: '도트 풋살장', cls: 'gate' },
    { map: 'futsal', x: 268, y: 15, w: 44, h: 8, text: '사거리 →' },
    // 객장·코인 거래소·미국 증시는 옆으로 이어진 고리다(객장 → 코인 → 미장 → 객장). 간판 판은 객장과 같은 자리(sign)에 있다.
    // 양 끝 '← 미장' 같은 안내는 끝에 다가갈 때만 뜨는 것이라 main.js 가 따로 만든다(edgeHint).
    { map: 'coin', x: 118, y: 5, w: 84, h: 10, text: '도트코인 거래소', cls: 'coin-sign' },
    { map: 'us', x: 118, y: 5, w: 84, h: 10, text: '도트 미국증시', cls: 'coin-sign us-sign' }
  ],

  // 종목 칸. 글자 크기(px)를 화면 배율에 맞춰 min~max 사이로 정하고,
  // 칸 하나에 필요한 크기(글자 수 기준 em)로 전광판을 나눠 열·줄 수를 정한다.
  //   wEm  두 번째 줄 '1,234,567 ▲+29.99%' 가 들어가는 폭
  //   hEm  두 줄 + 위아래 여백
  cell: {
    minFont: 12, maxFont: 16, fontPerScale: 2.6,
    wEm: 9.6, hEm: 2.6,
    seatedBoost: 1.35,
    maxCols: 12, maxRows: 16
  },

  // 전광판 왼쪽 패널에 시계 아래로 이 순서대로 쌓인다
  indices: ['KOSPI', 'KOSDAQ'],
  // 방 양 끝에 다가가면(발 x 가 왼쪽은 nearX 보다 작고 오른쪽은 크면) 뜨는 옆방 안내 자리.
  // 끝 통로(의자 바깥 ~ 벽)의 가운데, 가운데 줄 의자(y 144) 옆에 그림 위·글씨 아래로 띄운다.
  edgeHint: {
    left: { x: 2, y: 140, w: 16, h: 18, nearX: 58 },
    right: { x: 302, y: 140, w: 16, h: 18, nearX: 262 }
  },
  // 코인 전광판에 띄울 코인 [기호, 이름]. 시세는 아직 연결하지 않았다.
  coins: [
    ['BTC', '비트코인'], ['ETH', '이더리움'], ['XRP', '리플'], ['SOL', '솔라나'],
    ['DOGE', '도지코인'], ['ADA', '에이다'], ['TRX', '트론'], ['LINK', '체인링크'],
    ['AVAX', '아발란체'], ['DOT', '폴카닷'], ['SUI', '수이'], ['BCH', '비트코인캐시']
  ],
  // 미국 증시 전광판에 띄울 종목 [기호, 이름]. 시세는 아직 연결하지 않았다.
  usStocks: [
    ['AAPL', '애플'], ['MSFT', '마이크로소프트'], ['NVDA', '엔비디아'], ['GOOGL', '알파벳'],
    ['AMZN', '아마존'], ['META', '메타'], ['TSLA', '테슬라'], ['AVGO', '브로드컴'],
    ['BRK.B', '버크셔'], ['JPM', 'JP모건'], ['NFLX', '넷플릭스'], ['PLTR', '팔란티어']
  ],
  tickerIdle: '서버에서 시세를 기다리는 중입니다',

  // 경마장 가운데 전광판(투표·순위·결과). 주로 안쪽 잔디에 들어가는 크기.
  racePanel: { x: 76, y: 107, w: 168, h: 30 },

  // 말풍선 유지 시간과 한 번에 보낼 수 있는 글자 수
  chat: { durationMs: 5000, maxLength: 60 },

  // 한국 시장 관례: 상승 빨강, 하락 파랑
  flashMs: 450
};
