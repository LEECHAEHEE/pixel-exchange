// 미국 증시 전광판 시세 보관소. 토스 공급원(toss.js)이 채우고, 미국 증시 방에 있는 사람에게만 보낸다.
//
//   const us = createUsStocks()
//   us.attach(fn)        fn({ t: 'us', list }) / fn({ t: 'us', status }) 를 바뀐 것이 있을 때 부른다
//   us.snapshot()        { list, status } 미국 증시 방에 들어온 사람에게 한 번 보낼 현재 모습
//   us.setWatched(bool)  미국 증시 방을 보는 사람이 있는지. 아무도 안 보면 토스 조회를 느리게 한다.
//   us.push(list)        [{ sym, price, change, rate }]
//   us.setStatus(text)
'use strict';

// 화면 config.js 의 usStocks 와 같은 기호
const US_SYMBOLS = [
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AVGO', 'BRK.B', 'JPM',
  'NFLX', 'PLTR', 'LLY', 'V', 'WMT', 'ORCL', 'AMD', 'COST', 'XOM', 'KO',
  'MA', 'UNH', 'JNJ', 'PG', 'HD', 'BAC', 'CRM', 'ADBE', 'PEP', 'MU'
];

function createUsStocks() {
  const latest = new Map();
  let status = '토스 키 없음';
  let publish = () => {};

  return {
    symbols: US_SYMBOLS,
    watched: false,

    attach(fn) { publish = fn; },

    snapshot() {
      return { list: [...latest.values()], status };
    },

    setWatched(v) { this.watched = v; },

    push(list) {
      const changed = [];
      for (const it of list) {
        const prev = latest.get(it.sym);
        if (prev && prev.price === it.price && prev.change === it.change) continue;
        latest.set(it.sym, it);
        changed.push(it);
      }
      if (changed.length) publish({ t: 'us', list: changed });
    },

    setStatus(s) {
      if (s === status) return;
      status = s;
      publish({ t: 'us', status });
    }
  };
}

module.exports = { createUsStocks, US_SYMBOLS };
