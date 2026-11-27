// 히든 워드 유사도. Google Gemini 에게 히든 워드와 힌트가 얼마나 가까운지 0~100 점(소수 한 자리)으로 매기게 하고,
// 힌트가 고유명사가 아닌 일반 명사인지도 함께 판정받는다. 결과는 저장하지 않고 매번 계산한다.
//
//   const sim = createSimilarity(env)
//   await sim.score(hidden, hint)   { noun, score } 또는 { error }
//   await sim.suggest(hidden, exclude)   { words } 또는 { error }. 히든 워드와 가까운 일반 명사 후보
//
// 환경변수
//   GEMINI_API_KEY      Gemini API 키(Render 에만 둔다)
//   HW_GEMINI_MODEL     모델 이름. 기본은 가장 빠른 gemini-3.5-flash-lite
//                       (gemini-4 계열은 30초를 넘기거나 요청이 몰려 503 으로 거절돼 바꿨다)
//   HW_FAKE=1           키 없이 글자로 만든 가짜 점수를 쓴다(로컬 화면 확인용)
'use strict';

const { GoogleGenAI } = require('@google/genai');

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
// 출제 시간이 2분이라 한 힌트를 그 절반까지는 기다린다
const TIMEOUT_MS = 60000;

const SYSTEM = `너는 단어 게임 "히든 워드"의 유사도 심판이다. 히든 워드와 힌트 두 한국어 단어가 주어지면 두 가지를 판정한다.

1. noun: 힌트가 한국어 일반 명사인가. 사람 이름, 지명, 상표, 작품 제목 같은 고유명사나, 동사·형용사·부사·문장·외국 문자·의미 없는 글자는 false.
2. score: 두 단어의 의미 유사도를 0.0~100.0 사이 소수 한 자리로.

점수는 세 가지를 합쳐서 매긴다.
- 의미적 거리: 사전적 정의와 개념의 특징이 얼마나 겹치는가
- 문맥적 공생: 같은 문장이나 상황에서 얼마나 자주 함께 쓰이는가
- 관계적 구조: 상위어·하위어, 부분·전체, 반의어처럼 개념 체계에서 얼마나 가까운가

기준점
- 95 이상: 거의 같은 뜻(동의어, 표기만 다른 말)
- 80~94: 매우 가까움(바로 위 상위어나 바로 아래 하위어, 같은 범주의 가장 가까운 짝, 반의어)
- 60~79: 같은 범주이거나 뚜렷한 관계가 있음
- 35~59: 연상은 되지만 개념은 다름(함께 자주 쓰일 뿐인 말)
- 10~34: 약한 연관
- 0~9: 관계없음

같은 단어 쌍에는 늘 같은 점수를 주도록 일관되게 판단한다. 점수를 반올림한 정수나 5 단위로 몰지 말고 소수 한 자리까지 차이를 둔다.`;

const SCHEMA = {
  type: 'object',
  properties: {
    noun: { type: 'boolean' },
    score: { type: 'number' }
  },
  required: ['noun', 'score']
};

// 출제자 힌트 10개 중 95% 이상이 없을 때, 대신 공개할 가장 가까운 단어를 찾게 한다
const SUGGEST_SYSTEM = `너는 단어 게임 "히든 워드"의 진행자다. 히든 워드가 주어지면, 그 단어와 의미가 가장 가까운 한국어 일반 명사 5개를 가까운 순서로 고른다.
- 띄어쓰기 없는 한글 1~8자
- 고유명사(사람 이름, 지명, 상표, 작품 제목)는 안 된다
- 히든 워드 자체, 히든 워드가 들어간 말, 히든 워드의 일부인 말은 안 된다
- "쓸 수 없는 단어" 목록에 있는 말은 안 된다
가장 가까운 말은 동의어, 표기만 다른 말, 바로 위 상위어나 바로 아래 하위어 순으로 찾는다.`;

const SUGGEST_SCHEMA = {
  type: 'object',
  properties: { words: { type: 'array', items: { type: 'string' } } },
  required: ['words']
};

// 키 없이 화면을 확인할 때 쓰는 가짜 점수. 같은 쌍은 늘 같은 값이다.
function fakeScore(hidden, hint) {
  let h = 7;
  for (const ch of hidden + '|' + hint) h = (h * 31 + ch.charCodeAt(0)) % 100003;
  const shared = [...hint].filter(c => hidden.includes(c)).length;
  return Math.min(99.9, Math.round(((h % 600) / 10 + shared * 15) * 10) / 10);
}

function withTimeout(p, ms) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms); })])
    .finally(() => clearTimeout(t));
}

function createSimilarity(env = {}) {
  const fake = env.HW_FAKE === '1';
  const model = env.HW_GEMINI_MODEL || DEFAULT_MODEL;
  const ai = env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }) : null;
  if (!ai && !fake) console.warn('[hw] GEMINI_API_KEY not set, hints cannot be scored');
  if (fake) console.warn('[hw] HW_FAKE=1, using fake similarity');
  else if (ai) console.log(`[hw] similarity model=${model}`);

  // timeoutMs 는 AI 단어 후보처럼 늦은 답을 기다리지 않을 때만 짧게 준다
  async function score(hidden, hint, timeoutMs = TIMEOUT_MS) {
    if (fake) return { noun: true, score: fakeScore(hidden, hint) };
    if (!ai) return { error: '서버에 AI 연결이 설정되지 않아 유사도를 계산할 수 없습니다' };
    const t0 = Date.now();
    try {
      const res = await withTimeout(ai.interactions.create({
        model,
        system_instruction: SYSTEM,
        input: `히든 워드: ${hidden}\n힌트: ${hint}`,
        response_format: { type: 'text', mime_type: 'application/json', schema: SCHEMA },
        // 두 단어 판정이라 깊게 생각할 필요가 없고, 힌트를 낸 뒤 기다리는 시간이 짧아야 한다
        generation_config: { thinking_level: 'low' },
        // 게임 기록을 구글 쪽에 남기지 않는다
        store: false
      }), timeoutMs);
      const j = JSON.parse(res.output_text || '');
      const s = Math.round(Math.min(100, Math.max(0, Number(j.score) || 0)) * 10) / 10;
      console.log(`[hw] scored in ${Date.now() - t0}ms`);
      return { noun: !!j.noun, score: s };
    } catch (e) {
      console.warn(`[hw] gemini score failed after ${Date.now() - t0}ms${e.status ? ' ' + e.status : ''}: ${e.message}`);
      return { error: '유사도 계산에 실패했습니다. 다시 내 주세요' };
    }
  }

  // 히든 워드와 가까운 일반 명사 후보 몇 개. 히든 워드 자체와 그 일부·포함하는 말, exclude 는 빼라고 한다.
  // 빠른 모델은 하나만 고르게 하면 엉뚱한 말을 낼 때가 있어, 후보를 받아 호출한 쪽이 점수로 고른다.
  async function suggest(hidden, exclude) {
    if (fake) return { words: ['물건', '생활', '도구', '음식', '장소'].filter(w => !exclude.includes(w)) };
    if (!ai) return { error: 'no key' };
    const t0 = Date.now();
    try {
      const res = await withTimeout(ai.interactions.create({
        model,
        system_instruction: SUGGEST_SYSTEM,
        input: `히든 워드: ${hidden}\n쓸 수 없는 단어: ${[hidden, ...exclude].join(', ')}`,
        response_format: { type: 'text', mime_type: 'application/json', schema: SUGGEST_SCHEMA },
        generation_config: { thinking_level: 'low' },
        store: false
      }), TIMEOUT_MS);
      const j = JSON.parse(res.output_text || '');
      console.log(`[hw] suggested in ${Date.now() - t0}ms`);
      return { words: Array.isArray(j.words) ? j.words.map(String).slice(0, 8) : [] };
    } catch (e) {
      console.warn(`[hw] gemini suggest failed after ${Date.now() - t0}ms${e.status ? ' ' + e.status : ''}: ${e.message}`);
      return { error: 'suggest failed' };
    }
  }

  return { score, suggest };
}

module.exports = { createSimilarity };
