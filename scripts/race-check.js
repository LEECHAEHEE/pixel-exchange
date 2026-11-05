// 경주 설계 점검: 경주를 많이 돌려 우승 분포와 접전 정도를 본다.
//   node scripts/race-check.js [횟수]
'use strict';
const { simulate, mulberry32, HORSES, LAPS } = require('../server/race');

const N = Number(process.argv[2]) || 20000;
const wins = new Array(HORSES).fill(0);
let margin = 0, photo = 0, changes = 0, lastLapComeback = 0, duration = 0, spread = 0, frameBytes = 0;

for (let k = 0; k < N; k++) {
  const p = simulate(mulberry32(k + 1));
  const [w, s] = p.order;
  wins[w - 1]++;
  const m = p.finish[s - 1] - p.finish[w - 1];
  margin += m;
  if (m < 0.2) photo++;
  spread += p.finish[p.order[HORSES - 1] - 1] - p.finish[w - 1];
  duration += p.duration;
  frameBytes += JSON.stringify(p).length;

  // 선두가 바뀐 횟수, 4바퀴째 선두가 결국 우승했는지
  let lead = -1, leadAt4 = -1;
  for (const f of p.frames) {
    const live = f.map((v, i) => [Math.min(v, LAPS), i]);
    const l = live.reduce((a, b) => (b[0] > a[0] ? b : a))[1];
    if (Math.max(...f) >= LAPS) break;
    if (l !== lead) { if (lead !== -1) changes++; lead = l; }
    if (leadAt4 === -1 && Math.max(...f) >= LAPS - 1) leadAt4 = l;
  }
  if (leadAt4 + 1 !== w) lastLapComeback++;
}

const pct = v => (v / N * 100).toFixed(1) + '%';
console.log(`경주 ${N}회`);
console.log('우승 분포   ', wins.map((v, i) => `${i + 1}번 ${pct(v)}`).join('  '));
console.log('평균 경주 시간', (duration / N).toFixed(1) + '초 (멈추는 3초 포함)');
console.log('1·2위 평균 차', (margin / N).toFixed(2) + '초', ' 0.2초 이내 사진판정', pct(photo));
console.log('1·5위 평균 차', (spread / N).toFixed(2) + '초');
console.log('선두 교체    ', (changes / N).toFixed(1) + '회/경주');
console.log('막판 역전     ', pct(lastLapComeback), '(4바퀴째 선두가 우승 못 함)');
console.log('계획 크기     ', (frameBytes / N / 1024).toFixed(1) + 'KB');
