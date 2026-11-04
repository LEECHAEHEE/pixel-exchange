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

  grid: { cols: 5, rows: 8 },

  // 전광판 왼쪽 패널에 시계 아래로 이 순서대로 쌓인다
  indices: ['KOSPI', 'KOSDAQ'],
  tickerIdle: '실시간 시세 연동 대기 중 · API 연결 후 이 자리에 뉴스/공지가 흐릅니다',

  // 한국 시장 관례: 상승 빨강, 하락 파랑
  flashMs: 450
};
