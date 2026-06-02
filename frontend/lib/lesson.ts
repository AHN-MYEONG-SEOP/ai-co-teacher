// 수업 진도/시나리오 공용 헬퍼

// KST 기준 오늘 날짜 (YYYY-MM-DD)
export function kstToday(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

// 교재명 → book_slug ('Insight Builder 1' → 'insight-builder-1')
export function toBookSlug(book: string): string {
  return book.toLowerCase().trim().replace(/\s+/g, '-')
}

// 진도율 = natural_steps(힌트 없이 스스로 말한 step) / total_steps * 100
export function progressRate(natural: number[], totalSteps: number): number {
  if (!totalSteps || totalSteps <= 0) return 0
  return Math.min(100, Math.round((natural.length / totalSteps) * 100))
}

// 배열에 값이 없을 때만 추가 (중복 방지)
export function pushUnique(arr: number[], value: number): number[] {
  return arr.includes(value) ? arr : [...arr, value]
}
