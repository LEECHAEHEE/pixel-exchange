// 진입점: 화면 배율 맞추기, 장면 루프, 전광판·feed 연결
(function () {
  const C = PX.config;
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('scene');

  // 도트가 뭉개지지 않도록 2배 이상이면 정수 배율만 쓴다
  function fit() {
    const avail = Math.min(window.innerWidth / C.width, (window.innerHeight - 28) / C.height);
    const s = avail >= 2 ? Math.floor(avail) : Math.max(1, avail);
    stage.style.setProperty('--s', s);
    stage.style.setProperty('--ps', s);
    stage.style.width = C.width * s + 'px';
    stage.style.height = C.height * s + 'px';
  }
  window.addEventListener('resize', fit);
  fit();

  // 오버레이 위치를 config 좌표에서 가져와 캔버스 프레임과 어긋나지 않게 한다
  function place(el, r) {
    el.style.setProperty('--x', r.x);
    el.style.setProperty('--y', r.y);
    el.style.setProperty('--w', r.w);
    el.style.setProperty('--h', r.h);
    if (r.k) el.style.setProperty('--k', r.k);
  }
  const boardEl = document.getElementById('board');
  place(boardEl, C.board);
  place(document.querySelector('.sign'), C.sign);

  const board = PX.createBoard({
    gridEl: document.getElementById('board-grid'),
    indicesEl: document.getElementById('board-indices'),
    statusEl: document.getElementById('board-status'),
    clockEl: document.getElementById('board-clock'),
    dateEl: document.getElementById('board-date'),
    tickerEl: document.getElementById('board-ticker'),
    cols: C.grid.cols,
    rows: C.grid.rows,
    flashMs: C.flashMs,
    indexNames: C.indices,
    tickerIdle: C.tickerIdle
  });

  const scene = PX.createScene(canvas);
  const frameMs = 1000 / C.renderFps;
  let last = performance.now();

  const hintEl = document.getElementById('hint');
  const HINTS = {
    free: '방향키로 이동 · 빈 의자에 붙어 바라보고 Space 로 앉기',
    near: 'Space 로 앉기',
    seated: 'Space 또는 ↓ ← → 로 일어나기'
  };
  let hintState = 'free';

  // 탭이 숨겨지면 rAF 가 멈추므로 별도 일시정지 처리는 필요 없다
  function loop(now) {
    requestAnimationFrame(loop);
    if (now - last < frameMs - 1) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    scene.update(dt);
    scene.render();

    const state = scene.prompt();
    if (state !== hintState) {
      // 앉으면 전광판을 크게, 일어나면 원래 자리로
      const seated = state === 'seated';
      if (seated !== (hintState === 'seated')) {
        place(boardEl, seated ? C.boardSeated : C.board);
        stage.classList.toggle('seated', seated);
      }
      hintState = state;
      hintEl.textContent = HINTS[state];
    }
  }
  requestAnimationFrame(loop);

  PX.board = board;
  PX.scene = scene;

  // API 연동 지점. 실제 feed 를 만들어 PX.connect(feed) 로 붙인다.
  let current = null;
  PX.connect = function (feed) {
    if (current) current.stop();
    current = feed;
    if (feed) feed.start();
  };

  if (new URLSearchParams(location.search).has('demo')) {
    PX.connect(PX.feeds.createDemoFeed(board));
  }
})();
