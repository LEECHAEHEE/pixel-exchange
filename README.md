# 도트 객장 (pixel-exchange)

도트 그래픽으로 만든 온라인 증권 객장. 접속한 사람들이 캐릭터로 함께 돌아다니고, 의자에 앉아 전광판 시세를 보며 채팅한다.
서버는 Node.js + WebSocket, 화면은 빌드 도구·프레임워크 없는 정적 파일이다.

## 실행

```bash
npm install
npm start
```

브라우저에서 `http://localhost:5178/` 을 열고 닉네임을 입력해 입장한다(비우면 `손님1` 처럼 자동).
같은 네트워크의 다른 PC 는 `http://<이 PC 의 IP>:5178/` 로 들어온다. Windows 방화벽에서 5178 포트를 허용해야 할 수 있다.

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | 5178 | 서버 포트 |
| `MARKET_WS_URL` | 없음 | 실제 시세 웹소켓 주소. 없으면 데모 시세 |
| `MARKET_API_KEY` | 없음 | 실제 시세 API 키. 코드에 쓰지 말고 여기로 넘긴다 |

## 조작

| 동작 | 키 | 보조 |
|---|---|---|
| 이동 | ↑ ↓ ← → | WASD, 바닥 클릭 |
| 앉기 | 빈 의자에 붙어서 그 의자를 바라보고 Space (노란 화살표가 뜨는 의자). 뒤·옆·앞 어느 쪽에서든 가능 | 없음 |
| 일어나기 | Space 또는 ↓ ← → (↑ 는 앉은 채 유지). 앉기 전 서 있던 자리로 돌아감 | 화면 아래 띠 클릭 |
| 채팅 | Enter → 입력 → Enter. Esc 는 취소 | 입력창 클릭 |

앉으면 착석 시점으로 바뀐다. 전광판이 화면 높이의 약 90% 로 커지고, 아래 띠에 내 줄 의자 등받이와
같은 줄에 앉은 사람들의 뒤통수가 2배로 보인다. 크기는 `config.js` 의 `boardSeated`, `seatedStrip` 에서 바꾼다.

## 파일 구성

| 파일 | 역할 |
|---|---|
| `server/index.js` | 같은 포트에서 화면 파일(`public/`)과 웹소켓(`/ws`) 제공. `public/` 밖 파일은 내보내지 않음 |
| `server/room.js` | 접속자·위치·의자·채팅 관리. 외형은 입장할 때 서버가 랜덤으로 정함 |
| `server/market.js` | 시세 중계. 데모 공급원과 실제 API 공급원 자리 |
| `public/js/config.js` | 해상도, 전광판 위치, 칸 크기 기준, 지수 이름, 채팅 설정 |
| `public/js/board.js` | 전광판 |
| `public/js/scene.js` | 객장 배경·의자·사람 (캔버스 320×180 을 정수배 확대), 다른 접속자 그리기 |
| `public/js/chat.js` | 채팅 입력, 머리 위 말풍선·닉네임표 |
| `public/js/net.js` | 서버 연결, 끊기면 자동 재접속(같은 닉네임으로 재입장) |
| `public/js/main.js` | 화면 배율, 그리기 루프, 입장 화면, 서버 메시지 연결 |

## 멀티플레이

- 한 객장, 인원 제한 없음. 의자(42개)는 먼저 앉은 사람 것이고, 동시에 앉으려 하면 서버가 늦은 쪽을 되돌린다.
- 위치는 각자 0.1초마다 바뀌었을 때만 보내고, 서버는 0.1초마다 바뀐 사람만 모아 한 번에 뿌린다.
  다른 사람 캐릭터는 그 사이를 걷는 속도로 채워 끊기지 않게 보인다.
- 채팅은 서버를 거쳐 모두에게 전달된다. 말풍선은 5초 유지, 같은 사람이 다시 말하면 내용이 바뀐다. 0.3초에 한 번까지, 60자까지.
- 닉네임은 12자까지, 같은 닉네임도 허용한다. 로그인은 없다.

### 서버 메시지 (JSON, `t` 가 종류)

| 방향 | 종류 | 내용 |
|---|---|---|
| → 서버 | `join` | `{ name }` 입장 |
| → 서버 | `move` | `{ x, y, dir, moving }` |
| → 서버 | `sit` / `stand` | `{ seat }` / `{ x, y, dir }` |
| → 서버 | `chat` | `{ text }` |
| ← 서버 | `welcome` | 내 정보, 이미 있는 사람들, 시세 스냅샷 |
| ← 서버 | `join` / `leave` | 다른 사람 입장·퇴장 |
| ← 서버 | `moves` | `[[id, x, y, dir, moving], ...]` 묶음 |
| ← 서버 | `sit` / `stand` / `sitDenied` | 의자 점유 변화, 내 앉기 거절 |
| ← 서버 | `chat` | `{ id, text }` |
| ← 서버 | `symbols` / `ticks` / `indices` / `ticker` / `status` | 시세 |

## 전광판 구성

벽 양 끝까지 차지한다.

- 왼쪽 패널: 맨 위 전자시계(초 단위)·날짜·연결 상태, 그 아래 남은 높이를 KOSPI·KOSDAQ 이 반씩 나눠
  지수명 / 지수값 / 등락폭·등락률 / 거래량·거래대금 을 크게 보여준다
- 오른쪽: 종목 칸. **화면 크기에 따라 칸 수가 달라진다** (세로로 먼저 채움)
- 맨 아래: 뉴스/공지 흐르는 띠

종목 글자는 읽기 좋은 크기(12~16px) 안에서만 커지고, 남는 자리는 칸 수를 늘려 채운다.
창 크기를 바꾸면 다시 계산한다. 앉으면 글자를 1.35배 키운 뒤 같은 방식으로 칸을 나눈다.
칸에 다 못 들어간 종목도 마지막 시세를 기억해 두므로, 창을 키우면 바로 값이 채워진 채로 나타난다.
표시 순서는 `setSymbols` 로 넘긴 순서이고, 앞쪽 종목부터 보인다.

## 실제 시세 API 연동

서버가 증권사 API 에 **한 번만** 연결해 모든 접속자에게 나눠 준다. API 키는 서버에만 있고 브라우저로 가지 않는다.

`server/market.js` 의 `apiSource` 에서 두 함수만 채우면 된다. 재접속(지수 백오프)과 상태 표시는 이미 들어 있다.

```js
function subscribe(ws) {
  ws.send(JSON.stringify({ type: 'subscribe', key: apiKey, codes: ['005930', '000660'] }));
}

// 증권사 메시지를 { ticks?, indices?, ticker? } 로 바꾼다
function parse(data) {
  const m = JSON.parse(data);
  return { ticks: [{ code: m.code, price: m.price, change: m.diff, rate: m.rate }] };
}
```

그다음 환경변수로 켠다.

```bash
MARKET_WS_URL=wss://example/realtime MARKET_API_KEY=... npm start
```

공급원이 쓰는 메서드는 화면 전광판과 모양이 같다.

```js
market.setSymbols([{ code: '005930', name: '삼성전자' }, ...]);   // 표시 순서
market.push({ code: '005930', price: 71200, change: 800, rate: 1.14 });   // 배열도 가능
// volume(거래량)은 만주, amount(거래대금)는 억원 단위. 없으면 그 줄은 숨겨진다.
market.setIndices([{ name: 'KOSPI', value: 2650.12, change: 12.3, rate: 0.47, volume: 33856, amount: 49531 }]);
market.setTicker('하단에 흐를 뉴스/공지');
market.setStatus('LIVE', true);
```

REST 처럼 주기적으로 조회하는 API 라면 `setInterval` 안에서 조회해 위 메서드로 넣으면 된다.

## 렉 없이 돌게 한 장치

| 장치 | 효과 |
|---|---|
| 틱 합치기 | 서버는 0.2초, 화면은 한 프레임 단위로 같은 종목의 마지막 값만 반영 |
| 위치 묶어 보내기 | 0.1초마다 바뀐 사람만 한 메시지로. 직렬화도 한 번만 |
| 바뀐 글자만 쓰기 | 칸마다 이전 문자열을 기억해 같으면 건드리지 않음 |
| 깜빡임 일괄 해제 | 셀마다 타이머를 만들지 않고 100ms 주기 한 번에 정리 |
| 배경 미리 그리기 | 벽·바닥·전광판 틀은 시작 시 한 번만 그리고 매 프레임 이미지 한 장 붙이기 |
| 30fps 제한 | 도트 화면에 60fps 는 불필요, 탭이 숨겨지면 자동 정지 |
| CSS `contain` / transform | 전광판 변경이 페이지 전체 레이아웃을 다시 계산하지 않음, 말풍선·뉴스 띠는 transform 으로만 이동 |

## 글꼴

한글 도트 글꼴 [Galmuri](https://github.com/quiple/galmuri) (SIL OFL) 를 jsDelivr 에서 불러온다.
인터넷이 막힌 환경이면 `galmuri` 패키지의 `dist` 폴더를 `public/fonts/` 로 복사하고 `index.html` 의 링크를 바꾼다.
