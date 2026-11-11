// 조작 방법 창. 기본 화면에서 Esc(또는 채팅창 옆 [조작 방법])로 열고 닫는다.
//
//   help.toggle() / help.open
//   canOpen()   다른 창(상점·인벤토리·감정표현 판 등)이 열려 있으면 false
//
// 다른 창이 Esc 로 닫힐 때 이 창이 따라 열리지 않도록, 키 처리는 다른 창보다 먼저 등록해야 한다.
(function () {

  // 객장에서 쓰는 키만, 키 : 하는 일. 경마장·풋살장 등 다른 장소 전용 키와 자세한 쓰임은 적지 않는다.
  const ROWS = [
    ['방향키', '이동'],
    ['방향키 두 번', '뛰기'],
    ['Space', '앉기 · 일어나기 · 말 걸기'],
    ['Enter', '채팅'],
    ['C', '감정표현'],
    ['M', '채팅 기록'],
    ['I', '인벤토리'],
    ['X', '화면 가리기'],
    ['Esc', '조작 방법']
  ];

  function isTypingTarget(t) {
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  function createHelp({ canOpen }) {
    const el = document.createElement('div');
    el.className = 'help';
    el.hidden = true;
    el.innerHTML = `
      <section class="help-box" role="dialog" aria-label="조작 방법">
        <header class="shop-head">
          <h2>조작 방법</h2>
          <button type="button" class="shop-close" aria-label="닫기">✕</button>
        </header>
        <dl class="help-list"></dl>
        <footer class="shop-foot"><span class="shop-keys">Esc 닫기</span></footer>
      </section>`;
    const list = el.querySelector('.help-list');
    for (const [k, v] of ROWS) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      list.append(dt, dd);
    }
    document.body.appendChild(el);

    function setOpen(v) {
      el.hidden = !v;
      if (v && document.activeElement) document.activeElement.blur();
    }

    el.querySelector('.shop-close').addEventListener('click', () => setOpen(false));
    el.addEventListener('pointerdown', (e) => { if (e.target === el) setOpen(false); });

    window.addEventListener('keydown', (e) => {
      if (el.hidden) {
        if (e.key === 'Escape' && !isTypingTarget(e.target) && canOpen()) {
          e.preventDefault();
          e.stopImmediatePropagation();
          setOpen(true);
        }
        return;
      }
      // 창이 열려 있는 동안 다른 키는 게임에 전달하지 않는다
      if (e.key === 'Escape') setOpen(false);
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);

    return {
      get open() { return !el.hidden; },
      toggle() {
        if (!el.hidden) setOpen(false);
        else if (canOpen()) setOpen(true);
      }
    };
  }

  PX.createHelp = createHelp;
})();
