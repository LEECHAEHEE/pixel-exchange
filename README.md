# 도트 객장 (pixel-exchange)

도트 그래픽으로 만든 온라인 증권 객장. 빌드 도구·프레임워크 없이 정적 파일만으로 돈다.

## 실행

`index.html` 을 더블클릭해서 열어도 되고, 로컬 서버로 띄워도 된다.

```bash
python -m http.server 5178 --directory pixel-exchange
```

- `http://localhost:5178/` — 빈 전광판 (API 대기 상태)
- `http://localhost:5178/?demo` — 가짜 시세로 화면 확인

조작

| 동작 | 키 | 보조 |
|---|---|---|
| 이동 | ↑ ↓ ← → | WASD, 바닥 클릭 |
| 앉기 | 빈 의자에 붙어서 그 의자를 바라보고 Space (노란 화살표가 뜨는 의자). 뒤·옆·앞 어느 쪽에서든 가능 | 없음 |
| 일어나기 | Space 또는 ↓ ← → (↑ 는 앉은 채 유지). 앉기 전 서 있던 자리로 돌아감 | 화면 아래 띠 클릭 |

앉으면 착석 시점으로 바뀐다. 전광판이 화면 높이의 약 90% 로 커지고(글자 1.5배),
아래 띠에 내 줄 의자 등받이와 앉은 사람들의 뒤통수(내 빨간 모자 포함)가 2배로 보인다.
크기는 `config.js` 의 `boardSeated`, `seatedStrip` 에서 바꾼다.

## 파일 구성

| 파일 | 역할 |
|---|---|
| `js/config.js` | 해상도, 전광판 위치, 칸 수(`grid.cols × grid.rows`), 지수 이름 |
| `js/board.js` | 전광판. 외부에서 데이터를 넣는 유일한 창구 |
| `js/feed.js` | 시세 공급원 어댑터(웹소켓·폴링 템플릿, 데모) |
| `js/scene.js` | 객장 배경·의자·사람 (캔버스 320×180 을 정수배 확대) |
| `js/main.js` | 화면 배율, 그리기 루프, `PX.connect` |

## 전광판 구성

벽 양 끝까지 차지한다.

- 왼쪽 패널: 맨 위 전자시계(초 단위)·날짜·연결 상태, 그 아래 남은 높이를 KOSPI·KOSDAQ 이 반씩 나눠
  지수명 / 지수값 / 등락폭·등락률 / 거래량·거래대금 을 크게 보여준다
- 오른쪽: 종목 칸. **화면 크기에 따라 칸 수가 달라진다** (세로로 먼저 채움)
- 맨 아래: 뉴스/공지 흐르는 띠

### 화면 크기별 종목 수

종목 글자는 읽기 좋은 크기(12~16px) 안에서만 커지고, 남는 자리는 칸 수를 늘려 채운다.
창 크기를 바꾸면 다시 계산한다. 앉으면 글자를 1.35배 키운 뒤 같은 방식으로 칸을 나눈다.

칸에 다 못 들어간 종목도 마지막 시세를 기억해 두므로, 창을 키우면 바로 값이 채워진 채로 나타난다.
표시 순서는 `setSymbols` 로 넘긴 순서(등록 안 하면 처음 들어온 순서)이고, 앞쪽 종목부터 보인다.

지수 순서는 `config.js` 의 `indices`, 칸 크기 기준은 `cell` 에서 바꾼다.

## API 연동 방법

전광판은 아래 메서드만 알면 된다. 어디서 데이터를 받든 이 형태로 바꿔서 넣는다.

```js
PX.board.setSymbols([{ code: '005930', name: '삼성전자' }, ...]); // 칸 순서대로 배치
PX.board.push({ code: '005930', price: 71200, change: 800, rate: 1.14 }); // 배열도 가능
// volume(거래량)은 만주, amount(거래대금)는 억원 단위. 없으면 그 줄은 숨겨진다.
PX.board.setIndices([{ name: 'KOSPI', value: 2650.12, change: 12.3, rate: 0.47, volume: 33856, amount: 49531 }]);
PX.board.setTicker('하단에 흐를 뉴스/공지');
PX.board.setStatus('LIVE', true);
```

### 웹소켓 API

`parse` 에서 증권사 메시지를 `{ ticks, indices, ticker }` 로 바꿔 주기만 하면 된다.
재접속(지수 백오프)과 상태 표시는 템플릿이 처리한다.

```js
const feed = PX.feeds.createWebSocketFeed(PX.board, {
  url: 'wss://example/realtime',
  subscribe(ws) {
    ws.send(JSON.stringify({ type: 'subscribe', codes: ['005930', '000660'] }));
  },
  parse(data) {
    const m = JSON.parse(data);
    return { ticks: [{ code: m.code, price: m.price, change: m.diff, rate: m.rate }] };
  }
});
PX.connect(feed);
```

### REST 폴링 API

```js
PX.connect(PX.feeds.createPollingFeed(PX.board, {
  intervalMs: 3000,
  async fetchOnce() {
    const res = await fetch('/api/quotes');
    const list = await res.json();
    return { ticks: list.map(q => ({ code: q.code, name: q.name, price: q.price, change: q.diff, rate: q.rate })) };
  }
}));
```

연결 코드는 `main.js` 맨 아래 `?demo` 분기 옆에 두면 된다.
증권사 API 키는 브라우저 코드에 넣지 말고, 서버(프록시)가 키를 들고 웹소켓/REST 를 중계하게 한다.

## 렉 없이 돌게 한 장치

| 장치 | 효과 |
|---|---|
| 틱 합치기 | `push` 를 초당 수천 번 불러도 프레임당 한 번만 DOM 반영, 같은 종목은 마지막 값만 |
| 바뀐 글자만 쓰기 | 칸마다 이전 문자열을 기억해 같으면 건드리지 않음 |
| 깜빡임 일괄 해제 | 셀마다 타이머를 만들지 않고 100ms 주기 한 번에 정리 |
| 배경 미리 그리기 | 벽·바닥·전광판 틀은 시작 시 한 번만 그리고 매 프레임 이미지 한 장 붙이기 |
| 30fps 제한 | 도트 화면에 60fps 는 불필요, 탭이 숨겨지면 자동 정지 |
| CSS `contain` / transform 애니메이션 | 전광판 변경이 페이지 전체 레이아웃을 다시 계산하지 않음, 하단 뉴스는 GPU 로 흐름 |

측정치(로컬 Chrome): 장면 그리기 1프레임 약 0.12ms, 틱 5,000건을 한 프레임에 반영 약 6ms.

## 글꼴

한글 도트 글꼴 [Galmuri](https://github.com/quiple/galmuri) (SIL OFL) 를 jsDelivr 에서 불러온다.
인터넷이 막힌 환경이면 `galmuri` 패키지의 `dist` 폴더를 `fonts/` 로 복사하고 `index.html` 의 링크를 바꾼다.
