// 시세 전광판. 외부(API 어댑터)는 이 모듈의 공개 메서드만 호출하면 된다.
//
//   board.setSymbols([{ code, name }])          슬롯에 종목 배치(순서대로)
//   board.push(tick | tick[])                   { code, price, change, rate, name? }
//   board.setIndices([{ name, value, change, rate, volume?, amount? }])
//                                               volume 은 만주, amount 는 억원 단위로 넘긴다
//   board.setStatus(text, live)
//   board.setTicker(text)
//   board.clear()
//
// push 는 몇 번을 부르든 다음 프레임에 한 번만 DOM 에 반영된다.
// 같은 종목의 틱이 프레임 사이에 여러 번 오면 마지막 값만 그린다.
(function () {
  const numFmt = new Intl.NumberFormat('ko-KR');
  const EMPTY = '-';

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

  function createBoard(opts) {
    const { gridEl, indicesEl, statusEl, clockEl, dateEl, tickerEl, cols, rows, flashMs, indexNames, tickerIdle } = opts;
    const size = cols * rows;

    gridEl.style.setProperty('--cols', cols);
    gridEl.style.setProperty('--rows', rows);

    // 슬롯 DOM 은 처음 한 번만 만들고 이후에는 textContent 만 바꾼다
    const slots = [];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < size; i++) {
      const el = document.createElement('div');
      el.className = 'cell';
      el.dataset.dir = 'flat';
      const nm = document.createElement('span'); nm.className = 'nm';
      const pr = document.createElement('span'); pr.className = 'pr';
      const rt = document.createElement('span'); rt.className = 'rt';
      el.append(nm, pr, rt);
      frag.appendChild(el);
      slots.push({ el, nm, pr, rt, code: null, last: { name: '', price: '', rate: '', dir: 'flat' } });
    }
    gridEl.appendChild(frag);

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

    const codeToSlot = new Map();
    const pending = new Map();
    const flashing = new Map();
    let scheduled = false;

    function writeText(slot, key, el, text) {
      if (slot.last[key] !== text) {
        slot.last[key] = text;
        el.textContent = text;
      }
    }

    function resetSlot(slot) {
      slot.code = null;
      slot.el.dataset.empty = '';
      writeText(slot, 'name', slot.nm, EMPTY);
      writeText(slot, 'price', slot.pr, EMPTY);
      writeText(slot, 'rate', slot.rt, '');
      slot.el.dataset.dir = slot.last.dir = 'flat';
    }

    function slotFor(code, name) {
      let idx = codeToSlot.get(code);
      if (idx !== undefined) return slots[idx];
      // 등록 안 된 종목은 빈 슬롯에 자동 배치하고, 꽉 차면 버린다
      idx = slots.findIndex(s => s.code === null);
      if (idx < 0) return null;
      codeToSlot.set(code, idx);
      const slot = slots[idx];
      slot.code = code;
      delete slot.el.dataset.empty;
      writeText(slot, 'name', slot.nm, name || code);
      return slot;
    }

    function flush() {
      scheduled = false;
      const now = performance.now();
      for (const tick of pending.values()) {
        const slot = slotFor(tick.code, tick.name);
        if (!slot) continue;
        if (tick.name) writeText(slot, 'name', slot.nm, tick.name);

        const dir = dirOf(tick.change);
        const priceText = fmtPrice(tick.price);
        const priceChanged = slot.last.price !== priceText;
        writeText(slot, 'price', slot.pr, priceText);
        writeText(slot, 'rate', slot.rt, arrow(dir) + fmtRate(tick.rate));
        if (slot.last.dir !== dir) slot.el.dataset.dir = slot.last.dir = dir;

        if (priceChanged) {
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
      size,

      setSymbols(list) {
        codeToSlot.clear();
        slots.forEach(resetSlot);
        list.slice(0, size).forEach((s, i) => {
          codeToSlot.set(s.code, i);
          slots[i].code = s.code;
          delete slots[i].el.dataset.empty;
          writeText(slots[i], 'name', slots[i].nm, s.name || s.code);
        });
      },

      push(ticks) {
        if (!Array.isArray(ticks)) ticks = [ticks];
        for (const t of ticks) {
          if (t && t.code != null) pending.set(t.code, t);
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

      setTicker(text) {
        tickerEl.textContent = text || tickerIdle;
        // 글 길이에 맞춰 흐르는 속도를 일정하게 유지한다
        const seconds = Math.max(12, tickerEl.textContent.length * 0.25);
        tickerEl.style.animationDuration = seconds + 's';
      },

      clear() {
        pending.clear();
        codeToSlot.clear();
        slots.forEach(resetSlot);
        board.setIndices(indexNames.map(name => ({ name })));
      }
    };

    board.clear();
    board.setTicker('');
    board.setStatus('API 대기', false);
    tickClock();
    return board;
  }

  PX.createBoard = createBoard;
})();
