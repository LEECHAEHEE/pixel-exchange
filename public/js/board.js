// 시세 전광판. 외부(API 어댑터)는 이 모듈의 공개 메서드만 호출하면 된다.
//
//   board.setSymbols([{ code, name, base? }])   표시 순서대로 종목 등록. base 는 기준가(전일 종가)
//   board.setMeta({ code: { base?, name? } })   종목별 기준가·이름만 따로 알릴 때
//   board.push(tick | tick[])                   { code, price, change?, rate?, name? } 또는 서버의 줄인 틱 [code, price, ...]
//                                               change·rate 가 없으면 기준가로 계산한다
//   board.setIndices([{ name, value, change, rate, volume?, amount? }])
//                                               volume 은 만주, amount 는 억원 단위로 넘긴다
//   board.setStatus(text, live)
//   board.setTicker(text)
//   board.clear()
//
// 칸 수는 화면 크기에 따라 main.js 가 resize(cols, rows) 로 바꾼다.
// 칸에 다 못 들어간 종목도 마지막 시세를 기억해 두었다가, 칸이 늘면 바로 보여준다.
//
// push 는 몇 번을 부르든 다음 프레임에 한 번만 DOM 에 반영된다.
// 같은 종목의 틱이 프레임 사이에 여러 번 오면 마지막 값만 그린다.
(function () {
  const numFmt = new Intl.NumberFormat('ko-KR');
  const EMPTY = '-';
  // 등록 안 된 종목이 끝없이 들어와도 메모리가 늘지 않게 막는 상한
  const MAX_SYMBOLS = 1000;

  function fmtPrice(v) {
    if (v == null || Number.isNaN(v)) return EMPTY;
    return Number.isInteger(v) ? numFmt.format(v) : v.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  }

  function fmtRate(v) {
    if (v == null || Number.isNaN(v)) return EMPTY;
    return (v > 0 ? '+' : '') + v.toFixed(2) + '%';
  }

  // 지수는 소수 둘째 자리까지 항상 보여야 자릿수가 흔들리지 않는다
  function fmtIndex(v) {
    if (v == null || Number.isNaN(v)) return EMPTY;
    return v.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function dirOf(change) {
    if (change == null || change === 0) return 'flat';
    return change > 0 ? 'up' : 'down';
  }

  function arrow(dir) {
    return dir === 'up' ? '▲' : dir === 'down' ? '▼' : '';
  }

  function createSlot() {
    const el = document.createElement('div');
    el.className = 'cell';
    el.dataset.dir = 'flat';
    el.dataset.empty = '';
    const nm = document.createElement('span'); nm.className = 'nm';
    const pr = document.createElement('span'); pr.className = 'pr';
    const rt = document.createElement('span'); rt.className = 'rt';
    nm.textContent = EMPTY;
    pr.textContent = EMPTY;
    el.append(nm, pr, rt);
    return { el, nm, pr, rt, code: null, last: { name: EMPTY, price: EMPTY, rate: '', dir: 'flat' } };
  }

  function createBoard(opts) {
    const { gridEls, indicesEl, statusEl, clockEl, dateEl, tickerEl, flashMs, indexNames, tickerIdle } = opts;

    const indexRows = new Map();
    for (const name of indexNames) {
      const el = document.createElement('div');
      el.className = 'idx';
      el.dataset.dir = 'flat';
      el.innerHTML = '<em></em><b></b><i></i><small></small>';
      el.children[0].textContent = name;
      indicesEl.appendChild(el);
      indexRows.set(name, el);
    }

    // 표시 순서·종목명·마지막 시세. 칸 수와 무관하게 유지된다.
    const order = [];
    const known = new Set();
    const names = new Map();
    const latest = new Map();
    const bases = new Map();

    let slots = [];
    const codeToSlot = new Map();
    const pending = new Map();
    const flashing = new Map();
    let scheduled = false;
    let cols = 0, rows = 0;

    let tickerShown = null;
    let tickerNext = null;
    function applyTicker(t) {
      tickerShown = t;
      tickerEl.textContent = t;
      // 글 길이에 맞춰 흐르는 속도를 일정하게 유지한다
      tickerEl.style.animationDuration = Math.max(12, t.length * 0.25) + 's';
    }
    tickerEl.addEventListener('animationiteration', () => {
      if (tickerNext == null) return;
      const t = tickerNext;
      tickerNext = null;
      applyTicker(t);
    });

    function writeText(slot, key, el, text) {
      if (slot.last[key] !== text) {
        slot.last[key] = text;
        el.textContent = text;
      }
    }

    function drawTick(slot, tick) {
      const dir = dirOf(tick.change);
      const priceText = fmtPrice(tick.price);
      const changed = slot.last.price !== priceText;
      writeText(slot, 'price', slot.pr, priceText);
      writeText(slot, 'rate', slot.rt, arrow(dir) + fmtRate(tick.rate));
      if (slot.last.dir !== dir) slot.el.dataset.dir = slot.last.dir = dir;
      return changed;
    }

    function bind(i) {
      const slot = slots[i];
      const code = order[i];
      slot.code = code;
      codeToSlot.set(code, i);
      delete slot.el.dataset.empty;
      writeText(slot, 'name', slot.nm, names.get(code) || code);
      const tick = latest.get(code);
      if (tick) drawTick(slot, tick);
    }

    // 칸 DOM 을 통째로 다시 만든다. 화면 크기가 바뀔 때만 불리므로 비용이 문제되지 않는다.
    function rebuild() {
      flashing.clear();
      codeToSlot.clear();
      const size = cols * rows;
      slots = [];
      // 열을 칸 묶음 수대로 나눠 앞쪽 묶음부터 채운다(왼쪽 칸 → 오른쪽 칸 순서)
      let colsLeft = cols;
      gridEls.forEach((el, g) => {
        const c = Math.ceil(colsLeft / (gridEls.length - g));
        colsLeft -= c;
        const frag = document.createDocumentFragment();
        for (let i = 0; i < c * rows; i++) {
          const slot = createSlot();
          slots.push(slot);
          frag.appendChild(slot.el);
        }
        el.replaceChildren(frag);
        el.style.setProperty('--cols', Math.max(1, c));
        el.style.setProperty('--rows', rows);
      });
      const n = Math.min(size, order.length);
      for (let i = 0; i < n; i++) bind(i);
    }

    function register(code, name) {
      if (name) names.set(code, name);
      if (known.has(code) || order.length >= MAX_SYMBOLS) return;
      order.push(code);
      known.add(code);
      // 새 종목이 빈 칸에 들어갈 자리가 있으면 바로 배치
      if (order.length <= slots.length) bind(order.length - 1);
    }

    // 서버는 틱을 [code, price, volume?, amount?] 로 줄여 보낸다. 등락은 기준가로 여기서 계산한다.
    function toTick(t) {
      const tick = Array.isArray(t) ? { code: t[0], price: t[1] } : t;
      if (tick.change == null && typeof tick.price === 'number' && bases.has(tick.code)) {
        const base = bases.get(tick.code);
        const change = tick.price - base;
        return Object.assign({}, tick, { change, rate: base ? change / base * 100 : null });
      }
      return tick;
    }

    function flush() {
      scheduled = false;
      const now = performance.now();
      for (const raw of pending.values()) {
        const tick = toTick(raw);
        register(tick.code, tick.name);
        if (!known.has(tick.code)) continue;
        latest.set(tick.code, tick);

        const idx = codeToSlot.get(tick.code);
        if (idx === undefined) continue;
        const slot = slots[idx];
        if (tick.name) writeText(slot, 'name', slot.nm, tick.name);
        if (drawTick(slot, tick)) {
          if (!flashing.has(slot.el)) slot.el.classList.add('flash');
          flashing.set(slot.el, now + flashMs);
        }
      }
      pending.clear();
    }

    // 깜빡임 해제는 셀마다 타이머를 두지 않고 한 주기에서 몰아서 처리한다
    setInterval(() => {
      if (flashing.size === 0) return;
      const now = performance.now();
      for (const [el, until] of flashing) {
        if (until <= now) {
          el.classList.remove('flash');
          flashing.delete(el);
        }
      }
    }, 100);

    // 탭이 숨겨진 동안 rAF 가 멈추므로, 이때는 쌓아만 두고 돌아오면 한 번에 그린다
    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(flush);
    }

    // 시계는 1초 단위면 충분하다
    const WEEK = '일월화수목금토';
    function tickClock() {
      const d = new Date();
      clockEl.textContent = d.toTimeString().slice(0, 8);
      if (dateEl) {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        dateEl.textContent = `${d.getFullYear()}.${mm}.${dd} (${WEEK[d.getDay()]})`;
      }
      setTimeout(tickClock, 1000 - d.getMilliseconds());
    }

    const board = {
      get size() { return slots.length; },
      get cols() { return cols; },
      get rows() { return rows; },

      resize(c, r) {
        if (c === cols && r === rows) return;
        cols = c;
        rows = r;
        rebuild();
      },

      setSymbols(list) {
        order.length = 0;
        known.clear();
        for (const s of list.slice(0, MAX_SYMBOLS)) {
          if (known.has(s.code)) continue;
          order.push(s.code);
          known.add(s.code);
          if (s.name) names.set(s.code, s.name);
          if (typeof s.base === 'number') bases.set(s.code, s.base);
        }
        rebuild();
      },

      setMeta(meta) {
        for (const [code, m] of Object.entries(meta || {})) {
          if (!m) continue;
          if (typeof m.base === 'number') bases.set(code, m.base);
          if (m.name) {
            names.set(code, m.name);
            const idx = codeToSlot.get(code);
            if (idx !== undefined) writeText(slots[idx], 'name', slots[idx].nm, m.name);
          }
        }
      },

      push(ticks) {
        // 틱 하나는 객체, 줄인 틱은 배열이라 [code, price] 하나만 와도 틱 목록으로 본다
        if (!Array.isArray(ticks) || (ticks.length && !Array.isArray(ticks[0]) && typeof ticks[0] !== 'object')) ticks = [ticks];
        for (const t of ticks) {
          const code = Array.isArray(t) ? t[0] : t && t.code;
          if (code != null) pending.set(code, t);
        }
        schedule();
      },

      setIndices(list) {
        for (const it of list) {
          const el = indexRows.get(it.name);
          if (!el) continue;
          const dir = dirOf(it.change);
          el.dataset.dir = dir;
          el.children[1].textContent = fmtIndex(it.value);
          el.children[2].textContent = it.change == null ? EMPTY
            : arrow(dir) + fmtIndex(Math.abs(it.change)) + ' ' + fmtRate(it.rate);
          el.children[3].textContent = it.volume == null ? ''
            : numFmt.format(Math.round(it.volume)) + '만주 ' + numFmt.format(Math.round(it.amount || 0)) + '억원';
        }
      },

      setStatus(text, live) {
        statusEl.textContent = text;
        statusEl.dataset.live = live ? '1' : '0';
      },

      // 뉴스가 바뀔 때마다 흐르던 띠가 중간에 끊기지 않도록, 흐르는 중이면 한 바퀴가 끝난 뒤
      // (글이 화면 오른쪽 밖으로 돌아간 순간) 바꿔 끼운다
      setTicker(text) {
        const t = text || tickerIdle;
        if (t === tickerShown) { tickerNext = null; return; }
        if (tickerShown == null || tickerShown === tickerIdle) applyTicker(t);
        else tickerNext = t;
      },

      clear() {
        pending.clear();
        order.length = 0;
        known.clear();
        names.clear();
        latest.clear();
        bases.clear();
        rebuild();
        board.setIndices(indexNames.map(name => ({ name })));
      }
    };

    board.clear();
    board.setTicker('');
    board.setStatus('시세 대기', false);
    tickClock();
    return board;
  }

  PX.createBoard = createBoard;
})();
