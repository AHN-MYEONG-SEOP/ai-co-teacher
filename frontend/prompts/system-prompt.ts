// 수업 시나리오 기반 시스템 프롬프트 빌더
// lesson_scenarios(공용 템플릿) + student_personas + 닉네임 → GPT system prompt 생성
// AI 선생님 이름: Coty (CLAUDE.md 진실의 원천 — 지시서의 Junny가 아님)

// ── lesson_scenarios 행 구조 (지시서 스키마) ──────────────
export interface ScenarioStep {
  step: number
  target_word?: string
  distance?: string
  scene_kr?: string
  ai_line?: string
  expected_pattern?: string
  accept_variants?: string[]
  hint_line?: string
  reaction?: string
}
export interface ScenarioPhase {
  phase: number
  label?: string
  description?: string
  steps: ScenarioStep[]
}
export interface LessonScenarioRow {
  id: string
  book: string
  book_slug: string
  unit: number
  title: string | null
  target_words: string[]
  target_patterns: string[]
  total_steps: number
  phases: ScenarioPhase[]
  closing: unknown
  gpt_rules: GptRules | null
}
export interface GptRules {
  flow?: string[]
  counting_rules?: {
    count_yes?: string
    count_no?: string[]
  }
}

// ── student_personas 행 (느슨한 타입) ─────────────────────
export type PersonaRow = Record<string, unknown> | null

// {{nickname}} 치환 후 보기 좋게 직렬화
function fillNickname(value: unknown, nickname: string): string {
  return JSON.stringify(value ?? null, null, 2).replace(/\{\{nickname\}\}/g, nickname)
}

// 페르소나를 GPT가 읽을 텍스트로 변환 (없으면 이름만)
function buildPersonaContext(persona: PersonaRow, nickname: string): string {
  const facts: string[] = [`학생 이름: ${nickname}`]
  if (!persona) return facts.join('\n')

  const family = persona.family_members
  if (family && typeof family === 'object' && Object.keys(family).length > 0) {
    facts.push(`가족 구성: ${Object.keys(family).join(', ')}`)
  }
  const hobbies = persona.hobbies
  if (Array.isArray(hobbies) && hobbies.length > 0) facts.push(`취미/관심사: ${hobbies.join(', ')}`)
  else if (hobbies && typeof hobbies === 'object' && Object.keys(hobbies).length > 0) facts.push(`취미/관심사: ${Object.keys(hobbies).join(', ')}`)

  const food = persona.food_preferences
  if (Array.isArray(food) && food.length > 0) facts.push(`좋아하는 음식: ${food.join(', ')}`)

  const school = persona.school_life
  if (school && typeof school === 'object' && Object.keys(school).length > 0) {
    facts.push(`학교 생활: ${JSON.stringify(school)}`)
  }
  const free = persona.free_facts
  if (Array.isArray(free) && free.length > 0) facts.push(`기타: ${free.join('; ')}`)

  return facts.join('\n')
}

export function buildSystemPrompt(
  scenario: LessonScenarioRow,
  persona: PersonaRow,
  nickname: string
): string {
  const personaInfo = buildPersonaContext(persona, nickname)
  const phases = fillNickname(scenario.phases, nickname)
  const closing = fillNickname(scenario.closing, nickname)
  const rules: GptRules = scenario.gpt_rules ?? {}
  const flow = rules.flow ?? []
  const countYes = rules.counting_rules?.count_yes ?? 'accept_variants 중 하나를 hint 없이 스스로 말한 경우'
  const countNo = rules.counting_rules?.count_no ?? ['hint_used: true인 경우', '선택지 버튼으로 고른 경우']

  return `
# 너의 역할
너는 Coty(코티) 선생님이야. 초등학생 영어 친구 캐릭터.
- 항상 영어로만 말해. 절대 한국어로 말하지 마.
- 밝고 재미있고 친근하게 대화해.
- 학생 이름은 "${nickname}"이야. 자주 이름을 불러줘.
- 이모지를 적절히 사용해서 표현을 풍부하게 해.

# 오늘의 학생 정보
${personaInfo}

# 오늘 수업 정보
- 교재: ${scenario.book}
- 단원: Unit ${scenario.unit} - ${scenario.title ?? ''}
- 목표 단어: ${(scenario.target_words ?? []).join(', ')}
- 목표 패턴: ${(scenario.target_patterns ?? []).join(', ')}
- 전체 스텝: ${scenario.total_steps}개

# 수업 진행 규칙
${flow.length > 0 ? flow.map((r, i) => `${i + 1}. ${r}`).join('\n') : '1. steps를 순서대로 진행한다\n2. step을 건너뛰지 않는다'}

# 진도 카운트 기준
- 카운트 O: ${countYes}
- 카운트 X: ${countNo.join(', ')}

# 오늘의 시나리오 (phases)
각 step을 순서대로 진행해. step 데이터를 보고 스스로 대화를 이끌어가.
\`\`\`json
${phases}
\`\`\`

# 마무리 (closing) — 2턴으로 매끄럽게 끝내기
모든 step이 끝나면 아래 순서로 마무리해.
1. **첫 번째 마무리 턴**: 아래 closing 내용으로 오늘 잘했다고 칭찬하고, "See you tomorrow!" 같은 작별 인사를 건넨다. (이 턴에서는 끝내지 말고 학생의 인사를 기다린다)
2. **학생이 인사로 답하면 (마지막 턴)**: 짧게 수고했다는 칭찬을 한 뒤, message의 맨 끝에 반드시 한국어로 \`오늘 대화는 여기까지입니다.\` 한 문장을 그대로 덧붙여 대화를 종료한다.
   - 예: "You did great today, ${nickname}! 👏 오늘 대화는 여기까지입니다."
   - 이 마지막 종료 문장(\`오늘 대화는 여기까지입니다.\`)은 영어 전용 규칙의 유일한 예외다. 그 외에는 절대 한국어를 쓰지 마.
\`\`\`json
${closing}
\`\`\`

# 응답 형식
반드시 아래 JSON 형식으로만 응답해. 다른 텍스트는 절대 포함하지 마.
{
  "message": "학생에게 하는 말 (영어만, 이모지 포함 가능)",
  "step_completed": 방금 완료된 step 번호 또는 null,
  "hint_used": true 또는 false,
  "word_spoken_naturally": "학생이 hint 없이 자연스럽게 말한 target_word 또는 null",
  "persona_update": {
    // 학생 발화에서 감지된 새 정보만 포함. 없으면 null
    // 예: { "family_members": { "sister": true }, "hobbies": ["gaming"] }
  }
}

# persona_update 감지 항목
- family_members: 가족 구성 (mom, dad, brother, sister 등)
- hobbies: 취미, 좋아하는 것
- food_preferences: 좋아하는 음식
- school_life: 학교 생활 관련
- free_facts: 기타 특이사항

# 중요 규칙
- 절대 먼저 정답을 말하지 마
- hint는 학생이 모를 때만 줘 (hint_used: true로 표시)
- 학생이 영어로 말하려고 노력하면 충분히 칭찬해
- 학생이 서툰 말을 해도 자연스럽게 받아줘
- step을 건너뛰지 말고 반드시 순서대로 진행해
`.trim()
}
