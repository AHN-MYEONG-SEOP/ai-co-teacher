import { NextResponse } from 'next/server'
import curriculumData from '@/data/curriculum.json'

export const dynamic = 'force-dynamic'

export interface UnitData {
  unit: number
  title?: string
  words: string
  objectives: string
  sentence_patterns?: string
  grammar?: string
}

export interface CurriculumData {
  level_order: string[]
  curriculum: Record<string, Record<string, Record<string, UnitData>>>
}

const data = curriculumData as CurriculumData

// 다음 Book/Unit 계산
export function getNextUnit(currentBook: string, currentUnit: number): {
  book: string
  unit: number
  isNewBook: boolean
} | null {
  const { level_order, curriculum } = data

  // 현재 book이 속한 level 찾기
  for (const level of level_order) {
    const books = curriculum[level]
    if (!books) continue

    const bookNames = Object.keys(books)
    const bookIndex = bookNames.findIndex(b => b === currentBook)
    if (bookIndex === -1) continue

    const currentBookData = books[currentBook]
    const units = Object.keys(currentBookData).map(Number).sort((a, b) => a - b)
    const unitIndex = units.indexOf(currentUnit)

    if (unitIndex < units.length - 1) {
      // 같은 book의 다음 unit
      return { book: currentBook, unit: units[unitIndex + 1], isNewBook: false }
    } else if (bookIndex < bookNames.length - 1) {
      // 다음 book의 첫 unit
      const nextBook = bookNames[bookIndex + 1]
      const nextUnits = Object.keys(books[nextBook]).map(Number).sort((a, b) => a - b)
      return { book: nextBook, unit: nextUnits[0], isNewBook: true }
    } else {
      // 다음 level 찾기
      const levelIndex = level_order.indexOf(level)
      if (levelIndex < level_order.length - 1) {
        const nextLevel = level_order[levelIndex + 1]
        const nextBooks = curriculum[nextLevel]
        if (nextBooks) {
          const nextBookNames = Object.keys(nextBooks)
          const nextBook = nextBookNames[0]
          const nextUnits = Object.keys(nextBooks[nextBook]).map(Number).sort((a, b) => a - b)
          return { book: nextBook, unit: nextUnits[0], isNewBook: true }
        }
      }
      return null  // 마지막 단계
    }
  }
  return null
}

// 특정 unit 데이터 조회
export function getUnitData(book: string, unit: number): UnitData | null {
  const { curriculum } = data
  for (const level of Object.values(curriculum)) {
    if (level[book] && level[book][String(unit)]) {
      return level[book][String(unit)]
    }
  }
  return null
}

export function GET() {
  return NextResponse.json(data)
}
