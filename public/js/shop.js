// 상점 주인과의 대화창, 상점 창, 판매 목록.
//
//   shop.talk()          대화창 열기(구매한다 / 나간다)
//   shop.onBuy(item)     구매 버튼을 눌렀을 때. 인벤토리·결제가 생기면 이 함수를 서버 요청으로 바꿔 끼운다.
//   shop.onOpen()        대화창·상점 창이 하나라도 열릴 때 (캐릭터 조작 잠금용)
//   shop.onClose(reason) 모두 닫혔을 때. reason: 'leave' | 'shop'
//
// 아직 인벤토리·입기·잔액은 없다. 구매는 안내만 띄운다.
(function () {

  const CATEGORIES = [
    { id: 'hat', name: '모자' },
    { id: 'top', name: '상의' },
    { id: 'bottom', name: '하의' },
    { id: 'outfit', name: '한벌옷' },
    { id: 'shoes', name: '신발' },
    { id: 'accessory', name: '장식품' }
  ];

  // 나중에 서버가 목록과 가격을 정하게 되면 이 배열을 서버에서 받아 오면 된다
  const ITEMS = [
    { id: 'hat-basic', cat: 'hat', name: '기본 모자', price: 100, icon: 'cap', color: '#c8424a', desc: '챙이 달린 기본 캡' },
    { id: 'top-basic', cat: 'top', name: '기본 상의', price: 100, icon: 'shirt', color: '#3a5bbf', desc: '무난한 반팔 티셔츠' },
    { id: 'bottom-basic', cat: 'bottom', name: '기본 하의', price: 100, icon: 'pants', color: '#3a3a48', desc: '편한 일자 바지' },
    { id: 'outfit-basic', cat: 'outfit', name: '기본 한벌옷', price: 100, icon: 'dress', color: '#2f8a8a', desc: '위아래가 붙은 한 벌' },
    { id: 'shoes-basic', cat: 'shoes', name: '기본 신발', price: 100, icon: 'shoes', color: '#6b3f22', desc: '가벼운 운동화' },
    { id: 'earring-basic', cat: 'accessory', kind: '귀걸이', name: '기본 귀걸이', price: 100, icon: 'earring', color: '#e0b030', desc: '작은 금빛 귀걸이' },
    { id: 'ring-basic', cat: 'accessory', kind: '반지', name: '기본 반지', price: 100, icon: 'ring', color: '#e0b030', desc: '보석 하나 박힌 반지' }
  ];

  const numFmt = new Intl.NumberFormat('ko-KR');
  const OUTLINE = [42, 29, 24];

  // ---------- 아이콘 (16x16 도트) ----------

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * f))));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  const ICONS = {
    cap(r, c) {
      r(4, 5, 8, 2, c); r(3, 7, 10, 3, c);
      r(3, 9, 12, 1, shade(c, 0.7)); r(10, 10, 5, 1, shade(c, 0.7));
      r(5, 6, 2, 1, shade(c, 1.3)); r(7, 5, 2, 1, '#ffffff');
    },
    shirt(r, c) {
      r(2, 3, 12, 2, c); r(1, 4, 3, 4, c); r(12, 4, 3, 4, c); r(4, 4, 8, 10, c);
      r(6, 3, 4, 1, shade(c, 0.6)); r(1, 7, 3, 1, shade(c, 0.75)); r(12, 7, 3, 1, shade(c, 0.75));
      r(5, 5, 1, 7, shade(c, 1.25));
    },
    pants(r, c) {
      r(4, 2, 8, 2, shade(c, 0.75)); r(4, 4, 8, 3, c);
      r(4, 7, 3, 7, c); r(9, 7, 3, 7, c);
      r(7, 7, 2, 1, c); r(5, 4, 1, 9, shade(c, 1.35));
    },
    dress(r, c) {
      r(5, 1, 2, 2, c); r(9, 1, 2, 2, c); r(5, 3, 6, 4, c);
      r(5, 7, 6, 1, shade(c, 0.7));
      r(4, 8, 8, 2, c); r(3, 10, 10, 2, c); r(2, 12, 12, 2, c);
      r(6, 4, 1, 3, shade(c, 1.3)); r(4, 10, 1, 3, shade(c, 1.3));
    },
    shoes(r, c) {
      r(1, 8, 5, 3, c); r(1, 11, 7, 2, c);
      r(9, 8, 5, 3, c); r(9, 11, 7, 2, c);
      r(1, 12, 7, 1, '#eeeeee'); r(9, 12, 7, 1, '#eeeeee');
      r(2, 9, 2, 1, shade(c, 1.4)); r(10, 9, 2, 1, shade(c, 1.4));
    },
    earring(r, c) {
      r(7, 1, 2, 1, c); r(9, 2, 1, 3, c); r(8, 5, 1, 2, c);
      r(6, 7, 4, 1, c); r(5, 8, 6, 4, '#4fb0e0'); r(6, 12, 4, 1, '#4fb0e0'); r(7, 13, 2, 1, '#4fb0e0');
      r(6, 9, 1, 2, '#d8f4ff');
    },
    ring(r, c) {
      r(5, 6, 6, 1, c); r(4, 7, 2, 6, c); r(10, 7, 2, 6, c); r(5, 13, 6, 1, c);
      r(6, 2, 4, 1, '#e05570'); r(5, 3, 6, 3, '#e05570'); r(6, 3, 1, 1, '#ffd0da');
      r(7, 6, 2, 1, shade(c, 0.7));
    }
  };

  // 칠한 픽셀 바깥쪽 한 칸에 외곽선을 둘러 다른 도트 그림과 같은 느낌을 낸다
  function drawIcon(item) {
    const cv = document.createElement('canvas');
    cv.width = 16;
    cv.height = 16;
    cv.className = 'item-icon';
    const g = cv.getContext('2d');
    ICONS[item.icon]((x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); }, item.color);

    const img = g.getImageData(0, 0, 16, 16);
    const a = (x, y) => (x < 0 || y < 0 || x > 15 || y > 15) ? 0 : img.data[(y * 16 + x) * 4 + 3];
    const edge = [];
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (a(x, y)) continue;
        if (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1)) edge.push((y * 16 + x) * 4);
      }
    }
    for (const i of edge) {
      img.data[i] = OUTLINE[0]; img.data[i + 1] = OUTLINE[1]; img.data[i + 2] = OUTLINE[2]; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return cv;
  }

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
        buy.textContent = '구매';
        buy.addEventListener('click', () => buyItem(item));
        card.append(drawIcon(item), info, price, buy);
        itemsEl.appendChild(card);
        buyButtons.push(buy);
      }
      if (focusFirst) selectItem(0);
    }

    function buyItem(item) {
      shop.onBuy(item);
      msgEl.textContent = `${item.name} 구매 완료 (${numFmt.format(item.price)}원) · 인벤토리는 준비 중`;
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
      buyButtons[selItem].focus();
    }

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
      selectTab(current);
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
      onOpen() {},
      onClose() {}
    };
    return shop;
  }

  PX.createShop = createShop;
})();
