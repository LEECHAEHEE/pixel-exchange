// 상점 주인과의 대화창, 상점 창, 판매 목록.
//
//   shop.talk()          대화창 열기(구매한다 / 나간다)
//   shop.onBuy(item)     구매 버튼을 눌렀을 때. main.js 가 인벤토리에 넣도록 바꿔 끼운다.
//   shop.isOwned(id)     이미 가진 아이템인지. main.js 가 인벤토리를 보도록 바꿔 끼운다.
//   shop.onOpen()        대화창·상점 창이 하나라도 열릴 때 (캐릭터 조작 잠금용)
//   shop.onClose(reason) 모두 닫혔을 때. reason: 'leave' | 'shop'
//
// 아이템 목록·아이콘은 items.js 에 있다. 아직 잔액은 없어서 구매해도 돈이 줄지 않는다.
(function () {

  const CATEGORIES = PX.items.categories;
  const ITEMS = PX.items.list;
  const drawIcon = PX.items.drawIcon;
  const numFmt = new Intl.NumberFormat('ko-KR');

  // ---------- 키보드 ----------

  // 버튼에 포커스가 있을 때 Space 는 손을 뗄 때 눌림이 일어난다.
  // 대화를 연 Space 의 keyup 이 첫 버튼을 눌러 버리지 않도록 눌림은 직접 처리하고 기본 동작은 막는다.
  function isActivate(e) {
    return e.code === 'Space' || e.key === 'Enter';
  }

  // ---------- 화면 ----------

  function createShop({ stage, name }) {
    // 대화창: 화면 아래쪽 RPG 대화 상자
    const dialog = document.createElement('div');
    dialog.className = 'dialog';
    dialog.hidden = true;
    dialog.innerHTML = `
      <div class="dialog-name"></div>
      <p class="dialog-text">어서 오세요! 옷이랑 장식품 구경하고 가세요.</p>
      <div class="dialog-options">
        <button type="button" data-act="buy">구매한다</button>
        <button type="button" data-act="leave">나간다</button>
      </div>`;
    dialog.querySelector('.dialog-name').textContent = name;
    stage.appendChild(dialog);
    const options = [...dialog.querySelectorAll('button')];

    // 상점 창
    const shopEl = document.createElement('div');
    shopEl.className = 'shop';
    shopEl.hidden = true;
    shopEl.innerHTML = `
      <section class="shop-box" role="dialog" aria-label="상점">
        <header class="shop-head">
          <h2>상점</h2>
          <button type="button" class="shop-close" aria-label="닫기">✕</button>
        </header>
        <nav class="shop-tabs" role="tablist"></nav>
        <div class="shop-items"></div>
        <footer class="shop-foot">
          <span class="shop-msg" aria-live="polite"></span>
          <span class="shop-keys">← → 분류 · ↑ ↓ 고르기 · Space 구매 · Esc 닫기</span>
        </footer>
      </section>`;
    document.body.appendChild(shopEl);

    const tabsEl = shopEl.querySelector('.shop-tabs');
    const itemsEl = shopEl.querySelector('.shop-items');
    const msgEl = shopEl.querySelector('.shop-msg');
    const tabs = CATEGORIES.map(cat => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'shop-tab';
      b.setAttribute('role', 'tab');
      b.textContent = cat.name;
      b.addEventListener('click', () => selectTab(cat.id));
      tabsEl.appendChild(b);
      return { cat, el: b };
    });

    let current = CATEGORIES[0].id;
    let buyButtons = [];
    let msgTimer = 0;

    function selectTab(id, focusFirst = true) {
      current = id;
      for (const t of tabs) {
        const on = t.cat.id === id;
        t.el.classList.toggle('on', on);
        t.el.setAttribute('aria-selected', on);
      }
      itemsEl.replaceChildren();
      itemsEl.scrollTop = 0;
      buyButtons = [];
      for (const item of ITEMS.filter(i => i.cat === id)) {
        const card = document.createElement('article');
        card.className = 'item';
        const info = document.createElement('div');
        info.className = 'item-info';
        const title = document.createElement('h3');
        title.textContent = item.name;
        if (item.kind) {
          const k = document.createElement('span');
          k.className = 'item-kind';
          k.textContent = item.kind;
          title.appendChild(k);
        }
        const desc = document.createElement('p');
        desc.textContent = item.desc;
        info.append(title, desc);
        const price = document.createElement('span');
        price.className = 'item-price';
        price.textContent = numFmt.format(item.price) + '원';
        const buy = document.createElement('button');
        buy.type = 'button';
        buy.className = 'item-buy';
        // 이미 가진 아이템도 키보드로 고를 수 있게 버튼은 살려 두고 표시만 바꾼다
        const markOwned = () => {
          const owned = shop.isOwned(item.id);
          buy.textContent = owned ? '보유 중' : '구매';
          buy.classList.toggle('owned', owned);
        };
        markOwned();
        buy.addEventListener('click', () => { buyItem(item); markOwned(); });
        card.append(drawIcon(item), info, price, buy);
        itemsEl.appendChild(card);
        buyButtons.push(buy);
      }
      if (focusFirst) selectItem(0);
    }

    function buyItem(item) {
      if (shop.isOwned(item.id)) {
        msgEl.textContent = `${item.name} 은(는) 이미 가지고 있습니다 · I 로 인벤토리에서 입어 보세요`;
      } else {
        shop.onBuy(item);
        msgEl.textContent = `${item.name} 구매 완료 (${numFmt.format(item.price)}원) · I 로 인벤토리에서 입어 보세요`;
      }
      clearTimeout(msgTimer);
      msgTimer = setTimeout(() => { msgEl.textContent = ''; }, 3000);
    }

    // 선택 표시(▶)는 포커스 스타일에 맡기지 않고 직접 붙인다. 창에 포커스가 없을 때도 보여야 해서.
    let sel = 0;
    function select(i) {
      sel = (i + options.length) % options.length;
      options.forEach((b, j) => b.classList.toggle('sel', j === sel));
      options[sel].focus();
    }
    options.forEach((b, j) => b.addEventListener('pointerenter', () => select(j)));

    let selItem = 0;
    function selectItem(i) {
      if (!buyButtons.length) return;
      selItem = (i + buyButtons.length) % buyButtons.length;
      buyButtons.forEach((b, j) => b.closest('.item').classList.toggle('sel', j === selItem));
      buyButtons[selItem].focus({ preventScroll: true });
      // 고른 카드가 목록 밖이면 그 카드가 보일 만큼만 스크롤한다
      buyButtons[selItem].closest('.item').scrollIntoView({ block: 'nearest' });
    }

    // 목록 칸 높이를 '화면에 들어가는 줄 수'로 고정한다. 탭마다 아이템 수가 달라도 창 크기가 같고,
    // 넘치는 아이템은 스크롤로 본다. 줄 수는 가장 많은 탭의 아이템 수를 넘지 않는다.
    const MAX_ROWS = Math.max(...CATEGORIES.map(c => ITEMS.filter(i => i.cat === c.id).length));
    function fitList() {
      const cards = [...itemsEl.querySelectorAll('.item')];
      if (!cards.length) return;
      itemsEl.style.height = '';
      itemsEl.style.minHeight = '0';
      const cs = getComputedStyle(itemsEl);
      const gap = parseFloat(cs.rowGap) || 0;
      const chromeY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
        + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
      // 설명이 두 줄로 접힌 카드가 있을 수 있어 가장 큰 카드 높이로 잰다
      const cardH = Math.max(...cards.map(c => c.offsetHeight));
      const box = itemsEl.parentElement;
      // 창 최대 높이(화면 - 16px)에서 머리·탭·아래 안내 줄을 뺀 만큼이 목록에 쓸 수 있는 높이
      const others = box.offsetHeight - itemsEl.offsetHeight;
      const avail = window.innerHeight - 16 - others - chromeY;
      const fit = Math.floor((avail + gap) / (cardH + gap));
      const rows = Math.max(1, Math.min(MAX_ROWS, fit));
      itemsEl.style.height = Math.ceil(rows * cardH + (rows - 1) * gap + chromeY) + 'px';
    }
    let fitTimer = 0;
    window.addEventListener('resize', () => {
      if (shopEl.hidden) return;
      clearTimeout(fitTimer);
      fitTimer = setTimeout(fitList, 120);
    });

    function openDialog() {
      dialog.hidden = false;
      select(0);
    }

    function closeDialog() {
      dialog.hidden = true;
    }

    function openShop() {
      closeDialog();
      shopEl.hidden = false;
      msgEl.textContent = '';
      selectTab(current, false);
      fitList();
      selectItem(0);
    }

    function closeShop() {
      shopEl.hidden = true;
      document.activeElement && document.activeElement.blur();
      shop.onClose('shop');
    }

    function choose(act) {
      if (act === 'buy') openShop();
      else {
        closeDialog();
        document.activeElement && document.activeElement.blur();
        shop.onClose('leave');
      }
    }

    for (const b of options) b.addEventListener('click', () => choose(b.dataset.act));

    // 창이 열려 있는 동안은 포커스가 어디 있든 키를 먼저 가로채 캐릭터·채팅으로 새지 않게 한다
    function onDialogKey(e) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.code === 'KeyW' || e.code === 'KeyA') select(sel - 1);
      else if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.code === 'KeyS' || e.code === 'KeyD') select(sel + 1);
      else if (e.key === 'Escape') choose('leave');
      else if (isActivate(e)) {
        if (!e.repeat) choose(options[sel].dataset.act);
      } else return;
      e.preventDefault();
      e.stopPropagation();
    }

    function onShopKey(e) {
      const ti = CATEGORIES.findIndex(c => c.id === current);
      if (e.key === 'Escape') closeShop();
      else if (e.key === 'ArrowLeft' || e.code === 'KeyA') selectTab(CATEGORIES[(ti - 1 + CATEGORIES.length) % CATEGORIES.length].id);
      else if (e.key === 'ArrowRight' || e.code === 'KeyD') selectTab(CATEGORIES[(ti + 1) % CATEGORIES.length].id);
      else if (e.key === 'ArrowUp' || e.code === 'KeyW') selectItem(selItem - 1);
      else if (e.key === 'ArrowDown' || e.code === 'KeyS') selectItem(selItem + 1);
      else if (isActivate(e)) {
        if (e.repeat) return;
        // 탭·닫기 버튼에 포커스가 있으면 그 버튼을, 아니면 고른 아이템을 누른다
        const el = document.activeElement;
        if (el && el.tagName === 'BUTTON' && shopEl.contains(el)) el.click();
        else if (buyButtons[selItem]) buyButtons[selItem].click();
      } else return;
      e.preventDefault();
      e.stopPropagation();
    }

    window.addEventListener('keydown', (e) => {
      if (!shopEl.hidden) onShopKey(e);
      else if (!dialog.hidden) onDialogKey(e);
      else return;
      // 처리 안 한 키(글자 등)도 게임·채팅으로 넘기지 않는다
      e.stopPropagation();
    }, true);
    window.addEventListener('keyup', (e) => {
      if (shop.open && isActivate(e)) e.preventDefault();
    }, true);
    shopEl.querySelector('.shop-close').addEventListener('click', closeShop);
    // 창 바깥 어두운 곳을 누르면 닫는다
    shopEl.addEventListener('pointerdown', (e) => { if (e.target === shopEl) closeShop(); });

    let opening = false;

    const shop = {
      categories: CATEGORIES,
      items: ITEMS,
      get open() { return opening || !dialog.hidden || !shopEl.hidden; },
      talk() {
        if (shop.open) return;
        shop.onOpen();
        // 말을 건 Space 입력이 끝난 뒤에 연다. 바로 열면 같은 입력이 대화창에도 전달돼 첫 항목이 눌린다.
        opening = true;
        setTimeout(() => {
          opening = false;
          openDialog();
        }, 0);
      },
      onBuy() {},
      isOwned() { return false; },
      onOpen() {},
      onClose() {}
    };
    return shop;
  }

  PX.createShop = createShop;
})();
