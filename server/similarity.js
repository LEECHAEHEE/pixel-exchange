// 히든 워드 유사도. Google Gemini 에게 히든 워드와 힌트가 얼마나 가까운지 0~100 점(소수 한 자리)으로 매기게 하고,
// 힌트가 고유명사가 아닌 일반 명사인지도 함께 판정받는다. 결과는 저장하지 않고 매번 계산한다.
//
//   const sim = createSimilarity(env)
//   await sim.score(hidden, hint)   { noun, score } 또는 { error }
//
// 환경변수
//   GEMINI_API_KEY      Gemini API 키(Render 에만 둔다)
//   HW_GEMINI_MODEL     모델 이름. 기본은 가장 추론이 강한 gemini-4-carbon
//   HW_FAKE=1           키 없이 글자로 만든 가짜 점수를 쓴다(로컬 화면 확인용)
'use strict';

const { GoogleGenAI } = require('@google/genai');

const DEFAULT_MODEL = 'gemini-4-carbon';
const TIMEOUT_MS = 30000;

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

  async function score(hidden, hint) {
    if (fake) return { noun: true, score: fakeScore(hidden, hint) };
    if (!ai) return { error: '서버에 Gemini 키가 없어 유사도를 계산할 수 없습니다' };
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
      }), TIMEOUT_MS);
      const j = JSON.parse(res.output_text || '');
      const s = Math.round(Math.min(100, Math.max(0, Number(j.score) || 0)) * 10) / 10;
      return { noun: !!j.noun, score: s };
    } catch (e) {
      console.warn(`[hw] gemini score failed${e.status ? ' ' + e.status : ''}: ${e.message}`);
      return { error: '유사도 계산에 실패했습니다. 다시 내 주세요' };
    }
  }

  return { score };
}

module.exports = { createSimilarity };
