// 인벤토리: 산 아이템 보관과 착용. I 키로 창을 열고 닫는다.
// 보유·착용 목록은 이 브라우저(localStorage)에 저장한다. 로그인이 없어서 서버에는 착용 목록만 알린다.
//
//   inv.has(id) / inv.add(id) / inv.equipped
//   inv.onEquip(ids)     착용이 바뀌었을 때. main.js 가 캐릭터·서버에 전달한다.
//   inv.onOpen() / inv.onClose()
(function () {

  const KEY = 'pixel-exchange.inventory';
  const DIRS = ['down', 'left', 'up', 'right'];
  // 입장 전처럼 서버 외형이 아직 없을 때 미리보기에 쓰는 기본 외형
  const DEFAULT_LOOK = { hair: '#2a2220', shirt: '#8a8f99', shirtLo: '#6b6f78', pants: '#4a4a55' };

  function isTypingTarget(t) {
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  function isActivate(e) {
    return e.code === 'Space' || e.key === 'Enter';
  }

  // 저장소를 못 쓰는 환경(사생활 보호 모드 등)이면 이번 접속 동안만 기억한다.
  // 목록에서 사라진 아이템 id 는 버리고, 착용은 보유한 것만 남긴다.
  function load() {
    let d = {};
    try { d = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* 빈 인벤토리로 시작 */ }
    const known = (a) => Array.isArray(a) ? a.filter(id => PX.items.byId(id)) : [];
    const owned = known(d.owned);
    return { owned, equip: known(d.equip).filter(id => owned.includes(id)) };
  }

  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 저장 못 해도 동작한다 */ }
  }

  function createInventory({ getBaseLook, canOpen }) {
    const state = load();

    const el = document.createElement('div');
    el.className = 'inv';
    el.hidden = true;
    el.innerHTML = `
      <section class="inv-box" role="dialog" aria-label="인벤토리">
        <header class="shop-head">
          <h2>인벤토리</h2>
          <button type="button" class="shop-close inv-close" aria-label="닫기">✕</button>
        </header>
        <div class="inv-body">
          <aside class="inv-char">
            <div class="inv-figure">
              <canvas class="inv-preview" width="32" height="32"></canvas>
              <div class="inv-turn">
                <button type="button" data-turn="-1" aria-label="왼쪽으로 돌리기">◀</button>
                <button type="button" data-turn="1" aria-label="오른쪽으로 돌리기">▶</button>
              </div>
            </div>
            <div class="inv-worn">
              <h3>착용 중</h3>
              <dl class="inv-slots"></dl>
            </div>
          </aside>
          <div class="inv-main">
            <h3 class="inv-count"></h3>
            <nav class="shop-tabs inv-tabs" role="tablist"></nav>
            <div class="inv-items"></div>
          </div>
        </div>
        <footer class="shop-foot">
          <span class="shop-keys">← → 분류 · ↑ ↓ 고르기 · Space 착용/해제 · Ctrl+← → 캐릭터 돌리기 · I·Esc 닫기</span>
        </footer>
      </section>`;
    document.body.appendChild(el);

    const preview = el.querySelector('.inv-preview');
    const pg = preview.getContext('2d');
    pg.imageSmoothingEnabled = false;
    const slotsEl = el.querySelector('.inv-slots');
    const itemsEl = el.querySelector('.inv-items');
    const countEl = el.querySelector('.inv-count');
    const tabsEl = el.querySelector('.inv-tabs');

    const CATS = PX.items.categories;
    // 한 탭에 한 번에 보이는 아이템 수. 넘치면 목록 안에서 스크롤한다.
    const VISIBLE_MAX = 5;

    let dirIdx = 0;
    let buttons = [];
    let sel = 0;
    let cat = CATS[0].id;

    const tabs = CATS.map(c => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'shop-tab';
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => selectTab(c.id));
      tabsEl.appendChild(b);
      return { cat: c, el: b };
    });

    function ownedIn(catId) {
      return state.owned.filter(id => PX.items.byId(id).cat === catId);
    }

    function renderTabs() {
      for (const t of tabs) {
        const n = ownedIn(t.cat.id).length;
        t.el.textContent = n ? `${t.cat.name} ${n}` : t.cat.name;
        t.el.classList.toggle('on', t.cat.id === cat);
        t.el.classList.toggle('empty', n === 0);
        t.el.setAttribute('aria-selected', t.cat.id === cat);
      }
    }

    function selectTab(id) {
      cat = id;
      sel = 0;
      renderTabs();
      renderItems();
    }

    function moveTab(d) {
      const i = CATS.findIndex(c => c.id === cat);
      selectTab(CATS[(i + d + CATS.length) % CATS.length].id);
    }

    // 아이템 카드 높이를 재서 목록 높이를 최대 5개분으로 막는다(화면이 작으면 창 높이가 먼저 막는다)
    function capListHeight() {
      const first = itemsEl.querySelector('.item');
      if (!first) { itemsEl.style.maxHeight = ''; return; }
      const cs = getComputedStyle(itemsEl);
      const gap = parseFloat(cs.rowGap) || 0;
      const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
      const h = first.offsetHeight * VISIBLE_MAX + gap * (VISIBLE_MAX - 1) + pad + border;
      itemsEl.style.maxHeight = Math.ceil(h) + 'px';
    }

    function drawPreview() {
      pg.clearRect(0, 0, 32, 32);
      pg.fillStyle = '#3d2a1f';
      pg.fillRect(0, 0, 32, 32);
      pg.fillStyle = '#4a3328';
      pg.fillRect(0, 24, 32, 8);
      const look = PX.items.applyEquip(getBaseLook() || DEFAULT_LOOK, state.equip);
      PX.sprites.drawPerson(pg, 16, 28, look, DIRS[dirIdx], 0);
    }

    function renderSlots() {
      const frag = document.createDocumentFragment();
      for (const slot of PX.items.slots) {
        const id = state.equip.find(x => PX.items.byId(x).slot === slot.id);
        const dt = document.createElement('dt');
        dt.textContent = slot.name;
        const dd = document.createElement('dd');
        dd.textContent = id ? PX.items.byId(id).name : '없음';
        if (!id) dd.className = 'none';
        frag.append(dt, dd);
      }
      slotsEl.replaceChildren(frag);
    }

    function renderItems() {
      itemsEl.replaceChildren();
      buttons = [];
      countEl.textContent = `보유 아이템 ${state.owned.length}개`;
      const inCat = ownedIn(cat);
      if (!inCat.length) {
        const p = document.createElement('p');
        p.className = 'inv-empty';
        p.textContent = state.owned.length
          ? '이 분류에는 산 아이템이 없습니다. ← → 로 다른 분류를 보세요.'
          : '아직 산 아이템이 없습니다. 오른쪽 끝 상점 주인에게 구매해 보세요.';
        itemsEl.appendChild(p);
        itemsEl.style.maxHeight = '';
        return;
      }
      // 상점과 같은 순서로 보여 준다
      const order = PX.items.list.map(i => i.id);
      const owned = inCat.sort((a, b) => order.indexOf(a) - order.indexOf(b));
      for (const id of owned) {
        const item = PX.items.byId(id);
        const on = state.equip.includes(id);
        const card = document.createElement('article');
        card.className = 'item' + (on ? ' wearing' : '');
        const info = document.createElement('div');
        info.className = 'item-info';
        const title = document.createElement('h3');
        title.textContent = item.name;
        const slot = PX.items.slots.find(s => s.id === item.slot);
        const k = document.createElement('span');
        k.className = 'item-kind';
        k.textContent = slot.name;
        title.appendChild(k);
        const desc = document.createElement('p');
        desc.textContent = on ? '착용 중' : item.desc;
        info.append(title, desc);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'item-buy';
        btn.textContent = on ? '해제' : '착용';
        btn.addEventListener('click', () => toggle(id));
        card.append(PX.items.drawIcon(item), info, btn);
        itemsEl.appendChild(card);
        buttons.push(btn);
      }
      capListHeight();
      select(Math.min(sel, buttons.length - 1));
    }

    function select(i) {
      if (!buttons.length) return;
      sel = (i + buttons.length) % buttons.length;
      buttons.forEach((b, j) => b.closest('.item').classList.toggle('sel', j === sel));
      buttons[sel].focus();
      // 고른 카드가 목록 밖이면 보이도록 스크롤
      buttons[sel].closest('.item').scrollIntoView({ block: 'nearest' });
    }

    function render() {
      renderSlots();
      renderTabs();
      renderItems();
      drawPreview();
    }

    function toggle(id) {
      state.equip = PX.items.equipToggle(state.equip, id);
      save(state);
      render();
      inv.onEquip(state.equip.slice());
    }

    function open() {
      if (!el.hidden) return;
      el.hidden = false;
      sel = 0;
      // 지금 탭이 비어 있으면 아이템이 있는 첫 분류를 연다
      if (!ownedIn(cat).length) {
        const first = CATS.find(c => ownedIn(c.id).length);
        if (first) cat = first.id;
      }
      render();
      inv.onOpen();
    }

    function close() {
      if (el.hidden) return;
      el.hidden = true;
      if (document.activeElement) document.activeElement.blur();
      inv.onClose();
    }

    function turn(d) {
      dirIdx = (dirIdx + d + DIRS.length) % DIRS.length;
      drawPreview();
    }

    el.querySelector('.inv-close').addEventListener('click', close);
    el.addEventListener('pointerdown', (e) => { if (e.target === el) close(); });
    for (const b of el.querySelectorAll('[data-turn]')) b.addEventListener('click', () => turn(Number(b.dataset.turn)));

    // 창이 열려 있는 동안은 키를 먼저 가로채 캐릭터·채팅으로 새지 않게 한다
    window.addEventListener('keydown', (e) => {
      if (el.hidden) {
        if (e.code === 'KeyI' && !e.repeat && !isTypingTarget(e.target) && canOpen()) {
          e.preventDefault();
          e.stopPropagation();
          open();
        }
        return;
      }
      if (e.code === 'KeyI' || e.key === 'Escape') close();
      else if (e.key === 'ArrowUp' || e.code === 'KeyW') select(sel - 1);
      else if (e.key === 'ArrowDown' || e.code === 'KeyS') select(sel + 1);
      // ← → 는 분류 탭, Ctrl+← → 는 미리보기 캐릭터 방향
      else if ((e.key === 'ArrowLeft' || e.code === 'KeyA') && e.ctrlKey) turn(-1);
      else if ((e.key === 'ArrowRight' || e.code === 'KeyD') && e.ctrlKey) turn(1);
      else if (e.key === 'ArrowLeft' || e.code === 'KeyA') moveTab(-1);
      else if (e.key === 'ArrowRight' || e.code === 'KeyD') moveTab(1);
      else if (isActivate(e)) {
        if (e.repeat) return;
        const a = document.activeElement;
        if (a && a.tagName === 'BUTTON' && el.contains(a) && !buttons.includes(a)) a.click();
        else if (buttons[sel]) buttons[sel].click();
      }
      e.preventDefault();
      e.stopPropagation();
    }, true);
    // 버튼에 포커스가 있을 때 Space 를 떼면 한 번 더 눌리는 것을 막는다
    window.addEventListener('keyup', (e) => {
      if (!el.hidden && isActivate(e)) e.preventDefault();
    }, true);

    const inv = {
      get open() { return !el.hidden; },
      get equipped() { return state.equip.slice(); },
      has(id) { return state.owned.includes(id); },
      add(id) {
        if (!PX.items.byId(id) || state.owned.includes(id)) return;
        state.owned.push(id);
        save(state);
        if (!el.hidden) render();
      },
      refresh() { if (!el.hidden) drawPreview(); },
      onEquip() {},
      onOpen() {},
      onClose() {}
    };
    return inv;
  }

  PX.createInventory = createInventory;
})();
