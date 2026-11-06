// 조작 방법 창. 기본 화면에서 Esc(또는 채팅창 옆 [조작 방법])로 열고 닫는다.
//
//   help.toggle() / help.open
//   canOpen()   다른 창(상점·인벤토리·감정표현 판 등)이 열려 있으면 false
//
// 다른 창이 Esc 로 닫힐 때 이 창이 따라 열리지 않도록, 키 처리는 다른 창보다 먼저 등록해야 한다.
(function () {

  const ROWS = [
    ['이동', '↑ ↓ ← → · WASD · 바닥 클릭'],
    ['앉기', '빈 의자에 붙어 바라보고 Space'],
    ['일어나기', 'Space 또는 ↓ ← →'],
    ['상점', '오른쪽 상점 주인을 바라보고 Space'],
    ['장소 이동', '객장 빨간 복도 아래 끝 → 사거리 → 아래 경마장 · 왼쪽 풋살장 · 오른쪽 마피아존'],
    ['풋살 참가', '풋살장에서 레드·블루 팀 고르고 START (1 대 1부터, 팀당 5명까지)'],
    ['풋살 조작', '방향키로만 이동 · S 패스 · D 길게 눌렀다 떼면 슛 · 공 없을 때 S·D 태클'],
    ['경마 투표', '경마장에서 출발 전까지 1~5 또는 전광판 클릭'],
    ['말 훔치기', '경마장 마굿간 칸 앞에서 Space (탄 채로 다시 Space 면 돌려놓기)'],
    ['앞발차기', '말 탄 채 F → 바라보는 쪽 바로 앞에 선 사람이 넘어진다'],
    ['채팅', 'Enter → 입력 → Enter'],
    ['감정표현', 'C → ↑ 인사 · → 담배'],
    ['채팅 기록', 'M'],
    ['인벤토리', 'I (← → 분류, Ctrl+← → 캐릭터 돌리기)'],
    ['화면 가리기', 'X'],
    ['조작 방법', 'Esc']
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
