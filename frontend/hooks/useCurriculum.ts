'use client'

import { useMemo } from 'react'
import curriculumData from '@/data/curriculum.json'

interface UnitData {
  unit: number
  title?: string
  words: string
  objectives: string
  sentence_patterns?: string
  grammar?: string
}

const data = curriculumData as {
  level_order: string[]
  curriculum: Record<string, Record<string, Record<string, UnitData>>>
}

export function useCurriculum() {
  const { level_order, curriculum } = data

  // 전체 book 목록 (레벨 순서대로)
  const allBooks = useMemo(() => {
    const books: { level: string; book: string }[] = []
    for (const level of level_order) {
      if (!curriculum[level]) continue
      for (const book of Object.keys(curriculum[level])) {
        books.push({ level, book })
      }
    }
    return books
  }, [])

  // 특정 book의 unit 목록
  const getUnits = (book: string): UnitData[] => {
    for (const level of Object.values(curriculum)) {
      if (level[book]) {
        return Object.values(level[book]).sort((a, b) => a.unit - b.unit)
      }
    }
    return []
  }

  // 특정 unit 데이터
  const getUnitData = (book: string, unit: number): UnitData | null => {
    for (const level of Object.values(curriculum)) {
      if (level[book]?.[String(unit)]) {
        return level[book][String(unit)]
      }
    }
    return null
  }

  // level별 book 그룹
  const booksByLevel = useMemo(() => {
    const result: Record<string, string[]> = {}
    for (const level of level_order) {
      if (curriculum[level]) {
        result[level] = Object.keys(curriculum[level])
      }
    }
    return result
  }, [])

  return { allBooks, booksByLevel, level_order, getUnits, getUnitData }
}
