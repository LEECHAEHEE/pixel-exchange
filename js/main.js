// 진입점: 화면 배율 맞추기, 장면 루프, 전광판·feed 연결
(function () {
  const C = PX.config;
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('scene');

  const gridEl = document.getElementById('board-grid');
  let scale = 1;
  let seatedView = false;
  let board = null;

  // 도트가 뭉개지지 않도록 2배 이상이면 정수 배율만 쓴다
  function fit() {
    const avail = Math.min(window.innerWidth / C.width, (window.innerHeight - 28) / C.height);
    scale = avail >= 2 ? Math.floor(avail) : Math.max(1, avail);
    stage.style.setProperty('--s', scale);
    stage.style.setProperty('--ps', scale);
    stage.style.width = C.width * scale + 'px';
    stage.style.height = C.height * scale + 'px';
    layoutGrid();
  }

  // 종목 글자는 읽기 좋은 크기 범위에서만 키우고, 남는 자리는 칸 수를 늘려 채운다.
  // 그래서 큰 화면일수록 더 많은 종목이 보인다.
  function layoutGrid() {
    if (!board) return;
    const c = C.cell;
    const font = Math.min(c.maxFont, Math.max(c.minFont, c.fontPerScale * scale)) * (seatedView ? c.seatedBoost : 1);
    gridEl.style.setProperty('--cell-font', font.toFixed(1) + 'px');
    const cellW = font * c.wEm + 1;
    const cellH = font * c.hEm + 1;
    const cols = Math.max(1, Math.min(c.maxCols, Math.floor(gridEl.clientWidth / cellW)));
    const rows = Math.max(1, Math.min(c.maxRows, Math.floor(gridEl.clientHeight / cellH)));
    board.resize(cols, rows);
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    // 창 크기를 끄는 동안 칸을 매번 다시 만들지 않도록 멈춘 뒤 한 번만 계산
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fit, 120);
  });

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

  board = PX.createBoard({
    gridEl,
    indicesEl: document.getElementById('board-indices'),
    statusEl: document.getElementById('board-status'),
    clockEl: document.getElementById('board-clock'),
    dateEl: document.getElementById('board-date'),
    tickerEl: document.getElementById('board-ticker'),
    flashMs: C.flashMs,
    indexNames: C.indices,
    tickerIdle: C.tickerIdle
  });
  fit();

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
        seatedView = seated;
        layoutGrid();
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
