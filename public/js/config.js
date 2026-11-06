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
    { map: 'crossroad', x: 6, y: 120, w: 40, h: 8, text: '공사 중' },
    { map: 'crossroad', x: 250, y: 120, w: 64, h: 9, text: '마피아존 →' },
    { map: 'racetrack', x: 120, y: 2, w: 80, h: 9, text: '도트 경마장', cls: 'gate' },
    { map: 'racetrack', x: 178, y: 20, w: 40, h: 8, text: '↑ 사거리' },
    { map: 'mafiazone', x: 110, y: 9, w: 100, h: 9, text: '마피아 게임장', cls: 'gate' },
    { map: 'mafiazone', x: 116, y: 72, w: 88, h: 8, text: '사회자(Claude)' },
    { map: 'mafiazone', x: 14, y: 74, w: 44, h: 8, text: '← 통로' }
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
  tickerIdle: '서버에서 시세를 기다리는 중입니다',

  // 경마장 가운데 전광판(투표·순위·결과). 주로 안쪽 잔디에 들어가는 크기.
  racePanel: { x: 76, y: 107, w: 168, h: 30 },

  // 말풍선 유지 시간과 한 번에 보낼 수 있는 글자 수
  chat: { durationMs: 5000, maxLength: 60 },

  // 한국 시장 관례: 상승 빨강, 하락 파랑
  flashMs: 450
};
