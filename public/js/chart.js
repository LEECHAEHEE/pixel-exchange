// 객장 전광판 종목 차트. 전광판 칸을 누르면 전광판 전체를 그 종목 차트로 덮고, '← 종목' 이나 Esc 로 돌아간다.
//
//   const chart = PX.createChart({ boardEl, board, send })
//   chart.open(code)      차트를 열고 서버에 봉을 요청한다(send({ t: 'chart', code, kind }))
//   chart.close()
//   chart.apply(msg)      서버 응답 { code, kind, candles: [[초, 시, 고, 저, 종, 거래량], …] } 또는 { error }
//   chart.onTicks(ticks)  실시간 시세. 열려 있는 종목이면 머리글과 마지막 봉을 고친다
//   chart.isOpen
//
// 차트는 누른 사람 화면에만 뜬다. 시세 색은 국내 관례(상승 빨강, 하락 파랑)를 따른다.
(function () {
  const UP = '#ff4b4b';
  const DOWN = '#4ba3ff';
  const FLAT = '#e8e8e8';
  const GRID = '#1a1d22';
  const AXIS = '#8a8f99';
  const BASE = '#6b6f78';
  const KINDS = { min: '분봉', day: '일봉' };
  const numFmt = new Intl.NumberFormat('ko-KR');

  function fmtPrice(v) {
    return Number.isInteger(v) ? numFmt.format(v) : v.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  }

  // KST 기준 시:분, 월/일
  function kst(sec) {
    return new Date(sec * 1000 + 9 * 3600e3);
  }
  const hhmm = sec => kst(sec).toISOString().slice(11, 16);
  const mmdd = sec => kst(sec).toISOString().slice(5, 10).replace('-', '/');

  function createChart({ boardEl, board, send }) {
    const view = document.createElement('div');
    view.className = 'chart-view';
    view.hidden = true;
    view.innerHTML =
      '<div class="chart-head">' +
        '<button type="button" class="chart-back">← 종목</button>' +
        '<span class="chart-name"></span><span class="chart-price"></span><span class="chart-rate"></span>' +
        '<span class="chart-tabs"><button type="button" data-kind="min">분봉</button><button type="button" data-kind="day">일봉</button></span>' +
      '</div>' +
      '<div class="chart-body"><canvas></canvas><div class="chart-msg"></div></div>';
    boardEl.appendChild(view);

    const nameEl = view.querySelector('.chart-name');
    const priceEl = view.querySelector('.chart-price');
    const rateEl = view.querySelector('.chart-rate');
    const bodyEl = view.querySelector('.chart-body');
    const canvas = view.querySelector('canvas');
    const msgEl = view.querySelector('.chart-msg');
    const tabs = [...view.querySelectorAll('.chart-tabs button')];

    let code = null;
    let kind = 'min';
    let rows = null;        // 지금 그리는 봉 [[초, 시, 고, 저, 종, 거래량], …]
    let drawQueued = false;

    function setMsg(text) {
      msgEl.textContent = text || '';
      msgEl.hidden = !text;
    }

    function request() {
      rows = null;
      draw();
      setMsg(`${KINDS[kind]} 불러오는 중…`);
      send({ t: 'chart', code, kind });
    }

    function setKind(k) {
      kind = k;
      for (const b of tabs) b.classList.toggle('on', b.dataset.kind === k);
    }

    // 머리글: 종목명 · 현재가 · ▲+1.23%
    function updateHead() {
      nameEl.textContent = board.nameOf(code);
      const t = board.tickOf(code);
      if (!t || t.price == null) { priceEl.textContent = '-'; rateEl.textContent = ''; view.dataset.dir = 'flat'; return; }
      const dir = !t.change ? 'flat' : t.change > 0 ? 'up' : 'down';
      view.dataset.dir = dir;
      priceEl.textContent = fmtPrice(t.price);
      rateEl.textContent = t.rate == null ? ''
        : (dir === 'up' ? '▲' : dir === 'down' ? '▼' : '') + (t.rate > 0 ? '+' : '') + t.rate.toFixed(2) + '%';
    }

    function queueDraw() {
      if (drawQueued) return;
      drawQueued = true;
      requestAnimationFrame(() => { drawQueued = false; draw(); });
    }

    function draw() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const g = canvas.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      if (!rows || !rows.length) return;

      // 글자 크기는 전광판 크기를 따른다(앉으면 커진다)
      const font = Math.max(10, Math.round(h / 16));
      g.font = `${font}px GalmuriMono11, Galmuri11, Consolas, monospace`;
      g.textBaseline = 'middle';

      const t = board.tickOf(code);
      const base = kind === 'min' && t && t.price != null && t.change != null ? t.price - t.change : null;

      let hi = -Infinity, lo = Infinity, vmax = 0;
      for (const r of rows) {
        hi = Math.max(hi, r[2]); lo = Math.min(lo, r[3]); vmax = Math.max(vmax, r[5]);
      }
      if (base != null) { hi = Math.max(hi, base); lo = Math.min(lo, base); }
      if (hi === lo) { hi += 1; lo -= 1; }
      const pad = (hi - lo) * 0.06;
      hi += pad; lo -= pad;

      const axisW = Math.ceil(g.measureText(fmtPrice(Math.round(hi))).width) + font;
      const left = Math.round(font * 0.5);
      const plotW = Math.max(10, w - axisW - left);
      const timeH = font + 4;
      const volH = Math.round((h - timeH) * 0.2);
      const priceH = h - timeH - volH - 4;
      const yOf = v => Math.round((hi - v) / (hi - lo) * priceH) + 0.5;
      const n = rows.length;
      const step = plotW / n;
      const xOf = i => left + Math.floor(i * step + step / 2) + 0.5;

      // 가로 눈금 4줄과 오른쪽 가격. 마지막 가격 표와 겹치는 눈금 글자는 뺀다.
      const lastY = yOf(rows[n - 1][4]);
      g.strokeStyle = GRID;
      g.lineWidth = 1;
      g.fillStyle = AXIS;
      g.textAlign = 'left';
      for (let k = 0; k <= 4; k++) {
        const v = hi - (hi - lo) * (k / 4);
        const y = yOf(v);
        g.beginPath(); g.moveTo(left, y); g.lineTo(left + plotW, y); g.stroke();
        const ty = Math.min(priceH - font / 2, Math.max(font / 2, y));
        if (Math.abs(ty - lastY) > font + 2) g.fillText(fmtPrice(Math.round(v)), left + plotW + 4, ty);
      }

      // 분봉: 전일 기준가 점선
      if (base != null) {
        const y = yOf(base);
        g.strokeStyle = BASE;
        g.setLineDash([4, 3]);
        g.beginPath(); g.moveTo(left, y); g.lineTo(left + plotW, y); g.stroke();
        g.setLineDash([]);
      }

      const last = rows[n - 1][4];
      const ref = base != null ? base : rows[0][1];
      const lineColor = last > ref ? UP : last < ref ? DOWN : FLAT;

      if (kind === 'min') {
        // 분봉은 봉이 수백 개라 종가 선과 아래 채움으로 그린다
        g.beginPath();
        rows.forEach((r, i) => { const x = xOf(i), y = yOf(r[4]); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
        g.strokeStyle = lineColor;
        g.lineWidth = 1.5;
        g.stroke();
        g.lineTo(xOf(n - 1), priceH);
        g.lineTo(xOf(0), priceH);
        g.closePath();
        g.globalAlpha = 0.12;
        g.fillStyle = lineColor;
        g.fill();
        g.globalAlpha = 1;
        g.lineWidth = 1;
      } else {
        // 일봉은 캔들: 꼬리는 1px, 몸통은 칸 폭의 70%
        const bw = Math.max(1, Math.floor(step * 0.7));
        rows.forEach((r, i) => {
          const [, o, hh, ll, c] = r;
          const color = c > o ? UP : c < o ? DOWN : FLAT;
          const x = xOf(i);
          g.strokeStyle = color;
          g.beginPath(); g.moveTo(x, yOf(hh)); g.lineTo(x, yOf(ll)); g.stroke();
          const y1 = yOf(Math.max(o, c)), y2 = yOf(Math.min(o, c));
          g.fillStyle = color;
          g.fillRect(Math.round(x - bw / 2), y1 - 0.5, bw, Math.max(1, y2 - y1));
        });
      }

      // 마지막 가격 표
      const ly = yOf(last);
      g.fillStyle = lineColor;
      g.fillRect(left + plotW + 1, ly - font / 2 - 1, axisW - 1, font + 2);
      g.fillStyle = '#050607';
      g.fillText(fmtPrice(last), left + plotW + 4, ly);

      // 거래량 막대
      const vy = priceH + 4;
      const bw = Math.max(1, Math.floor(step * (kind === 'min' ? 1 : 0.7)));
      if (vmax > 0) {
        rows.forEach((r, i) => {
          const vh = Math.max(1, Math.round(r[5] / vmax * volH));
          g.fillStyle = r[4] >= r[1] ? 'rgba(255,75,75,0.55)' : 'rgba(75,163,255,0.55)';
          g.fillRect(Math.round(xOf(i) - bw / 2), vy + volH - vh, bw, vh);
        });
      }

      // 아래 시간 눈금: 처음 · 가운데 · 끝
      g.fillStyle = AXIS;
      const label = kind === 'min' ? hhmm : mmdd;
      const ty = h - timeH / 2;
      g.textAlign = 'left'; g.fillText(label(rows[0][0]), left, ty);
      g.textAlign = 'center'; g.fillText(label(rows[Math.floor(n / 2)][0]), xOf(Math.floor(n / 2)), ty);
      g.textAlign = 'right'; g.fillText(label(rows[n - 1][0]), left + plotW, ty);
    }

    // 실시간 시세를 마지막 봉에 반영한다(분봉은 1분, 일봉은 하루 단위로 새 봉을 연다)
    function mergeTick(t) {
      if (!rows || !rows.length || t.price == null) return;
      const unit = kind === 'min' ? 60 : 86400;
      const nowSec = Math.floor(Date.now() / 1000);
      // 일봉은 KST 날짜로 나눈다
      const bucket = kind === 'min' ? Math.floor(nowSec / unit) * unit
        : Math.floor((nowSec + 9 * 3600) / unit) * unit - 9 * 3600;
      const lastRow = rows[rows.length - 1];
      const lastBucket = kind === 'min' ? lastRow[0] : Math.floor((lastRow[0] + 9 * 3600) / unit) * unit - 9 * 3600;
      if (bucket > lastBucket) {
        rows.push([bucket, t.price, t.price, t.price, t.price, 0]);
      } else {
        lastRow[2] = Math.max(lastRow[2], t.price);
        lastRow[3] = Math.min(lastRow[3], t.price);
        lastRow[4] = t.price;
      }
    }

    const chart = {
      get isOpen() { return code != null; },

      open(c) {
        code = c;
        setKind(kind);
        view.hidden = false;
        boardEl.classList.add('charting');
        updateHead();
        request();
      },

      close() {
        code = null;
        rows = null;
        view.hidden = true;
        boardEl.classList.remove('charting');
      },

      apply(msg) {
        if (msg.code !== code || msg.kind !== kind) return;
        if (msg.error) { setMsg(msg.error); return; }
        rows = Array.isArray(msg.candles) ? msg.candles.filter(r => Array.isArray(r) && r.length >= 6) : [];
        setMsg(rows.length ? '' : '봉 데이터가 없습니다');
        updateHead();
        draw();
      },

      onTicks(ticks) {
        if (code == null) return;
        for (const t of ticks || []) {
          if (t && t.code === code) {
            updateHead();
            mergeTick(t);
            queueDraw();
          }
        }
      }
    };

    view.querySelector('.chart-back').addEventListener('click', () => chart.close());
    for (const b of tabs) {
      b.addEventListener('click', () => {
        if (b.dataset.kind === kind) return;
        setKind(b.dataset.kind);
        request();
      });
    }
    // 전광판 크기가 바뀌면(앉기·창 크기) 다시 그린다
    new ResizeObserver(() => { if (code != null) queueDraw(); }).observe(bodyEl);
    // Esc 로 차트를 닫는다. 조작 방법 창은 PX.chart.isOpen 이면 열리지 않는다(main.js help.canOpen).
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || code == null) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      chart.close();
    }, true);

    return chart;
  }

  PX.createChart = createChart;
})();
