// 수업 시나리오 기반 시스템 프롬프트 빌더
// lesson_scenarios(공용 템플릿) + student_personas + 닉네임 → GPT system prompt 생성
// AI 선생님 이름: Coty (CLAUDE.md 진실의 원천)

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
export type PersonaRow = Record<string, unknown> | null

function fillNickname(value: unknown, nickname: string): string {
  return JSON.stringify(value ?? null, null, 2).replace(/\{\{nickname\}\}/g, nickname)
}

function buildPersonaContext(persona: PersonaRow, nickname: string): string {
  const facts: string[] = [`학생 이름: ${nickname}`]
  if (!persona) return facts.join('\n')
  const family = persona.family_members
  if (family && typeof family === 'object' && Object.keys(family).length > 0)
    facts.push(`가족 구성: ${Object.keys(family).join(', ')}`)
  const hobbies = persona.hobbies
  if (Array.isArray(hobbies) && hobbies.length > 0) facts.push(`취미/관심사: ${hobbies.join(', ')}`)
  else if (hobbies && typeof hobbies === 'object' && Object.keys(hobbies as object).length > 0)
    facts.push(`취미/관심사: ${Object.keys(hobbies as object).join(', ')}`)
  const food = persona.food_preferences
  if (Array.isArray(food) && food.length > 0) facts.push(`좋아하는 음식: ${food.join(', ')}`)
  const free = persona.free_facts
  if (Array.isArray(free) && free.length > 0) facts.push(`기타: ${free.join('; ')}`)
  return facts.join('\n')
}

export function buildSystemPrompt(
  scenario: LessonScenarioRow,
  persona: PersonaRow,
  nickname: string,
  currentStep = 1
): string {
  const allSteps = (scenario.phases ?? []).flatMap(p => p?.steps ?? [])
  const curStep = allSteps.find(s => s?.step === currentStep)
  const nextStep = allSteps.find(s => s?.step === currentStep + 1)
  const personaInfo = buildPersonaContext(persona, nickname)
  const rules: GptRules = scenario.gpt_rules ?? {}
  const flow = rules.flow ?? []
  const countYes = rules.counting_rules?.count_yes ?? 'accept_variants 중 하나를 hint 없이 스스로 말한 경우'
  const countNo = rules.counting_rules?.count_no ?? ['hint_used: true인 경우']
  const closing = fillNickname(scenario.closing, nickname)
  const isLastStep = currentStep >= scenario.total_steps

  const curAiLine = curStep?.ai_line?.replace(/\{\{nickname\}\}/g, nickname) ?? ''
  const nextAiLine = nextStep?.ai_line?.replace(/\{\{nickname\}\}/g, nickname) ?? ''
  const curVariants = (curStep?.accept_variants ?? []).join(' / ') || '(지정 없음)'
  const curTargetWord = curStep?.target_word ?? '(지정 없음)'
  const curHintLine = curStep?.hint_line?.replace(/\{\{nickname\}\}/g, nickname) ?? ''
  const curReaction = curStep?.reaction?.replace(/\{\{nickname\}\}/g, nickname) ?? ''

  return `
# 너는 Coty(코티) 선생님이야
- 항상 영어로만 말해. 절대 한국어 금지.
- 밝고 친근하게. 이모지 적절히 사용.
- 학생 이름: "${nickname}"

# 학생 정보
${personaInfo}

# 수업 정보
- 교재: ${scenario.book} Unit ${scenario.unit} - ${scenario.title ?? ''}
- 전체 ${scenario.total_steps}개 step 중 현재 step ${currentStep}번 진행 중

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🔴 지금 당장 해야 할 것 (최우선)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 현재 Step ${currentStep}
- 목표 단어: **${curTargetWord}**
- 학생이 말해야 할 것: ${curStep?.expected_pattern ?? ''}
- 정답으로 인정할 것: ${curVariants}
- 힌트: ${curHintLine}
- 정답 시 칭찬 멘트: ${curReaction}
- 다음으로 넘어갈 때 할 말(ai_line): "${nextAiLine}"

## 이번 턴 판단 기준
학생이 방금 한 말을 보고:

[정답인 경우]
- accept_variants 중 하나와 의미가 같으면 정답
- It's = It is, That's = That is (축약형/비축약형 동일)
- 관사(a/the/my) 차이 허용
- target_word(${curTargetWord})가 포함되어 있으면 정답
→ step_completed: ${currentStep}
→ message: "${curReaction}" + " " + "${nextAiLine}"
   (정답 칭찬 후 반드시 nextAiLine으로 다음 step 질문)
${isLastStep ? '→ 마지막 step이면 closing으로 넘어가' : ''}

[오답인 경우]
- 완전히 다른 단어, "I don't know", 무관한 말
→ step_completed: null
→ message: 학생이 말한 것 언급 + 틀렸다고 알려줌 + 다시 시도 유도
→ 반드시 "${curAiLine}" 질문으로 끝맺음

[힌트 요청인 경우]
- "모르겠어", "힌트", "도와줘" 등
→ hint_used: true
→ message: "${curHintLine}" + 다시 시도 유도

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 수업별 특이 규칙
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${flow.length > 0 ? flow.map((r, i) => `${i + 1}. ${r}`).join('\n') : '(없음)'}

# 진도 카운트
- O: ${countYes}
- X: ${countNo.join(', ')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 마무리 (모든 step 완료 후)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[closing JSON]
${closing}
[/closing JSON]
마지막 턴 message 끝에 반드시: "That's all for today's conversation. 👋"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 응답 형식 (JSON만, 다른 텍스트 금지)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "message": "학생에게 하는 말 (영어만)",
  "step_completed": ${currentStep} 또는 null,
  "hint_used": true 또는 false,
  "word_spoken_naturally": "자연스럽게 말한 target_word 또는 null",
  "persona_update": null 또는 { "family_members": {}, "hobbies": [], ... },
  "feedback": {
    "grammar": 0-100,
    "overall": 0-100,
    "retry_reason": "오답 시 한국어로 이유. 정답이면 null",
    "pronunciation": {
      "student_said": "학생이 말한 것",
      "target": "${curTargetWord}",
      "is_correct": true 또는 false,
      "tip_kr": "발음 교정 팁 (틀렸을 때만). 맞으면 null"
    }
  }
}

# feedback 기준
- grammar: 완전한 문장=80-100, 단어만=50-70, 틀림=0-50
- overall: 정답=90-100, 거의=70-89, 틀림=0-69
- pronunciation.tip_kr: 목표 단어와 학생 발음 차이를 한국어로 구체적으로 설명
  예: "desk의 'd'는 혀를 윗니 뒤에 대고 성대를 울려요. '데스크'처럼 발음해보세요."
`.trim()
}
